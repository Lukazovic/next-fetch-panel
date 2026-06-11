let _isOpen = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export const panelState = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  getSnapshot() {
    return _isOpen;
  },
  open() {
    if (!_isOpen) { _isOpen = true; notify(); }
  },
  close() {
    if (_isOpen) { _isOpen = false; notify(); }
  },
  toggle() {
    _isOpen = !_isOpen;
    notify();
  },
};
