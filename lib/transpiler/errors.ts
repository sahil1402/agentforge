// ─── Transpiler errors ─────────────────────────────────────────────────────────
//
// A single typed error class the walk + render code throws and the API route
// maps to an HTTP response. Keeping the codes here (not scattered as strings)
// lets Pieces 2–4 add their own without reinventing the shape.

export type TranspileErrorCode =
  | 'EMPTY_GRAPH'       // no nodes to transpile
  | 'UNSUPPORTED_NODE'  // a node type Piece 1 does not handle (router / human_gate / tool / memory)
  | 'NOT_LINEAR'        // branching, fan-out/fan-in, or a cycle — not a single chain
  | 'DISCONNECTED'      // dangling edge or unreachable node

export class TranspileError extends Error {
  readonly code: TranspileErrorCode
  /** Human-friendly pointer to the piece that will add support, if any. */
  readonly piece?: string

  constructor(code: TranspileErrorCode, message: string, piece?: string) {
    super(message)
    this.name = 'TranspileError'
    this.code = code
    this.piece = piece
  }
}
