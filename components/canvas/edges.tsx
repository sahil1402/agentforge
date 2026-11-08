'use client'

import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useGraphStore } from '@/store/graph-store'
import { cn } from '@/lib/utils'

/**
 * Flow edge: hairline at rest, dashed accent flow while its target runs, solid accent once both ends
 * ran. A router's untaken branch dims after another branch is taken.
 */
export const AnimatedEdge = memo(function AnimatedEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source, target, sourceHandleId, selected,
}: EdgeProps) {
  const active = useGraphStore((s) => s.activeNodeIds)
  const completed = useGraphStore((s) => s.completedNodeIds)
  const failed = useGraphStore((s) => s.failedNodeIds)
  const sourceNode = useGraphStore((s) => s.nodes.find((n) => n.id === source))
  const targetNode = useGraphStore((s) => s.nodes.find((n) => n.id === target))

  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const ran = (n: string) => completed.has(n) || failed.has(n)
  const isTool = sourceNode?.type === 'tool' || targetNode?.type === 'tool'
  const isRoute = sourceNode?.type === 'router' && !!sourceHandleId
  // Routers emit no events: a branch is taken once its target ran.
  // shortcut: a target reached another way also lights the branch; emit a route event from the engine if that matters.
  const routerTookOther = isRoute && !ran(target) && sourceNode.data.routes.some((r: { target: string }) => r.target !== target && ran(r.target))
  const state = active.has(target) ? 'active'
    : ran(target) && (ran(source) || isRoute) ? 'done'
    : routerTookOther ? 'dim'
    : ''

  const stroke = state === 'active' || state === 'done' || selected ? 'var(--accent)' : isTool ? 'var(--t-tool)' : 'var(--line-2)'
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className="af-edge-main"
        interactionWidth={14}
        style={{
          stroke,
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: state === 'active' ? '6 6' : isTool ? '3 4' : undefined,
          animation: state === 'active' ? 'af-flow .7s linear infinite' : undefined,
          opacity: state === 'dim' ? 0.25 : state === 'done' ? 0.75 : isTool ? 0.65 : 1,
          transition: 'stroke .3s, opacity .3s',
        }}
      />
      {isRoute && (
        <EdgeLabelRenderer>
          <div className={cn('af-elabel', state)} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {sourceHandleId}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

export const edgeTypes = {
  default: AnimatedEdge,
  smoothstep: AnimatedEdge,
} as const
