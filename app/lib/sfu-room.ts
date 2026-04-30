import { readApi } from "~/lib/realtime";

export type CameraRecord = {
  audio_track_id?: string | null;
  id?: string | null;
  is_active?: number | null;
  last_seen_at?: string | null;
  session_id?: string | null;
  track_id?: string | null;
};

export type CameraSource = {
  audioTrackName: string | null;
  id: string;
  isActive: boolean;
  lastSeenAt: string | null;
  sessionId: string;
  videoTrackName: string;
};

export type CameraTrackNames = {
  audioTrackName: string;
  videoTrackName: string;
};

export function buildCameraTrackNames(cameraId: string): CameraTrackNames {
  return {
    audioTrackName: `${cameraId}-audio`,
    videoTrackName: `${cameraId}-video`,
  };
}

export function createCameraId(): string {
  return `camera-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function normalizeCameraRecord(record: CameraRecord): CameraSource | null {
  if (!record.id || !record.session_id || !record.track_id) {
    return null;
  }

  return {
    audioTrackName: record.audio_track_id ?? null,
    id: record.id,
    isActive: record.is_active === 1,
    lastSeenAt: record.last_seen_at ?? null,
    sessionId: record.session_id,
    videoTrackName: record.track_id,
  };
}

export async function getRoomCameras(roomId: string): Promise<CameraSource[]> {
  const response = await fetch(`/api/rooms/${roomId}/cameras`);
  const payload = await readApi<{ cameras: CameraRecord[] }>(response);
  return payload.cameras
    .map((camera) => normalizeCameraRecord(camera))
    .filter((camera): camera is CameraSource => camera !== null);
}

export async function registerRoomCamera(
  roomId: string,
  payload: {
    audioTrackName: string | null;
    id: string;
    sessionId: string;
    videoTrackName: string;
  }
): Promise<void> {
  const response = await fetch(`/api/rooms/${roomId}/cameras`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await readApi<{ saved: boolean }>(response);
}

export async function heartbeatRoomCamera(roomId: string, cameraId: string): Promise<void> {
  const response = await fetch(`/api/rooms/${roomId}/cameras/${cameraId}/heartbeat`, {
    method: "PUT",
  });
  await readApi<{ heartbeat: boolean }>(response);
}

export async function removeRoomCamera(roomId: string, cameraId: string): Promise<void> {
  const response = await fetch(`/api/rooms/${roomId}/cameras/${cameraId}`, {
    method: "DELETE",
  });
  await readApi<{ removed: boolean }>(response);
}
