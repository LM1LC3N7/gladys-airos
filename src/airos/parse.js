// -----------------------------------------------------------------------------
// The status of an airOS 8 radio (GET /status.cgi) as a plain object of the
// values Gladys shows. Ported from python-airos (MIT, @CoMPaTech): the field
// names (`host`, `wireless`, `wireless.sta[]`, `wireless.polling`,
// `interfaces[]`), the derived role and mode from `wireless.mode`, and the MAC
// that identifies the radio (`br0`, then `eth0`, then `ath0`, enabled
// interfaces with an address). See THIRD_PARTY_NOTICES.md.
//
// Every value is checked for its type and range: a missing or odd one is
// null (unknown), never 0 nor a guess. The MAC is returned only as `mac`, for
// the identity check of the app (which keeps a salted hash of it, never the
// MAC itself); the stations' MAC and IP addresses, the device id, the ESSID
// and the GPS position are never read.
// -----------------------------------------------------------------------------

import { LIMITS } from '../constants.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, key) => (isObject(o) && Object.hasOwn(o, key) ? o[key] : undefined);

/** A finite number within [min, max], else null. Never a string, a boolean, '' (= 0) or NaN. */
export function num(value, min = -Infinity, max = Infinity) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

/** A printable text, trimmed and cut; null when empty or not a string. */
export function text(value, max = LIMITS.TEXT_LENGTH) {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\x00-\x1f\x7f]/g, '').trim();
  return clean ? clean.slice(0, max) : null;
}

const bool = (value) => (value === true ? true : value === false ? false : null);

const MAC = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
/** A real MAC (not the `xx...` of an anonymized dump, not all zeros), uppercase with colons. */
export function macOf(value) {
  if (typeof value !== 'string' || !MAC.test(value)) return null;
  const mac = value.toUpperCase().replace(/-/g, ':');
  return mac === '00:00:00:00:00:00' ? null : mac;
}

/** The MAC of the radio: `br0`, `eth0`, `ath0` (enabled, with an address), in that order. */
export function identityOf(interfaces) {
  if (!Array.isArray(interfaces)) return null;
  const by = new Map();
  for (const item of interfaces.slice(0, 32)) {
    const name = own(item, 'ifname');
    const mac = macOf(own(item, 'hwaddr'));
    if (own(item, 'enabled') === true && typeof name === 'string' && mac && !by.has(name)) {
      by.set(name, mac);
    }
  }
  for (const name of ['br0', 'eth0', 'ath0']) {
    if (by.has(name)) return by.get(name);
  }
  return null;
}

/**
 * `wireless.mode` -> { role: 'access_point' | 'station' | null, ptmp: boolean | null }.
 * airOS 8: `ap-ptmp`, `sta-ptmp`, `ap-ptp`, `sta-ptp`.
 */
export function modeOf(mode) {
  switch (mode) {
    case 'ap-ptmp':
      return { role: 'access_point', ptmp: true };
    case 'sta-ptmp':
      return { role: 'station', ptmp: true };
    case 'ap-ptp':
      return { role: 'access_point', ptmp: false };
    case 'sta-ptp':
      return { role: 'station', ptmp: false };
    default:
      return { role: null, ptmp: null };
  }
}

/** The weakest of a list of signals (dBm), null when none is known. */
const weakest = (values) => {
  const known = values.filter((v) => v !== null);
  return known.length > 0 ? Math.min(...known) : null;
};

/**
 * The status answer -> the values of the radio. Throws a TypeError when the
 * answer is not an airOS 8 status (no `host` nor `wireless` object): the
 * caller turns it into a "bad answer".
 */
export function parseStatus(raw) {
  const host = own(raw, 'host');
  const wireless = own(raw, 'wireless');
  if (!isObject(host) || !isObject(wireless)) throw new TypeError('Not an airOS status');
  const firmware = text(own(host, 'fwversion'));
  const major = firmware ? Number(/^v?(\d+)\./.exec(firmware)?.[1] ?? NaN) : NaN;
  const { role, ptmp } = modeOf(own(wireless, 'mode'));
  const stations = Array.isArray(own(wireless, 'sta'))
    ? own(wireless, 'sta').slice(0, LIMITS.STATIONS).filter(isObject)
    : [];
  const signals = stations.map((s) => num(own(s, 'signal'), -150, 0));
  const remoteSignals = stations.map((s) => num(own(own(s, 'remote'), 'signal'), -150, 0));
  const count = num(own(wireless, 'count'), 0, 100_000);
  const throughput = own(wireless, 'throughput');
  const polling = own(wireless, 'polling');
  const totalram = num(own(host, 'totalram'), 1);
  const freeram = num(own(host, 'freeram'), 0);
  const temperature = num(own(host, 'temperature'), -60, 150);
  const interfaces = Array.isArray(own(raw, 'interfaces')) ? own(raw, 'interfaces') : [];
  const eth0 = interfaces.slice(0, 32).find((i) => own(i, 'ifname') === 'eth0');
  const ethStatus = own(eth0, 'status');
  const plugged = bool(own(ethStatus, 'plugged'));
  const frequency = num(own(wireless, 'frequency'), 1, 100_000);
  return {
    mac: identityOf(interfaces),
    hostname: text(own(host, 'hostname')),
    model: text(own(host, 'devmodel')),
    firmware,
    firmwareMajor: Number.isInteger(major) ? major : null,
    role,
    ptmp,
    // The number of stations associated: `count`, else the list read.
    stations: count ?? (Array.isArray(own(wireless, 'sta')) ? stations.length : null),
    // Station: the signal of its access point; access point: its weakest station.
    signal: weakest(signals),
    remoteSignal: weakest(remoteSignals),
    noiseFloor: num(own(wireless, 'noisef'), -150, 0),
    // airOS gives the throughput and the capacities in kbit/s.
    txRate: num(own(throughput, 'tx'), 0, 100_000_000),
    rxRate: num(own(throughput, 'rx'), 0, 100_000_000),
    downlinkCapacity: num(own(polling, 'dl_capacity'), 0, 100_000_000),
    uplinkCapacity: num(own(polling, 'ul_capacity'), 0, 100_000_000),
    distance: num(own(wireless, 'distance'), 0, 1_000_000),
    frequency,
    channelWidth: num(own(wireless, 'chanbw'), 1, 1000),
    cpuLoad: num(own(host, 'cpuload'), 0, 100),
    memoryUsed:
      totalram !== null && freeram !== null && freeram <= totalram
        ? Math.round(((totalram - freeram) / totalram) * 1000) / 10
        : null,
    uptime: num(own(host, 'uptime'), 0, 100 * 365 * 86_400),
    // airOS answers 0 on radios without a sensor: "not available", never a measure.
    temperature: temperature === 0 ? null : temperature,
    lanLink: plugged,
    lanSpeed: plugged === true ? num(own(ethStatus, 'speed'), 1, 100_000) : null,
  };
}
