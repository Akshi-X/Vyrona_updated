import { useState } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmClassName?: string;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmClassName = 'px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-[#8a2a95] transition-colors',
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  // Portaled to <body> so the backdrop always covers the full viewport
  // (including the sidebar) — rendered in place, a `fixed` element only
  // escapes the sidebar if none of its ancestors create a containing block
  // (transform/filter/etc), which isn't guaranteed from every call site.
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`${confirmClassName} inline-flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed`}
          >
            {loading && (
              <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2a10 10 0 0 1 0 20" />
              </svg>
            )}
            {loading ? 'Removing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
