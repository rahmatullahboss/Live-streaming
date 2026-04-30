import { describe, expect, it } from "vitest";

import { buildCameraTrackNames, normalizeCameraRecord } from "./sfu-room";

describe("buildCameraTrackNames", () => {
  it("creates stable video and audio names from a camera id", () => {
    expect(buildCameraTrackNames("camera-abc")).toEqual({
      audioTrackName: "camera-abc-audio",
      videoTrackName: "camera-abc-video",
    });
  });
});

describe("normalizeCameraRecord", () => {
  it("accepts active records with a video track and optional audio track", () => {
    expect(
      normalizeCameraRecord({
        audio_track_id: "cam-1-audio",
        id: "cam-1",
        is_active: 1,
        last_seen_at: "2026-04-25 10:00:00",
        session_id: "session-1",
        track_id: "cam-1-video",
      })
    ).toEqual({
      audioTrackName: "cam-1-audio",
      id: "cam-1",
      isActive: true,
      lastSeenAt: "2026-04-25 10:00:00",
      sessionId: "session-1",
      videoTrackName: "cam-1-video",
    });
  });
});
