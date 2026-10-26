// -----------------------------------------------------------------------------
// Answers of an airOS 8 radio, shaped after the anonymized fixtures of
// python-airos (MIT, @CoMPaTech: `fixtures/userdata/NanoBeam_5AC_ap-ptmp_v8.7.18.json`,
// `LiteBeam5AC_sta-ptp_30mhz.json`), with fake identifiers. Never checked
// against a real radio (TODO.md). The tests check that none of the
// identifiers below ever leaves the integration.
// -----------------------------------------------------------------------------

export const USERNAME = 'ubnt';
export const PASSWORD = 'fake Radio pass-0123';
export const COOKIE = 'AIROS_SESSIONID=fakeCookieValue0123456789';
export const CSRF = 'fakeCsrf0123456789';
export const MAC_BR0 = '24:5A:4C:AA:BB:01';
export const MAC_ETH0 = '24:5A:4C:AA:BB:02';
export const MAC_ATH0 = '24:5A:4C:AA:BB:03';
export const STATION_MAC = '24:5A:4C:CC:DD:EE';
export const STATION_IP = '192.168.0.125';
export const DEVICE_ID = 'fakeDeviceId0123456789abcdef';
export const ESSID = 'FakeLinkEssid';
/** Every identifier of the fixtures: never in a log, a state, Discovery, an event or /data. */
export const SECRETS = [
  PASSWORD,
  'fakeCookieValue',
  CSRF,
  MAC_BR0,
  MAC_ETH0,
  MAC_ATH0,
  MAC_BR0.toLowerCase(),
  STATION_MAC,
  STATION_IP,
  DEVICE_ID,
  ESSID,
];

const iface = (ifname, hwaddr, status = {}) => ({
  ifname,
  hwaddr,
  enabled: true,
  mtu: 1500,
  status: {
    plugged: false,
    tx_bytes: 0,
    rx_bytes: 0,
    ipaddr: '0.0.0.0',
    speed: 0,
    duplex: false,
    ...status,
  },
});

export function station(overrides = {}) {
  return {
    mac: STATION_MAC,
    lastip: STATION_IP,
    signal: -52,
    rssi: 44,
    noisefloor: -92,
    chainrssi: [43, 41, 0],
    distance: 750,
    uptime: 149806,
    stats: { rx_bytes: 22326812634, tx_bytes: 1757969774 },
    airmax: { cb_capacity: 220740, dl_capacity: 168480, ul_capacity: 273000 },
    remote: {
      hostname: 'Remote NanoStation',
      platform: 'NanoStation M5',
      signal: -64,
      noisefloor: -98,
      ipaddr: [STATION_IP],
      device_id: '00000000000000000000000000000000',
    },
    ...overrides,
  };
}

/** The status of an access point (PtMP) with one station. */
export function status({ host = {}, wireless = {}, interfaces, ...rest } = {}) {
  return {
    chain_names: [
      { number: 1, name: 'Chain 0' },
      { number: 2, name: 'Chain 1' },
    ],
    host: {
      hostname: 'Barn NanoBeam',
      device_id: DEVICE_ID,
      uptime: 154627,
      power_time: 154626,
      time: '2025-08-29 21:22:07',
      timestamp: 4155871132,
      fwversion: 'v8.7.18',
      devmodel: 'NanoBeam 5AC',
      netrole: 'bridge',
      loadavg: 0.12793,
      totalram: 63447040,
      freeram: 15814656,
      temperature: 0,
      cpuload: 28.712872,
      height: null,
      ...host,
    },
    genuine: '/images/genuine.png',
    services: { dhcpc: false, dhcpd: false, pppoe: false, airview: 2 },
    portfw: false,
    wireless: {
      essid: ESSID,
      mode: 'ap-ptmp',
      ieeemode: '11ACVHT40',
      band: 2,
      apmac: MAC_ATH0,
      antenna_gain: 19,
      frequency: 5180,
      center1_freq: 5190,
      distance: 750,
      security: 'WPA2',
      noisef: -92,
      txpower: -4,
      chanbw: 40,
      throughput: { tx: 76, rx: 1076 },
      polling: { cb_capacity: 174150, dl_capacity: 124740, ul_capacity: 223560, use: 37 },
      count: 1,
      sta: [station()],
      sta_disconnected: [],
      ...wireless,
    },
    interfaces: interfaces ?? [
      iface('eth0', MAC_ETH0, { plugged: true, speed: 1000, duplex: true }),
      iface('eth1', '24:5A:4C:AA:BB:04'),
      iface('ath0', MAC_ATH0),
      iface('br0', MAC_BR0, { plugged: true, ipaddr: '192.168.0.116' }),
    ],
    ntpclient: { last_sync: '2025-08-29 21:17:09' },
    unms: { status: 0 },
    ...rest,
  };
}

/** A station (PtP) linked to its access point. */
export function stationStatus() {
  return status({
    host: { hostname: 'House LiteBeam', devmodel: 'LiteBeam 5AC', temperature: 41 },
    wireless: { mode: 'sta-ptp', count: 1, sta: [station({ signal: -58 })] },
  });
}
