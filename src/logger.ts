export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold = LEVEL_ORDER.info;

export function setLogLevel(level: LogLevel): void {
  threshold = LEVEL_ORDER[level];
}

export function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < threshold) {
    return;
  }

  const line = context && Object.keys(context).length > 0
    ? `${new Date().toISOString()} [${level}] ${message} ${JSON.stringify(context)}`
    : `${new Date().toISOString()} [${level}] ${message}`;

  process.stderr.write(`${line}\n`);
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
