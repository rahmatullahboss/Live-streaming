type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
} & T;

export type RoomSummary = {
  checkout_session_id?: string | null;
  id: string;
  is_paused?: number | null;
  name: string;
  pin: string;
  created_at?: string;
  customer_email?: string | null;
  expires_at?: string | null;
  facebook_output_url?: string | null;
  facebook_stream_key?: string | null;
  scoring_token?: string | null;
  session_started_at?: string | null;
  status?: string | null;
  stream_playback_url?: string | null;
  tenant_id?: string | null;
  total_seconds_used?: number | null;
  youtube_output_url?: string | null;
  youtube_stream_key?: string | null;
};

export type RoomPassCheckout = {
  checkoutUrl: string;
  durationMinutes: number;
  room: RoomSummary;
};

export type AccountSummary = {
  accessToken?: string;
  authProvider?: string;
  avatarUrl?: string;
  email: string;
  id: string;
  name: string;
  phone: string;
};

export type RoomPassSummary = {
  amount_cents: number;
  bkash_sender_number?: string | null;
  bkash_transaction_id?: string | null;
  currency: string;
  duration_minutes: number;
  id: string;
  package_id?: string | null;
  paid_at?: string | null;
  payment_provider?: string | null;
  room_id: string;
  status: string;
  tenant_id: string;
};

export type ManualRoomPassResult = {
  payment: {
    amountCents: number;
    bkashMerchantNumber: string;
    id: string;
    status: string;
  };
  room: RoomSummary;
};

export type PaymentConfig = {
  bkashMerchantNumber: string;
  durationMinutes: number;
  manualAmountCents: number;
  manualCurrency: string;
};

export type StreamingPackage = {
  active: number;
  currency: string;
  description: string;
  duration_minutes: number;
  features: string[];
  id: string;
  max_ad_videos: number;
  max_cameras: number;
  max_rooms: number;
  name: string;
  price_cents: number;
  sort_order: number;
};

export type AdminPackageUpdate = Partial<
  Pick<
    StreamingPackage,
    | "active"
    | "description"
    | "duration_minutes"
    | "features"
    | "max_ad_videos"
    | "max_cameras"
    | "max_rooms"
    | "name"
    | "price_cents"
    | "sort_order"
  >
>;

export type AuthConfig = {
  googleClientId: string | null;
};

export type AdminSummary = {
  activeRooms: number;
  paidPurchases: number;
  pendingManualReviews: number;
  pendingPayments: number;
  roomPasses: number;
  rooms: number;
  tenants: number;
};

export type AdminReadinessCheck = {
  action: string;
  key: string;
  label: string;
  ok: boolean;
  severity: "error" | "warning";
};

export type AdminReadiness = {
  checks: AdminReadinessCheck[];
  ready: boolean;
};

export type AdminAuditLog = {
  action: string;
  actor_email?: string | null;
  created_at?: string | null;
  id: string;
  metadata_json?: string | null;
  target_id: string;
  target_type: string;
};

export type AdminDashboard = {
  auditLogs: AdminAuditLog[];
  packages: StreamingPackage[];
  readiness: AdminReadiness;
  roomPasses: RoomPassSummary[];
  rooms: RoomSummary[];
  summary: AdminSummary;
  tenants: AccountSummary[];
};

export type AdminLoginResult = {
  account: {
    email: string;
  };
};

export type RoomAssetResult = {
  asset: {
    field: "left_logo_url" | "right_logo_url" | "team1_logo_url" | "team2_logo_url" | "ad_video_url";
    id: string;
    publicUrl: string;
    r2Key: string;
    sizeBytes: number;
  };
};

export type RoomAssetSummary = RoomAssetResult["asset"] & {
  contentType: string;
};

export type RelayConfig = {
  expiresAt: string;
  managed: boolean;
  websocketUrl: string;
};

export type BroadcastDestinationConfig = {
  key: string;
  label: string;
  rtmpUrl: string;
  streamKey: string;
};

export type OverlayConfig = {
  ad_title?: string | null;
  ad_video_url?: string | null;
  clock_text?: string | null;
  external_overlay_active: number;
  external_scoreboard_url?: string | null;
  left_logo_url?: string | null;
  logo_url?: string | null;
  match_status?: string | null;
  program_source?: "ad" | "live";
  right_logo_url?: string | null;
  scoreboard_active: number;
  scoring_data?: Record<string, number | string>;
  sponsor_text?: string | null;
  sport?: "cricket" | "football" | "generic";
  team1_logo_url?: string | null;
  team1_name: string;
  team1_score: number;
  team2_logo_url?: string | null;
  team2_name: string;
  team2_score: number;
  theme_variant?: "arena" | "broadcast" | "classic";
  ticker_active?: number;
  ticker_text?: string | null;
  updated_at?: number | null;
};

export async function readApi<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message ?? payload.error ?? "Request failed");
  }

  return (payload.data ?? payload) as T;
}

export async function verifyRoomPin(pin: string): Promise<RoomSummary> {
  const response = await fetch("/api/rooms/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });

  const payload = await readApi<{ room: RoomSummary }>(response);
  return payload.room;
}

export async function verifyDirectorAccess(input: {
  accessToken: string;
  roomId: string;
}): Promise<RoomSummary> {
  const response = await fetch("/api/v1/director-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = await readApi<{ room: RoomSummary }>(response);
  return payload.room;
}

export async function getRealtimeRoom(roomId: string): Promise<RoomSummary> {
  const response = await fetch(`/api/realtime/rooms/${roomId}`);
  const payload = await readApi<{ room: RoomSummary }>(response);
  return payload.room;
}

export async function getBroadcastConfig(roomId: string): Promise<BroadcastDestinationConfig[]> {
  const response = await fetch(`/api/realtime/rooms/${roomId}/broadcast-config`);
  const payload = await readApi<{ destinations: BroadcastDestinationConfig[] }>(response);
  return payload.destinations;
}

export async function getRelayConfig(roomId: string): Promise<RelayConfig> {
  const response = await fetch(`/api/v1/rooms/${roomId}/relay-config`);
  const payload = await readApi<{ relay: RelayConfig }>(response);
  return payload.relay;
}

export async function saveBroadcastConfig(
  roomId: string,
  destinations: BroadcastDestinationConfig[]
): Promise<BroadcastDestinationConfig[]> {
  const response = await fetch(`/api/realtime/rooms/${roomId}/broadcast-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinations }),
  });

  const payload = await readApi<{ destinations: BroadcastDestinationConfig[] }>(response);
  return payload.destinations;
}

export async function getOverlayConfig(roomId: string): Promise<OverlayConfig> {
  const response = await fetch(`/api/rooms/${roomId}/overlays`);
  return readApi<OverlayConfig>(response);
}

export async function saveOverlayConfig(
  roomId: string,
  overlay: OverlayConfig
): Promise<{ updated: boolean }> {
  const response = await fetch(`/api/rooms/${roomId}/overlays`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(overlay),
  });

  return readApi<{ updated: boolean }>(response);
}

export async function getScoringSession(token: string): Promise<{
  overlay: OverlayConfig;
  room: RoomSummary;
}> {
  const response = await fetch(`/api/scoring/${token}`);
  return readApi<{ overlay: OverlayConfig; room: RoomSummary }>(response);
}

export async function saveScoringSession(
  token: string,
  overlay: OverlayConfig
): Promise<{ updated: boolean }> {
  const response = await fetch(`/api/scoring/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(overlay),
  });

  return readApi<{ updated: boolean }>(response);
}

export async function getPackages(): Promise<StreamingPackage[]> {
  const response = await fetch("/api/v1/packages");
  const payload = await readApi<{ packages: StreamingPackage[] }>(response);
  return payload.packages;
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const response = await fetch("/api/v1/auth-config");
  return readApi<AuthConfig>(response);
}

export async function signInWithGoogleCredential(
  credential: string
): Promise<{ account: AccountSummary }> {
  const response = await fetch("/api/v1/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });

  return readApi<{ account: AccountSummary }>(response);
}

export async function createRoomPassCheckout(input: {
  accessToken?: string;
  customerEmail: string;
  packageId?: string;
  roomName: string;
}): Promise<RoomPassCheckout> {
  const response = await fetch("/api/v1/room-passes/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return readApi<RoomPassCheckout>(response);
}

export async function createAccount(input: {
  email: string;
  name: string;
  phone: string;
}): Promise<{ account: AccountSummary }> {
  const response = await fetch("/api/v1/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return readApi<{ account: AccountSummary }>(response);
}

export async function getAccountDashboard(
  accessToken: string
): Promise<{ account: AccountSummary; passes: RoomPassSummary[]; rooms: RoomSummary[] }> {
  const response = await fetch(
    `/api/v1/accounts/me?access_token=${encodeURIComponent(accessToken)}`
  );

  return readApi<{ account: AccountSummary; passes: RoomPassSummary[]; rooms: RoomSummary[] }>(response);
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const response = await fetch("/api/v1/payment-config");
  return readApi<PaymentConfig>(response);
}

export async function createManualRoomPass(input: {
  accessToken: string;
  bkashSenderNumber: string;
  bkashTransactionId: string;
  packageId?: string;
  roomName: string;
}): Promise<ManualRoomPassResult> {
  const response = await fetch("/api/v1/manual-room-passes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return readApi<ManualRoomPassResult>(response);
}

export async function confirmRoomPass(sessionId: string): Promise<{ room: RoomSummary }> {
  const response = await fetch(
    `/api/v1/room-passes/confirm?session_id=${encodeURIComponent(sessionId)}`
  );

  return readApi<{ room: RoomSummary }>(response);
}

export async function startRoomSession(roomId: string, accessToken: string): Promise<RoomSummary> {
  const response = await fetch(`/api/v1/rooms/${roomId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
  const payload = await readApi<{ room: RoomSummary }>(response);
  return payload.room;
}

export async function expireRoomSession(roomId: string, accessToken: string): Promise<RoomSummary> {
  const response = await fetch(`/api/v1/rooms/${roomId}/expire`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
  const payload = await readApi<{ room: RoomSummary }>(response);
  return payload.room;
}

export async function pauseRoomSession(roomId: string, accessToken: string): Promise<RoomSummary> {
  const response = await fetch(`/api/v1/rooms/${roomId}/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
  const payload = await readApi<{ room: RoomSummary }>(response);
  return payload.room;
}

export async function resumeRoomSession(roomId: string, accessToken: string): Promise<RoomSummary> {
  const response = await fetch(`/api/v1/rooms/${roomId}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
  const payload = await readApi<{ room: RoomSummary }>(response);
  return payload.room;
}

export async function stopRoomSession(roomId: string, accessToken: string): Promise<RoomSummary> {
  const response = await fetch(`/api/v1/rooms/${roomId}/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
  const payload = await readApi<{ room: RoomSummary }>(response);
  return payload.room;
}

export type TimePoolRoom = {
  expiresAt?: string | null;
  id: string;
  isPaused: boolean;
  name: string;
  secondsUsed: number;
  status?: string | null;
};

export type TimePool = {
  remainingMinutes: number;
  remainingSeconds: number;
  totalMinutes: number;
  totalSeconds: number;
  usedMinutes: number;
  usedSeconds: number;
};

export async function getTimePool(accessToken: string): Promise<{ pool: TimePool; rooms: TimePoolRoom[] }> {
  const response = await fetch(`/api/v1/accounts/me/time-pool?access_token=${encodeURIComponent(accessToken)}`);
  return readApi<{ pool: TimePool; rooms: TimePoolRoom[] }>(response);
}

export type Entitlements = {
  entitlements: {
    totalMinutes: number;
    usedSeconds: number;
    remainingSeconds: number;
    maxRooms: number;
    activeRooms: number;
    availableRooms: number;
  };
  purchases: Array<{
    id: string;
    packageName: string;
    amountCents: number;
    currency: string;
    durationMinutes: number;
    maxRooms: number;
    maxCameras: number;
    maxAdVideos: number;
    status: string;
    paidAt: string | null;
  }>;
  rooms: Array<{
    id: string;
    name: string;
    status: string;
    isPaused: boolean;
    totalSecondsUsed: number | null;
    sessionStartedAt: string | null;
  }>;
};

export async function getEntitlements(accessToken: string): Promise<Entitlements> {
  const response = await fetch(`/api/v1/accounts/me/entitlements?access_token=${encodeURIComponent(accessToken)}`);
  return readApi<Entitlements>(response);
}

export async function createRoom(accessToken: string, name: string): Promise<{ room: RoomSummary }> {
  const response = await fetch("/api/v1/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, name }),
  });
  return readApi<{ room: RoomSummary }>(response);
}

const MULTIPART_THRESHOLD_BYTES = 90_000_000; // 90MB — use multipart for files above this
const MULTIPART_PART_SIZE_BYTES = 90_000_000; // Each chunk sent to the Worker

export async function uploadRoomAsset(input: {
  field: "left_logo_url" | "right_logo_url" | "team1_logo_url" | "team2_logo_url" | "ad_video_url";
  file: Blob;
  filename: string;
  onProgress?: (percent: number) => void;
  roomId: string;
}): Promise<RoomAssetResult> {
  // Large ad videos → multipart upload to avoid Cloudflare Workers 100MB body limit
  if (input.field === "ad_video_url" && input.file.size > MULTIPART_THRESHOLD_BYTES) {
    return uploadRoomAssetMultipart(input);
  }

  const formData = new FormData();
  formData.set("field", input.field);
  formData.set("file", input.file, input.filename);

  const response = await fetch(`/api/v1/rooms/${input.roomId}/assets`, {
    method: "POST",
    body: formData,
  });

  return readApi<RoomAssetResult>(response);
}

async function uploadRoomAssetMultipart(input: {
  field: "left_logo_url" | "right_logo_url" | "team1_logo_url" | "team2_logo_url" | "ad_video_url";
  file: Blob;
  filename: string;
  onProgress?: (percent: number) => void;
  roomId: string;
}): Promise<RoomAssetResult> {
  // Step 1: Prepare multipart upload
  const prepareResponse = await fetch(`/api/v1/rooms/${input.roomId}/assets/multipart/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contentType: input.file.type || "video/mp4",
      field: input.field,
      fileSize: input.file.size,
      filename: input.filename,
    }),
  });

  const prepareResult = await readApi<{
    assetId: string;
    contentType: string;
    r2Key: string;
    uploadId: string;
  }>(prepareResponse);

  // Step 2: Upload parts
  const parts: Array<{ etag: string; partNumber: number }> = [];
  const totalParts = Math.ceil(input.file.size / MULTIPART_PART_SIZE_BYTES);

  for (let i = 0; i < totalParts; i++) {
    const start = i * MULTIPART_PART_SIZE_BYTES;
    const end = Math.min(start + MULTIPART_PART_SIZE_BYTES, input.file.size);
    const chunk = input.file.slice(start, end);
    const partNumber = i + 1;

    const partResponse = await fetch(
      `/api/v1/rooms/${input.roomId}/assets/multipart/${prepareResult.uploadId}/parts/${partNumber}?key=${encodeURIComponent(prepareResult.r2Key)}`,
      {
        method: "PUT",
        body: chunk,
      }
    );

    const partResult = await readApi<{ etag: string; partNumber: number }>(partResponse);
    parts.push(partResult);

    input.onProgress?.(Math.round(((i + 1) / totalParts) * 90)); // 0-90% for parts
  }

  // Step 3: Complete multipart upload
  const completeResponse = await fetch(
    `/api/v1/rooms/${input.roomId}/assets/multipart/${prepareResult.uploadId}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: prepareResult.assetId,
        contentType: prepareResult.contentType,
        fileSize: input.file.size,
        parts,
        r2Key: prepareResult.r2Key,
      }),
    }
  );

  input.onProgress?.(100);
  return readApi<RoomAssetResult>(completeResponse);
}

export async function getRoomAssets(
  roomId: string,
  field: "left_logo_url" | "right_logo_url" | "ad_video_url"
): Promise<RoomAssetSummary[]> {
  const response = await fetch(`/api/v1/rooms/${roomId}/assets?field=${encodeURIComponent(field)}`);
  const payload = await readApi<{ assets: RoomAssetSummary[] }>(response);
  return payload.assets;
}

export async function deleteRoomAsset(
  roomId: string,
  field: "left_logo_url" | "right_logo_url" | "team1_logo_url" | "team2_logo_url" | "ad_video_url",
  assetId?: string
): Promise<{ deleted: boolean; field: string }> {
  const query = new URLSearchParams({ field });
  if (assetId) {
    query.set("assetId", assetId);
  }
  const response = await fetch(
    `/api/v1/rooms/${roomId}/assets?${query.toString()}`,
    { method: "DELETE" }
  );

  return readApi<{ deleted: boolean; field: string }>(response);
}

export async function loginAdmin(input: {
  email: string;
  password: string;
}): Promise<AdminLoginResult> {
  const response = await fetch("/api/v1/admin/login", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  return readApi<AdminLoginResult>(response);
}

export async function logoutAdmin(): Promise<{ loggedOut: boolean }> {
  const response = await fetch("/api/v1/admin/logout", {
    method: "POST",
  });

  return readApi<{ loggedOut: boolean }>(response);
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const response = await fetch("/api/v1/admin/summary");

  return readApi<AdminDashboard>(response);
}

export async function updateAdminPackage(
  packageId: string,
  input: AdminPackageUpdate
): Promise<StreamingPackage> {
  const response = await fetch(`/api/v1/admin/packages/${packageId}`, {
    body: JSON.stringify(input),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
  const payload = await readApi<{ package: StreamingPackage }>(response);
  return payload.package;
}

export async function approveAdminRoomPass(
  roomPassId: string
): Promise<{ room: RoomSummary }> {
  const response = await fetch(`/api/v1/admin/room-passes/${roomPassId}/approve`, {
    method: "POST",
    credentials: "include",
  });

  return readApi<{ room: RoomSummary }>(response);
}

export async function rejectAdminRoomPass(
  roomPassId: string
): Promise<{ rejected: boolean }> {
  const response = await fetch(`/api/v1/admin/room-passes/${roomPassId}/reject`, {
    method: "POST",
    credentials: "include",
  });

  return readApi<{ rejected: boolean }>(response);
}

export async function startAdminRoom(
  roomId: string
): Promise<RoomSummary> {
  const response = await fetch(`/api/v1/admin/rooms/${roomId}/start`, {
    method: "POST",
    credentials: "include",
  });
  const payload = await readApi<{ room: RoomSummary }>(response);
  return payload.room;
}

export async function expireAdminRoom(
  roomId: string
): Promise<RoomSummary> {
  const response = await fetch(`/api/v1/admin/rooms/${roomId}/expire`, {
    method: "POST",
    credentials: "include",
  });
  const payload = await readApi<{ room: RoomSummary }>(response);
  return payload.room;
}
