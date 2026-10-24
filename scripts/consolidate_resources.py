#!/usr/bin/env python3
"""Deterministic, offline resource consolidation. Never executes source SQL/code."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
LOCK = 'config/resource-migration.lock.json'
PREFIX = 'resources/migrated'
TEXT_SUFFIXES = {'.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.jsonc', '.example'}
EXECUTABLE_SUFFIXES = {'.py', '.pyc', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.sh', '.bash', '.exe', '.so'}
SECRET = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|(?:sk_live_|sk-proj-)[A-Za-z0-9_-]{20,}')
TOKEN_ASSIGNMENT = re.compile(rb'''(?:api[_-]?(?:token|key)|access[_-]?token|secret(?:[_-]?key)?|password)["']?\s*[:=]\s*["']([A-Za-z0-9_+/=-]{24,})["']''', re.I)


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def content_blocker(blob):
    if blob.startswith(b'#!'):
        return 'executable_shebang'
    if SECRET.search(blob):
        return 'possible_secret'
    for match in TOKEN_ASSIGNMENT.finditer(blob):
        value = match[1]
        if not re.search(rb'YOUR_|PLACEHOLDER|EXAMPLE|REPLACE_|INSERT_', value, re.I):
            return 'possible_secret'
    return None


def declared_license(blob):
    match = re.match(rb'---\r?\n([\s\S]*?)\r?\n---', blob)
    if not match:
        return None
    return 'MIT' if re.search(rb'^license:\s*[\'"]?MIT[\'"]?\s*$', match[1], re.M) else None


def archive_members(blob):
    files = {}
    total = 0
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        for item in archive.infolist():
            path = PurePosixPath(item.filename)
            if (path.is_absolute() or '..' in path.parts or '\\' in item.filename
                    or ':' in item.filename
                    or (not item.is_dir() and str(path) != item.filename)
                    or stat.S_ISLNK(item.external_attr >> 16)):
                raise ValueError('Unsafe ZIP path or symlink')
            if item.is_dir():
                continue
            if item.filename in files:
                raise ValueError('Duplicate ZIP member')
            total += item.file_size
            if item.file_size > 2_000_000 or total > 20_000_000:
                raise ValueError('ZIP expansion limit exceeded')
            if path.suffix.lower() not in TEXT_SUFFIXES:
                raise ValueError('Unsupported or executable ZIP member')
            content = archive.read(item)
            content.decode('utf-8')
            if content_blocker(content):
                raise ValueError('Unsafe ZIP document content')
            files[item.filename] = content
    return files


def review_pdf(blob):
    from pypdf import PdfReader
    from pypdf.generic import IndirectObject
    # Google Docs exports may repeat named destinations. Parse the object graph
    # rather than matching compressed bytes, which can contain accidental /JS.
    reader = PdfReader(io.BytesIO(blob), strict=False)
    if reader.is_encrypted:
        raise ValueError('Encrypted PDF needs review')
    seen = set()

    pending = [reader.trailer]
    while pending:
        value = pending.pop()
        if isinstance(value, IndirectObject):
            identity = (value.idnum, value.generation)
            if identity in seen:
                continue
            seen.add(identity)
            pending.append(value.get_object())
        elif isinstance(value, dict):
            if set(value) & {'/JS', '/JavaScript', '/Launch', '/EmbeddedFiles', '/EmbeddedFile', '/AA', '/OpenAction', '/RichMedia', '/XFA', '/EF'}:
                raise ValueError('PDF active content needs review')
            if value.get('/S') in ['/JavaScript', '/Launch', '/GoToR', '/GoToE', '/SubmitForm', '/ImportData', '/Rendition', '/Movie', '/Sound']:
                raise ValueError('PDF active action needs review')
            pending.extend(value.values())
        elif isinstance(value, (list, tuple)):
            pending.extend(value)

    for page in reader.pages:
        if content_blocker((page.extract_text() or '').encode()):
            raise ValueError('PDF text contains possible secret')
    return len(reader.pages)


def sql_value(node):
    if 'A_Const' in node:
        value = node['A_Const']
        if value.get('isnull'):
            return None
        for kind, key in [('sval', 'sval'), ('ival', 'ival'), ('fval', 'fval'), ('boolval', 'boolval')]:
            if kind in value:
                return value[kind].get(key, False if kind == 'boolval' else 0)
    if 'A_ArrayExpr' in node:
        return [sql_value(item) for item in node['A_ArrayExpr'].get('elements', [])]
    if 'TypeCast' in node:
        return sql_value(node['TypeCast']['arg'])
    raise ValueError('Unsupported SQL expression; source SQL must never be executed')


def sql_records(text):
    from pglast.parser import parse_sql_json
    records = []
    for statement in json.loads(parse_sql_json(text))['stmts']:
        insert = statement['stmt'].get('InsertStmt')
        if not insert:
            continue
        table = insert['relation']['relname']
        columns = [column['ResTarget']['name'] for column in insert.get('cols', [])]
        select = insert.get('selectStmt', {}).get('SelectStmt', {})
        if 'valuesLists' not in select:
            raise ValueError('Unsupported INSERT source')
        for index, row in enumerate(select['valuesLists']):
            values = [sql_value(item) for item in row['List']['items']]
            if len(columns) != len(values):
                raise ValueError('SQL column/value mismatch')
            records.append({'table': table, 'row': index, 'values': dict(zip(columns, values))})
    return records


def check_data(value):
    if isinstance(value, str) and content_blocker(value.encode()):
        raise ValueError('Data contains possible secret')
    if isinstance(value, dict):
        for child in value.values():
            check_data(child)
    elif isinstance(value, list):
        for child in value:
            check_data(child)


def sanitize_record(row):
    redactions = []
    for field, value in row['values'].items():
        try:
            check_data(value)
        except ValueError:
            redactions.append({'field': field, 'source_sha256': digest(json.dumps(value).encode()),
                               'reason': 'possible_secret_excluded'})
    for redaction in redactions:
        row['values'][redaction['field']] = None
    if redactions:
        row['redactions'] = redactions
    return row


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])


def source_files(root, commit, inventory_gitlinks=False):
    entries = git(root, 'ls-tree', '-rz', '--full-tree', commit).split(b'\0')
    result = {}
    for entry in entries:
        if not entry:
            continue
        header, name = entry.split(b'\t', 1)
        mode, kind, oid = header.decode().split()
        if kind == 'commit' and mode == '160000' and inventory_gitlinks:
            result[name.decode()] = (mode, oid.encode())
            continue
        if kind != 'blob':
            raise ValueError('Submodules need explicit migration review')
        path = name.decode()
        result[path] = (mode, git(root, 'cat-file', 'blob', oid.decode() if isinstance(oid, bytes) else oid))
    return result


def snapshot_members(blob):
    """Inventory a legacy snapshot in memory; never extract or run its contents."""
    result, total = {}, 0
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        if len(archive.infolist()) > 5000:
            raise ValueError('Snapshot member limit exceeded')
        for item in archive.infolist():
            raw = item.filename.rstrip('/') if item.is_dir() else item.filename
            path = PurePosixPath(raw)
            if (path.is_absolute() or '..' in path.parts or '\\' in raw or ':' in raw
                    or str(path) != raw or not raw.startswith('open-connect-main/')
                    and raw != 'open-connect-main'
                    or stat.S_ISLNK(item.external_attr >> 16)):
                raise ValueError('Unsafe snapshot member')
            if item.is_dir():
                continue
            name = raw.removeprefix('open-connect-main/')
            total += item.file_size
            if name in result or item.file_size > 32_000_000 or total > 64_000_000:
                raise ValueError('Duplicate or oversized snapshot member')
            result[name] = ('100644', archive.read(item))
    return result


def mit_package_roots(files):
    roots = set()
    for path, (_, content) in files.items():
        if not path.endswith('/SKILL.md') or not declared_license(content):
            continue
        root = str(PurePosixPath(path).parent)
        licenses = [blob for name, (_, blob) in files.items()
                    if str(PurePosixPath(name).parent) == root
                    and PurePosixPath(name).name.lower() in {'license', 'license.md', 'license.txt'}]
        # An explicit frontmatter declaration cannot override conflicting terms.
        if all(b'Permission is hereby granted, free of charge' in blob
               and b'MIT' in blob for blob in licenses):
            roots.add(root)
    return roots


def canonical_index():
    index = {}
    for raw in git(ROOT, 'ls-files', '-z').split(b'\0'):
        if not raw:
            continue
        name = raw.decode()
        if name.startswith(PREFIX + '/') or name == LOCK:
            continue
        path = ROOT / name
        if path.is_file() and not path.is_symlink():
            index.setdefault(digest(path.read_bytes()), []).append(name)
    return index


def retain_versioned_archives(previous, outputs, root=ROOT):
    for artifact in previous['artifacts']:
        name = artifact['path']
        versioned = re.fullmatch(r'resources/migrated/custom-skills/archives/([a-f0-9]{64})/[a-z0-9-]+\.(zip|pdf)', name)
        if versioned and name not in outputs:
            path = root / name
            if path.is_symlink() or not path.resolve().is_relative_to((root / PREFIX).resolve()):
                raise ValueError('Unsafe retained archive path')
            content = path.read_bytes()
            if digest(content) != versioned[1] or digest(content) != artifact['sha256']:
                raise ValueError('Retained archive hash mismatch')
            outputs[name] = content


def generate(v1, custom, catalog, manus=None, snapshot=None):
    config = json.loads((ROOT / 'config/resource-migration.sources.json').read_text())
    current = json.loads(catalog.read_text())
    current = current if isinstance(current, list) else current['resources']
    by_slug = {row['slug']: row for row in current}
    existing = canonical_index()
    outputs, entries, candidates, sources, sql_exports = {}, [], [], [], []
    for source in config['sources']:
        local = {'v1-open-connect': v1, 'open-custom-skills': custom,
                 'open-custom-skills-extra-skills': custom, 'manus-skills': manus,
                 'manuskills': snapshot}[source['id']]
        if local is None:
            raise ValueError('Missing pinned source clone: ' + source['id'])
        commit = source['commit']
        if git(local, 'rev-parse', '--verify', source.get('ref', 'HEAD')).decode().strip() != commit:
            raise ValueError('Source HEAD does not match pinned commit')
        files = source_files(local, commit, inventory_gitlinks=source['id'] == 'manus-skills')
        sources.append({**source, 'tracked_files': len(files), 'deletion_ready': False})
        if source['id'] == 'manuskills':
            comparison = source_files(v1, config['sources'][0]['commit'])
            known = {digest(blob): path for path, blob in outputs.items()}
            for path, (_, blob) in sorted(files.items()):
                record = {'source': source['id'], 'path': path, 'sha256': digest(blob),
                          'size': len(blob), 'decision': 'snapshot_repository_metadata_only'}
                entries.append(record)
                if path != 'open-connect-main.zip':
                    continue
                members = snapshot_members(blob)
                sources[-1]['snapshot_members_inventoried'] = len(members)
                record['decision'] = 'snapshot_compared_never_published'
                for name, (_, content) in sorted(members.items()):
                    identical = comparison.get(name, (None, None))[1] == content
                    member = {'source': source['id'], 'path': path + '!/' + name,
                              'sha256': digest(content), 'size': len(content),
                              'decision': 'identical_to_pinned_v1' if identical else 'snapshot_configuration_not_ported'}
                    if PurePosixPath(name).name.startswith('.env'):
                        member['decision'] = 'environment_configuration_excluded'
                    elif content_blocker(content) == 'possible_secret':
                        member['decision'] = 'possible_secret_excluded'
                    if identical:
                        member['comparison_source_path'] = name
                    if digest(content) in known:
                        member['existing_identical_paths'] = [known[digest(content)]]
                    entries.append(member)
            continue
        if source.get('comparison_base'):
            base = source_files(local, source['comparison_base'])
            files = {path: value for path, value in files.items() if base.get(path) != value}
            sources[-1]['changed_files_inventoried'] = len(files)
        licensed = set()
        blocked_packages = set()
        manus_roots = mit_package_roots(files) if source['id'] == 'manus-skills' else set()
        blocked_manus = {root for root in manus_roots if any(
            path.startswith(root + '/') and content_blocker(blob) == 'possible_secret'
            for path, (_, blob) in files.items())}
        if source['id'] == 'v1-open-connect':
            for path, (_, content) in files.items():
                if re.fullmatch(r'\.skills/[^/]+/SKILL\.md', path) and declared_license(content):
                    licensed.add(path.split('/')[1])
                if path.startswith('.skills/') and Path(path).suffix.lower() in TEXT_SUFFIXES and content_blocker(content) == 'possible_secret':
                    blocked_packages.add(path.split('/')[1])
        for path, (mode, blob) in sorted(files.items()):
            record = {'source': source['id'], 'path': path, 'sha256': digest(blob), 'size': len(blob),
                      'existing_identical_paths': existing.get(digest(blob), [])}
            reason, destination = 'legacy_application_or_configuration_not_ported', None
            if mode == '120000':
                reason = 'symlink_excluded'
            elif mode == '160000':
                reason = 'submodule_pointer_not_fetched_or_executed'
                record['gitlink_commit'] = blob.decode()
            elif source['id'] == 'manus-skills':
                package = next((root for root in sorted(manus_roots)
                                if path.startswith(root + '/')), None)
                if package in blocked_manus:
                    reason = 'package_possible_secret_excluded'
                elif package is None:
                    reason = 'license_or_entrypoint_review_required'
                elif Path(path).suffix.lower() not in TEXT_SUFFIXES or content_blocker(blob):
                    reason = content_blocker(blob) or 'runtime_or_binary_support_excluded'
                else:
                    destination = f'{PREFIX}/manus-skills/' + path
                    reason = 'migrated_mit_document'
                    if path.endswith('/SKILL.md'):
                        slug = 'manus-' + PurePosixPath(package).name
                        candidates.append({'slug': slug, 'source': source['id'], 'source_package': package,
                            'resource_type': 'skill', 'content_path': destination, 'content_hash': digest(blob),
                            'license': 'MIT', 'decision': 'new_review_candidate',
                            'published': False, 'verified': False, 'executable': False})
            elif source['id'] == 'v1-open-connect' and path.startswith('.skills/'):
                parts = path.split('/')
                if parts[1] in blocked_packages:
                    reason = 'package_possible_secret_excluded'
                elif parts[1] not in licensed:
                    reason = 'license_or_entrypoint_review_required'
                elif Path(path).suffix.lower() not in TEXT_SUFFIXES or content_blocker(blob):
                    reason = content_blocker(blob) or 'runtime_or_binary_support_excluded'
                else:
                    destination = f'{PREFIX}/v1-skills/' + '/'.join(parts[1:])
                    reason = 'migrated_mit_document'
                    if path.endswith('/SKILL.md'):
                        slug = parts[1]
                        match = by_slug.get(slug)
                        candidates.append({'slug': 'v1-' + slug, 'legacy_slug': slug, 'resource_type': 'skill',
                            'content_path': destination, 'content_hash': digest(blob), 'license': 'MIT',
                            'existing_slug_match': match['slug'] if match else None,
                            'decision': 'same_slug_review_required' if match else 'new_review_candidate',
                            'published': False, 'verified': False, 'executable': False})
            elif source['id'] == 'v1-open-connect' and path.startswith('supabase/migrations/'):
                data = sql_records(blob.decode())
                for row in data:
                    sanitize_record(row)
                    row.update({'source_path': path, 'source_sha256': digest(blob)})
                    sql_exports.append(row)
                reason = 'sql_parsed_as_data' if data else 'schema_not_executed'
                record['exported_rows'] = len(data)
            elif source['id'] == 'open-custom-skills-extra-skills' and path.startswith('skills/'):
                if Path(path).suffix.lower() not in TEXT_SUFFIXES or content_blocker(blob):
                    reason = content_blocker(blob) or 'runtime_or_binary_support_excluded'
                else:
                    if not config['private_source_public_copy_authorized']:
                        raise ValueError('Public-copy authorization required')
                    destination = f'{PREFIX}/custom-skills/branch-skills/' + path.removeprefix('skills/')
                    reason = 'migrated_reviewed_first_party_document'
                    if path.endswith('/SKILL.md'):
                        slug = path.split('/')[1]
                        candidates.append({'slug': slug, 'resource_type': 'skill', 'content_path': destination,
                            'content_hash': digest(blob), 'license': declared_license(blob) or 'unspecified',
                            'existing_slug_match': slug if slug in by_slug else None,
                            'decision': 'new_review_candidate', 'published': False, 'verified': False, 'executable': False})
            elif source['id'] == 'open-custom-skills' and path.endswith('.zip'):
                if not config['private_source_public_copy_authorized']:
                    raise ValueError('Public-copy authorization required')
                members = archive_members(blob)
                slug = Path(path).stem
                destination = f'{PREFIX}/custom-skills/archives/{digest(blob)}/{path}'
                reason = 'migrated_reviewed_document_archive'
                record['members'] = []
                for name, content in sorted(members.items()):
                    target = f'{PREFIX}/custom-skills/packages/{name}'
                    outputs[target] = content
                    record['members'].append({'path': name, 'sha256': digest(content), 'destination': target})
                manifest_path = f'{slug}/manifest.json'
                manifest = json.loads(members[manifest_path])
                dependencies = manifest.get('required_skills', [])
                candidates.append({'slug': slug, 'resource_type': 'skill', 'archive_path': destination,
                    'content_hash': digest(blob), 'required_skills': dependencies,
                    'existing_slug_match': slug if slug in by_slug else None,
                    'decision': 'canonical_package_available', 'license': 'unspecified',
                    'published': False, 'verified': False, 'executable': False})
            elif source['id'] == 'open-custom-skills' and path.endswith('.pdf'):
                if not config['private_source_public_copy_authorized']:
                    raise ValueError('Public-copy authorization required')
                record['pdf_pages'] = review_pdf(blob)
                destination = f'{PREFIX}/custom-skills/archives/{digest(blob)}/complete-prompts-library.pdf'
                reason = 'migrated_prompt_reference_pdf'
                candidates.append({'slug': 'complete-prompts-library', 'resource_type': 'prompt',
                    'archive_path': destination, 'content_hash': digest(blob), 'license': 'unspecified',
                    'existing_slug_match': 'complete-prompts-library' if 'complete-prompts-library' in by_slug else None,
                    'decision': 'canonical_package_available', 'published': False, 'verified': False, 'executable': False})
            if destination:
                if content_blocker(blob) and not path.endswith(('.zip', '.pdf')):
                    raise ValueError('Source contains possible secret')
                outputs[destination] = blob
                record['destination'] = destination
            record['decision'] = reason
            entries.append(record)
    for row in sql_exports:
        row['existing_slug_match'] = row['values'].get('slug') if row['values'].get('slug') in by_slug else None
    sql_path = f'{PREFIX}/v1-catalog.json'
    sql_blob = (json.dumps({'mode': 'review_only_never_execute_sql', 'records': sql_exports}, indent=2, ensure_ascii=False) + '\n').encode()
    if content_blocker(sql_blob):
        raise ValueError('Catalog export contains possible secret')
    outputs[sql_path] = sql_blob
    # Content-addressed downloads are append-only so older deployments and
    # rollbacks never lose a package or receive bytes from a newer revision.
    if (ROOT / LOCK).is_file():
        previous = json.loads((ROOT / LOCK).read_text())
        retain_versioned_archives(previous, outputs)
    custom_slugs = {item['slug'] for item in candidates if 'archive_path' in item}
    for item in candidates:
        item['readiness'] = 'review_only_not_installable'
        if 'content_path' in item:
            is_v1 = item['content_path'].startswith(f'{PREFIX}/v1-skills/')
            source_id = item.get('source', 'v1-open-connect' if is_v1 else 'open-custom-skills-extra-skills')
            source_prefix = (item['source_package'] + '/' if 'source_package' in item else
                             ('.skills/' if is_v1 else 'skills/') + item.get('legacy_slug', item['slug']) + '/')
            item['excluded_support'] = [
                {'path': entry['path'], 'reason': entry['decision']}
                for entry in entries if entry['source'] == source_id and entry['path'].startswith(source_prefix)
                and 'destination' not in entry
            ]
        missing = sorted(set(item.get('required_skills', [])) - custom_slugs)
        if missing:
            raise ValueError('Missing custom skill dependencies: ' + ', '.join(missing))
    report = {'schema_version': 1, 'canonical_repository': config['canonical_repository'],
        'sources': sources, 'entries': entries, 'candidates': candidates,
        'sql_export': {'path': sql_path, 'rows': len(sql_exports),
            'unique_table_slugs': len({(r['table'], r['values'].get('slug')) for r in sql_exports}),
            'excluded_possible_secret_fields': sum(len(row.get('redactions', [])) for row in sql_exports)},
        'artifacts': [{'path': path, 'sha256': digest(blob), 'size': len(blob)} for path, blob in sorted(outputs.items())],
        'deletion_ready': False,
        'deletion_blockers': ['source histories, branches, releases, issues, wikis and deployment dependencies not migrated',
            'excluded licensed/runtime content requires explicit disposition',
            'resource candidates remain unpublished and unverified; catalog matches do not prove runtime equivalence']}
    downloads = {item['slug']: {'path': item['archive_path'], 'sha256': item['content_hash']}
                 for item in candidates if 'archive_path' in item}
    outputs['config/resource-migration.downloads.json'] = (json.dumps(downloads, indent=2) + '\n').encode()
    outputs[LOCK] = (json.dumps(report, indent=2, ensure_ascii=False) + '\n').encode()
    return outputs


def verify():
    report = json.loads((ROOT / LOCK).read_text())
    config = json.loads((ROOT / 'config/resource-migration.sources.json').read_text())
    if report['canonical_repository'] != config['canonical_repository']:
        raise ValueError('Canonical repository changed')
    for configured, recorded in zip(config['sources'], report['sources'], strict=True):
        if any(recorded[key] != value for key, value in configured.items()):
            raise ValueError('Source pin differs from generated report')
    seen = set()
    for artifact in report['artifacts']:
        path = PurePosixPath(artifact['path'])
        if path.is_absolute() or '..' in path.parts or not str(path).startswith(PREFIX + '/') or str(path) in seen:
            raise ValueError('Unsafe or duplicate artifact path')
        seen.add(str(path))
        actual = ROOT / str(path)
        if actual.is_symlink() or not actual.is_file() or digest(actual.read_bytes()) != artifact['sha256']:
            raise ValueError('Artifact missing or changed: ' + str(path))
    actual_paths = {str(path.relative_to(ROOT)) for path in (ROOT / PREFIX).rglob('*') if path.is_file() or path.is_symlink()}
    if actual_paths != seen:
        raise ValueError('Untracked or missing migrated artifacts')
    for entry in report['entries']:
        if entry.get('destination') and entry['destination'] not in seen:
            raise ValueError('Untracked destination')
        if 'destination' in entry and digest((ROOT / entry['destination']).read_bytes()) != entry['sha256']:
            raise ValueError('Source/destination content mismatch')
        for member in entry.get('members', []):
            if member['destination'] not in seen:
                raise ValueError('Untracked archive member')
            if digest((ROOT / member['destination']).read_bytes()) != member['sha256']:
                raise ValueError('Archive member mismatch')
    downloads = json.loads((ROOT / 'config/resource-migration.downloads.json').read_text())
    expected = {item['slug']: {'path': item['archive_path'], 'sha256': item['content_hash']}
                for item in report['candidates'] if 'archive_path' in item}
    if downloads != expected:
        raise ValueError('Download registry differs from migration lock')
    print(json.dumps({'sources': len(report['sources']), 'inventoried_files': len(report['entries']),
        'artifacts_verified': len(seen), 'resource_candidates': len(report['candidates']),
        'sql_rows': report['sql_export']['rows'], 'deletion_ready': report['deletion_ready']}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--v1', type=Path)
    parser.add_argument('--custom', type=Path)
    parser.add_argument('--catalog', type=Path)
    parser.add_argument('--manus', type=Path)
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    if args.write:
        if not all([args.v1, args.custom, args.catalog]):
            parser.error('--write requires --v1, --custom, --catalog')
        outputs = generate(args.v1, args.custom, args.catalog, args.manus, args.snapshot)
        # Prune only unchanged artifacts owned by the previous generated lock.
        # This removes newly quarantined packages without deleting user edits.
        if (ROOT / LOCK).is_file():
            previous = json.loads((ROOT / LOCK).read_text())
            for artifact in previous['artifacts']:
                name = artifact['path']
                path = ROOT / name
                if name not in outputs:
                    if (not name.startswith(PREFIX + '/') or '..' in PurePosixPath(name).parts
                            or path.is_symlink() or not path.resolve().is_relative_to((ROOT / PREFIX).resolve())
                            or digest(path.read_bytes()) != artifact['sha256']):
                        raise ValueError('Refusing to prune changed or unsafe artifact')
                    path.unlink()
        for name, blob in outputs.items():
            path = ROOT / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(blob)
    verify()


if __name__ == '__main__':
    main()
