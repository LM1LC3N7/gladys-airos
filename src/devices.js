// -----------------------------------------------------------------------------
// The Gladys device of the radio (pure): `ext:<selector>:radio:main`.
//
// Every value is read only. The reboot is a `button`/`push` feature, never a
// switch nor a binary: a "turn everything off" of a voice assistant, MCP or a
// `switch` scene action must not reach it; it is refused unless allowed in
// the configuration.
//
// A device published again never loses a feature: the core would mark it
// `structure_changed`, and "Update" would drop the history of the missing
// one. The features of the device created in Gladys (`gladys.devices`, kept
// up to date by the SDK) are added back when the blueprint lacks them.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { FEATURES as F, RADIO_ID, RADIO_TYPE } from './constants.js';

export const radioIds = (gladys) => gladys.externalIds(RADIO_TYPE, RADIO_ID);

const reading = (extra) => ({ read_only: true, has_feedback: false, keep_history: true, ...extra });
const textual = () =>
  reading({ category: C.TEXT, type: T.TEXT.TEXT, min: 0, max: 0, keep_history: false });
// No dBm, %, MHz unit for these categories in the core: the unit is in the name.
const plain = (min, max) => reading({ category: C.UNKNOWN, type: T.UNKNOWN.UNKNOWN, min, max });
const rate = () =>
  reading({
    category: C.DATARATE,
    type: T.DATARATE.RATE,
    unit: U.KILOBITS_PER_SECOND,
    min: 0,
    max: 100_000_000,
  });

/** The features of the radio: [key, name, definition, value of a reading]. Units of the core only. */
export const RADIO_FEATURES = [
  // Never a switch: read-only `unknown`/`binary`.
  [
    F.LINK,
    'Wireless link up',
    reading({ category: C.UNKNOWN, type: T.SENSOR.BINARY, min: 0, max: 1 }),
    (r) => (r.stations === null ? null : r.stations > 0 ? 1 : 0),
  ],
  [F.STATIONS, 'Connected stations', plain(0, 100_000), (r) => r.stations],
  [F.SIGNAL, 'Signal (dBm)', plain(-150, 0), (r) => r.signal],
  [F.REMOTE_SIGNAL, 'Remote signal (dBm)', plain(-150, 0), (r) => r.remoteSignal],
  [F.NOISE_FLOOR, 'Noise floor (dBm)', plain(-150, 0), (r) => r.noiseFloor],
  [F.TX_RATE, 'Transmit rate', rate(), (r) => r.txRate],
  [F.RX_RATE, 'Receive rate', rate(), (r) => r.rxRate],
  [F.DOWNLINK_CAPACITY, 'Downlink capacity', rate(), (r) => r.downlinkCapacity],
  [F.UPLINK_CAPACITY, 'Uplink capacity', rate(), (r) => r.uplinkCapacity],
  [
    F.DISTANCE,
    'Link distance',
    reading({
      category: C.DISTANCE_SENSOR,
      type: T.SENSOR.DECIMAL,
      unit: U.M,
      min: 0,
      max: 1_000_000,
    }),
    (r) => r.distance,
  ],
  [F.FREQUENCY, 'Frequency (MHz)', plain(0, 100_000), (r) => r.frequency],
  [F.CHANNEL_WIDTH, 'Channel width (MHz)', plain(0, 1000), (r) => r.channelWidth],
  [F.CPU_LOAD, 'CPU load (%)', plain(0, 100), (r) => r.cpuLoad],
  [F.MEMORY_USED, 'Memory used (%)', plain(0, 100), (r) => r.memoryUsed],
  [
    F.UPTIME,
    'Uptime',
    reading({
      category: C.DURATION,
      type: T.DURATION.DECIMAL,
      unit: U.HOURS,
      min: 0,
      max: 1_000_000,
      keep_history: false,
    }),
    (r) => (r.uptime === null ? null : Math.round(r.uptime / 360) / 10),
  ],
  [
    F.TEMPERATURE,
    'Temperature',
    reading({
      category: C.DEVICE_TEMPERATURE_SENSOR,
      type: T.SENSOR.DECIMAL,
      unit: U.CELSIUS,
      min: -60,
      max: 150,
    }),
    (r) => r.temperature,
  ],
  [
    F.LAN_LINK,
    'LAN port connected',
    reading({ category: C.UNKNOWN, type: T.SENSOR.BINARY, min: 0, max: 1 }),
    (r) => (r.lanLink === null ? null : r.lanLink ? 1 : 0),
  ],
  [
    F.LAN_SPEED,
    'LAN port speed',
    reading({
      category: C.DATARATE,
      type: T.DATARATE.RATE,
      unit: U.MEGABITS_PER_SECOND,
      min: 0,
      max: 100_000,
    }),
    (r) => r.lanSpeed,
  ],
  [F.WIRELESS_MODE, 'Wireless mode', textual(), (r) => modeText(r)],
  [F.FIRMWARE, 'Firmware', textual(), (r) => r.firmware],
];

/** The wireless mode in words (English: a text state is not translated by the core). */
export function modeText(r) {
  if (!r.role) return null;
  const role = r.role === 'access_point' ? 'Access point' : 'Station';
  return r.ptmp === null ? role : `${role} ${r.ptmp ? 'PtMP' : 'PtP'}`;
}

/** The features of the created device the blueprint lacks, appended (never fewer). */
export function withCreatedFeatures(device, devices) {
  const created = (devices ?? []).find((d) => d?.external_id === device.external_id);
  if (!created) return device;
  const known = new Set(device.features.map((f) => f.external_id));
  const extra = (created.features ?? []).filter(
    (f) => f && typeof f.external_id === 'string' && !known.has(f.external_id),
  );
  if (extra.length === 0) return device;
  return { ...device, features: [...device.features, ...extra] };
}

/** @param {{ hostname?: string|null, model?: string|null }} [radio] */
export function buildRadioDevice(gladys, radio = {}) {
  const ids = radioIds(gladys);
  return withCreatedFeatures(
    {
      name: radio?.hostname || radio?.model || 'airMAX radio',
      external_id: ids.device,
      model: radio?.model ? `Ubiquiti ${radio.model}` : 'Ubiquiti airMAX',
      should_poll: false,
      features: [
        ...RADIO_FEATURES.map(([key, name, definition]) => ({
          name,
          external_id: ids.feature(key),
          ...definition,
        })),
        {
          name: 'Reboot the radio',
          external_id: ids.feature(F.REBOOT),
          category: C.BUTTON,
          type: T.BUTTON.PUSH,
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: false,
          keep_history: false,
        },
      ],
    },
    gladys.devices,
  );
}

/** The states of a reading for the created device: numbers and texts, never null nor NaN. */
export function statesOf(gladys, radio) {
  const ids = radioIds(gladys);
  const created = (gladys.devices ?? []).find((d) => d?.external_id === ids.device);
  if (!created || !radio) return [];
  const have = new Set((created.features ?? []).map((f) => f?.external_id));
  const states = [];
  for (const [key, , definition, valueOf] of RADIO_FEATURES) {
    const id = ids.feature(key);
    if (!have.has(id)) continue;
    const value = valueOf(radio);
    if (definition.category === C.TEXT) {
      if (typeof value === 'string' && value)
        states.push({ device_feature_external_id: id, text: value });
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      states.push({ device_feature_external_id: id, state: value });
    }
  }
  return states;
}

/**
 * What a feature external id of this integration designates: the feature
 * key of the radio, null for the device itself; undefined when not ours.
 */
export function featureOf(gladys, externalId) {
  if (typeof externalId !== 'string' || externalId.length > 200) return undefined;
  const device = radioIds(gladys).device;
  if (externalId === device) return null;
  if (!externalId.startsWith(`${device}:`)) return undefined;
  const key = externalId.slice(device.length + 1);
  return Object.values(F).includes(key) ? key : undefined;
}

/** The created device of the radio, or null. */
export const createdRadio = (gladys) =>
  (gladys.devices ?? []).find((d) => d?.external_id === radioIds(gladys).device) ?? null;
