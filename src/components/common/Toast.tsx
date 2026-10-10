import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'status';

export interface ToastProps {
  message: string;
  kind?: ToastKind;
  onClose?: () => void;
  onRetry?: () => void;
  reauthRequired?: boolean;
  className?: string;
  actions?: ReactNode;
}

export function Toast({
  message,
  kind = 'status',
  onClose,
  onRetry,
  reauthRequired,
  className,
  actions,
}: ToastProps) {
  if (!message) return null;

  const role = kind === 'error' ? 'alert' : 'status';
  const kindClass = kind === 'error' ? 'toast-error error' : kind === 'success' ? 'success' : '';
  const fullClassName = ['toast', kindClass, className].filter(Boolean).join(' ');

  return (
    <div className={fullClassName} role={role}>
      <span>{message}</span>
      {(actions || onRetry || reauthRequired || onClose) && (
        <div className="toast-actions">
          {actions}
          {onRetry && (
            <button onClick={onRetry} type="button">
              重新嘗試
            </button>
          )}
          {reauthRequired && (
            <button onClick={() => window.location.assign('/login')} type="button">
              重新登入
            </button>
          )}
          {onClose && (
            <button aria-label="關閉通知" onClick={onClose} type="button">
              <X aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
