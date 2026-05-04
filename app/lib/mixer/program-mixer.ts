export type ProgramMediaPolicyInput = {
  adVideoUrl: string;
  programSource: "ad" | "live" | undefined;
};

export type ProgramMediaPolicy = {
  adAudioEnabled: boolean;
  liveAudioEnabled: boolean;
  videoSource: "ad" | "live";
};

export function getProgramMediaPolicy({
  adVideoUrl,
  programSource,
}: ProgramMediaPolicyInput): ProgramMediaPolicy {
  const hasAdVideo = Boolean(adVideoUrl.trim());
  const useAd = programSource === "ad" && hasAdVideo;

  return {
    adAudioEnabled: useAd,
    liveAudioEnabled: !useAd,
    videoSource: useAd ? "ad" : "live",
  };
}

export const CAMERA_CROSSFADE_MS = 450;

export function getCameraCrossfadeOpacity(
  elapsedMs: number,
  durationMs: number = CAMERA_CROSSFADE_MS
): number {
  if (durationMs <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}
