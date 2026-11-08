'use client'

import Link from 'next/link'
import { useSyncExternalStore, type CSSProperties } from 'react'
import { useTheme } from 'next-themes'
import {
  LayoutGrid, Workflow, Activity, FlaskConical, Wrench, Code2, Rocket,
  Sun, Moon, Monitor, Command, Bot, Database, GitBranch, UserCheck, type LucideIcon,
} from 'lucide-react'
import { NODE_HUE, NODE_LABELS, NODE_DESCRIPTIONS, type NodeType } from '@/lib/types'
import { cn } from '@/lib/utils'

export type RailSection = 'library' | 'canvas' | 'runs' | 'tests' | 'tools' | 'code' | 'deploy'

export const NODE_ICONS: Record<NodeType, LucideIcon> = {
  agent: Bot, tool: Wrench, memory: Database, router: GitBranch, human_gate: UserCheck,
}

const SECTIONS: Array<{ id: RailSection; Icon: LucideIcon; label: string; chord: string }> = [
  { id: 'library', Icon: LayoutGrid,   label: 'Library',        chord: 'L' },
  { id: 'canvas',  Icon: Workflow,     label: 'Canvas',         chord: 'C' },
  { id: 'runs',    Icon: Activity,     label: 'Runs',           chord: 'R' },
  { id: 'tests',   Icon: FlaskConical, label: 'Tests',          chord: 'T' },
  { id: 'tools',   Icon: Wrench,       label: 'Tool library',   chord: 'O' },
  { id: 'code',    Icon: Code2,        label: 'Generated code', chord: 'D' },
  { id: 'deploy',  Icon: Rocket,       label: 'Deploy',         chord: 'P' },
]

/**
 * The icon rail: sections at the top, node types to add (canvas only) under a divider, theme and the
 * command palette at the bottom. `disabled` sections (no graph open) are hidden.
 */
export function Rail({
  active, onNavigate, onAddNode, onCommand, sections = SECTIONS.map((s) => s.id),
}: {
  active: RailSection
  onNavigate: (section: RailSection) => void
  onAddNode?: (type: NodeType) => void
  onCommand: () => void
  sections?: RailSection[]
}) {
  return (
    <nav className="af-rail" aria-label="Sections">
      <Link href="/" className="af-mark" title="AgentForge">AF</Link>
      {SECTIONS.filter((s) => sections.includes(s.id)).map(({ id, Icon, label, chord }) => (
        <button
          key={id}
          className={cn('af-rbtn', active === id && 'on')}
          data-tip={`${label} · G ${chord}`}
          aria-label={label}
          onClick={() => onNavigate(id)}
        >
          <Icon size={17} />
        </button>
      ))}
      {onAddNode && (
        <>
          <div className="af-divider" />
          <span className="af-rail-sect">ADD</span>
          <div className="af-rail-ins">
            {(Object.keys(NODE_HUE) as NodeType[]).map((type) => {
              const Icon = NODE_ICONS[type]
              return (
                <button
                  key={type}
                  className="af-rbtn ins"
                  draggable
                  style={{ '--hue': NODE_HUE[type] } as CSSProperties}
                  data-tip={`${NODE_LABELS[type]} · ${NODE_DESCRIPTIONS[type]} · drag or click`}
                  aria-label={`Add ${NODE_LABELS[type]}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/agentforge-node', type)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => onAddNode(type)}
                >
                  <Icon size={17} />
                </button>
              )
            })}
          </div>
        </>
      )}
      <div className="af-sp" />
      <ThemeButton />
      <button className="af-rbtn" data-tip="Command palette · ⌘K" aria-label="Command palette" onClick={onCommand}>
        <Command size={16} />
      </button>
    </nav>
  )
}

const noop = () => () => {}

function ThemeButton() {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(noop, () => true, () => false) // the theme is unknown on the server
  const current = mounted ? theme ?? 'dark' : 'dark'
  const next = current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark'
  const Icon = current === 'dark' ? Moon : current === 'light' ? Sun : Monitor
  return (
    <button className="af-rbtn" data-tip={`Theme: ${current}`} aria-label={`Theme: ${current}`} onClick={() => setTheme(next)}>
      <Icon size={16} />
    </button>
  )
}
