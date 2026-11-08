'use client'

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { ReactFlow, Background, BackgroundVariant, useReactFlow, useOnViewportChange, SelectionMode } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Minus, Plus, Maximize } from 'lucide-react'
import { useGraphStore } from '@/store/graph-store'
import { nodeTypes } from './nodes'
import { edgeTypes } from './edges'
import type { NodeType } from '@/lib/types'

export interface CanvasHandle {
  /** Add a node at the center of the visible canvas (rail click, command palette). */
  addAtCenter: (type: NodeType) => void
  fitView: () => void
  focusNode: (id: string) => void
}

const Canvas = forwardRef<CanvasHandle>(function Canvas(_, ref) {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const { onNodesChange, onEdgesChange, onConnect, addNode, setSelectedNode } = useGraphStore.getState()
  const rf = useReactFlow()
  const wrap = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  useOnViewportChange({ onChange: (v) => setZoom(v.zoom) })

  useImperativeHandle(ref, () => ({
    addAtCenter: (type) => {
      const r = wrap.current?.getBoundingClientRect()
      if (!r) return
      const p = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
      addNode(type, { x: p.x - 124 + (Math.random() * 40 - 20), y: p.y - 40 + (Math.random() * 40 - 20) })
    },
    fitView: () => rf.fitView({ padding: 0.2, duration: 200 }),
    focusNode: (id) => {
      const n = useGraphStore.getState().nodes.find((x) => x.id === id)
      if (n) rf.setCenter(n.position.x + 124, n.position.y + 50, { zoom: rf.getZoom(), duration: 200 })
    },
  }), [rf, addNode])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/agentforge-node') as NodeType
    if (!type) return
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode(type, { x: p.x - 124, y: p.y - 20 })
  }, [rf, addNode])

  return (
    <div
      ref={wrap}
      className="af-stage"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => setSelectedNode(n.id)}
        onPaneClick={() => setSelectedNode(null)}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.15 }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={['Delete', 'Backspace']}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="var(--grid)" />
      </ReactFlow>
      {nodes.length === 0 && (
        <div className="af-canvas-empty">
          <div><b>Empty graph</b>Drag a node type from the rail on the left, or press <kbd className="af-kbd">⌘K</kbd> and choose “Add agent”.</div>
        </div>
      )}
      <div className="af-zoomctl">
        <button className="af-ibtn" aria-label="Zoom out" onClick={() => rf.zoomOut({ duration: 150 })}><Minus size={14} /></button>
        <span className="z">{Math.round(zoom * 100)}%</span>
        <button className="af-ibtn" aria-label="Zoom in" onClick={() => rf.zoomIn({ duration: 150 })}><Plus size={14} /></button>
        <button className="af-ibtn" aria-label="Fit to view" onClick={() => rf.fitView({ padding: 0.2, duration: 200 })}><Maximize size={13} /></button>
      </div>
    </div>
  )
})

export default Canvas
