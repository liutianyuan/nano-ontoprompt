import { useForm } from 'react-hook-form'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/api/auth'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Activity, LockKeyhole, Network, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const { register, handleSubmit } = useForm<{ username: string; password: string }>()
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (data: { username: string; password: string }) => {
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login(data.username, data.password) as any
      localStorage.setItem('token', res.access_token)
      const profile = await authApi.profile() as any
      setAuth(profile, res.access_token)
      navigate('/')
    } catch {
      localStorage.removeItem('token')
      setError(t('auth.login_error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F4FAF8]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="relative hidden overflow-hidden bg-[#10201D] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 opacity-40">
            <div className="absolute left-10 top-20 h-64 w-64 rounded-full bg-[#0F766E]/30 blur-3xl" />
            <div className="absolute bottom-20 right-16 h-72 w-72 rounded-full bg-[#2563EB]/20 blur-3xl" />
          </div>
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md border border-[#9FD4CD]/30 bg-white/10">
                <Activity size={22} />
              </span>
              <div>
                <h1 className="text-lg font-semibold">知识编织平台</h1>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#9FD4CD]">Clinical ontology ops</p>
              </div>
            </div>
            <div className="mt-24 max-w-2xl">
              <p className="page-kicker text-[#9FD4CD]">Medical knowledge workspace</p>
              <h2 className="mt-4 text-5xl font-semibold leading-tight tracking-normal">
                把临床文档、规则和图谱整理成可审阅的知识工程流。
              </h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#C8DBD7]">
                用同一张工作台管理资料接入、知识建模、LLM 提取、规则质控和图谱交付。
              </p>
            </div>
          </div>
          <div className="relative grid grid-cols-3 gap-3">
            {[
              { icon: Network, label: 'Ontology graph', value: '结构化关系' },
              { icon: ShieldCheck, label: 'Quality guard', value: '质控规则' },
              { icon: LockKeyhole, label: 'Secure access', value: '权限登录' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-md border border-white/[0.12] bg-white/[0.08] p-4">
                <Icon size={18} className="text-[#9FD4CD]" />
                <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-[#7EA7A0]">{label}</p>
                <p className="mt-1 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-6">
          <div className="w-full max-w-[390px]">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0F766E] text-white">
                  <Activity size={20} />
                </span>
                <div>
                  <h1 className="font-semibold text-[#10201D]">知识编织平台</h1>
                  <p className="text-xs text-[#55726D]">Clinical ontology ops</p>
                </div>
              </div>
            </div>
            <div className="medical-panel p-7">
              <p className="page-kicker">Operator sign in</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#10201D]">{t('auth.login')}</h2>
              <p className="mt-2 text-sm leading-6 text-[#55726D]">进入知识建模、数据管道和模型治理工作台。</p>
              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#334B47]">{t('auth.username')}</label>
                  <input {...register('username', { required: true })} placeholder="admin" className="medical-input w-full px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#334B47]">{t('auth.password')}</label>
                  <input {...register('password', { required: true })} type="password" placeholder="password" className="medical-input w-full px-3 py-2 text-sm" />
                </div>
                {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
                <button type="submit" disabled={loading} className="medical-primary h-10 w-full text-sm disabled:opacity-50">
                  {loading ? t('common.loading') : t('auth.login')}
                </button>
              </form>
              <p className="mt-5 text-center text-sm text-[#55726D]">
                {t('auth.no_account')} <Link to="/register" className="font-medium text-[#0F766E] underline">{t('auth.register')}</Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
