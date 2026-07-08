import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { useTranslation } from 'react-i18next'
import StatusBadge from '@/components/StatusBadge'
import { Activity, Bolt, BrainCircuit, FileText, Network, ShieldCheck } from 'lucide-react'

interface RecentOntology {
  id: string
  name: string
  domain: string
  status: string
  entity_count: number
  logic_count: number
  action_count: number
  updated_at: string
}

interface Stats {
  ontology_count: number
  entity_count: number
  logic_count: number
  action_count: number
  recent_ontologies: RecentOntology[]
  domain_counts: Record<string, number>
  status_counts: Record<string, number>
}

const DOMAIN_COLORS: Record<string, string> = {
  '供应链': 'bg-[#2563EB]',
  '医疗': 'bg-[#0F766E]',
  '财务': 'bg-[#B7791F]',
  '法律': 'bg-[#7C3AED]',
  '教育': 'bg-[#DB2777]',
  '其他': 'bg-[#8AA39E]',
}

export default function OverviewPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => apiClient.get('/overview/stats') as any,
  })

  if (isLoading) return <p className="p-6 text-[#6C8580]">{t('common.loading')}</p>

  const cards = [
    { key: 'ontology_count', label: t('overview.ontology_count'), icon: Network, tone: '#0F766E' },
    { key: 'entity_count', label: t('overview.entity_count'), icon: BrainCircuit, tone: '#2563EB' },
    { key: 'logic_count', label: t('overview.logic_count'), icon: ShieldCheck, tone: '#7C3AED' },
    { key: 'action_count', label: t('overview.actions_label'), icon: Bolt, tone: '#B7791F' },
  ] as const

  const domainEntries = Object.entries(data?.domain_counts ?? {}).sort((a, b) => b[1] - a[1])
  const maxDomainCount = Math.max(...domainEntries.map(([, v]) => v), 1)
  const statusEntries = Object.entries(data?.status_counts ?? {})
  const totalOntologies = data?.ontology_count ?? 0
  const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US'

  return (
    <div className="space-y-6">
      <section className="medical-panel-strong overflow-hidden">
        <div className="relative p-6 lg:p-7">
          <div className="absolute right-6 top-5 hidden w-80 text-[#0F766E]/35 md:block">
            <svg viewBox="0 0 320 72" fill="none">
              <path d="M0 38 H60 L72 38 L83 17 L97 57 L110 38 H158 L170 38 L182 28 L199 47 L214 38 H320" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M0 60 H320" stroke="currentColor" strokeWidth="1" strokeDasharray="4 10" opacity=".35" />
            </svg>
          </div>
          <div className="relative max-w-3xl">
            <p className="page-kicker">System rounds</p>
            <h2 className="page-title mt-2">{t('overview.title')}</h2>
            <p className="page-subtitle mt-2">
              汇总知识模型、实体关系、逻辑规则和动作执行能力，帮助团队快速判断知识工程工作台的健康状态。
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {cards.map(({ key, label, icon: Icon, tone }) => {
          const value = data?.[key] ?? 0
          return (
            <div key={key} className="medical-panel p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#55726D]">{label}</p>
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[#D9ECE8] bg-[#F8FCFB]" style={{ color: tone }}>
                  <Icon size={18} />
                </span>
              </div>
              <p className="mt-4 text-4xl font-semibold tracking-normal text-[#10201D]">{value}</p>
              <div className="mt-4 h-1.5 rounded-full bg-[#E2EFEC]">
                <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(12, value * 8))}%`, backgroundColor: tone }} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="medical-panel xl:col-span-2">
          <div className="flex items-center justify-between border-b border-[#E2EFEC] px-5 py-4">
            <div>
              <p className="page-kicker">Recent models</p>
              <h3 className="mt-1 font-semibold text-[#10201D]">{t('overview.recent_updated')}</h3>
            </div>
            <FileText size={18} className="text-[#0F766E]" />
          </div>
          {(data?.recent_ontologies ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-[#6C8580]">{t('overview.empty')}</p>
          ) : (
            <div className="divide-y divide-[#E2EFEC]">
              {(data?.recent_ontologies ?? []).map(o => (
                <button
                  key={o.id}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 py-4 text-left transition hover:bg-[#F8FCFB]"
                  onClick={() => navigate(`/ontologies/${o.id}`)}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-[#10201D]">{o.name}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-1 text-xs text-[#6C8580]">{o.domain}</p>
                  </div>
                  <div className="hidden items-center gap-4 text-xs text-[#55726D] sm:flex">
                    <span>实体 {o.entity_count}</span>
                    <span>规则 {o.logic_count}</span>
                    <span>动作 {o.action_count}</span>
                    <span>{o.updated_at ? new Date(o.updated_at).toLocaleDateString(locale) : '-'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="medical-panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="page-kicker">Domains</p>
                <h3 className="mt-1 font-semibold text-[#10201D]">{t('overview.domain_dist')}</h3>
              </div>
              <Activity size={18} className="text-[#0F766E]" />
            </div>
            {domainEntries.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#6C8580]">{t('overview.no_data')}</p>
            ) : (
              <div className="space-y-3">
                {domainEntries.map(([domain, count]) => (
                  <div key={domain}>
                    <div className="mb-1 flex items-center justify-between text-xs text-[#55726D]">
                      <span>{domain}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#E2EFEC]">
                      <div
                        className={`h-2 rounded-full ${DOMAIN_COLORS[domain] ?? 'bg-[#8AA39E]'}`}
                        style={{ width: `${(count / maxDomainCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {totalOntologies > 0 && (
            <div className="medical-panel p-5">
              <p className="page-kicker">Review states</p>
              <h3 className="mt-1 font-semibold text-[#10201D]">{t('overview.ont_status')}</h3>
              <div className="mt-4 space-y-2">
                {statusEntries.map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between rounded-md border border-[#E2EFEC] px-3 py-2 text-sm">
                    <StatusBadge status={status} />
                    <span className="font-semibold text-[#10201D]">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
