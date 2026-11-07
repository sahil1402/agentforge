"""Runs one generated LangGraph module in its own process (`python -m app.worker`).

Protocol, one JSON object per line:
  stdin   first line: the job {code, nodeIds, input}; later lines: gate decisions {"approved": bool}
  stdout  trace events {type, nodeId?, payload}
User code (tools, routing conditions, processes they start) writing to stdout would corrupt the
protocol, so the protocol gets its own copy of fd 1 and fd 1 itself is pointed at stderr.
"""

import asyncio
import json
import os
import sys
import time
from collections.abc import Awaitable, Callable
from typing import Any, TextIO

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.types import Command

Emit = Callable[[dict[str, Any]], None]
ReadDecision = Callable[[float | None], Awaitable[bool | None]]  # None = timed out


def text_of(message: BaseMessage) -> str:
    content = message.content
    if isinstance(content, str):
        return content
    return "".join(b.get("text", "") for b in content if isinstance(b, dict))


def initial_input(payload: dict[str, Any]) -> str:
    for key in ("query", "input", "message"):
        if isinstance(payload.get(key), str):
            return payload[key]
    return json.dumps(payload)


def node_stats(result: Any, started: float) -> dict[str, int]:
    """NODE_END payload: usage of the AI messages the node wrote to state, and its wall time.
    shortcut: tool rounds inside run_with_tools never reach state, so their usage is not counted;
    count them once the agent template returns them (or from the `messages` stream)."""
    messages = result.get("messages", []) if isinstance(result, dict) else []
    usage = [m.usage_metadata or {} for m in messages if isinstance(m, AIMessage)]
    return {
        "inputTokens": sum(u.get("input_tokens", 0) for u in usage),
        "outputTokens": sum(u.get("output_tokens", 0) for u in usage),
        "durationMs": round((time.monotonic() - started) * 1000),
    }


async def run(job: dict[str, Any], emit: Emit, read_decision: ReadDecision) -> None:
    """Execute the job's graph, emitting trace events; ends with exactly one COMPLETE or ERROR."""
    node_ids: dict[str, str] = job.get("nodeIds", {})
    auto_approve = bool((job.get("input") or {}).get("autoApprove"))  # test runs: gates approve themselves
    running: dict[str, str] = {}  # task id → graph node id, for blaming errors
    started: dict[str, float] = {}  # task id → monotonic start; a resumed gate keeps its first start
    failed: str | None = None  # node whose task reported the error (parallel branches)
    try:
        namespace: dict[str, Any] = {"__name__": "agentforge_graph"}
        exec(compile(job["code"], "<generated graph>", "exec"), namespace)
        graph = namespace["graph"]

        config = {"configurable": {"thread_id": "run"}}
        graph_input: Any = {"messages": [HumanMessage(initial_input(job.get("input") or {}))]}
        values: dict[str, Any] = {}
        while True:
            async for mode, chunk in graph.astream(graph_input, config, stream_mode=["tasks", "messages", "values"]):
                if mode == "values":
                    values = chunk
                elif mode == "messages":
                    message, meta = chunk
                    node_id = node_ids.get(meta.get("langgraph_node", ""))
                    text = text_of(message) if isinstance(message, AIMessage) else ""
                    if node_id and text:
                        emit({"type": "TOKEN_CHUNK", "nodeId": node_id, "payload": {"chunk": text}})
                elif (node_id := node_ids.get(chunk["name"])) is not None:
                    if "input" in chunk:
                        running[chunk["id"]] = node_id
                        started.setdefault(chunk["id"], time.monotonic())
                        emit({"type": "NODE_START", "nodeId": node_id, "payload": {}})
                    elif chunk["error"]:
                        failed = failed or node_id  # the exception itself surfaces below
                    elif not chunk["interrupts"]:
                        running.pop(chunk["id"], None)
                        emit({"type": "NODE_END", "nodeId": node_id,
                              "payload": node_stats(chunk["result"], started.pop(chunk["id"], time.monotonic()))})

            state = await graph.aget_state(config) if graph.checkpointer else None
            pending = [(task.name, i) for task in state.tasks for i in task.interrupts] if state else []
            if not pending:
                break
            # Parallel branches can pause at several gates: ask one at a time, resume them together.
            answers: dict[str, dict[str, bool]] = {}
            for name, intr in pending:
                if any(not a["approved"] for a in answers.values()):
                    answers[intr.id] = {"approved": False}  # the run is already ending
                    continue
                gate_id, request = node_ids.get(name), intr.value
                emit({"type": "GATE_PENDING", "nodeId": gate_id, "payload": {
                    "prompt": request.get("prompt", ""), "lastOutput": request.get("last_output", ""),
                    "timeoutSeconds": request.get("timeout_seconds"),
                }})
                approved = True if auto_approve else await read_decision(request.get("timeout_seconds"))
                decision = "timeout" if approved is None else "approve" if approved else "reject"
                emit({"type": "GATE_RESOLVED", "nodeId": gate_id, "payload": {"decision": decision}})
                answers[intr.id] = {"approved": bool(approved)}
            graph_input = Command(resume=answers)

        messages = values.get("messages", [])
        tokens = sum((getattr(m, "usage_metadata", None) or {}).get("total_tokens", 0) for m in messages)
        emit({"type": "COMPLETE", "payload": {"output": text_of(messages[-1]) if messages else "", "tokens": tokens}})
    except Exception as e:  # noqa: BLE001 — any failure in user code ends the run with ERROR
        node_id = failed or next(iter(running.values()), None)
        emit({"type": "ERROR", "nodeId": node_id, "payload": {"message": f"{type(e).__name__}: {e}"}})


def main(stdin: TextIO = sys.stdin) -> None:
    protocol = os.fdopen(os.dup(1), "w", encoding="utf-8")
    os.dup2(2, 1)  # covers child processes and native code too (verified on Windows)
    sys.stdout = sys.stderr

    def emit(event: dict[str, Any]) -> None:
        protocol.write(json.dumps(event, default=str) + "\n")
        protocol.flush()

    async def read_decision(timeout: float | None) -> bool | None:
        try:
            line = await asyncio.wait_for(asyncio.to_thread(stdin.readline), timeout)
        except TimeoutError:
            return None
        return bool(line and json.loads(line).get("approved"))

    asyncio.run(run(json.loads(stdin.readline()), emit, read_decision))


if __name__ == "__main__":
    main()
