export class HttpError extends Error {
  statusCode: number;
  code: string;
  /** Optional structured payload echoed in the error envelope (e.g. blocking references). */
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;
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

export const conflict = (code: string, message: string, details?: unknown): HttpError =>
  new HttpError(409, code, message, details);

export const notImplemented = (message: string): HttpError =>
  new HttpError(501, 'NOT_IMPLEMENTED', message);

export const serviceUnavailable = (code: string, message: string): HttpError =>
  new HttpError(503, code, message);
