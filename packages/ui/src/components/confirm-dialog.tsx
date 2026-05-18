'use client';

import { Button } from './button.js';
import { Dialog } from './dialog.js';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void | Promise<void>;
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: 'default' | 'danger';
  readonly busy?: boolean;
  readonly children?: React.ReactNode;
}

/**
 * Confirmation dialog for destructive / state-changing actions. Disables
 * confirm while `busy=true` (the caller drives this via mutation state).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  busy = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'primary'}
            type="button"
            onClick={() => onConfirm()}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? (
        <p className="text-sm text-muted-foreground">
          {description ?? 'Are you sure you want to continue?'}
        </p>
      )}
    </Dialog>
  );
}
