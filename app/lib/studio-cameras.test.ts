import { describe, expect, it } from "vitest";

import type { CameraSource } from "./sfu-room";
import {
  chooseDirectorCameraId,
  getCameraSourceKey,
  reconcilePulledCameras,
  type DirectorCameraState,
} from "./studio-cameras";

function liveStream(): MediaStream {
  return {
    getVideoTracks: () => [{ readyState: "live" }],
  } as unknown as MediaStream;
}

function camera(overrides: Partial<CameraSource> & Pick<CameraSource, "id">): CameraSource {
  const { id, ...rest } = overrides;
  return {
    audioTrackName: null,
    id,
    isActive: true,
    lastSeenAt: "2026-04-26 10:00:00",
    sessionId: "session-1",
    videoTrackName: `${id}-video`,
    ...rest,
  };
}

function directorCamera(overrides: Partial<DirectorCameraState> & Pick<DirectorCameraState, "id">): DirectorCameraState {
  return {
    ...camera({ id: overrides.id }),
    error: null,
    status: "ready",
    stream: null,
    ...overrides,
  };
}

describe("reconcilePulledCameras", () => {
  it("re-pulls a camera when its SFU session changes", () => {
    const current = [
      directorCamera({
        id: "cam-1",
        sessionId: "old-session",
        stream: liveStream(),
        videoTrackName: "cam-1-video",
      }),
    ];

    expect(
      reconcilePulledCameras(current, [
        camera({ id: "cam-1", sessionId: "new-session", videoTrackName: "cam-1-video" }),
      ])
    ).toEqual([
      expect.objectContaining({
        id: "cam-1",
        sessionId: "new-session",
        status: "pulling",
        stream: null,
      }),
    ]);
  });
});

describe("chooseDirectorCameraId", () => {
  it("switches away from a selected camera that disappeared after reconnect", () => {
    const cameras = [
      directorCamera({ id: "new-camera", status: "ready", stream: liveStream() }),
    ];

    expect(chooseDirectorCameraId("old-camera", cameras)).toBe("new-camera");
  });
});

describe("getCameraSourceKey", () => {
  it("changes when a phone rejoins with a new SFU session", () => {
    const firstJoin = camera({ id: "cam-1", sessionId: "session-1" });
    const secondJoin = camera({ id: "cam-1", sessionId: "session-2" });

    expect(getCameraSourceKey(firstJoin)).not.toBe(getCameraSourceKey(secondJoin));
  });
});
