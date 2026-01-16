/**
 * Application Logger
 *
 * Centralized logging utility with conditional logging based on environment.
 * Provides different log levels and can be easily disabled in production.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  minLevel: LogLevel;
  prefix?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Get logger configuration from environment
 */
function getLoggerConfig(): LoggerConfig {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isDebugEnabled = process.env.NEXT_PUBLIC_DEBUG === 'true';

  return {
    enabled: isDevelopment || isDebugEnabled,
    minLevel: (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) || 'debug',
  };
}

const config = getLoggerConfig();

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  if (!config.enabled) return false;
  return LOG_LEVELS[level] >= LOG_LEVELS[config.minLevel];
}

/**
 * Format log message with context
 */
function formatMessage(context: string, message: string, ...args: unknown[]): [string, ...unknown[]] {
  return [`[${context}] ${message}`, ...args];
}

/**
 * Create a logger instance for a specific context
 */
export function createLogger(context: string) {
  return {
    debug: (message: string, ...args: unknown[]) => {
      if (shouldLog('debug')) {
        console.log(...formatMessage(context, message, ...args));
      }
    },

    info: (message: string, ...args: unknown[]) => {
      if (shouldLog('info')) {
        console.info(...formatMessage(context, message, ...args));
      }
    },

    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog('warn')) {
        console.warn(...formatMessage(context, message, ...args));
      }
    },

    error: (message: string, ...args: unknown[]) => {
      if (shouldLog('error')) {
        console.error(...formatMessage(context, message, ...args));
      }
    },

    // Utility to log only in development
    dev: (message: string, ...args: unknown[]) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(...formatMessage(context, `[DEV] ${message}`, ...args));
      }
    },
  };
}

/**
 * Default logger instance
 */
export const logger = createLogger('App');

/**
 * Type for logger instance
 */
export type Logger = ReturnType<typeof createLogger>;
