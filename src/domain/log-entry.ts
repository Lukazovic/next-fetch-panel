export type LogEntry = {
  id: string;
  url: string;
  method: string;
  status: number | null;
  statusText: string | null;
  duration: number;
  timestamp: number;
  error?: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string | null;
  responseBody: string | null;
  requestBodyTruncated?: boolean;
  responseBodyTruncated?: boolean;
  sessionId: string | null;
};

export const BUFFER_SIZE = 100;
export const BODY_LIMIT = 50_000;
