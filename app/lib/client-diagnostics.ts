type DiagnosticLevel = "info" | "warn" | "error";

type PrimitiveDiagnosticValue = boolean | null | number | string;

type DiagnosticDetails = Record<string, PrimitiveDiagnosticValue>;

type DiagnosticPayload = {
  details?: DiagnosticDetails;
  event: string;
  level: DiagnosticLevel;
  scope: string;
  ts: string;
};

const MAX_EVENT_LENGTH = 120;
const MAX_SCOPE_LENGTH = 60;
const MAX_STRING_LENGTH = 300;
const MAX_DETAILS_ENTRIES = 12;

function trimText(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function normalizeDetailValue(value: unknown): PrimitiveDiagnosticValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return trimText(value, MAX_STRING_LENGTH);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return trimText(value.message, MAX_STRING_LENGTH);
  }

  try {
    return trimText(JSON.stringify(value), MAX_STRING_LENGTH);
  } catch {
    return trimText(String(value), MAX_STRING_LENGTH);
  }
}

function sanitizeDetails(details?: Record<string, unknown>): DiagnosticDetails | undefined {
  if (!details) {
    return undefined;
  }

  const entries = Object.entries(details).slice(0, MAX_DETAILS_ENTRIES);
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    entries.map(([key, value]) => [trimText(key, 40), normalizeDetailValue(value)])
  );
}

function sendDiagnostic(payload: DiagnosticPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    const sent = navigator.sendBeacon("/api/diagnostics", blob);
    if (sent) {
      return;
    }
  }

  void fetch("/api/diagnostics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Diagnostics must never break the media pipeline.
  });
}

export function createClientDiagnostics(scope: string) {
  const normalizedScope = trimText(scope, MAX_SCOPE_LENGTH);

  const emit = (level: DiagnosticLevel, event: string, details?: Record<string, unknown>) => {
    sendDiagnostic({
      event: trimText(event, MAX_EVENT_LENGTH),
      level,
      scope: normalizedScope,
      ts: new Date().toISOString(),
      details: sanitizeDetails(details),
    });
  };

  return {
    error: (event: string, details?: Record<string, unknown>) => emit("error", event, details),
    info: (event: string, details?: Record<string, unknown>) => emit("info", event, details),
    warn: (event: string, details?: Record<string, unknown>) => emit("warn", event, details),
  };
}
