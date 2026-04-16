#!/usr/bin/env bash
# install.sh — FreeSWITCH 1.10 + Node bridge for EngageWorx Poland voice inbound.
# Target: Ubuntu 24.04 LTS on DigitalOcean Frankfurt (or any clean Ubuntu 24.04 box).
#
# Run as root or via sudo:
#   curl -sS https://raw.githubusercontent.com/rmumby/EngageWorx/main/engageworx/infra/freeswitch-poland/install.sh | sudo bash
# OR after cloning:
#   sudo bash install.sh
#
# Idempotent — safe to re-run.

set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

echo "==> 1/8  Updating apt + installing prereqs"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  curl wget gnupg2 lsb-release ca-certificates apt-transport-https \
  build-essential ufw jq sox flite festvox-en1

echo "==> 2/8  Adding FreeSWITCH 1.10 official apt repo (SignalWire token required for paid releases)"
# SignalWire moved FreeSWITCH packages behind a free token. Set FS_TOKEN env var with your token
# from https://signalwire.com/freeswitch (sign in → Personal Access Token).
if [ -z "${FS_TOKEN:-}" ]; then
  echo "FATAL: FS_TOKEN env var not set." >&2
  echo "Sign up at https://signalwire.com/freeswitch (free), grab your token, then re-run as:" >&2
  echo "  FS_TOKEN=pat_xxx sudo -E bash install.sh" >&2
  exit 1
fi
echo "machine freeswitch.signalwire.com login signalwire password ${FS_TOKEN}" > /etc/apt/auth.conf.d/freeswitch.conf
chmod 600 /etc/apt/auth.conf.d/freeswitch.conf
wget --http-user=signalwire --http-password="${FS_TOKEN}" -O /usr/share/keyrings/signalwire-freeswitch-repo.gpg https://freeswitch.signalwire.com/repo/deb/debian-release/signalwire-freeswitch-repo.gpg
echo "deb [signed-by=/usr/share/keyrings/signalwire-freeswitch-repo.gpg] https://freeswitch.signalwire.com/repo/deb/debian-release/ $(lsb_release -sc) main" > /etc/apt/sources.list.d/freeswitch.list

echo "==> 3/8  Installing FreeSWITCH"
apt-get update -y
apt-get install -y --no-install-recommends \
  freeswitch-meta-vanilla freeswitch-mod-xml-curl freeswitch-mod-dptools \
  freeswitch-mod-sndfile freeswitch-mod-shout freeswitch-mod-flite \
  freeswitch-mod-commands freeswitch-mod-loopback freeswitch-mod-sofia \
  freeswitch-mod-event-socket freeswitch-mod-tone-stream

echo "==> 4/8  Installing Node 20.x for the bridge"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> 5/8  Deploying FreeSWITCH config"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -d -m 755 /etc/freeswitch/sip_profiles
install -d -m 755 /etc/freeswitch/dialplan
install -d -m 755 /etc/freeswitch/autoload_configs

cp -v "${SCRIPT_DIR}/freeswitch/sip_profiles/poland-inbound.xml"      /etc/freeswitch/sip_profiles/
cp -v "${SCRIPT_DIR}/freeswitch/dialplan/poland.xml"                 /etc/freeswitch/dialplan/
cp -v "${SCRIPT_DIR}/freeswitch/autoload_configs/xml_curl.conf.xml"  /etc/freeswitch/autoload_configs/
cp -v "${SCRIPT_DIR}/freeswitch/autoload_configs/acl.conf.xml"       /etc/freeswitch/autoload_configs/

echo "==> 6/8  Installing the Node bridge service"
install -d -m 755 /opt/poland-bridge
cp -v "${SCRIPT_DIR}/bridge/server.js" /opt/poland-bridge/
cp -v "${SCRIPT_DIR}/bridge/package.json" /opt/poland-bridge/
( cd /opt/poland-bridge && npm install --omit=dev )

# Default env file (operator edits values after install)
if [ ! -f /etc/poland-bridge.env ]; then
  cat > /etc/poland-bridge.env <<'ENVEOF'
# /etc/poland-bridge.env — bridge configuration. Restart with: systemctl restart poland-bridge
PORT=8080
PORTAL_URL=https://portal.engwx.com
# AWS Polly (recommended for Polish TTS quality)
AWS_REGION=eu-central-1
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
POLLY_VOICE=Ewa
# Cache directory for rendered Polly MP3s (auto-created)
POLLY_CACHE=/var/cache/poland-bridge
ENVEOF
  chmod 640 /etc/poland-bridge.env
fi
mkdir -p /var/cache/poland-bridge && chown -R freeswitch:freeswitch /var/cache/poland-bridge 2>/dev/null || true

echo "==> 7/8  Installing systemd units"
cp -v "${SCRIPT_DIR}/systemd/poland-bridge.service" /etc/systemd/system/
cp -v "${SCRIPT_DIR}/systemd/freeswitch.service.d-override.conf" /etc/systemd/system/freeswitch.service.d/override.conf 2>/dev/null || \
  ( mkdir -p /etc/systemd/system/freeswitch.service.d && cp -v "${SCRIPT_DIR}/systemd/freeswitch.service.d-override.conf" /etc/systemd/system/freeswitch.service.d/override.conf )
systemctl daemon-reload

echo "==> 8/8  Firewall — open SIP 5060 (UDP+TCP) and RTP 16384-32768 from carrier IP only"
ufw allow from 64.79.144.100 to any port 5060 proto udp comment "Polish carrier SIP signalling"
ufw allow from 64.79.144.100 to any port 5060 proto tcp comment "Polish carrier SIP signalling (TCP)"
ufw allow 16384:32768/udp comment "RTP media (open to all by carrier NAT)"
ufw allow OpenSSH
ufw --force enable || true

systemctl enable --now freeswitch
systemctl enable --now poland-bridge

cat <<DONE

✅ FreeSWITCH + Poland bridge installed.

Next steps:
  1. Edit /etc/poland-bridge.env and add AWS credentials for Polly TTS.
  2. systemctl restart poland-bridge
  3. Point your Polish carrier's SIP routes at:  this VPS IP, port 5060 UDP
  4. Test:  fs_cli -x 'sofia status profile poland-inbound'
  5. Tail logs:
       journalctl -u freeswitch -f
       journalctl -u poland-bridge -f
DONE
