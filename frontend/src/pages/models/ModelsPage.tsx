import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { modelApi } from '@/api/ontologies'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { ModelConfig } from '@/types/ontology'
import { Trash2, TestTube2, Plus, Pencil, X, Loader2 } from 'lucide-react'

const CONFIG_TYPES = [
  { value: 'llm', label: 'LLM配置' },
  { value: 'ocr', label: 'OCR配置' },
  { value: 'other', label: '其他配置' },
]

const PROVIDERS: Record<string, Array<{ value: string; label: string }>> = {
  llm: [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'compatible', label: 'OpenAI-Compatible' },
  ],
  ocr: [
    { value: 'easyocr', label: 'EasyOCR' },
    { value: 'paddleocr', label: 'PaddleOCR' },
    { value: 'tesseract', label: 'Tesseract' },
    { value: 'external_api', label: 'External OCR API' },
  ],
  other: [
    { value: 'custom', label: 'Custom' },
    { value: 'local_service', label: 'Local Service' },
    { value: 'http_api', label: 'HTTP API' },
  ],
}

const USAGE_TAGS = ['VLM提取', '结构化提取', '宽表分析', 'Ontology Mapping', 'NL-to-Cypher', 'OCR文字提取']

function modelList(text?: string) {
  return text ? text.split('\n').map((s: string) => s.trim()).filter(Boolean) : []
}

function parseOptions(text?: string) {
  if (!text?.trim()) return {}
  return JSON.parse(text)
}

function buildPayload(data: any, usageTags: string[]) {
  const options = {
    ...parseOptions(data.options_json),
    usage_tags: usageTags,
    ...(data.config_type === 'ocr' ? {
      enabled: data.ocr_enabled === 'true',
      lang: data.ocr_lang || 'ch',
      device: data.ocr_device || 'cpu',
    } : {}),
  }
  return {
    name: data.name,
    config_type: data.config_type || 'llm',
    provider: data.provider,
    api_key: data.api_key,
    api_base: data.api_base,
    models: modelList(data.models_str),
    options,
  }
}

function typeLabel(type?: string) {
  return CONFIG_TYPES.find(t => t.value === (type || 'llm'))?.label || 'LLM配置'
}

export default function ModelsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ModelConfig | null>(null)
  const [testResult, setTestResult] = useState<Record<string, string>>({})
  const [formTags, setFormTags] = useState<string[]>([])
  const { register, handleSubmit, reset, watch, setValue: setCreateValue } = useForm<any>({
    defaultValues: { config_type: 'llm', provider: 'openai', ocr_enabled: 'false', ocr_lang: 'ch', ocr_device: 'cpu' },
  })

  const { data: models = [], isLoading } = useQuery({
    queryKey: ['models'], queryFn: () => modelApi.list() as any,
  })

  const createMut = useMutation({
    mutationFn: (data: any) => modelApi.create(buildPayload(data, formTags)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setShowCreate(false); reset(); setFormTags([]) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => modelApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setDeleteTarget(null) },
  })

  const testMut = useMutation({
    mutationFn: (id: string) => modelApi.test(id),
    onSuccess: (res: any, id) => {
      const data = res?.data || res
      setTestResult(prev => ({ ...prev, [id]: data?.ok === false ? `未启用：${data.response || ''}` : '连接成功' }))
    },
    onError: (err: any, id) => setTestResult(prev => ({ ...prev, [id]: `❌ ${err?.detail || '连接失败'}` })),
  })

  // ── 编辑 ──
  const [editTarget, setEditTarget] = useState<ModelConfig | null>(null)
  const [editTags, setEditTags] = useState<string[]>([])
  const { register: regEdit, handleSubmit: handleEditSubmit, setValue, watch: watchEdit } = useForm<any>()

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => modelApi.update(id, buildPayload(data, editTags)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setEditTarget(null); setEditTags([]) },
  })

  const openEdit = (m: ModelConfig) => {
    const options = m.options || {}
    setEditTarget(m); setEditTags((options.usage_tags as string[]) || [])
    setValue('name', m.name); setValue('config_type', m.config_type || 'llm'); setValue('provider', m.provider)
    setValue('api_base', m.api_base || '')
    setValue('models_str', (m.models || []).join('\n'))
    setValue('ocr_enabled', options.enabled ? 'true' : 'false')
    setValue('ocr_lang', String(options.lang || 'ch'))
    setValue('ocr_device', String(options.device || 'cpu'))
    setValue('options_json', JSON.stringify(
      Object.fromEntries(Object.entries(options).filter(([k]) => !['usage_tags', 'lang', 'device'].includes(k))),
      null,
      2,
    ))
  }

  return (
    <div className="space-y-5">
      <section className="medical-panel-strong p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-kicker">Model services</p>
            <h2 className="page-title mt-2">{t('model.title')}</h2>
            <p className="page-subtitle mt-2">管理 LLM、OCR 和外部推理服务，供知识抽取、映射和图谱问答调用。</p>
          </div>
        <button onClick={() => { setShowCreate(true); reset({ config_type: 'llm', provider: 'openai', ocr_enabled: 'false', ocr_lang: 'ch', ocr_device: 'cpu' }); setFormTags([]) }}
          className="medical-primary flex h-10 items-center gap-2 px-4 text-sm">
          <Plus size={14} /> {t('model.create')}
        </button>
        </div>
      </section>

      <div className="grid gap-4">
        {isLoading ? <p className="text-sm text-[#6C8580]">{t('common.loading')}</p> :
          (models as ModelConfig[]).map(m => (
            <div key={m.id} className="medical-panel p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-[#10201D]">{m.name}</h3>
                  <p className="mt-1 text-sm text-[#55726D]">{typeLabel(m.config_type)} · {m.provider}{m.api_base ? ` · ${m.api_base}` : ''}</p>
                  {m.models?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {m.models.map(mn => <span key={mn} className="rounded border border-[#D9ECE8] bg-[#F8FCFB] px-2 py-0.5 text-xs text-[#334B47]">{mn}</span>)}
                    </div>
                  )}
                  {((m.options?.usage_tags as string[]) || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {((m.options?.usage_tags as string[]) || []).map((tag: string) => (
                        <span key={tag} className="rounded-full bg-[#EFF8F6] px-2 py-0.5 text-xs text-[#0F766E]">{tag}</span>
                      ))}
                    </div>
                  )}
                  {testResult[m.id] && <p className={`text-xs mt-1 ${testResult[m.id].startsWith('连接成功') ? 'text-green-600' : 'text-amber-600'}`}>{testResult[m.id]}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => testMut.mutate(m.id)} disabled={testMut.isPending} className="medical-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs disabled:opacity-50"><TestTube2 size={13} />测试</button>
                  <button onClick={() => openEdit(m)} className="medical-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#2563EB]"><Pencil size={13} />编辑</button>
                  <button onClick={() => setDeleteTarget(m)} className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-100"><Trash2 size={13} />删除</button>
                </div>
              </div>
            </div>
          ))
        }
        {!isLoading && (models as ModelConfig[]).length === 0 && (
          <div className="medical-panel p-8 text-center text-[#6C8580]">{t('model.empty')}</div>
        )}
      </div>

      {/* 新建弹窗 */}
      {showCreate && <ModelFormModal title="新建模型" onClose={() => setShowCreate(false)} onSubmit={(d: any) => createMut.mutate(d)}
        isPending={createMut.isPending} formTags={formTags} setFormTags={setFormTags} register={register}
        handleSubmit={handleSubmit} configType={watch('config_type') || 'llm'} setValue={setCreateValue} />}

      {/* 编辑弹窗 */}
      {editTarget && (
        <div className="fixed inset-0 bg-[#10201D]/55 flex items-center justify-center z-50" onClick={() => setEditTarget(null)}>
          <div className="bg-white rounded-lg shadow-lg p-6 w-[480px]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">编辑模型</h3>
              <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-[#10201D]"><X size={16} /></button>
            </div>
            <form onSubmit={handleEditSubmit(d => updateMut.mutate({ id: editTarget.id, data: d }))} className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">名称 *</label>
                <input {...regEdit('name', { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium mb-1">配置分类 *</label>
                <select {...regEdit('config_type', { required: true, onChange: e => setValue('provider', PROVIDERS[e.target.value]?.[0]?.value || 'custom') })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {CONFIG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select></div>
              <div><label className="block text-sm font-medium mb-1">Provider *</label>
                <select {...regEdit('provider', { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {(PROVIDERS[watchEdit('config_type') || 'llm'] || PROVIDERS.llm).map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select></div>
              <div><label className="block text-sm font-medium mb-1">API Base</label>
                <input {...regEdit('api_base')} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium mb-1">模型名（每行一个）</label>
                <textarea {...regEdit('models_str')} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" /></div>
              {(watchEdit('config_type') || 'llm') === 'ocr' && (
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-sm font-medium mb-1">启用运行</label>
                    <select {...regEdit('ocr_enabled')} className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="false">关闭</option><option value="true">开启</option>
                    </select></div>
                  <div><label className="block text-sm font-medium mb-1">OCR语言</label>
                    <input {...regEdit('ocr_lang')} placeholder="ch" className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-sm font-medium mb-1">设备</label>
                    <select {...regEdit('ocr_device')} className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="cpu">CPU</option><option value="gpu">GPU</option>
                    </select></div>
                </div>
              )}
              <div><label className="block text-sm font-medium mb-1">高级参数 JSON</label>
                <textarea {...regEdit('options_json')} rows={3} placeholder={'{\"timeout\": 30}'} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" /></div>
              <div><label className="text-xs text-gray-500 mb-2 block">用途标签</label>
                <div className="flex flex-wrap gap-2">
                  {USAGE_TAGS.map(tag => {
                    const sel = editTags.includes(tag)
                    return <button key={tag} type="button" onClick={() => setEditTags(prev => sel ? prev.filter(t => t !== tag) : [...prev, tag])}
                      className={`text-xs px-3 py-1.5 rounded-full border ${sel ? 'medical-primary border-[#0F766E]' : 'border-gray-200 text-gray-600'}`}>{tag}</button>
                  })}
                </div></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditTarget(null)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
                <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-1.5 px-4 py-2 medical-primary rounded-lg text-sm disabled:opacity-50">
                  {updateMut.isPending && <Loader2 size={13} className="animate-spin" />}保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteTarget} title={t('model.confirm_delete')} message={t('model.confirm_delete_msg', { name: deleteTarget?.name })}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} onCancel={() => setDeleteTarget(null)} />
    </div>
  )
}

/** 新建模型表单弹窗 */
function ModelFormModal({ title, onClose, onSubmit, isPending, formTags, setFormTags, register, handleSubmit, configType, setValue }: any) {
  return (
    <div className="fixed inset-0 bg-[#10201D]/55 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg p-6 w-[480px]" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">{title}</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div><label className="block text-sm font-medium mb-1">名称 *</label>
            <input {...register('name', { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1">配置分类 *</label>
            <select {...register('config_type', { required: true, onChange: (e: any) => setValue('provider', PROVIDERS[e.target.value]?.[0]?.value || 'custom') })} className="w-full border rounded-lg px-3 py-2 text-sm">
              {CONFIG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Provider *</label>
            <select {...register('provider', { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm">
              {(PROVIDERS[configType] || PROVIDERS.llm).map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium mb-1">API Key</label>
            <input {...register('api_key')} type="password" className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1">API Base</label>
            <input {...register('api_base')} placeholder="https://api.openai.com/v1" className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1">模型名（每行一个）</label>
            <textarea {...register('models_str')} rows={3} placeholder="gpt-4o&#10;gpt-4o-mini" className="w-full border rounded-lg px-3 py-2 text-sm font-mono" /></div>
          {configType === 'ocr' && (
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-sm font-medium mb-1">启用运行</label>
                <select {...register('ocr_enabled')} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="false">关闭</option><option value="true">开启</option>
                </select></div>
              <div><label className="block text-sm font-medium mb-1">OCR语言</label>
                <input {...register('ocr_lang')} placeholder="ch" className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium mb-1">设备</label>
                <select {...register('ocr_device')} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="cpu">CPU</option><option value="gpu">GPU</option>
                </select></div>
            </div>
          )}
          <div><label className="block text-sm font-medium mb-1">高级参数 JSON</label>
            <textarea {...register('options_json')} rows={3} placeholder={'{\"timeout\": 30}'} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" /></div>
          <div><label className="text-xs text-gray-500 mb-2 block">用途标签</label>
            <div className="flex flex-wrap gap-2">{[...USAGE_TAGS].map(tag => {
              const sel = formTags.includes(tag)
              return <button key={tag} type="button" onClick={() => setFormTags((prev: string[]) => sel ? prev.filter((t: string) => t !== tag) : [...prev, tag])}
                className={`text-xs px-3 py-1.5 rounded-full border ${sel ? 'medical-primary border-[#0F766E]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{tag}</button>
            })}</div></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">取消</button>
            <button type="submit" disabled={isPending} className="flex items-center gap-1.5 px-4 py-2 medical-primary rounded-lg text-sm disabled:opacity-50">
              {isPending && <Loader2 size={13} className="animate-spin" />}保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
