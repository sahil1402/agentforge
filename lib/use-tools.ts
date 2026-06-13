'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type Tool = {
  id: string
  name: string
  description: string
  category: string // 'builtin' | 'custom'
  paramSchema: Record<string, unknown>
  returnSchema: Record<string, unknown> | null
  code: string
  createdAt?: string
  updatedAt?: string
}

// ─── Module-level cache ──────────────────────────────────────────────────────

let toolsCache: Tool[] | null = null
let toolsFetchPromise: Promise<Tool[]> | null = null
const subscribers = new Set<() => void>()

function notifySubscribers() {
  subscribers.forEach((cb) => cb())
}

export function fetchTools(force = false): Promise<Tool[]> {
  if (force) {
    toolsCache = null
    toolsFetchPromise = null
  }
  if (!toolsFetchPromise) {
    toolsFetchPromise = fetch('/api/tools')
      .then((r) => r.json())
      .then((data: Tool[]) => {
        toolsCache = data
        notifySubscribers()
        return data
      })
  }
  return toolsFetchPromise
}

export function invalidateToolsCache() {
  toolsCache = null
  toolsFetchPromise = null
  // Trigger a refetch + notify
  fetchTools()
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTools() {
  const [tools, setTools] = useState<Tool[]>(toolsCache ?? [])
  const [loading, setLoading] = useState(!toolsCache)

  useEffect(() => {
    let cancelled = false

    const sync = () => {
      if (cancelled) return
      if (toolsCache) {
        setTools(toolsCache)
        setLoading(false)
      }
    }

    subscribers.add(sync)

    fetchTools().then(() => {
      if (cancelled) return
      sync()
    })

    return () => {
      cancelled = true
      subscribers.delete(sync)
    }
  }, [])

  const refetch = useCallback(() => fetchTools(true), [])

  return { tools, loading, refetch }
}