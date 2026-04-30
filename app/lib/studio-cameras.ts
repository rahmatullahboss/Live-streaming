import type { CameraSource } from "./sfu-room";

export type DirectorCameraStatus = "error" | "pulling" | "ready";

export type DirectorCameraState = CameraSource & {
  error: string | null;
  status: DirectorCameraStatus;
  stream: MediaStream | null;
};

function sourceChanged(current: DirectorCameraState, next: CameraSource): boolean {
  return (
    current.sessionId !== next.sessionId ||
    current.videoTrackName !== next.videoTrackName ||
    current.audioTrackName !== next.audioTrackName
  );
}

export function getCameraSourceKey(camera: CameraSource): string {
  return [
    camera.id,
    camera.sessionId,
    camera.videoTrackName,
    camera.audioTrackName ?? "no-audio",
  ].join(":");
}

function hasLiveVideo(stream: MediaStream | null): boolean {
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"));
}

export function isDirectorCameraPlayable(camera: DirectorCameraState | null): boolean {
  if (!camera || camera.status !== "ready") {
    return false;
  }

  if (!camera.stream) {
    return true;
  }

  return hasLiveVideo(camera.stream);
}

export function reconcilePulledCameras(
  current: DirectorCameraState[],
  latestCameras: CameraSource[]
): DirectorCameraState[] {
  const currentById = new Map(current.map((camera) => [camera.id, camera]));

  return latestCameras.map((camera) => {
    const existing = currentById.get(camera.id);
    if (!existing) {
      return { ...camera, error: null, status: "pulling", stream: null };
    }

    if (sourceChanged(existing, camera) || !isDirectorCameraPlayable(existing)) {
      return { ...camera, error: null, status: "pulling", stream: null };
    }

    return { ...existing, ...camera };
  });
}

export function chooseDirectorCameraId(
  selectedCameraId: string | null,
  cameras: DirectorCameraState[]
): string | null {
  const selectedCamera = cameras.find((camera) => camera.id === selectedCameraId) ?? null;
  if (isDirectorCameraPlayable(selectedCamera)) {
    return selectedCameraId;
  }

  const readyCamera = cameras.find((camera) => isDirectorCameraPlayable(camera));
  return readyCamera?.id ?? cameras[0]?.id ?? null;
}
