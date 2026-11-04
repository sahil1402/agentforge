"""Active runs: one worker subprocess each, events persisted and fanned out to WebSocket subscribers.

Plain `subprocess` + threads instead of asyncio subprocesses: uvicorn's --reload uses a
selector event loop on Windows, which cannot spawn asyncio subprocesses.
"""

import asyncio
import contextlib
import json
import logging
import os
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, Any

from . import db

log = logging.getLogger(__name__)
BACKEND_DIR = Path(__file__).resolve().parent.parent
WORKER_CMD = [sys.executable, "-m", "app.worker"]
# Kill a run that emits nothing for this long (gate waits are bounded by the gate's own timeout).
IDLE_TIMEOUT_S = float(os.environ.get("RUN_IDLE_TIMEOUT_SECONDS", "300"))

STATUS_FOR = {"GATE_PENDING": "AWAITING_HUMAN", "GATE_RESOLVED": "RUNNING"}
Event = dict[str, Any]


@dataclass
class ActiveRun:
    id: str
    proc: subprocess.Popen[str]
    stderr: IO[bytes]
    started: float = field(default_factory=time.monotonic)
    lines: asyncio.Queue[str | None] = field(default_factory=asyncio.Queue)  # worker stdout; None = EOF
    history: list[Event] = field(default_factory=list)
    subscribers: set[asyncio.Queue[Event | None]] = field(default_factory=set)
    awaiting_gate: bool = False
    stop_reason: str | None = None  # set when the engine kills the worker on purpose
    task: asyncio.Task[None] | None = None


RUNS: dict[str, ActiveRun] = {}


async def start(run_id: str, job: dict[str, Any]) -> None:
    # shortcut: runs execute with this server's privileges and env (API keys); sandbox before multi-user/hosted use.
    stderr = tempfile.TemporaryFile()
    proc = subprocess.Popen(WORKER_CMD, cwd=BACKEND_DIR, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=stderr, text=True, encoding="utf-8")
    run = RUNS[run_id] = ActiveRun(run_id, proc, stderr)
    try:
        # Off the event loop: a big job fills the pipe while the worker is still importing.
        await asyncio.to_thread(_send, proc, job)
        await db.set_status(run_id, "RUNNING")
    except BaseException:
        proc.kill()
        stderr.close()
        RUNS.pop(run_id, None)
        raise
    # A dedicated thread per run, so long-lived runs can't exhaust the default executor.
    threading.Thread(target=_read_lines, args=(proc, asyncio.get_running_loop(), run.lines), daemon=True).start()
    run.task = asyncio.create_task(_pump(run))


def decide(run_id: str, approved: bool) -> bool:
    """Send a gate decision to a run waiting on one. False if there is no such run."""
    run = RUNS.get(run_id)
    if not run or not run.awaiting_gate or not run.proc.stdin:
        return False
    try:
        _send(run.proc, {"approved": approved})
    except OSError:  # worker already exited
        return False
    run.awaiting_gate = False
    return True


def cancel(run_id: str, reason: str = "Cancelled by user") -> bool:
    """Stop a run; it ends with an ERROR event carrying `reason`. False if it isn't running."""
    run = RUNS.get(run_id)
    if not run:
        return False
    run.stop_reason = reason
    run.proc.kill()
    return True


async def shutdown() -> None:
    """Stop every run and wait (briefly) for each to record its final event."""
    for run_id in list(RUNS):
        cancel(run_id, "Execution engine stopped")
    tasks = [run.task for run in RUNS.values() if run.task]
    if tasks:
        await asyncio.wait(tasks, timeout=5)


def subscribe(run_id: str) -> tuple[list[Event], asyncio.Queue[Event | None]] | None:
    """Backlog + live queue for an active run (None once it has finished). The queue ends with None."""
    run = RUNS.get(run_id)
    if not run:
        return None
    queue: asyncio.Queue[Event | None] = asyncio.Queue()
    run.subscribers.add(queue)  # no await between this and the snapshot, so no event is missed or doubled
    return list(run.history), queue


def unsubscribe(run_id: str, queue: asyncio.Queue[Event | None]) -> None:
    if run := RUNS.get(run_id):
        run.subscribers.discard(queue)


def _send(proc: subprocess.Popen[str], message: dict[str, Any]) -> None:
    assert proc.stdin
    proc.stdin.write(json.dumps(message) + "\n")
    proc.stdin.flush()


def _read_lines(proc: subprocess.Popen[str], loop: asyncio.AbstractEventLoop, lines: asyncio.Queue[str | None]) -> None:
    assert proc.stdout
    for line in iter(proc.stdout.readline, ""):
        loop.call_soon_threadsafe(lines.put_nowait, line)
    loop.call_soon_threadsafe(lines.put_nowait, None)


async def _pump(run: ActiveRun) -> None:
    try:
        while True:
            timeout = None if run.awaiting_gate else IDLE_TIMEOUT_S
            try:
                line = await asyncio.wait_for(run.lines.get(), timeout)
            except TimeoutError:
                await _record(run, _error(f"No progress for {IDLE_TIMEOUT_S:.0f}s; run stopped."))
                break
            if line is None:  # worker exited without a final event
                await asyncio.to_thread(run.proc.wait)
                run.stderr.seek(0)
                tail = run.stderr.read().decode("utf-8", "replace").strip()[-2000:]
                await _record(run, _error(run.stop_reason or tail or f"Worker exited with code {run.proc.returncode}"))
                break
            try:
                event = json.loads(line)
            except ValueError:
                log.warning("run %s: ignoring non-protocol output %r", run.id, line[:200])
                continue
            await _record(run, event)
            if event["type"] in ("COMPLETE", "ERROR"):
                break
    except Exception:
        log.exception("run %s: event pump failed", run.id)
        # Still end the stream for watchers, and don't leave the run stuck in RUNNING.
        ts = db.now()
        event = _publish(run, _error("Execution engine error"), db.iso(ts))
        with contextlib.suppress(Exception):
            await db.add_event(run.id, event["sequence"], event["type"], None, event["payload"], ts)
        with contextlib.suppress(Exception):
            await db.finish(run.id, "FAILED", error="Execution engine error", duration_ms=_elapsed_ms(run))
    finally:
        if run.proc.poll() is None:
            run.proc.kill()
        run.stderr.close()
        for queue in run.subscribers:
            queue.put_nowait(None)
        RUNS.pop(run.id, None)


def _error(message: str) -> Event:
    return {"type": "ERROR", "payload": {"message": message}}


def _elapsed_ms(run: ActiveRun) -> int:
    return int((time.monotonic() - run.started) * 1000)


def _publish(run: ActiveRun, raw: Event, ts_iso: str | None = None) -> Event:
    """Number the event, add it to the run's history and push it to every subscriber."""
    event = {"type": raw["type"], "nodeId": raw.get("nodeId"), "payload": raw.get("payload", {}),
             "sequence": len(run.history) + 1, "ts": ts_iso or db.iso(db.now())}
    run.history.append(event)
    for queue in run.subscribers:
        queue.put_nowait(event)
    return event


async def _record(run: ActiveRun, raw: Event) -> None:
    # Before any await: the gate endpoint may be called as soon as AWAITING_HUMAN is stored.
    run.awaiting_gate = raw["type"] == "GATE_PENDING"
    ts = db.now()
    sequence = len(run.history) + 1
    await db.add_event(run.id, sequence, raw["type"], raw.get("nodeId"), raw.get("payload", {}), ts)

    if raw["type"] == "COMPLETE":
        payload = raw.get("payload", {})
        await db.finish(run.id, "COMPLETE", output={"output": payload.get("output", "")},
                        duration_ms=_elapsed_ms(run), tokens=payload.get("tokens"))
    elif raw["type"] == "ERROR":
        await db.finish(run.id, "FAILED", error=str(raw.get("payload", {}).get("message", "")),
                        duration_ms=_elapsed_ms(run))
    elif status := STATUS_FOR.get(raw["type"]):
        await db.set_status(run.id, status)

    # Published only once stored: a client seeing GATE_PENDING can act on it immediately.
    _publish(run, raw, db.iso(ts))
