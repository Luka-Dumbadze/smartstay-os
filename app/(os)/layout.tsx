import type { ReactNode } from 'react'

/** Web OS route group: full-viewport desktop surface. Chrome (rail, header, dock) is rendered by <OsShell>. */
export default function OsLayout({ children }: { children: ReactNode }) {
  return <div className="h-dvh min-h-[640px] overflow-hidden">{children}</div>
}
