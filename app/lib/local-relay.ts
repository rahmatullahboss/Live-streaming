export interface LocalRelayOptions {
  onRelayMessage?: (message: RelayMessage) => void;
  relayUrl: string;
  roomId?: string;
  rtmpUrl: string;
  streamKey: string;
  testOutputPath?: string;
}

type RelayMessage = {
  code?: number;
  type?: string;
  message?: string;
};

export const RELAY_RECORDER_TIMESLICE_MS = 500;
export const RELAY_RECORDER_FLUSH_MS = 1_000;
export const RELAY_RECORDER_STALE_WARNING_MS = 5_000;
export const RELAY_SOCKET_BACKPRESSURE_LIMIT_BYTES = 4 * 1024 * 1024;
const RELAY_SOCKET_BACKPRESSURE_POLL_MS = 100;
const RELAY_SOCKET_BACKPRESSURE_MAX_WAIT_MS = 5_000;

export function createRelayRecorderOptions(mimeType: string): MediaRecorderOptions {
  return {
    audioBitsPerSecond: 128_000,
    mimeType,
    videoBitsPerSecond: 2_500_000,
  };
}

export function shouldDelayRelaySend(
  bufferedAmount: number,
  limitBytes: number = RELAY_SOCKET_BACKPRESSURE_LIMIT_BYTES
): boolean {
  return bufferedAmount >= limitBytes;
}

export function buildWebSocketUrl(options: LocalRelayOptions, mimeType: string): string {
  const baseUrl = options.relayUrl.trim();
  const websocketUrl = new URL(baseUrl);
  websocketUrl.searchParams.set("mimeType", mimeType);
  if (options.roomId?.trim()) {
    websocketUrl.searchParams.set("roomId", options.roomId.trim());
  }
  if (options.testOutputPath?.trim()) {
    websocketUrl.searchParams.set("testOutputPath", options.testOutputPath.trim());
    return websocketUrl.toString();
  }

  websocketUrl.searchParams.set("rtmpUrl", options.rtmpUrl.trim());
  websocketUrl.searchParams.set("streamKey", options.streamKey.trim());
  return websocketUrl.toString();
}

export class LocalRelayBroadcaster {
  private mediaRecorder: MediaRecorder | null = null;
  private recorderFlushInterval: number | null = null;
  private sendQueue: Promise<void> = Promise.resolve();
  private socket: WebSocket | null = null;
  private isBroadcasting = false;
  private stopRequested = false;

  async start(stream: MediaStream, options: LocalRelayOptions): Promise<void> {
    if (this.isBroadcasting) {
      throw new Error("Local relay broadcast is already active");
    }

    const mimeType = this.getSupportedMimeType();
    if (!mimeType) {
      throw new Error("This browser does not support MediaRecorder WebM output");
    }

    const url = buildWebSocketUrl(options, mimeType);
    this.stopRequested = false;

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      let settled = false;
      let recorder: MediaRecorder | null = null;
      let lastMediaChunkAt = Date.now();
      let lastStatusWarningAt = 0;

      const failStart = (error: Error) => {
        if (!settled) {
          settled = true;
          if (recorder && recorder.state !== "inactive") {
            recorder.stop();
          }
          this.clearRecorderFlushInterval();
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(1011, "Broadcast start failed");
          }
          reject(error);
        }
      };

      const failActiveBroadcast = (message: string) => {
        if (!settled) {
          failStart(new Error(message));
          return;
        }

        options.onRelayMessage?.({ type: "error", message });
        this.stop();
      };

      const sendClientStatus = (level: "info" | "warning", message: string) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(
          JSON.stringify({
            bufferedAmount: socket.bufferedAmount,
            documentHidden: typeof document === "undefined" ? false : document.hidden,
            level,
            message,
            recorderState: recorder?.state ?? "inactive",
            secondsSinceMediaChunk: Math.round((Date.now() - lastMediaChunkAt) / 1000),
            type: "client-status",
            videoTrackStates: stream.getVideoTracks().map((track) => ({
              enabled: track.enabled,
              muted: track.muted,
              readyState: track.readyState,
            })),
          })
        );
      };

      const handleOpen = () => {
        this.socket = socket;

        recorder = new MediaRecorder(stream, createRelayRecorderOptions(mimeType));

        recorder.ondataavailable = (event) => {
          if (!event.data || event.data.size === 0 || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
          }

          lastMediaChunkAt = Date.now();
          const pendingSend = this.sendQueue.then(async () => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
              return;
            }

            await this.waitForWritableSocket(this.socket);
            const buffer = await event.data.arrayBuffer();
            if (this.socket.readyState === WebSocket.OPEN) {
              this.socket.send(buffer);
            }
          });

          this.sendQueue = pendingSend.catch(() => undefined);
          void pendingSend.catch((sendError: unknown) => {
            failActiveBroadcast(
              sendError instanceof Error ? sendError.message : "Could not send media chunk to relay"
            );
          });
        };

        recorder.onerror = () => {
          failActiveBroadcast("MediaRecorder failed to encode the mixed stream");
        };

        recorder.onstop = () => {
          if (!this.stopRequested && this.isBroadcasting) {
            failActiveBroadcast("MediaRecorder stopped before the relay was stopped");
          }
        };

        recorder.start(RELAY_RECORDER_TIMESLICE_MS);
        this.mediaRecorder = recorder;
        this.recorderFlushInterval = window.setInterval(() => {
          if (recorder?.state === "recording") {
            recorder.requestData();
            const staleForMs = Date.now() - lastMediaChunkAt;
            if (staleForMs > RELAY_RECORDER_STALE_WARNING_MS && Date.now() - lastStatusWarningAt > RELAY_RECORDER_STALE_WARNING_MS) {
              lastStatusWarningAt = Date.now();
              sendClientStatus("warning", "Browser recorder has not produced a media chunk recently");
            }
          }
        }, RELAY_RECORDER_FLUSH_MS);
        this.isBroadcasting = true;
      };

      const handleError = () => {
        failStart(new Error("Could not connect to the local relay server"));
      };

      socket.addEventListener("open", handleOpen, { once: true });
      socket.addEventListener("error", handleError, { once: true });
      socket.addEventListener("close", () => {
        if (!settled) {
          failStart(new Error("Local relay connection closed before media was accepted"));
          return;
        }
        this.stop();
      });
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;

        try {
          const message = JSON.parse(event.data) as RelayMessage;
          options.onRelayMessage?.(message);
          if (message.type === "ready" && !settled) {
            settled = true;
            resolve();
          }
          if (message.type === "error" && message.message) {
            if (!settled) {
              failStart(new Error(message.message));
              return;
            }
            this.stop();
          }
          if (message.type === "closed" && settled) {
            this.stop();
          }
        } catch {
          // Ignore malformed relay messages.
        }
      });
    });
  }

  stop(): void {
    this.stopRequested = true;
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.clearRecorderFlushInterval();

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, "Broadcast stopped");
    }

    this.mediaRecorder = null;
    this.socket = null;
    this.isBroadcasting = false;
  }

  private async waitForWritableSocket(socket: WebSocket): Promise<void> {
    const startedAt = Date.now();
    while (socket.readyState === WebSocket.OPEN && shouldDelayRelaySend(socket.bufferedAmount)) {
      if (Date.now() - startedAt > RELAY_SOCKET_BACKPRESSURE_MAX_WAIT_MS) {
        throw new Error("Relay WebSocket is backed up and cannot accept media fast enough");
      }
      await new Promise((resolve) => window.setTimeout(resolve, RELAY_SOCKET_BACKPRESSURE_POLL_MS));
    }
  }

  private clearRecorderFlushInterval(): void {
    if (this.recorderFlushInterval !== null) {
      window.clearInterval(this.recorderFlushInterval);
      this.recorderFlushInterval = null;
    }
  }

  private getSupportedMimeType(): string | null {
    const mimeTypes = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm",
    ];

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }

    return null;
  }
}
