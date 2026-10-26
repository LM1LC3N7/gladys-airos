// -----------------------------------------------------------------------------
// The airOS 8 web API of one radio, ported from python-airos (MIT,
// @CoMPaTech; see THIRD_PARTY_NOTICES.md):
//
//   POST /api/auth     {"username", "password"} (JSON) -> a session cookie
//                      `AIROS_<...>` and an `X-CSRF-ID` header
//   GET  /status.cgi   the status (JSON), with the cookie and the CSRF id
//   POST /reboot.cgi   `reboot=yes` (form) -> {"ok": true}
//
// The session is kept and used again; a status refused (401/403) with a
// session used before opens a new one once in the same reading. A login
// refused (401/403 on /api/auth) is a refusal of the credentials; a status
// refused right after a new login is not (CODES.ACCESS). /api/auth answering
// 404 is airOS 6 or older (python-airos falls back to its v6 login): not
// supported here. Nothing else of the library is ported (firmware update,
// station kick, provisioning mode): this integration never writes anything
// but the reboot, behind its option.
//
// The password and the cookie only go into the request, on a connection
// whose certificate was checked first (src/airos/http.js); never into a log,
// an error message or /data.
// -----------------------------------------------------------------------------

import { LIMITS, TIMEOUTS } from '../constants.js';
import { CODES, RadioError } from './errors.js';
import { httpsRequest } from './http.js';
import { parseStatus } from './parse.js';

/** A cookie or header value we may send back: printable ASCII, no `;`, bounded. */
const TOKEN = /^[\x21-\x3a\x3c-\x7e]{1,512}$/;
const COOKIE_NAME = /^AIROS_[A-Za-z0-9_]{1,64}$/;

/** The Retry-After of an answer, in ms (seconds only), or undefined. */
function retryAfterOf(headers) {
  const value = headers?.['retry-after'];
  if (typeof value !== 'string' || !/^\d{1,6}$/.test(value.trim())) return undefined;
  return Number(value.trim()) * 1000;
}

/** The AIROS_ session cookie of a login answer, `name=value`, or null. */
export function sessionCookieOf(headers) {
  const list = headers?.['set-cookie'];
  for (const line of Array.isArray(list) ? list : typeof list === 'string' ? [list] : []) {
    const pair = String(line).split(';', 1)[0];
    const at = pair.indexOf('=');
    if (at < 1) continue;
    const name = pair.slice(0, at).trim();
    const value = pair.slice(at + 1).trim();
    if (COOKIE_NAME.test(name) && TOKEN.test(value)) return `${name}=${value}`;
  }
  return null;
}

function jsonOf(body) {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new RadioError(CODES.BAD_ANSWER, 'The answer is not JSON');
  }
}

export class AirosClient {
  /**
   * @param {object} options
   * @param {string} options.host
   * @param {number} options.port
   * @param {string} options.username
   * @param {string} options.password
   * @param {(fingerprint: string) => Promise<void>|void} options.checkPeer
   * @param {Function} [options.request] the transport (tests inject a fake radio)
   */
  constructor({ host, port, username, password, checkPeer, request = httpsRequest }) {
    this.target = { host, port };
    this.username = username;
    this.password = password;
    this.checkPeer = checkPeer;
    this.request = request;
    /** { cookie, csrf } of the open session, or null. */
    this.session = null;
  }

  close() {
    this.session = null;
  }

  async send(method, path, { headers, body, maxBytes, timeout, beforeSend }) {
    return this.request(
      { ...this.target, method, path },
      {
        headers,
        body,
        maxBytes,
        timeout: Math.max(1, Math.min(timeout ?? TIMEOUTS.REQUEST_MS, TIMEOUTS.REQUEST_MS)),
        checkPeer: this.checkPeer,
        beforeSend,
      },
    );
  }

  /** An answer that is not a success: the matching RadioError. */
  static failure(res) {
    const status = res.status;
    if (status >= 300 && status < 400) {
      return new RadioError(CODES.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    return new RadioError(CODES.HTTP, `HTTP ${status}`, {
      status,
      retryAfterMs: retryAfterOf(res.headers),
    });
  }

  /** Opens a session. Throws CODES.CREDENTIALS on a refusal. */
  async login({ timeout } = {}) {
    this.session = null;
    const res = await this.send('POST', '/api/auth', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
      maxBytes: LIMITS.SMALL_BYTES,
      timeout,
    });
    if (res.status === 401 || res.status === 403) {
      throw new RadioError(CODES.CREDENTIALS, `Login refused (HTTP ${res.status})`, {
        status: res.status,
      });
    }
    if (res.status === 404) {
      throw new RadioError(CODES.UNSUPPORTED, 'No airOS 8 login page (HTTP 404)', { status: 404 });
    }
    if (res.status !== 200) throw AirosClient.failure(res);
    const cookie = sessionCookieOf(res.headers);
    if (!cookie) throw new RadioError(CODES.BAD_ANSWER, 'No airOS session cookie');
    const csrf = typeof res.headers['x-csrf-id'] === 'string' ? res.headers['x-csrf-id'] : null;
    this.session = { cookie, csrf: csrf && TOKEN.test(csrf) ? csrf : null };
  }

  authHeaders() {
    return {
      cookie: this.session.cookie,
      ...(this.session.csrf ? { 'x-csrf-id': this.session.csrf } : {}),
    };
  }

  /**
   * The status of the radio, parsed. Opens a session when none is open; a
   * session refused is opened again once. `timeLeft()` -> ms left for the
   * whole reading (a command gives its own).
   */
  async status({ timeLeft = () => TIMEOUTS.REQUEST_MS } = {}) {
    let fresh = false;
    if (!this.session) {
      await this.login({ timeout: timeLeft() });
      fresh = true;
    }
    for (;;) {
      const res = await this.send('GET', '/status.cgi', {
        headers: this.authHeaders(),
        maxBytes: LIMITS.STATUS_BYTES,
        timeout: timeLeft(),
      });
      const refused = res.status === 401 || res.status === 403 || res.status === 302;
      if (refused && !fresh) {
        // The session expired (or the radio restarted): a new one, once.
        await this.login({ timeout: timeLeft() });
        fresh = true;
        continue;
      }
      if (refused) {
        this.session = null;
        throw new RadioError(CODES.ACCESS, `Status refused after login (HTTP ${res.status})`, {
          status: res.status,
        });
      }
      if (res.status !== 200) throw AirosClient.failure(res);
      try {
        return parseStatus(jsonOf(res.body));
      } catch (err) {
        if (err instanceof RadioError) throw err;
        throw new RadioError(CODES.BAD_ANSWER, 'Not an airOS 8 status');
      }
    }
  }

  /**
   * The reboot, on the session of the fresh status read just before. One
   * request, never retried. `beforeSend` runs right before it is written.
   * Resolves when the radio answered {"ok": true}.
   */
  async reboot({ timeout, beforeSend }) {
    if (!this.session) {
      throw new RadioError(CODES.ACCESS, 'No session', { notSent: true });
    }
    const res = await this.send('POST', '/reboot.cgi', {
      headers: { ...this.authHeaders(), 'content-type': 'application/x-www-form-urlencoded' },
      body: 'reboot=yes',
      maxBytes: LIMITS.SMALL_BYTES,
      timeout,
      beforeSend,
    });
    if (res.status === 401 || res.status === 403) {
      this.session = null;
      throw new RadioError(CODES.ACCESS, `Reboot refused (HTTP ${res.status})`, {
        status: res.status,
      });
    }
    if (res.status !== 200) throw AirosClient.failure(res);
    const answer = jsonOf(res.body);
    const ok = answer?.ok;
    if (ok !== true && ok !== 'true') {
      throw new RadioError(CODES.BAD_ANSWER, 'The radio did not accept the reboot');
    }
  }
}
