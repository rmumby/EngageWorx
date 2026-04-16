#!/usr/bin/env bash
# install.sh — Asterisk + Node bridge for EngageWorx Poland voice inbound.
# Target: Ubuntu 24.04 LTS on DigitalOcean Frankfurt.
# No third-party tokens required — Asterisk ships in the Ubuntu repos.
#
# Run as root:  sudo bash install.sh

set -euo pipefail
[ "${EUID}" -ne 0 ] && { echo "Run as root." >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

echo "==> 1/7  apt update + prereqs"
apt-get update -y
apt-get install -y --no-install-recommends curl wget ca-certificates ufw jq sox flite

echo "==> 2/7  Installing Asterisk from Ubuntu repos"
apt-get install -y --no-install-recommends asterisk asterisk-modules asterisk-core-sounds-en

echo "==> 3/7  Installing Node 20.x"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> 4/7  Deploying Asterisk config"
# Back up originals if first run
for f in pjsip.conf extensions.conf http.conf ari.conf; do
  [ -f /etc/asterisk/${f}.orig ] || cp /etc/asterisk/${f} /etc/asterisk/${f}.orig 2>/dev/null || true
done
cp -v "${SCRIPT_DIR}/asterisk/pjsip.conf"     /etc/asterisk/
cp -v "${SCRIPT_DIR}/asterisk/extensions.conf" /etc/asterisk/
cp -v "${SCRIPT_DIR}/asterisk/http.conf"       /etc/asterisk/
cp -v "${SCRIPT_DIR}/asterisk/ari.conf"        /etc/asterisk/
chown -R asterisk:asterisk /etc/asterisk/

echo "==> 5/7  Installing Node bridge"
install -d -m 755 /opt/poland-bridge
cp -v "${SCRIPT_DIR}/bridge/server.js"    /opt/poland-bridge/
cp -v "${SCRIPT_DIR}/bridge/package.json" /opt/poland-bridge/
( cd /opt/poland-bridge && npm install --omit=dev )

if [ ! -f /etc/poland-bridge.env ]; then
  cat > /etc/poland-bridge.env <<'ENVEOF'
PORT=8080
PORTAL_URL=https://portal.engwx.com
ASTERISK_ARI_URL=http://127.0.0.1:8088
ASTERISK_ARI_USER=engageworx
ASTERISK_ARI_PASS=changeme-ari-secret
AWS_REGION=eu-central-1
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
POLLY_VOICE=Ewa
POLLY_CACHE=/var/cache/poland-bridge
ENVEOF
  chmod 640 /etc/poland-bridge.env
fi
mkdir -p /var/cache/poland-bridge /var/lib/asterisk/sounds/poland
chown -R asterisk:asterisk /var/cache/poland-bridge /var/lib/asterisk/sounds/poland

echo "==> 6/7  Systemd units"
cp -v "${SCRIPT_DIR}/systemd/poland-bridge.service" /etc/systemd/system/
systemctl daemon-reload

echo "==> 7/7  Firewall"
ufw allow from 64.79.144.100 to any port 5060 proto udp comment "Polish carrier SIP"
ufw allow from 64.79.144.100 to any port 5060 proto tcp comment "Polish carrier SIP TCP"
ufw allow 10000:20000/udp comment "RTP media"
ufw allow OpenSSH
ufw --force enable || true

systemctl enable --now asterisk
systemctl enable --now poland-bridge

cat <<DONE

✅ Asterisk + Poland bridge installed.

Next steps:
  1. Edit /etc/poland-bridge.env — add AWS Polly creds + set ASTERISK_ARI_PASS
  2. Match the ARI password in /etc/asterisk/ari.conf
  3. systemctl restart poland-bridge && systemctl restart asterisk
  4. Verify: asterisk -rx 'pjsip show endpoints'
  5. Logs: journalctl -u asterisk -f  &&  journalctl -u poland-bridge -f
DONE
