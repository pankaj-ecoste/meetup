import type { SheetStatus } from '@/lib/types'

const STYLES: Record<SheetStatus, { label: string; cls: string }> = {
  synced: { label: 'In sheet', cls: 'bg-green-50 text-green-700 border-green-200' },
  pending: { label: 'Sheet pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  failed: { label: 'Sheet failed', cls: 'bg-red-50 text-red-700 border-red-200' },
}

export default function SyncBadge({ status }: { status: SheetStatus }) {
  const s = STYLES[status]
  return (
    <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${s.cls}`}>
      {s.label}
    </span>
  )
}
