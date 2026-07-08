import { useForm } from 'react-hook-form'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Activity, UserPlus } from 'lucide-react'

export default function RegisterPage() {
  const { register, handleSubmit } = useForm<{ username: string; email: string; password: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (data: { username: string; email: string; password: string }) => {
    setLoading(true)
    setError('')
    try {
      await authApi.register(data.username, data.email, data.password)
      navigate('/login')
    } catch (e: any) {
      setError(e?.message || '注册失败，请检查信息')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4FAF8] p-6">
      <div className="w-full max-w-[430px]">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[#0F766E] text-white">
            <Activity size={22} />
          </span>
          <div>
            <h1 className="font-semibold text-[#10201D]">知识编织平台</h1>
            <p className="text-xs uppercase tracking-[0.14em] text-[#0F766E]">Clinical ontology ops</p>
          </div>
        </div>

        <div className="medical-panel p-7">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-[#B9DCD6] bg-[#EFF8F6] text-[#0F766E]">
              <UserPlus size={20} />
            </span>
            <div>
              <p className="page-kicker">Operator enrollment</p>
              <h2 className="mt-1 text-2xl font-semibold text-[#10201D]">{t('auth.register')}</h2>
              <p className="mt-1 text-sm text-[#55726D]">创建一个可进入知识工程工作台的操作员账号。</p>
            </div>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334B47]">{t('auth.username')}</label>
              <input {...register('username', { required: true })} className="medical-input w-full px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334B47]">{t('auth.email')}</label>
              <input {...register('email', { required: true })} type="email" className="medical-input w-full px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#334B47]">{t('auth.password')}</label>
              <input {...register('password', { required: true })} type="password" className="medical-input w-full px-3 py-2 text-sm" />
            </div>
            {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="medical-primary h-10 w-full text-sm disabled:opacity-50">
              {loading ? t('common.loading') : t('auth.register')}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-[#55726D]">
            {t('auth.have_account')} <Link to="/login" className="font-medium text-[#0F766E] underline">{t('auth.login')}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
