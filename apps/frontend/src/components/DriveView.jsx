import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, ChevronLeft, FileText, Film, Hash, Image, LayoutGrid, List, Search, ShieldCheck, Wine, X } from 'lucide-react'
import { TZ, ViewTitle, cx } from '../App.jsx'

// The two approved knowledge documents mirror the seeded kb.documents rows the AI team retrieves from.
// Live provenance (hash, retrieval time) is attached when a reasoning session has cited them.
const CELLAR = {
  id: 'cellar', name: 'Cellar & Wine List', ext: 'v3', kind: 'wine', size: '3 entries', approved: 'Ana Jorjadze (GM delegate)', knowledge: true,
  entries: [
    { item: 'Saperavi 2022 Estate Reserve', desc: 'Qvevri-aged dry red from Kakheti', price: 90, allergens: ['sulphites'], verified: true },
    { item: 'Rkatsiteli 2023 Amber', desc: 'Skin-contact white', price: 65, allergens: ['sulphites'], verified: true },
    { item: 'Kindzmarauli 2021', desc: 'Semi-sweet red', price: 70, allergens: ['sulphites'], verified: true },
  ],
}
const POLICY = {
  id: 'policy', name: 'Guest Services Policy', ext: 'v5', kind: 'policy', size: '3 clauses', approved: 'Levan Beridze', knowledge: true,
  clauses: [
    'Check-out is at 12:00. Late checkout until 14:00 is free for Gold members, subject to availability confirmed by the front desk.',
    'Wine tastings and cellar tours can be cancelled free of charge up to 24 hours before the start time.',
    'Extra towels, pillows and bathrobes are complimentary and delivered by housekeeping within 30 minutes.',
  ],
}
const f = (name, kind, size) => ({ id: name, name, kind, size })
const FOLDERS = [
  { key: 'documents', name: 'Documents', files: [f('Staff handbook 2026', 'doc', '1.2 MB'), f('Emergency procedures', 'doc', '340 KB'), f('Supplier contacts', 'doc', '88 KB')] },
  { key: 'cellar', name: 'Menus & Cellar', files: [CELLAR, f('Restaurant menu - autumn', 'doc', '2.1 MB'), f('Qvevri tasting flight', 'doc', '410 KB')] },
  { key: 'about', name: 'About Company', files: [f('Brand guidelines', 'doc', '6.4 MB'), f('Chateau history', 'doc', '720 KB')] },
  { key: 'projects', name: 'Projects', files: [f('Harvest festival 2026', 'doc', '1.5 MB'), f('Spa renovation plan', 'doc', '3.3 MB')] },
  { key: 'policies', name: 'Policies', files: [POLICY, f('Privacy notice (GDPR)', 'doc', '190 KB'), f('Cancellation terms', 'doc', '120 KB')] },
  { key: 'media', name: 'Media', files: [f('Vineyard at dusk', 'image', '4.8 MB'), f('Qvevri cellar tour', 'video', '82 MB'), f('Deluxe room 12', 'image', '3.9 MB')] },
]

export default function DriveView({ ctx }) {
  const [folder, setFolder] = useState(null)
  const [file, setFile] = useState(null)
  const [q, setQ] = useState('')
  const [layout, setLayout] = useState('grid')
  // latest live citation of a knowledge document (from the AI team's reasoning steps)
  const citation = useMemo(() => [...ctx.steps].reverse().find((s) => s.detail?.citation)?.detail.citation, [ctx.steps])
  const current = FOLDERS.find((x) => x.key === folder)
  const results = q ? FOLDERS.flatMap((fo) => fo.files.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).map((x) => ({ ...x, folder: fo.name }))) : null

  return (
    <div className="mx-auto max-w-6xl space-y-5 pt-2">
      <ViewTitle crumb={current ? ['Drive', current.name] : ['Drive']} sub={current ? `${current.files.length} items` : 'Files, media and approved knowledge for Chateau Telavi'}
        right={
          <div className="flex items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in Drive" className="input w-64 py-2 pl-9 text-[13px]" />
            </label>
            <div className="flex rounded-xl bg-fg/[0.05] p-1 ring-1 ring-line">
              {[['grid', LayoutGrid], ['list', List]].map(([k, I]) => (
                <button key={k} onClick={() => setLayout(k)} aria-label={`${k} layout`} className={cx('grid size-7 place-items-center rounded-lg transition', layout === k ? 'bg-card text-fg shadow ring-1 ring-line' : 'text-fg-3')}><I className="size-4" /></button>
              ))}
            </div>
          </div>
        } />

      {current && !results && (
        <button onClick={() => setFolder(null)} className="btn btn-soft"><ChevronLeft className="size-4" /> All folders</button>
      )}

      {results ? (
        <FileList files={results} layout="list" onOpen={setFile} showFolder empty="No files match your search." />
      ) : current ? (
        <FileList files={current.files} layout={layout} onOpen={setFile} />
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {FOLDERS.map((fo, i) => (
            <button key={fo.key} onClick={() => setFolder(fo.key)} style={{ animationDelay: `${i * 40}ms` }}
              className="group flex animate-rise flex-col items-center gap-2 rounded-2xl p-2 transition hover:bg-fg/[0.04]">
              <FolderIcon className="w-full max-w-[150px] transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-[1.03]" badge={fo.files.some((x) => x.knowledge)} />
              <div className="text-center">
                <div className="text-[13.5px] font-semibold">{fo.name}</div>
                <div className="text-[11.5px] text-fg-3">{fo.files.length} items</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {file && <FilePreview file={file} citation={citation} onClose={() => setFile(null)} />}
    </div>
  )
}

function FolderIcon({ className, badge }) {
  return (
    <span className={cx('relative block', className)}>
      <svg viewBox="0 0 120 92" className="w-full drop-shadow-[0_14px_20px_rgb(88_28_235/0.35)]">
        <defs>
          <linearGradient id="fb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7c3aed" /><stop offset="1" stopColor="#5b21b6" /></linearGradient>
          <linearGradient id="ff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
        </defs>
        <path d="M8 6h34c3 0 5 1 7 3l6 6h57c4 0 8 4 8 8v61c0 4-4 8-8 8H8c-4 0-8-4-8-8V14c0-4 4-8 8-8z" fill="url(#fb)" />
        <rect x="0" y="24" width="120" height="68" rx="8" fill="url(#ff)" />
        <rect x="0" y="24" width="120" height="1.5" fill="white" opacity="0.35" />
      </svg>
      {badge && <span className="absolute right-2 bottom-2 grid size-6 place-items-center rounded-full bg-white shadow"><BadgeCheck className="size-4 text-violet-600" /></span>}
    </span>
  )
}

const KIND = { wine: [Wine, 'bg-gradient-to-br from-[#b3395b] to-[#6b1d35]'], policy: [ShieldCheck, 'bg-gradient-to-br from-[#30d158] to-[#0a84ff]'], doc: [FileText, 'bg-gradient-to-br from-[#64d2ff] to-[#0a84ff]'], image: [Image, 'bg-gradient-to-br from-[#ff9f0a] to-[#ff375f]'], video: [Film, 'bg-gradient-to-br from-[#bf5af2] to-[#5e5ce6]'] }

function FileList({ files, layout, onOpen, showFolder, empty }) {
  if (!files.length) return <div className="card px-4 py-10 text-center text-[13px] text-fg-3">{empty}</div>
  if (layout === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {files.map((x, i) => {
          const [I, bg] = KIND[x.kind] || KIND.doc
          return (
            <button key={x.id} onClick={() => onOpen(x)} style={{ animationDelay: `${i * 35}ms` }} className="card card-hover animate-rise p-4 text-left">
              <div className={cx('grid h-24 place-items-center rounded-xl text-white', bg)}><I className="size-8" /></div>
              <div className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold"><span className="truncate">{x.name}</span>{x.ext && <span className="text-fg-3">{x.ext}</span>}</div>
              <div className="flex items-center gap-1.5 text-[11.5px] text-fg-3">{x.size}{x.knowledge && <span className="pill tone-ok py-0 text-[10px]"><BadgeCheck className="size-3" /> approved</span>}</div>
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {files.map((x) => {
        const [I, bg] = KIND[x.kind] || KIND.doc
        return (
          <button key={x.id + (x.folder || '')} onClick={() => onOpen(x)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-fg/[0.03]">
            <span className={cx('grid size-9 place-items-center rounded-lg text-white', bg)}><I className="size-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{x.name} {x.ext && <span className="text-fg-3">{x.ext}</span>}</span>{showFolder && <span className="text-[11.5px] text-fg-3">{x.folder}</span>}</span>
            {x.knowledge && <span className="pill tone-ok"><BadgeCheck className="size-3" /> approved knowledge</span>}
            <span className="w-16 text-right text-[12px] text-fg-3">{x.size}</span>
          </button>
        )
      })}
    </div>
  )
}

function FilePreview({ file, citation, onClose }) {
  const [I, bg] = KIND[file.kind] || KIND.doc
  const liveHit = citation && citation.document === file.name ? citation : null
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="fixed inset-0 z-40 grid animate-fade place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card max-h-[86vh] w-full max-w-xl animate-pop overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className={cx('grid size-10 place-items-center rounded-xl text-white', bg)}><I className="size-5" /></span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[15px] font-semibold">{file.name} {file.ext && <span className="text-fg-3">{file.ext}</span>}</div>
            <div className="text-[11.5px] text-fg-3">{file.knowledge ? `Approved by ${file.approved} · active` : file.size}</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          {file.entries && file.entries.map((e) => (
            <div key={e.item} className={cx('rounded-2xl p-4 ring-1', e.item.startsWith('Saperavi') ? 'bg-gradient-to-br from-[#b3395b]/15 to-transparent ring-[#b3395b]/30' : 'bg-fg/[0.03] ring-line')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[14px] font-semibold">{e.item}</div>
                  <div className="text-[12px] text-fg-3">{e.desc}</div>
                </div>
                <div className="text-right"><div className="text-xl font-semibold tabular-nums">{e.price} <span className="text-[12px] font-medium text-fg-3">GEL</span></div><div className="text-[10.5px] text-fg-3">per 750 ml bottle</div></div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.allergens.map((a) => <span key={a} className="pill tone-warn">contains {a}</span>)}
                {e.verified && <span className="pill tone-ok"><BadgeCheck className="size-3" /> price & allergens verified</span>}
              </div>
            </div>
          ))}
          {file.clauses && file.clauses.map((c, i) => (
            <div key={i} className="flex gap-3 rounded-2xl bg-fg/[0.03] p-3.5 text-[13px] ring-1 ring-line"><span className="font-mono text-[11px] text-fg-3">§{i + 1}</span>{c}</div>
          ))}
          {!file.knowledge && (
            <div className="grid h-40 place-items-center rounded-2xl bg-fg/[0.03] text-center text-[12.5px] text-fg-3 ring-1 ring-line">
              <div><I className="mx-auto mb-2 size-7" />Preview file · {file.size}<br />Not indexed as approved knowledge</div>
            </div>
          )}
          {file.knowledge && (
            <div className="rounded-2xl bg-fg/[0.04] px-4 py-3 text-[11.5px] text-fg-2">
              {liveHit ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-300"><ShieldCheck className="size-3.5" /> Retrieved live by the AI team</div>
                  <div>Version {liveHit.document_version} · approved {new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(liveHit.approved_at))} · valid until {new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(liveHit.valid_until))}</div>
                  <div className="flex items-center gap-1 font-mono text-fg-3"><Hash className="size-3" /> sha256 {liveHit.content_sha256?.slice(0, 20)}…</div>
                </div>
              ) : (
                <>Approved knowledge used by the AI team for grounded replies. Run a guest inquiry to see a live retrieval with its content hash.</>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
