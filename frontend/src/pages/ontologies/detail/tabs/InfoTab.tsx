import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ontologyApi, promptApi, modelApi } from '@/api/ontologies'
import { CheckCircle, XCircle, Loader2, ChevronRight, AlertTriangle, AlertCircle, Info, Activity, ClipboardCheck, Database, FileText, ShieldCheck, Stethoscope } from 'lucide-react'
import type { OntologyDetail } from '@/types/ontology'
import { loadRuleStates, getActiveConstraints } from '@/utils/extractionRules'

const SEVERITY_CONFIG = {
  fatal:   { label: 'FATAL',   bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',   icon: XCircle },
  error:   { label: 'ERROR',   bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-600',   icon: AlertCircle },
  warning: { label: 'WARNING', bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700', icon: AlertTriangle },
  info:    { label: 'INFO',    bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',  icon: Info },
}

function ValidationReportCard({ report }: { report: any }) {
  const { t } = useTranslation()
  if (!report) return null
  const bySeverity = report.by_severity ?? {}
  const allEmpty = Object.values(bySeverity).every((arr: any) => arr.length === 0)
  const overallOk = !report.has_fatal && !report.has_errors

  return (
    <div className={`bg-white rounded-xl border p-6 ${report.has_fatal ? 'border-red-300' : report.has_errors ? 'border-amber-300' : 'border-green-200'}`}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-semibold">{t('extract.quality_report')}</h3>
        {overallOk && !allEmpty ? (
          <span className="ml-auto text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle size={11} /> {t('extract.quality_pass')}
          </span>
        ) : overallOk && allEmpty ? (
          <span className="ml-auto text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle size={11} /> {t('extract.quality_perfect')}
          </span>
        ) : (
          <span className="ml-auto text-xs bg-red-50 border border-red-200 text-red-600 px-2 py-0.5 rounded-full">
            {t('extract.issues_count', { count: report.total_issues })}
          </span>
        )}
      </div>

      {allEmpty ? (
        <p className="text-sm text-gray-400">{t('extract.no_issues')}</p>
      ) : (
        <div className="space-y-3">
          {(['fatal', 'error', 'warning', 'info'] as const).map(sev => {
            const issues = bySeverity[sev] ?? []
            if (!issues.length) return null
            const cfg = SEVERITY_CONFIG[sev]
            const Icon = cfg.icon
            return (
              <div key={sev} className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
                <p className={`text-xs font-semibold ${cfg.text} mb-1.5`}>{cfg.label} · {issues.length} 项</p>
                <ul className="space-y-1">
                  {issues.map((issue: any, i: number) => (
                    <li key={i} className={`flex items-start gap-1.5 text-xs ${cfg.text}`}>
                      <Icon size={11} className="mt-0.5 flex-shrink-0" />
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const STAGE_KEYS = [
  { key: 'queued',               i18nKey: 'extract.stage_queued' },
  { key: 'loading files',        i18nKey: 'extract.stage_loading' },
  { key: 'calling LLM',         i18nKey: 'extract.stage_llm' },
  { key: 'validating output',   i18nKey: 'extract.stage_validating' },
  { key: 'inferring relations', i18nKey: 'extract.stage_inferring' },
  { key: 'saving results',      i18nKey: 'extract.stage_saving' },
  { key: 'done',                 i18nKey: 'extract.stage_done' },
]

const STAGE_PCT: Record<string, number> = {
  queued: 0, 'loading files': 10, 'calling LLM': 40,
  'validating output': 65, 'inferring relations': 75, 'saving results': 85, done: 100,
}

const STREAM_TIMEOUT_MS = 10 * 60 * 1000
const lastTaskKey = (oid: string) => `ontoprompt_last_task_${oid}`
const activeTaskKey = (oid: string) => `ontoprompt_active_task_${oid}`

function uniquePromptOptions(prompts: any[] | undefined): any[] {
  const seen = new Set<string>()
  return (prompts || []).filter((p: any) => {
    const key = `${p.name || ''}::${p.domain || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function PipelineMappingInfo({ ontology }: { ontology: OntologyDetail }) {
  const [mappings, setMappings] = useState<any[]>([])
  useEffect(() => {
    import('@/api/client').then(({ apiClientV2 }) => {
      apiClientV2.get(`/ontologies/${ontology.id}/mappings`)
        .then((res: any) => setMappings(Array.isArray(res) ? res : []))
        .catch(() => setMappings([]))
    })
  }, [ontology.id])

  return (
    <div className="rounded-lg border border-[#CFE7E2] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Database size={16} className="text-[#0F766E]" />
        <span className="text-sm font-semibold text-[#10201D]">Pipeline Mapping 状态</span>
        <span className="ml-auto rounded border border-[#CFE7E2] bg-[#EFF8F6] px-2 py-0.5 text-xs text-[#0F766E]">Pipeline 模式</span>
      </div>
      {mappings.length === 0 ? (
        <p className="mt-4 text-sm text-[#6C8580]">暂无 Mapping 配置。请先在 Pipelines → Curated Datasets 中审批数据，然后在新建知识建模时配置 Mapping。</p>
      ) : (
        <div className="mt-4 space-y-2">
          {mappings.map((m: any) => (
            <div key={m.mapping_id || m.id} className="flex items-center justify-between rounded-md border border-[#E2EFEC] px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-[#10201D]">{m.entity_class}</span>
                {m.entity_class_cn && <span className="ml-2 text-[#6C8580]">({m.entity_class_cn})</span>}
              </div>
              <span className={`rounded border px-1.5 py-0.5 text-xs ${m.status === 'active' ? 'border-[#B9DCD6] bg-[#EFF8F6] text-[#0F766E]' : 'border-gray-200 text-gray-500'}`}>
                {m.status || 'draft'}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex gap-2 border-t border-[#E2EFEC] pt-3">
        <a href="/pipelines/curated" className="text-xs font-medium text-[#0F766E] hover:underline">查看 Curated Datasets</a>
      </div>
    </div>
  )
}

function InfoMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'amber' }) {
  const toneClass = tone === 'green' ? 'text-[#0F766E]' : tone === 'amber' ? 'text-[#B7791F]' : 'text-[#10201D]'
  return (
    <div className="rounded-md border border-[#D9ECE8] bg-white/80 px-3 py-2">
      <p className="text-[11px] text-[#6C8580]">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}

function SectionHeading({ icon: Icon, eyebrow, title }: { icon: any; eyebrow: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[#B9DCD6] bg-[#EFF8F6] text-[#0F766E]">
        <Icon size={17} />
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6C8580]">{eyebrow}</p>
        <h3 className="text-base font-semibold text-[#10201D]">{title}</h3>
      </div>
    </div>
  )
}

export default function InfoTab({ ontology }: { ontology: OntologyDetail }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [promptId, setPromptId] = useState('')
  const [modelId, setModelId] = useState('')
  const [modelName, setModelName] = useState('')
  const [taskStatus, setTaskStatus] = useState<any>(() => {
    // Restore last task result for this ontology so P0 report persists after tab-switch
    try {
      const saved = localStorage.getItem(lastTaskKey(ontology.id))
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const streamRef = useRef<AbortController | null>(null)
  const streamTimeoutRef = useRef<number | null>(null)

  const { data: prompts } = useQuery({ queryKey: ['prompts'], queryFn: () => promptApi.list() as any })
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: () => modelApi.list() as any })
  const { data: files = [] } = useQuery({
    queryKey: ['files', ontology.id],
    queryFn: () => ontologyApi.listFiles(ontology.id) as any,
  })

  const extractMut = useMutation({
    mutationFn: (constraints: string[]) =>
      ontologyApi.startExtraction(ontology.id, {
        prompt_id: promptId,
        model_id: modelId,
        model_name: modelName,
        constraints,
      }),
  })

  const finishTaskStatus = (status: any) => {
    setTaskStatus(status)
    if (status.status === 'completed' || status.status === 'failed') {
      try { localStorage.setItem(lastTaskKey(ontology.id), JSON.stringify(status)) } catch {}
      qc.invalidateQueries({ queryKey: ['ontology', ontology.id] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['entities', ontology.id] })
      qc.invalidateQueries({ queryKey: ['logic', ontology.id] })
      qc.invalidateQueries({ queryKey: ['actions', ontology.id] })
    }
  }

  const stopStatusStream = () => {
    streamRef.current?.abort()
    streamRef.current = null
    if (streamTimeoutRef.current) {
      window.clearTimeout(streamTimeoutRef.current)
      streamTimeoutRef.current = null
    }
  }

  const readStatusStream = async (response: Response, taskId: string, controller: AbortController) => {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Streaming response is not readable')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = chunk
          .split('\n')
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart())
          .join('\n')
        if (data) {
          const status = JSON.parse(data)
          finishTaskStatus(status)
          if (status.status === 'completed' || status.status === 'failed') {
            try { localStorage.removeItem(activeTaskKey(ontology.id)) } catch {}
            stopStatusStream()
            return
          }
        }
        boundary = buffer.indexOf('\n\n')
      }
    }

    const current = localStorage.getItem(activeTaskKey(ontology.id))
    if (!controller.signal.aborted && streamRef.current === controller && current === taskId) {
      window.setTimeout(() => startStatusStream(taskId), 5000)
    }
  }

  const startStatusStream = (taskId: string) => {
    stopStatusStream()
    try { localStorage.setItem(activeTaskKey(ontology.id), taskId) } catch {}
    const token = localStorage.getItem('token')
    if (!token) {
      finishTaskStatus({
        status: 'failed',
        progress: { stage: 'error', pct: 0 },
        error: i18n.language.startsWith('zh') ? '登录状态已过期，请重新登录。' : 'Session expired. Please log in again.',
      })
      return
    }

    const controller = new AbortController()
    streamRef.current = controller
    streamTimeoutRef.current = window.setTimeout(() => {
      if (streamRef.current === controller) {
        stopStatusStream()
        setTaskStatus((prev: any) => prev && prev.status !== 'completed' && prev.status !== 'failed'
          ? {
              ...prev,
              status: 'failed',
              error: i18n.language.startsWith('zh')
                ? '等待 LLM 响应超时，请检查模型服务或稍后刷新状态。'
                : 'Timed out waiting for the LLM response. Check the model service or refresh later.',
            }
          : prev)
      }
    }, STREAM_TIMEOUT_MS)

    fetch(ontologyApi.extractionStatusStreamUrl(ontology.id, taskId), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(response => {
        if (!response.ok) throw new Error(`Status stream failed (${response.status})`)
        return readStatusStream(response, taskId, controller)
      })
      .catch(async e => {
        if (controller.signal.aborted) return
        stopStatusStream()
        try {
          const status: any = await ontologyApi.getExtractionStatus(ontology.id, taskId)
          finishTaskStatus(status)
          if (status.status !== 'completed' && status.status !== 'failed') {
            window.setTimeout(() => startStatusStream(taskId), 5000)
          }
        } catch (fallbackError: any) {
          finishTaskStatus({
            status: 'failed',
            progress: { stage: 'error', pct: 0 },
            error: String(fallbackError?.detail || fallbackError?.message || e?.message || e),
          })
        }
      })
  }

  useEffect(() => {
    if (ontology.status === 'failed' && taskStatus && taskStatus.status !== 'completed' && taskStatus.status !== 'failed') {
      try { localStorage.removeItem(activeTaskKey(ontology.id)) } catch {}
      setTaskStatus({
        ...taskStatus,
        status: 'failed',
        error: taskStatus.error || (i18n.language.startsWith('zh') ? '知识建模提取失败，请查看后端日志中的 LLM 错误。' : 'Ontology extraction failed. Check backend logs for the LLM error.'),
      })
    }
  }, [ontology.status, taskStatus, i18n.language])

  useEffect(() => {
    let cancelled = false
    const restoreTask = async () => {
      const activeTaskId = localStorage.getItem(activeTaskKey(ontology.id))
      if (activeTaskId && (!taskStatus || (taskStatus.status !== 'completed' && taskStatus.status !== 'failed'))) {
        startStatusStream(activeTaskId)
        return
      }
      if (!activeTaskId && !taskStatus) {
        try {
          const latest: any = await ontologyApi.getLatestExtraction(ontology.id)
          if (cancelled || !latest) return
          finishTaskStatus(latest)
          if (latest.status !== 'completed' && latest.status !== 'failed') {
            startStatusStream(latest.id)
          }
        } catch {}
      }
    }
    restoreTask()
    return () => { cancelled = true }
  }, [ontology.id])

  useEffect(() => () => {
    stopStatusStream()
  }, [])

  const handleExtract = async () => {
    setTaskStatus({ status: 'running', progress: { stage: 'queued', pct: 0 }, error: null } as any)
    const constraints = getActiveConstraints(loadRuleStates())
    try {
      const res: any = await extractMut.mutateAsync(constraints)
      startStatusStream(res.task_id)
    } catch (e: any) {
      setTaskStatus({
        status: 'failed',
        progress: { stage: 'error', pct: 0 },
        error: String(e?.detail || e?.message || e),
      } as any)
    }
  }

  const selectedModel = (models as any[] | undefined)?.find((m: any) => m.id === modelId)
  const activeConstraints = getActiveConstraints(loadRuleStates())
  const fileList = files as any[]
  const promptOptions = uniquePromptOptions(prompts as any[] | undefined)
  const isExtracting = taskStatus && taskStatus.status !== 'completed' && taskStatus.status !== 'failed'
  const currentPct = taskStatus?.progress?.pct ?? 0
  const currentStage = taskStatus?.progress?.stage ?? ''

  const isPipelineMode = ontology.build_mode === 'pipeline_mapping'
  const isMedical = ontology.domain === '医疗'
  const statusLabel = ontology.status === 'created' ? '已入库' : ontology.status === 'creating' ? '建模中' : ontology.status

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-5">
        <div className="rounded-lg border border-[#B9DCD6] bg-[#F8FCFB] p-5 shadow-sm">
          <SectionHeading icon={Stethoscope} eyebrow={isMedical ? 'Clinical record' : 'Model record'} title={isMedical ? '临床知识模型档案' : t('ontology.tabs.info')} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoMetric label={t('ontology.name')} value={ontology.name} />
            <InfoMetric label={isMedical ? '临床专科域' : t('ontology.domain')} value={ontology.domain} tone={isMedical ? 'green' : 'default'} />
            <InfoMetric label={t('ontology.version')} value={ontology.version} />
            <InfoMetric label={t('ontology.status')} value={statusLabel} tone={ontology.status === 'failed' ? 'amber' : 'green'} />
          </div>
          <div className="mt-4 rounded-md border border-[#D9ECE8] bg-white/75 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6C8580]">
              {isMedical ? 'Scope of care' : t('ontology.desc_optional')}
            </p>
            <p className="mt-2 text-sm leading-6 text-[#334B47]">
              {ontology.description || (isMedical
                ? '覆盖疾病、症状、药物、诊疗流程、禁忌规则与执行动作的结构化知识沉淀。'
                : '暂无描述。')}
            </p>
          </div>
        </div>

        {isPipelineMode && <PipelineMappingInfo ontology={ontology} />}

        {!isPipelineMode && <div className="rounded-lg border border-[#CFE7E2] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <SectionHeading icon={ClipboardCheck} eyebrow="Extraction order" title={isMedical ? '临床知识提取医嘱' : t('extract.llm_config')} />
            {activeConstraints.length > 0 && (
              <span className="mb-4 ml-auto rounded-full border border-[#F1D49B] bg-[#FFF8E8] px-2.5 py-1 text-xs font-medium text-[#B7791F]">
                {t('extract.constraints_active', { count: activeConstraints.length })}
              </span>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#55726D]">{t('extract.prompt_label')}</label>
              <select value={promptId} onChange={e => setPromptId(e.target.value)}
                className="h-10 w-full rounded-md border border-[#CFE7E2] bg-[#F8FCFB] px-3 text-sm text-[#10201D] outline-none transition focus:border-[#0F766E] focus:ring-2 focus:ring-[#B9DCD6]">
                <option value="">{t('extract.select_prompt')}</option>
                {promptOptions.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}（{p.domain}）</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#55726D]">{t('extract.model_label')}</label>
              <select value={modelId} onChange={e => { setModelId(e.target.value); setModelName('') }}
                className="h-10 w-full rounded-md border border-[#CFE7E2] bg-[#F8FCFB] px-3 text-sm text-[#10201D] outline-none transition focus:border-[#0F766E] focus:ring-2 focus:ring-[#B9DCD6]">
                <option value="">{t('extract.select_model')}</option>
                {(models as any[] || []).map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}（{m.provider}）</option>
                ))}
              </select>
            </div>

            {selectedModel && (
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[#55726D]">{t('extract.model_specific')}</label>
              <select value={modelName} onChange={e => setModelName(e.target.value)}
                className="h-10 w-full rounded-md border border-[#CFE7E2] bg-[#F8FCFB] px-3 text-sm text-[#10201D] outline-none transition focus:border-[#0F766E] focus:ring-2 focus:ring-[#B9DCD6]">
                <option value="">{t('extract.select')}</option>
                {(selectedModel.models || []).map((m: string) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            )}

          <div className="flex items-center gap-3 pt-1 lg:col-span-2">
            <button
              onClick={handleExtract}
              disabled={!promptId || !modelId || !modelName || extractMut.isPending || isExtracting || fileList.length === 0}
              className="flex h-10 items-center gap-2 rounded-md bg-[#0F766E] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0B5F58] disabled:opacity-40">
              {isExtracting && <Loader2 size={14} className="animate-spin" />}
              {isExtracting ? t('extract.extracting') : t('extract.start')}
            </button>
            {fileList.length === 0 && (
              <span className="text-xs text-[#B7791F]">{t('extract.need_files')}</span>
            )}
          </div>
          </div>
        </div>}

        {!isPipelineMode && taskStatus && (
        <div className={`rounded-lg border p-5 shadow-sm ${taskStatus.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-[#CFE7E2] bg-white'}`}>
          <SectionHeading icon={Activity} eyebrow="Care pathway" title={isMedical ? '临床抽取轨迹' : t('extract.progress')} />

          {taskStatus.status === 'failed' ? (
            <div className="flex items-start gap-2 text-red-600">
              <XCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{t('extract.failed')}</p>
                <p className="text-xs mt-0.5 text-red-500">{taskStatus.error}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Stage steps */}
              <div className="flex items-center mb-5 overflow-x-auto pb-1">
                {STAGE_KEYS.map((stage, i) => {
                  const stagePct = STAGE_PCT[stage.key] ?? 0
                  const passed = currentPct >= stagePct
                  const done = taskStatus.status === 'completed'
                  return (
                    <div key={stage.key} className="flex items-center flex-shrink-0">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                          passed
                            ? done ? 'bg-[#0F766E] text-white' : 'bg-[#2563EB] text-white'
                            : 'bg-[#EFF8F6] text-[#8AA39E]'
                        }`}>
                          {passed && done ? <CheckCircle size={14} /> : i + 1}
                        </div>
                        <span className={`whitespace-nowrap text-xs ${passed ? 'text-[#334B47]' : 'text-[#8AA39E]'}`}>
                          {t(stage.i18nKey)}
                        </span>
                      </div>
                      {i < STAGE_KEYS.length - 1 && (
                        <ChevronRight size={14} className="mx-2 mb-4 flex-shrink-0 text-[#B9DCD6]" />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full rounded-full bg-[#E2EFEC]">
                <div
                  className={`h-2 rounded-full transition-all duration-700 ${
                    taskStatus.status === 'completed' ? 'bg-[#0F766E]' : 'bg-[#2563EB]'
                  }`}
                  style={{ width: `${currentPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-[#6C8580]">{currentPct}%{currentStage ? ` · ${currentStage}` : ''}</p>
            </>
          )}
        </div>
        )}

        {!isPipelineMode && taskStatus?.validation_report && (
          <ValidationReportCard report={taskStatus.validation_report} />
        )}
      </div>

      <aside className="space-y-5">
        <div className="rounded-lg border border-[#CFE7E2] bg-white p-5 shadow-sm">
          <SectionHeading icon={ShieldCheck} eyebrow="Handoff" title={t('extract.export')} />
          <div className="flex flex-wrap gap-2">
          {['json', 'yaml', 'csv', 'ttl', 'html'].map(fmt => (
            <a key={fmt} href={ontologyApi.exportUrl(ontology.id, fmt)}
              className="rounded-md border border-[#CFE7E2] bg-[#F8FCFB] px-3 py-1.5 font-mono text-sm text-[#334B47] transition hover:border-[#0F766E] hover:text-[#0F766E]"
              download>
              {fmt.toUpperCase()}
            </a>
          ))}
          </div>
        </div>

        <div className="rounded-lg border border-[#D9ECE8] bg-white/80 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#10201D]">
            <FileText size={16} className="text-[#0F766E]" />
            建模审阅提示
          </div>
          <p className="text-sm leading-6 text-[#55726D]">
            {isMedical
              ? '建议先确认疾病、药物、症状和诊疗流程的命名一致性，再进入图谱与规则审阅。'
              : '建议先确认实体命名与资料来源，再进入图谱和规则审阅。'}
          </p>
        </div>
      </aside>
    </div>
  )
}
