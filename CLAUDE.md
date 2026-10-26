# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for Ubiquiti airMAX radios on
airOS 8: a Node.js service (Node 22+, ESM, no build step) that runs in its own
sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads one radio through the JSON API of its
web interface (ported from python-airos, MIT), and offers one command: a
reboot button, off by default. See `TODO.md` for the status and every
decision.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
node --test --test-name-pattern "reboot"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run cover                             # regenerate cover.png (plain Node)
```

## Architecture

```
index.js                 SDK wiring only (src/handlers.js)
src/handlers.js          every SDK handler, registered before connect()
src/app.js               AirosApp: start, pace, failures, certificate, identity, states, reboot
src/airos/client.js      airOS 8 API: login, status, reboot (port of python-airos)
src/airos/http.js        the only network access (HTTPS, fingerprint checked first, no redirect)
src/airos/parse.js       status -> plain values, identifiers dropped
src/airos/errors.js      error codes
src/devices.js           the radio device (pure), never fewer features
src/config.js            DEFAULTS (mirror the manifest) + normalization
src/store.js             /data: salt, pins, refusal, pause, identity, cooldown, last attempt
src/publisher.js         states within 250 per minute
src/i18n.js              statuses and messages (en / fr)
test/                    node --test, fake Gladys (SDK) + fake radio + loopback TLS
```

## Rules

- **External ids are forever**: `radio:main` and the feature keys of
  `src/constants.js`. The same goes for the manifest keys, the action and
  trigger keys and their variables.
- **The reboot** is a `button`/`push`, never a switch nor a binary, refused
  unless `allow_reboot` is on. Any new command needs Louis's decision, off by
  default, never a switch.
- **The certificate** is checked before any byte is written; a first pin is
  written to /data before the password goes; /data unreadable or not
  writable never learns one; another certificate is lifted only by typing
  a fingerprint (which the radio must then present). An answer arriving
  before the request is written is never accepted. Never turn the check off.
- **Secrets and identifiers**: the password, the session cookie, the CSRF
  id, the MACs, the IP addresses of the stations, the ESSID and the device id
  are never in a log, an error message, a status, a state, a scene event or
  /data in clear (`test/app.test.js` checks it). /data keeps an 8-bit marker
  of a refused password and a salted HMAC of the MAC of the radio (a MAC is
  not a secret; the HMAC can be brute-forced).
- **Clocks**: one read of the monotonic clock per decision (`dueAt(mono)`);
  the tests use a clock that moves at every read, and `test/realclock.test.js`
  runs on the real clock.
- **The container rootfs is read-only.** Write only under `/data`.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  them by hand (0.1.0 was set by hand once). `test/manifest.test.js` checks
  they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`.
- **Manifest.** Texts are `{ "en": ..., "fr": ... }`; a secret field has no
  default and is described as kept by Gladys in its database, never shown
  again, never as protected by any cipher.
- **Units**: only those the core lists for the category.
- **Encoding.** UTF-8 without BOM, no mojibake (`test/encoding.test.js`).
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (loopback only).
