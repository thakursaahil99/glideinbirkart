import { type LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import pinoHttp from 'pino-http';
import type { NextFunction, Request, Response } from 'express';

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  });
}

/** Adapts pino to Nest's LoggerService so framework + app logs share one structured stream. */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}
  log(message: unknown, context?: string) {
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string) {
    this.logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string) {
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string) {
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string) {
    this.logger.trace({ context }, String(message));
  }
}

export function httpLogger(logger: Logger) {
  const middleware = pinoHttp({
    logger,
    genReqId: (req) => (req as Request).requestId ?? 'n/a',
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    autoLogging: { ignore: (req) => req.url?.includes('/health') ?? false },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  });
  return (req: Request, res: Response, next: NextFunction) => middleware(req, res, next);
}
