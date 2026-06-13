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

export const BUFFER_SIZE = 100;
export const BODY_LIMIT = 100_000;

type Subscriber = (entry: LogEntry) => void;

type DevLogStore = {
  push(entry: LogEntry): void;
  subscribe(fn: Subscriber): () => void;
  getBuffer(): LogEntry[];
  configure(options: { bufferSize: number }): void;
};

declare global {
  // eslint-disable-next-line no-var
  var __devLogStore: DevLogStore | undefined;
}

function createStore(): DevLogStore {
  const subscribers = new Set<Subscriber>();
  const buffer: LogEntry[] = [];
  let limit = BUFFER_SIZE;
  return {
    push(entry) {
      buffer.push(entry);
      if (buffer.length > limit) buffer.shift();
      subscribers.forEach((fn) => fn(entry));
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    getBuffer() {
      return buffer.slice();
    },
    configure({ bufferSize }) {
      limit = bufferSize;
      while (buffer.length > limit) buffer.shift();
    },
  };
}

export const devLogStore: DevLogStore =
  globalThis.__devLogStore ?? (globalThis.__devLogStore = createStore());
