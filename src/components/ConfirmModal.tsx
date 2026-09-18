// Same visual shell as the other modals (InputParameterModal, UpdatePlanningModal,
// BreakSettingsModal): dim overlay, black body, cyan-500 border, cyan-900/40
// header bar with a green-400 title and a ✕ close button.
export default function ConfirmModal({
  title, message, confirmLabel = 'OK', onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onCancel}>
      <div
        className="bg-black border-2 border-cyan-500 text-white text-xs max-w-md w-[90vw] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-cyan-900/40 px-3 py-2 border-b border-cyan-500/50">
          <span className="font-bold text-green-400">{title}</span>
          <button className="text-gray-300 hover:text-white text-base" onClick={onCancel} title="Tutup">✕</button>
        </div>
        <div className="p-4 space-y-4">
          <p>{message}</p>
          <div className="flex justify-end gap-2">
            <button className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600" onClick={onCancel}>
              Batal
            </button>
            <button className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 font-bold" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
