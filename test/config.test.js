// -----------------------------------------------------------------------------
// The configuration, normalized (src/config.js).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseFingerprint, parseHost } from '../src/config.js';

test('addresses: IPv4, names, IPv6, a port, an address pasted from a browser; HTTP refused', () => {
  assert.deepEqual(parseHost('192.168.1.20'), { host: '192.168.1.20', port: null });
  assert.deepEqual(parseHost(' 192.168.1.20:8443 '), { host: '192.168.1.20', port: 8443 });
  assert.deepEqual(parseHost('https://NanoBeam.lan/index.cgi'), {
    host: 'nanobeam.lan',
    port: null,
  });
  assert.deepEqual(parseHost('[fe80::1]:444'), { host: 'fe80::1', port: 444 });
  assert.deepEqual(parseHost('http://192.168.1.20'), { error: 'http' });
  for (const bad of ['', '300.1.1.1', 'https://u:p@host', 'host:99999', 'ftp://host', 'a b']) {
    assert.ok(parseHost(bad).error, bad);
  }
});

test('fingerprints: any common spelling, else invalid', () => {
  const fp = 'AB:'.repeat(31) + 'AB';
  assert.equal(parseFingerprint(fp.toLowerCase()), fp);
  assert.equal(parseFingerprint(fp.replace(/:/g, '')), fp);
  assert.equal(parseFingerprint(`SHA256: ${fp.replace(/:/g, ' ')}`), fp);
  assert.equal(parseFingerprint(''), '');
  assert.equal(parseFingerprint(undefined), '');
  assert.equal(parseFingerprint('AB:CD'), null);
});

test('defaults; the password kept as typed; control characters refused', () => {
  const c = normalizeConfig({ host: '10.0.0.2', password: ' pass ' });
  assert.equal(c.username, 'ubnt');
  assert.equal(c.password, ' pass ');
  assert.equal(c.port, 443);
  assert.equal(c.pollMs, 60_000);
  assert.equal(c.allowReboot, false);
  assert.equal(normalizeConfig({ allow_reboot: 'true' }).allowReboot, true);
  assert.equal(normalizeConfig({ allow_reboot: 1 }).allowReboot, false);
  assert.equal(normalizeConfig({ password: 'a\nb' }).passwordInvalid, true);
  assert.equal(normalizeConfig({ poll_interval: '5' }).pollMs, 60_000);
  assert.equal(normalizeConfig({ poll_interval: '300' }).pollMs, 300_000);
  assert.equal(normalizeConfig(null).hostError, 'missing');
});
