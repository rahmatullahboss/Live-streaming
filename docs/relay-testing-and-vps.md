# Relay Testing And VPS Setup

This project uses this live path:

```text
Phone cameras -> Cloudflare Realtime SFU -> Director browser mixer -> WebSocket relay -> ffmpeg -> YouTube/Facebook RTMP
```

The relay can run on the local development machine or on a VPS. VPS is preferred for production, but local testing should first isolate which layer drops.

## Local Drop Diagnosis

Start the app:

```bash
npm run dev
```

Start the relay in a second terminal:

```bash
LOCAL_RELAY_PORT=8899 LOCAL_RELAY_SIGNING_SECRET=local-relay-secret npm run relay
```

Set local Worker vars to match the relay:

```bash
RELAY_WEBSOCKET_URL=ws://localhost:8899
RELAY_AUTH_SECRET=local-relay-secret
```

Check relay health:

```bash
curl http://localhost:8899/status
```

Expected when idle:

```json
{"ok":true,"activeSessions":[]}
```

### Test A: Managed Relay Connection

1. Open `/studio`.
2. Join the room and select a camera.
3. Paste the YouTube or Facebook RTMP URL and stream key.
4. Press `Go Live`.
5. Wait 30-60 seconds.
6. Press `Stop Relay`.

If this fails or the `/status` endpoint shows old `lastChunkAgeMs`, the browser mixer, Worker relay config, or browser-to-relay WebSocket path is dropping.

### Test B: Relay To YouTube

Paste the current YouTube RTMP URL and stream key, then press `Go Live`.

Watch relay status while streaming:

```bash
watch -n 1 curl -s http://localhost:8899/status
```

If `ffmpegRunning` becomes false or the dashboard shows an upstream close message, YouTube closed the RTMP connection. Common causes are wrong stream key, expired event, duplicate encoder, or network interruption.

## VPS Relay Setup

Install Node.js 22+ and ffmpeg on the VPS.

```bash
sudo apt update
sudo apt install -y ffmpeg curl
```

Upload or clone the project, install dependencies, then run:

```bash
npm install
LOCAL_RELAY_PORT=8899 LOCAL_RELAY_HOST=127.0.0.1 LOCAL_RELAY_SIGNING_SECRET=replace-with-worker-secret npm run relay
```

For production, run it as a systemd service:

```ini
[Unit]
Description=Live Studio RTMP Relay
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/live-studio
EnvironmentFile=/etc/live-studio/relay.env
ExecStart=/usr/bin/npm run relay
Restart=always
RestartSec=3
User=live-relay
Environment=NODE_ENV=production
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/live-studio /tmp
MemoryMax=1G
CPUQuota=200%

[Install]
WantedBy=multi-user.target
```

Expose it through HTTPS/WSS using Cloudflare Tunnel, Nginx, or Caddy. The Worker should store the secure relay URL:

```bash
npx wrangler secret put RELAY_WEBSOCKET_URL
npx wrangler secret put RELAY_AUTH_SECRET
```

`RELAY_AUTH_SECRET` must match `LOCAL_RELAY_SIGNING_SECRET` on the VPS. The director dashboard asks the Worker for a short-lived room-scoped relay URL when streaming starts, so the relay URL is not shown in the UI.

Open the firewall only for SSH and reverse proxy ports:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Keep `http://localhost:8899/status` accessible only on the VPS or behind admin protection. It intentionally hides stream keys, but it still exposes operational state.

Production hardening checklist:

- Create a non-root `live-relay` user.
- Disable password SSH login and use SSH keys only.
- Install unattended security upgrades.
- Put Nginx/Caddy in front of the relay with HTTPS/WSS.
- Do not expose port `8899` publicly.
- Set `LOCAL_RELAY_SIGNING_SECRET` to the same long random value as the Worker `RELAY_AUTH_SECRET`.
- Rotate YouTube stream keys per event when possible.
- Use `journalctl -u live-studio-relay -f` for relay logs.
