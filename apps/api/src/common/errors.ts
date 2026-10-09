import { HttpException, HttpStatus } from '@nestjs/common';
import type { ZodError } from 'zod';

export interface ErrorDetail {
  path: string;
  message: string;
}

/** Domain error carrying a stable machine-readable `code` alongside the HTTP status. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super({ code, message, details }, status);
  }
}

export const badRequest = (code: string, message: string, details?: ErrorDetail[]) =>
  new AppException(HttpStatus.BAD_REQUEST, code, message, details);
export const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') =>
  new AppException(HttpStatus.UNAUTHORIZED, code, message);
export const forbidden = (
  message = 'You do not have access to this resource',
  code = 'FORBIDDEN',
) => new AppException(HttpStatus.FORBIDDEN, code, message);
export const notFound = (what = 'Resource', code = 'NOT_FOUND') =>
  new AppException(HttpStatus.NOT_FOUND, code, `${what} not found`);
export const conflict = (code: string, message: string, details?: ErrorDetail[]) =>
  new AppException(HttpStatus.CONFLICT, code, message, details);
export const unprocessable = (code: string, message: string) =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, message);

export class ValidationException extends AppException {
  constructor(error: ZodError) {
    const details = error.issues.map((i) => ({
      path: i.path.map(String).join('.'),
      message: i.message,
    }));
    super(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      details[0]
        ? `${details[0].path ? details[0].path + ': ' : ''}${details[0].message}`
        : 'Invalid input',
      details,
    );
  }
}
