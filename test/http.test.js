// -----------------------------------------------------------------------------
// The HTTPS transport against a real TLS server on loopback, with a
// self-signed certificate like the one of an airOS radio: the fingerprint is
// checked before a byte of the request is written, one connection per
// request, a size cap, a deadline, no redirect followed.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { CODES } from '../src/airos/errors.js';
import { httpsRequest } from '../src/airos/http.js';
import { selfSigned } from './helpers/selfSigned.js';

const CERT = selfSigned('UBNT');

async function server(handler) {
  const requests = [];
  let connections = 0;
  let bytes = 0;
  const srv = createServer({ key: CERT.key, cert: CERT.cert }, (req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler(req, res, body);
    });
  });
  srv.on('secureConnection', (socket) => {
    connections += 1;
    socket.on('data', (d) => (bytes += d.length));
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  return {
    port: srv.address().port,
    requests,
    get connections() {
      return connections;
    },
    get bytes() {
      return bytes;
    },
    close: () =>
      new Promise((resolve) => {
        srv.closeAllConnections?.();
        srv.close(resolve);
      }),
  };
}

const target = (port, path = '/status.cgi', method = 'GET') => ({
  host: '127.0.0.1',
  port,
  method,
  path,
});

test('the fingerprint is checked first, then the request goes; one connection; our own User-Agent', async () => {
  const s = await server((req, res) => res.end('{"ok":true}'));
  try {
    const seen = [];
    const res = await httpsRequest(target(s.port, '/reboot.cgi', 'POST'), {
      body: 'reboot=yes',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 5000,
      maxBytes: 1000,
      checkPeer: async (fingerprint) => {
        seen.push(fingerprint);
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(seen, [CERT.fingerprint256]);
    assert.equal(s.requests[0].body, 'reboot=yes');
    assert.match(s.requests[0].headers['user-agent'], /^gladys-airos /);
    assert.doesNotMatch(s.requests[0].headers['user-agent'], /Mozilla|Chrome|Safari/);
    assert.equal(s.connections, 1);
  } finally {
    await s.close();
  }
});

test('a certificate refused: not a byte of the request written (password safe)', async () => {
  const s = await server((req, res) => res.end('{}'));
  try {
    const err = await httpsRequest(target(s.port, '/api/auth', 'POST'), {
      body: '{"password":"secret"}',
      timeout: 5000,
      maxBytes: 1000,
      checkPeer: () => {
        throw Object.assign(new Error('pin'), { code: CODES.CERTIFICATE });
      },
    }).catch((e) => e);
    assert.equal(err.code, CODES.CERTIFICATE);
    assert.equal(err.notSent, true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(s.requests.length, 0);
    assert.equal(s.bytes, 0, 'no application data after the handshake');
  } finally {
    await s.close();
  }
});

test('beforeSend throwing: nothing sent, marked notSent', async () => {
  const s = await server((req, res) => res.end('{}'));
  try {
    const err = await httpsRequest(target(s.port, '/reboot.cgi', 'POST'), {
      body: 'reboot=yes',
      timeout: 5000,
      maxBytes: 1000,
      checkPeer: () => {},
      beforeSend: () => {
        throw new Error('option off');
      },
    }).catch((e) => e);
    assert.equal(err.message, 'option off');
    assert.equal(err.notSent, true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(s.requests.length, 0);
  } finally {
    await s.close();
  }
});

test('size cap, deadline, redirect not followed, unreachable without the address', async () => {
  const s = await server((req, res) => {
    if (req.url === '/big') res.end('x'.repeat(5000));
    else if (req.url === '/redirect') {
      res.writeHead(302, { location: 'https://example.com/' });
      res.end();
    }
    // '/slow': never answers.
  });
  try {
    const options = { timeout: 300, maxBytes: 1000, checkPeer: () => {} };
    const big = await httpsRequest(target(s.port, '/big'), options).catch((e) => e);
    assert.equal(big.code, CODES.TOO_LARGE);
    const slow = await httpsRequest(target(s.port, '/slow'), options).catch((e) => e);
    assert.equal(slow.code, CODES.TIMEOUT);
    assert.equal(slow.notSent, false);
    const redirect = await httpsRequest(target(s.port, '/redirect'), options);
    assert.equal(redirect.status, 302);
    assert.equal(s.requests.filter((r) => r.url === '/redirect').length, 1);
  } finally {
    await s.close();
  }
  const down = await httpsRequest(target(1), {
    timeout: 2000,
    maxBytes: 10,
    checkPeer: () => {},
  }).catch((e) => e);
  assert.equal(down.code, CODES.UNREACHABLE);
  assert.doesNotMatch(down.message, /127\.0\.0\.1/);
});
