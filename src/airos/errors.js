// -----------------------------------------------------------------------------
// The errors of the radio. A RadioError message never holds the address, the
// password, the session cookie nor an identifier: it may be logged and shown.
// -----------------------------------------------------------------------------

export const CODES = Object.freeze({
  /** No TCP connection (refused, no route, DNS). */
  UNREACHABLE: 'unreachable',
  /** No complete answer within the deadline. */
  TIMEOUT: 'timeout',
  /** The deadline of a command passed before the request was written. */
  LATE: 'late',
  /** An answer above the size cap. */
  TOO_LARGE: 'too_large',
  /** Something answered, but not the airOS 8 API (another protocol, not JSON, missing fields). */
  BAD_ANSWER: 'bad_answer',
  /** /api/auth does not exist: airOS 6 or older, or another device. */
  UNSUPPORTED: 'unsupported',
  /** An HTTP status this code does not expect (`status`, `retryAfterMs`). */
  HTTP: 'http',
  /** The login was refused (HTTP 401/403 on /api/auth): final until the configuration changes. */
  CREDENTIALS: 'credentials',
  /** The status page refused a session that was just opened (not a refusal of the credentials). */
  ACCESS: 'access',
  /** A redirection (the radio wants another address or protocol): never followed. */
  REDIRECT: 'redirect',
  /** The certificate is not the one pinned (`fingerprint` holds the one met). */
  CERTIFICATE: 'certificate',
  /** The certificate is not the fingerprint typed in the configuration (`fingerprint`). */
  CERTIFICATE_TYPED: 'certificate_typed',
  /** No pin, and /data cannot keep one: nothing is sent (`reason`: 'unreadable' | 'unwritable'). */
  PIN_UNAVAILABLE: 'pin_unavailable',
  /** A TLS handshake the radio refused (very old firmware). */
  TLS: 'tls',
});

export class RadioError extends Error {
  /**
   * @param {string} code one of CODES
   * @param {string} message safe to log
   * @param {{ notSent?: boolean, status?: number, retryAfterMs?: number, fingerprint?: string, reason?: string }} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'RadioError';
    this.code = code;
    Object.assign(this, extra);
  }
}

/** The failures that stop every request until the user acts. */
export const isFinal = (err) =>
  err?.code === CODES.CREDENTIALS ||
  err?.code === CODES.CERTIFICATE ||
  err?.code === CODES.CERTIFICATE_TYPED ||
  err?.code === CODES.PIN_UNAVAILABLE;
