/**
 * The error type shared by the HTTP layer and the agent credential check.
 *
 * It lives on its own so lib/api/http.ts can validate agent credentials before running
 * a handler without the two modules importing each other in a cycle.
 */

/** An error that maps to a documented JSON error response. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message)
  }
}
