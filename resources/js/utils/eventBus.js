// Minimal pub/sub so code outside the React tree (axios, utils) can still
// raise the same styled toast every page uses. ToastProvider subscribes once.
function createBus() {
  const listeners = new Set();
  return {
    emit(payload) {
      listeners.forEach((fn) => {
        try { fn(payload); } catch (e) { console.error(e); }
      });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const toastBus = createBus();
export const showToast = (toast) => toastBus.emit(toast);
