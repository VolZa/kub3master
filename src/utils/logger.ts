export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  ERROR = 'ERROR',
}

export function log(level: LogLevel, message: string, data?: any) {
  const entry = {
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  console.log(JSON.stringify(entry));
}
