import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ontologyApi, promptApi, modelApi } from '@/api/ontologies'
import { CheckCircle, XCircle, Loader2, ChevronRight, AlertTriangle, AlertCircle, Info } from 'lucide-react'
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
    <div className="bg-white rounded-xl border p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Pipeline Mapping 状态</span>
        <span className="px-2 py-0.5 rounded text-xs bg-blue-50 border border-blue-200 text-blue-700">🔄 Pipeline 模式</span>
      </div>
      {mappings.length === 0 ? (
        <p className="text-sm text-gray-400">暂无 Mapping 配置。请先在 Pipelines → Curated Datasets 中审批数据，然后在新建知识建模时配置 Mapping。</p>
      ) : (
        <div className="space-y-2">
          {mappings.map((m: any) => (
            <div key={m.mapping_id || m.id} className="border rounded-lg px-3 py-2 text-sm flex items-center justify-between">
              <div>
                <span className="font-medium">{m.entity_class}</span>
                {m.entity_class_cn && <span className="text-gray-400 ml-2">({m.entity_class_cn})</span>}
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded border ${m.status === 'active' ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'}`}>
                {m.status || 'draft'}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="pt-2 border-t flex gap-2">
        <a href="/pipelines/curated" className="text-xs text-blue-600 hover:underline">→ 查看 Curated Datasets</a>
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

  return (
    <div className="space-y-5">
      {/* Basic Info */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4">{t('ontology.tabs.info')}</h3>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div><dt className="text-xs text-gray-500 mb-0.5">{t('ontology.name')}</dt><dd className="font-medium">{ontology.name}</dd></div>
          <div><dt className="text-xs text-gray-500 mb-0.5">{t('ontology.domain')}</dt><dd>{ontology.domain}</dd></div>
          <div><dt className="text-xs text-gray-500 mb-0.5">{t('ontology.version')}</dt><dd className="font-mono">{ontology.version}</dd></div>
          <div><dt className="text-xs text-gray-500 mb-0.5">{t('ontology.status')}</dt><dd>{ontology.status}</dd></div>
          <div>
            <dt className="text-xs text-gray-500 mb-0.5">构建方式</dt>
            <dd>
              {isPipelineMode
                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-50 border border-blue-200 text-blue-700">🔄 Pipeline Mapping</span>
                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-50 border border-amber-200 text-amber-700">⚡ 简易 LLM 提取</span>
              }
            </dd>
          </div>
          {ontology.description && (
            <div className="col-span-2"><dt className="text-xs text-gray-500 mb-0.5">{t('ontology.desc_optional')}</dt><dd className="text-gray-700">{ontology.description}</dd></div>
          )}
        </dl>
      </div>

      {/* Pipeline Mapping 状态（仅 pipeline_mapping 模式显示） */}
      {isPipelineMode && <PipelineMappingInfo ontology={ontology} />}

      {/* LLM Config（仅简易模式显示） */}
      {!isPipelineMode && <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-semibold">{t('extract.llm_config')}</h3>
          {activeConstraints.length > 0 && (
            <span className="ml-auto text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
              {t('extract.constraints_active', { count: activeConstraints.length })}
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('extract.prompt_label')}</label>
            <select value={promptId} onChange={e => setPromptId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">{t('extract.select_prompt')}</option>
              {promptOptions.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}（{p.domain}）</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('extract.model_label')}</label>
            <select value={modelId} onChange={e => { setModelId(e.target.value); setModelName('') }}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">{t('extract.select_model')}</option>
              {(models as any[] || []).map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}（{m.provider}）</option>
              ))}
            </select>
          </div>

          {selectedModel && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('extract.model_specific')}</label>
              <select value={modelName} onChange={e => setModelName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">{t('extract.select')}</option>
                {(selectedModel.models || []).map((m: string) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          <div className="pt-1 flex items-center gap-3">
            <button
              onClick={handleExtract}
              disabled={!promptId || !modelId || !modelName || extractMut.isPending || isExtracting || fileList.length === 0}
              className="px-5 py-2 bg-black text-white rounded-lg text-sm disabled:opacity-40 flex items-center gap-2">
              {isExtracting && <Loader2 size={14} className="animate-spin" />}
              {isExtracting ? t('extract.extracting') : t('extract.start')}
            </button>
            {fileList.length === 0 && (
              <span className="text-xs text-gray-400">{t('extract.need_files')}</span>
            )}
          </div>
        </div>
      </div>}

      {/* Extraction Progress */}
      {!isPipelineMode && taskStatus && (
        <div className={`bg-white rounded-xl border p-6 ${taskStatus.status === 'failed' ? 'border-red-200 bg-red-50' : ''}`}>
          <h3 className="font-semibold mb-4">{t('extract.progress')}</h3>

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
                            ? done ? 'bg-green-500 text-white' : 'bg-black text-white'
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          {passed && done ? <CheckCircle size={14} /> : i + 1}
                        </div>
                        <span className={`text-xs whitespace-nowrap ${passed ? 'text-gray-700' : 'text-gray-400'}`}>
                          {t(stage.i18nKey)}
                        </span>
                      </div>
                      {i < STAGE_KEYS.length - 1 && (
                        <ChevronRight size={14} className="text-gray-300 mx-2 flex-shrink-0 mb-4" />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-700 ${
                    taskStatus.status === 'completed' ? 'bg-green-500' : 'bg-black'
                  }`}
                  style={{ width: `${currentPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">{currentPct}%{currentStage ? ` · ${currentStage}` : ''}</p>
            </>
          )}
        </div>
      )}

      {/* Validation Report */}
      {!isPipelineMode && taskStatus?.validation_report && (
        <ValidationReportCard report={taskStatus.validation_report} />
      )}

      {/* Export */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4">{t('extract.export')}</h3>
        <div className="flex gap-2 flex-wrap">
          {['json', 'yaml', 'csv', 'ttl', 'html'].map(fmt => (
            <a key={fmt} href={ontologyApi.exportUrl(ontology.id, fmt)}
              className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 font-mono text-gray-700"
              download>
              {fmt.toUpperCase()}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
