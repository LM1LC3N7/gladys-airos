# gladys-airos

A [Gladys Assistant](https://gladysassistant.com) external integration for
Ubiquiti **airMAX** radios on **airOS 8** (NanoBeam, NanoStation, LiteBeam,
PowerBeam, Rocket, LiteAP…), through the JSON API of the local web interface
of the radio, in HTTPS with a pinned certificate.

- One device per radio: wireless link up, connected stations, signal and
  remote signal, noise floor, transmit and receive rates, downlink and uplink
  capacity, link distance, frequency, channel width, CPU load, memory used,
  uptime, temperature, LAN port, wireless mode, firmware.
- A **Reboot the radio** button, off by default (an option), never a switch.
- Scene triggers: wireless link lost, wireless link back.

**Never tested with a real radio**: ported from
[python-airos](https://github.com/CoMPaTech/python-airos) (MIT, the library
of the Home Assistant `airos` integration), tested against a fake radio.

Unofficial integration, not affiliated with Ubiquiti.

- User documentation: [English](docs/en.md), [français](docs/fr.md).
- Status, decisions and next steps: [TODO.md](TODO.md).
- Rules for contributors: [CLAUDE.md](CLAUDE.md).
- Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
```

License: Apache-2.0 ([LICENSE](LICENSE)).
