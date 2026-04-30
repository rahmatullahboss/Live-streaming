export function parseClockSeconds(value: string | null | undefined): number {
  const trimmed = value?.trim() ?? "";
  const [minutesRaw = "0", secondsRaw = "0"] = trimmed.split(":");
  const minutes = Number.parseInt(minutesRaw, 10);
  const seconds = Number.parseInt(secondsRaw, 10);

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return 0;
  }

  return Math.max(0, minutes) * 60 + Math.max(0, Math.min(59, seconds));
}

export function formatClockSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function addClockSeconds(value: string | null | undefined, deltaSeconds: number): string {
  return formatClockSeconds(parseClockSeconds(value) + deltaSeconds);
}
