import importlib.util
import io
from pathlib import Path
import unittest
import zipfile
import tempfile
import warnings

spec = importlib.util.spec_from_file_location('migration', Path(__file__).with_name('consolidate_resources.py'))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class MigrationTests(unittest.TestCase):
    def archive(self, entries):
        stream = io.BytesIO()
        with warnings.catch_warnings(), zipfile.ZipFile(stream, 'w') as archive:
            warnings.simplefilter('ignore', UserWarning)
            for name, content in entries:
                archive.writestr(name, content)
        return stream.getvalue()

    def test_rejects_traversal_and_executable_archive_members(self):
        for name in ['../escape.md', '/escape.md', 'skill/../escape.md', 'skill\\escape.md', 'skill/run.py', 'C:/escape.md', 'skill//SKILL.md']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                migration.archive_members(self.archive([(name, 'text')]))

    def test_preserves_archive_documents_and_detects_duplicate_names(self):
        blob = self.archive([('skill/SKILL.md', '# Example'), ('skill/manifest.json', '{}')])
        self.assertEqual(migration.archive_members(blob)['skill/SKILL.md'], b'# Example')
        with self.assertRaises(ValueError):
            migration.archive_members(self.archive([('skill/SKILL.md', 'one'), ('skill/SKILL.md', 'two')]))

    def test_secrets_and_shebangs_are_not_copied(self):
        for value in [b'#!/bin/sh\necho hello', b'-----BEGIN PRIVATE KEY-----', b'ghp_' + b'x' * 36,
                      b'API_TOKEN = "' + b'Ab9' * 13 + b'"', b'"apiKey": "' + b'abc123' * 6 + b'"']:
            self.assertTrue(migration.content_blocker(value))
        self.assertIsNone(migration.content_blocker(b'API_KEY=your_api_key_here'))

    def test_sql_is_parsed_as_data_and_unknown_expressions_are_rejected(self):
        records = migration.sql_records("INSERT INTO resources(slug,title,tags) VALUES ('it''s','Title',ARRAY['a','b']);")
        self.assertEqual(records[0]['values'], {'slug': "it's", 'title': 'Title', 'tags': ['a', 'b']})
        with self.assertRaises(ValueError):
            migration.sql_records("INSERT INTO resources(slug) VALUES (current_setting('secret'));")

    def test_sql_ddl_is_never_exported_or_executed(self):
        self.assertEqual(migration.sql_records('DROP TABLE resources; SELECT 1;'), [])

    def test_decoded_catalog_strings_are_checked_before_json_escaping(self):
        with self.assertRaises(ValueError):
            migration.check_data({'prompt': 'API_TOKEN = "' + 'Ab9' * 13 + '"'})

    def test_unsafe_catalog_field_is_excluded_without_losing_metadata(self):
        row = migration.sanitize_record({'table': 'resources', 'row': 1,
            'values': {'slug': 'example', 'prompt_content': 'API_TOKEN = "' + 'Ab9' * 13 + '"'}})
        self.assertEqual(row['values']['slug'], 'example')
        self.assertIsNone(row['values']['prompt_content'])
        self.assertEqual(row['redactions'][0]['reason'], 'possible_secret_excluded')

    def test_versioned_downloads_are_retained_and_tampering_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            blob = b'previous reviewed package'
            hash_value = migration.digest(blob)
            name = f'resources/migrated/custom-skills/archives/{hash_value}/example.zip'
            path = root / name
            path.parent.mkdir(parents=True)
            path.write_bytes(blob)
            previous = {'artifacts': [{'path': name, 'sha256': hash_value}]}
            outputs = {}
            migration.retain_versioned_archives(previous, outputs, root)
            self.assertEqual(outputs[name], blob)
            path.write_bytes(b'changed')
            with self.assertRaises(ValueError):
                migration.retain_versioned_archives(previous, {}, root)

    def test_license_is_not_inferred_for_missing_or_restricted_packages(self):
        self.assertEqual(migration.declared_license(b'---\nlicense: MIT\n---\nbody'), 'MIT')
        self.assertIsNone(migration.declared_license(b'# Skill without license'))
        self.assertIsNone(migration.declared_license(b'---\nlicense: Proprietary\n---\nbody'))

    def test_snapshot_inventory_preserves_bytes_without_extracting_runtime(self):
        blob = self.archive([('open-connect-main/.env', 'private configuration'),
                             ('open-connect-main/.skills/demo/SKILL.md', '# Demo')])
        files = migration.snapshot_members(blob)
        self.assertEqual(files['.env'][1], b'private configuration')
        self.assertEqual(files['.skills/demo/SKILL.md'][1], b'# Demo')

    def test_snapshot_rejects_unsafe_and_ambiguous_paths(self):
        for path in ['../escape', 'open-connect-main/../escape', 'other/file.md',
                     'open-connect-main/a//b.md', 'open-connect-main/C:/x']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                migration.snapshot_members(self.archive([(path, 'text')]))
        with self.assertRaises(ValueError):
            migration.snapshot_members(self.archive([('open-connect-main/a.md', 'one'),
                                                     ('open-connect-main/a.md', 'two')]))

    def test_explicit_mit_does_not_override_a_restricted_local_license(self):
        files = {'demo/SKILL.md': ('100644', b'---\nlicense: MIT\n---\nbody'),
                 'demo/LICENSE.txt': ('100644', b'All rights reserved. Do not distribute.')}
        self.assertEqual(migration.mit_package_roots(files), set())
        files.pop('demo/LICENSE.txt')
        self.assertEqual(migration.mit_package_roots(files), {'demo'})

    def test_pdf_review_rejects_javascript_and_accepts_document_pages(self):
        from pypdf import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        stream = io.BytesIO()
        writer.write(stream)
        self.assertEqual(migration.review_pdf(stream.getvalue()), 1)
        writer.add_js('app.alert("not allowed")')
        stream = io.BytesIO()
        writer.write(stream)
        with self.assertRaises(ValueError):
            migration.review_pdf(stream.getvalue())


if __name__ == '__main__':
    unittest.main()
