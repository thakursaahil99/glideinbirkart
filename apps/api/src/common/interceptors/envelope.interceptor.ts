import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import type { ApiSuccess } from '@gk/types';
import { SKIP_ENVELOPE_KEY } from '../decorators';
import { PagedResult } from '../types';

/** Wraps every successful response as { success, data, error, meta }. */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((value: unknown) => {
        if (res.headersSent || value instanceof StreamableFile || Buffer.isBuffer(value))
          return value;
        if (value instanceof PagedResult) {
          const body: ApiSuccess<unknown[]> = {
            success: true,
            data: value.items,
            error: null,
            meta: value.meta,
          };
          return body;
        }
        const body: ApiSuccess<unknown> = {
          success: true,
          data: value ?? null,
          error: null,
          meta: null,
        };
        return body;
      }),
    );
  }
}
