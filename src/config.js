// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized.
// No key starts with `gladys_` (the core keeps GLADYS_* for itself).
// -----------------------------------------------------------------------------

import { DEFAULT_PORT, POLL_INTERVALS } from './constants.js';

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULTS = Object.freeze({
  username: 'ubnt',
  poll_interval: '60',
  allow_reboot: false,
});

const text = (value) => (typeof value === 'string' ? value.trim() : '');

const IPV4 = /^(\d{1,3})(\.\d{1,3}){3}$/;
const HOSTNAME =
  /^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/;
const IPV6 = /^[0-9A-Fa-f:.]{2,45}$/;
/** An airOS user name: printable ASCII, no space. */
const USERNAME = /^[\x21-\x7e]{1,64}$/;
/** A control character (a newline pasted with the password). */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x1f\x7f]/;

/** The port: an integer 1-65535, or null. */
export function parsePort(value) {
  if (!/^\d{1,5}$/.test(value ?? '')) return null;
  const n = Number(value);
  return n > 0 && n < 65536 ? n : null;
}

/**
 * The radio: an IPv4 address, a host name or an IPv6 address (brackets
 * allowed), with an optional port. An address pasted from a browser
 * (`https://192.168.1.20`, `https://192.168.1.20/index.cgi`) is read as its
 * host and port. Plain HTTP, credentials, a query are refused.
 *   -> { host, port } or { error: 'missing' | 'invalid' | 'http' }
 */
export function parseHost(value) {
  let raw = text(value);
  if (!raw) return { error: 'missing' };
  if (raw.length > 300) return { error: 'invalid' };
  let port = null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return { error: 'invalid' };
    }
    if (url.protocol === 'http:') return { error: 'http' };
    if (url.protocol !== 'https:') return { error: 'invalid' };
    if (url.username || url.password || url.search || url.hash) return { error: 'invalid' };
    port = url.port ? Number(url.port) : null;
    raw = url.hostname;
  } else {
    const match = /^([^:[\]/]+):(\d{1,5})$/.exec(raw) ?? /^\[([^\]]+)\]:(\d{1,5})$/.exec(raw);
    if (match) {
      raw = match[1];
      port = parsePort(match[2]);
      if (port === null) return { error: 'invalid' };
    }
  }
  const host = raw.replace(/^\[(.*)\]$/, '$1');
  if (IPV4.test(host)) {
    if (!host.split('.').every((n) => Number(n) <= 255)) return { error: 'invalid' };
    return { host, port };
  }
  if (host.includes(':')) {
    return IPV6.test(host) ? { host: host.toLowerCase(), port } : { error: 'invalid' };
  }
  return HOSTNAME.test(host)
    ? { host: host.toLowerCase().replace(/\.$/, ''), port }
    : { error: 'invalid' };
}

/**
 * A SHA-256 fingerprint as typed (colons, spaces or nothing between the
 * bytes, any case) -> `AA:BB:...` (Node's `fingerprint256`), '' when empty,
 * null when it is not 32 bytes of hex.
 */
export function parseFingerprint(value) {
  const raw = text(value).replace(/^sha-?256\s*[:=]?\s*/i, '');
  if (!raw) return '';
  const hex = raw.replace(/[\s:-]/g, '');
  if (!/^[0-9A-Fa-f]{64}$/.test(hex)) return null;
  return hex.toUpperCase().match(/../g).join(':');
}

/** A boolean of the configuration: true only for true (or "true"). */
const flag = (value) => value === true || value === 'true';

export function normalizeConfig(raw = {}) {
  raw = raw ?? {};
  const target = parseHost(raw.host);
  const username = text(raw.username) || DEFAULTS.username;
  // The password is kept as typed (a space may belong to it), never trimmed.
  const password = typeof raw.password === 'string' ? raw.password : '';
  const fingerprint = parseFingerprint(raw.certificate_fingerprint);
  const poll = POLL_INTERVALS.includes(String(raw.poll_interval))
    ? String(raw.poll_interval)
    : DEFAULTS.poll_interval;
  return {
    host: target.error ? null : target.host,
    hostError: target.error ?? null,
    port: target.port ?? DEFAULT_PORT,
    username,
    usernameInvalid: !USERNAME.test(username),
    password,
    // A newline or a control character pasted with it: said, never sent.
    passwordInvalid: password !== '' && (CONTROL.test(password) || password.length > 256),
    /** The fingerprint typed: '' none, null invalid. */
    fingerprint,
    pollMs: Number(poll) * 1000,
    allowReboot: flag(raw.allow_reboot),
  };
}

/** `host:port`: the key of the pin, the refusal, the pause and the identity in /data. */
export const targetKey = (config) => `${config.host}:${config.port}`;
