# Ubiquiti airOS

Ubiquiti **airMAX** radios (NanoBeam, NanoStation, LiteBeam, PowerBeam,
Rocket, LiteAP… on **airOS 8**) in Gladys, through the JSON API of the local
web interface of the radio. Handy to watch a wireless link to a barn, a
garden office or a neighbour:

- the radio becomes a Gladys device (Discovery tab): **wireless link up**
  (yes / no), **connected stations**, **signal** and **remote signal** (dBm),
  **noise floor**, **transmit** and **receive rates**, **downlink** and
  **uplink capacity**, **link distance**, **frequency**, **channel width**,
  **CPU load**, **memory used**, **uptime**, **temperature** (when the radio
  has a sensor), **LAN port** connected and its speed, **wireless mode**,
  **firmware**;
- a **Reboot the radio** button, inactive until you allow it;
- two scene triggers: **Wireless link lost** and **Wireless link back**.

On an access point with several stations (PtMP), the signals are those of
the weakest station. With no station connected, the signals (and on some
radios the capacities) are not read: Gladys keeps their last value, with its
date. Prefer reading the radio on the Gladys side of the link: when the
radio read is the one that becomes unreachable, "link lost" cannot fire (the
radio itself is then shown unreachable).

> **This integration has never been tested with a real radio.** This first
> version was ported from python-airos, the library Home Assistant uses, and
> tested against a fake radio only. Tell on the Gladys forum what works and
> what does not, with the model and the airOS version.

Unofficial integration, not affiliated with Ubiquiti.

## Before you start

1. The radio must run **airOS 8** (shown in its web interface). airOS 6 and
   older are not supported.
2. Gladys needs an account of the web interface (`ubnt` by default). Its
   password is kept by Gladys in its database, never shown again, and sent
   only to the radio.
3. Add one integration per radio (both ends of a link if you want both).

## Settings

- **Address of the radio**: its IP address or host name, with `:port` if
  its interface is not on 443. Plain HTTP is refused (airOS 8 serves HTTPS).
- **User name**, **Password**.
- **Certificate fingerprint** (optional): see below.
- **Refresh**: 30 s, 1 min (default), 2 or 5 min. The test button, a save of
  the form and a restart of Gladys or of the container do not read sooner
  (the time of the last attempt is kept, written before each reading, at most
  once a minute: a container killed without a clean stop may read up to 30 s
  sooner at the 30 s refresh). A press on **Reboot the radio** makes one
  fresh read of its own (a login if needed), outside the refresh.
- **Allow rebooting the radio**: off by default.

## The HTTPS certificate

The radio has a self-signed certificate, which no authority can vouch for.
Gladys checks it by its SHA-256 fingerprint, right after the TLS handshake
and **before** sending the password:

- the field empty, at the first connection: Gladys writes the certificate
  met to its storage, **then** sends the password. If its storage cannot be
  read or written, nothing is learned and nothing is sent: type the
  fingerprint (the status shows the one met);
- afterwards, another certificate stops everything (nothing is sent) and
  the status shows its fingerprint. Saving the form again changes nothing.
  If you replaced or reset the radio, type in **Certificate fingerprint**
  the fingerprint your browser shows for the radio (padlock, certificate,
  SHA-256): it becomes the trusted one. If the radio then presents another
  one, nothing is sent and the status shows the one it presents. Emptying
  the field later does not learn a certificate again.

## The reboot

The **Reboot the radio** button is a button, never a switch: a "turn
everything off" of a voice assistant or a scene never reaches it. A press is
refused, nothing sent, in these cases:

- **Allow rebooting the radio** is off (checked again right before the
  request is written);
- the radio is not connected, Gladys is in a pause asked by the radio
  (HTTP 429 or 5xx), the login or the certificate was refused;
- a reboot was sent less than 10 minutes ago (kept across restarts), or
  this delay cannot be written to the storage of the integration (/data);
- a reboot is already being sent;
- after a restart of the integration, until its first reading (one refresh
  interval at most), or the configuration was saved during the press;
- the radio does not answer the read made just before within 2.5 s, or
  another radio answers (another MAC), or its MAC cannot be read or was not
  read yet;
- the request could not be written within 3.5 s of the press.

When the request was written but the radio did not answer, Gladys says "sent,
without an answer": the radio may be rebooting. The link drops for 1 to 2
minutes; the status then says the radio is rebooting.

## Failures

- **Credentials refused**: nothing is sent again until the user name or the
  password changes; the **Test the connection** button tries once more. Gladys
  keeps an 8-bit marker of the refused password (shared by 1 password in
  256, never the password): a new password sharing it is taken as refused
  until the test button tries it.
- **HTTP 429 or 5xx**: a pause of every request (1 min to 6 h), kept across
  restarts.
- **No answer**: tried again after 1 minute or the refresh interval if
  longer, then twice as long each time, up to 30 minutes.
- **Another radio** at the address (another MAC): nothing is published; save
  the form to take it as the new one.

Neither the password, nor the session, nor the MAC addresses or IP addresses
of the stations are logged or published. The storage keeps the certificate
fingerprint, the 8-bit marker above, and a salted hash of the MAC of the radio
(not the MAC in clear; a MAC is not a secret, the radio broadcasts it).

## Not done (yet)

One device per station of an access point, the station kick, the firmware
update, airOS 6, the AirCube and the UniFi devices: say on the forum if you
need one.
