import { describe, expect, it } from "vitest";

import {
  RELAY_RECORDER_TIMESLICE_MS,
  RELAY_SOCKET_BACKPRESSURE_LIMIT_BYTES,
  createRelayRecorderOptions,
  shouldDelayRelaySend,
  buildWebSocketUrl,
} from "./local-relay";

describe("buildWebSocketUrl", () => {
  it("preserves managed relay token params and adds the room id per broadcast session", () => {
    const url = buildWebSocketUrl(
      {
        relayUrl: "wss://relay.example.com/live?token=signed-token",
        roomId: "room-01",
        rtmpUrl: "rtmp://a.rtmp.youtube.com/live2",
        streamKey: "youtube-key",
      },
      "video/webm"
    );

    expect(url).toBe(
      "wss://relay.example.com/live?token=signed-token&mimeType=video%2Fwebm&roomId=room-01&rtmpUrl=rtmp%3A%2F%2Fa.rtmp.youtube.com%2Flive2&streamKey=youtube-key"
    );
  });

  it("adds local relay test output path without requiring a stream key target", () => {
    const url = buildWebSocketUrl(
      {
        relayUrl: "ws://localhost:8899",
        roomId: "demo-room",
        rtmpUrl: "",
        streamKey: "",
        testOutputPath: "/tmp/live-studio-test.flv",
      },
      "video/webm;codecs=vp8,opus"
    );

    expect(url).toBe(
      "ws://localhost:8899/?mimeType=video%2Fwebm%3Bcodecs%3Dvp8%2Copus&roomId=demo-room&testOutputPath=%2Ftmp%2Flive-studio-test.flv"
    );
  });

  it("uses low-latency recorder settings that reduce VPS tunnel stalls", () => {
    expect(RELAY_RECORDER_TIMESLICE_MS).toBe(500);
    expect(createRelayRecorderOptions("video/webm;codecs=vp8,opus")).toEqual({
      audioBitsPerSecond: 128_000,
      mimeType: "video/webm;codecs=vp8,opus",
      videoBitsPerSecond: 2_500_000,
    });
  });

  it("detects websocket backpressure before sending more media chunks", () => {
    expect(shouldDelayRelaySend(RELAY_SOCKET_BACKPRESSURE_LIMIT_BYTES - 1)).toBe(false);
    expect(shouldDelayRelaySend(RELAY_SOCKET_BACKPRESSURE_LIMIT_BYTES)).toBe(true);
  });
});
