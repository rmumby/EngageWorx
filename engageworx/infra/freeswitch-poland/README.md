# EngageWorx Poland — FreeSWITCH SIP Bridge

A self-hosted FreeSWITCH 1.10 + Node bridge that lets a Polish carrier route SIP
calls to EngageWorx via the existing `/api/poland-carrier` Twilio-compatible
webhook — without owning a Twilio Polish DID.

## Architecture

```
Polish carrier (64.79.144.100)
       │ SIP INVITE on UDP/5060
       ▼
   FreeSWITCH on this VPS                     EngageWorx portal
   (sip_profiles/poland-inbound)              (api/poland-carrier)
       │
       │ mod_xml_curl POST → http://127.0.0.1:8080/fs-dialplan
       ▼
   Node bridge (poland-bridge.service)
       │
       │ POST /api/poland-carrier?action=voice-inbound { From, To, CallSid }
       ▼
   Portal returns TwiML
       │
   Bridge translates TwiML → FreeSWITCH dialplan XML:
       <Say>   → AWS Polly MP3 (cached) + playback
       <Gather>→ playback prompts + read DTMF + transfer back to bridge
       <Hangup>→ hangup application
       │
       ▼
   FreeSWITCH executes dialplan, plays Polish voice to caller
```

## VPS sizing

DigitalOcean Frankfurt, **2 vCPU / 2 GB / 60 GB SSD** is plenty for ~30 concurrent
calls. Upgrade only if you exceed 50 simultaneous channels.

OS: **Ubuntu 24.04 LTS x86_64**, no extras.

## One-time prerequisites

1. **SignalWire token** (free) for the FreeSWITCH apt repo:
   - Register at <https://signalwire.com/freeswitch>
   - Personal Access Token → copy the `pat_…` value.

2. **AWS Polly credentials** for Polish neural TTS:
   - IAM user with `AmazonPollyReadOnlyAccess` policy.
   - Save the access key ID + secret. Pick `eu-central-1` (Frankfurt) for lowest latency from the VPS.

3. **VPS firewall** — keep DigitalOcean's cloud firewall closed by default; the
   `install.sh` script enables UFW with these rules:
   - SSH (your IP only — narrow it after install)
   - SIP 5060 (UDP+TCP) **from 64.79.144.100 only**
   - RTP 16384–32768 UDP from anywhere (carrier's RTP source IP varies due to NAT)

## Install

On a fresh VPS as root:

```bash
git clone https://github.com/rmumby/EngageWorx.git
cd EngageWorx/engageworx/infra/freeswitch-poland
chmod +x install.sh
FS_TOKEN=pat_xxxxxxxx sudo -E bash install.sh
```

Then edit `/etc/poland-bridge.env` and add your Polly credentials:

```
AWS_ACCESS_KEY_ID=AKIA…
AWS_SECRET_ACCESS_KEY=…
AWS_REGION=eu-central-1
POLLY_VOICE=Ewa
```

Restart the bridge:

```bash
systemctl restart poland-bridge
```

## Verify

```bash
# FreeSWITCH alive?
systemctl status freeswitch
fs_cli -x 'status'
fs_cli -x 'sofia status'                 # → poland-inbound profile listening on 5060
fs_cli -x 'sofia status profile poland-inbound'

# Bridge alive?
systemctl status poland-bridge
curl http://127.0.0.1:8080/health        # → { ok: true, polly_enabled: true, ... }

# Logs
journalctl -u freeswitch    -f
journalctl -u poland-bridge -f
```

## Carrier configuration

Tell the Polish carrier to route inbound calls for `+48732080851` to:

- **Destination:** this VPS's public IP, port **5060**
- **Transport:** UDP (TCP also accepted)
- **Codec preference:** OPUS, PCMA, PCMU, G722
- **Registration:** none required (peer-to-peer trunk by source IP)

The `acl.conf.xml` ACL pins the profile to source IP `64.79.144.100`. If the
carrier uses additional source IPs, add them to `/etc/freeswitch/autoload_configs/acl.conf.xml`
and reload: `fs_cli -x 'reloadacl'`.

## Test call

1. Have someone dial `+48732080851` from any Polish mobile.
2. Watch `journalctl -u poland-bridge -f`. You should see:
   ```
   [bridge] /fs-dialplan section=dialplan dest=bridge from=+48… callSid=…
   [bridge] portal returned 200, NNN bytes
   ```
3. Watch `journalctl -u freeswitch -f`. You should see the call accepted, the
   Polly MP3 played, then DTMF capture.
4. The call should also appear in **Live Inbox** for the Sharpen CX tenant
   (see `api/poland-carrier.js voice-inbound` which now persists the call).

## Common issues

- **No carrier audio** — check `ufw status` for the RTP range, and confirm
  `ext-rtp-ip auto-nat` is resolving the public IP. If the VPS sits behind
  DigitalOcean's anycast you may need to hard-code the public IP.
- **`tenant_match=NONE` in portal logs** — the `To:` header from the carrier
  doesn't match `poland_carrier_configs.phone_number`. Check the bridge log for
  the raw `To`/`Caller-Destination-Number` value and the normalised result.
- **Polly fallback to flite** — the bridge logs `Polly disabled — AWS creds
  missing` at startup if env vars are absent. Polish text via flite sounds
  awful (English voice reading Polish phonemes); always set Polly creds.
- **mod_xml_curl returns "not found"** — bridge crashed or unreachable. Check
  `systemctl status poland-bridge` and `curl 127.0.0.1:8080/health`.

## Updating the bridge

```bash
cd /root/EngageWorx
git pull
sudo cp engageworx/infra/freeswitch-poland/bridge/server.js /opt/poland-bridge/
( cd /opt/poland-bridge && sudo npm install --omit=dev )
sudo systemctl restart poland-bridge
```

For FreeSWITCH config changes:

```bash
sudo cp engageworx/infra/freeswitch-poland/freeswitch/dialplan/poland.xml /etc/freeswitch/dialplan/
fs_cli -x 'reloadxml'
```

## What's NOT in this build

- **Outbound calls.** This is inbound-only. Outbound voice via the Polish
  carrier requires a gateway config + auth (carrier-specific) — not built.
- **Call recording.** Add `<action application="record_session" data="/var/recordings/${uuid}.wav"/>`
  inside the dialplan if needed.
- **TLS / SRTP.** Carrier IP-trusted, plaintext SIP. Add `sip-tls` profile if you
  need encryption end-to-end.
- **Multi-tenant routing.** All inbound calls go to the Sharpen CX tenant via
  the `+48732080851` match in `poland_carrier_configs`. Adding more tenant
  numbers means more rows in that table — no FreeSWITCH change needed.
