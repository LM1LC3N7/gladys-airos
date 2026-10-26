// -----------------------------------------------------------------------------
// The airOS 8 API client (src/airos/client.js) against the fake radio.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AirosClient, sessionCookieOf } from '../src/airos/client.js';
import { CODES } from '../src/airos/errors.js';
import { CSRF, PASSWORD, USERNAME } from './fixtures/airos.js';
import { createFakeRadio } from './helpers/fakeRadio.js';

const client = (radio, password = PASSWORD) =>
  new AirosClient({
    host: '192.168.1.20',
    port: 443,
    username: USERNAME,
    password,
    checkPeer: () => {},
    request: radio.request,
  });

test('login, then the status with the cookie and the CSRF id; the session used again', async () => {
  const radio = createFakeRadio();
  const c = client(radio);
  const r = await c.status();
  assert.equal(r.model, 'NanoBeam 5AC');
  await c.status();
  assert.equal(radio.sent.filter((s) => s.path === '/api/auth').length, 1);
  const get = radio.sent.find((s) => s.path === '/status.cgi');
  assert.match(get.headers.cookie, /^AIROS_SESSIONID=/);
  assert.equal(get.headers['x-csrf-id'], CSRF);
});

test('refusals: login 401 is the credentials, 404 is not airOS 8, other answers bad', async () => {
  const refused = await client(createFakeRadio(), 'wrong')
    .status()
    .catch((e) => e);
  assert.equal(refused.code, CODES.CREDENTIALS);
  const radio = createFakeRadio();
  radio.override('/api/auth', { status: 404 });
  assert.equal(
    (
      await client(radio)
        .status()
        .catch((e) => e)
    ).code,
    CODES.UNSUPPORTED,
  );
  const noCookie = createFakeRadio();
  noCookie.override('/api/auth', { status: 200, body: '{}' });
  assert.equal(
    (
      await client(noCookie)
        .status()
        .catch((e) => e)
    ).code,
    CODES.BAD_ANSWER,
  );
  const notJson = createFakeRadio();
  const c = client(notJson);
  await c.login();
  notJson.override('/status.cgi', { status: 200, body: '<html>' });
  assert.equal((await c.status().catch((e) => e)).code, CODES.BAD_ANSWER);
  notJson.override('/status.cgi', { status: 503, headers: { 'retry-after': '120' } });
  const busy = await c.status().catch((e) => e);
  assert.equal(busy.code, CODES.HTTP);
  assert.equal(busy.retryAfterMs, 120_000);
});

test('reboot: a form on the session, accepted only on {"ok": true}', async () => {
  const radio = createFakeRadio();
  const c = client(radio);
  await c.status();
  await c.reboot({ timeout: 1000 });
  const post = radio.sent.find((s) => s.path === '/reboot.cgi');
  assert.equal(post.body, 'reboot=yes');
  assert.equal(post.headers['content-type'], 'application/x-www-form-urlencoded');
  radio.override('/reboot.cgi', { status: 200, body: '{"ok":false}' });
  assert.equal((await c.reboot({ timeout: 1000 }).catch((e) => e)).code, CODES.BAD_ANSWER);
  const fresh = client(createFakeRadio());
  assert.equal((await fresh.reboot({ timeout: 1000 }).catch((e) => e)).notSent, true);
});

test('the session cookie: AIROS_ only, printable, no attribute; never another cookie', () => {
  assert.equal(
    sessionCookieOf({ 'set-cookie': ['a=1', 'AIROS_ABC=v1; Path=/; HttpOnly'] }),
    'AIROS_ABC=v1',
  );
  assert.equal(sessionCookieOf({ 'set-cookie': ['AIROS_ABC=bad value'] }), null);
  assert.equal(sessionCookieOf({ 'set-cookie': 'AIROS_X=\r\nInjected: 1' }), null);
  assert.equal(sessionCookieOf({}), null);
});
