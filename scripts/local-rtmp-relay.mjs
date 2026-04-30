import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const port = Number.parseInt(process.env.LOCAL_RELAY_PORT ?? "8899", 10);
const host = process.env.LOCAL_RELAY_HOST?.trim() || "0.0.0.0";
const relayAuthToken = process.env.LOCAL_RELAY_AUTH_TOKEN?.trim() ?? "";
const relaySigningSecret = process.env.LOCAL_RELAY_SIGNING_SECRET?.trim() ?? "";
const MIN_PROBE_BYTES = 32 * 1024;
const PROBE_TIMEOUT_MS = 10000;
const DEFAULT_NO_DATA_TIMEOUT_MS = 45_000;
const MIN_NO_DATA_TIMEOUT_MS = 15_000;
const timeoutConfig = getRelayTimeoutConfig(process.env);
const videoConfig = getRelayVideoConfig(process.env);
const activeTargets = new Map();
const activeSessions = new Map();

export function getRelayTimeoutConfig(env) {
  const configuredTimeout = Number.parseInt(env.LOCAL_RELAY_NO_DATA_TIMEOUT_MS ?? "", 10);
  const noDataTimeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(configuredTimeout, MIN_NO_DATA_TIMEOUT_MS)
    : DEFAULT_NO_DATA_TIMEOUT_MS;

  return {
    noDataTimeoutMs,
  };
}

export function getRelayVideoConfig(env) {
  return {
    bitrate: env.LOCAL_RELAY_VIDEO_BITRATE?.trim() || "1500k",
    bufferSize: env.LOCAL_RELAY_VIDEO_BUFSIZE?.trim() || "3000k",
    filter: env.LOCAL_RELAY_VIDEO_FILTER?.trim() || "scale=854:480,fps=30",
    maxrate: env.LOCAL_RELAY_VIDEO_MAXRATE?.trim() || "1500k",
    preset: env.LOCAL_RELAY_X264_PRESET?.trim() || "ultrafast",
    profile: env.LOCAL_RELAY_X264_PROFILE?.trim() || "baseline",
  };
}

export function buildTargetUrl(rtmpUrl, streamKey) {
  const trimmedUrl = rtmpUrl.trim().replace(/\/+$/, "");
  const trimmedKey = streamKey.trim().replace(/^\/+/, "");
  return `${trimmedUrl}/${trimmedKey}`;
}

export function inferInputFormat(mimeType) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  return null;
}

function normalizeWebSocketData(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

function getChunkPrefix(chunk) {
  return Array.from(chunk.subarray(0, 8))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function hasExpectedHeader(chunk, mimeType) {
  if (mimeType.includes("webm")) {
    return chunk.length >= 4 && chunk[0] === 0x1a && chunk[1] === 0x45 && chunk[2] === 0xdf && chunk[3] === 0xa3;
  }

  if (mimeType.includes("mp4")) {
    return chunk.length >= 8 && chunk.subarray(4, 8).toString("ascii") === "ftyp";
  }

  return true;
}

function sanitizeTargetUrl(targetUrl) {
  const lastSlashIndex = targetUrl.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return "***";
  }
  return `${targetUrl.slice(0, lastSlashIndex + 1)}***`;
}

function verifySignedRelayToken(token, signingSecret, now = Date.now()) {
  if (!token || !signingSecret) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    return false;
  }

  const [version, encodedRoomId, expiresAtText, signature] = parts;
  const expiresAt = Number.parseInt(expiresAtText, 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return false;
  }

  const payload = `${version}.${encodedRoomId}.${expiresAtText}`;
  const expected = createHmac("sha256", signingSecret).update(payload).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function isRelayRequestAuthorized(
  requestUrl,
  requiredToken = relayAuthToken,
  signingSecret = relaySigningSecret,
  now = Date.now()
) {
  const token = requestUrl.searchParams.get("token") ?? "";
  if (signingSecret && verifySignedRelayToken(token, signingSecret, now)) {
    return true;
  }

  if (!requiredToken) {
    return true;
  }

  return token === requiredToken;
}

export function createRelaySessionState({ id, mode, mimeType, startedAt, targetUrl }) {
  return {
    bytesReceived: 0,
    ffmpegRunning: false,
    id,
    lastChunkAt: null,
    lastClientStatus: null,
    lastError: null,
    mimeType,
    mode,
    startedAt,
    targetUrl,
  };
}

export function buildRelayStatusSnapshot(sessions, now = Date.now()) {
  return {
    ok: true,
    activeSessions: sessions.map((session) => ({
      bytesReceived: session.bytesReceived,
      ffmpegRunning: session.ffmpegRunning,
      id: session.id,
      lastChunkAgeMs: session.lastChunkAt ? now - session.lastChunkAt : null,
      lastClientStatus: session.lastClientStatus,
      lastError: session.lastError,
      mimeType: session.mimeType,
      mode: session.mode,
      target: session.targetUrl ? sanitizeTargetUrl(session.targetUrl) : null,
      uptimeMs: now - session.startedAt,
    })),
  };
}

export function buildFfmpegArgs({ targetUrl, mimeType, testOutputPath = null, video = videoConfig }) {
  const inputFormat = inferInputFormat(mimeType);
  const outputTarget = targetUrl ?? testOutputPath;
  const outputFormat = testOutputPath ? "flv" : "flv";

  if (!outputTarget) {
    throw new Error("Either targetUrl or testOutputPath is required");
  }

  return [
    "-hide_banner",
    "-loglevel",
    "info",
    "-fflags",
    "+genpts",
    "-analyzeduration",
    "5000000",
    "-probesize",
    "5000000",
    ...(inputFormat ? ["-f", inputFormat] : []),
    "-i",
    "pipe:0",
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    video.filter,
    "-c:v",
    "libx264",
    "-preset",
    video.preset,
    "-tune",
    "zerolatency",
    "-profile:v",
    video.profile,
    "-pix_fmt",
    "yuv420p",
    "-b:v",
    video.bitrate,
    "-maxrate",
    video.maxrate,
    "-bufsize",
    video.bufferSize,
    "-g",
    "60",
    "-keyint_min",
    "60",
    "-sc_threshold",
    "0",
    "-r",
    "30",
    "-vsync",
    "cfr",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-b:a",
    "128k",
    "-flvflags",
    "no_duration_filesize",
    "-f",
    outputFormat,
    outputTarget,
  ];
}

function sendSocketMessage(socket, message) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function createHttpServer(relayPort, relayHost) {
  return createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", `http://localhost:${relayPort}`);
    const displayHost = relayHost === "0.0.0.0" ? "localhost" : relayHost;
    res.writeHead(200, { "Content-Type": "application/json" });

    if (requestUrl.pathname === "/status") {
      res.end(JSON.stringify(buildRelayStatusSnapshot([...activeSessions.values()])));
      return;
    }

    res.end(
      JSON.stringify({
        ok: true,
        message: "Local RTMP relay is running",
        statusUrl: `http://${displayHost}:${relayPort}/status`,
        websocketUrl: `ws://${displayHost}:${relayPort}`,
      })
    );
  });
}

export function attachRelayWebSocketServer(server) {
const wss = new WebSocketServer({ server });

wss.on("connection", (socket, request) => {
  const requestUrl = new URL(request.url ?? "/", `http://localhost:${port}`);
  const rtmpUrl = requestUrl.searchParams.get("rtmpUrl");
  const streamKey = requestUrl.searchParams.get("streamKey");
  const mimeType = requestUrl.searchParams.get("mimeType") ?? "video/webm";
  const testOutputPath = requestUrl.searchParams.get("testOutputPath");
  const mode = testOutputPath ? "test-file" : "rtmp";

  if (!isRelayRequestAuthorized(requestUrl)) {
    socket.send(JSON.stringify({ type: "error", message: "Relay authentication failed" }));
    socket.close(1008, "Relay authentication failed");
    return;
  }

  if (!testOutputPath && (!rtmpUrl || !streamKey)) {
    socket.send(JSON.stringify({ type: "error", message: "Missing rtmpUrl or streamKey" }));
    socket.close(1008, "Missing stream target");
    return;
  }

  const targetUrl = rtmpUrl && streamKey ? buildTargetUrl(rtmpUrl, streamKey) : null;
  const targetKey = targetUrl ?? testOutputPath;
  if (activeTargets.has(targetKey)) {
    socket.send(JSON.stringify({ type: "error", message: "This RTMP target is already active" }));
    socket.close(1008, "Duplicate RTMP target");
    return;
  }

  const sessionId = crypto.randomUUID();
  const sessionState = createRelaySessionState({
    id: sessionId,
    mode,
    mimeType,
    startedAt: Date.now(),
    targetUrl,
  });
  let closed = false;
  let ffmpeg = null;
  let stdinBroken = false;
  let readySent = false;
  let bufferedBytes = 0;
  const bufferedChunks = [];
  activeTargets.set(targetKey, true);
  activeSessions.set(sessionId, sessionState);

  const failRelay = (message, closeCode = 1011) => {
    sessionState.lastError = message;
    console.warn(`[relay] ${message}`);
    sendSocketMessage(socket, { type: "error", message });
    if (socket.readyState === socket.OPEN) {
      socket.close(closeCode, message);
    }
    shutdown();
  };

  const attachFfmpegHandlers = () => {
    if (!ffmpeg) {
      return;
    }

    ffmpeg.stdout.on("data", () => {
      // Suppress stdout noise; ffmpeg logs go to stderr.
    });

    ffmpeg.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        console.log(`[relay] ${message}`);
      }
    });

    ffmpeg.on("spawn", () => {
      sessionState.ffmpegRunning = true;
      console.log(`[relay] ffmpeg started -> ${targetUrl ?? testOutputPath} (${mimeType})`);
    });

    ffmpeg.on("close", (code) => {
      sessionState.ffmpegRunning = false;
      console.log(`[relay] ffmpeg stopped with code ${code ?? -1}`);
      if (socket.readyState === socket.OPEN) {
        const message = code === 0 ? "Relay stopped" : "ffmpeg exited before the broadcast stopped";
        socket.send(JSON.stringify({ type: code === 0 ? "closed" : "error", code: code ?? -1, message }));
        socket.close(code === 0 ? 1000 : 1011, message);
      }
      shutdown();
    });

    ffmpeg.on("error", (error) => {
      console.error("[relay] ffmpeg spawn failed:", error);
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "error", message: "Failed to start ffmpeg" }));
        socket.close(1011, "ffmpeg spawn failed");
      }
      shutdown();
    });

    ffmpeg.stdin.on("error", (error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "EPIPE") {
        stdinBroken = true;
        failRelay("Upstream RTMP target closed the stream", 1011);
        return;
      }

      console.error("[relay] ffmpeg stdin error:", error);
    });
  };

  const flushProbeBuffer = () => {
    if (readySent || stdinBroken) {
      return;
    }

    const firstChunk = bufferedChunks[0];
    if (!firstChunk || !hasExpectedHeader(firstChunk, mimeType)) {
      const prefix = firstChunk ? getChunkPrefix(firstChunk) : "empty";
      const message = `First media chunk is not valid ${inferInputFormat(mimeType) ?? "media"} data (prefix: ${prefix})`;
      console.warn(`[relay] ${message}`);
      socket.send(JSON.stringify({ type: "error", message }));
      socket.close(1003, "Invalid media data");
      shutdown();
      return;
    }

    ffmpeg = spawn("ffmpeg", buildFfmpegArgs({ targetUrl, mimeType, testOutputPath }), {
      stdio: ["pipe", "pipe", "pipe"],
    });
    attachFfmpegHandlers();

    readySent = true;
    socket.send(JSON.stringify({ type: "ready", mimeType, bufferedBytes }));
    for (const chunk of bufferedChunks) {
      ffmpeg.stdin.write(chunk);
    }
    bufferedChunks.length = 0;
  };

  const probeTimeout = setTimeout(() => {
    if (!readySent) {
      failRelay("No valid media data reached relay within 10 seconds", 1011);
    }
  }, PROBE_TIMEOUT_MS);

  const noDataInterval = setInterval(() => {
    if (!readySent || !sessionState.lastChunkAt) {
      return;
    }

    if (Date.now() - sessionState.lastChunkAt > timeoutConfig.noDataTimeoutMs) {
      failRelay(`No media chunks received for ${timeoutConfig.noDataTimeoutMs}ms`, 1011);
    }
  }, 1000);

  const shutdown = () => {
    if (closed) return;
    closed = true;
    clearTimeout(probeTimeout);
    clearInterval(noDataInterval);
    activeTargets.delete(targetKey);
    activeSessions.delete(sessionId);
    socket.removeAllListeners();
    if (ffmpeg && !ffmpeg.stdin.destroyed && !stdinBroken) {
      ffmpeg.stdin.end();
    }
    if (ffmpeg && !ffmpeg.killed) {
      ffmpeg.kill("SIGTERM");
    }
  };

  socket.on("message", (data, isBinary) => {
    if (!isBinary) {
      try {
        const message = JSON.parse(data.toString());
        if (message && typeof message === "object" && message.type === "client-status") {
          sessionState.lastClientStatus = message;
          if (message.level === "warning") {
            console.warn(`[relay] client warning: ${JSON.stringify(message)}`);
          }
        }
      } catch {
        // Ignore malformed client status messages.
      }
      return;
    }

    const chunk = normalizeWebSocketData(data);
    sessionState.bytesReceived += chunk.byteLength;
    sessionState.lastChunkAt = Date.now();
    if (!readySent) {
      bufferedChunks.push(chunk);
      bufferedBytes += chunk.byteLength;
      if (bufferedBytes >= MIN_PROBE_BYTES) {
        flushProbeBuffer();
      }
      return;
    }

    if (ffmpeg && !ffmpeg.stdin.destroyed && !stdinBroken) {
      ffmpeg.stdin.write(chunk);
    }
  });

  socket.on("close", () => {
    shutdown();
  });

  socket.on("error", (error) => {
    console.error("[relay] WebSocket error:", error);
    shutdown();
  });
});
return wss;
}

export function startRelayServer(relayPort = port, relayHost = host) {
  const server = createHttpServer(relayPort, relayHost);
  attachRelayWebSocketServer(server);
  server.listen(relayPort, relayHost, () => {
    const displayHost = relayHost === "0.0.0.0" ? "localhost" : relayHost;
    console.log(`[relay] Listening on ws://${displayHost}:${relayPort}`);
    console.log(`[relay] Status: http://${displayHost}:${relayPort}/status`);
  });
  return server;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  startRelayServer(port, host);
}
