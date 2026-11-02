'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Code2, Copy, Check, X, AlertTriangle } from 'lucide-react'
import { useGraphStore } from '@/store/graph-store'
import { CodeEditor } from './code-editor'

type Result =
  | { status: 'loading' }
  | { status: 'ok'; code: string }
  | { status: 'error'; message: string }

/** Modal showing the LangGraph Python generated from the current (possibly unsaved) canvas. */
export function CodePreview({ graphId, open, onOpenChange }: { graphId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [result, setResult] = useState<Result>({ status: 'loading' })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const { nodes, edges } = useGraphStore.getState()
    fetch(`/api/graphs/${graphId}/transpile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graphJson: { nodes, edges } }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (cancelled) return
        setResult(res.ok ? { status: 'ok', code: data.code } : { status: 'error', message: data.error ?? `HTTP ${res.status}` })
      })
      .catch(() => { if (!cancelled) setResult({ status: 'error', message: 'Could not reach the server.' }) })
    return () => {
      cancelled = true
      setResult({ status: 'loading' })
    }
  }, [open, graphId])

  const copy = async () => {
    if (result.status !== 'ok') return
    await navigator.clipboard.writeText(result.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-[900px] h-[85vh] flex flex-col overflow-hidden"
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '14px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center gap-3 flex-shrink-0">
            <Code2 size={14} className="text-[#9B8AFF]" />
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-[15px] font-semibold text-[var(--text-primary)] leading-none" style={{ fontFamily: 'Syne, sans-serif' }}>
                Generated code
              </Dialog.Title>
              <Dialog.Description className="text-[10px] text-[var(--text-ghost)] mt-1 font-mono">
                LangGraph Python for the current canvas (including unsaved changes)
              </Dialog.Description>
            </div>
            {result.status === 'ok' && (
              <button onClick={copy} className="af-btn af-btn-save">
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <Dialog.Close asChild>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-ghost)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-all"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-4">
            {result.status === 'loading' && <p className="text-[12px] text-[var(--text-muted)]">Generating…</p>}
            {result.status === 'error' && (
              <div className="flex gap-2 items-start p-3 rounded-lg border border-[#FF6B81]/20 bg-[#FF6B81]/5">
                <AlertTriangle size={14} className="text-[#FF6B81] flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-[var(--text-secondary)]">{result.message}</p>
              </div>
            )}
            {result.status === 'ok' && (
              <CodeEditor value={result.code} onChange={() => {}} language="python" readOnly minHeight="100%" maxHeight="none" />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
