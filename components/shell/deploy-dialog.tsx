'use client'

import { AfDialog } from './dialog'

/** Export is Phase 5; this previews the commands the export will print. */
export function DeployDialog({ open, onOpenChange, graphName }: { open: boolean; onOpenChange: (v: boolean) => void; graphName: string }) {
  const slug = graphName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'graph'
  return (
    <AfDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export as a service"
      footer={<>
        <span className="af-sp" />
        <button className="af-btn ghost" onClick={() => onOpenChange(false)}>Close</button>
        <button className="af-btn primary" disabled title="Export ships in Phase 5">Download zip</button>
      </>}
    >
      <p style={{ margin: '0 0 10px', color: 'var(--text-2)' }}>
        The export bundles <code className="af-mono">graph.py</code>, a FastAPI wrapper and a Dockerfile. Run it anywhere with Docker:
      </p>
      <pre className="af-cmds">{`docker build -t agentforge-${slug} .\ndocker run -p 8080:8080 --env-file .env agentforge-${slug}`}</pre>
      <p className="af-hint" style={{ marginTop: 10 }}>Export ships in Phase 5. Kubernetes/Helm is out of scope for v1.</p>
    </AfDialog>
  )
}
