export type ErrorCode =
  | "invalid_parameters_error"
  | "reading_file_error"
  | "not_found_error"
  | "reference_not_found_error"
  | "experiment_error"
  | "publication_error"
  | "model_error"
  | "tool_error"
  | "resource_creation_error"
  | "resource_update_error"
  | "agent_loop_overflow_error"
  | "tool_execution_error"
  | "tool_not_found_error"
  | "computer_run_error"
  | "string_edit_error";

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
