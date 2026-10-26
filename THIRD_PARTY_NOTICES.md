# Third-party notices

Nothing but the Gladys SDK is installed at runtime. One library's logic is
ported to JavaScript; its notice follows.

## python-airos

- Project: <https://github.com/CoMPaTech/python-airos>, published on PyPI as
  `airos` (used by the `airos` integration of Home Assistant).
- Copyright (c) 2020 by @CoMPaTech.
- Version read: 0.6.13 line, commit `f1dd9e1` (2026-10-26).
- License: MIT License (text below, as in its `LICENSE` file).

What is ported (rewritten in JavaScript, not copied): the airOS 8 web API
calls (`POST /api/auth` with a JSON user name and password giving an
`AIROS_*` session cookie and an `X-CSRF-ID` header, `GET /status.cgi`,
`POST /reboot.cgi` with `reboot=yes`), the field names of the status
(`host`, `wireless`, `wireless.sta`, `wireless.polling`, `interfaces`), the
role and mode derived from `wireless.mode`, and the choice of the MAC that
identifies the radio (`br0`, `eth0`, `ath0`). The test fixtures are shaped
after its anonymized fixtures, with fake identifiers. Its airOS 6 login,
discovery, firmware update, station kick and provisioning mode are not
ported.

```
MIT License

Copyright (c) 2020 by @CoMPaTech

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
