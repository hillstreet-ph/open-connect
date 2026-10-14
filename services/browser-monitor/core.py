"""Read-only cashout evidence and durable delivery state. No browser credentials."""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zoneinfo import ZoneInfo


class MonitorBlocked(Exception):
    """Only static reason codes may leave the worker."""


def clean(value: str, limit: int = 160) -> str:
    return re.sub(r"[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]", " ", str(value))[:limit].strip()


def money(value: str) -> int:
    # Accept only explicitly configured PHP decimal text; never strip arbitrary symbols.
    if not re.fullmatch(r"(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?", value.strip()):
        raise MonitorBlocked("invalid_amount")
    try:
        amount = Decimal(value.replace(",", "")) * 100
        if not amount.is_finite() or amount < 0 or amount > 10**14:
            raise MonitorBlocked("invalid_amount")
        return int(amount)
    except InvalidOperation as exc:
        raise MonitorBlocked("invalid_amount") from exc


def timestamp(value: str, fmt: str | None = None, zone: str = "Asia/Manila") -> str:
    try:
        parsed = datetime.strptime(value, fmt) if fmt else datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=ZoneInfo(zone))
        return parsed.astimezone(timezone.utc).isoformat()
    except (ValueError, TypeError) as exc:
        raise MonitorBlocked("invalid_timestamp") from exc


def normalize(raw: dict, config: dict) -> dict:
    for key in ("request_id", "username", "amount", "currency", "requested_at", "status"):
        if not isinstance(raw.get(key), str) or not raw[key].strip():
            raise MonitorBlocked("missing_required_field")
    status = raw["status"].strip()
    if status not in config["statuses"]:
        raise MonitorBlocked("unmapped_status")
    currency = raw["currency"].strip()
    if currency != "PHP":
        raise MonitorBlocked("unverified_currency")
    record = {
        "request_id": clean(raw["request_id"]), "username": clean(raw["username"]),
        "amount_minor": money(raw["amount"]), "currency": currency,
        "requested_at": timestamp(raw["requested_at"], config.get("timestamp_format"), config["source_timezone"]),
        "status": clean(status), "phase": config["statuses"][status],
        # Evidence strings are reported, never converted into an approval or VTO pass.
        "promotion": clean(raw.get("promotion") or "Unverified"),
        "promotion_status": clean(raw.get("promotion_status") or "Unverified"),
        "promotion_vto": clean(raw.get("promotion_vto") or "Unverified"),
        "deposit_wagering": clean(raw.get("deposit_wagering") or "Unverified"),
        "completed_at": None,
    }
    if raw.get("completed_at"):
        record["completed_at"] = timestamp(raw["completed_at"], config.get("timestamp_format"), config["source_timezone"])
    if not record["request_id"] or not record["username"]:
        raise MonitorBlocked("missing_required_field")
    return record


def pht(value: str) -> str:
    return datetime.fromisoformat(value).astimezone(ZoneInfo("Asia/Manila")).strftime("%d %b %Y, %I:%M:%S %p PHT")


def format_alert(record: dict, observed_at: str) -> str:
    review = record["amount_minor"] >= 300000
    action = "HUMAN REVIEW REQUIRED — PHP 3,000+" if review else "CASHOUT STATUS NOTICE"
    amount = Decimal(record["amount_minor"]) / 100
    completed = pht(record["completed_at"]) if record["completed_at"] else "Not provided by source"
    pending = "Not applicable"
    if record["phase"] == "pending":
        seconds = max(0, int((datetime.fromisoformat(observed_at) - datetime.fromisoformat(record["requested_at"])).total_seconds()))
        pending = f"{seconds // 3600}h {(seconds % 3600) // 60}m since request"
    return (
        f"KOBEPLAY | CASHOUT REVIEW\n{action}\n\n"
        f"Request ID: {record['request_id']}\nPlayer: {record['username']}\n"
        f"Requested: {pht(record['requested_at'])}\nAmount: PHP {amount:,.2f}\n"
        f"Source status: {record['status']}\nPending duration: {pending}\n\n"
        f"Promotion: {record['promotion']}\nPromotion status: {record['promotion_status']}\n"
        f"Promotion VTO: {record['promotion_vto']}\nDeposit wagering: {record['deposit_wagering']}\n"
        "Met before request: Unverified — historical evidence requires human review\n\n"
        f"Completed at: {completed}\nLast observed: {pht(observed_at)}\n"
        "This is observed source evidence, not an approval. Human approval and payment remain manual."
    )


class Store:
    def __init__(self, path: Path):
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, digest TEXT NOT NULL, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox(
          id INTEGER PRIMARY KEY, request_id TEXT, digest TEXT, body TEXT NOT NULL,
          state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
          retry_at REAL NOT NULL DEFAULT 0, message_id INTEGER, reason TEXT);
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        """)
        # A crash while sending is ambiguous: do not automatically replay it.
        with self.db:
            self.db.execute("UPDATE outbox SET state='ambiguous', reason='process_interrupted' WHERE state='sending'")

    def close(self):
        self.db.close()

    def ingest(self, records: list[dict], observed_at: str, live: bool) -> int:
        if len({r['request_id'] for r in records}) != len(records):
            raise MonitorBlocked("duplicate_request_ids")
        count = 0
        with self.db:
            initial_scan = self.db.execute("SELECT value FROM meta WHERE key='last_observed_at'").fetchone() is None
            for record in records:
                body = json.dumps(record, sort_keys=True)
                digest = hashlib.sha256(body.encode()).hexdigest()
                previous = self.db.execute("SELECT digest FROM records WHERE id=?", (record['request_id'],)).fetchone()
                previous_delivery = self.db.execute("SELECT state FROM outbox WHERE request_id=? AND digest=? ORDER BY id DESC LIMIT 1", (record['request_id'], digest)).fetchone()
                promote_dry_run = live and previous_delivery and previous_delivery[0] == 'dry_run' and record['phase'] == 'pending'
                if previous and previous[0] == digest and not promote_dry_run:
                    continue
                # The source is a fresh complete snapshot, not an unversioned event feed.
                self.db.execute("INSERT OR REPLACE INTO records VALUES(?,?,?)", (record['request_id'], digest, body))
                state = 'pending' if live else 'dry_run'
                if initial_scan and record['phase'] != 'pending':
                    state = 'baseline'
                self.db.execute("INSERT INTO outbox(request_id,digest,body,state) VALUES(?,?,?,?)",
                                (record['request_id'], digest, format_alert(record, observed_at), state))
                count += 1
            self.db.execute("INSERT OR REPLACE INTO meta VALUES('last_observed_at',?)", (observed_at,))
        # Missing rows never close prior requests.
        return count

    def next_delivery(self, now: float):
        self.db.row_factory = sqlite3.Row
        with self.db:
            row = self.db.execute("SELECT * FROM outbox WHERE state='pending' AND retry_at<=? ORDER BY id LIMIT 1", (now,)).fetchone()
            if row:
                self.db.execute("UPDATE outbox SET state='sending', attempts=attempts+1 WHERE id=?", (row['id'],))
        return dict(row) if row else None

    def settle(self, item_id: int, state: str, *, reason: str = "", retry_at: float = 0, message_id: int | None = None):
        if state not in {'pending', 'sent', 'failed', 'ambiguous'}:
            raise ValueError("invalid delivery state")
        with self.db:
            self.db.execute("UPDATE outbox SET state=?,reason=?,retry_at=?,message_id=? WHERE id=?",
                            (state, reason, retry_at, message_id, item_id))

    def counts(self):
        return dict(self.db.execute("SELECT state,COUNT(*) FROM outbox GROUP BY state").fetchall())
