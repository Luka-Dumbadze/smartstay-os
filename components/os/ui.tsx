import type { ReactNode } from 'react'
import {
  BrainCircuit, ChartColumn, Cloud, CodeXml, GitBranch, Headset, LayoutDashboard, LayoutGrid, MessageCircle, Users, UsersRound,
  type LucideIcon,
} from 'lucide-react'

// ------------------------------------------------------------------ row types (db/supabase_master_schema.sql)
export type Space = { id: string; property_code: string; name: string; region: string; timezone: string; lifecycle: string }
export type Staff = { id: string; space_id: string; display_name: string; role: string; user_id: string | null; enabled: boolean }
export type Room = { id: string; number: string; room_type: string; floor: string; cleaning_state: 'DIRTY' | 'CLEANING' | 'CLEAN'; version: number; updated_at: string }
export type Task = {
  id: string; conversation_id: string | null; session_id: string | null; category: 'housekeeping' | 'food_beverage' | 'maintenance' | 'front_desk'
  title: string; detail: string; room_id: string | null; quantity: number | null; priority: 'ROUTINE' | 'URGENT'
  status: 'QUEUED' | 'CLAIMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; state_version: number; assignee_id: string | null
  requires_staff_confirmation: boolean; due_at: string; created_at: string; completed_at: string | null
  required_sop_document_id: string | null; required_sop_version: number | null; arrival_deadline_at: string | null
}
export type Channel = { id: string; kind: 'telegram' | 'whatsapp' | 'web'; display_name: string; bot_username: string | null; enabled: boolean }
export type Conversation = {
  id: string; channel_id: string; external_chat_id: string; profile_id: string | null; state: 'AI_ACTIVE' | 'OPERATOR_LOCKED' | 'RESOLVED'
  owner_staff_id: string | null; control_version: number; last_message_at: string | null; created_at: string
}
export type Chapter = { id: string; conversation_id: string; number: number; title: string; stay_id: string | null; opened_at: string; closed_at: string | null }
export type Message = {
  id: string; conversation_id: string; chapter_id: string | null; seq: number; direction: 'inbound' | 'outbound' | 'internal'
  author_kind: 'guest' | 'ai' | 'operator' | 'system'; author_name: string; body: string; evidence: { chunk_id?: string; document?: string }[]
  session_id: string | null; external_message_id: string | null; delivery_status: 'N/A' | 'PENDING' | 'SENT' | 'FAILED'; delivery_error: string | null; created_at: string
}
export type Profile = { id: string; full_name: string; locale: string; phone_e164: string | null; email: string | null; contact_verified_at: string | null; loyalty_tier: string | null; provisional: boolean; created_at: string }
export type Identity = { id: string; profile_id: string; channel: string; external_id: string; username: string | null; verified_at: string | null }
export type Stay = { id: string; profile_id: string; room_id: string; arrival_date: string; departure_date: string; status: string; source: string }
export type Preference = { id: string; profile_id: string; domain: string; label: string; value: string; sensitive: boolean; basis: string; evidence: string; status: string }
export type Doc = { id: string; doc_key: string; title: string; kind: string; folder: string; version: number; state: string; approved_by: string | null; approved_at: string | null; valid_during: string }
export type Structured = { item?: string; vintage?: number; price_gel?: number; unit?: string; allergens?: string[]; allergen_verified?: boolean; notes?: string; topic?: string }
export type Chunk = { id: string; document_id: string; ordinal: number; content: string; structured: Structured; content_sha256: string; embedded_at: string | null; embedding_model: string | null }
export type StaffCompetency = {
  id: string; space_id: string; staff_id: string; sop_document_id: string; sop_version: number
  status: 'NOT_TRAINED' | 'KNOWLEDGE_CHECK_PASSED' | 'SUPERVISED' | 'PRACTICALLY_APPROVED'
  quiz_score: number | null; quiz_attempts: number; quiz_completed_at: string | null; supervised_at: string | null
  supervised_by_staff_id: string | null; practical_approved_at: string | null; approved_by_staff_id: string | null
  created_at: string; updated_at: string
}
export type TrainingEvent = {
  id: string; space_id: string; task_id: string | null; target_staff_id: string; actor_staff_id: string
  sop_document_id: string; sop_version: number; event_type: string; details: Record<string, unknown>; created_at: string
}
export type Agent = { id: string; key: string; display_name: string; role: string; persona: string; instructions: string; model: string; thinking_level: 'low' | 'medium' | 'high'; enabled: boolean }
export type Session = {
  id: string; conversation_id: string; trigger_message_id: string; state: 'RUNNING' | 'COMPLETED' | 'HANDED_TO_HUMAN' | 'FAILED'
  reply_message_id: string | null; input_tokens: number; output_tokens: number; thinking_tokens: number; model_calls: number; error: string | null
  started_at: string; finished_at: string | null
}
export type Step = { id: string; session_id: string; seq: number; agent_key: string; kind: string; title: string; detail: Record<string, unknown>; created_at: string }
export type Kpis = {
  space_id: string; guests_in_house_or_arriving: number; open_tasks: number; rooms_ready: number; rooms_total: number; inbound_today: number
  ai_sessions_24h: number; handoffs_24h: number; avg_task_minutes_7d: number | null; tokens_24h: number
}
export type DailyMessages = { day: string; author_kind: string; direction: string; messages: number }
export type Throughput = { day: string; category: string; created: number; completed: number; avg_minutes: number | null }

export type Snapshot = {
  space: Space; staff: Staff[]; rooms: Room[]; tasks: Task[]; channels: Channel[]; conversations: Conversation[]; chapters: Chapter[]
  messages: Message[]; profiles: Profile[]; identities: Identity[]; stays: Stay[]; preferences: Preference[]; documents: Doc[]; chunks: Chunk[]
  competencies: StaffCompetency[]; trainingEvents: TrainingEvent[]; trainingSchemaReady: boolean
  agents: Agent[]; sessions: Session[]; steps: Step[]; kpis: Kpis | null; daily: DailyMessages[]; throughput: Throughput[]
}

export type ViewKey = 'home' | 'contact' | 'crm' | 'ops' | 'drive' | 'ai' | 'analytics' | 'builder' | 'store'

/** Actions every view can call. `post` returns parsed JSON or null (errors are toasted by the shell). */
export type OsActions = {
  post: <T = unknown>(path: string, body: unknown, okMessage?: string) => Promise<T | null>
  go: (view: ViewKey) => void
  toast: (text: string, tone?: 'ok' | 'error') => void
  refresh: () => Promise<void>
}

export type OsContext = {
  snap: Snapshot
  me: Staff
  live: 'connecting' | 'live' | 'polling'
  online: Set<string>
  actions: OsActions
}

// ------------------------------------------------------------------ helpers
export const TZ = 'Asia/Tbilisi'
export function cx(...a: (string | false | null | undefined)[]) { return a.filter(Boolean).join(' ') }
export function fmtTime(iso?: string | null, opts: Intl.DateTimeFormatOptions = {}) {
  return iso ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', ...opts }).format(new Date(iso)) : ''
}
export function fmtDate(d?: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  if (!d) return ''
  const date = d.length === 10 ? new Date(`${d}T00:00:00Z`) : new Date(d)
  return new Intl.DateTimeFormat('en-GB', { timeZone: d.length === 10 ? 'UTC' : TZ, ...opts }).format(date)
}
/** Upper bound of a Postgres tstzrange literal such as ["2026-09-22 10:00:00+00","2026-12-21 10:00:00+00"). */
export function rangeUpper(range: string): string | null {
  const m = range.match(/,\s*"?([^")\]]+)"?[)\]]$/)
  return m && m[1] !== '' ? m[1] : null
}
export const ROLE_LABEL: Record<string, string> = {
  FRONT_DESK_LEAD: 'Front desk lead', ROOM_ATTENDANT: 'Room attendant', HOUSEKEEPING_SUPERVISOR: 'Housekeeping supervisor',
  SOMMELIER: 'Sommelier', GENERAL_MANAGER: 'General manager',
}
export function initials(name = '') { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() }

const GRADIENTS: [string, string][] = [['#ff9f0a', '#ff375f'], ['#5e5ce6', '#bf5af2'], ['#30d158', '#0a84ff'], ['#64d2ff', '#5e5ce6'], ['#ff6482', '#bf5af2'], ['#ffd60a', '#ff9f0a'], ['#0a84ff', '#30b0c7']]

export function Avatar({ name, size = 32, online, dim, badge, className, gradient }: {
  name: string; size?: number; online?: boolean; dim?: boolean; badge?: ReactNode; className?: string; gradient?: [string, string]
}) {
  const h = [...(name || '?')].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 7)
  const [a, b] = gradient ?? GRADIENTS[h % GRADIENTS.length]
  return (
    <span className={cx('relative inline-grid shrink-0 place-items-center rounded-full font-semibold text-white transition-opacity', dim && 'opacity-45', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36), background: `linear-gradient(135deg, ${a}, ${b})` }}>
      {initials(name)}
      {online !== undefined && (
        <span className={cx('absolute -bottom-px -right-px rounded-full ring-2 ring-panel', online ? 'bg-emerald-400' : 'bg-fg-3')}
          style={{ width: Math.max(9, size * 0.3), height: Math.max(9, size * 0.3) }} />
      )}
      {badge}
    </span>
  )
}

export type AppDef = { key: ViewKey; title: string; desc: string; icon: LucideIcon; color: string; dockIcon: LucideIcon; dockColor: string; installed: boolean }

export const APPS: AppDef[] = [
  { key: 'contact', title: 'Contact Center', desc: 'Unifies calls, chats, email, and customer interactions', icon: Headset, color: 'bg-[#0a84ff] text-white', dockIcon: MessageCircle, dockColor: 'bg-gradient-to-br from-[#bf5af2] to-[#8944d8] text-white', installed: true },
  { key: 'crm', title: 'CRM', desc: 'Unifies customer data, history, and relationships', icon: Users, color: 'bg-[#ff9f0a] text-white', dockIcon: Users, dockColor: 'bg-gradient-to-br from-[#ffd60a] to-[#f5b400] text-white', installed: true },
  { key: 'drive', title: 'Storage', desc: 'Centralize files, media, and organizational resources', icon: Cloud, color: 'bg-[#ff453a] text-white', dockIcon: Cloud, dockColor: 'bg-gradient-to-br from-[#ff6961] to-[#e0302a] text-white', installed: true },
  { key: 'ai', title: 'AI Team', desc: 'AI agents that coordinate and execute operational workflows', icon: UsersRound, color: 'bg-[#ff375f] text-white', dockIcon: BrainCircuit, dockColor: 'bg-gradient-to-br from-[#ff6fa5] to-[#e6246b] text-white', installed: true },
  { key: 'analytics', title: 'Analytics', desc: 'Monitor organizational performance and operational intelligence', icon: ChartColumn, color: 'bg-[#30d158] text-white', dockIcon: ChartColumn, dockColor: 'bg-gradient-to-br from-[#4cd964] to-[#1fa94a] text-white', installed: true },
  { key: 'ops', title: 'Operations', desc: 'Coordinate workflows, tasks, and operational execution', icon: GitBranch, color: 'bg-[#8944d8] text-white', dockIcon: GitBranch, dockColor: 'bg-gradient-to-br from-[#7d7aff] to-[#4b47d6] text-white', installed: true },
  { key: 'builder', title: 'Builder', desc: 'Build adaptive software and operational interfaces with AI', icon: CodeXml, color: 'bg-white text-black', dockIcon: CodeXml, dockColor: 'bg-white text-black', installed: false },
  { key: 'store', title: 'App Store', desc: 'Install business apps and AI tools into your workspace', icon: LayoutGrid, color: 'bg-[#0a84ff] text-white', dockIcon: LayoutGrid, dockColor: 'bg-[#0a84ff] text-white', installed: false },
]
export const HOME_APP: AppDef = { key: 'home', title: 'Apps', desc: 'Apps Hub', icon: LayoutDashboard, color: 'bg-card', dockIcon: LayoutDashboard, dockColor: 'bg-gradient-to-br from-[#3a3a3c] to-[#1c1c1e] text-white ring-1 ring-white/15', installed: true }

export function ViewTitle({ crumb, sub, right }: { crumb: string[]; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[22px] font-semibold tracking-tight">
          {crumb.map((c, i) => (
            <span key={c} className={cx('flex items-center gap-1.5', i > 0 && 'text-fg-3')}>
              {i > 0 && <span className="font-normal text-fg-3">›</span>}{c}
            </span>
          ))}
        </div>
        {sub && <div className="mt-0.5 text-[13px] text-fg-3">{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <Icon className="mb-2 size-6 text-fg-3" />
      <div className="text-[13px] font-medium text-fg-2">{title}</div>
      {children && <div className="mt-1 max-w-sm text-[12px] text-fg-3">{children}</div>}
    </div>
  )
}
