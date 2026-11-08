import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

type ParserError = { status?: unknown; type?: unknown; message?: unknown };

type ErrorDetails = Record<string, unknown>;

const SENSITIVE_VALUE = /\b(password|pwd|token|secret|authorization|connection\s*string|user\s*id|uid)\s*=\s*([^;\s,]+)/gi;

function redact(value: unknown) {
  return typeof value === 'string'
    ? value.replace(SENSITIVE_VALUE, '$1=[REDACTED]')
    : value;
}

function errorDetails(exception: unknown): ErrorDetails {
  const source = exception && typeof exception === 'object' ? exception as Record<string, unknown> : {};
  const nested = source.originalError && typeof source.originalError === 'object'
    ? source.originalError as Record<string, unknown>
    : undefined;
  const pick = (key: string) => redact(source[key] ?? nested?.[key]);
  const precedingErrors = Array.isArray(source.precedingErrors)
    ? source.precedingErrors.map((error) => errorDetails(error))
    : undefined;

  return {
    name: pick('name') ?? typeof exception,
    message: pick('message'),
    stack: pick('stack'),
    code: pick('code'),
    number: pick('number'),
    state: pick('state'),
    class: pick('class'),
    lineNumber: pick('lineNumber'),
    server: pick('server'),
    procedure: pick('procName'),
    ...(precedingErrors?.length ? { precedingErrors } : {}),
  };
}

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<{ method?: string; originalUrl?: string }>();
    const parserError = exception as ParserError;
    const isPayloadTooLarge = parserError?.status === HttpStatus.PAYLOAD_TOO_LARGE || parserError?.type === 'entity.too.large';
    const status = isPayloadTooLarge
      ? HttpStatus.PAYLOAD_TOO_LARGE
      : exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : undefined;
    const exceptionBody = typeof exceptionResponse === 'object' && exceptionResponse !== null
      ? exceptionResponse as { message?: string | string[]; code?: string }
      : undefined;
    const safeServiceCode = typeof exceptionBody?.code === 'string'
      && exceptionBody.code.startsWith('SKIN_TONE_');
    const isSkinToneRequest = request.originalUrl?.includes('/skin-tone/analyze') ?? false;
    if (isPayloadTooLarge) {
      this.logger.warn(`Request body exceeded the configured limit: ${request.method ?? 'UNKNOWN'} ${request.originalUrl ?? 'unknown route'}.`);
    } else if (status >= 500) {
      this.logger.error(JSON.stringify({
        event: 'Unhandled request failure',
        method: request.method ?? 'UNKNOWN',
        route: request.originalUrl ?? 'unknown route',
        category: exception instanceof HttpException ? 'http-exception' : typeof exception,
        exception: errorDetails(exception),
      }));
    }

    const message = isPayloadTooLarge && isSkinToneRequest
      ? 'The selected image is too large. Please choose another photo and try again.'
      : status >= 500
      ? safeServiceCode && typeof exceptionBody?.message === 'string'
        ? exceptionBody.message
        : 'An unexpected error occurred. Please try again later.'
      : typeof exceptionResponse === 'string'
        ? exceptionResponse
        : Array.isArray(exceptionBody?.message)
          ? exceptionBody.message.join(' ')
          : typeof exceptionBody?.message === 'string'
            ? exceptionBody.message
            : 'Request failed.';

    response.status(status).json({
      statusCode: status,
      message,
      ...(safeServiceCode ? { code: exceptionBody?.code } : {}),
      ...(isPayloadTooLarge && isSkinToneRequest ? { code: 'SKIN_TONE_IMAGE_TOO_LARGE' } : {}),
    });
  }
}
