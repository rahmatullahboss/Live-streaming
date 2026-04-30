import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

import {
  buildFfmpegArgs,
  buildRelayStatusSnapshot,
  buildTargetUrl,
  createRelaySessionState,
  getRelayTimeoutConfig,
  getRelayVideoConfig,
  isRelayRequestAuthorized,
} from "./local-rtmp-relay.mjs";

function createSignedRelayToken(roomId, expiresAtMs, secret) {
  const encodedRoomId = Buffer.from(roomId, "utf8").toString("base64url");
  const payload = `v1.${encodedRoomId}.${expiresAtMs}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

describe("local RTMP relay helpers", () => {
  it("builds an RTMP target URL without duplicate slashes around the stream key", () => {
    expect(buildTargetUrl("rtmp://a.rtmp.youtube.com/live2/", "/abc-123")).toBe(
      "rtmp://a.rtmp.youtube.com/live2/abc-123"
    );
  });

  it("builds a local ffmpeg test output when no RTMP target is provided", () => {
    const args = buildFfmpegArgs({
      mimeType: "video/webm;codecs=vp8,opus",
      targetUrl: null,
      testOutputPath: "/tmp/live-studio-test.flv",
    });

    expect(args).toContain("/tmp/live-studio-test.flv");
    expect(args.slice(-3)).toEqual(["-f", "flv", "/tmp/live-studio-test.flv"]);
  });

  it("uses ffmpeg 4.x compatible constant frame-rate arguments", () => {
    const args = buildFfmpegArgs({
      mimeType: "video/webm;codecs=vp8,opus",
      targetUrl: "rtmp://a.rtmp.youtube.com/live2/key",
    });

    expect(args).not.toContain("-fps_mode");
    expect(args).toContain("-vsync");
    expect(args.slice(args.indexOf("-vsync"), args.indexOf("-vsync") + 2)).toEqual(["-vsync", "cfr"]);
  });

  it("uses low-cpu YouTube-friendly H.264 settings for realtime VPS output", () => {
    const args = buildFfmpegArgs({
      mimeType: "video/webm;codecs=vp8,opus",
      targetUrl: "rtmp://a.rtmp.youtube.com/live2/key",
    });

    expect(args.slice(args.indexOf("-preset"), args.indexOf("-preset") + 2)).toEqual(["-preset", "ultrafast"]);
    expect(args.slice(args.indexOf("-profile:v"), args.indexOf("-profile:v") + 2)).toEqual(["-profile:v", "baseline"]);
    expect(args.slice(args.indexOf("-vf"), args.indexOf("-vf") + 2)).toEqual(["-vf", "scale=854:480,fps=30"]);
    expect(args.slice(args.indexOf("-b:v"), args.indexOf("-b:v") + 2)).toEqual(["-b:v", "1500k"]);
    expect(args.slice(args.indexOf("-maxrate"), args.indexOf("-maxrate") + 2)).toEqual(["-maxrate", "1500k"]);
  });

  it("allows a high-quality local relay profile through environment settings", () => {
    const video = getRelayVideoConfig({
      LOCAL_RELAY_VIDEO_BITRATE: "4000k",
      LOCAL_RELAY_VIDEO_BUFSIZE: "8000k",
      LOCAL_RELAY_VIDEO_FILTER: "scale=1280:720,fps=30",
      LOCAL_RELAY_VIDEO_MAXRATE: "4000k",
      LOCAL_RELAY_X264_PROFILE: "high",
      LOCAL_RELAY_X264_PRESET: "veryfast",
    });
    const args = buildFfmpegArgs({
      mimeType: "video/webm;codecs=vp8,opus",
      targetUrl: "rtmp://a.rtmp.youtube.com/live2/key",
      video,
    });

    expect(args.slice(args.indexOf("-vf"), args.indexOf("-vf") + 2)).toEqual(["-vf", "scale=1280:720,fps=30"]);
    expect(args.slice(args.indexOf("-preset"), args.indexOf("-preset") + 2)).toEqual(["-preset", "veryfast"]);
    expect(args.slice(args.indexOf("-profile:v"), args.indexOf("-profile:v") + 2)).toEqual(["-profile:v", "high"]);
    expect(args.slice(args.indexOf("-b:v"), args.indexOf("-b:v") + 2)).toEqual(["-b:v", "4000k"]);
  });

  it("keeps the production no-data timeout above short browser encoder stalls", () => {
    expect(getRelayTimeoutConfig({}).noDataTimeoutMs).toBe(45_000);
    expect(getRelayTimeoutConfig({ LOCAL_RELAY_NO_DATA_TIMEOUT_MS: "8000" }).noDataTimeoutMs).toBe(15_000);
    expect(getRelayTimeoutConfig({ LOCAL_RELAY_NO_DATA_TIMEOUT_MS: "60000" }).noDataTimeoutMs).toBe(60_000);
  });

  it("exposes relay status without leaking stream keys", () => {
    const state = createRelaySessionState({
      id: "session-1",
      mode: "rtmp",
      mimeType: "video/webm",
      startedAt: 1000,
      targetUrl: "rtmp://a.rtmp.youtube.com/live2/secret-key",
    });
    state.bytesReceived = 4096;
    state.ffmpegRunning = true;
    state.lastChunkAt = 2500;

    expect(buildRelayStatusSnapshot([state], 4000)).toEqual({
      ok: true,
      activeSessions: [
        expect.objectContaining({
          bytesReceived: 4096,
          ffmpegRunning: true,
          lastChunkAgeMs: 1500,
          target: "rtmp://a.rtmp.youtube.com/live2/***",
          uptimeMs: 3000,
        }),
      ],
    });
  });

  it("requires the relay auth token when configured", () => {
    expect(
      isRelayRequestAuthorized(new URL("ws://relay.example/live?token=secret"), "secret")
    ).toBe(true);
    expect(
      isRelayRequestAuthorized(new URL("ws://relay.example/live?token=wrong"), "secret")
    ).toBe(false);
    expect(
      isRelayRequestAuthorized(new URL("ws://relay.example/live"), "")
    ).toBe(true);
  });

  it("accepts an unexpired signed room relay token without exposing the shared secret", () => {
    const token = createSignedRelayToken("room-01", 2000, "shared-secret");

    expect(
      isRelayRequestAuthorized(
        new URL(`ws://relay.example/live?token=${encodeURIComponent(token)}`),
        "legacy-token",
        "shared-secret",
        1000
      )
    ).toBe(true);
  });

  it("rejects expired or tampered signed room relay tokens", () => {
    const expiredToken = createSignedRelayToken("room-01", 999, "shared-secret");
    const validToken = createSignedRelayToken("room-01", 2000, "shared-secret");
    const tamperedToken = `${validToken.slice(0, -1)}x`;

    expect(
      isRelayRequestAuthorized(
        new URL(`ws://relay.example/live?token=${encodeURIComponent(expiredToken)}`),
        "legacy-token",
        "shared-secret",
        1000
      )
    ).toBe(false);
    expect(
      isRelayRequestAuthorized(
        new URL(`ws://relay.example/live?token=${encodeURIComponent(tamperedToken)}`),
        "legacy-token",
        "shared-secret",
        1000
      )
    ).toBe(false);
  });
});
