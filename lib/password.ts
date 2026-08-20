/**
 * Shared password rules.
 *
 * Lives outside app/actions/password-reset.ts because a `"use server"` module may only
 * export async functions — a plain constant there is a build error, and the failure
 * shows up as a 500 on every page that imports it, not as a compile error.
 */

/** Better Auth's own minimum. Mirrored so a form can say so before submitting. */
export const MIN_PASSWORD_LENGTH = 8
