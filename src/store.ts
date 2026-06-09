export type LogEntry = {
  id: string;
  url: string;
  method: string;
  status: number | null;
  statusText: string | null;
  duration: number;
  ts: number;
  error?: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string | null;
  responseBody: string | null;
  sessionId: string | null;
};

const BUFFER_SIZE = 100;

type Subscriber = (entry: LogEntry) => void;

type DevLogStore = {
  push(entry: LogEntry): void;
  subscribe(fn: Subscriber): () => void;
  getBuffer(): LogEntry[];
};

declare global {
  // eslint-disable-next-line no-var
  var __devLogStore: DevLogStore | undefined;
}

function createStore(): DevLogStore {
  const subscribers = new Set<Subscriber>();
  const buffer: LogEntry[] = [];
  return {
    push(entry) {
      buffer.push(entry);
      if (buffer.length > BUFFER_SIZE) buffer.shift();
      subscribers.forEach((fn) => fn(entry));
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    getBuffer() {
      return buffer.slice();
    },
  };
}

export const devLogStore: DevLogStore =
  globalThis.__devLogStore ?? (globalThis.__devLogStore = createStore());
