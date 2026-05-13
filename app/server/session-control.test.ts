import { describe, expect, it, vi } from "vitest";
import app from "./api";

// Helper to create a mock D1 binding for testing pause/resume
function createMockBindings(roomOverrides = {}) {
  const tenant = {
    id: "tenant_123",
    email: "user@example.com",
    access_token: "mock_token"
  };

  const room = {
    id: "room_123",
    name: "Test Room",
    pin: "1234",
    status: "active",
    is_paused: 0,
    total_seconds_used: 100,
    tenant_id: "tenant_123",
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    session_started_at: new Date(Date.now() - 100000).toISOString(),
    ...roomOverrides
  };

  const db = {
    prepare: vi.fn().mockImplementation((sql: string) => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async () => {
        const s = sql.toLowerCase();
        if (s.includes("tenants")) return tenant;
        if (s.includes("sum(duration_minutes)")) return { total_minutes: 1000 };
        if (s.includes("rooms")) return room;
        return null;
      }),
      run: vi.fn().mockResolvedValue({ success: true }),
      all: vi.fn().mockImplementation(async () => {
        if (sql.toLowerCase().includes("rooms")) return { results: [room] };
        return { results: [] };
      })
    }))
  };

  return {
    DB: db as any,
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD: "password"
  };
}

describe("API Session Control", () => {
  it("pauses a live room session", async () => {
    const bindings = createMockBindings({ status: "active", is_paused: 0 });
    const response = await app.fetch(
      new Request("https://example.com/api/v1/rooms/room_123/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "mock_token" })
      }),
      bindings as any
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { room: { is_paused: number }; success: boolean };
    expect(body).toMatchObject({
      success: true,
      room: expect.objectContaining({
        is_paused: 1
      })
    });
  });

  it("resumes a paused room session", async () => {
    const bindings = createMockBindings({ 
      status: "active", 
      is_paused: 1,
      paused_at: new Date().toISOString()
    });
    const response = await app.fetch(
      new Request("https://example.com/api/v1/rooms/room_123/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "mock_token" })
      }),
      bindings as any
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { room: { is_paused: number }; success: boolean };
    expect(body).toMatchObject({
      success: true,
      room: expect.objectContaining({
        is_paused: 0
      })
    });
  });

  it("is idempotent when pausing a room that is already paused", async () => {
    const bindings = createMockBindings({ status: "active", is_paused: 1 });
    const response = await app.fetch(
      new Request("https://example.com/api/v1/rooms/room_123/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "mock_token" })
      }),
      bindings as any
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { room: { is_paused: number }; success: boolean };
    expect(body.success).toBe(true);
    expect(body.room.is_paused).toBe(1);
  });
});
