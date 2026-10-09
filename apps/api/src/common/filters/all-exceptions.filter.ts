import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@gk/db';
import * as Sentry from '@sentry/node';
import type { ApiFailure } from '@gk/types';
import type { Request, Response } from 'express';
import { AppException } from '../errors';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const requestId = req.requestId;

    const { status, code, message, details } = this.normalise(exception);

    if (status >= 500) {
      this.log.error(
        `${req.method} ${req.originalUrl} → ${status} ${code}: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
      Sentry.captureException(exception, { tags: { requestId: requestId ?? 'n/a' } });
    }

    const body: ApiFailure = {
      success: false,
      data: null,
      error: { code, message, details, requestId },
      meta: null,
    };
    if (!res.headersSent) res.status(status).json(body);
  }

  private normalise(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : Array.isArray((response as { message?: unknown }).message)
            ? ((response as { message: string[] }).message[0] ?? exception.message)
            : ((response as { message?: string }).message ?? exception.message);
      const throttled = status === 429;
      return {
        status,
        code: STATUS_CODES[status] ?? 'HTTP_ERROR',
        message: throttled ? 'Too many requests. Please slow down and try again shortly.' : message,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          const target = (exception.meta?.target as string[] | string | undefined) ?? 'field';
          const fields = Array.isArray(target) ? target.join(', ') : target;
          return {
            status: 409,
            code: 'DUPLICATE',
            message: `A record with this ${fields} already exists`,
          };
        }
        case 'P2025':
          return { status: 404, code: 'NOT_FOUND', message: 'Record not found' };
        case 'P2003':
          return {
            status: 409,
            code: 'CONSTRAINT_VIOLATION',
            message: 'This record is referenced elsewhere',
          };
        case 'P2004':
        case 'P2010':
          return {
            status: 409,
            code: 'CONSTRAINT_VIOLATION',
            message: 'The change violates a data rule',
          };
        default:
          break;
      }
    }

    // Check-constraint violations surface as raw query errors (e.g. inventory going negative).
    const msg = (exception as Error)?.message ?? '';
    if (
      /inventory_reserved_lte_quantity|inventory_quantity_nonneg|inventory_reserved_nonneg/.test(
        msg,
      )
    ) {
      return {
        status: 409,
        code: 'OUT_OF_STOCK',
        message: 'Insufficient stock to complete this action',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
    };
  }
}
