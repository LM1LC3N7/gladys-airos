# TODO — Ubiquiti airOS v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `gi ci` (Prettier, ESLint, tests on Node 24 and 22,
  Docker build, store validator), `npm audit --omit=dev`, then update README,
  `docs/en.md`, `docs/fr.md`, `CHANGELOG.md` and this file.
- The `gladys-assistant-integration` topic is added at the first real release
  only. No forum topic of its own: the claim is in /t/10385 (lot 16).

## Status

- [x] **Milestone 1 — core** (2026-10-26): airOS 8 client ported from
      python-airos (`POST /api/auth`, `GET /status.cgi`, `POST /reboot.cgi`),
      HTTPS only on node:https with the certificate checked by its SHA-256
      fingerprint before any byte is written (pinned in /data at the first
      contact, written before the password is sent; or typed by the user);
      one device per radio (19 readings), the reboot button behind an option;
      triggers link lost / back; pace on a monotonic clock, the last attempt
      kept in /data; refused login, changed certificate, pause 429/5xx kept
      in /data; identity by a salted hash of the MAC. Tested with unit tests
      against the SDK's fake Gladys, a fake radio in memory, a real TLS
      server on loopback, a real-clock test (×20). **Never tested with a
      real radio.**
- [ ] **Milestone 2 — real radio** (a tester with an airOS 8 radio): record
      real answers as fixtures (identifiers anonymized), fix what differs.
      To check first:
  - whether `/api/auth` accepts a JSON body (python-airos sends JSON; the web
    interface may send a form) and always answers `X-CSRF-ID`;
  - how long a session lives, and what `/status.cgi` answers once it expired
    (401, 403 or a 302 to the login page: all three open a new session once);
  - the unit of `wireless.throughput` and `wireless.polling.*_capacity`
    (kbit/s assumed, like Home Assistant), and of `polling.use` (not
    published: percent or per mille?);
  - whether `host.temperature` is 0 on every radio without a sensor (0 is
    taken as "no sensor", never published);
  - whether `/reboot.cgi` answers `{"ok": true}` before rebooting, and how
    long the radio takes to answer again (5 min assumed for the "rebooting"
    status);
  - the TLS versions and ciphers of older airOS 8 firmware (Node 22 refuses
    below TLS 1.2: the status says "TLS refused");
  - whether `wireless.distance` is 0 on a short or unmeasured link (the
    loco5ac fixtures give 0 there and 1 m in `sta[]`): then take
    `sta[0].distance`, or publish nothing at 0;
  - whether airOS 8 answers 401/403 on `/api/auth` while it boots or after
    several failures (a lockout): that would change the meaning of the
    refusal kept in /data.
- [ ] **Later** (ask on the forum first): one device per station of an access
      point (PtMP), the station kick, the firmware update check (a text),
      airOS 6 (`/login.cgi`, cookie session), discovery by the UDP broadcast
      of airOS (port 10001) as python-airos does.

## Decisions

- **Version 0.1.0 set by hand** (package.json, package-lock.json, manifest,
  `docker_image` tag) before the first release; the first release patch gives
  0.1.1. Versions belong to the Release workflow from then on.
- **SDK `^0.16.0`** (2026-10-27, migration wave 2): 0.16.0 is on npm since
  2026-10-25 (a stale npm cache said otherwise); it adds the ai, tts and music
  types; no effect here (`should_poll` explicit, `poll_frequency` unused).
  `keywords`, `countries` and `gladys_version >= 5.3.0` wait until Gladys 5.3
  is widespread.
- **Read only by default.** The reboot is the only command: a `button`/`push`
  feature, never a switch, refused unless `allow_reboot` is on (default off),
  checked again in `beforeSend`, right before the request is written. The
  station kick, the provisioning mode and the firmware update of python-airos
  are not ported.
- **The reboot is not "protective"** (it cuts the link for 1 to 2 min): it
  waits for the reading in flight (within its 2.5 s budget), needs a fresh
  read of the same radio, and is refused during a pause or a final failure.
  Its cooldown (10 min) is written to /data before the first byte, and undone
  when the request was not written or the radio answered "no". Success is the
  radio's `{"ok": true}`; the reboot is then confirmed (log) by the uptime of
  a later reading, never by the answer alone.
- **HTTPS only**: airOS 8 serves its interface in HTTPS; plain HTTP would send
  the password in clear. An address `http://…` is refused with a status.
- **Certificate** (lessons 12, 16 and 25): with no fingerprint typed, the
  certificate met at the first contact is written to /data **before** the
  password is sent; /data unreadable (anything but ENOENT) or not writable:
  nothing is learned nor sent, the status asks to type the fingerprint met.
  Another certificate later: nothing sent, `certChanged` kept in /data, the
  status shows the fingerprint met; saving the form lifts nothing; typing
  a fingerprint lifts it (review r1, I2): any valid fingerprint typed is the
  authority, the radio must present it (else `certificate_typed` shows the
  one met, nothing sent). A typed fingerprint, once verified, is kept in
  /data: emptying the field never learns blindly. No two-click button (the
  typed fingerprint is the one path). An answer the radio sends before the
  request is written is refused, the verdict of the certificate check
  deciding the error (review r1, I1).
- **Reboot cooldown in /data or no reboot** (review r1, I3): the 10 min delay
  is written to /data before the first byte; /data unreadable or not
  writable, the press is refused, nothing sent.
- **Identity**: an HMAC (salt of /data) of the MAC of `br0`, `eth0` or `ath0`
  (python-airos's order), per address; another MAC at the address publishes
  nothing and refuses the reboot until the form is saved. A MAC that cannot
  be read is "unknown" (the values are published, the reboot refused), never
  "another radio". The external id is fixed (`radio:main`): a replaced radio
  keeps its device.
- **Refused login**: 8 bits of an HMAC of the refused password (a marker
  shared by 1 password in 256; review r1, I4, with a brute-force test), per
  address and user, in /data; never a hash of the accepted one. A new
  password sharing the marker is taken as refused until the test button
  tries it. The loop and a
  restart never send it again; the test button tries once; a success clears
  it. A status refused (401/403) right after a fresh login is "access
  refused", retried like any failure, never a refusal of the credentials.
- **Pace**: one timer; `dueAt(mono)` on the caller's instant; the time of the
  last attempt written to /data before the request (at most once a minute from a 1 min
  interval up, before every reading at 30 s);
  failures retried from max(1 min, interval) doubling to 30 min; 429/5xx a
  pause of 1 min (or the interval) to 6 h, Retry-After honoured, kept in /data.
- **Units** (core list only): kbit/s for rates and capacities, Mbit/s for the
  LAN speed, m for the distance, hours for the uptime, °C; the dBm, MHz and %
  values have no unit in the core for their category: the unit is in the
  feature name (category `unknown`).
- **Signals of an access point**: the weakest station (the link most likely
  to fail), documented.
- **User-Agent**: `gladys-airos (+https://github.com/LM1LC3N7/gladys-airos)`,
  never a browser's (python-airos sends aiohttp's own).
- **Not done**: `keywords` and `countries` in the manifest (they need
  `gladys_version >= 5.3.0`). Planned: keywords `ubiquiti`, `airmax`,
  `airos`, `nanobeam`, `nanostation`, `litebeam`, `wisp`, `ptp`; countries:
  worldwide (none).
