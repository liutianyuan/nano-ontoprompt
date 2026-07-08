import React, { useState, lazy, Suspense } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ontologyApi } from '@/api/ontologies'
import StatusBadge from '@/components/StatusBadge'
import { Activity, ArrowLeft, Database, FileText, Network, ShieldCheck } from 'lucide-react'
import InfoTab from './tabs/InfoTab'
import FilesTab from './tabs/FilesTab'
import EntitiesTab from './tabs/EntitiesTab'
import LogicTab from './tabs/LogicTab'
import ActionsTab from './tabs/ActionsTab'
import CuratedDatasetsTab from './tabs/CuratedDatasetsTab'

const GraphTab = lazy(() => import('./tabs/GraphTabV2'))

type Tab = 'info' | 'graph' | 'entities' | 'logic' | 'actions' | 'files' | 'curated'

class GraphErrorBoundary extends React.Component<
  { children: React.ReactNode; fallbackLabel?: string },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-600 font-medium mb-2">{this.props.fallbackLabel || '图表加载失败'}</p>
          <p className="text-red-400 text-sm font-mono">{this.state.error}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: '' })}
            className="mt-4 px-3 py-1.5 text-sm border border-red-300 text-red-500 rounded-lg hover:bg-red-100">
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function OntologyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) || 'info'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  const { data: ontology, isLoading } = useQuery({
    queryKey: ['ontology', id],
    queryFn: () => ontologyApi.get(id!) as any,
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6 text-gray-400">{t('common.loading')}</div>
  if (!ontology) return <div className="p-6 text-red-500">Ontology not found</div>

  const isPipelineMode = (ontology as any).build_mode === 'pipeline_mapping'
  const isMedical = ontology.domain === '医疗'

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { key: 'info', label: t('ontology.tabs.info'), icon: FileText },
    { key: 'graph', label: t('ontology.tabs.graph'), icon: Network },
    { key: 'entities', label: t('ontology.tabs.entities'), icon: Database },
    { key: 'logic', label: t('ontology.tabs.logic'), icon: ShieldCheck },
    { key: 'actions', label: t('ontology.tabs.actions'), icon: Activity },
    isPipelineMode
      ? { key: 'curated', label: 'Curated 数据集', icon: Database }
      : { key: 'files', label: t('ontology.tabs.files'), icon: FileText },
  ]

  return (
    <div className="ontology-med-shell -m-6 min-h-screen p-5 sm:p-6">
      <div className="mb-5 overflow-hidden rounded-lg border border-[#B9DCD6] bg-[#F8FCFB] shadow-[0_18px_55px_rgba(15,118,110,0.12)]">
        <div className="relative border-b border-[#D9ECE8] bg-[linear-gradient(115deg,#F7FCFB_0%,#E9F7F4_58%,#FDFEFE_100%)] px-5 py-5 sm:px-7">
          <div className="absolute inset-x-0 bottom-0 h-px bg-[#0F766E]/20" />
          <div className="pointer-events-none absolute right-5 top-4 hidden w-80 max-w-[36%] text-[#0F766E]/35 md:block">
            <svg viewBox="0 0 320 70" fill="none" className="h-16 w-full">
              <path d="M0 38 H58 L70 38 L81 16 L95 56 L108 38 H154 L166 38 L178 28 L194 46 L208 38 H320" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M0 58 H320" stroke="currentColor" strokeWidth="1" strokeDasharray="4 10" opacity=".35" />
            </svg>
          </div>

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <button
                onClick={() => navigate('/ontologies')}
                className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#406A64] transition hover:text-[#0F766E]">
                <ArrowLeft size={15} />
                {t('ontology.back')}
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-[#A7D8D1] bg-white/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0F766E]">
                  {isMedical ? 'Clinical knowledge model' : 'Knowledge model'}
                </span>
                <StatusBadge status={ontology.status} />
                <span className="rounded border border-[#D8E7E4] bg-white/70 px-2 py-1 text-xs font-mono text-[#55726D]">
                  {ontology.version}
                </span>
              </div>
              <h2 className="mt-3 max-w-4xl text-2xl font-semibold tracking-normal text-[#10201D] sm:text-3xl">
                {ontology.name}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#55726D]">
                {ontology.description || (isMedical
                  ? '用于沉淀疾病、药物、诊疗流程与临床规则之间的结构化关系，支撑质控审阅、知识图谱与规则执行。'
                  : '用于沉淀业务概念、关系、规则与动作，支撑知识图谱和自动化执行。')}
              </p>
            </div>

            <div className="grid min-w-[280px] grid-cols-3 gap-2 rounded-md border border-[#CFE7E2] bg-white/75 p-2 shadow-sm">
              <div className="border-r border-[#E2EFEC] px-3 py-2">
                <p className="text-[11px] text-[#6C8580]">专科域</p>
                <p className="mt-1 truncate text-sm font-semibold text-[#10201D]">{ontology.domain}</p>
              </div>
              <div className="border-r border-[#E2EFEC] px-3 py-2">
                <p className="text-[11px] text-[#6C8580]">构建路径</p>
                <p className="mt-1 truncate text-sm font-semibold text-[#10201D]">
                  {isPipelineMode ? 'Pipeline' : 'LLM 提取'}
                </p>
              </div>
              <div className="px-3 py-2">
                <p className="text-[11px] text-[#6C8580]">审阅状态</p>
                <p className="mt-1 text-sm font-semibold text-[#0F766E]">
                  {ontology.status === 'created' ? '可用' : ontology.status}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white/80 px-3 pt-2">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon
              const selected = activeTab === tab.key
              return (
                <button key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors ${
                    selected
                      ? 'border-[#0F766E] text-[#0B5F58]'
                      : 'border-transparent text-[#6C8580] hover:text-[#10201D]'
                  }`}>
                  <Icon size={15} />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px]">
        {activeTab === 'info' && <InfoTab ontology={ontology} />}
        {activeTab === 'files' && <FilesTab ontologyId={id!} />}
        {activeTab === 'curated' && <CuratedDatasetsTab ontologyId={id!} />}
        {activeTab === 'graph' && (
          <GraphErrorBoundary fallbackLabel="知识图谱渲染失败">
            <Suspense fallback={<div className="text-gray-400 py-8 text-center">{t('common.loading')}</div>}>
              <GraphTab ontologyId={id!} />
            </Suspense>
          </GraphErrorBoundary>
        )}
        {activeTab === 'entities' && <EntitiesTab ontologyId={id!} />}
        {activeTab === 'logic' && <LogicTab ontologyId={id!} />}
        {activeTab === 'actions' && <ActionsTab ontologyId={id!} />}
      </div>
    </div>
  )
}
