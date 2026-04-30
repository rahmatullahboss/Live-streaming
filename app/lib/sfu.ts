import { createClientDiagnostics } from "~/lib/client-diagnostics";
import { sanitizeIceServers, type IceServerConfig } from "~/lib/webrtc/ice-servers";

/**
 * Cloudflare Calls (Realtime SFU) Client
 *
 * References:
 * https://developers.cloudflare.com/realtime/sfu/sessions-tracks/
 * https://developers.cloudflare.com/realtime/sfu/limits/
 */

export interface TrackInfo {
  trackName: string;
  mid: string;
  sessionId: string;
}

export interface LocalTrackRequest {
  track: MediaStreamTrack;
  trackName?: string;
}

export interface RemoteTrackRequest {
  kind: MediaStreamTrack["kind"];
  sessionId: string;
  trackName: string;
}

interface NewSessionResponse {
  success?: boolean;
  sessionId?: string;
  data?: {
    sessionId?: string;
  };
}

interface NewTrackResponse {
  success?: boolean;
  requiresImmediateRenegotiation?: boolean;
  sessionDescription?: RTCSessionDescriptionInit;
  tracks?: Array<{
    location?: string;
    mid?: string;
    trackName: string;
  }>;
  data?: {
    requiresImmediateRenegotiation?: boolean;
    sessionDescription?: RTCSessionDescriptionInit;
    tracks?: Array<{
      location?: string;
      mid?: string;
      trackName: string;
    }>;
  };
}

interface IceServerResponse {
  iceServers?: IceServerConfig[];
  data?: {
    iceServers?: IceServerConfig[];
  };
}

interface PendingTrackWaiter {
  kind: MediaStreamTrack["kind"];
  reject: (error: Error) => void;
  resolve: (track: MediaStreamTrack) => void;
  timeoutId: number;
}

export class CloudflareSFUClient {
  private readonly apiBase = "/api/calls";
  private readonly diagnostics = createClientDiagnostics("sfu");
  private readonly pendingTrackWaiters: PendingTrackWaiter[] = [];
  private pc: RTCPeerConnection;
  private sessionId: string | null = null;
  private operationChain: Promise<unknown> = Promise.resolve();

  private constructor(iceServers: IceServerConfig[]) {
    this.pc = new RTCPeerConnection({
      iceServers,
      bundlePolicy: "max-bundle",
    });

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      console.log("[SFU] ICE state:", state);
      this.diagnostics.info("ice-state", {
        connectionState: this.pc.connectionState,
        iceConnectionState: state,
      });
      if (state === "failed") {
        console.warn("[SFU] ICE connection failed, attempting restart...");
        this.diagnostics.warn("ice-failed-restart", {
          connectionState: this.pc.connectionState,
        });
        this.pc.restartIce();
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.diagnostics.info("pc-state", {
        connectionState: this.pc.connectionState,
        iceConnectionState: this.pc.iceConnectionState,
      });
    };

    this.pc.ontrack = (event) => {
      const waiterIndex = this.pendingTrackWaiters.findIndex(
        (waiter) => waiter.kind === event.track.kind
      );

      if (waiterIndex === -1) {
        return;
      }

      const waiter = this.pendingTrackWaiters.splice(waiterIndex, 1)[0];
      window.clearTimeout(waiter.timeoutId);
      console.log("[SFU] Remote track received:", event.track.kind);
      this.diagnostics.info("remote-track-received", {
        kind: event.track.kind,
        muted: event.track.muted,
        readyState: event.track.readyState,
      });
      waiter.resolve(event.track);
    };
  }

  static async create(): Promise<CloudflareSFUClient> {
    const response = await fetch("/api/calls/ice-servers");
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[SFU] Failed to load ICE servers: ${response.status} — ${errText}`);
    }

    const data = (await response.json()) as IceServerResponse;
    const iceServers = sanitizeIceServers(data.data?.iceServers ?? data.iceServers);
    const client = new CloudflareSFUClient(iceServers);
    client.diagnostics.info("client-created", { iceServerCount: iceServers.length });
    return client;
  }

  getPeerConnection(): RTCPeerConnection {
    return this.pc;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async publishTrack(track: MediaStreamTrack, trackName?: string): Promise<TrackInfo> {
    const [published] = await this.publishTracks([{ track, trackName }]);
    return published;
  }

  async publishTracks(trackRequests: LocalTrackRequest[]): Promise<TrackInfo[]> {
    return this.enqueueOperation(async () => {
      if (trackRequests.length === 0) {
        return [];
      }

      const sessionId = await this.ensureSession();
      this.diagnostics.info("publish-start", {
        sessionId,
        trackCount: trackRequests.length,
      });
      const transceivers = trackRequests.map(({ track }) =>
        this.pc.addTransceiver(track, {
          direction: "sendonly",
        })
      );

      await this.setLocalOffer();

      const tracks = trackRequests.map(({ track, trackName }, index) => {
        const transceiver = transceivers[index];
        const mid = transceiver.mid;
        if (!mid) {
          throw new Error("[SFU] Failed to publish track: missing transceiver mid");
        }

        return {
          track,
          trackName: trackName || `${track.kind}-${track.id.slice(0, 8)}`,
          mid,
        };
      });

      const response = await fetch(`${this.apiBase}/sessions/${sessionId}/tracks/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionDescription: {
            type: "offer",
            sdp: this.pc.localDescription?.sdp,
          },
          tracks: tracks.map(({ mid, trackName: localTrackName }) => ({
            location: "local",
            mid,
            trackName: localTrackName,
          })),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.diagnostics.error("publish-failed", {
          error: errText,
          sessionId,
          status: response.status,
        });
        throw new Error(`[SFU] Failed to publish track: ${response.status} — ${errText}`);
      }

      const data = (await response.json()) as NewTrackResponse;
      await this.applyTrackResponse(data);
      this.diagnostics.info("publish-complete", {
        publishedTrackCount: tracks.length,
        sessionId,
      });

      return tracks.map(({ trackName: localTrackName, mid }) => ({
        trackName: localTrackName,
        mid,
        sessionId,
      }));
    });
  }

  async pullTrack(remoteSessionId: string, remoteTrackName: string): Promise<MediaStreamTrack> {
    const pulled = await this.pullTracks([
      {
        kind: "video",
        sessionId: remoteSessionId,
        trackName: remoteTrackName,
      },
    ]);
    const videoTrack = pulled.video;
    if (!videoTrack) {
      throw new Error("[SFU] Remote video track was not delivered");
    }
    return videoTrack;
  }

  async pullTracks(remoteTracks: RemoteTrackRequest[]): Promise<Partial<Record<MediaStreamTrack["kind"], MediaStreamTrack>>> {
    return this.enqueueOperation(async () => {
      if (remoteTracks.length === 0) {
        return {};
      }

      const sessionId = await this.ensureSession();
      this.diagnostics.info("pull-start", {
        remoteTrackCount: remoteTracks.length,
        sessionId,
      });
      await this.waitForConnectedIfEstablished();

      const trackPromises = remoteTracks.map((remoteTrack) => this.waitForTrack(remoteTrack.kind));
      remoteTracks.forEach((remoteTrack) => {
        this.pc.addTransceiver(remoteTrack.kind, { direction: "recvonly" });
      });

      await this.setLocalOffer();

      const response = await fetch(`${this.apiBase}/sessions/${sessionId}/tracks/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionDescription: {
            type: "offer",
            sdp: this.pc.localDescription?.sdp,
          },
          tracks: remoteTracks.map((remoteTrack) => ({
            location: "remote",
            trackName: remoteTrack.trackName,
            sessionId: remoteTrack.sessionId,
          })),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.diagnostics.error("pull-failed", {
          error: errText,
          sessionId,
          status: response.status,
        });
        throw new Error(`[SFU] Failed to pull track: ${response.status} — ${errText}`);
      }

      const data = (await response.json()) as NewTrackResponse;
      await this.applyTrackResponse(data);

      const resolvedTracks = await Promise.all(trackPromises);
      this.diagnostics.info("pull-complete", {
        resolvedTrackCount: resolvedTracks.length,
        sessionId,
      });
      return resolvedTracks.reduce<Partial<Record<MediaStreamTrack["kind"], MediaStreamTrack>>>(
        (accumulator, track) => {
          accumulator[track.kind] = track;
          return accumulator;
        },
        {}
      );
    });
  }

  async renegotiate(): Promise<void> {
    await this.enqueueOperation(async () => {
      if (!this.sessionId) {
        return;
      }

      await this.waitForConnectedIfEstablished();
      await this.setLocalOffer();

      const response = await fetch(`${this.apiBase}/sessions/${this.sessionId}/renegotiate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionDescription: {
            type: "offer",
            sdp: this.pc.localDescription?.sdp,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`[SFU] Renegotiation failed: ${response.status} — ${errText}`);
      }

      const data = (await response.json()) as NewTrackResponse;
      await this.applyTrackResponse(data);
      console.log("[SFU] Renegotiation complete");
      this.diagnostics.info("renegotiation-complete", {
        sessionId: this.sessionId,
      });
    });
  }

  close(): void {
    this.pendingTrackWaiters.splice(0).forEach((waiter) => {
      window.clearTimeout(waiter.timeoutId);
      waiter.reject(new Error("[SFU] Connection closed before remote track arrived"));
    });
    this.pc.close();
    this.sessionId = null;
    console.log("[SFU] Connection closed");
    this.diagnostics.info("closed");
  }

  private async createSession(): Promise<string> {
    const response = await fetch(`${this.apiBase}/sessions/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[SFU] Failed to create session: ${response.status} — ${errText}`);
    }

    const data = (await response.json()) as NewSessionResponse;
    const sessionId = data.data?.sessionId ?? data.sessionId;

    if (!sessionId) {
      throw new Error("[SFU] Calls API did not return a session ID");
    }

    this.sessionId = sessionId;
    console.log("[SFU] Session created:", sessionId);
    this.diagnostics.info("session-created", { sessionId });
    return sessionId;
  }

  private async ensureSession(): Promise<string> {
    if (!this.sessionId) {
      return this.createSession();
    }
    return this.sessionId;
  }

  private async setLocalOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
  }

  private async applyTrackResponse(response: NewTrackResponse): Promise<void> {
    const payload = response.data ?? response;

    if (payload.sessionDescription) {
      await this.pc.setRemoteDescription(
        new RTCSessionDescription(payload.sessionDescription)
      );
    }

    if (payload.requiresImmediateRenegotiation) {
      await this.waitForConnectedIfEstablished();
    }
  }

  private async waitForConnectedIfEstablished(timeoutMs: number = 6000): Promise<void> {
    if (!this.pc.remoteDescription) {
      return;
    }

    const readyStates = new Set<RTCPeerConnectionState | RTCIceConnectionState>([
      "connected",
      "completed",
    ]);

    if (
      readyStates.has(this.pc.connectionState) ||
      readyStates.has(this.pc.iceConnectionState)
    ) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        cleanup();
        this.diagnostics.error("connect-timeout", {
          connectionState: this.pc.connectionState,
          iceConnectionState: this.pc.iceConnectionState,
          timeoutMs,
        });
        reject(new Error("[SFU] Timed out waiting for the PeerConnection to connect"));
      }, timeoutMs);

      const checkReady = () => {
        if (
          readyStates.has(this.pc.connectionState) ||
          readyStates.has(this.pc.iceConnectionState)
        ) {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        this.pc.removeEventListener("connectionstatechange", checkReady);
        this.pc.removeEventListener("iceconnectionstatechange", checkReady);
      };

      this.pc.addEventListener("connectionstatechange", checkReady);
      this.pc.addEventListener("iceconnectionstatechange", checkReady);
      checkReady();
    });
  }

  private waitForTrack(kind: MediaStreamTrack["kind"], timeoutMs: number = 10000): Promise<MediaStreamTrack> {
    return new Promise<MediaStreamTrack>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        const waiterIndex = this.pendingTrackWaiters.findIndex((waiter) => waiter.timeoutId === timeoutId);
        if (waiterIndex >= 0) {
          this.pendingTrackWaiters.splice(waiterIndex, 1);
        }
        this.diagnostics.error("track-timeout", {
          kind,
          timeoutMs,
        });
        reject(new Error("[SFU] Timed out waiting for remote track"));
      }, timeoutMs);

      this.pendingTrackWaiters.push({
        kind,
        resolve,
        reject,
        timeoutId,
      });
    });
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationChain.then(operation, operation);
    this.operationChain = run.catch(() => undefined);
    return run;
  }
}
