'use client'

import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { useGraphStore } from '@/store/graph-store'
import { cn } from '@/lib/utils'

export const AnimatedEdge = memo(function AnimatedEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  source, target,
  selected,
  label,
  markerEnd,
}: EdgeProps) {
  const { activeNodeIds, completedNodeIds } = useGraphStore()

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const isSourceActive  = activeNodeIds.has(source)
  const isTargetActive  = activeNodeIds.has(target)
  const isLive          = isSourceActive || isTargetActive
  const isCompleted     = completedNodeIds.has(source) && !isSourceActive

  const strokeColor = isLive
    ? 'rgba(15,217,138,0.6)'
    : isCompleted
    ? 'rgba(139,127,254,0.4)'
    : 'rgba(255,255,255,0.12)'

  const strokeWidth = isLive ? 2 : selected ? 1.5 : 1

  return (
    <>
      {/* Glow layer for active edges */}
      {isLive && (
        <path
          d={edgePath}
          fill="none"
          stroke="rgba(15,217,138,0.15)"
          strokeWidth={6}
          strokeLinecap="round"
        />
      )}

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: isCompleted ? 'none' : isLive ? 'none' : '5 4',
          transition: 'stroke 0.3s, stroke-width 0.3s',
        }}
      />

      {/* Animated dot flowing along edge when active */}
      {isLive && (
        <circle r="3" fill="rgba(15,217,138,0.9)">
          <animateMotion dur="1.6s" repeatCount="indefinite" rotate="auto">
            <mpath href={`#${id}`} />
          </animateMotion>
        </circle>
      )}

      {/* Hidden path for animateMotion reference */}
      {isLive && (
        <path id={id} d={edgePath} fill="none" stroke="none" />
      )}

      {/* Edge label */}
      {label && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'absolute font-mono text-[9px] px-1.5 py-0.5 rounded pointer-events-none',
              'bg-[#0F1220] border border-white/10 text-[#5C6280]',
              isLive && 'border-[#0FD98A]/30 text-[#0FD98A]/70',
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

export const edgeTypes = {
  default:    AnimatedEdge,
  smoothstep: AnimatedEdge,
} as const
