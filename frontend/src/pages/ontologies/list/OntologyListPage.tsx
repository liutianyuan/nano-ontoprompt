import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ontologyApi } from '@/api/ontologies'
import StatusBadge from '@/components/StatusBadge'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { OntologyListItem } from '@/types/ontology'
import { Database, Plus, Search, X } from 'lucide-react'

export default function OntologyListPage() {
  const [idFilter, setIdFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['ontologies'],
    queryFn: () => ontologyApi.list({ page_size: 1000 }) as any,
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => ontologyApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ontologies'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setDeleteTarget(null)
    },
  })

  const allItems: OntologyListItem[] = data?.items ?? []

  const filteredItems = useMemo(() => {
    let list = allItems
    if (idFilter.trim())
      list = list.filter(o => o.id.toLowerCase().includes(idFilter.trim().toLowerCase()))
    if (nameFilter.trim())
      list = list.filter(o => o.name.toLowerCase().includes(nameFilter.trim().toLowerCase()))
    if (dateFrom)
      list = list.filter(o => new Date(o.created_at) >= new Date(dateFrom))
    if (dateTo)
      list = list.filter(o => new Date(o.created_at) <= new Date(dateTo + 'T23:59:59'))
    return list
  }, [allItems, idFilter, nameFilter, dateFrom, dateTo])

  const hasFilters = idFilter || nameFilter || dateFrom || dateTo

  return (
    <div className="space-y-5">
      <section className="medical-panel-strong p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="page-kicker">Ontology registry</p>
            <h2 className="page-title mt-2">{t('ontology.title')}</h2>
            <p className="page-subtitle mt-2">按工作单管理知识模型，追踪构建方式、实体关系数量和审阅状态。</p>
          </div>
          <button onClick={() => navigate('/ontologies/new')} className="medical-primary inline-flex h-10 items-center gap-2 px-4 text-sm">
            <Plus size={16} /> {t('ontology.create')}
          </button>
        </div>
      </section>

      <div className="medical-panel p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_240px_170px_170px_auto] xl:items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#55726D]">ID</label>
            <input value={idFilter} onChange={e => setIdFilter(e.target.value)} placeholder={t('ontology.search_id')} className="medical-input w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#55726D]">{t('ontology.name')}</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8AA39E]" />
              <input value={nameFilter} onChange={e => setNameFilter(e.target.value)} placeholder={t('ontology.filter_placeholder')} className="medical-input w-full px-3 py-2 pl-8 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#55726D]">{t('ontology.date_from')}</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="medical-input w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#55726D]">{t('ontology.date_to')}</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="medical-input w-full px-3 py-2 text-sm" />
          </div>
          <div className="flex items-center gap-3">
            {hasFilters && (
              <button onClick={() => { setIdFilter(''); setNameFilter(''); setDateFrom(''); setDateTo('') }} className="medical-secondary inline-flex h-10 items-center gap-1 px-3 text-sm">
                <X size={14} /> {t('ontology.clear_filter')}
              </button>
            )}
            <span className="text-xs text-[#6C8580]">
              {t('ontology.count_summary', { filtered: filteredItems.length, total: allItems.length })}
            </span>
          </div>
        </div>
      </div>

      <div className="medical-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-[#E2EFEC]">
            <tr>
              {['ID', t('ontology.name'), t('ontology.domain'), '构建方式', '实体', '关系', t('ontology.status'), t('ontology.created_at'), t('ontology.actions')].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2EFEC]">
            {isLoading ? (
              <tr><td colSpan={9} className="py-10 text-center text-[#6C8580]">{t('common.loading')}</td></tr>
            ) : filteredItems.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-3 font-mono text-xs text-[#8AA39E]" title={o.id}>{o.id.slice(0, 8)}</td>
                <td className="px-4 py-3 font-semibold text-[#10201D]">{o.name}</td>
                <td className="px-4 py-3 text-[#55726D]">{o.domain}</td>
                <td className="px-4 py-3">
                  {o.build_mode === 'pipeline_mapping'
                    ? <span className="inline-flex rounded border border-[#BBD4FF] bg-[#EFF6FF] px-2 py-0.5 text-xs font-medium text-[#2563EB]">Pipeline</span>
                    : <span className="inline-flex rounded border border-[#F1D49B] bg-[#FFF8E8] px-2 py-0.5 text-xs font-medium text-[#B7791F]">LLM 提取</span>
                  }
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#55726D]">{o.entity_count ?? 0}</td>
                <td className="px-4 py-3 font-mono text-xs text-[#55726D]">{o.relation_count ?? 0}</td>
                <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-4 py-3 text-xs text-[#55726D]">{new Date(o.created_at).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => navigate(`/ontologies/${o.id}`)} className="text-xs font-medium text-[#0F766E] hover:underline">{t('ontology.view')}</button>
                    <button onClick={() => setDeleteTarget({ id: o.id, name: o.name })} className="text-xs font-medium text-red-600 hover:underline">{t('ontology.delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filteredItems.length === 0 && (
          <div className="py-12 text-center">
            <Database size={28} className="mx-auto text-[#8AA39E]" />
            <p className="mt-3 text-sm text-[#6C8580]">{hasFilters ? t('ontology.no_match') : t('ontology.empty')}</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('ontology.confirm_delete')}
        message={t('ontology.confirm_delete_msg', { name: deleteTarget?.name })}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
