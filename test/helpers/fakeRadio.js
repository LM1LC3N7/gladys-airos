// -----------------------------------------------------------------------------
// A fake airOS 8 radio in memory: the transport of src/airos/http.js, with
// the same contract (checkPeer awaited, then beforeSend, then the request is
// "written"; a failure there marks the error notSent). Every request the
// radio received is recorded in `sent`, every connection in `connections`.
// -----------------------------------------------------------------------------

import { CODES, RadioError } from '../../src/airos/errors.js';
import { COOKIE, CSRF, PASSWORD, USERNAME, status } from '../fixtures/airos.js';

export const FINGERPRINT =
  'AA:11:BB:22:CC:33:DD:44:EE:55:FF:66:00:77:11:88:22:99:33:AA:44:BB:55:CC:66:DD:77:EE:88:FF:99:00';
export const OTHER_FINGERPRINT =
  '0F:1E:2D:3C:4B:5A:69:78:87:96:A5:B4:C3:D2:E1:F0:0F:1E:2D:3C:4B:5A:69:78:87:96:A5:B4:C3:D2:E1:F0';

const json = (value, headers = {}) => ({
  status: 200,
  headers: { 'content-type': 'application/json', ...headers },
  body: Buffer.from(JSON.stringify(value)),
});

export function createFakeRadio({
  fingerprint = FINGERPRINT,
  username = USERNAME,
  password = PASSWORD,
  answer = () => status(),
} = {}) {
  const radio = {
    fingerprint,
    username,
    password,
    answer,
    /** 'down' | 'timeout' | null */
    state: null,
    /** path -> { status, headers? } forced once or always (`times`). */
    overrides: new Map(),
    sessions: new Set(),
    connections: 0,
    sent: [],
    reboots: 0,
    /** Called with each request before it is answered (a test may await there). */
    hook: null,
    override(path, response, times = Infinity) {
      radio.overrides.set(path, { response, times });
    },
    expireSessions() {
      radio.sessions.clear();
    },
    async request(target, options) {
      radio.connections += 1;
      if (radio.state === 'down') {
        throw new RadioError(CODES.UNREACHABLE, 'ECONNREFUSED', { notSent: true });
      }
      try {
        await options.checkPeer(radio.fingerprint);
        options.beforeSend?.();
      } catch (err) {
        throw Object.assign(err, { notSent: true });
      }
      const entry = {
        method: target.method,
        path: target.path,
        headers: { ...options.headers },
        body: options.body,
        timeout: options.timeout,
      };
      radio.sent.push(entry);
      await radio.hook?.(entry);
      if (radio.state === 'timeout') {
        throw new RadioError(CODES.TIMEOUT, 'No answer within 10 s', { notSent: false });
      }
      const forced = radio.overrides.get(target.path);
      if (forced && forced.times > 0) {
        forced.times -= 1;
        const r = forced.response;
        return {
          status: r.status,
          headers: r.headers ?? {},
          body: Buffer.from(r.body ?? ''),
        };
      }
      const authed = () => radio.sessions.has(options.headers?.cookie);
      if (target.path === '/api/auth' && target.method === 'POST') {
        const body = JSON.parse(options.body);
        if (body.username !== radio.username || body.password !== radio.password) {
          return { status: 401, headers: {}, body: Buffer.from('') };
        }
        const cookie = `${COOKIE}${radio.sessions.size}`;
        radio.sessions.add(cookie);
        return json(
          { boardinfo: {} },
          { 'set-cookie': [`${cookie}; Path=/; HttpOnly`, 'other=1'], 'x-csrf-id': CSRF },
        );
      }
      if (target.path === '/status.cgi' && target.method === 'GET') {
        if (!authed()) return { status: 403, headers: {}, body: Buffer.from('') };
        return json(radio.answer());
      }
      if (target.path === '/reboot.cgi' && target.method === 'POST') {
        if (!authed()) return { status: 403, headers: {}, body: Buffer.from('') };
        radio.reboots += 1;
        return json({ ok: true });
      }
      return { status: 404, headers: {}, body: Buffer.from('') };
    },
  };
  radio.request = radio.request.bind(radio);
  return radio;
}
