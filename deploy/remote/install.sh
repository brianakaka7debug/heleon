#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-hele.one}"
APP_DIR="/opt/heleon/app"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg nginx rsync openssl

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

install -d -o www-data -g www-data "${APP_DIR}"
cd "${APP_DIR}"

npm ci
npm run build:gtfs
npm --workspace @heleon/web run build

cat > /etc/default/heleon-api <<ENV
PORT=8787
HOST=127.0.0.1
CORS_ORIGIN=https://${DOMAIN}
GTFS_TIMEZONE=Pacific/Honolulu
ENV

cp "${APP_DIR}/deploy/systemd/heleon-api.service" /etc/systemd/system/heleon-api.service
systemctl daemon-reload
systemctl enable --now heleon-api.service

sed "s/__DOMAIN__/${DOMAIN} www.${DOMAIN}/g" "${APP_DIR}/deploy/nginx/heleon.conf.template" > /etc/nginx/sites-available/heleon
install -d -m 755 /etc/nginx/ssl
if [[ ! -f /etc/nginx/ssl/hele.one.crt || ! -f /etc/nginx/ssl/hele.one.key ]]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -keyout /etc/nginx/ssl/hele.one.key \
    -out /etc/nginx/ssl/hele.one.crt \
    -subj "/CN=${DOMAIN}"
fi
ln -sf /etc/nginx/sites-available/heleon /etc/nginx/sites-enabled/heleon
if [[ -f /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "Install complete for ${DOMAIN}"
echo "Health check: curl -fsS http://127.0.0.1:8787/api/health"
