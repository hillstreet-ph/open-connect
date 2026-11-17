#!/usr/bin/env python3
"""Retention janitor for Supabase Storage backup sets.

Safety rules:
  - refuses to delete unless a verified, fresh, complete off-platform DB export
    manifest exists in R2 (see migration_gate)
  - dry-run by default; --apply required for changes
  - deletes metadata rows only through Supabase's supported lifecycle path
  - never touches credentials, invoices, or non-backup buckets
"""
import argparse, datetime as dt, hashlib, hmac, json, os, re, sys, urllib.error, urllib.request, urllib.parse
import xml.etree.ElementTree as ET

PAT = os.environ.get("SUPABASE_PAT", "")
REF = os.environ.get("SUPABASE_PROJECT_REF", "huadtiuuoiriqrjpjxhr")
BUCKET = os.environ.get("BACKUP_BUCKET", "open-system-backups")
AK = os.environ.get("R2_ACCESS_KEY_ID", "")
SK = os.environ.get("R2_SECRET_ACCESS_KEY", "")
EP = os.environ.get("R2_S3_ENDPOINT", "").rstrip("/")
R2BUCKET = os.environ.get("R2_BUCKET", "supabase-backups")

# Safety: only an explicitly named backup bucket may ever be read or deleted in.
SENSITIVE_BUCKETS = ("credential", "invoice")

# Migration-gate policy knobs.
MANIFEST_PATH = "/db-export/manifest.json"
MIN_MANIFEST_ENTRIES = 100
GATE_OBJECT_CAP = 200          # bound HEAD calls / runtime
FRESHNESS_DAYS = 7
FUTURE_SKEW = dt.timedelta(hours=1)  # tolerate small clock skew into the future

# Field names we accept as a manifest timestamp, in priority order.
_TIMESTAMP_FIELDS = (
    "generated_at", "updated_at", "exported_at", "created_at",
    "last_modified", "last_modified_at", "modified", "updated",
    "generated", "timestamp", "date",
)
_LIST_KEYS = ("tables", "objects", "files", "entries", "data", "manifest")


def _require_backup_bucket():
    """Refuse any bucket that is not clearly a backup bucket."""
    bucket = str(BUCKET).lower()
    if "backup" not in bucket or any(s in bucket for s in SENSITIVE_BUCKETS):
        raise ValueError("refusing to operate on a non-backup bucket")


def supabase_sql(query, write=False):
    ep = "query" if write else "query/read-only"
    body = json.dumps({"query": query}).encode()
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/{ep}",
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "backup-janitor"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def s3_headers(method, path, payload=b""):
    now = dt.datetime.now(dt.timezone.utc)
    amz, ts = now.strftime("%Y%m%d"), now.strftime("%Y%m%dT%H%M%SZ")
    scope = f"{amz}/auto/s3/aws4_request"
    h = hashlib.sha256(payload).hexdigest()
    host = EP.replace("https://", "")
    canon = f"{method}\n/{R2BUCKET}{path}\n\nhost:{host}\nx-amz-content-sha256:{h}\nx-amz-date:{ts}\n\nhost;x-amz-content-sha256;x-amz-date\n{h}"
    s2 = f"AWS4-HMAC-SHA256\n{ts}\n{scope}\n{hashlib.sha256(canon.encode()).hexdigest()}"

    def hm(k, m):
        return hmac.new(k, m.encode() if isinstance(m, str) else m, hashlib.sha256).digest()

    k = hm(("AWS4" + SK).encode(), amz)
    for part in ("auto", "s3", "aws4_request"):
        k = hm(k, part)
    return {
        "Authorization": f"AWS4-HMAC-SHA256 Credential={AK}/{scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature={hm(k, s2).hex()}",
        "x-amz-date": ts,
        "x-amz-content-sha256": h,
    }


class _UrllibHTTP:
    """Default HTTP transport; tests inject a fake with the same .urlopen()."""

    def urlopen(self, req, timeout=30):
        return urllib.request.urlopen(req, timeout=timeout)


_DEFAULT_HTTP = _UrllibHTTP()


# --------------------------------------------------------------------------- #
# Migration gate helpers (all pure / offline; no module-level network calls).
# --------------------------------------------------------------------------- #
def _parse_timestamp(value):
    """Parse an ISO-8601 string/epoch number or an HTTP-date into aware UTC."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            return dt.datetime.fromtimestamp(value, tz=dt.timezone.utc)
        except (ValueError, OverflowError, OSError):
            return None
    if not isinstance(value, str) or not value.strip():
        return None
    s = value.strip()
    try:
        iso = s[:-1] + "+00:00" if s.endswith(("Z", "z")) else s
        d = dt.datetime.fromisoformat(iso)
        return (d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)).astimezone(dt.timezone.utc)
    except ValueError:
        pass
    try:
        from email.utils import parsedate_to_datetime
        d = parsedate_to_datetime(s)
        if d is not None:
            return (d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)).astimezone(dt.timezone.utc)
    except (TypeError, ValueError, IndexError, OverflowError):
        pass
    return None


def _header_get(response, name):
    """Case-insensitive header lookup that tolerates fake response objects."""
    headers = getattr(response, "headers", None) or {}
    try:
        v = headers.get(name)
        if v is not None:
            return v
    except AttributeError:
        pass
    try:
        for k, val in headers.items():
            if str(k).lower() == name.lower():
                return val
    except AttributeError:
        pass
    return None


def _entries_from_list(items):
    entries = []
    for item in items:
        if not isinstance(item, dict):
            continue
        path = item.get("path") or item.get("key") or item.get("object")
        if not path:
            project, table = item.get("project"), item.get("table")
            if project and table:
                path = f"/db-export/{project}/{table}.jsonl"
        if not path:
            continue
        path = str(path)
        if not path.startswith("/"):
            path = "/" + path
        entries.append({
            "path": path,
            "bytes": item.get("bytes"),
            "sha256": item.get("sha256", item.get("sha")),
            "table": item.get("table"),
            "project": item.get("project"),
        })
    return entries


def _entries_from_dict(manifest):
    entries = []
    for key, val in manifest.items():
        lk = str(key).lower()
        if lk in _TIMESTAMP_FIELDS or lk in ("version", "count", "project"):
            continue
        if isinstance(val, list):  # wrapper style: {"tables": [...]}
            nested = _entries_from_list(val)
            if nested:
                return nested
            continue
        if not isinstance(val, dict):
            continue
        path = str(key)
        if not path.startswith("/"):
            path = "/" + path
        entries.append({
            "path": path,
            "bytes": val.get("bytes"),
            "sha256": val.get("sha256", val.get("sha")),
            "table": val.get("table", key),
            "project": val.get("project"),
        })
    return entries


def _normalize_manifest(manifest):
    """Return a uniform list of {path, bytes, sha256, table, project}."""
    if isinstance(manifest, list):
        return _entries_from_list(manifest)
    if isinstance(manifest, dict):
        return _entries_from_dict(manifest)
    return []


def _raw_entry_dicts(manifest):
    """Raw dict entries (incl. timestamp fields) for freshness discovery."""
    if isinstance(manifest, list):
        return [x for x in manifest if isinstance(x, dict)]
    if isinstance(manifest, dict):
        out = []
        for key, val in manifest.items():
            if isinstance(val, dict) and str(key).lower() not in _TIMESTAMP_FIELDS:
                out.append(val)
            elif isinstance(val, list):
                out.extend(x for x in val if isinstance(x, dict))
        return out
    return []


def _manifest_timestamp(manifest, response):
    """Find a freshness timestamp: top-level field, entry field, or HTTP header."""
    if isinstance(manifest, dict):
        for key, val in manifest.items():
            if str(key).lower() in _TIMESTAMP_FIELDS:
                ts = _parse_timestamp(val)
                if ts:
                    return ts, f"manifest.{key}"
    for entry in _raw_entry_dicts(manifest):
        for key, val in entry.items():
            if str(key).lower() in _TIMESTAMP_FIELDS:
                ts = _parse_timestamp(val)
                if ts:
                    return ts, f"entry.{key}"
    last_modified = _header_get(response, "Last-Modified")
    ts = _parse_timestamp(last_modified)
    if ts:
        return ts, "R2 Last-Modified"
    return None, None


def _is_fresh(ts, now):
    if ts is None:
        return False
    age = now - ts
    return -FUTURE_SKEW <= age <= dt.timedelta(days=FRESHNESS_DAYS)


def _pick_sample(entries):
    """Choose the smallest object that carries both a size and a hash."""
    candidates = [e for e in entries if e.get("sha256") and e.get("bytes") is not None]
    if not candidates:
        candidates = [e for e in entries if e.get("sha256")]
    if not candidates:
        return None
    try:
        return min(candidates, key=lambda e: int(e["bytes"]))
    except (ValueError, TypeError):
        return candidates[0]


class _ResponseHeaders:
    """Adapter so _header_get can read a raw response.headers mapping."""

    def __init__(self, headers):
        self.headers = headers


def migration_gate(http=None, now=None, min_entries=None, manifest_path=None, object_cap=None):
    """Require a verified, fresh, complete off-platform DB export before deletion.

    All I/O goes through ``http.urlopen(req, timeout=...)`` (injectable). The
    optional ``now`` argument makes freshness checks deterministic in tests.
    Per-run overrides let one janitor serve several backup buckets.
    """
    http = http or _DEFAULT_HTTP
    now = now or dt.datetime.now(dt.timezone.utc)
    min_entries = MIN_MANIFEST_ENTRIES if min_entries is None else min_entries
    manifest_path = MANIFEST_PATH if manifest_path is None else manifest_path
    object_cap = GATE_OBJECT_CAP if object_cap is None else object_cap

    def url(path):
        return EP + "/" + R2BUCKET + path

    # (a) GET + parse the manifest (a plain HEAD is not enough).
    try:
        req = urllib.request.Request(url(manifest_path), method="GET", headers=s3_headers("GET", manifest_path))
        with http.urlopen(req, timeout=30) as r:
            if getattr(r, "status", 200) != 200:
                return False, f"{manifest_path} returned {r.status}"
            manifest = json.loads(r.read())
            resp_headers = getattr(r, "headers", None)
    except Exception as e:
        return False, f"{manifest_path}: {type(e).__name__}: {e}"

    entries = _normalize_manifest(manifest)
    if len(entries) < min_entries:
        return False, f"manifest lists {len(entries)} table entries (< {min_entries})"

    # (b) freshness: manifest field or R2 Last-Modified must be within 7 days.
    ts, ts_source = _manifest_timestamp(manifest, _ResponseHeaders(resp_headers))
    if not _is_fresh(ts, now):
        when = ts.isoformat() if ts else "missing"
        return False, f"manifest is stale (timestamp {when} from {ts_source}; max age {FRESHNESS_DAYS} days)"

    # (c) completeness: HEAD every referenced object, bounded by the cap.
    if len(entries) > object_cap:
        return False, f"manifest lists {len(entries)} objects (> cap {object_cap}); cannot verify completeness"
    for e in entries:
        path = e["path"]
        try:
            req = urllib.request.Request(url(path), method="HEAD", headers=s3_headers("HEAD", path))
            with http.urlopen(req, timeout=30) as r:
                if getattr(r, "status", 200) != 200:
                    return False, f"{path} returned {r.status}"
                length = _header_get(r, "Content-Length")
                if length is not None and e.get("bytes") is not None:
                    try:
                        if int(length) != int(e["bytes"]):
                            return False, f"{path} size mismatch: R2 {length} vs manifest {e['bytes']}"
                    except (ValueError, TypeError):
                        pass
        except Exception as ex:
            return False, f"{path}: {type(ex).__name__}: {ex}"

    # (d) content integrity: GET one small object, compare SHA-256 + byte size.
    sample = _pick_sample(entries)
    if sample is None:
        return False, "no manifest object carries a SHA-256 to verify content integrity"
    path = sample["path"]
    try:
        req = urllib.request.Request(url(path), method="GET", headers=s3_headers("GET", path))
        with http.urlopen(req, timeout=30) as r:
            data = r.read()
    except Exception as ex:
        return False, f"{path} content GET: {type(ex).__name__}: {ex}"
    data = data if isinstance(data, (bytes, bytearray)) else str(data).encode("utf-8")
    if sample.get("bytes") is not None and len(data) != int(sample["bytes"]):
        return False, f"{path} content size mismatch: {len(data)} vs manifest {sample['bytes']}"
    actual_hash = hashlib.sha256(bytes(data)).hexdigest()
    expected = str(sample.get("sha256") or "").lower()
    if not expected or actual_hash != expected:
        return False, f"{path} SHA-256 mismatch: {actual_hash} vs manifest {expected}"

    return True, (f"manifest fresh, {len(entries)} objects present, content hash verified for {path}")


def discover_manifest(prefix):
    """Find the newest manifest.json under an R2 prefix (auto-refreshing gate)."""
    path = "/"
    query = urllib.parse.urlencode(sorted({"list-type": "2", "prefix": prefix.lstrip("/"), "max-keys": "1000"}.items()))
    now = dt.datetime.now(dt.timezone.utc)
    amz, ts = now.strftime("%Y%m%d"), now.strftime("%Y%m%dT%H%M%SZ")
    scope = f"{amz}/auto/s3/aws4_request"
    h = hashlib.sha256(b"").hexdigest()
    host = EP.replace("https://", "")
    canon = f"GET\n/{R2BUCKET}{path}\n{query}\nhost:{host}\nx-amz-content-sha256:{h}\nx-amz-date:{ts}\n\nhost;x-amz-content-sha256;x-amz-date\n{h}"
    s2 = f"AWS4-HMAC-SHA256\n{ts}\n{scope}\n{hashlib.sha256(canon.encode()).hexdigest()}"
    def hm(k, m):
        return hmac.new(k, m.encode() if isinstance(m, str) else m, hashlib.sha256).digest()
    k = hm(("AWS4" + SK).encode(), amz)
    for part in ("auto", "s3", "aws4_request"):
        k = hm(k, part)
    headers = {"Authorization": f"AWS4-HMAC-SHA256 Credential={AK}/{scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature={hm(k, s2).hex()}",
               "x-amz-date": ts, "x-amz-content-sha256": h}
    req = urllib.request.Request(EP + "/" + R2BUCKET + path + "?" + query, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=60) as r:
        root = ET.fromstring(r.read())
    ns = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}
    keys = [x.find("s:Key", ns).text for x in root.findall("s:Contents", ns)]
    manifests = [k for k in keys if k and k.endswith("/manifest.json")]
    if not manifests:
        raise ValueError(f"no manifest.json found under R2 prefix {prefix}")
    return "/" + max(manifests).lstrip("/")


def capacity_report():
    """Current size of the managed backup bucket (used for storage-full alerts)."""
    _require_backup_bucket()
    bucket = str(BUCKET).replace("'", "''")
    rows = supabase_sql(
        "SELECT count(*)::int AS objects, "
        "coalesce(sum((metadata->>'size')::bigint),0)::text AS bytes "
        f"FROM storage.objects WHERE bucket_id='{bucket}'"
    )
    return rows[0] if rows else {"objects": 0, "bytes": "0"}


def old_sets(retention_days, keep_newest=1, flat=False):
    _require_backup_bucket()
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=retention_days)).isoformat()
    bucket = str(BUCKET).replace("'", "''")
    if flat:
        # Legacy buckets store flat names like openbox-db-20261101T110457Z.sql.gz
        rows = supabase_sql(
            "SELECT regexp_replace(name, '^.*?([0-9]{8}T[0-9]{6}Z).*$', '\\1') AS set_id, "
            "count(*)::int AS parts, max(created_at) AS newest, "
            "sum((metadata->>'size')::bigint)::text AS bytes "
            f"FROM storage.objects WHERE bucket_id='{bucket}' "
            "AND name ~ '[0-9]{8}T[0-9]{6}Z' GROUP BY 1 ORDER BY 1"
        )
    else:
        rows = supabase_sql(
            "SELECT split_part(name,'/',2) AS set_id, count(*)::int AS parts, "
            "max(created_at) AS newest, sum((metadata->>'size')::bigint)::text AS bytes "
            f"FROM storage.objects WHERE bucket_id='{bucket}' AND position('/' in name) > 0 "
            "AND split_part(name,'/',2) <> '' GROUP BY 1 ORDER BY 1"
        )
    # Safety: always retain the newest N sets, even with retention_days=0.
    protected = {r["set_id"] for r in sorted(rows, key=lambda r: str(r["newest"]), reverse=True)[:max(1, keep_newest)]}
    return ([r for r in rows if r["newest"] < cutoff and r["set_id"] not in protected], rows)


def delete_set(set_id, flat=False):
    _require_backup_bucket()
    if not set_id or "/" in str(set_id) or not str(set_id).strip():
        raise ValueError("refusing to delete with an empty or malformed backup set id")
    if flat and not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z", str(set_id)):
        raise ValueError("refusing to delete with an empty or malformed backup set id")

    def esc(v):
        return str(v).replace("'", "''")

    if flat:
        cond = f"bucket_id='{esc(BUCKET)}' AND position('{esc(set_id)}' in name) > 0"
    else:
        cond = f"bucket_id='{esc(BUCKET)}' AND split_part(name,'/',2)='{esc(set_id)}'"
    supabase_sql(f"UPDATE storage.objects SET archived_at=now() WHERE {cond} AND archived_at IS NULL", write=True)
    return len(supabase_sql(f"SELECT id FROM storage.delete_lifecycle_objects(ARRAY(SELECT id FROM storage.objects WHERE {cond}))", write=True))


def main():
    global BUCKET, MANIFEST_PATH, MIN_MANIFEST_ENTRIES
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually delete (default: dry run)")
    ap.add_argument("--retention-days", type=int, default=7)
    ap.add_argument("--max-sets", type=int, default=500)
    ap.add_argument("--bucket", default=BUCKET, help="backup bucket to maintain")
    ap.add_argument("--flat-sets", action="store_true", help="legacy buckets with timestamped flat filenames")
    ap.add_argument("--keep-newest", type=int, default=1, help="always keep this many newest sets (minimum 1)")
    ap.add_argument("--manifest-path", default=MANIFEST_PATH)
    ap.add_argument("--min-entries", type=int, default=MIN_MANIFEST_ENTRIES)
    ap.add_argument("--capacity-threshold-mb", type=int, default=0,
                    help="log a warning when the bucket exceeds this many MB")
    ap.add_argument("--discover-manifest", action="store_true",
                    help="use the newest manifest.json under --manifest-prefix")
    ap.add_argument("--manifest-prefix", default="/open-box-db-export/")
    args = ap.parse_args()
    BUCKET = args.bucket
    MANIFEST_PATH = args.manifest_path
    MIN_MANIFEST_ENTRIES = args.min_entries
    if not PAT or not AK or not SK or not EP:
        print("missing credentials in environment", file=sys.stderr)
        return 2
    manifest_path = args.manifest_path
    if args.discover_manifest:
        try:
            manifest_path = discover_manifest(args.manifest_prefix)
            print(json.dumps({"discovered_manifest": manifest_path}))
        except Exception as exc:
            print(json.dumps({"gate": "fail", "detail": f"manifest discovery: {type(exc).__name__}: {exc}"}))
            return 3
    ok, why = migration_gate(min_entries=args.min_entries, manifest_path=manifest_path)
    print(json.dumps({"gate": "pass" if ok else "fail", "detail": why}))
    if not ok:
        return 3
    targets, allsets = old_sets(args.retention_days, keep_newest=max(1, args.keep_newest), flat=args.flat_sets)
    cap = capacity_report()
    cap_mb = int(cap["bytes"]) / (1024 * 1024)
    print(json.dumps({"capacity": cap, "mb": round(cap_mb, 2)}))
    if args.capacity_threshold_mb and cap_mb > args.capacity_threshold_mb:
        print(json.dumps({"warning": "bucket exceeds capacity threshold; prune after verified R2 backup"}))
    print(json.dumps({"backup_sets_total": len(allsets), "older_than_retention": len(targets), "mode": "apply" if args.apply else "dry-run"}))
    deleted = 0
    for t in targets[: args.max_sets]:
        if args.apply:
            n = delete_set(t["set_id"], flat=args.flat_sets)
            deleted += n
            print(json.dumps({"deleted": t["set_id"], "rows": n}))
        else:
            print(json.dumps({"would_delete": t["set_id"], "rows": t["parts"]}))
    print(json.dumps({"summary": {"deleted_rows": deleted, "sets": min(len(targets), args.max_sets), "applied": args.apply,
                                  "bucket": BUCKET, "kept_newest": max(1, args.keep_newest)}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
