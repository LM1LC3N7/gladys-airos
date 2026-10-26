// -----------------------------------------------------------------------------
// The app on a REAL moving clock (performance.now, Date.now, setTimeout) and a
// real local HTTPS server playing the radio (self-signed certificate, pinned
// at the first contact): the readings really start, at 0, the interval and
// twice the interval, with a bounded number of timers. The time is sped up
// 100 times (30 s of the interval are 300 ms) but it is the real clock: it
// moves between any two reads of it.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { AirosApp } from '../src/app.js';
import { memoryStore } from '../src/store.js';
import { COOKIE, CSRF, PASSWORD, USERNAME, status } from './fixtures/airos.js';
import { selfSigned } from './helpers/selfSigned.js';

const SPEED = 100;
const INTERVAL = 30_000;

test('real clock: readings at 0, the interval and twice the interval; timers bounded', async () => {
  const cert = selfSigned('UBNT');
  // A reading starts with its first TCP connection (the login, if any, then
  // the status): the pace counts from the start of an attempt.
  const reads = [];
  let answered = 0;
  const server = createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/api/auth') {
        const { username, password } = JSON.parse(body);
        if (username !== USERNAME || password !== PASSWORD) {
          res.writeHead(401).end();
          return;
        }
        res.writeHead(200, { 'set-cookie': `${COOKIE}; Path=/`, 'x-csrf-id': CSRF });
        res.end('{}');
        return;
      }
      if (req.url === '/status.cgi' && req.headers.cookie === COOKIE) {
        answered += 1;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(status()));
        return;
      }
      res.writeHead(404).end();
    });
  });
  server.on('connection', () => {
    const at = performance.now() * SPEED;
    if (reads.length === 0 || at - reads.at(-1) > INTERVAL / 2) reads.push(at);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  let timersSet = 0;
  const timers = {
    setTimeout(fn, ms) {
      timersSet += 1;
      return setTimeout(fn, Math.max(0, ms) / SPEED);
    },
    clearTimeout: (id) => clearTimeout(id),
  };
  const gladys = createFakeGladys({ selector: 'airos', config: {} });
  await gladys.connect();
  const quiet = () => {};
  const store = memoryStore();
  const app = new AirosApp({
    gladys,
    logger: { info: quiet, warn: quiet, error: quiet, debug: quiet },
    now: () => Date.now() * SPEED,
    monotonic: () => performance.now() * SPEED,
    timers,
    store,
  });
  const started = performance.now() * SPEED;
  try {
    await app.start({
      host: `127.0.0.1:${port}`,
      username: USERNAME,
      password: PASSWORD,
      poll_interval: '30',
    });
    const deadline = started + INTERVAL;
    while (reads.length === 0 && performance.now() * SPEED < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const until = (reads[0] ?? started) + 2.5 * INTERVAL;
    while (performance.now() * SPEED < until) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await app.stop();
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  const at = reads.map((t) => Math.round(t - started));
  assert.equal(reads.length, 3, `reads at ${at}`);
  assert.ok(reads[0] - started < INTERVAL / 2, `the first read at once: ${at}`);
  for (let i = 1; i < reads.length; i += 1) {
    const gap = reads[i] - reads[i - 1];
    assert.ok(gap >= 0.9 * INTERVAL, `never sooner than the interval: ${at}`);
    assert.ok(gap < 1.5 * INTERVAL, `on time: ${at}`);
  }
  assert.ok(timersSet <= 12, `${timersSet} timers`);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(answered, 3);
  assert.equal(store.data.pins[`127.0.0.1:${port}`], cert.fingerprint256);
});
