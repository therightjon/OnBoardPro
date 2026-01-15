/**
 * Lightweight Logging Utility
 *
 * Provides environment-aware logging with log levels.
 * In production, debug logs are suppressed to avoid noise and performance impact.
 *
 * Usage:
 *   import { logger } from './utils/logger';
 *   logger.debug('Detailed info', { key: 'value' });
 *   logger.info('Application started');
 *   logger.warn('Deprecated API used');
 *   logger.error('Failed to connect', error);
 *
 * Environment:
 *   - LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error' | 'silent' (default: 'info' in production, 'debug' in development)
 *   - NODE_ENV: 'development' | 'production' | 'test'
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && LOG_LEVEL_PRIORITY[envLevel] !== undefined) {
    return envLevel;
  }

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'test') {
    return 'silent'; // Suppress logs during tests by default
  }
  if (nodeEnv === 'production') {
    return 'info'; // Only info and above in production
  }
  return 'debug'; // Full logging in development
}

function shouldLog(level: LogLevel): boolean {
  const currentLevel = getLogLevel();
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

function formatMessage(level: string, message: string, context?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `${timestamp} [${level.toUpperCase()}] ${message}${contextStr}`;
}

/**
 * Logger with environment-aware log levels.
 *
 * - debug: Development-only verbose logs (disabled in production)
 * - info: General operational messages
 * - warn: Warning conditions that should be addressed
 * - error: Error conditions that require attention
 */
export const logger = {
  /**
   * Debug-level logging - only visible in development.
   * Use for detailed debugging information during development.
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, context));
    }
  },

  /**
   * Info-level logging - visible in development and production.
   * Use for general operational messages like startup, shutdown, major state changes.
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, context));
    }
  },

  /**
   * Warn-level logging - visible in development and production.
   * Use for potentially problematic conditions that don't prevent operation.
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, context));
    }
  },

  /**
   * Error-level logging - visible in development and production.
   * Use for error conditions that require attention.
   */
  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    if (shouldLog('error')) {
      const errorContext = {
        ...context,
        ...(error instanceof Error
          ? { errorName: error.name, errorMessage: error.message }
          : error !== undefined
            ? { error: String(error) }
            : {}),
      };
      console.error(formatMessage('error', message, errorContext));
      if (error instanceof Error && error.stack && process.env.NODE_ENV !== 'production') {
        console.error(error.stack);
      }
    }
  },

  /**
   * Check if a given log level would be output.
   * Useful for avoiding expensive log message construction.
   */
  isEnabled(level: LogLevel): boolean {
    return shouldLog(level);
  },
};

export type Logger = typeof logger;
