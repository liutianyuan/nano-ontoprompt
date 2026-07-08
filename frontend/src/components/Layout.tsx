import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  Globe2,
  LayoutDashboard,
  LogOut,
  Network,
  Settings,
} from 'lucide-react'

export default function Layout({ children }: { children: React.ReactNode }) {
  const logout = useAuthStore(s => s.logout)
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const { lang, setLang } = useUIStore()
  const [collapsed, setCollapsed] = useState(false)

  const navItems = [
    { to: '/overview', icon: LayoutDashboard, label: t('nav.overview'), desc: '监测全局态势' },
    { to: '/pipelines', icon: Database, label: t('nav.pipelines'), desc: '接入与清洗' },
    { to: '/ontologies', icon: Network, label: t('nav.ontologies'), desc: '知识建模' },
    { to: '/models', icon: Cpu, label: t('nav.models'), desc: '模型服务' },
    { to: '/settings', icon: Settings, label: t('nav.settings'), desc: '治理参数' },
  ]

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <aside className={`app-sidebar flex flex-col transition-all duration-200 ${collapsed ? 'w-[76px]' : 'w-[268px]'}`}>
        <div className={`border-b border-white/10 p-4 ${collapsed ? 'text-center' : ''}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#3BAE9F]/40 bg-[#0F766E]/25 text-[#9FD4CD]">
              <Activity size={20} />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-white">知识编织平台</h1>
                <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.16em] text-[#9FD4CD]">Clinical ontology ops</p>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {navItems.map(({ to, icon: Icon, label, desc }) => {
            const active = location.pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={`group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
                  active
                    ? 'bg-[#E8F7F4] text-[#073B35] shadow-sm'
                    : 'text-[#C8DBD7] hover:bg-white/[0.08] hover:text-white'
                }`}
                title={collapsed ? label : undefined}
              >
                <Icon size={17} className="shrink-0" />
                {!collapsed && (
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{label}</span>
                    <span className={`block truncate text-[11px] ${active ? 'text-[#406A64]' : 'text-[#7EA7A0]'}`}>{desc}</span>
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          {!collapsed && (
            <div className="mb-3 rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#7EA7A0]">Active operator</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{user?.username || 'admin'}</p>
              <button
                onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                className="mt-3 inline-flex items-center gap-1.5 rounded border border-white/[0.15] px-2 py-1 text-xs text-[#C8DBD7] transition hover:border-[#9FD4CD] hover:text-white"
              >
                <Globe2 size={12} />
                {lang === 'zh' ? '中文' : 'English'}
              </button>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="mb-2 flex w-full items-center justify-center rounded-md border border-white/10 p-2 text-[#9FD4CD] transition hover:border-[#9FD4CD] hover:text-white"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[#C8DBD7] transition hover:bg-white/[0.08] hover:text-white ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut size={16} /> {!collapsed && t('nav.logout')}
          </button>
        </div>
      </aside>

      <main className="app-main flex-1 overflow-auto">
        <div className="mx-auto min-h-full max-w-[1500px] p-5 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
