import { BUFFER_SIZE, BODY_LIMIT, type LogEntry } from "../domain";

export type { LogEntry };
export { BUFFER_SIZE, BODY_LIMIT };

type Subscriber = (entry: LogEntry) => void;

type DevLogStore = {
  push(entry: LogEntry): void;
  subscribe(fn: Subscriber): () => void;
  getBuffer(): LogEntry[];
  configure(options: { bufferSize: number }): void;
};

declare global {
  var __devLogStore: DevLogStore | undefined;
}

export function createStore(): DevLogStore {
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
