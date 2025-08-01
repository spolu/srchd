export type ErrorCode = "reading_file_error" | "not_found_error";

export class SrchdError<T extends ErrorCode = ErrorCode> extends Error {
  constructor(
    readonly code: T,
    message: string,
    readonly cause?: Error | null
  ) {
    super(message);
  }
}

export function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(errorToString(error));
}
