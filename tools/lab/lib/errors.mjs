export const EXIT = Object.freeze({
  PASS: 0,
  ACCEPTANCE_FAIL: 2,
  INPUT_FAIL: 3,
  TOOL_FAIL: 4,
});

export class LabError extends Error {
  constructor(code, message, exitCode = EXIT.TOOL_FAIL, details = undefined) {
    super(message);
    this.name = "LabError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function errorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
