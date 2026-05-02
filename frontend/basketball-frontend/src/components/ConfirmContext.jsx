import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmContext } from "./ConfirmContextValue";

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const cancelButtonRef = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    setRequest({
      title: options?.title || "Are you sure?",
      message: options?.message || "This action cannot be undone.",
      confirmLabel: options?.confirmLabel || "Confirm",
      tone: options?.tone || "danger",
      resolve,
    });
  }), []);

  const close = useCallback((answer) => {
    if (request?.resolve) request.resolve(answer);
    setRequest(null);
  }, [request]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  useEffect(() => {
    if (!request) return undefined;

    const previousActiveElement = document.activeElement;
    cancelButtonRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        close(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [close, request]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request && (
        <div className="sim-modal-backdrop" onClick={() => close(false)}>
          <div className="confirm-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <p className="page-kicker">Confirmation</p>
            <h3 className="confirm-modal__title">{request.title}</h3>
            <p className="confirm-modal__copy">{request.message}</p>
            <div className="confirm-modal__actions">
              <button ref={cancelButtonRef} type="button" className="btn-secondary" onClick={() => close(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={request.tone === "danger" ? "btn-danger" : "btn-primary"}
                onClick={() => close(true)}
              >
                {request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
