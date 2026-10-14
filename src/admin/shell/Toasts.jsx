import { Icon } from '../components'

export function ToastRegion({ toasts, remove, hold, resume }) {
  return <div className="ds-toast-region" aria-live="polite" aria-relevant="additions">
    {toasts.map(toast => <div key={toast.id} className={`admin-toast${toast.failed ? ' admin-toast--error' : ''}${toast.leaving ? ' is-leaving' : ''}`} role={toast.failed ? 'alert' : 'status'} onPointerEnter={() => hold(toast.id)} onPointerLeave={() => resume(toast.id, toast.failed)} onFocus={() => hold(toast.id)} onBlur={() => resume(toast.id, toast.failed)}>
      <Icon name={toast.failed ? 'alertCircle' : 'checkCircle'} />
      <span>{toast.message}</span>
      <button type="button" className="admin-icon-button" aria-label="Fechar aviso" onClick={() => remove(toast.id)}><Icon name="close" size={16} /></button>
    </div>)}
  </div>
}
