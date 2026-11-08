'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Centered dialog in the shell's style. `footer` renders a button row under the body. */
export function AfDialog({
  open, onOpenChange, title, description, width = 520, children, footer, className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  width?: number | string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="af-scrim" />
        <Dialog.Content className={cn('af-dlg', className)} style={{ width }}>
          <div className="af-dhead">
            <Dialog.Title className="af-dtitle">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="af-ibtn" aria-label="Close"><X size={15} /></button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{description ?? title}</Dialog.Description>
          <div className="af-dbody">{children}</div>
          {footer && <div className="af-dfoot">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
