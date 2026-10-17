type Listener = () => void;

const listeners = new Set<Listener>();

export function openProtocolSignIn() {
  listeners.forEach((listener) => listener());
}

export function subscribeProtocolSignIn(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
