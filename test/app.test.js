// -----------------------------------------------------------------------------
// The app end to end: fake Gladys (SDK), fake radio, virtual clock, the
// handlers of the container.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, SCENE_TRIGGERS } from '../src/constants.js';
import { memoryStore } from '../src/store.js';
import { PASSWORD, SECRETS, station, status } from './fixtures/airos.js';
import {
  BASE_CONFIG,
  HOST,
  MINUTE,
  SECOND,
  T0,
  badge,
  feature,
  radioDevice,
  sentTo,
  settle,
  setup,
  state,
} from './helpers/app.js';
import { FINGERPRINT, OTHER_FINGERPRINT, createFakeRadio } from './helpers/fakeRadio.js';

const KEY = `${HOST}:443`;
const press = (gladys, value = 1) => {
  const device = radioDevice();
  return gladys.fake.setValue(device, feature(device, FEATURES.REBOOT), value);
};

/** Nothing secret nor identifying left the integration (logs, Gladys, /data). */
function assertNoSecret({ gladys, logs, store }) {
  const out = JSON.stringify([
    logs,
    gladys.fake.requests,
    gladys.fake.connectionStatuses,
    gladys.fake.sceneEvents,
    store.data,
  ]);
  for (const secret of SECRETS) assert.ok(!out.includes(secret), `leaked: ${secret}`);
}

test('first start: the certificate pinned in /data before the password is sent, then everything published', async () => {
  const store = memoryStore();
  const radio = createFakeRadio();
  let pinnedBeforeLogin = null;
  radio.hook = (entry) => {
    if (entry.path === '/api/auth') pinnedBeforeLogin ??= store.data?.pins?.[KEY] ?? null;
  };
  const ctx = await setup({ radio, store });
  assert.equal(pinnedBeforeLogin, FINGERPRINT);
  assert.equal(sentTo(radio, '/api/auth').length, 1);
  assert.equal(sentTo(radio, '/status.cgi').length, 1);
  const { gladys } = ctx;
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /NanoBeam 5AC answers: 1 station/);
  assert.equal(state(gladys, FEATURES.LINK), 1);
  assert.equal(state(gladys, FEATURES.STATIONS), 1);
  assert.equal(state(gladys, FEATURES.SIGNAL), -52);
  assert.equal(state(gladys, FEATURES.REMOTE_SIGNAL), -64);
  assert.equal(state(gladys, FEATURES.TX_RATE), 76);
  assert.equal(state(gladys, FEATURES.DOWNLINK_CAPACITY), 124740);
  assert.equal(state(gladys, FEATURES.DISTANCE), 750);
  assert.equal(state(gladys, FEATURES.LAN_SPEED), 1000);
  assert.equal(state(gladys, FEATURES.TEMPERATURE), undefined, '0 = no sensor');
  assert.equal(state(gladys, FEATURES.WIRELESS_MODE), 'Access point PtMP');
  assert.equal(state(gladys, FEATURES.FIRMWARE), 'v8.7.18');
  assert.equal(badge(gladys).transport, 'local');
  const discovered = gladys.fake.discoveredDevices[0];
  assert.equal(discovered.name, 'Barn NanoBeam');
  // The login sends JSON; no browser User-Agent is set by the client.
  const login = sentTo(radio, '/api/auth')[0];
  assert.deepEqual(JSON.parse(login.body), { username: 'ubnt', password: PASSWORD });
  assert.equal(login.headers['user-agent'], undefined, 'set by the transport only');
  assertNoSecret({ ...ctx, store });
});

test('the reboot feature is a push button, never a switch; every other feature is read only', () => {
  const device = radioDevice();
  const reboot = feature(device, FEATURES.REBOOT);
  assert.equal(reboot.category, 'button');
  assert.equal(reboot.type, 'push');
  for (const f of device.features.filter((x) => x !== reboot)) {
    assert.equal(f.read_only, true, f.name);
    assert.notEqual(f.category, 'switch', f.name);
  }
});

test('pace: never two readings less than the interval apart; a restart keeps it (/data)', async () => {
  const store = memoryStore();
  const ctx = await setup({ store });
  assert.equal(sentTo(ctx.radio, '/status.cgi').length, 1);
  await ctx.wait(59 * SECOND);
  assert.equal(sentTo(ctx.radio, '/status.cgi').length, 1);
  await ctx.wait(1 * SECOND);
  assert.equal(sentTo(ctx.radio, '/status.cgi').length, 2, 'the interval');
  assert.equal(sentTo(ctx.radio, '/api/auth').length, 1, 'the session is used again');
  // A save of the form, the test button: never sooner.
  await ctx.gladys.fake.configUpdated({ ...BASE_CONFIG });
  await settle();
  await ctx.gladys.fake.action('test_connection');
  await settle();
  assert.equal(sentTo(ctx.radio, '/status.cgi').length, 2);
  // A restart of the container 10 s after the last attempt.
  await ctx.app.stop();
  const radio2 = createFakeRadio();
  const again = await setup({ store, radio: radio2, now: ctx.clock.now + 10 * SECOND });
  assert.equal(sentTo(radio2, '/status.cgi').length, 0, 'not before the interval');
  assert.match(again.gladys.fake.connectionStatus.message.en, /read in 50 s/);
  await again.wait(50 * SECOND);
  assert.equal(sentTo(radio2, '/status.cgi').length, 1);
});

test('another certificate: nothing sent, kept in /data, lifted only by typing the fingerprint met', async () => {
  const store = memoryStore();
  const ctx = await setup({ store });
  ctx.radio.fingerprint = OTHER_FINGERPRINT;
  const before = ctx.radio.sent.length;
  ctx.radio.expireSessions();
  await ctx.wait(MINUTE);
  assert.equal(ctx.radio.sent.length, before, 'not a byte after the handshake');
  assert.deepEqual(store.data.certChanged, { key: KEY, seen: OTHER_FINGERPRINT });
  assert.equal(store.data.pins[KEY], FINGERPRINT, 'the pin is never replaced blindly');
  assert.match(ctx.gladys.fake.connectionStatus.message.en, new RegExp(OTHER_FINGERPRINT));
  assert.equal(badge(ctx.gladys).transport, 'unreachable');
  await ctx.wait(30 * MINUTE);
  assert.equal(ctx.radio.connections, before + 1, 'no retry');
  // Saving the same configuration lifts nothing.
  await ctx.gladys.fake.configUpdated({ ...BASE_CONFIG });
  await ctx.wait(10 * MINUTE);
  assert.equal(ctx.radio.sent.length, before);
  // Another fingerprint typed: still nothing sent.
  await ctx.gladys.fake.configUpdated({ ...BASE_CONFIG, certificate_fingerprint: FINGERPRINT });
  await ctx.wait(10 * MINUTE);
  assert.equal(ctx.radio.sent.length, before);
  assert.match(ctx.gladys.fake.connectionStatus.message.en, /HTTPS certificate/);
  // The very fingerprint met, typed without colons in lower case: pinned, read.
  const typed = OTHER_FINGERPRINT.replace(/:/g, '').toLowerCase();
  await ctx.gladys.fake.configUpdated({ ...BASE_CONFIG, certificate_fingerprint: typed });
  await ctx.wait(MINUTE);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, true);
  assert.equal(store.data.pins[KEY], OTHER_FINGERPRINT);
  assert.equal(store.data.certChanged, null);
  // The field emptied again: the pin stays, nothing learned blindly.
  ctx.radio.fingerprint = FINGERPRINT;
  await ctx.gladys.fake.configUpdated({ ...BASE_CONFIG });
  await ctx.wait(MINUTE);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, false);
  assert.equal(store.data.pins[KEY], OTHER_FINGERPRINT);
});

test('the certificate kept across a restart: another one met at the first reading sends nothing', async () => {
  const store = memoryStore();
  const first = await setup({ store });
  await first.app.stop();
  const radio = createFakeRadio({ fingerprint: OTHER_FINGERPRINT });
  await setup({ store, radio, now: T0 + 2 * MINUTE });
  assert.equal(radio.sent.length, 0);
  assert.equal(store.data.certChanged.seen, OTHER_FINGERPRINT);
});

test('/data unreadable: no certificate learned, nothing sent, nothing written; a typed fingerprint works', async () => {
  const store = memoryStore({ pins: { [KEY]: OTHER_FINGERPRINT } }, { unreadable: true });
  const ctx = await setup({ store });
  assert.equal(ctx.radio.sent.length, 0);
  assert.equal(ctx.radio.connections, 1);
  assert.match(ctx.gladys.fake.connectionStatus.message.en, /cannot be read/);
  assert.match(ctx.gladys.fake.connectionStatus.message.en, new RegExp(FINGERPRINT));
  assert.equal(store.saves, 0);
  await ctx.gladys.fake.configUpdated({ ...BASE_CONFIG, certificate_fingerprint: FINGERPRINT });
  await ctx.wait(MINUTE);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, true);
  assert.equal(store.saves, 0, 'the unreadable file is never overwritten');
});

test('/data not writable: the first certificate is not trusted, nothing sent', async () => {
  const store = memoryStore(null, { failing: true });
  const ctx = await setup({ store });
  assert.equal(ctx.radio.sent.length, 0);
  assert.match(ctx.gladys.fake.connectionStatus.message.en, /cannot be kept/);
});

test('credentials refused: kept in /data, never retried by the loop nor a restart; a new password is tried', async () => {
  const store = memoryStore();
  const radio = createFakeRadio({ password: 'another one' });
  const ctx = await setup({ radio, store });
  assert.equal(sentTo(radio, '/api/auth').length, 1);
  assert.match(
    ctx.gladys.fake.connectionStatus.message.en,
    /refused the user name or the password/,
  );
  assert.equal(store.data.refused.key, KEY);
  assert.equal(store.data.refused.tag.length, 2, '8 bits, never a hash of the password');
  await ctx.wait(2 * 60 * MINUTE);
  assert.equal(sentTo(radio, '/api/auth').length, 1);
  await ctx.gladys.fake.configUpdated({ ...BASE_CONFIG });
  await ctx.wait(10 * MINUTE);
  assert.equal(sentTo(radio, '/api/auth').length, 1, 'the same password is not sent again');
  await ctx.app.stop();
  const again = await setup({ radio, store, now: ctx.clock.now + MINUTE });
  await again.wait(10 * MINUTE);
  assert.equal(sentTo(radio, '/api/auth').length, 1);
  // The test button tries once; the refusal stays until a success.
  await again.gladys.fake.action('test_connection');
  await settle();
  assert.equal(sentTo(radio, '/api/auth').length, 2);
  radio.password = 'right one';
  await again.gladys.fake.configUpdated({ ...BASE_CONFIG, password: 'right one' });
  await again.wait(MINUTE);
  assert.equal(again.gladys.fake.connectionStatus.connected, true);
  assert.equal(store.data.refused, null);
});

test('a session expired is opened again once; a status refused right after a login is not a refusal', async () => {
  const ctx = await setup();
  ctx.radio.expireSessions();
  await ctx.wait(MINUTE);
  assert.equal(sentTo(ctx.radio, '/api/auth').length, 2);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, true);
  ctx.radio.override('/status.cgi', { status: 403 });
  await ctx.wait(MINUTE);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, false);
  assert.match(ctx.gladys.fake.connectionStatus.message.en, /access refused to the status/);
  assert.equal(ctx.app.final, null, 'not a refusal of the credentials');
  const logins = sentTo(ctx.radio, '/api/auth').length;
  assert.equal(logins, 3, 'one new login in that reading, not a loop');
});

test('HTTP 429: a pause kept in /data and across a restart, bounded', async () => {
  const store = memoryStore();
  const ctx = await setup({ store });
  ctx.radio.override('/status.cgi', { status: 429, headers: { 'retry-after': '600' } }, 1);
  await ctx.wait(MINUTE);
  assert.match(ctx.gladys.fake.connectionStatus.message.en, /HTTP 429/);
  assert.equal(store.data.pause.status, 429);
  const count = sentTo(ctx.radio, '/status.cgi').length;
  await ctx.app.stop();
  const again = await setup({ store, radio: ctx.radio, now: ctx.clock.now + MINUTE });
  await again.wait(8 * MINUTE);
  assert.equal(sentTo(ctx.radio, '/status.cgi').length, count, 'paused');
  await again.wait(90 * SECOND);
  assert.equal(sentTo(ctx.radio, '/status.cgi').length, count + 1);
  assert.equal(again.gladys.fake.connectionStatus.connected, true);
  assert.equal(store.data.pause, null);
});

test('unreachable: retried never faster than the interval, doubling; values never republished as fresh', async () => {
  const ctx = await setup();
  const published = ctx.gladys.fake.states.length;
  ctx.radio.state = 'down';
  await ctx.wait(MINUTE);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, false);
  assert.equal(badge(ctx.gladys).transport, 'unreachable');
  const tries = () => ctx.radio.connections;
  const at = tries();
  await ctx.wait(MINUTE);
  assert.equal(tries(), at + 1);
  await ctx.wait(MINUTE);
  assert.equal(tries(), at + 1, 'doubled: 2 min');
  await ctx.wait(MINUTE);
  assert.equal(tries(), at + 2);
  assert.equal(ctx.gladys.fake.states.length, published, 'nothing published while it fails');
  // Gladys reconnects during the outage: no old value sent again.
  await ctx.gladys.fake.configUpdated({ ...BASE_CONFIG });
  await settle();
  assert.equal(ctx.gladys.fake.states.length, published);
});

test('link lost and back: scene events, never at the first reading', async () => {
  const radio = createFakeRadio();
  const ctx = await setup({ radio });
  assert.equal(ctx.gladys.fake.sceneEvents.length, 0);
  radio.answer = () => status({ wireless: { count: 0, sta: [] } });
  await ctx.wait(MINUTE);
  assert.equal(state(ctx.gladys, FEATURES.LINK), 0);
  radio.answer = () => status({ wireless: { count: 1, sta: [station()] } });
  await ctx.wait(MINUTE);
  assert.deepEqual(
    ctx.gladys.fake.sceneEvents.map((e) => e.key),
    [SCENE_TRIGGERS.LINK_LOST, SCENE_TRIGGERS.LINK_RESTORED],
  );
  for (const event of ctx.gladys.fake.sceneEvents) {
    assert.equal(event.data.radio_name, 'Barn NanoBeam');
  }
});

test('another radio at the address (other MAC): nothing published nor commanded; a save takes it', async () => {
  const store = memoryStore();
  const radio = createFakeRadio();
  const ctx = await setup({ radio, store, config: { allow_reboot: true } });
  const published = ctx.gladys.fake.states.length;
  radio.answer = () =>
    status({
      host: { hostname: 'Other' },
      interfaces: [
        {
          ifname: 'br0',
          hwaddr: '24:5A:4C:99:99:99',
          enabled: true,
          status: { plugged: true },
        },
      ],
    });
  await ctx.wait(MINUTE);
  assert.equal(ctx.gladys.fake.states.length, published);
  assert.match(ctx.gladys.fake.connectionStatus.message.en, /Another radio/);
  const ack = await press(ctx.gladys);
  assert.equal(ack.success, false);
  assert.equal(radio.reboots, 0);
  await ctx.gladys.fake.configUpdated({ ...BASE_CONFIG, allow_reboot: true });
  await ctx.wait(MINUTE);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, true);
  assert.ok(ctx.gladys.fake.states.length > published);
});

test('reboot: refused unless allowed, nothing sent', async () => {
  const ctx = await setup();
  const ack = await press(ctx.gladys);
  assert.equal(ack.success, false);
  assert.match(ack.error, /disabled/);
  assert.equal(sentTo(ctx.radio, '/reboot.cgi').length, 0);
  const reading = await ctx.gladys.fake.setValue(
    radioDevice(),
    feature(radioDevice(), FEATURES.SIGNAL),
    1,
  );
  assert.match(reading.error, /read only/);
});

test('reboot allowed: a fresh read of the same radio, one request, a 10 min cooldown kept in /data', async () => {
  const store = memoryStore();
  const ctx = await setup({ store, config: { allow_reboot: true } });
  for (const bad of [0, true, '', '0']) {
    const ack = await press(ctx.gladys, bad);
    assert.equal(ack.success, false, String(bad));
  }
  const reads = sentTo(ctx.radio, '/status.cgi').length;
  const ack = await press(ctx.gladys);
  assert.equal(ack.success, true, ack.error);
  assert.equal(sentTo(ctx.radio, '/status.cgi').length, reads + 1, 'read just before');
  const reboot = sentTo(ctx.radio, '/reboot.cgi');
  assert.equal(reboot.length, 1);
  assert.equal(reboot[0].body, 'reboot=yes');
  assert.ok(reboot[0].headers.cookie && reboot[0].headers['x-csrf-id']);
  assert.equal(store.data.rebootAt.key, KEY);
  const again = await press(ctx.gladys);
  assert.match(again.error, /less than 10 min ago/);
  // A restart keeps the cooldown.
  await ctx.app.stop();
  const next = await setup({
    store,
    radio: ctx.radio,
    now: ctx.clock.now + 5 * MINUTE,
    config: { allow_reboot: true },
  });
  const third = await press(next.gladys);
  assert.match(third.error, /less than 10 min ago/);
  await next.wait(6 * MINUTE);
  const fourth = await press(next.gladys);
  assert.equal(fourth.success, true, fourth.error);
  assert.equal(ctx.radio.reboots, 2);
  assertNoSecret({ ...next, store });
});

test('reboot: the option turned off during the fresh read stops it before the request is written', async () => {
  const ctx = await setup({ config: { allow_reboot: true } });
  ctx.radio.hook = async (entry) => {
    if (entry.path === '/status.cgi') {
      ctx.gladys.fake.config = { ...BASE_CONFIG, allow_reboot: false };
      ctx.app.config.allowReboot = false;
    }
  };
  const ack = await press(ctx.gladys);
  assert.equal(ack.success, false);
  assert.equal(sentTo(ctx.radio, '/reboot.cgi').length, 0);
});

test('reboot: a radio too slow to answer the fresh read: nothing sent', async () => {
  const ctx = await setup({ config: { allow_reboot: true } });
  ctx.radio.hook = async (entry) => {
    if (entry.path === '/status.cgi') ctx.clock.now += 3 * SECOND;
  };
  const ack = await press(ctx.gladys);
  assert.equal(ack.success, false);
  assert.match(ack.error, /in time/);
  assert.equal(sentTo(ctx.radio, '/reboot.cgi').length, 0);
});

test('getConfig failing at start: asked again without end, the status saying so', async () => {
  let calls = 0;
  const ctx = await setup({ connect: false });
  await ctx.gladys.connect();
  await settle();
  ctx.gladys.getConfig = async () => {
    calls += 1;
    if (calls < 3) throw new Error('boom');
    return { ...BASE_CONFIG };
  };
  ctx.radio.state = 'down';
  await ctx.app.startFromGladys();
  ctx.radio.state = null;
  assert.equal(calls, 1);
  assert.match(ctx.gladys.fake.connectionStatus.message.en, /did not give the configuration/);
  await ctx.wait(30 * SECOND);
  assert.equal(calls, 2);
  await ctx.wait(MINUTE);
  assert.equal(calls, 3);
  assert.equal(ctx.gladys.fake.connectionStatus.connected, true);
});

test('configuration problems are said, nothing sent; plain HTTP refused', async () => {
  for (const [config, pattern] of [
    [{ host: '' }, /Enter the address/],
    [{ host: 'http://192.168.1.20' }, /Plain HTTP is not supported/],
    [{ password: '' }, /Enter the password/],
    [{ password: 'abc\n' }, /line break/],
    [{ certificate_fingerprint: 'nope' }, /not a SHA-256/],
  ]) {
    const ctx = await setup({ config });
    assert.match(ctx.gladys.fake.connectionStatus.message.en, pattern);
    assert.equal(ctx.radio.connections, 0);
  }
});

test('a station (PtP): its signal, its temperature', async () => {
  const { stationStatus } = await import('./fixtures/airos.js');
  const radio = createFakeRadio({ answer: () => stationStatus() });
  const ctx = await setup({ radio });
  assert.equal(state(ctx.gladys, FEATURES.SIGNAL), -58);
  assert.equal(state(ctx.gladys, FEATURES.TEMPERATURE), 41);
  assert.equal(state(ctx.gladys, FEATURES.WIRELESS_MODE), 'Station PtP');
});

test('a fingerprint typed lifts a kept "certificate changed", whatever it saw; the radio must show it', async () => {
  // Pinned on B (FINGERPRINT); C (OTHER) met once; the radio back on B.
  const seed = () =>
    memoryStore({
      salt: '07'.repeat(32),
      pins: { [KEY]: FINGERPRINT },
      certChanged: { key: KEY, seen: OTHER_FINGERPRINT },
    });
  const onB = createFakeRadio();
  const a = await setup({
    radio: onB,
    store: seed(),
    config: { certificate_fingerprint: FINGERPRINT },
  });
  assert.equal(a.gladys.fake.connectionStatus.connected, true);
  assert.equal(a.store.data.certChanged, null);
  // The radio on C while B is typed: refused, the status shows C, no login.
  const onC = createFakeRadio({ fingerprint: OTHER_FINGERPRINT });
  const b = await setup({
    radio: onC,
    store: seed(),
    config: { certificate_fingerprint: FINGERPRINT },
  });
  assert.equal(b.gladys.fake.connectionStatus.connected, false);
  assert.match(b.gladys.fake.connectionStatus.message.en, /not the fingerprint you typed/);
  assert.match(b.gladys.fake.connectionStatus.message.en, new RegExp(OTHER_FINGERPRINT));
  assert.equal(sentTo(onC, '/api/auth').length, 0);
  // The field empty: still nothing lifted.
  const c = await setup({ radio: createFakeRadio(), store: seed() });
  assert.match(c.gladys.fake.connectionStatus.message.en, new RegExp(OTHER_FINGERPRINT));
  assert.equal(c.radio.connections, 0);
});

for (const options of [{ failing: true }, { unreadable: true }]) {
  test(`reboot refused when its 10 min delay cannot be kept in /data (${Object.keys(options)[0]})`, async () => {
    const store = memoryStore(null, options);
    const ctx = await setup({
      store,
      config: { allow_reboot: true, certificate_fingerprint: FINGERPRINT },
    });
    assert.equal(ctx.gladys.fake.connectionStatus.connected, true);
    const ack = await press(ctx.gladys);
    assert.equal(ack.success, false);
    assert.match(ack.error, /cannot be kept in \/data/);
    assert.equal(sentTo(ctx.radio, '/reboot.cgi').length, 0);
  });
}

test('the marker of a refused password: 8 bits, shared by many passwords (no brute force)', async () => {
  const { refusalTag } = await import('../src/app.js');
  const salt = 'ab'.repeat(32);
  const target = refusalTag(salt, 'Ferme-2024!');
  assert.match(target, /^[0-9a-f]{2}$/);
  let same = 0;
  for (let i = 0; i < 10_000; i += 1) {
    if (refusalTag(salt, `candidate-${i}-${Math.random()}`) === target) same += 1;
  }
  assert.ok(same >= 10_000 / 300, `${same} of 10 000 share it`);
});

test('reboot: an identity not checked yet is said so, never "another radio"', async () => {
  const radio = createFakeRadio({ answer: () => status({ interfaces: [] }) });
  const ctx = await setup({ radio, config: { allow_reboot: true } });
  radio.answer = () => status();
  const ack = await press(ctx.gladys);
  assert.match(ack.error, /not checked yet/);
  assert.equal(sentTo(radio, '/reboot.cgi').length, 0);
});
