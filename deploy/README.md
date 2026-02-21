# Hetzner + Cloudflare Deployment

This deploys both frontend and API on one Hetzner VM and serves them behind Nginx.

## 1) Cloudflare settings

In Cloudflare DNS for `hele.one`:

- Create `A` record: `@` -> `<VM_PUBLIC_IP>` (proxied ON)
- Create `A` record: `www` -> `<VM_PUBLIC_IP>` (proxied ON)

In SSL/TLS:

- Set mode to `Full` (or `Full (strict)` once origin cert is installed)
- Enable `Always Use HTTPS`

## 2) Deploy command

From this repo root:

```bash
./scripts/deploy-hetzner.sh <VM_PUBLIC_IP> hele.one root
```

If your SSH key is not the default identity:

```bash
SSH_KEY_PATH=~/.ssh/your_key ./scripts/deploy-hetzner.sh <VM_PUBLIC_IP> hele.one root
```

## 3) What it configures on VM

- Node.js 20, Nginx
- API systemd service: `heleon-api`
- Nginx site serving:
  - `/` -> `apps/web/dist` (SPA fallback)
  - `/api/*` -> Fastify on `127.0.0.1:8787`
  - `/events/*` -> SSE proxy to Fastify

## 4) Verify

On VM:

```bash
systemctl status heleon-api --no-pager
nginx -t
curl -fsS http://127.0.0.1:8787/api/health
```

From browser:

- `https://hele.one`
