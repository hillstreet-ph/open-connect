#!/usr/bin/env python3
"""Retention janitor for Supabase Storage backup sets.

Safety rules:
  - refuses to delete unless a full DB export manifest exists in R2
  - dry-run by default; --apply required for changes
  - deletes metadata rows only through Supabase's supported lifecycle path
  - never touches credentials, invoices, or non-backup buckets
"""
import argparse, datetime as dt, hashlib, hmac, json, os, re, sys, urllib.error, urllib.request

PAT = os.environ.get("SUPABASE_PAT", "")
REF = os.environ.get("SUPABASE_PROJECT_REF", "huadtiuuoiriqrjpjxhr")
BUCKET = os.environ.get("BACKUP_BUCKET", "open-system-backups")
AK = os.environ.get("R2_ACCESS_KEY_ID", "")
SK = os.environ.get("R2_SECRET_ACCESS_KEY", "")
EP = os.environ.get("R2_S3_ENDPOINT", "").rstrip("/")
R2BUCKET = os.environ.get("R2_BUCKET", "supabase-backups")

# Safety: only an explicitly named backup bucket may ever be read or deleted in.
SENSITIVE_BUCKETS = ("credential", "invoice")


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


def migration_gate():
    """Require a verified off-platform DB export before any deletion."""
    for path in ("/db-export/manifest.json", f"/db-export/{REF}/public.projects.jsonl"):
        req = urllib.request.Request(EP + "/" + R2BUCKET + path, method="HEAD", headers=s3_headers("HEAD", path))
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                if r.status != 200:
                    return False, f"{path} returned {r.status}"
        except Exception as e:
            return False, f"{path}: {e}"
    return True, "R2 export manifest and sample table present"


def old_sets(retention_days):
    _require_backup_bucket()
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=retention_days)).isoformat()
    bucket = str(BUCKET).replace("'", "''")
    rows = supabase_sql(
        "SELECT split_part(name,'/',2) AS set_id, count(*)::int AS parts, "
        "max(created_at) AS newest, sum((metadata->>'size')::bigint)::text AS bytes "
        f"FROM storage.objects WHERE bucket_id='{bucket}' AND position('/' in name) > 0 "
        "AND split_part(name,'/',2) <> '' GROUP BY 1 ORDER BY 1"
    )
    return [r for r in rows if r["newest"] < cutoff], rows


def delete_set(set_id):
    _require_backup_bucket()
    if not set_id or "/" in str(set_id) or not str(set_id).strip():
        raise ValueError("refusing to delete with an empty or malformed backup set id")

    def esc(v):
        return str(v).replace("'", "''")

    cond = f"bucket_id='{esc(BUCKET)}' AND split_part(name,'/',2)='{esc(set_id)}'"
    supabase_sql(f"UPDATE storage.objects SET archived_at=now() WHERE {cond} AND archived_at IS NULL", write=True)
    return len(supabase_sql(f"SELECT id FROM storage.delete_lifecycle_objects(ARRAY(SELECT id FROM storage.objects WHERE {cond}))", write=True))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually delete (default: dry run)")
    ap.add_argument("--retention-days", type=int, default=7)
    ap.add_argument("--max-sets", type=int, default=500)
    args = ap.parse_args()
    if not PAT or not AK or not SK or not EP:
        print("missing credentials in environment", file=sys.stderr)
        return 2
    ok, why = migration_gate()
    print(json.dumps({"gate": "pass" if ok else "fail", "detail": why}))
    if not ok:
        return 3
    targets, allsets = old_sets(args.retention_days)
    print(json.dumps({"backup_sets_total": len(allsets), "older_than_retention": len(targets), "mode": "apply" if args.apply else "dry-run"}))
    deleted = 0
    for t in targets[: args.max_sets]:
        if args.apply:
            n = delete_set(t["set_id"])
            deleted += n
            print(json.dumps({"deleted": t["set_id"], "rows": n}))
        else:
            print(json.dumps({"would_delete": t["set_id"], "rows": t["parts"]}))
    print(json.dumps({"summary": {"deleted_rows": deleted, "sets": min(len(targets), args.max_sets), "applied": args.apply}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
