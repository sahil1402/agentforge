'use client'

import { useCallback, useRef, useEffect } from 'react'
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, type ReactFlowInstance, type OnConnectStartParams, SelectionMode } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '@/store/graph-store'
import { nodeTypes } from './nodes'
import { edgeTypes } from './edges'
import type { NodeType } from '@/lib/types'
import { NODE_COLORS } from '@/lib/types'

// ─── Canvas ───────────────────────────────────────────────────────────────────

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

  // Drop handler — allows dragging node types from the sidebar palette
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

  // Deselect when clicking the canvas background
  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])

  // Track connect-start so we know which node initiated a connection
  const onConnectStart = useCallback((_: unknown, { nodeId }: OnConnectStartParams) => {
    connectingNodeId.current = nodeId ?? null
  }, [])

  const onConnectEnd = useCallback(() => {
    connectingNodeId.current = null
  }, [])

  return (
    <div className="w-full h-full" onDragOver={onDragOver} onDrop={onDrop}>
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
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
        selectionMode={SelectionMode.Partial}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
        className="bg-transparent"
      >
        {/* Dot grid background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(255,255,255,0.06)"
        />

        {/* Controls — zoom in/out/fit */}
        <Controls
          className="!bg-[#0F1220] !border-white/[0.07] !shadow-xl"
          showInteractive={false}
        />

        {/* MiniMap */}
        <MiniMap
          nodeColor={(node) => {
            const type = node.type as NodeType
            return NODE_COLORS[type]?.dot ?? '#5C6280'
          }}
          maskColor="rgba(5,6,10,0.75)"
          className="!bg-[#0D1017] !border-white/[0.07] !rounded-xl overflow-hidden"
        />
      </ReactFlow>
    </div>
  )
}
