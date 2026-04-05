import { createContext, useCallback, useContext, useRef, useState } from "react";
import ReactDOM from "react-dom";

const ToastContext = createContext(null);

const TOAST_META = {
  info: {
    icon: "i",
    title: "Notice"
  },
  success: {
    icon: "OK",
    title: "Success"
  },
  danger: {
    icon: "!",
    title: "Something went wrong"
  }
};

const TOAST_DURATION_MS = 60000;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, type: 'info'|'success'|'danger' }
  const timerRef = useRef(null);

  const showToast = useCallback((message, type = "info") => {
    if (!message) return;
    clearTimeout(timerRef.current);
    setToast({ message, type });
    if (type !== "success") {
      timerRef.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
      return;
    }
    timerRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  const toastMeta = toast ? TOAST_META[toast.type] || TOAST_META.info : TOAST_META.info;

  const popup = toast
    ? ReactDOM.createPortal(
        <div
          className="app-toast-overlay"
          role="dialog"
          aria-modal="true"
          aria-live="assertive"
          onClick={(e) => e.target === e.currentTarget && dismiss()}
        >
          <div className={`app-toast app-toast-${toast.type}`}>
            <div className="app-toast__head">
              <span className="app-toast__icon" aria-hidden="true">{toastMeta.icon}</span>
              <div className="app-toast__copy">
                <strong className="app-toast__title">{toastMeta.title}</strong>
                <div className="app-toast__text">{toast.message}</div>
              </div>
            </div>
            <button type="button" onClick={dismiss} aria-label="Dismiss">
              OK
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {popup}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
