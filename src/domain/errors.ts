export type AppErrorCode =
  | 'INVALID_IMAGE_TYPE'
  | 'INVALID_IMAGE_ASPECT_RATIO'
  | 'INVALID_PARAMS'
  | 'DECODE_FAILED'
  | 'GENERATION_FAILED'
  | 'EXPORT_FAILED';

export type AppError = {
  code: AppErrorCode;
  message: string;
  field?: string;
  cause?: unknown;
};

export function toUserMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Something went wrong.';
}
