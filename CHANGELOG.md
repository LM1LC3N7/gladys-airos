# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First version: Ubiquiti airMAX radios on airOS 8 through the JSON API of
  their local web interface (`/api/auth`, `/status.cgi`, `/reboot.cgi`),
  ported from python-airos. HTTPS only, the self-signed certificate pinned in
  /data before the password is first sent, or typed by the user; another
  certificate stops everything until its fingerprint is typed.
- One device per radio: wireless link, stations, signal, remote signal,
  noise floor, rates, capacities, distance, frequency, channel width, CPU,
  memory, uptime, temperature, LAN port, mode, firmware.
- A Reboot button, off by default, never a switch: fresh read of the same
  radio, the option checked again right before sending, 10 min cooldown.
- Scene triggers: wireless link lost, wireless link back.
- HTTPS: an answer sent before the request is refused; a typed
  fingerprint lifts a kept "certificate changed"; the reboot is refused
  when its cooldown cannot be written to /data; the refused-password marker
  is 8 bits.
