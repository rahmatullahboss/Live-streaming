import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientDiagnostics } from "./client-diagnostics";

describe("Client Diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends diagnostics using fetch if navigator.sendBeacon is unavailable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});

    const diag = createClientDiagnostics("test-scope");
    diag.info("test-event", { key: "value" });

    expect(fetchMock).toHaveBeenCalled();
    const callBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(callBody.event).toBe("test-event");
    expect(callBody.scope).toBe("test-scope");
    expect(callBody.details.key).toBe("value");
  });

  it("trims long text in events and details", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});

    const longText = "a".repeat(400);
    const diag = createClientDiagnostics("test-scope");
    diag.error("very-long-event-" + longText, { longKey: longText });

    const callBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(callBody.event.length).toBeLessThan(400);
    expect(callBody.details.longKey.length).toBeLessThan(400);
    expect(callBody.details.longKey).toContain("…");
  });

  it("handles Errors in details", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});

    const diag = createClientDiagnostics("test-scope");
    diag.warn("failed", { error: new Error("Boom") });

    const callBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(callBody.details.error).toBe("Boom");
  });

  it("limits number of detail entries", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});

    const diag = createClientDiagnostics("test-scope");
    const manyDetails: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      manyDetails[`key${i}`] = i;
    }

    diag.info("many", manyDetails);

    const callBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(Object.keys(callBody.details).length).toBe(12); // MAX_DETAILS_ENTRIES
  });
});
