/**
 * Cloudflare WHIP Client
 * Handles WebRTC HTTP Ingestion Protocol (WHIP) to broadcast a MediaStream to Cloudflare Stream.
 */
import { createClientDiagnostics } from "~/lib/client-diagnostics";

export class WHIPClient {
  private readonly diagnostics = createClientDiagnostics("whip");
  private pc: RTCPeerConnection;
  private endpoint: string;
  private token: string | null;
  private isBroadcasting: boolean = false;
  private disconnectTimeoutId: number | null = null;

  constructor(endpoint: string, token?: string | null) {
    this.endpoint = endpoint;
    this.token = token?.trim() || null;
    
    // Cloudflare WHIP usually doesn't strictly need STUN/TURN as Cloudflare provides it directly,
    // but standard WebRTC PC needs them or uses defaults.
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.cloudflare.com:3478" }
      ]
    });

    this.pc.oniceconnectionstatechange = () => {
      console.log("[WHIP] ICE State:", this.pc.iceConnectionState);
      this.diagnostics.info("ice-state", {
        iceConnectionState: this.pc.iceConnectionState,
      });
      if (this.pc.iceConnectionState === "failed") {
        this.diagnostics.error("ice-failed");
        this.stop();
        return;
      }

      if (this.pc.iceConnectionState === "disconnected") {
        if (this.disconnectTimeoutId) {
          window.clearTimeout(this.disconnectTimeoutId);
        }

        this.disconnectTimeoutId = window.setTimeout(() => {
          if (this.pc.iceConnectionState === "disconnected") {
            this.diagnostics.warn("ice-disconnected-timeout");
            this.stop();
          }
        }, 10000);
        return;
      }

      if (this.disconnectTimeoutId) {
        window.clearTimeout(this.disconnectTimeoutId);
        this.disconnectTimeoutId = null;
      }
    };
  }

  /**
   * Publish the Mixed Canvas stream to Cloudflare Stream via WHIP
   */
  async publish(stream: MediaStream): Promise<void> {
    if (this.isBroadcasting) throw new Error("Already broadcasting");
    this.diagnostics.info("publish-start", {
      audioTrackCount: stream.getAudioTracks().length,
      trackCount: stream.getTracks().length,
      videoTrackCount: stream.getVideoTracks().length,
    });
    
    // Add all tracks from the MediaStream (Video + Mixed Audio)
    for (const track of stream.getTracks()) {
      this.pc.addTransceiver(track, { direction: "sendonly" });
    }

    // Create SDP Offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Some endpoints expect the ICE gathering to complete before sending SDP,
    // but WHIP standard allows sending partial SDP and trickle via PATCH if supported.
    // Cloudflare WHIP supports vanilla Offers, but it's safer to wait a tiny bit for host candidates.
    await this.waitForIceGathering();

    if (!this.pc.localDescription) {
      throw new Error("Local SDP is null");
    }

    // Send SDP Offer via HTTP POST
    const headers: HeadersInit = {
      "Content-Type": "application/sdp"
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: this.pc.localDescription.sdp
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[WHIP] Failed to publish:", errorText);
      this.diagnostics.error("publish-failed", {
        error: errorText,
        status: response.status,
      });
      throw new Error(`WHIP Publish Failed (${response.status}): ${response.statusText}`);
    }

    // Get SDP Answer
    const answerSdp = await response.text();
    
    // Set Remote Description
    await this.pc.setRemoteDescription({
      type: "answer",
      sdp: answerSdp
    });

    this.isBroadcasting = true;
    console.log("[WHIP] Successfully broadcasting to Cloudflare Stream");
    this.diagnostics.info("publish-complete");
  }

  /**
   * Stop broadcasting and cleanup resources
   */
  stop() {
    if (this.disconnectTimeoutId) {
      window.clearTimeout(this.disconnectTimeoutId);
      this.disconnectTimeoutId = null;
    }
    this.pc.close();
    this.isBroadcasting = false;
    console.log("[WHIP] Broadcasting stopped");
    this.diagnostics.info("stopped");
  }

  /**
   * Helper to wait for basic ICE candidates to be gathered before sending the offer
   */
  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === "complete") {
        resolve();
      } else {
        const checkState = () => {
          if (this.pc.iceGatheringState === "complete") {
            this.pc.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }
        };
        this.pc.addEventListener("icegatheringstatechange", checkState);
        // Timeout after 2.5 seconds to fallback to whatever candidates we have
        setTimeout(() => {
          this.pc.removeEventListener("icegatheringstatechange", checkState);
          resolve();
        }, 2500);
      }
    });
  }
}
