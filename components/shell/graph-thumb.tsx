import { NODE_HUE, type GraphSchema, type NodeType } from '@/lib/types'

const NODE_W = 248
const NODE_H = 90

/** Tiny schematic of a graph: nodes as hue-tinted blocks, edges as lines. Pure SVG, both themes. */
export function GraphThumb({ graph, width = 80, height = 48, className = 'af-thumb' }: {
  graph: Pick<GraphSchema, 'nodes' | 'edges'> | null | undefined
  width?: number
  height?: number
  className?: string
}) {
  const nodes = graph?.nodes ?? []
  if (nodes.length === 0) {
    return (
      <svg className={className} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Empty graph">
        <text x={width / 2} y={height / 2 + 3} textAnchor="middle" style={{ fontSize: 8, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>empty</text>
      </svg>
    )
  }
  const xs = nodes.map((n) => n.position.x)
  const ys = nodes.map((n) => n.position.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX + NODE_W
  const spanY = Math.max(...ys) - minY + NODE_H
  const k = Math.min((width - 10) / spanX, (height - 10) / spanY)
  const ox = (width - spanX * k) / 2
  const oy = (height - spanY * k) / 2
  const place = (n: GraphSchema['nodes'][number]) => ({
    x: ox + (n.position.x - minX) * k, y: oy + (n.position.y - minY) * k, w: NODE_W * k, h: NODE_H * k,
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Graph preview">
      {(graph?.edges ?? []).map((e) => {
        const a = byId.get(e.source)
        const b = byId.get(e.target)
        if (!a || !b) return null
        const pa = place(a)
        const pb = place(b)
        return <line key={e.id} x1={pa.x + pa.w} y1={pa.y + pa.h / 2} x2={pb.x} y2={pb.y + pb.h / 2} style={{ stroke: 'var(--line-2)', strokeWidth: 1 }} />
      })}
      {nodes.map((n) => {
        const p = place(n)
        return <rect key={n.id} x={p.x} y={p.y} width={Math.max(p.w, 4)} height={Math.max(p.h, 3)} rx={1} style={{ fill: NODE_HUE[n.type as NodeType] ?? 'var(--text-3)', opacity: .85 }} />
      })}
    </svg>
  )
}
