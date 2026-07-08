interface Props {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
}

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel = '确认删除' }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10201D]/55 p-4">
      <div className="w-full max-w-sm rounded-lg border border-[#CFE7E2] bg-white p-6 shadow-[0_24px_70px_rgba(16,32,29,0.25)]">
        <p className="page-kicker text-red-600">Confirm action</p>
        <h3 className="mt-2 text-lg font-semibold text-[#10201D]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#55726D]">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="medical-secondary h-9 px-4 text-sm">取消</button>
          <button onClick={onConfirm} className="h-9 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
