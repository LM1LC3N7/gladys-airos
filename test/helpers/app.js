// -----------------------------------------------------------------------------
// The app against the SDK's fake Gladys, the fake radio and a virtual clock,
// through the exact wiring of the container (src/handlers.js).
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { AirosApp } from '../../src/app.js';
import { buildRadioDevice } from '../../src/devices.js';
import { registerHandlers } from '../../src/handlers.js';
import { memoryStore } from '../../src/store.js';
import { PASSWORD, USERNAME } from '../fixtures/airos.js';
import { createFakeClock } from './fakeClock.js';
import { createFakeRadio } from './fakeRadio.js';

export const SELECTOR = 'airos';
export const T0 = Date.parse('2026-10-26T08:00:00Z');
export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const HOST = '192.168.1.20';
export const BASE_CONFIG = { host: HOST, username: USERNAME, password: PASSWORD };

const ids = createFakeGladys({ selector: SELECTOR });
export const radioDevice = () => buildRadioDevice(ids, { hostname: 'Barn NanoBeam' });
export const feature = (device, key) =>
  device.features.find((f) => f.external_id.endsWith(`:${key}`));
export const state = (gladys, key) =>
  gladys.fake.lastState(feature(radioDevice(), key).external_id);
export const badge = (gladys) =>
  gladys.fake.transports.filter((t) => t.device_external_id === radioDevice().external_id).at(-1);

const tick = () => new Promise((resolve) => setImmediate(resolve));
export const settle = async () => {
  for (let i = 0; i < 20; i += 1) await tick();
};

/** A random source giving the same salt every time. */
export const fixedRandom = (size) => Buffer.alloc(size, 7);

export async function setup({
  config = {},
  created = [radioDevice()],
  radio = createFakeRadio(),
  store = memoryStore(),
  now = T0,
  connect = true,
  getConfig,
} = {}) {
  const gladys = createFakeGladys({
    selector: SELECTOR,
    config: { ...BASE_CONFIG, ...config },
    devices: created,
  });
  if (getConfig) gladys.getConfig = getConfig;
  const { clock, timers, advance, pending } = createFakeClock(now);
  let drift = 0;
  const logs = [];
  const logger = Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((level) => [
      level,
      (...args) => logs.push(`${level} ${args.map((a) => a?.stack ?? String(a)).join(' ')}`),
    ]),
  );
  const app = new AirosApp({
    gladys,
    logger,
    request: radio.request,
    now: () => clock.now,
    // A real monotonic clock moves between two reads of it: 1 µs per call
    // here, so that a decision reading the clock twice is caught.
    monotonic: () => clock.now + (drift += 0.001),
    timers,
    store,
    random: fixedRandom,
  });
  registerHandlers(gladys, app, logger);
  if (connect) {
    await gladys.connect();
    await advance(0);
    await settle();
  }
  const wait = async (ms) => {
    await advance(ms);
    await settle();
  };
  return { app, gladys, radio, clock, timers, pending, advance, wait, logs, store };
}

/** The requests of the radio for a path. */
export const sentTo = (radio, path) => radio.sent.filter((r) => r.path === path);
