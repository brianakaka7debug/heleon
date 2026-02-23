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
SSH_PORT="${SSH_PORT:-22}"
SSH_KEY_PATH="${SSH_KEY_PATH:-}"
SSH_TARGET="${SSH_USER}@${SSH_HOST}"
RSYNC_HOST="${SSH_HOST}"
if [[ "${RSYNC_HOST}" == *:* && "${RSYNC_HOST}" != \[*\] ]]; then
  RSYNC_HOST="[${RSYNC_HOST}]"
fi
RSYNC_TARGET="${SSH_USER}@${RSYNC_HOST}:${REMOTE_DIR}"

SSH_CMD="ssh -p ${SSH_PORT} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
if [[ -n "${SSH_KEY_PATH}" ]]; then
  SSH_CMD="${SSH_CMD} -i ${SSH_KEY_PATH} -o IdentitiesOnly=yes"
fi

echo "Syncing project to ${RSYNC_TARGET}"
${SSH_CMD} "${SSH_TARGET}" "mkdir -p ${REMOTE_DIR}"

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'apps/web/dist' \
  --exclude '.runlogs' \
  -e "${SSH_CMD}" \
  "${ROOT_DIR}/" "${RSYNC_TARGET}/"

echo "Running remote install"
${SSH_CMD} "${SSH_TARGET}" "bash ${REMOTE_DIR}/deploy/remote/install.sh ${DOMAIN}"

echo "Done"
echo "- Site: https://${DOMAIN}"
echo "- API health (origin): http://${SSH_HOST}:8787/api/health"
