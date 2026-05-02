import { useEffect, useRef } from "react";

const selectedCount = (selections) =>
  Object.values(selections).filter(Boolean).length;

export default function PdfExportModal({
  isOpen,
  title,
  subtitle,
  options,
  selections,
  onToggle,
  onClose,
  onConfirm,
  confirmLabel = "Export PDF",
  loading = false,
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousActiveElement = document.activeElement;
    closeButtonRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !loading) {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const enabledCount = selectedCount(selections);

  return (
    <div className="sim-modal-backdrop" onClick={loading ? undefined : onClose}>
      <div className="sim-modal export-config-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title" onClick={(event) => event.stopPropagation()}>
        <div className="sim-modal-header">
          <div>
            <h3 id="pdf-export-title" className="sim-modal-title">{title}</h3>
            <p className="sim-modal-copy">{subtitle}</p>
          </div>
          <div className="sim-modal-actions">
            <button ref={closeButtonRef} type="button" onClick={onClose} disabled={loading} className="btn-secondary">
              Close
            </button>
          </div>
        </div>

        <div className="sim-modal-summary">
          <span className="sim-summary-label">Selected sections</span>
          <span className="sim-summary-value">{enabledCount}</span>
        </div>

        <div className="export-config-body">
          <div className="export-config-grid">
            {options.map((option) => {
              const checked = Boolean(selections[option.key]);

              return (
                <label
                  key={option.key}
                  className={`export-config-option ${checked ? "is-selected" : ""}`}
                >
                  <div className="export-config-option__control">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(option.key)}
                    />
                  </div>
                  <div className="export-config-option__body">
                    <div className="export-config-option__title">{option.label}</div>
                    <div className="export-config-option__copy">{option.description}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="export-config-actions">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || enabledCount === 0}
            className="btn-primary"
          >
            {loading ? "Exporting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
