import { afterEach, describe, expect, it, vi } from "vitest";
import { updateAdminPackage, type AdminPackageUpdate, type StreamingPackage } from "./realtime";

describe("realtime admin package functions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockPackage: StreamingPackage = {
    active: 1,
    currency: "bdt",
    description: "Test package",
    duration_minutes: 180,
    features: ["feature 1", "feature 2"],
    id: "test-pkg",
    max_ad_videos: 2,
    max_cameras: 3,
    max_rooms: 1,
    name: "Test Package",
    price_cents: 15000,
    sort_order: 10,
  };

  it("sends PATCH request to the correct endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: true, package: mockPackage }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateAdminPackage("test-pkg", { name: "Updated" });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/admin/packages/test-pkg", {
      body: JSON.stringify({ name: "Updated" }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    expect(result.name).toBe("Test Package");
  });

  it("sends price_cents and max_ad_videos in the request body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: true, package: mockPackage }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const input: AdminPackageUpdate = {
      price_cents: 25000,
      max_ad_videos: 5,
      max_rooms: 3,
    };

    await updateAdminPackage("test-pkg", input);

    const callBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(callBody).toEqual({
      price_cents: 25000,
      max_ad_videos: 5,
      max_rooms: 3,
    });
  });

  it("throws an error when the API returns a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: "Not authorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(updateAdminPackage("test-pkg", { name: "Hack" })).rejects.toThrow("Not authorized");
  });

  it("throws an error on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("Network error"))
    );

    await expect(updateAdminPackage("test-pkg", { name: "Fail" })).rejects.toThrow("Network error");
  });
});
