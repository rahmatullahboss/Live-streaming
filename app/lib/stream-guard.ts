import type { OverlayConfig } from "./realtime";

export type StudioVisibilityState = "hidden" | "visible";

export type StreamGuardState = {
  level: "idle" | "ok" | "warning";
  message: string;
  title: string;
};

export type RelayStatusLike = "idle" | "live" | "starting" | "stopping";

export function getProgramBadgeLabel(
  programSource: OverlayConfig["program_source"],
  adTitle: string | null | undefined
): string {
  if (programSource === "ad") {
    return adTitle?.trim() || "Commercial Break";
  }

  return "Live";
}

export function getStreamGuardState(
  isRelayLive: boolean,
  visibilityState: StudioVisibilityState,
  wasHiddenWhileLive: boolean
): StreamGuardState {
  if (!isRelayLive) {
    return {
      level: "idle",
      message: "",
      title: "",
    };
  }

  if (visibilityState === "hidden" || wasHiddenWhileLive) {
    return {
      level: "warning",
      message: "This tab was backgrounded during the stream. Keep it foreground to avoid dropped frames.",
      title: "Stream quality at risk",
    };
  }

  return {
    level: "ok",
    message: "Keep this director dashboard visible and in the foreground while streaming.",
    title: "Foreground required",
  };
}

export function getRelayStatusText(status: RelayStatusLike, errorMessage: string | null): string {
  if (errorMessage?.trim()) {
    return errorMessage.trim();
  }

  if (status === "live") {
    return "Streaming Active";
  }

  if (status === "starting") {
    return "Starting relay...";
  }

  if (status === "stopping") {
    return "Stopping relay...";
  }

  return "Waiting for Input";
}
