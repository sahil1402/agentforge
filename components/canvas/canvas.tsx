'use client'

import { useCallback, useRef } from 'react'
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap,
  type ReactFlowInstance, type OnConnectStartParams, SelectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '@/store/graph-store'
import { nodeTypes } from './nodes'
import { edgeTypes } from './edges'
import type { NodeType } from '@/lib/types'
import { NODE_COLORS } from '@/lib/types'

export default function Canvas() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    addNode, setSelectedNode,
  } = useGraphStore()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rfInstance = useRef<any>(null)
  const connectingNodeId = useRef<string | null>(null)

  const onInit = useCallback((instance: ReactFlowInstance<any, any>) => {
    rfInstance.current = instance
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!rfInstance.current) return

      const type = e.dataTransfer.getData('application/agentforge-node') as NodeType
      if (!type) return

      const position = rfInstance.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      })
      addNode(type, position)
    },
    [addNode]
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])

  const onConnectStart = useCallback((_: unknown, { nodeId }: OnConnectStartParams) => {
    connectingNodeId.current = nodeId ?? null
  }, [])

  const onConnectEnd = useCallback(() => {
    connectingNodeId.current = null
  }, [])

  return (
    <div className="w-full h-full relative" onDragOver={onDragOver} onDrop={onDrop}>
      {/* Atmospheric background glow */}
      <div className="canvas-atmosphere" />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onPaneClick={onPaneClick}
        onInit={onInit}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
        selectionMode={SelectionMode.Partial}
        proOptions={{ hideAttribution: true }}
        minZoom={0.15}
        maxZoom={2.5}
        className="bg-transparent"
        connectionLineStyle={{
          stroke: 'rgba(155, 138, 255, 0.4)',
          strokeWidth: 2,
          strokeDasharray: '6 4',
        }}
      >
        {/* Dot grid — finer, more subtle */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={32}
          size={0.8}
          color="rgba(255,255,255,0.04)"
        />

        {/* Controls */}
        <Controls
          className="!bg-[var(--surface-1)] !border-[var(--border-subtle)] !shadow-xl !rounded-[10px]"
          showInteractive={false}
          position="bottom-left"
        />

        {/* MiniMap */}
        <MiniMap
          nodeColor={(node) => {
            const type = node.type as NodeType
            return NODE_COLORS[type]?.primary ?? '#4A5068'
          }}
          maskColor="rgba(4, 6, 12, 0.8)"
          className="!bg-[var(--surface-1)] !border-[var(--border-subtle)] !rounded-[14px] overflow-hidden"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  )
}
