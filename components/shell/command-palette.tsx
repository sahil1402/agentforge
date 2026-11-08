'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Search, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Command {
  id: string
  group: string
  label: string
  keys?: string[]
  Icon?: LucideIcon
  run: () => void
}

/** Subsequence match; a substring match ranks first. */
function score(query: string, label: string): number {
  const q = query.toLowerCase()
  const s = label.toLowerCase()
  if (!q) return 1
  if (s.includes(q)) return 3
  let i = 0
  for (const ch of s) if (ch === q[i]) i++
  return i === q.length ? 1 : 0
}

export function CommandPalette({ open, onOpenChange, commands }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: Command[]
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="af-scrim" />
        <Dialog.Content className="af-dlg af-cmd" aria-label="Command palette">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Search for an action, a node or a graph.</Dialog.Description>
          {/* Content unmounts when closed, so the search starts empty every time. */}
          <PaletteBody commands={commands} close={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PaletteBody({ commands, close }: { commands: Command[]; close: () => void }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(
    () => commands.map((c) => ({ c, s: score(query, c.label) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.c).slice(0, 24),
    [commands, query],
  )
  const current = Math.min(index, Math.max(0, visible.length - 1))

  useEffect(() => {
    listRef.current?.querySelector('.af-cmd-item.on')?.scrollIntoView({ block: 'nearest' })
  }, [current, visible])

  const run = (c: Command | undefined) => { if (!c) return; close(); c.run() }

  return (
    <>
      <label className="af-search">
        <Search size={14} />
        <input
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIndex(0) }}
          placeholder="Type a command or search…"
          aria-label="Search commands"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(Math.min(visible.length - 1, current + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(Math.max(0, current - 1)) }
            else if (e.key === 'Enter') { e.preventDefault(); run(visible[current]) }
          }}
        />
      </label>
      <div className="af-cmd-list" ref={listRef}>
        {visible.length === 0 && <div className="af-empty">No matching command.</div>}
        {visible.map((c, i) => {
          const Icon = c.Icon
          return (
            <div key={c.id}>
              {(i === 0 || visible[i - 1].group !== c.group) && <div className="af-cmd-group">{c.group}</div>}
              <button className={cn('af-cmd-item', i === current && 'on')} onMouseEnter={() => setIndex(i)} onClick={() => run(c)}>
                <span className="ic">{Icon && <Icon size={14} />}</span>
                <span>{c.label}</span>
                {c.keys && <span className="k">{c.keys.map((k) => <kbd key={k} className="af-kbd">{k}</kbd>)}</span>}
              </button>
            </div>
          )
        })}
      </div>
      <div className="af-cmd-foot">
        <span><kbd className="af-kbd">↑</kbd><kbd className="af-kbd">↓</kbd> navigate</span>
        <span><kbd className="af-kbd">↵</kbd> run</span>
        <span><kbd className="af-kbd">esc</kbd> close</span>
      </div>
    </>
  )
}
