'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { BadgeCheck, ChevronLeft, FileText, Hash, Loader2, Search, ShieldCheck, Sparkles, Wine, X } from 'lucide-react'
import { ViewTitle, cx, fmtDate, rangeUpper, type Chunk, type Doc, type OsContext } from './ui'

const FOLDERS = ['Documents', 'Menus & Cellar', 'About Company', 'Policies'] as const

type Hit = {
  chunk_id: string; document_id: string; document_title: string; document_version: number; approved_by: string | null
  content: string; structured: Chunk['structured']; content_sha256: string; score: number
}

/** Storage / RAG (App 4): Finder-style folders over kb.documents, chunk previews and hybrid semantic search. */
export default function DriveView({ ctx }: { ctx: OsContext }) {
  const { snap } = ctx
  const [folder, setFolder] = useState<string | null>(null)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ mode: string; results: Hit[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const folders = [...new Set([...FOLDERS, ...snap.documents.map((d) => d.folder)])]
  const docs = snap.documents.filter((d) => d.folder === folder)

  async function search(e: FormEvent) {
    e.preventDefault()
    if (!q.trim()) { setResults(null); return }
    setBusy(true)
    const r = await ctx.actions.post<{ mode: string; results: Hit[] }>('/api/knowledge/search', { query: q, space_id: snap.space.id })
    setResults(r)
    setBusy(false)
    if (r?.mode === 'hybrid') void ctx.actions.refresh()   // pick up embeddings written by the cron backfill
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pt-2">
      <ViewTitle crumb={folder ? ['Drive', folder] : ['Drive']}
        sub={folder ? `${docs.length} item${docs.length === 1 ? '' : 's'}` : 'Approved knowledge the AI team cites, plus property files'}
        right={
          <form onSubmit={search} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
            <input value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setResults(null) }} placeholder="Ask the knowledge base…" className="input w-72 py-2 pl-9 pr-9 text-[13px]" />
            {busy && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-fg-3" />}
          </form>
        } />

      {results ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[12px] text-fg-3">
            <Sparkles className="size-3.5 text-[#bf5af2]" /> {results.results.length} result{results.results.length === 1 ? '' : 's'} ·
            <span className={cx('pill', results.mode === 'hybrid' ? 'tone-violet' : 'tone-muted')}>{results.mode === 'hybrid' ? 'semantic + lexical' : 'lexical (no embedding)'}</span>
            <button onClick={() => { setResults(null); setQ('') }} className="ml-auto text-accent hover:underline">Clear</button>
          </div>
          {results.results.map((h) => (
            <button key={h.chunk_id} onClick={() => setDoc(snap.documents.find((d) => d.id === h.document_id) ?? null)} className="card flex w-full animate-rise items-start gap-3 p-4 text-left transition hover:bg-card-hover">
              <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl text-white', h.structured.item ? 'bg-gradient-to-br from-[#b3395b] to-[#6b1d35]' : 'bg-gradient-to-br from-[#30d158] to-[#0a84ff]')}>
                {h.structured.item ? <Wine className="size-4" /> : <ShieldCheck className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{h.structured.item ?? h.document_title}{h.structured.price_gel != null && <span className="ml-2 text-fg-2">{h.structured.price_gel} GEL</span>}</span>
                <span className="mt-0.5 block text-[12px] text-fg-2">{h.content}</span>
                <span className="mt-1 block text-[11px] text-fg-3">{h.document_title} v{h.document_version} · approved by {h.approved_by ?? '—'} · score {h.score.toFixed(4)}</span>
              </span>
            </button>
          ))}
          {!results.results.length && <div className="card p-6 text-center text-[13px] text-fg-3">No approved, currently valid knowledge matches.</div>}
        </div>
      ) : folder ? (
        <>
          <button onClick={() => setFolder(null)} className="btn btn-soft"><ChevronLeft className="size-4" /> All folders</button>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((d, i) => {
              const chunks = snap.chunks.filter((c) => c.document_id === d.id)
              const wine = d.kind === 'WINE_LIST'
              return (
                <button key={d.id} onClick={() => setDoc(d)} style={{ animationDelay: `${i * 35}ms` }} className="card animate-rise p-4 text-left transition hover:bg-card-hover">
                  <div className={cx('grid h-24 place-items-center rounded-xl text-white', wine ? 'bg-gradient-to-br from-[#b3395b] to-[#6b1d35]' : 'bg-gradient-to-br from-[#30d158] to-[#0a84ff]')}>
                    {wine ? <Wine className="size-8" /> : <FileText className="size-8" />}
                  </div>
                  <div className="mt-3 text-[13px] font-semibold">{d.title} <span className="text-fg-3">v{d.version}</span></div>
                  <div className="flex items-center gap-1.5 text-[11.5px] text-fg-3">
                    {chunks.length} entries
                    {d.state === 'APPROVED_ACTIVE' && <span className="pill tone-ok py-0 text-[10px]"><BadgeCheck className="size-3" /> approved</span>}
                  </div>
                </button>
              )
            })}
            {!docs.length && <div className="card col-span-full p-8 text-center text-[13px] text-fg-3">This folder is empty. Approved documents added to kb.documents with folder “{folder}” appear here.</div>}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          {folders.map((f, i) => {
            const count = snap.documents.filter((d) => d.folder === f).length
            const approved = snap.documents.some((d) => d.folder === f && d.state === 'APPROVED_ACTIVE')
            return (
              <button key={f} onClick={() => setFolder(f)} style={{ animationDelay: `${i * 40}ms` }} className="group flex animate-rise flex-col items-center gap-2 rounded-2xl p-2 transition hover:bg-white/[0.04]">
                <FolderIcon badge={approved} />
                <div className="text-center">
                  <div className="text-[13.5px] font-semibold">{f}</div>
                  <div className="text-[11.5px] text-fg-3">{count} item{count === 1 ? '' : 's'}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {doc && <DocPreview ctx={ctx} doc={doc} onClose={() => setDoc(null)} />}
    </div>
  )
}

function FolderIcon({ badge }: { badge: boolean }) {
  return (
    <span className="relative block w-full max-w-[150px] transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-[1.03]">
      <svg viewBox="0 0 120 92" className="w-full drop-shadow-[0_14px_20px_rgba(88,28,235,0.35)]">
        <defs>
          <linearGradient id="folder-back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7c3aed" /><stop offset="1" stopColor="#5b21b6" /></linearGradient>
          <linearGradient id="folder-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
        </defs>
        <path d="M8 6h34c3 0 5 1 7 3l6 6h57c4 0 8 4 8 8v61c0 4-4 8-8 8H8c-4 0-8-4-8-8V14c0-4 4-8 8-8z" fill="url(#folder-back)" />
        <rect x="0" y="24" width="120" height="68" rx="8" fill="url(#folder-front)" />
        <rect x="0" y="24" width="120" height="1.5" fill="white" opacity="0.35" />
      </svg>
      {badge && <span className="absolute bottom-2 right-2 grid size-6 place-items-center rounded-full bg-white shadow"><BadgeCheck className="size-4 text-violet-600" /></span>}
    </span>
  )
}

function DocPreview({ ctx, doc, onClose }: { ctx: OsContext; doc: Doc; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const chunks = ctx.snap.chunks.filter((c) => c.document_id === doc.id).sort((a, b) => a.ordinal - b.ordinal)
  const until = rangeUpper(doc.valid_during)
  const embedded = chunks.filter((c) => c.embedded_at).length
  return (
    <div className="fixed inset-0 z-40 grid animate-fade place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card max-h-[86vh] w-full max-w-xl animate-pop overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className={cx('grid size-10 place-items-center rounded-xl text-white', doc.kind === 'WINE_LIST' ? 'bg-gradient-to-br from-[#b3395b] to-[#6b1d35]' : 'bg-gradient-to-br from-[#30d158] to-[#0a84ff]')}>
            {doc.kind === 'WINE_LIST' ? <Wine className="size-5" /> : <FileText className="size-5" />}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[15px] font-semibold">{doc.title} <span className="text-fg-3">v{doc.version}</span></div>
            <div className="text-[11.5px] text-fg-3">{doc.state === 'APPROVED_ACTIVE' ? `Approved by ${doc.approved_by} · ${fmtDate(doc.approved_at)}` : doc.state.toLowerCase()}{until ? ` · valid until ${fmtDate(until)}` : ''}</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          {chunks.map((c) => {
            const s = c.structured
            return s.item ? (
              <div key={c.id} className={cx('rounded-2xl p-4 ring-1', s.item.startsWith('Saperavi') ? 'bg-gradient-to-br from-[#b3395b]/15 to-transparent ring-[#b3395b]/30' : 'bg-white/[0.03] ring-line')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-semibold">{s.item}</div>
                    <div className="text-[12px] text-fg-3">{s.notes ?? c.content.split('|')[1]?.trim()}</div>
                  </div>
                  {s.price_gel != null && <div className="text-right"><div className="text-xl font-semibold tabular-nums">{s.price_gel} <span className="text-[12px] font-medium text-fg-3">GEL</span></div><div className="text-[10.5px] text-fg-3">per {s.unit ?? 'item'}</div></div>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(s.allergens ?? []).map((a) => <span key={a} className="pill tone-warn">contains {a}</span>)}
                  {s.allergen_verified && <span className="pill tone-ok"><BadgeCheck className="size-3" /> price & allergens verified</span>}
                </div>
                <div className="mt-2 flex items-center gap-1 font-mono text-[10.5px] text-fg-3"><Hash className="size-3" /> sha256 {c.content_sha256.slice(0, 16)}… · {c.embedded_at ? 'embedded' : 'lexical only'}</div>
              </div>
            ) : (
              <div key={c.id} className="flex gap-3 rounded-2xl bg-white/[0.03] p-3.5 text-[13px] ring-1 ring-line">
                <span className="font-mono text-[11px] text-fg-3">§{c.ordinal}</span>
                <span className="flex-1">{c.content}</span>
              </div>
            )
          })}
          <div className="rounded-2xl bg-white/[0.04] px-4 py-3 text-[11.5px] text-fg-2">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-300"><ShieldCheck className="size-3.5" /> Grounding source</div>
            The AI team may only quote approved, currently valid versions of this document. {embedded}/{chunks.length} entries have vector embeddings (gemini-embedding-001, 768 dims); the rest are matched lexically.
          </div>
        </div>
      </div>
    </div>
  )
}
