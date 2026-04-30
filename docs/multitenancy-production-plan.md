# Multitenancy Production Plan

## Goal

Turn the live studio into a tenant-owned SaaS flow: public pricing, account login, package purchase, room access after payment, admin control, and tenant-managed room graphics.

## Architecture Decisions

- Public home shows packages first. A user signs in or creates an account, chooses a package, then starts Stripe checkout or submits manual bKash review.
- Tenants own rooms and purchases. Room sessions start only after a paid or admin-approved package, and the countdown starts when the director opens the studio.
- Admin panel uses a server-side bearer token. It can review manual payments, inspect tenants/rooms/purchases, and control package availability/pricing.
- Google GIS is supported with a backend verification endpoint. The backend must verify the ID token signature, `aud`, `iss`, and `exp`, then store Google `sub` as the stable account identity.
- Room graphics are tenant assets. The browser compresses logo uploads to WebP before upload; the Worker stores them in R2 and deletes the old R2 object when a logo is replaced or removed.
- External overlay URLs stay supported. The site renders the external overlay iframe over the website player and director preview.
- Scoring controls are disabled for now. The director dashboard keeps graphics and external overlay controls, but removes scoring console handoff UI.
- Director console defaults to Bangla with an English toggle.

## Admin Panel Requirements

- KPI summary: tenants, rooms, purchases, revenue pending/paid, active rooms.
- Package control: name, price, currency, duration, active/hidden state, feature list.
- Tenant list: account name, email, phone, auth provider, creation date, room count.
- Purchase queue: payment provider, package, amount, bKash sender/TrxID, status, approve/reject actions.
- Room operations: room name, PIN, status, expiry, tenant, package, direct studio link.
- Operational safeguards: loading state, error state with retry, disabled buttons while submitting, and consistent `/api/v1/` response envelope.

## Remaining Production Work After This Pass

- Replace token-only admin auth with staff accounts and roles.
- Add Stripe webhooks for package metadata reconciliation in production billing audits.
- Add tenant-scoped request auth to every room mutation endpoint, not only package/account flows.
- Add R2 lifecycle rules for orphan cleanup and retention policy.
- Add Cloudflare Turnstile or rate limits to auth, payment, and upload endpoints.
- Add audit logs for admin approvals/rejections and package changes.
