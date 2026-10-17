/* eslint-disable @typescript-eslint/no-explicit-any */
// neverthrow's Ok and Err results do not share a `value` field.
export function unwrap(
  result: {
    isErr(): boolean;
    error?: { message: string };
    value?: any;
  },
  label: string,
): any {
  if (result.isErr()) {
    throw new Error(`${label}: ${result.error?.message ?? 'unknown error'}`);
  }
  return result.value;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class SnapchainError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SnapchainError';
    this.status = status;
  }
}
