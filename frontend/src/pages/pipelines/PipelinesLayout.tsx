import { Outlet, useLocation } from 'react-router-dom'
import { Database } from 'lucide-react'

export default function PipelinesLayout() {
  const location = useLocation()

  const isBuilder = /^\/pipelines\/(?!connections|datasets|transforms|curated$)[a-f0-9-]+$/i.test(location.pathname)

  if (isBuilder) {
    return <Outlet />
  }

  return (
    <div className="space-y-5">
      <section className="medical-panel-strong p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-md border border-[#B9DCD6] bg-white/70 text-[#0F766E]">
            <Database size={22} />
          </span>
          <div>
            <p className="page-kicker">Data circulation</p>
            <h1 className="page-title mt-2">数据管道</h1>
            <p className="page-subtitle mt-2">从连接、数据集、转换到 Curated Dataset 的全链路工作台。</p>
          </div>
        </div>
      </section>
      <Outlet />
    </div>
  )
}
