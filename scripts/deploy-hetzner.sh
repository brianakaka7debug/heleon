#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <ssh-host> [domain] [ssh-user]" >&2
  echo "Example: $0 1.2.3.4 hele.one root" >&2
  exit 1
fi

SSH_HOST="$1"
DOMAIN="${2:-hele.one}"
SSH_USER="${3:-root}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_DIR="/opt/heleon/app"

echo "Syncing project to ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}"
ssh "${SSH_USER}@${SSH_HOST}" "mkdir -p ${REMOTE_DIR}"

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'apps/web/dist' \
  --exclude '.runlogs' \
  "${ROOT_DIR}/" "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"

echo "Running remote install"
ssh "${SSH_USER}@${SSH_HOST}" "bash ${REMOTE_DIR}/deploy/remote/install.sh ${DOMAIN}"

echo "Done"
echo "- Site: https://${DOMAIN}"
echo "- API health (origin): http://${SSH_HOST}:8787/api/health"
