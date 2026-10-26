// -----------------------------------------------------------------------------
// The status answer -> the values of the radio (src/airos/parse.js).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityOf, modeOf, num, parseStatus } from '../src/airos/parse.js';
import { MAC_BR0, MAC_ETH0, station, stationStatus, status } from './fixtures/airos.js';

test('an access point PtMP', () => {
  const r = parseStatus(status());
  assert.equal(r.mac, MAC_BR0);
  assert.equal(r.model, 'NanoBeam 5AC');
  assert.equal(r.firmwareMajor, 8);
  assert.equal(r.role, 'access_point');
  assert.equal(r.ptmp, true);
  assert.equal(r.stations, 1);
  assert.equal(r.signal, -52);
  assert.equal(r.remoteSignal, -64);
  assert.equal(r.noiseFloor, -92);
  assert.equal(r.rxRate, 1076);
  assert.equal(r.uplinkCapacity, 223560);
  assert.equal(r.frequency, 5180);
  assert.equal(r.channelWidth, 40);
  assert.equal(r.memoryUsed, 75.1);
  assert.equal(r.temperature, null, '0 = no sensor');
  assert.equal(r.lanLink, true);
  assert.equal(r.lanSpeed, 1000);
  assert.ok(!JSON.stringify(r).includes('192.168.0.125'), 'no station address read');
});

test('a station PtP; the weakest station of an access point', () => {
  const r = parseStatus(stationStatus());
  assert.equal(r.role, 'station');
  assert.equal(r.ptmp, false);
  assert.equal(r.temperature, 41);
  const many = parseStatus(
    status({ wireless: { count: 2, sta: [station({ signal: -50 }), station({ signal: -71 })] } }),
  );
  assert.equal(many.signal, -71);
});

test('odd values are unknown, never 0 nor a guess; not a status throws', () => {
  const r = parseStatus(
    status({
      host: { cpuload: '12', uptime: -1, totalram: 0, fwversion: 7 },
      wireless: { mode: 'weird', count: undefined, sta: 'x', noisef: 5, throughput: null },
      interfaces: [{ ifname: 'eth0', hwaddr: 'xxxxxxxxxxxx', enabled: true, status: {} }],
    }),
  );
  assert.equal(r.cpuLoad, null);
  assert.equal(r.uptime, null);
  assert.equal(r.memoryUsed, null);
  assert.equal(r.firmware, null);
  assert.equal(r.role, null);
  assert.equal(r.stations, null);
  assert.equal(r.signal, null);
  assert.equal(r.noiseFloor, null);
  assert.equal(r.txRate, null);
  assert.equal(r.mac, null, 'an anonymized MAC is no identity');
  assert.equal(r.lanLink, null);
  assert.throws(() => parseStatus({}), TypeError);
  assert.throws(() => parseStatus(null), TypeError);
  assert.equal(num(''), null);
  assert.equal(num(Number.NaN), null);
});

test('identity: br0, then eth0, then ath0; enabled interfaces only', () => {
  const i = (ifname, hwaddr, enabled = true) => ({ ifname, hwaddr, enabled });
  assert.equal(identityOf([i('ath0', MAC_BR0), i('eth0', MAC_ETH0)]), MAC_ETH0);
  assert.equal(identityOf([i('br0', MAC_BR0, false), i('eth0', MAC_ETH0)]), MAC_ETH0);
  assert.equal(identityOf([i('wlan0', MAC_BR0)]), null);
  assert.equal(identityOf([i('br0', '00:00:00:00:00:00')]), null);
  assert.equal(identityOf('x'), null);
  assert.deepEqual(modeOf('sta-ptmp'), { role: 'station', ptmp: true });
});
