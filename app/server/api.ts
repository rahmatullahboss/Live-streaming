import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";

import {
  DEFAULT_PACKAGES,
  getActivePackages,
  resolvePackageById,
  type PackageRecord,
} from "~/lib/multitenancy";
import { DEFAULT_ICE_SERVERS, sanitizeIceServers, type IceServerConfig } from "~/lib/webrtc/ice-servers";

/**
 * Cloudflare Workers Bindings
 * CF_CALLS_APP_ID / CF_CALLS_APP_TOKEN → set via `wrangler secret put`
 * CF_TURN_KEY_ID / CF_TURN_API_TOKEN → optional TURN credentials
 * CF_STREAM_API_TOKEN / CF_ACCOUNT_ID → optional Cloudflare Stream fallback endpoints
 */
export type Bindings = {
  DB: D1Database;
  CF_CALLS_APP_ID: string;
  CF_CALLS_APP_TOKEN: string;
  CF_ACCOUNT_ID?: string;
  CF_STREAM_API_TOKEN?: string;
  CF_TURN_KEY_ID?: string;
  CF_TURN_API_TOKEN?: string;
  PUBLIC_APP_URL?: string;
  ROOM_PASS_PRICE_CENTS?: string;
  BKASH_MERCHANT_NUMBER?: string;
  MANUAL_PAYMENT_ADMIN_TOKEN?: string;
  ADMIN_ACCESS_TOKEN?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  RELAY_AUTH_SECRET?: string;
  RELAY_WEBSOCKET_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  PUBLIC_GOOGLE_CLIENT_ID?: string;
  R2_ASSETS?: R2Bucket;
  R2_PUBLIC_BASE_URL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

const CALLS_API_BASE = "https://rtc.live.cloudflare.com/v1";
const STREAM_API_BASE = "https://api.cloudflare.com/client/v4";
const TURN_API_BASE = "https://rtc.live.cloudflare.com/v1/turn";
const STRIPE_API_BASE = "https://api.stripe.com/v1";
const ROOM_PASS_DURATION_MINUTES = 180;
const ROOM_PASS_CURRENCY = "usd";
const MANUAL_ROOM_PASS_CURRENCY = "bdt";
const RELAY_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_SESSION_COOKIE = "live_studio_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ALLOWED_ASSET_FIELDS = ["left_logo_url", "right_logo_url"] as const;
const MAX_LOGO_UPLOAD_BYTES = 1_200_000;

type ApiSuccess<T extends Record<string, unknown>> = {
  success: true;
  data: T;
} & T;

type ApiError = {
  success: false;
  error: string;
  message: string;
};

type DiagnosticRequest = {
  details?: Record<string, boolean | null | number | string>;
  event?: string;
  level?: "error" | "info" | "warn";
  scope?: string;
  ts?: string;
};

type OverlayUpdateValue = string | number | null;
type CloudflareApiResult<T> = {
  data?: T;
  result?: T;
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
};

type RoomRecord = {
  checkout_session_id?: string | null;
  customer_email?: string | null;
  expires_at?: string | null;
  facebook_output_url?: string | null;
  facebook_stream_key?: string | null;
  id: string;
  name: string;
  pin: string;
  scoring_token?: string | null;
  session_started_at?: string | null;
  status?: string | null;
  stream_playback_url?: string | null;
  tenant_id?: string | null;
  youtube_output_url?: string | null;
  youtube_stream_key?: string | null;
};

type RoomSummaryRecord = Omit<
  RoomRecord,
  "facebook_output_url" | "facebook_stream_key" | "youtube_output_url" | "youtube_stream_key"
>;

type OverlayRecord = {
  ad_title?: string | null;
  ad_video_url?: string | null;
  clock_text?: string | null;
  external_scoreboard_url?: string | null;
  left_logo_url?: string | null;
  logo_url?: string | null;
  match_status?: string | null;
  program_source?: string | null;
  right_logo_url?: string | null;
  room_id: string;
  scoreboard_active?: number | null;
  scoring_data?: string | null;
  sponsor_text?: string | null;
  sport?: string | null;
  team1_name?: string | null;
  team1_score?: number | null;
  team2_name?: string | null;
  team2_score?: number | null;
  theme_variant?: string | null;
  ticker_active?: number | null;
  ticker_text?: string | null;
  updated_at?: string | null;
};

type BroadcastDestinationRecord = {
  key: "facebook" | "youtube";
  label: "Facebook" | "YouTube";
  rtmpUrl: string;
  streamKey: string;
};

type RoomPassRecord = {
  amount_cents: number;
  bkash_sender_number?: string | null;
  bkash_transaction_id?: string | null;
  checkout_session_id?: string | null;
  currency: string;
  duration_minutes: number;
  id: string;
  package_id?: string | null;
  payment_provider?: string | null;
  room_id: string;
  status: string;
  tenant_id: string;
};

type TenantRecord = {
  access_token: string;
  auth_provider?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  email: string;
  google_sub?: string | null;
  id: string;
  name?: string | null;
  phone?: string | null;
  updated_at?: string | null;
};

type PackageRow = Omit<PackageRecord, "features"> & {
  deleted_at?: string | null;
  features_json?: string | null;
};

type RoomAssetRecord = {
  deleted_at?: string | null;
  id: string;
  overlay_field: AssetOverlayField;
  public_url: string;
  r2_key: string;
  room_id: string;
  tenant_id?: string | null;
};

type AssetOverlayField = (typeof ALLOWED_ASSET_FIELDS)[number];

type AdminAuditRecord = {
  action: string;
  actor_email?: string | null;
  created_at?: string | null;
  id: string;
  metadata_json?: string | null;
  target_id: string;
  target_type: string;
};

type StripeCheckoutSession = {
  id: string;
  payment_status?: "no_payment_required" | "paid" | "unpaid";
  status?: "complete" | "expired" | "open";
  url?: string | null;
};

type GoogleJwtHeader = {
  alg?: string;
  kid?: string;
};

type GoogleJwtPayload = {
  aud?: string;
  email?: string;
  email_verified?: boolean | string;
  exp?: number;
  iss?: string;
  name?: string;
  picture?: string;
  sub?: string;
};

type GoogleJwksResponse = {
  keys?: GooglePublicJwk[];
};

type GooglePublicJwk = JsonWebKey & {
  kid?: string;
};

type PackagePatchBody = Partial<
  Pick<
    PackageRecord,
    | "active"
    | "description"
    | "duration_minutes"
    | "max_cameras"
    | "max_rooms"
    | "name"
    | "price_cents"
    | "sort_order"
  >
> & {
  features?: string[];
};

type ReadinessCheck = {
  action: string;
  key: string;
  label: string;
  ok: boolean;
  severity: "error" | "warning";
};

type ReadinessResult = {
  checks: ReadinessCheck[];
  ready: boolean;
};

const DEFAULT_BROADCAST_DESTINATIONS: BroadcastDestinationRecord[] = [
  {
    key: "youtube",
    label: "YouTube",
    rtmpUrl: "rtmp://a.rtmp.youtube.com/live2",
    streamKey: "",
  },
  {
    key: "facebook",
    label: "Facebook",
    rtmpUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
    streamKey: "",
  },
];

function normalizeExternalUrl(rawUrl: string | null | undefined): string {
  const trimmed = rawUrl?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function getPublicOrigin(c: Context<{ Bindings: Bindings }>): string {
  return c.env.PUBLIC_APP_URL?.replace(/\/+$/, "") || new URL(c.req.url).origin;
}

function getRoomPassPriceCents(c: Context<{ Bindings: Bindings }>): number {
  const configured = Number(c.env.ROOM_PASS_PRICE_CENTS ?? "1500");
  return Number.isInteger(configured) && configured > 0 ? configured : 1500;
}

function getBkashMerchantNumber(c: Context<{ Bindings: Bindings }>): string {
  return c.env.BKASH_MERCHANT_NUMBER?.trim() || "Set BKASH_MERCHANT_NUMBER";
}

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function toBase64UrlText(text: string): string {
  return toBase64Url(new TextEncoder().encode(text).buffer);
}

function fromBase64UrlText(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function parseBase64UrlJson<T>(value: string): T {
  return JSON.parse(fromBase64UrlText(value)) as T;
}

async function signRelayToken(roomId: string, expiresAtMs: number, secret: string): Promise<string> {
  const encodedRoomId = btoa(roomId).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const payload = `v1.${encodedRoomId}.${expiresAtMs}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

function buildRelayWebSocketUrl(baseUrl: string, token: string): string {
  const websocketUrl = new URL(baseUrl);
  websocketUrl.searchParams.set("token", token);
  return websocketUrl.toString();
}

function toRoomSummary(room: RoomRecord): RoomSummaryRecord {
  const {
    facebook_output_url: _facebookOutputUrl,
    facebook_stream_key: _facebookStreamKey,
    youtube_output_url: _youtubeOutputUrl,
    youtube_stream_key: _youtubeStreamKey,
    ...summary
  } = room;
  return summary;
}

function getStripeSecretKey(c: Context<{ Bindings: Bindings }>): string {
  const secretKey = c.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new HTTPException(503, {
      message: "Stripe payment is not configured. Set STRIPE_SECRET_KEY before selling room passes.",
    });
  }
  return secretKey;
}

function createPublicId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function normalizePackageRow(row: PackageRow): PackageRecord {
  let features: string[] = [];
  if (row.features_json) {
    try {
      const parsed = JSON.parse(row.features_json) as unknown;
      features = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      features = [];
    }
  }

  return {
    active: row.active,
    currency: row.currency,
    description: row.description,
    duration_minutes: row.duration_minutes,
    features,
    id: row.id,
    max_cameras: row.max_cameras,
    max_rooms: row.max_rooms,
    name: row.name,
    price_cents: row.price_cents,
    sort_order: row.sort_order,
  };
}

async function getPackageCatalog(c: Context<{ Bindings: Bindings }>): Promise<PackageRecord[]> {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM packages WHERE deleted_at IS NULL ORDER BY sort_order ASC, name ASC"
    ).all<PackageRow>();
    const packages = (results ?? []).map(normalizePackageRow);
    return packages.length > 0 ? packages : DEFAULT_PACKAGES;
  } catch {
    return DEFAULT_PACKAGES;
  }
}

async function getSelectedPackage(
  c: Context<{ Bindings: Bindings }>,
  packageId: string | null | undefined
): Promise<PackageRecord> {
  return resolvePackageById(packageId, await getPackageCatalog(c));
}

function createRoomPin(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return value.toString().padStart(6, "0");
}

function normalizePhone(rawPhone: string | undefined): string {
  return rawPhone?.replace(/[^\d+]/g, "").trim() ?? "";
}

function assertBangladeshPhone(phone: string, fieldLabel: string): void {
  if (!/^(\+?88)?01\d{9}$/.test(phone)) {
    throw new HTTPException(400, { message: `${fieldLabel} must be a valid Bangladesh mobile number` });
  }
}

function getAdminToken(c: Context<{ Bindings: Bindings }>): string {
  return c.env.ADMIN_ACCESS_TOKEN?.trim() || c.env.MANUAL_PAYMENT_ADMIN_TOKEN?.trim() || "";
}

function getAdminEmail(c: Context<{ Bindings: Bindings }>): string {
  return c.env.ADMIN_EMAIL?.trim().toLowerCase() || "";
}

function getAdminPassword(c: Context<{ Bindings: Bindings }>): string {
  return c.env.ADMIN_PASSWORD?.trim() || "";
}

function assertAdminRequest(c: Context<{ Bindings: Bindings }>): void {
  const expectedToken = getAdminToken(c);
  if (!expectedToken) {
    throw new HTTPException(503, { message: "Admin access is not configured" });
  }

  const authHeader = c.req.header("Authorization") ?? "";
  const cookieToken = getCookie(c, ADMIN_SESSION_COOKIE)?.trim() ?? "";
  const providedToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : cookieToken || c.req.query("token")?.trim() || "";

  if (providedToken !== expectedToken) {
    throw new HTTPException(401, { message: "Admin session is invalid" });
  }
}

async function getTenantByAccessToken(
  c: Context<{ Bindings: Bindings }>,
  accessToken: string
): Promise<TenantRecord> {
  const tenant = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE access_token = ?"
  ).bind(accessToken).first<TenantRecord>();

  if (!tenant) {
    throw new HTTPException(401, { message: "Account access token is invalid" });
  }

  return tenant;
}

function toPublicAccount(tenant: TenantRecord, includeToken = false) {
  return {
    ...(includeToken ? { accessToken: tenant.access_token } : {}),
    authProvider: tenant.auth_provider ?? "email",
    avatarUrl: tenant.avatar_url ?? "",
    email: tenant.email,
    id: tenant.id,
    name: tenant.name ?? tenant.email,
    phone: tenant.phone ?? "",
  };
}

function isRoomJoinable(room: RoomRecord): boolean {
  if (room.status && room.status !== "active") {
    return false;
  }

  if (!room.expires_at) {
    return true;
  }

  return new Date(room.expires_at).getTime() > Date.now();
}

function isRoomVerifiable(room: RoomRecord): boolean {
  if (!room.status || room.status === "active" || room.status === "ready") {
    if (!room.expires_at) {
      return true;
    }

    return new Date(room.expires_at).getTime() > Date.now();
  }

  return false;
}

function getRoomUnavailableMessage(room: RoomRecord): string {
  if (room.status && room.status !== "active") {
    return "This room is not active yet. Complete payment before joining.";
  }

  return "This room has expired. Buy a new room pass to continue streaming.";
}

async function createStripeCheckoutSession({
  amountCents,
  c,
  customerEmail,
  orderId,
  packageId,
  packageName,
  roomId,
  roomName,
  tenantId,
  durationMinutes,
}: {
  amountCents: number;
  c: Context<{ Bindings: Bindings }>;
  customerEmail: string;
  durationMinutes: number;
  orderId: string;
  packageId: string;
  packageName: string;
  roomId: string;
  roomName: string;
  tenantId: string;
}): Promise<StripeCheckoutSession> {
  const origin = getPublicOrigin(c);
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("customer_email", customerEmail);
  form.set("success_url", `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${origin}/?checkout=cancelled`);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", ROOM_PASS_CURRENCY);
  form.set("line_items[0][price_data][unit_amount]", String(amountCents));
  form.set("line_items[0][price_data][product_data][name]", packageName);
  form.set(
    "line_items[0][price_data][product_data][description]",
    `${durationMinutes} minutes of room access for ${roomName}`
  );
  form.set("metadata[order_id]", orderId);
  form.set("metadata[room_id]", roomId);
  form.set("metadata[tenant_id]", tenantId);
  form.set("metadata[duration_minutes]", String(durationMinutes));
  form.set("metadata[package_id]", packageId);

  const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey(c)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new HTTPException(response.status as 400, {
      message: `Stripe checkout failed: ${errorText}`,
    });
  }

  return response.json<StripeCheckoutSession>();
}

async function retrieveStripeCheckoutSession(
  c: Context<{ Bindings: Bindings }>,
  sessionId: string
): Promise<StripeCheckoutSession> {
  const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${getStripeSecretKey(c)}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new HTTPException(response.status as 400, {
      message: `Stripe checkout lookup failed: ${errorText}`,
    });
  }

  return response.json<StripeCheckoutSession>();
}

async function activatePaidRoom(
  c: Context<{ Bindings: Bindings }>,
  checkoutSessionId: string
): Promise<RoomRecord> {
  const roomPass = await c.env.DB.prepare(
    "SELECT * FROM room_passes WHERE checkout_session_id = ?"
  ).bind(checkoutSessionId).first<RoomPassRecord>();

  if (!roomPass) {
    throw new HTTPException(404, { message: "Room pass not found for this checkout session" });
  }

  await c.env.DB.prepare(
    `UPDATE rooms
      SET status = 'ready',
          expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE checkout_session_id = ?`
  ).bind(checkoutSessionId).run();

  await c.env.DB.prepare(
    `UPDATE room_passes
      SET status = 'paid',
          paid_at = CURRENT_TIMESTAMP
      WHERE checkout_session_id = ?`
  ).bind(checkoutSessionId).run();

  const room = await c.env.DB.prepare(
    "SELECT * FROM rooms WHERE checkout_session_id = ?"
  ).bind(checkoutSessionId).first<RoomRecord>();

  if (!room) {
    throw new HTTPException(404, { message: "Room not found for this checkout session" });
  }

  return {
    ...room,
    expires_at: null,
    status: "ready",
  };
}

async function activateRoomPassById(
  c: Context<{ Bindings: Bindings }>,
  roomPassId: string
): Promise<RoomRecord> {
  const roomPass = await c.env.DB.prepare(
    "SELECT * FROM room_passes WHERE id = ?"
  ).bind(roomPassId).first<RoomPassRecord>();

  if (!roomPass) {
    throw new HTTPException(404, { message: "Room pass not found" });
  }

  await c.env.DB.prepare(
    `UPDATE rooms
      SET status = 'ready',
          expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).bind(roomPass.room_id).run();

  await c.env.DB.prepare(
    `UPDATE room_passes
      SET status = 'paid',
          paid_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).bind(roomPassId).run();

  const room = await c.env.DB.prepare(
    "SELECT * FROM rooms WHERE id = ?"
  ).bind(roomPass.room_id).first<RoomRecord>();

  if (!room) {
    throw new HTTPException(404, { message: "Room not found for this room pass" });
  }

  return {
    ...room,
    expires_at: null,
    status: "ready",
  };
}

async function startRoomSession(
  c: Context<{ Bindings: Bindings }>,
  roomId: string
): Promise<RoomRecord> {
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE id = ?")
    .bind(roomId)
    .first<RoomRecord>();

  if (!room) {
    throw new HTTPException(404, { message: "Room not found" });
  }

  if (room.status === "active") {
    if (!isRoomJoinable(room)) {
      throw new HTTPException(403, { message: getRoomUnavailableMessage(room) });
    }
    return room;
  }

  if (room.status !== "ready" && room.status) {
    throw new HTTPException(403, { message: getRoomUnavailableMessage(room) });
  }

  const roomPass = await c.env.DB.prepare(
    "SELECT * FROM room_passes WHERE room_id = ? ORDER BY paid_at DESC, created_at DESC LIMIT 1"
  ).bind(roomId).first<RoomPassRecord>();
  const durationMinutes = roomPass?.duration_minutes ?? ROOM_PASS_DURATION_MINUTES;
  const expiresAt = new Date(Date.now() + durationMinutes * 60_000).toISOString();

  await c.env.DB.prepare(
    `UPDATE rooms
      SET status = 'active',
          expires_at = ?,
          session_started_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).bind(expiresAt, roomId).run();

  return {
    ...room,
    expires_at: expiresAt,
    status: "active",
  };
}

async function getRoomCameraLimit(
  c: Context<{ Bindings: Bindings }>,
  roomId: string
): Promise<number> {
  const roomPass = await c.env.DB.prepare(
    "SELECT * FROM room_passes WHERE room_id = ? ORDER BY paid_at DESC, created_at DESC LIMIT 1"
  ).bind(roomId).first<RoomPassRecord>();
  const selectedPackage = await getSelectedPackage(c, roomPass?.package_id);
  return selectedPackage.max_cameras;
}

async function assertRoomCameraCapacity(
  c: Context<{ Bindings: Bindings }>,
  roomId: string,
  cameraId: string
): Promise<void> {
  const maxCameras = await getRoomCameraLimit(c, roomId);
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS active_count
      FROM cameras
      WHERE room_id = ?
        AND is_active = 1
        AND last_seen_at >= datetime('now', '-300 seconds')
        AND id != ?`
  ).bind(roomId, cameraId).first<{ active_count: number }>();
  const activeCount = Number(countRow?.active_count ?? 0);

  if (activeCount >= maxCameras) {
    throw new HTTPException(403, {
      message: `This package allows up to ${maxCameras} active camera${maxCameras === 1 ? "" : "s"} for this room`,
    });
  }
}

async function expireRoomAccessNow(
  c: Context<{ Bindings: Bindings }>,
  roomId: string
): Promise<RoomRecord> {
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE id = ?")
    .bind(roomId)
    .first<RoomRecord>();

  if (!room) {
    throw new HTTPException(404, { message: "Room not found" });
  }

  const expiresAt = new Date(Date.now()).toISOString();
  await c.env.DB.prepare(
    `UPDATE rooms
      SET status = 'active',
          expires_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).bind(expiresAt, roomId).run();

  return {
    ...room,
    expires_at: expiresAt,
    status: "active",
  };
}

async function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  webhookSecret: string | undefined
): Promise<boolean> {
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  const timestamp = signatureHeader
    .split(",")
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const expectedSignatures = signatureHeader
    .split(",")
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || expectedSignatures.length === 0) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`)
  );
  const hex = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return expectedSignatures.includes(hex);
}

async function verifyGoogleCredential(
  c: Context<{ Bindings: Bindings }>,
  credential: string
): Promise<GoogleJwtPayload> {
  const clientId = c.env.GOOGLE_CLIENT_ID?.trim() || c.env.PUBLIC_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new HTTPException(503, { message: "Google sign-in is not configured" });
  }

  const parts = credential.split(".");
  if (parts.length !== 3) {
    throw new HTTPException(400, { message: "Google credential is not a valid ID token" });
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseBase64UrlJson<GoogleJwtHeader>(encodedHeader);
  const payload = parseBase64UrlJson<GoogleJwtPayload>(encodedPayload);

  if (header.alg !== "RS256" || !header.kid) {
    throw new HTTPException(401, { message: "Google credential uses an unsupported signature" });
  }

  if (payload.aud !== clientId) {
    throw new HTTPException(401, { message: "Google credential audience is invalid" });
  }

  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") {
    throw new HTTPException(401, { message: "Google credential issuer is invalid" });
  }

  if (!payload.exp || payload.exp * 1000 <= Date.now()) {
    throw new HTTPException(401, { message: "Google credential has expired" });
  }

  if (!payload.sub || !payload.email) {
    throw new HTTPException(401, { message: "Google credential is missing account identity" });
  }

  const certsResponse = await fetch(GOOGLE_CERTS_URL, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!certsResponse.ok) {
    throw new HTTPException(502, { message: "Could not load Google signing keys" });
  }

  const certs = await certsResponse.json<GoogleJwksResponse>();
  const jwk = certs.keys?.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new HTTPException(401, { message: "Google signing key was not found" });
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"]
  );
  const signedValue = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = Uint8Array.from(
    atob(encodedSignature.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(encodedSignature.length / 4) * 4, "=")),
    (char) => char.charCodeAt(0)
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    signedValue
  );

  if (!verified) {
    throw new HTTPException(401, { message: "Google credential signature is invalid" });
  }

  return payload;
}

async function findOrCreateGoogleTenant(
  c: Context<{ Bindings: Bindings }>,
  payload: GoogleJwtPayload
): Promise<TenantRecord> {
  const googleSub = payload.sub ?? "";
  const email = payload.email?.trim().toLowerCase() ?? "";
  const existingByGoogle = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE google_sub = ?"
  ).bind(googleSub).first<TenantRecord>();

  if (existingByGoogle) {
    const accessToken = existingByGoogle.access_token || createPublicId("acct");
    await c.env.DB.prepare(
      `UPDATE tenants
        SET email = ?,
            name = ?,
            avatar_url = ?,
            auth_provider = 'google',
            access_token = ?,
            last_login_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).bind(
      email,
      payload.name?.trim() || existingByGoogle.name || email,
      payload.picture ?? null,
      accessToken,
      existingByGoogle.id
    ).run();

    return {
      ...existingByGoogle,
      access_token: accessToken,
      auth_provider: "google",
      avatar_url: payload.picture ?? existingByGoogle.avatar_url,
      email,
      name: payload.name?.trim() || existingByGoogle.name || email,
    };
  }

  const existingByEmail = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE email = ?"
  ).bind(email).first<TenantRecord>();

  if (existingByEmail) {
    const accessToken = existingByEmail.access_token || createPublicId("acct");
    await c.env.DB.prepare(
      `UPDATE tenants
        SET google_sub = ?,
            auth_provider = 'google',
            avatar_url = ?,
            access_token = ?,
            last_login_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).bind(googleSub, payload.picture ?? null, accessToken, existingByEmail.id).run();

    return {
      ...existingByEmail,
      access_token: accessToken,
      auth_provider: "google",
      avatar_url: payload.picture ?? existingByEmail.avatar_url,
      google_sub: googleSub,
    };
  }

  const tenantId = createPublicId("tenant");
  const accessToken = createPublicId("acct");
  await c.env.DB.prepare(
    `INSERT INTO tenants (
      id,
      email,
      name,
      phone,
      access_token,
      google_sub,
      auth_provider,
      avatar_url,
      last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(
    tenantId,
    email,
    payload.name?.trim() || email,
    "",
    accessToken,
    googleSub,
    "google",
    payload.picture ?? null
  ).run();

  return {
    access_token: accessToken,
    auth_provider: "google",
    avatar_url: payload.picture ?? null,
    email,
    google_sub: googleSub,
    id: tenantId,
    name: payload.name?.trim() || email,
    phone: "",
  };
}

function getR2AssetsBucket(c: Context<{ Bindings: Bindings }>): R2Bucket {
  if (!c.env.R2_ASSETS) {
    throw new HTTPException(503, { message: "R2 asset storage is not configured" });
  }

  return c.env.R2_ASSETS;
}

function assertAssetOverlayField(value: FormDataEntryValue | string | null): AssetOverlayField {
  const field = typeof value === "string" ? value : "";
  if (!ALLOWED_ASSET_FIELDS.includes(field as AssetOverlayField)) {
    throw new HTTPException(400, { message: "Logo field must be left_logo_url or right_logo_url" });
  }

  return field as AssetOverlayField;
}

function buildAssetPublicUrl(c: Context<{ Bindings: Bindings }>, key: string): string {
  const publicBaseUrl = c.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (publicBaseUrl) {
    return `${publicBaseUrl}/${key}`;
  }

  return `${getPublicOrigin(c)}/api/v1/assets/${toBase64UrlText(key)}`;
}

async function getCurrentRoomAsset(
  c: Context<{ Bindings: Bindings }>,
  roomId: string,
  field: AssetOverlayField
): Promise<RoomAssetRecord | null> {
  try {
    return await c.env.DB.prepare(
      `SELECT * FROM room_assets
        WHERE room_id = ? AND overlay_field = ? AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`
    ).bind(roomId, field).first<RoomAssetRecord>();
  } catch {
    return null;
  }
}

async function clearRoomAsset(
  c: Context<{ Bindings: Bindings }>,
  asset: RoomAssetRecord | null
): Promise<void> {
  if (!asset) {
    return;
  }

  await getR2AssetsBucket(c).delete(asset.r2_key);
  try {
    await c.env.DB.prepare(
      "UPDATE room_assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(asset.id).run();
  } catch {
    // Older local databases may not have the room_assets table yet. R2 deletion is the source of truth.
  }
}

function jsonSuccess<T extends Record<string, unknown>>(
  c: Context<{ Bindings: Bindings }>,
  data: T
) {
  return c.json<ApiSuccess<T>>(
    {
      success: true,
      data,
      ...data,
    }
  );
}

async function hasMigratedTable(
  c: Context<{ Bindings: Bindings }>,
  tableName: "admin_audit_logs" | "packages" | "room_assets"
): Promise<boolean> {
  try {
    const row = await c.env.DB.prepare(
      `SELECT COUNT(*) AS row_count FROM ${tableName}`
    ).first<{ row_count: number }>();
    return Number(row?.row_count ?? 0) >= 0;
  } catch {
    return false;
  }
}

async function buildProductionReadiness(
  c: Context<{ Bindings: Bindings }>
): Promise<ReadinessResult> {
  const stripeConfigured = Boolean(c.env.STRIPE_SECRET_KEY?.trim() && c.env.STRIPE_WEBHOOK_SECRET?.trim());
  const manualPaymentConfigured = Boolean(
    c.env.MANUAL_PAYMENT_ADMIN_TOKEN?.trim() && c.env.BKASH_MERCHANT_NUMBER?.trim()
  );
  const checks: ReadinessCheck[] = [
    {
      action: "Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_ACCESS_TOKEN with wrangler secret put.",
      key: "admin_credentials",
      label: "Admin email/password access",
      ok: Boolean(getAdminEmail(c) && getAdminPassword(c) && getAdminToken(c)),
      severity: "error",
    },
    {
      action: "Set GOOGLE_CLIENT_ID and PUBLIC_GOOGLE_CLIENT_ID to the Google Web OAuth client ID.",
      key: "google_gis",
      label: "Google GIS tenant signup",
      ok: Boolean(c.env.PUBLIC_GOOGLE_CLIENT_ID?.trim() || c.env.GOOGLE_CLIENT_ID?.trim()),
      severity: "error",
    },
    {
      action: "Configure Stripe secrets or manual bKash merchant/admin review secrets.",
      key: "payment_collection",
      label: "Payment collection",
      ok: stripeConfigured || manualPaymentConfigured,
      severity: "error",
    },
    {
      action: "Bind R2_ASSETS and optionally set R2_PUBLIC_BASE_URL.",
      key: "r2_assets",
      label: "Tenant logo asset storage",
      ok: Boolean(c.env.R2_ASSETS),
      severity: "error",
    },
    {
      action: "Set RELAY_WEBSOCKET_URL and RELAY_AUTH_SECRET for managed broadcast relay.",
      key: "managed_relay",
      label: "Managed broadcast relay",
      ok: Boolean(c.env.RELAY_WEBSOCKET_URL?.trim() && c.env.RELAY_AUTH_SECRET?.trim()),
      severity: "error",
    },
    {
      action: "Set CF_CALLS_APP_ID and CF_CALLS_APP_TOKEN for Cloudflare Realtime SFU.",
      key: "cloudflare_calls",
      label: "Cloudflare Realtime SFU",
      ok: Boolean(c.env.CF_CALLS_APP_ID?.trim() && c.env.CF_CALLS_APP_TOKEN?.trim()),
      severity: "error",
    },
    {
      action: "Run all D1 migrations through 0011_packages_google_assets_admin.sql.",
      key: "packages_table",
      label: "Package catalog migration",
      ok: await hasMigratedTable(c, "packages"),
      severity: "error",
    },
    {
      action: "Run D1 migration 0011 so room_assets exists for tenant logo history.",
      key: "room_assets_table",
      label: "Room assets migration",
      ok: await hasMigratedTable(c, "room_assets"),
      severity: "error",
    },
    {
      action: "Run D1 migration 0012 so admin actions are retained for operational audits.",
      key: "admin_audit_logs_table",
      label: "Admin audit log migration",
      ok: await hasMigratedTable(c, "admin_audit_logs"),
      severity: "error",
    },
  ];

  return {
    checks,
    ready: checks.every((check) => check.ok || check.severity === "warning"),
  };
}

async function recordAdminAudit(
  c: Context<{ Bindings: Bindings }>,
  input: {
    action: string;
    metadata?: Record<string, boolean | number | string | null>;
    targetId: string;
    targetType: string;
  }
): Promise<void> {
  try {
    await c.env.DB.prepare(
      `INSERT INTO admin_audit_logs (
        id,
        actor_email,
        action,
        target_type,
        target_id,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      createPublicId("audit"),
      getAdminEmail(c) || null,
      input.action,
      input.targetType,
      input.targetId,
      JSON.stringify(input.metadata ?? {})
    ).run();
  } catch {
    // Older databases may not have the audit table yet. Readiness checks surface that gap.
  }
}

function normalizeOutputUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();

  if (trimmed.startsWith("srt://")) {
    return trimmed;
  }

  if (trimmed.startsWith("rtmps://")) {
    return `rtmp://${trimmed.slice("rtmps://".length)}`;
  }

  return trimmed;
}

function getStreamBindings(c: Context<{ Bindings: Bindings }>) {
  const accountId = c.env.CF_ACCOUNT_ID;
  const apiToken = c.env.CF_STREAM_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new HTTPException(500, {
      message:
        "Cloudflare Stream credentials not configured. Set CF_ACCOUNT_ID and CF_STREAM_API_TOKEN via wrangler secret put.",
    });
  }

  return { accountId, apiToken };
}

async function getRoomById(c: Context<{ Bindings: Bindings }>, roomId: string): Promise<RoomRecord> {
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE id = ?").bind(roomId).first<RoomRecord>();
  if (!room) {
    throw new HTTPException(404, { message: "Room not found" });
  }
  if (!isRoomVerifiable(room)) {
    throw new HTTPException(403, { message: getRoomUnavailableMessage(room) });
  }
  if (!room.scoring_token) {
    const scoringToken = crypto.randomUUID().replaceAll("-", "");
    await c.env.DB.prepare("UPDATE rooms SET scoring_token = ? WHERE id = ?")
      .bind(scoringToken, roomId)
      .run();
    room.scoring_token = scoringToken;
  }
  return room;
}

async function ensureOverlayRow(c: Context<{ Bindings: Bindings }>, roomId: string): Promise<void> {
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO overlays (
      room_id,
      left_logo_url,
      right_logo_url,
      ticker_text,
      ticker_active,
      sponsor_text,
      match_status,
      clock_text,
      external_scoreboard_url,
      theme_variant,
      sport,
      team1_name,
      team2_name,
      team1_score,
      team2_score,
      scoreboard_active,
      program_source,
      scoring_data
    ) VALUES (?, '', '', '', 0, '', 'LIVE', '00:00', '', 'broadcast', 'football', 'TEAM A', 'TEAM B', 0, 0, 0, 'live', '{}')`
  ).bind(roomId).run();
}

function getBroadcastDestinations(room: RoomRecord): BroadcastDestinationRecord[] {
  return DEFAULT_BROADCAST_DESTINATIONS.map((destination) => {
    if (destination.key === "youtube") {
      return {
        ...destination,
        rtmpUrl: room.youtube_output_url ?? destination.rtmpUrl,
        streamKey: room.youtube_stream_key ?? "",
      };
    }

    return {
      ...destination,
      rtmpUrl: room.facebook_output_url ?? destination.rtmpUrl,
      streamKey: room.facebook_stream_key ?? "",
    };
  });
}

function normalizeOverlayRecord(overlay: OverlayRecord) {
  const parsedScoringData = overlay.scoring_data ? JSON.parse(overlay.scoring_data) : {};

  return {
    ad_title: overlay.ad_title ?? "",
    ad_video_url: overlay.ad_video_url ?? "",
    clock_text: overlay.clock_text ?? "00:00",
    external_scoreboard_url: normalizeExternalUrl(overlay.external_scoreboard_url),
    left_logo_url: overlay.left_logo_url ?? overlay.logo_url ?? "",
    logo_url: overlay.logo_url ?? "",
    match_status: overlay.match_status ?? "LIVE",
    program_source: overlay.program_source === "ad" ? "ad" : "live",
    right_logo_url: overlay.right_logo_url ?? overlay.logo_url ?? "",
    room_id: overlay.room_id,
    scoreboard_active: overlay.scoreboard_active ?? 0,
    scoring_data: typeof parsedScoringData === "object" && parsedScoringData ? parsedScoringData : {},
    sponsor_text: overlay.sponsor_text ?? "",
    sport:
      overlay.sport === "cricket" || overlay.sport === "generic" ? overlay.sport : "football",
    team1_name: overlay.team1_name ?? "TEAM A",
    team1_score: overlay.team1_score ?? 0,
    team2_name: overlay.team2_name ?? "TEAM B",
    team2_score: overlay.team2_score ?? 0,
    theme_variant:
      overlay.theme_variant === "arena" || overlay.theme_variant === "classic"
        ? overlay.theme_variant
        : "broadcast",
    ticker_active: overlay.ticker_active ?? 0,
    ticker_text: overlay.ticker_text ?? "",
    updated_at: overlay.updated_at ?? null,
  };
}

// Create a Hono instance structured with /api basepath
const app = new Hono<{ Bindings: Bindings }>().basePath("/api");

// Global API error handler
app.onError(async (err, c) => {
  console.error(`[API ERROR] ${err.message}`, err);
  if (err instanceof HTTPException) {
    return c.json(
      {
        success: false,
        error: err.message,
        message: err.message,
      },
      err.status
    );
  }
  return c.json(
    {
      success: false,
      error: "Internal Server Error",
      message: "Internal Server Error",
    },
    500
  );
});

// ═══════════════════════════════════════
// Room Management
// ═══════════════════════════════════════

/** List all active rooms */
app.get("/rooms", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM rooms").all<RoomRecord>();
  return jsonSuccess(c, { rooms: (results ?? []).map(toRoomSummary) });
});

/** Verify Room PIN */
app.post("/rooms/verify", async (c) => {
  const body = await c.req.json<{ pin?: string }>();
  if (!body.pin || typeof body.pin !== "string") {
    throw new HTTPException(400, { message: "PIN is required" });
  }

  const room = await c.env.DB.prepare(
    "SELECT * FROM rooms WHERE pin = ?"
  ).bind(body.pin).first<RoomRecord>();

  if (!room) {
    throw new HTTPException(404, { message: "Invalid PIN or Room not found" });
  }
  if (!isRoomJoinable(room)) {
    throw new HTTPException(403, { message: getRoomUnavailableMessage(room) });
  }
  if (!room.scoring_token) {
    room.scoring_token = crypto.randomUUID().replaceAll("-", "");
    await c.env.DB.prepare("UPDATE rooms SET scoring_token = ? WHERE id = ?")
      .bind(room.scoring_token, room.id)
      .run();
  }
  return jsonSuccess(c, { room: toRoomSummary(room) });
});

// ═══════════════════════════════════════
// Versioned room pass checkout
// ═══════════════════════════════════════

app.get("/v1/auth-config", (c) => {
  return jsonSuccess(c, {
    googleClientId: c.env.PUBLIC_GOOGLE_CLIENT_ID?.trim() || c.env.GOOGLE_CLIENT_ID?.trim() || null,
  });
});

app.post("/v1/auth/google", async (c) => {
  const body = await c.req
    .json<{ credential?: string }>()
    .catch((): { credential?: string } => ({}));
  const credential = body.credential?.trim() ?? "";
  if (!credential) {
    throw new HTTPException(400, { message: "Google credential is required" });
  }

  const payload = await verifyGoogleCredential(c, credential);
  const tenant = await findOrCreateGoogleTenant(c, payload);
  return jsonSuccess(c, { account: toPublicAccount(tenant, true) });
});

app.post("/v1/admin/login", async (c) => {
  const expectedToken = getAdminToken(c);
  const expectedEmail = getAdminEmail(c);
  const expectedPassword = getAdminPassword(c);
  if (!expectedToken || !expectedEmail || !expectedPassword) {
    throw new HTTPException(503, { message: "Admin email/password access is not configured" });
  }

  const body = await c.req
    .json<{ email?: string; password?: string }>()
    .catch((): { email?: string; password?: string } => ({}));
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password?.trim() ?? "";
  if (email !== expectedEmail || password !== expectedPassword) {
    throw new HTTPException(401, { message: "Admin email or password is invalid" });
  }

  setCookie(c, ADMIN_SESSION_COOKIE, expectedToken, {
    httpOnly: true,
    maxAge: ADMIN_SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
  });

  return jsonSuccess(c, {
    account: {
      email: expectedEmail,
    },
  });
});

app.post("/v1/admin/logout", (c) => {
  deleteCookie(c, ADMIN_SESSION_COOKIE, {
    path: "/",
    secure: new URL(c.req.url).protocol === "https:",
  });

  return jsonSuccess(c, { loggedOut: true });
});

app.get("/v1/packages", async (c) => {
  const packages = getActivePackages(await getPackageCatalog(c));
  return jsonSuccess(c, { packages });
});

app.post("/v1/accounts", async (c) => {
  const body = await c.req
    .json<{ email?: string; name?: string; phone?: string }>()
    .catch((): { email?: string; name?: string; phone?: string } => ({}));
  const email = body.email?.trim().toLowerCase() ?? "";
  const name = body.name?.trim() || email;
  const phone = normalizePhone(body.phone);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HTTPException(400, { message: "A valid email is required" });
  }

  assertBangladeshPhone(phone, "Phone number");

  const tenantId = createPublicId("tenant");
  const accessToken = createPublicId("acct");
  await c.env.DB.prepare(
    "INSERT INTO tenants (id, email, name, phone, access_token, auth_provider) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(tenantId, email, name, phone, accessToken, "email").run();

  return jsonSuccess(c, {
    account: toPublicAccount({
      access_token: accessToken,
      auth_provider: "email",
      email,
      id: tenantId,
      name,
      phone,
    }, true),
  });
});

app.get("/v1/accounts/me", async (c) => {
  const accessToken = c.req.query("access_token")?.trim() ?? "";
  const tenant = await getTenantByAccessToken(c, accessToken);
  const [roomsResult, passesResult] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM rooms WHERE tenant_id = ? ORDER BY created_at DESC")
      .bind(tenant.id)
      .all<RoomRecord>(),
    c.env.DB.prepare("SELECT * FROM room_passes WHERE tenant_id = ? ORDER BY created_at DESC")
      .bind(tenant.id)
      .all<RoomPassRecord>(),
  ]);

  return jsonSuccess(c, {
    account: toPublicAccount(tenant),
    passes: passesResult.results ?? [],
    rooms: (roomsResult.results ?? []).map(toRoomSummary),
  });
});

app.get("/v1/admin/summary", async (c) => {
  assertAdminRequest(c);

  const [roomsResult, tenantsResult, passesResult, auditResult, packages, readiness] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM rooms ORDER BY created_at DESC").all<RoomRecord>(),
    c.env.DB.prepare("SELECT * FROM tenants ORDER BY created_at DESC").all<TenantRecord>(),
    c.env.DB.prepare("SELECT * FROM room_passes ORDER BY created_at DESC").all<RoomPassRecord>(),
    c.env.DB.prepare("SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 25").all<AdminAuditRecord>()
      .catch((): { results: AdminAuditRecord[] } => ({ results: [] })),
    getPackageCatalog(c),
    buildProductionReadiness(c),
  ]);
  const rooms = (roomsResult.results ?? []).map(toRoomSummary);
  const tenants = tenantsResult.results ?? [];
  const roomPasses = passesResult.results ?? [];

  return jsonSuccess(c, {
    auditLogs: auditResult.results ?? [],
    packages,
    readiness,
    roomPasses,
    rooms,
    summary: {
      activeRooms: rooms.filter((room) => room.status === "active" && isRoomJoinable(room)).length,
      paidPurchases: roomPasses.filter((pass) => pass.status === "paid").length,
      pendingManualReviews: roomPasses.filter((pass) => pass.status === "pending_manual_review").length,
      pendingPayments: roomPasses.filter((pass) => pass.status === "pending_payment").length,
      roomPasses: roomPasses.length,
      rooms: rooms.length,
      tenants: tenants.length,
    },
    tenants: tenants.map((tenant) => toPublicAccount(tenant)),
  });
});

app.patch("/v1/admin/packages/:id", async (c) => {
  assertAdminRequest(c);
  const packageId = c.req.param("id");
  const body = await c.req
    .json<PackagePatchBody>()
    .catch((): PackagePatchBody => ({}));
  const packages = await getPackageCatalog(c);
  const currentPackage = packages.find((item) => item.id === packageId);
  if (!currentPackage) {
    throw new HTTPException(404, { message: "Package not found" });
  }

  const nextPackage: PackageRecord = {
    ...currentPackage,
    active: body.active === 0 ? 0 : body.active === 1 ? 1 : currentPackage.active,
    description: typeof body.description === "string" ? body.description.trim() : currentPackage.description,
    duration_minutes:
      Number.isInteger(body.duration_minutes) && Number(body.duration_minutes) > 0
        ? Number(body.duration_minutes)
        : currentPackage.duration_minutes,
    features: Array.isArray(body.features)
      ? body.features.filter((item: string): item is string => item.trim().length > 0)
      : currentPackage.features,
    max_cameras:
      Number.isInteger(body.max_cameras) && Number(body.max_cameras) > 0
        ? Number(body.max_cameras)
        : currentPackage.max_cameras,
    max_rooms:
      Number.isInteger(body.max_rooms) && Number(body.max_rooms) > 0
        ? Number(body.max_rooms)
        : currentPackage.max_rooms,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : currentPackage.name,
    price_cents:
      Number.isInteger(body.price_cents) && Number(body.price_cents) >= 0
        ? Number(body.price_cents)
        : currentPackage.price_cents,
    sort_order:
      Number.isInteger(body.sort_order) && Number(body.sort_order) >= 0
        ? Number(body.sort_order)
        : currentPackage.sort_order,
  };

  await c.env.DB.prepare(
    `INSERT INTO packages (
      id,
      name,
      description,
      price_cents,
      currency,
      duration_minutes,
      max_rooms,
      max_cameras,
      active,
      sort_order,
      features_json,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      price_cents = excluded.price_cents,
      currency = excluded.currency,
      duration_minutes = excluded.duration_minutes,
      max_rooms = excluded.max_rooms,
      max_cameras = excluded.max_cameras,
      active = excluded.active,
      sort_order = excluded.sort_order,
      features_json = excluded.features_json,
      updated_at = CURRENT_TIMESTAMP`
  ).bind(
    nextPackage.id,
    nextPackage.name,
    nextPackage.description,
    nextPackage.price_cents,
    nextPackage.currency,
    nextPackage.duration_minutes,
    nextPackage.max_rooms,
    nextPackage.max_cameras,
    nextPackage.active,
    nextPackage.sort_order,
    JSON.stringify(nextPackage.features)
  ).run();

  await recordAdminAudit(c, {
    action: "package_update",
    metadata: {
      active: nextPackage.active,
      max_cameras: nextPackage.max_cameras,
      max_rooms: nextPackage.max_rooms,
      price_cents: nextPackage.price_cents,
      sort_order: nextPackage.sort_order,
    },
    targetId: nextPackage.id,
    targetType: "package",
  });

  return jsonSuccess(c, { package: nextPackage });
});

app.post("/v1/admin/room-passes/:id/approve", async (c) => {
  assertAdminRequest(c);
  const roomPassId = c.req.param("id");
  const room = await activateRoomPassById(c, roomPassId);
  await recordAdminAudit(c, {
    action: "room_pass_approve",
    targetId: roomPassId,
    targetType: "room_pass",
  });
  return jsonSuccess(c, { room: toRoomSummary(room) });
});

app.post("/v1/admin/room-passes/:id/reject", async (c) => {
  assertAdminRequest(c);
  const roomPassId = c.req.param("id");
  const roomPass = await c.env.DB.prepare(
    "SELECT * FROM room_passes WHERE id = ?"
  ).bind(roomPassId).first<RoomPassRecord>();

  if (!roomPass) {
    throw new HTTPException(404, { message: "Room pass not found" });
  }

  await c.env.DB.prepare(
    "UPDATE room_passes SET status = 'rejected' WHERE id = ?"
  ).bind(roomPassId).run();
  await c.env.DB.prepare(
    "UPDATE rooms SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(roomPass.room_id).run();

  await recordAdminAudit(c, {
    action: "room_pass_reject",
    targetId: roomPassId,
    targetType: "room_pass",
  });

  return jsonSuccess(c, { rejected: true });
});

app.post("/v1/admin/rooms/:id/start", async (c) => {
  assertAdminRequest(c);
  const roomId = c.req.param("id");
  const room = await startRoomSession(c, roomId);
  await recordAdminAudit(c, {
    action: "room_start",
    targetId: roomId,
    targetType: "room",
  });
  return jsonSuccess(c, { room: toRoomSummary(room) });
});

app.post("/v1/admin/rooms/:id/expire", async (c) => {
  assertAdminRequest(c);
  const roomId = c.req.param("id");
  const room = await expireRoomAccessNow(c, roomId);
  await recordAdminAudit(c, {
    action: "room_expire",
    targetId: roomId,
    targetType: "room",
  });
  return jsonSuccess(c, { room: toRoomSummary(room) });
});

app.get("/v1/payment-config", (c) => {
  return jsonSuccess(c, {
    bkashMerchantNumber: getBkashMerchantNumber(c),
    durationMinutes: ROOM_PASS_DURATION_MINUTES,
    manualAmountCents: getRoomPassPriceCents(c),
    manualCurrency: MANUAL_ROOM_PASS_CURRENCY,
  });
});

app.post("/v1/manual-room-passes", async (c) => {
  const body = await c.req
    .json<{
      accessToken?: string;
      bkashSenderNumber?: string;
      bkashTransactionId?: string;
      packageId?: string;
      roomName?: string;
    }>()
    .catch(
      (): {
        accessToken?: string;
        bkashSenderNumber?: string;
        bkashTransactionId?: string;
        packageId?: string;
        roomName?: string;
      } => ({})
    );
  const tenant = await getTenantByAccessToken(c, body.accessToken?.trim() ?? "");
  const selectedPackage = await getSelectedPackage(c, body.packageId);
  const roomName = body.roomName?.trim() || "Live Match Room";
  const bkashSenderNumber = normalizePhone(body.bkashSenderNumber);
  const bkashTransactionId = body.bkashTransactionId?.trim().toUpperCase() ?? "";

  if (roomName.length < 3 || roomName.length > 80) {
    throw new HTTPException(400, { message: "Room name must be between 3 and 80 characters" });
  }

  assertBangladeshPhone(bkashSenderNumber, "bKash sender number");

  if (!/^[A-Z0-9]{6,32}$/.test(bkashTransactionId)) {
    throw new HTTPException(400, { message: "A valid bKash transaction ID is required" });
  }

  const roomId = createPublicId("room");
  const orderId = createPublicId("pass");
  const pin = createRoomPin();
  const amountCents = selectedPackage.price_cents || getRoomPassPriceCents(c);

  await c.env.DB.prepare(
    `INSERT INTO rooms (
      id,
      name,
      pin,
      tenant_id,
      customer_email,
      status,
      checkout_session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    roomId,
    roomName,
    pin,
    tenant.id,
    tenant.email,
    "pending_manual_review",
    null
  ).run();

  await c.env.DB.prepare(
    `INSERT INTO room_passes (
      id,
      tenant_id,
      room_id,
      checkout_session_id,
      status,
      amount_cents,
      currency,
      duration_minutes,
      payment_provider,
      bkash_sender_number,
      bkash_transaction_id,
      package_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    orderId,
    tenant.id,
    roomId,
    null,
    "pending_manual_review",
    amountCents,
    MANUAL_ROOM_PASS_CURRENCY,
    selectedPackage.duration_minutes,
    "bkash_manual",
    bkashSenderNumber,
    bkashTransactionId,
    selectedPackage.id
  ).run();

  await ensureOverlayRow(c, roomId);

  return jsonSuccess(c, {
    payment: {
      amountCents,
      bkashMerchantNumber: getBkashMerchantNumber(c),
      id: orderId,
      status: "pending_manual_review",
    },
    room: {
      id: roomId,
      name: roomName,
      pin,
      status: "pending_manual_review",
      tenant_id: tenant.id,
    },
  });
});

app.post("/v1/manual-room-passes/:id/approve", async (c) => {
  const expectedToken = c.env.MANUAL_PAYMENT_ADMIN_TOKEN;
  if (!expectedToken) {
    throw new HTTPException(503, { message: "Manual payment approval is not configured" });
  }

  const authHeader = c.req.header("Authorization") ?? "";
  const providedToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (providedToken !== expectedToken) {
    throw new HTTPException(401, { message: "Manual payment approval token is invalid" });
  }

  const room = await activateRoomPassById(c, c.req.param("id"));
  return jsonSuccess(c, { room: toRoomSummary(room) });
});

app.post("/v1/rooms/:id/start", async (c) => {
  const room = await startRoomSession(c, c.req.param("id"));
  return jsonSuccess(c, { room: toRoomSummary(room) });
});

app.post("/v1/room-passes/checkout", async (c) => {
  const body = await c.req
    .json<{ accessToken?: string; customerEmail?: string; packageId?: string; roomName?: string }>()
    .catch((): { accessToken?: string; customerEmail?: string; packageId?: string; roomName?: string } => ({}));
  const selectedPackage = await getSelectedPackage(c, body.packageId);
  const accessToken = body.accessToken?.trim() ?? "";
  const tenant = accessToken ? await getTenantByAccessToken(c, accessToken) : null;
  const customerEmail = tenant?.email ?? body.customerEmail?.trim().toLowerCase() ?? "";
  const roomName = body.roomName?.trim() || "Live Match Room";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw new HTTPException(400, { message: "Sign in or provide a valid customer email before checkout" });
  }

  if (roomName.length < 3 || roomName.length > 80) {
    throw new HTTPException(400, { message: "Room name must be between 3 and 80 characters" });
  }

  const tenantId = tenant?.id ?? createPublicId("tenant");
  const roomId = createPublicId("room");
  const orderId = createPublicId("pass");
  const pin = createRoomPin();
  const amountCents = selectedPackage.price_cents || getRoomPassPriceCents(c);

  const session = await createStripeCheckoutSession({
    amountCents,
    c,
    customerEmail,
    durationMinutes: selectedPackage.duration_minutes,
    orderId,
    packageId: selectedPackage.id,
    packageName: selectedPackage.name,
    roomId,
    roomName,
    tenantId,
  });

  if (!session.url) {
    throw new HTTPException(502, { message: "Stripe did not return a checkout URL" });
  }

  if (!tenant) {
    await c.env.DB.prepare(
      "INSERT INTO tenants (id, email, name, access_token, auth_provider) VALUES (?, ?, ?, ?, ?)"
    ).bind(tenantId, customerEmail, customerEmail, createPublicId("acct"), "email").run();
  }

  await c.env.DB.prepare(
    `INSERT INTO rooms (
      id,
      name,
      pin,
      tenant_id,
      customer_email,
      status,
      checkout_session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(roomId, roomName, pin, tenantId, customerEmail, "pending_payment", session.id).run();

  await c.env.DB.prepare(
    `INSERT INTO room_passes (
      id,
      tenant_id,
      room_id,
      checkout_session_id,
      status,
      amount_cents,
      currency,
      duration_minutes
      ,
      payment_provider,
      bkash_sender_number,
      bkash_transaction_id,
      package_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    orderId,
    tenantId,
    roomId,
    session.id,
    "pending_payment",
    amountCents,
    ROOM_PASS_CURRENCY,
    selectedPackage.duration_minutes,
    "stripe",
    null,
    null,
    selectedPackage.id
  ).run();

  await ensureOverlayRow(c, roomId);

  return jsonSuccess(c, {
    checkoutUrl: session.url,
    durationMinutes: selectedPackage.duration_minutes,
    room: {
      id: roomId,
      name: roomName,
      pin,
      status: "pending_payment",
      tenant_id: tenantId,
    },
  });
});

app.get("/v1/room-passes/confirm", async (c) => {
  const sessionId = c.req.query("session_id")?.trim() ?? "";
  if (!sessionId) {
    throw new HTTPException(400, { message: "session_id is required" });
  }

  const session = await retrieveStripeCheckoutSession(c, sessionId);
  if (session.payment_status !== "paid") {
    throw new HTTPException(402, { message: "Checkout session is not paid yet" });
  }

  const room = await activatePaidRoom(c, sessionId);
  return jsonSuccess(c, { room: toRoomSummary(room) });
});

app.post("/v1/stripe/webhook", async (c) => {
  const payload = await c.req.text();
  const verified = await verifyStripeWebhookSignature(
    payload,
    c.req.header("Stripe-Signature") ?? null,
    c.env.STRIPE_WEBHOOK_SECRET
  );

  if (!verified) {
    throw new HTTPException(400, { message: "Invalid Stripe webhook signature" });
  }

  const event = JSON.parse(payload) as {
    type?: string;
    data?: { object?: StripeCheckoutSession };
  };

  if (
    event.type === "checkout.session.completed" &&
    event.data?.object?.id &&
    event.data.object.payment_status === "paid"
  ) {
    await activatePaidRoom(c, event.data.object.id);
  }

  return jsonSuccess(c, { received: true });
});

// ═══════════════════════════════════════
// Room broadcast destination persistence
// ═══════════════════════════════════════

app.get("/realtime/rooms/:id", async (c) => {
  const roomId = c.req.param("id");
  const room = await getRoomById(c, roomId);
  return jsonSuccess(c, { room: toRoomSummary(room) });
});

app.get("/realtime/rooms/:id/broadcast-config", async (c) => {
  const roomId = c.req.param("id");
  const room = await getRoomById(c, roomId);
  return jsonSuccess(c, { destinations: getBroadcastDestinations(room) });
});

app.post("/realtime/rooms/:id/broadcast-config", async (c) => {
  const roomId = c.req.param("id");
  await getRoomById(c, roomId);

  const body = await c.req
    .json<{ destinations?: Array<{ key?: string; rtmpUrl?: string; streamKey?: string }> }>()
    .catch(() => ({ destinations: [] }));

  const destinations = body.destinations ?? [];
  const youtube = destinations.find((destination) => destination.key === "youtube");
  const facebook = destinations.find((destination) => destination.key === "facebook");

  await c.env.DB.prepare(
    `UPDATE rooms
      SET youtube_output_url = ?,
          youtube_stream_key = ?,
          facebook_output_url = ?,
          facebook_stream_key = ?
      WHERE id = ?`
  )
    .bind(
      youtube?.rtmpUrl?.trim() || DEFAULT_BROADCAST_DESTINATIONS[0].rtmpUrl,
      youtube?.streamKey?.trim() || null,
      facebook?.rtmpUrl?.trim() || DEFAULT_BROADCAST_DESTINATIONS[1].rtmpUrl,
      facebook?.streamKey?.trim() || null,
      roomId
    )
    .run();

  const room = await getRoomById(c, roomId);
  return jsonSuccess(c, { destinations: getBroadcastDestinations(room) });
});

app.get("/v1/rooms/:id/relay-config", async (c) => {
  const roomId = c.req.param("id");
  await getRoomById(c, roomId);

  const baseUrl = c.env.RELAY_WEBSOCKET_URL?.trim();
  const secret = c.env.RELAY_AUTH_SECRET?.trim();
  if (!baseUrl || !secret) {
    throw new HTTPException(503, { message: "Managed relay is not configured" });
  }

  const expiresAtMs = Date.now() + RELAY_TOKEN_TTL_MS;
  const token = await signRelayToken(roomId, expiresAtMs, secret);
  return jsonSuccess(c, {
    relay: {
      expiresAt: new Date(expiresAtMs).toISOString(),
      managed: true,
      websocketUrl: buildRelayWebSocketUrl(baseUrl, token),
    },
  });
});

// ═══════════════════════════════════════
// Camera Track Registry
// ═══════════════════════════════════════

/** Save a camera track when a camera joins via SFU */
app.post("/rooms/:id/cameras", async (c) => {
  const roomId = c.req.param("id");
  await getRoomById(c, roomId);
  const body = await c.req.json<{
    id?: string;
    trackName?: string;
    videoTrackName?: string;
    audioTrackName?: string | null;
    sessionId?: string;
  }>();

  const videoTrackName = body.videoTrackName ?? body.trackName;

  if (!body.id || !videoTrackName || !body.sessionId) {
    throw new HTTPException(400, { message: "id, videoTrackName, and sessionId are required" });
  }

  await assertRoomCameraCapacity(c, roomId, body.id);

  await c.env.DB.prepare(
    "INSERT OR REPLACE INTO cameras (id, room_id, track_id, audio_track_id, session_id, is_active, last_seen_at) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)"
  ).bind(body.id, roomId, videoTrackName, body.audioTrackName ?? null, body.sessionId).run();

  return jsonSuccess(c, { saved: true });
});

/** Camera heartbeat to keep a registry entry fresh */
app.put("/rooms/:roomId/cameras/:camId/heartbeat", async (c) => {
  const roomId = c.req.param("roomId");
  const camId = c.req.param("camId");
  await getRoomById(c, roomId);

  await c.env.DB.prepare(
    "UPDATE cameras SET last_seen_at = CURRENT_TIMESTAMP, is_active = 1 WHERE id = ? AND room_id = ?"
  ).bind(camId, roomId).run();

  return jsonSuccess(c, { heartbeat: true });
});

/** Get active cameras for a room */
app.get("/rooms/:id/cameras", async (c) => {
  const roomId = c.req.param("id");
  await getRoomById(c, roomId);
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM cameras WHERE room_id = ? AND is_active = 1 AND last_seen_at >= datetime('now', '-300 seconds') ORDER BY last_seen_at DESC"
  ).bind(roomId).all();

  return jsonSuccess(c, { cameras: results ?? [] });
});

/** Mark a camera as inactive (disconnect cleanup) */
app.delete("/rooms/:roomId/cameras/:camId", async (c) => {
  const roomId = c.req.param("roomId");
  const camId = c.req.param("camId");
  await getRoomById(c, roomId);

  await c.env.DB.prepare(
    "UPDATE cameras SET is_active = 0 WHERE id = ? AND room_id = ?"
  ).bind(camId, roomId).run();

  return jsonSuccess(c, { removed: true });
});

// ═══════════════════════════════════════
// Overlay & Graphics Persistence
// ═══════════════════════════════════════

/** Get overlay configuration for a room */
app.get("/rooms/:id/overlays", async (c) => {
  const roomId = c.req.param("id");
  const overlay = await c.env.DB.prepare(
    "SELECT * FROM overlays WHERE room_id = ?"
  ).bind(roomId).first<OverlayRecord>();

  if (!overlay) {
    await ensureOverlayRow(c, roomId);

    return jsonSuccess(
      c,
      normalizeOverlayRecord({
        room_id: roomId,
        scoreboard_active: 0,
        scoring_data: "{}",
        team1_name: "TEAM A",
        team1_score: 0,
        team2_name: "TEAM B",
        team2_score: 0,
      })
    );
  }

  return jsonSuccess(c, normalizeOverlayRecord(overlay));
});

/** Update overlay configuration (Score, Team Names, Logo) */
app.post("/rooms/:id/overlays", async (c) => {
  const roomId = c.req.param("id");
  const body = await c.req.json<{
    ad_title?: string;
    ad_video_url?: string;
    clock_text?: string;
    external_scoreboard_url?: string;
    left_logo_url?: string;
    team1_name?: string;
    team2_name?: string;
    team1_score?: number;
    team2_score?: number;
    ticker_active?: number;
    ticker_text?: string;
    sport?: string;
    match_status?: string;
    sponsor_text?: string;
    theme_variant?: string;
    right_logo_url?: string;
    program_source?: string;
    scoreboard_active?: number;
    logo_url?: string;
    scoring_data?: Record<string, number | string>;
  }>();

  const updates: string[] = [];
  const params: OverlayUpdateValue[] = [];

  const fieldMap: Record<
    | "ad_title"
    | "ad_video_url"
    | "clock_text"
    | "external_scoreboard_url"
    | "left_logo_url"
    | "team1_name"
    | "team2_name"
    | "team1_score"
    | "team2_score"
    | "ticker_active"
    | "ticker_text"
    | "sport"
    | "match_status"
    | "sponsor_text"
    | "theme_variant"
    | "right_logo_url"
    | "program_source"
    | "scoreboard_active"
    | "logo_url",
    string
  > = {
    ad_title: "ad_title",
    ad_video_url: "ad_video_url",
    clock_text: "clock_text",
    external_scoreboard_url: "external_scoreboard_url",
    left_logo_url: "left_logo_url",
    team1_name: "team1_name",
    team2_name: "team2_name",
    team1_score: "team1_score",
    team2_score: "team2_score",
    ticker_active: "ticker_active",
    ticker_text: "ticker_text",
    sport: "sport",
    match_status: "match_status",
    sponsor_text: "sponsor_text",
    theme_variant: "theme_variant",
    right_logo_url: "right_logo_url",
    program_source: "program_source",
    scoreboard_active: "scoreboard_active",
    logo_url: "logo_url",
  };

  for (const [key, dbField] of Object.entries(fieldMap) as Array<[keyof typeof fieldMap, string]>) {
    const value = body[key];
    if (value !== undefined) {
      updates.push(`${dbField} = ?`);
      params.push(key === "external_scoreboard_url" ? normalizeExternalUrl(String(value)) : value);
    }
  }

  if (body.scoring_data !== undefined) {
    updates.push("scoring_data = ?");
    params.push(JSON.stringify(body.scoring_data));
  }

  if (updates.length === 0) {
    return jsonSuccess(c, { updated: false, message: "No fields to update" });
  }

  await ensureOverlayRow(c, roomId);
  params.push(roomId);
  await c.env.DB.prepare(
    `UPDATE overlays SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE room_id = ?`
  ).bind(...params).run();

  return jsonSuccess(c, { updated: true });
});

app.post("/v1/rooms/:id/assets", async (c) => {
  const roomId = c.req.param("id");
  const room = await getRoomById(c, roomId);
  const formData = await c.req.formData();
  const field = assertAssetOverlayField(formData.get("field"));
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new HTTPException(400, { message: "A compressed logo file is required" });
  }

  if (!file.type.startsWith("image/")) {
    throw new HTTPException(400, { message: "Logo upload must be an image" });
  }

  if (file.size <= 0 || file.size > MAX_LOGO_UPLOAD_BYTES) {
    throw new HTTPException(400, { message: "Logo image must be smaller than 1.2 MB after compression" });
  }

  const assetId = createPublicId("asset");
  const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
  const r2Key = `rooms/${roomId}/${field}/${assetId}.${extension}`;
  const publicUrl = buildAssetPublicUrl(c, r2Key);
  const currentAsset = await getCurrentRoomAsset(c, roomId, field);

  await getR2AssetsBucket(c).put(r2Key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || "image/webp",
    },
    customMetadata: {
      field,
      roomId,
      tenantId: room.tenant_id ?? "",
    },
  });

  await clearRoomAsset(c, currentAsset);
  await ensureOverlayRow(c, roomId);
  await c.env.DB.prepare(
    `INSERT INTO room_assets (
      id,
      tenant_id,
      room_id,
      overlay_field,
      r2_key,
      public_url,
      content_type,
      size_bytes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    assetId,
    room.tenant_id ?? null,
    roomId,
    field,
    r2Key,
    publicUrl,
    file.type || "image/webp",
    file.size
  ).run();
  await c.env.DB.prepare(
    `UPDATE overlays SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE room_id = ?`
  ).bind(publicUrl, roomId).run();

  return jsonSuccess(c, {
    asset: {
      field,
      id: assetId,
      publicUrl,
      r2Key,
      sizeBytes: file.size,
    },
  });
});

app.delete("/v1/rooms/:id/assets", async (c) => {
  const roomId = c.req.param("id");
  await getRoomById(c, roomId);
  const field = assertAssetOverlayField(c.req.query("field") ?? null);
  const currentAsset = await getCurrentRoomAsset(c, roomId, field);

  await clearRoomAsset(c, currentAsset);
  await ensureOverlayRow(c, roomId);
  await c.env.DB.prepare(
    `UPDATE overlays SET ${field} = NULL, updated_at = CURRENT_TIMESTAMP WHERE room_id = ?`
  ).bind(roomId).run();

  return jsonSuccess(c, { deleted: Boolean(currentAsset), field });
});

app.get("/v1/assets/:encodedKey", async (c) => {
  const key = fromBase64UrlText(c.req.param("encodedKey"));
  const object = await getR2AssetsBucket(c).get(key);
  if (!object) {
    throw new HTTPException(404, { message: "Asset not found" });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
});

app.get("/scoring/:token", async (c) => {
  const token = c.req.param("token");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE scoring_token = ?")
    .bind(token)
    .first<RoomRecord>();

  if (!room) {
    throw new HTTPException(404, { message: "Scoring link not found" });
  }

  const overlay = await c.env.DB.prepare("SELECT * FROM overlays WHERE room_id = ?")
    .bind(room.id)
    .first<OverlayRecord>();

  return jsonSuccess(c, {
    overlay: normalizeOverlayRecord(
      overlay ?? {
        room_id: room.id,
        scoreboard_active: 0,
        scoring_data: "{}",
        team1_name: "TEAM A",
        team1_score: 0,
        team2_name: "TEAM B",
        team2_score: 0,
      }
    ),
    room,
  });
});

app.post("/scoring/:token", async (c) => {
  const token = c.req.param("token");
  const room = await c.env.DB.prepare("SELECT * FROM rooms WHERE scoring_token = ?")
    .bind(token)
    .first<RoomRecord>();

  if (!room) {
    throw new HTTPException(404, { message: "Scoring link not found" });
  }

  const body = await c.req.json<Record<string, number | string | Record<string, number | string>>>();
  const payload = {
    ad_title: typeof body.ad_title === "string" ? body.ad_title : undefined,
    ad_video_url: typeof body.ad_video_url === "string" ? body.ad_video_url : undefined,
    clock_text: typeof body.clock_text === "string" ? body.clock_text : undefined,
    external_scoreboard_url:
      typeof body.external_scoreboard_url === "string" ? body.external_scoreboard_url : undefined,
    left_logo_url: typeof body.left_logo_url === "string" ? body.left_logo_url : undefined,
    logo_url: typeof body.logo_url === "string" ? body.logo_url : undefined,
    match_status: typeof body.match_status === "string" ? body.match_status : undefined,
    program_source: typeof body.program_source === "string" ? body.program_source : undefined,
    right_logo_url: typeof body.right_logo_url === "string" ? body.right_logo_url : undefined,
    scoreboard_active: typeof body.scoreboard_active === "number" ? body.scoreboard_active : undefined,
    scoring_data:
      typeof body.scoring_data === "object" && body.scoring_data ? (body.scoring_data as Record<string, number | string>) : undefined,
    sponsor_text: typeof body.sponsor_text === "string" ? body.sponsor_text : undefined,
    sport: typeof body.sport === "string" ? body.sport : undefined,
    team1_name: typeof body.team1_name === "string" ? body.team1_name : undefined,
    team1_score: typeof body.team1_score === "number" ? body.team1_score : undefined,
    team2_name: typeof body.team2_name === "string" ? body.team2_name : undefined,
    team2_score: typeof body.team2_score === "number" ? body.team2_score : undefined,
    theme_variant: typeof body.theme_variant === "string" ? body.theme_variant : undefined,
    ticker_active: typeof body.ticker_active === "number" ? body.ticker_active : undefined,
    ticker_text: typeof body.ticker_text === "string" ? body.ticker_text : undefined,
  };

  const proxyRequest = new Request(`https://dummy/api/rooms/${room.id}/overlays`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  await app.fetch(proxyRequest, c.env, c.executionCtx);
  return jsonSuccess(c, { updated: true });
});

app.post("/diagnostics", async (c) => {
  const body = await c.req.json<DiagnosticRequest>().catch(() => null);

  if (!body?.scope || !body?.event || !body?.level || !body?.ts) {
    throw new HTTPException(400, { message: "scope, event, level, and ts are required" });
  }

  const detailsText = body.details ? ` ${JSON.stringify(body.details)}` : "";
  console.log(
    `[CLIENT_DIAGNOSTIC] [${body.level.toUpperCase()}] [${body.scope}] ${body.event}${detailsText}`
  );

  return jsonSuccess(c, { accepted: true });
});

app.get("/calls/ice-servers", async (c) => {
  const turnKeyId = c.env.CF_TURN_KEY_ID;
  const turnApiToken = c.env.CF_TURN_API_TOKEN;

  if (!turnKeyId || !turnApiToken) {
    return jsonSuccess(c, { iceServers: DEFAULT_ICE_SERVERS });
  }

  const response = await fetch(
    `${TURN_API_BASE}/keys/${turnKeyId}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${turnApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: 3600 }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("[TURN API] generate credentials failed:", errText);
    return jsonSuccess(c, { iceServers: DEFAULT_ICE_SERVERS });
  }

  const data = (await response.json()) as { iceServers?: IceServerConfig[] };
  return jsonSuccess(c, {
    iceServers: sanitizeIceServers(data.iceServers),
  });
});

// ═══════════════════════════════════════
// Cloudflare Calls (Realtime SFU) Proxy
// Ref: https://developers.cloudflare.com/realtime/sfu/https-api/
//
// These endpoints proxy requests to the Cloudflare Calls API,
// injecting the APP_TOKEN so it never reaches the client.
// ═══════════════════════════════════════

/**
 * Step 1: Create a new SFU Session
 * Proxies to: POST /apps/{appId}/sessions/new
 * Returns: { sessionId }
 */
app.post("/calls/sessions/new", async (c) => {
  const appId = c.env.CF_CALLS_APP_ID;
  const token = c.env.CF_CALLS_APP_TOKEN;

  if (!appId || !token) {
    throw new HTTPException(500, { message: "Cloudflare Calls credentials not configured. Set CF_CALLS_APP_ID and CF_CALLS_APP_TOKEN via wrangler secret put." });
  }

  const response = await fetch(
    `${CALLS_API_BASE}/apps/${appId}/sessions/new`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Calls API] sessions/new failed:", errText);
    throw new HTTPException(response.status as 400, {
      message: `Calls API error: ${errText}`,
    });
  }

  const data = await response.json();
  return jsonSuccess(c, data as Record<string, unknown>);
});

/**
 * Step 2: Add a track to a session (push local or pull remote)
 * Proxies to: POST /apps/{appId}/sessions/{sessionId}/tracks/new
 * Request body: { sessionDescription: {...}, tracks: [...] }
 * Returns: { requiresImmediateRenegotiation, sessionDescription, tracks }
 */
app.post("/calls/sessions/:sessionId/tracks/new", async (c) => {
  const sessionId = c.req.param("sessionId");
  const appId = c.env.CF_CALLS_APP_ID;
  const token = c.env.CF_CALLS_APP_TOKEN;

  if (!appId || !token) {
    throw new HTTPException(500, { message: "Cloudflare Calls credentials not configured." });
  }

  const body = await c.req.text();

  const response = await fetch(
    `${CALLS_API_BASE}/apps/${appId}/sessions/${sessionId}/tracks/new`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Calls API] tracks/new failed:", errText);
    throw new HTTPException(response.status as 400, {
      message: `Calls API error: ${errText}`,
    });
  }

  const data = await response.json();
  return jsonSuccess(c, data as Record<string, unknown>);
});

/**
 * Step 3: Renegotiate a session (after track changes)
 * Proxies to: PUT /apps/{appId}/sessions/{sessionId}/renegotiate
 */
app.put("/calls/sessions/:sessionId/renegotiate", async (c) => {
  const sessionId = c.req.param("sessionId");
  const appId = c.env.CF_CALLS_APP_ID;
  const token = c.env.CF_CALLS_APP_TOKEN;

  if (!appId || !token) {
    throw new HTTPException(500, { message: "Cloudflare Calls credentials not configured." });
  }

  const body = await c.req.text();

  const response = await fetch(
    `${CALLS_API_BASE}/apps/${appId}/sessions/${sessionId}/renegotiate`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Calls API] renegotiate failed:", errText);
    throw new HTTPException(response.status as 400, {
      message: `Calls API error: ${errText}`,
    });
  }

  const data = await response.json();
  return jsonSuccess(c, data as Record<string, unknown>);
});

// ═══════════════════════════════════════
// Cloudflare Stream Broadcast Management
// Ref: https://developers.cloudflare.com/stream/webrtc-beta/
// Ref: https://developers.cloudflare.com/stream/stream-live/simulcasting/
// ═══════════════════════════════════════

/**
 * Create a Live Input for browser-based Cloudflare Stream publishing
 * Proxies to: POST /accounts/{accountId}/stream/live_inputs
 * Returns: { uid, webRTC: { url }, webRTCPlayback: { url } }
 */
app.post("/broadcast/start", async (c) => {
  const accountId = c.env.CF_ACCOUNT_ID;
  const apiToken = c.env.CF_STREAM_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new HTTPException(500, {
      message: "Cloudflare Stream credentials not configured. Set CF_ACCOUNT_ID and CF_STREAM_API_TOKEN via wrangler secret put.",
    });
  }

  const body = await c.req.json<{ name?: string }>().catch(() => ({ name: undefined }));

  const response = await fetch(
    `${STREAM_API_BASE}/accounts/${accountId}/stream/live_inputs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meta: { name: body.name || "Live Studio Broadcast" },
        recording: { mode: "off" },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Stream API] create live input failed:", errText);
    throw new HTTPException(response.status as 400, {
      message: `Stream API error: ${errText}`,
    });
  }

  const data = (await response.json()) as {
    result?: {
      uid: string;
      webRTC?: { url?: string };
      webRTCPlayback?: { url?: string };
      rtmps?: {
        url?: string;
        streamKey?: string;
      };
      srt?: {
        url?: string;
        streamId?: string;
      };
    };
  };
  return jsonSuccess(c, {
    inputUid: data.result?.uid,
    whipUrl: data.result?.webRTC?.url,
    playbackUrl: data.result?.webRTCPlayback?.url,
    rtmpsUrl: data.result?.rtmps?.url,
    rtmpsStreamKey: data.result?.rtmps?.streamKey,
    srtUrl: data.result?.srt?.url,
    srtStreamId: data.result?.srt?.streamId,
  });
});

/**
 * Add a simulcast output (restream to YouTube or Facebook)
 * Proxies to: POST /accounts/{accountId}/stream/live_inputs/{inputUid}/outputs
 */
app.post("/broadcast/output", async (c) => {
  const accountId = c.env.CF_ACCOUNT_ID;
  const apiToken = c.env.CF_STREAM_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new HTTPException(500, { message: "Stream credentials not configured." });
  }

  const body = await c.req.json<{
    inputUid?: string;
    rtmpUrl?: string;
    streamKey?: string;
  }>();

  if (!body.inputUid || !body.rtmpUrl || !body.streamKey) {
    throw new HTTPException(400, {
      message: "inputUid, rtmpUrl, and streamKey are required",
    });
  }

  const normalizedOutputUrl = normalizeOutputUrl(body.rtmpUrl);

  const response = await fetch(
    `${STREAM_API_BASE}/accounts/${accountId}/stream/live_inputs/${body.inputUid}/outputs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
        streamKey: body.streamKey,
        url: normalizedOutputUrl,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Stream API] add output failed:", errText);
    throw new HTTPException(response.status as 400, {
      message: `Stream API error: ${errText}`,
    });
  }

  const data = await response.json();
  return jsonSuccess(c, {
    normalizedUrl: normalizedOutputUrl,
    ...(data as Record<string, unknown>),
  });
});

export default app;
