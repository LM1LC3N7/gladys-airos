// -----------------------------------------------------------------------------
// Keys, limits and timings. The manifest keys, the trigger keys and the
// external id shapes are stored in user scenes and devices: never rename them
// (test/manifest.test.js ties them to the manifest).
// -----------------------------------------------------------------------------

export const ACTIONS = Object.freeze({
  TEST: 'test_connection',
});

export const SCENE_TRIGGERS = Object.freeze({
  LINK_LOST: 'link_lost',
  LINK_RESTORED: 'link_restored',
});

/**
 * Device external id: `ext:<selector>:radio:main`, one radio per
 * installation (the address of the configuration). Fixed: it never depends
 * on the MAC, the name or the model, so that a radio replaced at the same
 * address keeps its device (and its history).
 */
export const RADIO_TYPE = 'radio';
export const RADIO_ID = 'main';

export const FEATURES = Object.freeze({
  LINK: 'link',
  STATIONS: 'stations',
  SIGNAL: 'signal',
  REMOTE_SIGNAL: 'remote_signal',
  NOISE_FLOOR: 'noise_floor',
  TX_RATE: 'tx_rate',
  RX_RATE: 'rx_rate',
  DOWNLINK_CAPACITY: 'downlink_capacity',
  UPLINK_CAPACITY: 'uplink_capacity',
  DISTANCE: 'distance',
  FREQUENCY: 'frequency',
  CHANNEL_WIDTH: 'channel_width',
  CPU_LOAD: 'cpu_load',
  MEMORY_USED: 'memory_used',
  UPTIME: 'uptime',
  TEMPERATURE: 'temperature',
  LAN_LINK: 'lan_link',
  LAN_SPEED: 'lan_speed',
  WIRELESS_MODE: 'wireless_mode',
  FIRMWARE: 'firmware',
  REBOOT: 'reboot',
});

/** Seconds between two readings. */
export const POLL_INTERVALS = Object.freeze(['30', '60', '120', '300']);

export const DEFAULT_PORT = 443;

export const LIMITS = Object.freeze({
  /** POST /state admits 300 states per minute per integration: we keep under 250. */
  STATES_PER_MINUTE: 250,
  /** A text published to Gladys (model, firmware) is cut to this length. */
  TEXT_LENGTH: 64,
  /** Stations read from one answer (a PtMP access point): the rest is ignored. */
  STATIONS: 256,
  /** Size cap of the status answer (a PtMP access point with many stations). */
  STATUS_BYTES: 4 * 1024 * 1024,
  /** Size cap of the other answers (login, reboot). */
  SMALL_BYTES: 256 * 1024,
  /** Size cap of the /data file read back. */
  STORE_BYTES: 16 * 1024,
});

export const TIMEOUTS = Object.freeze({
  /** One request to the radio (TLS handshake included). */
  REQUEST_MS: 10_000,
});

export const INTERVALS = Object.freeze({
  /** A failure (network, unexpected answer) is retried after max(this, the poll interval), doubling. */
  RETRY_MIN_MS: 60_000,
  RETRY_MAX_MS: 30 * 60_000,
  /** HTTP 429 / 5xx: pause of every request, within these bounds (Retry-After if given). */
  PAUSE_MIN_MS: 60_000,
  PAUSE_MAX_MS: 6 * 3600_000,
  /** The time of the last attempt is written to /data at most this often. */
  ATTEMPT_SAVE_MS: 60_000,
  /** Configuration not given by Gladys: asked again from this delay, doubling up to the max. */
  CONFIG_RETRY_MIN_MS: 30_000,
  CONFIG_RETRY_MAX_MS: 10 * 60_000,
  /** Unchanged values are sent again this often (the core shows them as fresh). */
  HEARTBEAT_MS: 30 * 60_000,
  /** A stop waits this long at most for the reading in flight. */
  STOP_WAIT_MS: 3_000,
});

/** The reboot command: deadlines counted from its arrival (Gladys acks within 5 s). */
export const COMMAND = Object.freeze({
  /** The fresh reading of the radio must end by then. */
  READ_BY_MS: 2_500,
  /** The reboot request is refused unsent after this. */
  SEND_BY_MS: 3_500,
  /** The answer of the radio is awaited until this. */
  ANSWER_BY_MS: 4_500,
  /** No second reboot before this delay (a scene in a loop): kept in /data. */
  COOLDOWN_MS: 10 * 60_000,
  /** After a reboot accepted, a failing reading says "rebooting" this long. */
  REBOOTING_MS: 5 * 60_000,
});

/** The only value a `button`/`push` feature sends (BUTTON_PUSH.PRESSED of the core). */
export const PRESSED = 1;

/** The persistent store (see src/store.js). */
export const STORE_FILE = '/data/airos-state.json';

/** The User-Agent of every request: the integration says who it is, never a browser. */
export const USER_AGENT = 'gladys-airos (+https://github.com/LM1LC3N7/gladys-airos)';
