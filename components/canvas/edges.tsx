'use client'

import { memo, useMemo } from 'react'
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
    ? '#00E5C3'
    : isCompleted
    ? 'rgba(155, 138, 255, 0.45)'
    : selected
    ? 'rgba(255, 255, 255, 0.2)'
    : 'rgba(255, 255, 255, 0.08)'

  const strokeWidth = isLive ? 2 : selected ? 1.8 : 1

  // Generate unique gradient IDs for this edge
  const gradientId = `edge-grad-${id}`
  const glowFilterId = `edge-glow-${id}`

  return (
    <>
      {/* SVG Defs for gradients and filters */}
      <defs>
        {isLive && (
          <>
            <linearGradient id={gradientId} gradientUnits="userSpaceOnUse"
              x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}
            >
              <stop offset="0%" stopColor="#00E5C3" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#00E5C3" stopOpacity="1" />
              <stop offset="100%" stopColor="#5CA4FF" stopOpacity="0.8" />
            </linearGradient>
            <filter id={glowFilterId}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </>
        )}
        {isCompleted && (
          <linearGradient id={gradientId} gradientUnits="userSpaceOnUse"
            x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}
          >
            <stop offset="0%" stopColor="#9B8AFF" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#9B8AFF" stopOpacity="0.25" />
          </linearGradient>
        )}
      </defs>

      {/* Outer glow layer for active edges */}
      {isLive && (
        <path
          d={edgePath}
          fill="none"
          stroke="rgba(0, 229, 195, 0.08)"
          strokeWidth={8}
          strokeLinecap="round"
          filter={`url(#${glowFilterId})`}
        />
      )}

      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: (isLive || isCompleted) ? `url(#${gradientId})` : strokeColor,
          strokeWidth,
          strokeDasharray: !isLive && !isCompleted ? '6 5' : 'none',
          transition: 'stroke 0.35s ease, stroke-width 0.35s ease',
          strokeLinecap: 'round',
        }}
      />

      {/* Animated flow dots when active */}
      {isLive && (
        <>
          <path id={`motion-${id}`} d={edgePath} fill="none" stroke="none" />
          <circle r="2.5" fill="#00E5C3" opacity="0.9">
            <animateMotion dur="1.2s" repeatCount="indefinite" rotate="auto">
              <mpath href={`#motion-${id}`} />
            </animateMotion>
          </circle>
          <circle r="2" fill="#00E5C3" opacity="0.5">
            <animateMotion dur="1.2s" repeatCount="indefinite" rotate="auto" begin="0.4s">
              <mpath href={`#motion-${id}`} />
            </animateMotion>
          </circle>
          <circle r="1.5" fill="#00E5C3" opacity="0.3">
            <animateMotion dur="1.2s" repeatCount="indefinite" rotate="auto" begin="0.8s">
              <mpath href={`#motion-${id}`} />
            </animateMotion>
          </circle>
        </>
      )}

      {/* Completed checkmark dot */}
      {isCompleted && (
        <>
          <path id={`done-${id}`} d={edgePath} fill="none" stroke="none" />
          <circle r="2" fill="#9B8AFF" opacity="0.5">
            <animateMotion dur="2.5s" repeatCount="indefinite" rotate="auto">
              <mpath href={`#done-${id}`} />
            </animateMotion>
          </circle>
        </>
      )}

      {/* Edge label */}
      {label && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'absolute font-mono text-[8px] font-medium px-2 py-[3px] rounded-md pointer-events-none',
              'bg-[var(--surface-1)] border shadow-lg',
              isLive
                ? 'border-[#00E5C3]/20 text-[#00E5C3]/80'
                : 'border-white/[0.06] text-[var(--text-muted)]',
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              boxShadow: isLive
                ? '0 0 12px rgba(0,229,195,0.1), 0 2px 8px rgba(0,0,0,0.3)'
                : '0 2px 8px rgba(0,0,0,0.3)',
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
