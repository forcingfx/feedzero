/**
 * Translate a license-verification error into something a customer can
 * act on.
 *
 * The verifier speaks in Unix epochs — `token expired (expired=…,
 * now=…)` — which is right for logs and support triage but reaches the
 * user verbatim in the activation dialog. The dominant cause of that
 * error is a stale token pasted from an old email or password manager,
 * and the resolution is always the same: get a fresh one via email
 * recovery. So say the date, and offer the door.
 *
 * `action: "recover"` tells the UI to surface the email-recovery CTA.
 * Errors we don't recognize pass through untouched — inventing
 * friendlier copy for an unknown failure would only hide it.
 */
export interface LicenseErrorDescription {
  message: string;
  action?: "recover";
}

const EXPIRED_RE = /token expired \(expired=(\d+)/;
const FUTURE_ISSUED_RE = /issuedAt is in the future/;
const BAD_SIGNATURE_RE = /invalid signature/;

function formatEpochSeconds(raw: string): string | null {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function describeLicenseError(raw: string): LicenseErrorDescription {
  const expired = raw.match(EXPIRED_RE);
  if (expired || /token expired/.test(raw)) {
    const on = expired ? formatEpochSeconds(expired[1]) : null;
    return {
      message: on
        ? `This license expired on ${on}. Recover your current license by email to activate this device.`
        : "This license has expired. Recover your current license by email to activate this device.",
      action: "recover",
    };
  }

  if (FUTURE_ISSUED_RE.test(raw)) {
    return {
      message:
        "This license was issued in the future, which usually means this device's clock is wrong. Check your date and time settings, then try again.",
    };
  }

  if (BAD_SIGNATURE_RE.test(raw)) {
    return {
      message:
        "This license token couldn't be verified — it may have been truncated when copied. Paste the full token, or recover your license by email.",
      action: "recover",
    };
  }

  return { message: raw };
}
