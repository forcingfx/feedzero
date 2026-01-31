/**
 * Result type for explicit error handling.
 * All core functions return Result instead of throwing.
 */

export function ok(value) {
  return { ok: true, value };
}

export function err(error) {
  return { ok: false, error };
}

export function isOk(result) {
  return result.ok === true;
}

export function isErr(result) {
  return result.ok === false;
}

export function unwrap(result) {
  if (result.ok) return result.value;
  throw new Error(`Unwrap called on err: ${result.error}`);
}

export function unwrapOr(result, fallback) {
  return result.ok ? result.value : fallback;
}

export function map(result, fn) {
  return result.ok ? ok(fn(result.value)) : result;
}

export function mapErr(result, fn) {
  return result.ok ? result : err(fn(result.error));
}
