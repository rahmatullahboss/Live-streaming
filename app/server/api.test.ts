import { afterEach, describe, expect, it, vi } from "vitest";

import app, { type Bindings } from "./api";

type MockRoomRecord = {
  checkout_session_id?: string | null;
  customer_email?: string | null;
  expires_at?: string | null;
  facebook_output_url?: string | null;
  facebook_stream_key?: string | null;
  id: string;
  name: string;
  pin: string;
  scoring_token?: string | null;
  status?: string | null;
  tenant_id?: string | null;
  youtube_output_url?: string | null;
  youtube_stream_key?: string | null;
};

type MockOverlayRecord = {
  ad_video_url?: string | null;
  external_scoreboard_url?: string | null;
  left_logo_url?: string | null;
  room_id: string;
  right_logo_url?: string | null;
  scoreboard_active?: number | null;
  scoring_data?: string | null;
  sport?: string | null;
  team1_name?: string | null;
  team1_score?: number | null;
  team2_name?: string | null;
  team2_score?: number | null;
};

type MockTenantRecord = {
  access_token: string;
  email: string;
  id: string;
  name?: string | null;
  phone?: string | null;
};

type MockRoomPassRecord = {
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

type MockPackageRecord = {
  active: number;
  currency: string;
  description: string;
  duration_minutes: number;
  features: string[];
  id: string;
  max_ad_videos?: number;
  max_cameras: number;
  max_rooms: number;
  name: string;
  price_cents: number;
  sort_order: number;
};

type MockAssetRecord = {
  content_type?: string;
  deleted_at?: string | null;
  id: string;
  overlay_field: string;
  public_url: string;
  r2_key: string;
  room_id: string;
  size_bytes?: number;
  tenant_id?: string | null;
};

type MockCameraRecord = {
  audio_track_id?: string | null;
  id: string;
  is_active?: number | null;
  last_seen_at?: string | null;
  room_id: string;
  session_id: string;
  track_id: string;
};

type MockAuditRecord = {
  action: string;
  actor_email?: string | null;
  created_at?: string | null;
  id: string;
  metadata_json?: string | null;
  target_id: string;
  target_type: string;
};

function createMockDb(
  initialRooms: MockRoomRecord[] = [],
  initialOverlays: MockOverlayRecord[] = [],
  initialRoomPasses: MockRoomPassRecord[] = [],
  initialTenants: MockTenantRecord[] = [],
  initialAssets: MockAssetRecord[] = [],
  initialPackages: MockPackageRecord[] = [],
  initialCameras: MockCameraRecord[] = [],
  initialAudits: MockAuditRecord[] = []
): D1Database {
  const rooms = new Map(initialRooms.map((room) => [room.id, room]));
  const overlays = new Map(initialOverlays.map((overlay) => [overlay.room_id, overlay]));
  const roomPasses = new Map(initialRoomPasses.map((roomPass) => [roomPass.id, roomPass]));
  const tenants = new Map(initialTenants.map((tenant) => [tenant.id, tenant]));
  const assets = new Map(initialAssets.map((asset) => [asset.id, asset]));
  const packages = new Map(initialPackages.map((item) => [item.id, item]));
  const cameras = new Map(initialCameras.map((camera) => [camera.id, camera]));
  const audits = new Map(initialAudits.map((audit) => [audit.id, audit]));

  const statement = {
    sql: "",
    values: [] as unknown[],
    bind(...values: unknown[]) {
      this.values = values;
      return this;
    },
    async all() {
      if (this.sql.includes("SELECT * FROM rooms WHERE tenant_id = ?")) {
        return {
          results: Array.from(rooms.values()).filter(
            (room) => room.tenant_id === String(this.values[0])
          ),
        };
      }

      if (this.sql.includes("SELECT * FROM rooms")) {
        return { results: Array.from(rooms.values()) };
      }

      if (this.sql.includes("SELECT * FROM tenants")) {
        return { results: Array.from(tenants.values()) };
      }

      if (this.sql.includes("SELECT * FROM room_passes WHERE tenant_id = ?")) {
        return {
          results: Array.from(roomPasses.values()).filter(
            (roomPass) => roomPass.tenant_id === String(this.values[0])
          ),
        };
      }

      if (this.sql.includes("SELECT * FROM room_passes")) {
        return { results: Array.from(roomPasses.values()) };
      }

      if (this.sql.includes("SELECT * FROM room_assets") && this.sql.includes("room_id = ?")) {
        return {
          results: Array.from(assets.values()).filter(
            (asset) => asset.room_id === String(this.values[0]) && !asset.deleted_at
          ),
        };
      }

      if (this.sql.includes("SELECT * FROM packages")) {
        return {
          results: Array.from(packages.values()).map((item) => ({
            ...item,
            features_json: JSON.stringify(item.features),
          })),
        };
      }

      if (this.sql.includes("SELECT * FROM cameras")) {
        return {
          results: Array.from(cameras.values()).filter(
            (camera) => camera.room_id === String(this.values[0]) && camera.is_active === 1
          ),
        };
      }

      if (this.sql.includes("SELECT * FROM admin_audit_logs")) {
        return { results: Array.from(audits.values()) };
      }

      return { results: [] };
    },
    async first() {
      if (this.sql.includes("COUNT(*) AS row_count") && this.sql.includes("FROM packages")) {
        return { row_count: packages.size };
      }

      if (this.sql.includes("COUNT(*) AS row_count") && this.sql.includes("FROM room_assets")) {
        return { row_count: assets.size };
      }

      if (this.sql.includes("COUNT(*) AS row_count") && this.sql.includes("FROM admin_audit_logs")) {
        return { row_count: audits.size };
      }

      if (this.sql.includes("COUNT(*) AS active_count")) {
        const activeCount = Array.from(cameras.values()).filter(
          (camera) =>
            camera.room_id === String(this.values[0]) &&
            camera.is_active === 1 &&
            camera.id !== String(this.values[1])
        ).length;
        return { active_count: activeCount };
      }

      if (this.sql.includes("SELECT * FROM rooms WHERE id = ?")) {
        return rooms.get(String(this.values[0])) ?? null;
      }

      if (this.sql.includes("SELECT * FROM rooms WHERE pin = ?")) {
        return Array.from(rooms.values()).find(
          (room) => room.pin === String(this.values[0])
        ) ?? null;
      }

      if (this.sql.includes("SELECT * FROM rooms WHERE scoring_token = ?")) {
        return Array.from(rooms.values()).find(
          (room) => room.scoring_token === String(this.values[0])
        ) ?? null;
      }

      if (this.sql.includes("SELECT * FROM rooms WHERE checkout_session_id = ?")) {
        return Array.from(rooms.values()).find(
          (room) => room.checkout_session_id === String(this.values[0])
        ) ?? null;
      }

      if (this.sql.includes("SELECT * FROM tenants WHERE access_token = ?")) {
        return Array.from(tenants.values()).find(
          (tenant) => tenant.access_token === String(this.values[0])
        ) ?? null;
      }

      if (this.sql.includes("SELECT * FROM room_passes WHERE id = ?")) {
        return roomPasses.get(String(this.values[0])) ?? null;
      }

      if (this.sql.includes("SELECT * FROM room_assets") && this.sql.includes("WHERE id = ?")) {
        return Array.from(assets.values()).find(
          (asset) =>
            asset.id === String(this.values[0]) &&
            asset.room_id === String(this.values[1]) &&
            asset.overlay_field === String(this.values[2]) &&
            !asset.deleted_at
        ) ?? null;
      }

      if (this.sql.includes("SELECT * FROM room_passes WHERE room_id = ?")) {
        return Array.from(roomPasses.values()).find(
          (roomPass) => roomPass.room_id === String(this.values[0])
        ) ?? null;
      }

      if (this.sql.includes("SELECT * FROM overlays WHERE room_id = ?")) {
        return overlays.get(String(this.values[0])) ?? null;
      }

      if (this.sql.includes("SELECT * FROM room_passes WHERE checkout_session_id = ?")) {
        return Array.from(roomPasses.values()).find(
          (roomPass) => roomPass.checkout_session_id === String(this.values[0])
        ) ?? null;
      }

      if (this.sql.includes("SELECT * FROM room_assets") && this.sql.includes("overlay_field = ?")) {
        return Array.from(assets.values()).find(
          (asset) =>
            asset.room_id === String(this.values[0]) &&
            asset.overlay_field === String(this.values[1]) &&
            !asset.deleted_at
        ) ?? null;
      }

      return null;
    },
    async run() {
      if (this.sql.includes("INSERT INTO tenants")) {
        const [id, email, name, phone, accessToken] = this.values;
        tenants.set(String(id), {
          access_token: accessToken ? String(accessToken) : `token_${id}`,
          email: String(email),
          id: String(id),
          name: name ? String(name) : null,
          phone: phone ? String(phone) : null,
        });
        return { success: true };
      }

      if (this.sql.includes("INSERT INTO rooms")) {
        const [
          id,
          name,
          pin,
          tenantId,
          customerEmail,
          status,
          checkoutSessionId,
        ] = this.values;
        rooms.set(String(id), {
          checkout_session_id: checkoutSessionId ? String(checkoutSessionId) : null,
          customer_email: customerEmail ? String(customerEmail) : null,
          id: String(id),
          name: String(name),
          pin: String(pin),
          status: String(status),
          tenant_id: tenantId ? String(tenantId) : null,
        });
      }

      if (this.sql.includes("INSERT INTO room_passes")) {
        const [id, tenantId, roomId, checkoutSessionId, status, amountCents, currency, durationMinutes] = this.values;
        roomPasses.set(String(id), {
          amount_cents: Number(amountCents),
          checkout_session_id: checkoutSessionId ? String(checkoutSessionId) : null,
          currency: String(currency),
          duration_minutes: Number(durationMinutes),
          bkash_sender_number: this.values[9] ? String(this.values[9]) : null,
          bkash_transaction_id: this.values[10] ? String(this.values[10]) : null,
          id: String(id),
          package_id: this.values[11] ? String(this.values[11]) : null,
          payment_provider: this.values[8] ? String(this.values[8]) : null,
          room_id: String(roomId),
          status: String(status),
          tenant_id: String(tenantId),
        });
      }

      if (
        this.sql.includes("UPDATE rooms") &&
        this.sql.includes("status = 'ready'") &&
        this.sql.includes("WHERE id = ?")
      ) {
        const roomId = String(this.values.at(-1));
        const room = rooms.get(roomId);
        if (room) {
          room.status = "ready";
          room.expires_at = null;
        }
      }

      if (
        this.sql.includes("UPDATE rooms") &&
        this.sql.includes("status = 'active'") &&
        this.sql.includes("WHERE id = ?")
      ) {
        const roomId = String(this.values.at(-1));
        const room = rooms.get(roomId);
        if (room) {
          room.status = "active";
          room.expires_at = String(this.values[0]);
        }
      }

      if (this.sql.includes("UPDATE room_passes") && this.sql.includes("WHERE id = ?")) {
        const roomPassId = String(this.values.at(-1));
        const roomPass = roomPasses.get(roomPassId);
        if (roomPass) {
          roomPass.status = this.sql.includes("status = 'rejected'") ? "rejected" : "paid";
        }
      }

      if (
        this.sql.includes("UPDATE rooms") &&
        this.sql.includes("status = 'cancelled'") &&
        this.sql.includes("WHERE id = ?")
      ) {
        const roomId = String(this.values.at(-1));
        const room = rooms.get(roomId);
        if (room) {
          room.status = "cancelled";
        }
      }

      if (this.sql.includes("UPDATE rooms") && this.sql.includes("checkout_session_id = ?")) {
        const checkoutSessionId = String(this.values.at(-1));
        for (const room of rooms.values()) {
          if (room.checkout_session_id === checkoutSessionId) {
            room.status = "ready";
            room.expires_at = null;
          }
        }
      }

      if (this.sql.includes("UPDATE room_passes") && this.sql.includes("checkout_session_id = ?")) {
        const checkoutSessionId = String(this.values.at(-1));
        for (const roomPass of roomPasses.values()) {
          if (roomPass.checkout_session_id === checkoutSessionId) {
            roomPass.status = "paid";
          }
        }
      }

      if (this.sql.includes("UPDATE rooms") && this.values.length === 5) {
        const roomId = String(this.values[4]);
        const room = rooms.get(roomId);
        if (room) {
          room.youtube_output_url = (this.values[0] as string | null) ?? null;
          room.youtube_stream_key = (this.values[1] as string | null) ?? null;
          room.facebook_output_url = (this.values[2] as string | null) ?? null;
          room.facebook_stream_key = (this.values[3] as string | null) ?? null;
          rooms.set(roomId, room);
        }
      }

      if (this.sql.includes("UPDATE overlays SET") && this.sql.includes("WHERE room_id = ?")) {
        const roomId = String(this.values.at(-1));
        const overlay = overlays.get(roomId) ?? { room_id: roomId };
        const assignmentText = this.sql.slice(
          this.sql.indexOf("UPDATE overlays SET") + "UPDATE overlays SET".length,
          this.sql.indexOf("WHERE room_id = ?")
        );
        const fields = assignmentText
          .split(",")
          .map((assignment) => assignment.trim().split(" = ")[0])
          .filter((field) => field && field !== "updated_at");

        fields.forEach((field, index) => {
          const value = this.values[index];
          const normalizedValue = value === undefined || value === null || value === "" ? null : value;
          if (field === "scoring_data") {
            overlay.scoring_data = normalizedValue ? String(normalizedValue) : null;
          } else {
            (overlay as Record<string, unknown>)[field] = normalizedValue;
          }
        });
        overlays.set(roomId, overlay);
      }

      if (this.sql.includes("INSERT INTO room_assets")) {
        const [id, tenantId, roomId, overlayField, r2Key, publicUrl] = this.values;
        assets.set(String(id), {
          content_type: this.values[6] ? String(this.values[6]) : "application/octet-stream",
          id: String(id),
          overlay_field: String(overlayField),
          public_url: String(publicUrl),
          r2_key: String(r2Key),
          room_id: String(roomId),
          size_bytes: Number(this.values[7] ?? 0),
          tenant_id: tenantId ? String(tenantId) : null,
        });
      }

      if (this.sql.includes("INSERT OR REPLACE INTO cameras")) {
        const [id, roomId, trackId, audioTrackId, sessionId] = this.values;
        cameras.set(String(id), {
          audio_track_id: audioTrackId ? String(audioTrackId) : null,
          id: String(id),
          is_active: 1,
          last_seen_at: new Date().toISOString(),
          room_id: String(roomId),
          session_id: String(sessionId),
          track_id: String(trackId),
        });
      }

      if (this.sql.includes("INSERT INTO admin_audit_logs")) {
        const [id, actorEmail, action, targetType, targetId, metadataJson] = this.values;
        audits.set(String(id), {
          action: String(action),
          actor_email: actorEmail ? String(actorEmail) : null,
          created_at: new Date().toISOString(),
          id: String(id),
          metadata_json: metadataJson ? String(metadataJson) : null,
          target_id: String(targetId),
          target_type: String(targetType),
        });
      }

      if (this.sql.includes("INSERT INTO packages")) {
        const [
          id,
          name,
          description,
          priceCents,
          currency,
          durationMinutes,
          maxRooms,
          maxCameras,
          maxAdVideos,
          active,
          sortOrder,
          featuresJson,
        ] = this.values;
        packages.set(String(id), {
          active: Number(active),
          currency: String(currency),
          description: String(description),
          duration_minutes: Number(durationMinutes),
          features: JSON.parse(String(featuresJson)) as string[],
          id: String(id),
          max_ad_videos: Number(maxAdVideos),
          max_cameras: Number(maxCameras),
          max_rooms: Number(maxRooms),
          name: String(name),
          price_cents: Number(priceCents),
          sort_order: Number(sortOrder),
        });
      }

      if (
        this.sql.includes("UPDATE rooms") &&
        this.sql.includes("expires_at = ?") &&
        this.sql.includes("WHERE id = ?") &&
        this.values.length === 2
      ) {
        const roomId = String(this.values[1]);
        const room = rooms.get(roomId);
        if (room) {
          room.status = "active";
          room.expires_at = String(this.values[0]);
        }
      }

      if (this.sql.includes("UPDATE room_assets") && this.sql.includes("deleted_at")) {
        const assetId = String(this.values.at(-1));
        const asset = assets.get(assetId);
        if (asset) {
          asset.deleted_at = new Date().toISOString();
        }
      }

      return { success: true };
    },
  };

  return {
    prepare: (sql: string) => {
      statement.sql = sql;
      statement.values = [];
      return statement;
    },
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function createBindings(
  overrides: Partial<Bindings> = {},
  rooms: MockRoomRecord[] = [],
  overlays: MockOverlayRecord[] = [],
  roomPasses: MockRoomPassRecord[] = [],
  tenants: MockTenantRecord[] = [],
  assets: MockAssetRecord[] = [],
  packages: MockPackageRecord[] = [],
  cameras: MockCameraRecord[] = [],
  audits: MockAuditRecord[] = []
): Bindings {
  return {
    DB: createMockDb(rooms, overlays, roomPasses, tenants, assets, packages, cameras, audits),
    CF_ACCOUNT_ID: "account-id",
    CF_CALLS_APP_ID: "calls-app-id",
    CF_CALLS_APP_TOKEN: "calls-app-token",
    CF_STREAM_API_TOKEN: "stream-token",
    PUBLIC_APP_URL: "https://example.com",
    ROOM_PASS_PRICE_CENTS: "1500",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD: "correct-horse",
    MANUAL_PAYMENT_ADMIN_TOKEN: "admin-secret",
    BKASH_MERCHANT_NUMBER: "01700000000",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_WEBHOOK_SECRET: "whsec_test_123",
    ...overrides,
  };
}

function createMockR2Bucket(): R2Bucket & { deletedKeys: string[]; storedKeys: string[] } {
  const objects = new Map<string, ArrayBuffer>();
  const deletedKeys: string[] = [];
  const storedKeys: string[] = [];

  return {
    deletedKeys,
    storedKeys,
    put: async (key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob) => {
      storedKeys.push(key);
      if (value instanceof Blob) {
        objects.set(key, await value.arrayBuffer());
      } else if (value instanceof ArrayBuffer) {
        objects.set(key, value);
      } else {
        objects.set(key, new TextEncoder().encode(String(value ?? "")).buffer);
      }
      return null;
    },
    delete: async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        deletedKeys.push(key);
        objects.delete(key);
      }
    },
    get: async (key: string) => {
      const body = objects.get(key);
      if (!body) {
        return null;
      }
      return {
        body: new Response(body).body,
        httpMetadata: { contentType: "image/webp" },
        key,
        size: body.byteLength,
        writeHttpMetadata: (headers: Headers) => {
          headers.set("Content-Type", "image/webp");
        },
      } as R2ObjectBody;
    },
  } as unknown as R2Bucket & { deletedKeys: string[]; storedKeys: string[] };
}

describe("api /calls/ice-servers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to default STUN when TURN secrets are missing", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/calls/ice-servers"),
      createBindings()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
    });
  });

  it("returns sanitized TURN credentials when the API succeeds", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          iceServers: [
            {
              urls: [
                "stun:stun.cloudflare.com:3478",
                "turn:turn.cloudflare.com:3478?transport=udp",
                "turn:turn.cloudflare.com:53?transport=udp",
              ],
              username: "user",
              credential: "secret",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    const response = await app.fetch(
      new Request("https://example.com/api/calls/ice-servers"),
      createBindings({
        CF_TURN_KEY_ID: "turn-key",
        CF_TURN_API_TOKEN: "turn-token",
      })
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      iceServers: [
        { urls: ["stun:stun.cloudflare.com:3478", "turn:turn.cloudflare.com:3478?transport=udp"], username: "user", credential: "secret" },
      ],
    });
  });
});

describe("api /diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts client diagnostic payloads", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await app.fetch(
      new Request("https://example.com/api/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "pull-start",
          level: "info",
          scope: "studio",
          ts: "2026-04-21T15:00:00.000Z",
          details: { cameraId: "cam-1234" },
        }),
      }),
      createBindings()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      accepted: true,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[CLIENT_DIAGNOSTIC] [INFO] [studio] pull-start")
    );
  });
});

describe("api /realtime/rooms/:id/broadcast-config", () => {
  it("returns saved destinations with defaults", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/realtime/rooms/demo-room-01/broadcast-config"),
      createBindings(
        {},
        [
          {
            id: "demo-room-01",
            name: "Demo Studio",
            pin: "123456",
            youtube_output_url: "rtmp://youtube.test/live2",
            youtube_stream_key: "yt-key",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      destinations: [
        {
          key: "youtube",
          rtmpUrl: "rtmp://youtube.test/live2",
          streamKey: "yt-key",
        },
        {
          key: "facebook",
          rtmpUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
          streamKey: "",
        },
      ],
    });
  });

  it("persists updated destination values", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/realtime/rooms/demo-room-01/broadcast-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinations: [
            {
              key: "youtube",
              rtmpUrl: "rtmp://a.rtmp.youtube.com/live2",
              streamKey: "youtube-key",
            },
            {
              key: "facebook",
              rtmpUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
              streamKey: "facebook-key",
            },
          ],
        }),
      }),
      createBindings(
        {},
        [
          {
            id: "demo-room-01",
            name: "Demo Studio",
            pin: "123456",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      destinations: [
        {
          key: "youtube",
          streamKey: "youtube-key",
        },
        {
          key: "facebook",
          streamKey: "facebook-key",
        },
      ],
    });
  });
});

describe("api /rooms", () => {
  it("does not expose stored RTMP stream keys in public room listings", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/rooms"),
      createBindings(
        {},
        [
          {
            facebook_stream_key: "facebook-secret",
            id: "demo-room-01",
            name: "Demo Studio",
            pin: "123456",
            youtube_stream_key: "youtube-secret",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as { rooms: Array<Record<string, unknown>> };
    expect(payload.rooms[0]).not.toHaveProperty("youtube_stream_key");
    expect(payload.rooms[0]).not.toHaveProperty("facebook_stream_key");
  });
});

describe("api /rooms/:id/cameras", () => {
  it("enforces the purchased package camera limit before registering a new camera", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/rooms/room_limited_01/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioTrackName: "camera-2-audio",
          id: "camera-2",
          sessionId: "session-2",
          videoTrackName: "camera-2-video",
        }),
      }),
      createBindings(
        {},
        [
          {
            id: "room_limited_01",
            name: "Limited Room",
            pin: "778899",
            status: "active",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [
          {
            amount_cents: 1500,
            currency: "usd",
            duration_minutes: 180,
            id: "pass_limited_01",
            package_id: "one-camera",
            payment_provider: "stripe",
            room_id: "room_limited_01",
            status: "paid",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [],
        [
          {
            active: 1,
            currency: "usd",
            description: "One camera test package.",
            duration_minutes: 180,
            features: ["1 camera"],
            id: "one-camera",
            max_cameras: 1,
            max_rooms: 1,
            name: "One Camera",
            price_cents: 1500,
            sort_order: 1,
          },
        ],
        [
          {
            id: "camera-1",
            is_active: 1,
            room_id: "room_limited_01",
            session_id: "session-1",
            track_id: "camera-1-video",
          },
        ]
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: "This package allows up to 1 active camera for this room",
    });
  });
});

describe("api /v1/rooms/:id/relay-config", () => {
  it("returns a managed relay websocket url with a room scoped token", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/v1/rooms/demo-room-01/relay-config"),
      createBindings(
        {
          RELAY_AUTH_SECRET: "shared-secret",
          RELAY_WEBSOCKET_URL: "wss://relay.example.com/live",
        },
        [
          {
            id: "demo-room-01",
            name: "Demo Studio",
            pin: "123456",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      relay: { expiresAt: string; managed: boolean; websocketUrl: string };
      success: boolean;
    };

    expect(payload.success).toBe(true);
    expect(payload.relay.managed).toBe(true);
    const websocketUrl = new URL(payload.relay.websocketUrl);
    expect(websocketUrl.origin).toBe("wss://relay.example.com");
    expect(websocketUrl.searchParams.get("token")).toMatch(/^v1\./);
    expect(new Date(payload.relay.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("fails closed when managed relay secrets are missing", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/v1/rooms/demo-room-01/relay-config"),
      createBindings(
        {
          RELAY_AUTH_SECRET: undefined,
          RELAY_WEBSOCKET_URL: undefined,
        },
        [
          {
            id: "demo-room-01",
            name: "Demo Studio",
            pin: "123456",
          },
        ]
      )
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: "Managed relay is not configured",
    });
  });
});

describe("api /rooms/:id/overlays", () => {
  it("returns external scoreboard url and keeps scoring disabled by default", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/rooms/demo-room-01/overlays"),
      createBindings(
        {},
        [
          {
            id: "demo-room-01",
            name: "Demo Studio",
            pin: "123456",
          },
        ],
        [
          {
            external_scoreboard_url: "https://scores.example.com/overlay/demo",
            room_id: "demo-room-01",
            scoreboard_active: 0,
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      external_scoreboard_url: "https://scores.example.com/overlay/demo",
      scoreboard_active: 0,
    });
  });

  it("updates built-in scoring fields from the scorer link", async () => {
    const bindings = createBindings(
      {},
      [
        {
          id: "demo-room-01",
          name: "Demo Studio",
          pin: "123456",
          scoring_token: "score_token_01",
        },
      ],
      [
        {
          room_id: "demo-room-01",
          scoreboard_active: 0,
          team1_name: "TEAM A",
          team1_score: 0,
          team2_name: "TEAM B",
          team2_score: 0,
        },
      ]
    );

    const response = await app.fetch(
      new Request("https://example.com/api/scoring/score_token_01", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_status: "LIVE",
          scoreboard_active: 1,
          scoring_data: {
            balls: 17,
            current_rate: "8.47",
            overs: "2.5",
            runs: 24,
            wickets: 2,
          },
          sport: "cricket",
          team1_name: "DHAKA",
          team1_score: 24,
          team2_name: "CHITTAGONG",
          team2_score: 2,
        }),
      }),
      bindings
    );

    expect(response.status).toBe(200);

    const overlayResponse = await app.fetch(
      new Request("https://example.com/api/rooms/demo-room-01/overlays"),
      bindings
    );
    await expect(overlayResponse.json()).resolves.toMatchObject({
      scoreboard_active: 1,
      scoring_data: {
        overs: "2.5",
        runs: 24,
        wickets: 2,
      },
      sport: "cricket",
      team1_name: "DHAKA",
      team1_score: 24,
      team2_name: "CHITTAGONG",
      team2_score: 2,
    });
  });
});

describe("api /api/v1/room-passes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a Stripe checkout session for a three-hour room pass", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "cs_test_room_pass",
          url: "https://checkout.stripe.com/c/pay/cs_test_room_pass",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.fetch(
      new Request("https://example.com/api/v1/room-passes/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: "club@example.com",
          roomName: "Friday Night Match",
        }),
      }),
      createBindings()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_room_pass",
      room: {
        name: "Friday Night Match",
        status: "pending_payment",
      },
    });

    const stripeBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(String(stripeBody)).toContain("mode=payment");
    expect(String(stripeBody)).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=1500");
    expect(String(stripeBody)).toContain("success_url=https%3A%2F%2Fexample.com%2Fcheckout%2Fsuccess%3Fsession_id%3D%7BCHECKOUT_SESSION_ID%7D");
  });

  it("activates a pending room when Stripe reports the checkout session is paid", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "cs_paid_room_pass",
          payment_status: "paid",
          status: "complete",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.fetch(
      new Request("https://example.com/api/v1/room-passes/confirm?session_id=cs_paid_room_pass"),
      createBindings(
        {},
        [
          {
            checkout_session_id: "cs_paid_room_pass",
            id: "room_paid_01",
            name: "Paid Match Room",
            pin: "908172",
            status: "pending_payment",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [
          {
            amount_cents: 1500,
            checkout_session_id: "cs_paid_room_pass",
            currency: "usd",
            duration_minutes: 180,
            id: "pass_01",
            room_id: "room_paid_01",
            status: "pending_payment",
            tenant_id: "tenant_01",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      room: {
        id: "room_paid_01",
        pin: "908172",
        status: "ready",
      },
    });
  });

  it("starts the three-hour timer only when the room session starts", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/v1/rooms/room_ready_01/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "acct_token_01" }),
      }),
      createBindings(
        {},
        [
          {
            id: "room_ready_01",
            name: "Ready Match Room",
            pin: "112233",
            status: "ready",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [
          {
            amount_cents: 1500,
            checkout_session_id: "cs_ready_room_pass",
            currency: "usd",
            duration_minutes: 180,
            id: "pass_ready_01",
            room_id: "room_ready_01",
            status: "paid",
            tenant_id: "tenant_01",
          },
        ],
        [
          {
            access_token: "acct_token_01",
            email: "club@example.com",
            id: "tenant_01",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as { room: MockRoomRecord };
    expect(payload.room.status).toBe("active");
    expect(payload.room.expires_at).toEqual(expect.any(String));
  });

  it("rejects director room start without the owner access token", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/v1/rooms/room_ready_01/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "acct_token_wrong" }),
      }),
      createBindings(
        {},
        [
          {
            id: "room_ready_01",
            name: "Ready Match Room",
            pin: "112233",
            status: "ready",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [],
        [
          {
            access_token: "acct_token_01",
            email: "club@example.com",
            id: "tenant_01",
          },
        ]
      )
    );

    expect(response.status).toBe(401);
  });

  it("allows only the owning account to unlock director access", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/v1/director-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "acct_token_01", pin: "112233" }),
      }),
      createBindings(
        {},
        [
          {
            id: "room_ready_01",
            name: "Ready Match Room",
            pin: "112233",
            status: "ready",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [],
        [
          {
            access_token: "acct_token_01",
            email: "club@example.com",
            id: "tenant_01",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      room: {
        id: "room_ready_01",
        pin: "112233",
      },
    });
  });
});

describe("api /api/v1 manual bKash room passes", () => {
  it("creates an account with an access token", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/v1/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "club@example.com",
          name: "City Club",
          phone: "01711111111",
        }),
      }),
      createBindings()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      account: {
        email: "club@example.com",
        name: "City Club",
        phone: "01711111111",
      },
    });
  });

  it("submits a manual bKash room pass for review without activating the room", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/v1/manual-room-passes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: "acct_token_01",
          bkashSenderNumber: "01722222222",
          bkashTransactionId: "BKASH12345",
          roomName: "Manual Paid Match",
        }),
      }),
      createBindings(
        {},
        [],
        [],
        [],
        [
          {
            access_token: "acct_token_01",
            email: "club@example.com",
            id: "tenant_01",
            name: "City Club",
            phone: "01711111111",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      payment: {
        bkashMerchantNumber: "01700000000",
        status: "pending_manual_review",
      },
      room: {
        name: "Manual Paid Match",
        status: "pending_manual_review",
      },
    });
  });

  it("activates a manually reviewed bKash room pass for three hours", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/v1/manual-room-passes/pass_manual_01/approve", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-secret",
          "Content-Type": "application/json",
        },
      }),
      createBindings(
        {},
        [
          {
            id: "room_manual_01",
            name: "Manual Match",
            pin: "665544",
            status: "pending_manual_review",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [
          {
            amount_cents: 1500,
            bkash_sender_number: "01722222222",
            bkash_transaction_id: "BKASH12345",
            checkout_session_id: null,
            currency: "bdt",
            duration_minutes: 180,
            id: "pass_manual_01",
            payment_provider: "bkash_manual",
            room_id: "room_manual_01",
            status: "pending_manual_review",
            tenant_id: "tenant_01",
          },
        ],
        [
          {
            access_token: "acct_token_01",
            email: "club@example.com",
            id: "tenant_01",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      room: {
        id: "room_manual_01",
        pin: "665544",
        status: "ready",
      },
    });
  });
});

describe("api /api/v1 package catalog and admin controls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns public active packages for the pricing page", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/v1/packages"),
      createBindings()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      packages: expect.arrayContaining([
        expect.objectContaining({
          active: 1,
          duration_minutes: 180,
          id: "starter-live",
          name: "Starter Live",
          price_cents: 1500,
        }),
      ]),
    });
  });

  it("creates checkout for the selected package under the signed-in tenant", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "cs_matchday_pro",
          url: "https://checkout.stripe.com/c/pay/cs_matchday_pro",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.fetch(
      new Request("https://example.com/api/v1/room-passes/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: "acct_token_01",
          packageId: "matchday-pro",
          roomName: "Tournament Final",
        }),
      }),
      createBindings(
        {},
        [],
        [],
        [],
        [
          {
            access_token: "acct_token_01",
            email: "club@example.com",
            id: "tenant_01",
            name: "City Club",
            phone: "01711111111",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      durationMinutes: 360,
      room: {
        name: "Tournament Final",
        status: "pending_payment",
        tenant_id: "tenant_01",
      },
    });

    const stripeBody = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(stripeBody).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=3500");
    expect(stripeBody).toContain("metadata%5Bpackage_id%5D=matchday-pro");
  });

  it("logs in an admin with email and password before returning operations data", async () => {
    const rejected = await app.fetch(
      new Request("https://example.com/api/v1/admin/summary"),
      createBindings()
    );

    expect(rejected.status).toBe(401);

    const invalidLogin = await app.fetch(
      new Request("https://example.com/api/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "wrong-password",
        }),
      }),
      createBindings()
    );

    expect(invalidLogin.status).toBe(401);

    const login = await app.fetch(
      new Request("https://example.com/api/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "correct-horse",
        }),
      }),
      createBindings()
    );

    expect(login.status).toBe(200);
    const adminCookie = login.headers.get("Set-Cookie") ?? "";
    expect(adminCookie).toContain("live_studio_admin_session=");
    await expect(login.json()).resolves.toMatchObject({
      account: {
        email: "admin@example.com",
      },
      success: true,
    });

    const accepted = await app.fetch(
      new Request("https://example.com/api/v1/admin/summary", {
        headers: { Cookie: adminCookie },
      }),
      createBindings(
        {},
        [
          {
            id: "room_manual_01",
            name: "Manual Match",
            pin: "665544",
            status: "pending_manual_review",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [
          {
            amount_cents: 3500,
            bkash_sender_number: "01722222222",
            bkash_transaction_id: "BKASH12345",
            checkout_session_id: null,
            currency: "bdt",
            duration_minutes: 360,
            id: "pass_manual_01",
            package_id: "matchday-pro",
            payment_provider: "bkash_manual",
            room_id: "room_manual_01",
            status: "pending_manual_review",
            tenant_id: "tenant_01",
          },
        ],
        [
          {
            access_token: "acct_token_01",
            email: "club@example.com",
            id: "tenant_01",
            name: "City Club",
            phone: "01711111111",
          },
        ]
      )
    );

    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({
      success: true,
      summary: {
        pendingManualReviews: 1,
        rooms: 1,
        tenants: 1,
      },
      roomPasses: [
        {
          id: "pass_manual_01",
          package_id: "matchday-pro",
          status: "pending_manual_review",
        },
      ],
    });
  });

  it("returns production readiness checks with actionable missing configuration", async () => {
    const response = await app.fetch(
      new Request("https://example.com/api/v1/admin/summary", {
        headers: { Authorization: "Bearer admin-secret" },
      }),
      createBindings({
        ADMIN_EMAIL: undefined,
        ADMIN_PASSWORD: undefined,
        BKASH_MERCHANT_NUMBER: undefined,
        CF_CALLS_APP_ID: undefined,
        CF_CALLS_APP_TOKEN: undefined,
        GOOGLE_CLIENT_ID: undefined,
        PUBLIC_GOOGLE_CLIENT_ID: undefined,
        R2_ASSETS: undefined,
        RELAY_AUTH_SECRET: undefined,
        RELAY_WEBSOCKET_URL: undefined,
        STRIPE_SECRET_KEY: undefined,
        STRIPE_WEBHOOK_SECRET: undefined,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      readiness: {
        ready: false,
        checks: expect.arrayContaining([
          expect.objectContaining({
            key: "admin_credentials",
            ok: false,
          }),
          expect.objectContaining({
            key: "google_gis",
            ok: false,
          }),
          expect.objectContaining({
            key: "payment_collection",
            ok: false,
          }),
          expect.objectContaining({
            key: "r2_assets",
            ok: false,
          }),
          expect.objectContaining({
            key: "managed_relay",
            ok: false,
          }),
        ]),
      },
    });
  });

  it("lets an admin update package controls without replacing the package model", async () => {
    const bindings = createBindings();
    const response = await app.fetch(
      new Request("https://example.com/api/v1/admin/packages/starter-live", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer admin-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          active: 0,
          duration_minutes: 240,
          features: ["4 camera phones", "Manual review"],
          max_cameras: 4,
          max_rooms: 2,
          name: "Starter Ops",
          price_cents: 2200,
          sort_order: 5,
        }),
      }),
      bindings
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      package: {
        active: 0,
        duration_minutes: 240,
        features: ["4 camera phones", "Manual review"],
        id: "starter-live",
        max_cameras: 4,
        max_rooms: 2,
        name: "Starter Ops",
        price_cents: 2200,
        sort_order: 5,
      },
    });

    const summary = await app.fetch(
      new Request("https://example.com/api/v1/admin/summary", {
        headers: { Authorization: "Bearer admin-secret" },
      }),
      bindings
    );
    await expect(summary.json()).resolves.toMatchObject({
      auditLogs: [
        expect.objectContaining({
          action: "package_update",
          target_id: "starter-live",
          target_type: "package",
        }),
      ],
    });
  });

  it("lets an admin start a ready room and expire an active room", async () => {
    const bindings = createBindings(
      {},
      [
        {
          id: "room_ready_01",
          name: "Ready Room",
          pin: "112233",
          status: "ready",
          tenant_id: "tenant_01",
        },
      ],
      [],
      [
        {
          amount_cents: 3500,
          currency: "usd",
          duration_minutes: 360,
          id: "pass_ready_01",
          package_id: "matchday-pro",
          payment_provider: "stripe",
          room_id: "room_ready_01",
          status: "paid",
          tenant_id: "tenant_01",
        },
      ]
    );

    const started = await app.fetch(
      new Request("https://example.com/api/v1/admin/rooms/room_ready_01/start", {
        method: "POST",
        headers: { Authorization: "Bearer admin-secret" },
      }),
      bindings
    );

    expect(started.status).toBe(200);
    const startedPayload = await started.json() as {
      room: { expires_at: string | null; id: string; status: string };
      success: boolean;
    };
    expect(startedPayload).toMatchObject({
      success: true,
      room: {
        id: "room_ready_01",
        status: "active",
      },
    });
    expect(startedPayload.room.expires_at).toEqual(expect.any(String));

    const expired = await app.fetch(
      new Request("https://example.com/api/v1/admin/rooms/room_ready_01/expire", {
        method: "POST",
        headers: { Authorization: "Bearer admin-secret" },
      }),
      bindings
    );

    expect(expired.status).toBe(200);
    const expiredPayload = await expired.json() as {
      room: { expires_at: string | null; id: string; status: string };
      success: boolean;
    };
    expect(expiredPayload).toMatchObject({
      success: true,
      room: {
        id: "room_ready_01",
        status: "active",
      },
    });
    expect(new Date(expiredPayload.room.expires_at ?? "").getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("api /api/v1 room logo assets", () => {
  it("uploads a compressed logo to R2 and deletes the previously stored object", async () => {
    const r2Bucket = createMockR2Bucket();
    const form = new FormData();
    form.set("field", "left_logo_url");
    form.set("file", new Blob(["webp-image"], { type: "image/webp" }), "left-logo.webp");

    const response = await app.fetch(
      new Request("https://example.com/api/v1/rooms/room_asset_01/assets", {
        method: "POST",
        body: form,
      }),
      createBindings(
        {
          R2_ASSETS: r2Bucket,
        } as Partial<Bindings>,
        [
          {
            id: "room_asset_01",
            name: "Asset Room",
            pin: "123123",
            status: "active",
            tenant_id: "tenant_01",
          },
        ],
        [
          {
            left_logo_url: "https://cdn.example.com/old-left.webp",
            room_id: "room_asset_01",
            scoreboard_active: 0,
          },
        ],
        [],
        [],
        [
          {
            id: "asset_old_left",
            overlay_field: "left_logo_url",
            public_url: "https://cdn.example.com/old-left.webp",
            r2_key: "rooms/room_asset_01/left_logo_url/old.webp",
            room_id: "room_asset_01",
            tenant_id: "tenant_01",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      asset: { field: string; publicUrl: string; r2Key: string };
      success: boolean;
    };

    expect(payload.success).toBe(true);
    expect(payload.asset.field).toBe("left_logo_url");
    expect(payload.asset.publicUrl).toContain("/api/v1/assets/");
    expect(r2Bucket.storedKeys[0]).toMatch(/^rooms\/room_asset_01\/left_logo_url\/asset_/);
    expect(r2Bucket.deletedKeys).toEqual(["rooms/room_asset_01/left_logo_url/old.webp"]);
  });

  it("uploads a temporary ad video to R2 while preserving previous ad videos until the plan limit", async () => {
    const r2Bucket = createMockR2Bucket();
    const form = new FormData();
    form.set("field", "ad_video_url");
    form.set("file", new Blob(["mp4-video"], { type: "video/mp4" }), "promo.mp4");

    const response = await app.fetch(
      new Request("https://example.com/api/v1/rooms/room_ad_asset_01/assets", {
        method: "POST",
        body: form,
      }),
      createBindings(
        {
          R2_ASSETS: r2Bucket,
        } as Partial<Bindings>,
        [
          {
            id: "room_ad_asset_01",
            name: "Ad Asset Room",
            pin: "123124",
            status: "active",
            tenant_id: "tenant_01",
          },
        ],
        [
          {
            ad_video_url: "https://cdn.example.com/old-ad.mp4",
            room_id: "room_ad_asset_01",
            scoreboard_active: 0,
          },
        ],
        [
          {
            amount_cents: 3500,
            currency: "usd",
            duration_minutes: 360,
            id: "pass_ad_asset_01",
            package_id: "matchday-pro",
            payment_provider: "stripe",
            room_id: "room_ad_asset_01",
            status: "paid",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [
          {
            id: "asset_old_ad",
            overlay_field: "ad_video_url",
            public_url: "https://cdn.example.com/old-ad.mp4",
            r2_key: "rooms/room_ad_asset_01/ad_video_url/old.mp4",
            room_id: "room_ad_asset_01",
            tenant_id: "tenant_01",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      asset: { field: string; publicUrl: string; r2Key: string };
      success: boolean;
    };

    expect(payload.success).toBe(true);
    expect(payload.asset.field).toBe("ad_video_url");
    expect(payload.asset.publicUrl).toContain("/api/v1/assets/");
    expect(r2Bucket.storedKeys[0]).toMatch(/^rooms\/room_ad_asset_01\/ad_video_url\/asset_.*\.mp4$/);
    expect(r2Bucket.deletedKeys).toEqual([]);
  });

  it("rejects non-video files for temporary ad video uploads", async () => {
    const form = new FormData();
    form.set("field", "ad_video_url");
    form.set("file", new Blob(["not-video"], { type: "image/webp" }), "promo.webp");

    const response = await app.fetch(
      new Request("https://example.com/api/v1/rooms/room_ad_asset_02/assets", {
        method: "POST",
        body: form,
      }),
      createBindings(
        {
          R2_ASSETS: createMockR2Bucket(),
        } as Partial<Bindings>,
        [
          {
            id: "room_ad_asset_02",
            name: "Ad Asset Room",
            pin: "123125",
            status: "active",
            tenant_id: "tenant_01",
          },
        ]
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: "Ad video upload must be a video file",
    });
  });

  it("deletes temporary room assets from R2 when a room is expired", async () => {
    const r2Bucket = createMockR2Bucket();
    const response = await app.fetch(
      new Request("https://example.com/api/v1/admin/rooms/room_cleanup_01/expire", {
        method: "POST",
        headers: { Authorization: "Bearer admin-secret" },
      }),
      createBindings(
        {
          R2_ASSETS: r2Bucket,
        } as Partial<Bindings>,
        [
          {
            id: "room_cleanup_01",
            name: "Cleanup Room",
            pin: "123126",
            status: "active",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [],
        [],
        [
          {
            id: "asset_logo",
            overlay_field: "left_logo_url",
            public_url: "https://cdn.example.com/logo.webp",
            r2_key: "rooms/room_cleanup_01/left_logo_url/logo.webp",
            room_id: "room_cleanup_01",
            tenant_id: "tenant_01",
          },
          {
            id: "asset_ad",
            overlay_field: "ad_video_url",
            public_url: "https://cdn.example.com/ad.mp4",
            r2_key: "rooms/room_cleanup_01/ad_video_url/ad.mp4",
            room_id: "room_cleanup_01",
            tenant_id: "tenant_01",
          },
        ]
      )
    );

    expect(response.status).toBe(200);
    expect(r2Bucket.deletedKeys).toEqual([
      "rooms/room_cleanup_01/left_logo_url/logo.webp",
      "rooms/room_cleanup_01/ad_video_url/ad.mp4",
    ]);
  });

  it("rejects a second temporary ad video on the starter package", async () => {
    const form = new FormData();
    form.set("field", "ad_video_url");
    form.set("file", new Blob(["mp4-video"], { type: "video/mp4" }), "second.mp4");

    const response = await app.fetch(
      new Request("https://example.com/api/v1/rooms/room_starter_ads/assets", {
        method: "POST",
        body: form,
      }),
      createBindings(
        {
          R2_ASSETS: createMockR2Bucket(),
        } as Partial<Bindings>,
        [
          {
            id: "room_starter_ads",
            name: "Starter Ads",
            pin: "123127",
            status: "active",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [
          {
            amount_cents: 1500,
            currency: "usd",
            duration_minutes: 180,
            id: "pass_starter_ads",
            package_id: "starter-live",
            payment_provider: "stripe",
            room_id: "room_starter_ads",
            status: "paid",
            tenant_id: "tenant_01",
          },
        ],
        [],
        [
          {
            id: "asset_existing_ad",
            overlay_field: "ad_video_url",
            public_url: "https://cdn.example.com/ad-1.mp4",
            r2_key: "rooms/room_starter_ads/ad_video_url/ad-1.mp4",
            room_id: "room_starter_ads",
            tenant_id: "tenant_01",
          },
        ]
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: "Starter Live allows up to 1 ad video for this room",
    });
  });

  it("allows two temporary ad videos on pro and rejects the third", async () => {
    const r2Bucket = createMockR2Bucket();
    const bindings = createBindings(
      {
        R2_ASSETS: r2Bucket,
      } as Partial<Bindings>,
      [
        {
          id: "room_pro_ads",
          name: "Pro Ads",
          pin: "123128",
          status: "active",
          tenant_id: "tenant_01",
        },
      ],
      [],
      [
        {
          amount_cents: 3500,
          currency: "usd",
          duration_minutes: 360,
          id: "pass_pro_ads",
          package_id: "matchday-pro",
          payment_provider: "stripe",
          room_id: "room_pro_ads",
          status: "paid",
          tenant_id: "tenant_01",
        },
      ],
      [],
      [
        {
          id: "asset_existing_ad",
          overlay_field: "ad_video_url",
          public_url: "https://cdn.example.com/ad-1.mp4",
          r2_key: "rooms/room_pro_ads/ad_video_url/ad-1.mp4",
          room_id: "room_pro_ads",
          tenant_id: "tenant_01",
        },
      ]
    );

    const secondForm = new FormData();
    secondForm.set("field", "ad_video_url");
    secondForm.set("file", new Blob(["mp4-video-2"], { type: "video/mp4" }), "second.mp4");
    const second = await app.fetch(
      new Request("https://example.com/api/v1/rooms/room_pro_ads/assets", {
        method: "POST",
        body: secondForm,
      }),
      bindings
    );
    expect(second.status).toBe(200);

    const thirdForm = new FormData();
    thirdForm.set("field", "ad_video_url");
    thirdForm.set("file", new Blob(["mp4-video-3"], { type: "video/mp4" }), "third.mp4");
    const third = await app.fetch(
      new Request("https://example.com/api/v1/rooms/room_pro_ads/assets", {
        method: "POST",
        body: thirdForm,
      }),
      bindings
    );
    expect(third.status).toBe(403);
    expect(r2Bucket.storedKeys).toHaveLength(1);
  });
});
