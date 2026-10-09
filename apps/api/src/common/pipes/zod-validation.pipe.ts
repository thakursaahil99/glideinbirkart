import { Body, Param, Query, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';
import { ValidationException } from '../errors';
import { sanitizeDeep } from '../utils/sanitize';

/** Validates + sanitises request data against a shared Zod schema from @gk/validators. */
export class ZodValidationPipe<T extends ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(sanitizeDeep(value ?? {}));
    if (!result.success) throw new ValidationException(result.error);
    return result.data;
  }
}

type JsonSchema = {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
} & Record<string, unknown>;

function toJsonSchema(schema: ZodType): JsonSchema {
  try {
    return z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) as JsonSchema;
  } catch {
    return { type: 'object' };
  }
}

function attachDocs(
  target: object,
  key: string | symbol | undefined,
  kind: 'body' | 'query',
  schema: ZodType,
) {
  if (!key) return;
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) return;
  const json = toJsonSchema(schema);
  if (kind === 'body') {
    ApiBody({ schema: json as never })(target, key, descriptor);
    return;
  }
  for (const [name, prop] of Object.entries(json.properties ?? {})) {
    ApiQuery({ name, required: json.required?.includes(name) ?? false, schema: prop as never })(
      target,
      key,
      descriptor,
    );
  }
}

/** `@ZBody(schema)` — validated request body, documented in Swagger from the same schema. */
export function ZBody(schema: ZodType): ParameterDecorator {
  return (target, key, index) => {
    Body(new ZodValidationPipe(schema))(target, key, index);
    attachDocs(target, key, 'body', schema);
  };
}

/** `@ZQuery(schema)` — validated query string. */
export function ZQuery(schema: ZodType): ParameterDecorator {
  return (target, key, index) => {
    Query(new ZodValidationPipe(schema))(target, key, index);
    attachDocs(target, key, 'query', schema);
  };
}

/** `@ZParam('id', schema)` — validated route param. */
export function ZParam(name: string, schema: ZodType): ParameterDecorator {
  return (target, key, index) => {
    Param(name, new ZodValidationPipe(schema))(target, key, index);
  };
}
