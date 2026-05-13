# Live Streaming Studio

Multi-camera live streaming studio for field sports:

- Paid 3-hour room passes create isolated room PINs for each match
- Mobile phones join as cameras with a room PIN
- Director panel requires the tenant account token plus room PIN, then pulls remote Cloudflare Realtime SFU feeds and switches the live program output
- Built-in cricket, football, and generic score controls can be shared through a room scoring link; the final RTMP canvas always includes the saved scoreboard/graphics
- Broadcast goes through a local or VPS WebSocket relay driven by `ffmpeg`, then out to YouTube or Facebook RTMP.

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

The studio runs at `http://localhost:5173`.

## Paid Room Pass Flow

The home page supports manual bKash room-pass submission as the low-budget primary flow, while Stripe Checkout remains available as an optional card/hosted checkout path.

Manual bKash flow:

1. Customer creates an account with name, email, and phone.
2. Customer sends bKash manually to the configured merchant number.
3. Customer submits room name, bKash sender number, and TrxID.
4. The room is created as `pending_manual_review`.
5. Admin verifies the payment and approves the room pass.
6. The room becomes `ready` with its own PIN, ad settings, overlay settings, and YouTube/Facebook destination fields.
7. The 3-hour timer starts only when the director opens the studio and starts the room session.

Admin operations:

Open `/admin` and sign in with the configured admin email and password. The browser stores the admin session in an HTTP-only cookie, so operators do not paste bearer tokens into the UI.

```bash
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_ACCESS_TOKEN
```

Use a long random value for `ADMIN_ACCESS_TOKEN`; it is the internal cookie session secret after email/password login.

Manual payment configuration:

```bash
npx wrangler secret put MANUAL_PAYMENT_ADMIN_TOKEN
```

Recommended variables:

```bash
BKASH_MERCHANT_NUMBER=01700000000
ROOM_PASS_PRICE_CENTS=1500
```

Stripe flow:

After Stripe payment, the room is activated with its own PIN, tenant owner email, room-specific ad/overlay settings, and room-specific YouTube/Facebook destination fields.

Required production secrets:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Recommended production variables:

```bash
PUBLIC_APP_URL=https://your-domain.example
ROOM_PASS_PRICE_CENTS=1500
BKASH_MERCHANT_NUMBER=01700000000
```

## Production Readiness Checklist

The `/admin` dashboard includes a production readiness panel. Before sending real tenants through the system:

```bash
npx wrangler d1 migrations apply live-studio-db
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_ACCESS_TOKEN
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put PUBLIC_GOOGLE_CLIENT_ID
npx wrangler secret put CF_CALLS_APP_ID
npx wrangler secret put CF_CALLS_APP_TOKEN
npx wrangler secret put RELAY_WEBSOCKET_URL
npx wrangler secret put RELAY_AUTH_SECRET
```

Configure at least one payment path:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

or:

```bash
npx wrangler secret put MANUAL_PAYMENT_ADMIN_TOKEN
# plus BKASH_MERCHANT_NUMBER as a Worker variable/secret
```

Package camera limits are enforced when cameras register with a room, and admin package/payment/room actions are written to `admin_audit_logs` after migration `0012_admin_audit_logs.sql`.
Package ad-video limits are enforced on R2 ad uploads after migration `0013_package_ad_video_limits.sql`: Starter Live allows 1 ad video, Matchday Pro allows 2, and Season Ops allows 3.

Stripe webhook endpoint:

```text
https://your-domain.example/api/v1/stripe/webhook
```

Listen for `checkout.session.completed`. The success redirect also verifies the Stripe Checkout Session and activates the room, so the webhook and redirect both lead to the same paid-room activation path.

## Cloudflare SFU + VPS Relay Mode

Phones publish camera feeds to Cloudflare Realtime SFU. The director dashboard pulls those SFU tracks, mixes the program output with score graphics/logos/ticker/ad video, sends the mixed WebM stream to a relay over WebSocket, and the relay uses `ffmpeg` to push to YouTube or Facebook RTMP.

Requirements:

- Cloudflare Realtime SFU app credentials
- Optional Cloudflare TURN key credentials
- VPS relay with `ffmpeg`
- `RELAY_WEBSOCKET_URL` and `RELAY_AUTH_SECRET` Worker secrets
- YouTube or Facebook live stream created in their studio
- Your YouTube/Facebook `Stream URL` and `Stream Key`

Relay diagnostics are available on the VPS at `http://127.0.0.1:8899/status`.

Then in the director panel:

1. Sign in on the home page first
2. Open the room's `Studio` button from the dashboard
3. Open `/camera` on one or more phones and join with the same PIN
4. Switch a ready camera to live, update graphics, or switch to ad mode
5. Paste the YouTube or Facebook RTMP URL and stream key
6. Press `GO LIVE`

Use the score control link from the studio graphics panel when another operator needs to manage the scoreboard. That page updates the room overlay data directly, and the director studio polls those updates into the mixed canvas.

The relay URL and relay token are managed by the Worker and are not shown in the director dashboard. The browser receives a short-lived room-scoped relay URL when streaming starts.

See [`docs/relay-testing-and-vps.md`](docs/relay-testing-and-vps.md) for local drop diagnosis and VPS service setup.

## Cloudflare Secrets

Set these secrets for SFU, TURN, and managed relay:

```bash
npx wrangler secret put CF_CALLS_APP_ID
npx wrangler secret put CF_CALLS_APP_TOKEN
npx wrangler secret put CF_TURN_KEY_ID
npx wrangler secret put CF_TURN_API_TOKEN
npx wrangler secret put RELAY_WEBSOCKET_URL
npx wrangler secret put RELAY_AUTH_SECRET
```

Cloudflare Realtime bills SFU/TURN on outbound data from Cloudflare to clients. As of April 25, 2026, Cloudflare documents a 1,000 GB/month free tier and $0.05/GB after that. Client upload into Cloudflare is free, and TURN used with SFU is not double-charged.
