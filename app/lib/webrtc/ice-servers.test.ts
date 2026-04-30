import { describe, expect, it } from "vitest";

import { DEFAULT_ICE_SERVERS, sanitizeIceServers } from "./ice-servers";

describe("sanitizeIceServers", () => {
  it("falls back to the default STUN server when none are provided", () => {
    expect(sanitizeIceServers(undefined)).toEqual(DEFAULT_ICE_SERVERS);
  });

  it("filters out browser-hostile port 53 URLs while keeping relay credentials", () => {
    expect(
      sanitizeIceServers([
        {
          urls: [
            "stun:stun.cloudflare.com:3478",
            "stun:stun.cloudflare.com:53",
            "turn:turn.cloudflare.com:3478?transport=udp",
            "turn:turn.cloudflare.com:53?transport=udp",
          ],
          username: "user",
          credential: "secret",
        },
      ])
    ).toEqual([
      {
        urls: [
          "stun:stun.cloudflare.com:3478",
          "turn:turn.cloudflare.com:3478?transport=udp",
        ],
        username: "user",
        credential: "secret",
      },
    ]);
  });

  it("deduplicates URLs and drops empty servers", () => {
    expect(
      sanitizeIceServers([
        {
          urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:3478"],
        },
        {
          urls: ["turn:turn.cloudflare.com:53?transport=udp"],
        },
      ])
    ).toEqual([
      {
        urls: ["stun:stun.cloudflare.com:3478"],
      },
    ]);
  });
});
