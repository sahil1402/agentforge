"""Postgres access for run state. The schema is owned by Prisma (prisma/schema.prisma)."""

import json
import os
from datetime import UTC, datetime
from typing import Any

import asyncpg

_pool: asyncpg.Pool | None = None


async def connect() -> None:
    global _pool
    _pool = await asyncpg.create_pool(os.environ["DATABASE_URL"], min_size=1, max_size=5)


async def close() -> None:
    if _pool:
        await _pool.close()


def pool() -> asyncpg.Pool:
    assert _pool, "db.connect() was not called"
    return _pool


async def fail_active_runs(reason: str) -> None:
    await pool().execute(
        "UPDATE runs SET status = 'FAILED', error_message = $1 WHERE status IN ('RUNNING', 'AWAITING_HUMAN')",
        reason,
    )


async def run_exists(run_id: str) -> bool:
    return bool(await pool().fetchval("SELECT 1 FROM runs WHERE id = $1", run_id))


def now() -> datetime:
    """Naive UTC at millisecond precision — what Prisma's timestamp(3) columns store."""
    t = datetime.now(UTC).replace(tzinfo=None)
    return t.replace(microsecond=t.microsecond // 1000 * 1000)


def iso(ts: datetime) -> str:
    return ts.isoformat(timespec="milliseconds") + "Z"


async def add_event(run_id: str, sequence: int, event_type: str, node_id: str | None,
                    payload: dict[str, Any], ts: datetime) -> None:
    # Prisma's uuid() default lives in the client, not the column, so generate the id here.
    await pool().execute(
        "INSERT INTO run_events (id, run_id, event_type, node_id, payload, sequence, ts)"
        " VALUES (gen_random_uuid()::text, $1, $2, $3, $4::jsonb, $5, $6)",
        run_id, event_type, node_id, json.dumps(payload), sequence, ts,
    )


async def set_status(run_id: str, status: str) -> None:
    await pool().execute('UPDATE runs SET status = $2::"RunStatus" WHERE id = $1', run_id, status)


async def finish(run_id: str, status: str, *, output: dict[str, Any] | None = None, error: str | None = None,
                 duration_ms: int, tokens: int | None = None) -> None:
    await pool().execute(
        'UPDATE runs SET status = $2::"RunStatus", output_payload = $3::jsonb, error_message = $4,'
        " duration_ms = $5, token_count = $6 WHERE id = $1",
        run_id, status, json.dumps(output) if output is not None else None, error, duration_ms, tokens,
    )


async def events(run_id: str) -> list[dict[str, Any]]:
    rows = await pool().fetch(
        "SELECT event_type, node_id, payload, sequence, ts FROM run_events WHERE run_id = $1 ORDER BY sequence",
        run_id,
    )
    return [{"type": r["event_type"], "nodeId": r["node_id"], "payload": json.loads(r["payload"]),
             "sequence": r["sequence"], "ts": iso(r["ts"])} for r in rows]
