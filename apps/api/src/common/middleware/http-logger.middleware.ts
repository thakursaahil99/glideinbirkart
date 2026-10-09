import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { httpLogger } from '../logger';

export const PINO_LOGGER = Symbol('PINO_LOGGER');

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly handler: (req: Request, res: Response, next: NextFunction) => void;

  constructor(@Inject(PINO_LOGGER) logger: Logger) {
    this.handler = httpLogger(logger);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    this.handler(req, res, next);
  }
}
