export class HttpError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const notFound = (what = 'Resource'): HttpError =>
  new HttpError(404, 'NOT_FOUND', `${what} not found`);

export const badRequest = (message: string): HttpError =>
  new HttpError(400, 'BAD_REQUEST', message);

export const unauthorized = (message = 'Missing or invalid token'): HttpError =>
  new HttpError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Insufficient permissions'): HttpError =>
  new HttpError(403, 'FORBIDDEN', message);

export const notImplemented = (message: string): HttpError =>
  new HttpError(501, 'NOT_IMPLEMENTED', message);

export const serviceUnavailable = (code: string, message: string): HttpError =>
  new HttpError(503, code, message);
