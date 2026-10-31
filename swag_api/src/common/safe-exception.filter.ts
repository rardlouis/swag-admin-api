import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : undefined;
    const exceptionBody = typeof exceptionResponse === 'object' && exceptionResponse !== null
      ? exceptionResponse as { message?: string | string[] }
      : undefined;
    const message = status >= 500
      ? 'An unexpected error occurred. Please try again later.'
      : typeof exceptionResponse === 'string'
        ? exceptionResponse
        : Array.isArray(exceptionBody?.message)
          ? exceptionBody.message.join(' ')
          : typeof exceptionBody?.message === 'string'
            ? exceptionBody.message
            : 'Request failed.';

    response.status(status).json({ statusCode: status, message });
  }
}
