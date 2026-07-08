import { useTranslation } from 'react-i18next'

const COLOR: Record<string, string> = {
  draft: 'border-[#D9ECE8] bg-[#F8FCFB] text-[#55726D]',
  creating: 'border-[#BBD4FF] bg-[#EFF6FF] text-[#2563EB]',
  created: 'border-[#B9DCD6] bg-[#EFF8F6] text-[#0F766E]',
  failed: 'border-[#F2B8B5] bg-[#FFF1F0] text-[#B42318]',
  archived: 'border-[#F1D49B] bg-[#FFF8E8] text-[#B7791F]',
  published: 'border-[#B9DCD6] bg-[#EFF8F6] text-[#0F766E]',
  running: 'border-[#F1D49B] bg-[#FFF8E8] text-[#B7791F]',
}

export default function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const label = t(`ontology.status_${status}`, status)
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${COLOR[status] ?? COLOR.draft}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}
