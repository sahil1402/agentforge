'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type Listener = (message: string) => void
const listeners = new Set<Listener>()

/** Show a short confirmation ("Saved v8", "Copied"). One at a time; the newest wins. */
export function toast(message: string) {
  listeners.forEach((l) => l(message))
}

export function Toaster() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const listener: Listener = (m) => {
      setMessage(m)
      clearTimeout(timer)
      timer = setTimeout(() => setMessage(null), 1800)
    }
    listeners.add(listener)
    return () => { listeners.delete(listener); clearTimeout(timer) }
  }, [])
  return (
    <div className={cn('af-toast', message && 'on')} role="status" aria-live="polite">
      {message}
    </div>
  )
}
