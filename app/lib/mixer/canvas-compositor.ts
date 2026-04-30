// /app/lib/mixer/canvas-compositor.ts

export interface OverlayConfig {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  showScoreboard: boolean;
  logoUrl: string;
  showLogo: boolean;
  videoFitMode: "contain" | "cover";
}

export class CanvasCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationId?: number;
  private activeVideo?: HTMLVideoElement;
  private audioContext: AudioContext;
  private audioDestination: MediaStreamAudioDestinationNode;
  private audioSources: Map<string, MediaStreamAudioSourceNode> = new Map();
  private logoImage?: HTMLImageElement;

  private overlays: OverlayConfig = {
    teamA: "Team A",
    teamB: "Team B",
    scoreA: 0,
    scoreB: 0,
    showScoreboard: false,
    logoUrl: "",
    showLogo: false,
    videoFitMode: "contain",
  };

  /**
   * Initializes the Canvas API Mixer and Web Audio mixer.
   * @param canvas The target HTMLCanvasElement for video mixing.
   */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context for canvas");
    this.ctx = ctx;

    // Standard broadcast size 720p (for mobile bandwidth, can upgrade to 1080p later)
    this.canvas.width = 1280;
    this.canvas.height = 720;

    // Web Audio API for mixing remote camera audio tracks
    this.audioContext = new window.AudioContext();
    this.audioDestination = this.audioContext.createMediaStreamDestination();
  }

  private previousVideo?: HTMLVideoElement;
  private transitionProgress: number = 1; // 1 = complete, 0 = just started
  private transitionType: 'cut' | 'fade' = 'cut';
  private transitionStartTime: number = 0;
  private readonly FADE_DURATION_MS = 500;

  /**
   * Sets the active video feed with an optional transition effect.
   * @param videoElement The new camera video to switch to.
   * @param type 'cut' for instant switch, 'fade' for smooth crossfade.
   */
  public switchCamera(videoElement: HTMLVideoElement, type: 'cut' | 'fade' = 'fade') {
    if (videoElement === this.activeVideo) return;

    if (type === 'cut' || !this.activeVideo) {
      this.activeVideo = videoElement;
      this.transitionProgress = 1;
      return;
    }

    // Fade transition: keep previous video and animate
    this.previousVideo = this.activeVideo;
    this.activeVideo = videoElement;
    this.transitionType = 'fade';
    this.transitionProgress = 0;
    this.transitionStartTime = performance.now();
  }

  /**
   * Disconnect and clear all active audio streams from the mixer
   */
  public clearAudioStreams() {
    this.audioSources.forEach((source) => source.disconnect());
    this.audioSources.clear();
  }

  /**
   * Add a MediaStream's audio track to the main output mix.
   */
  public addAudioStream(id: string, stream: MediaStream) {
    if (this.audioSources.has(id)) return;
    
    // Check if there are active audio tracks before creating a source
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      // Connect to the destination so it gets mixed into `audioDestination.stream`
      source.connect(this.audioDestination);
      this.audioSources.set(id, source);
    } catch (e) {
      console.warn(`Failed to add audio stream ${id} to mix:`, e);
    }
  }

  /**
   * Remove a specific audio stream from the mix.
   */
  public removeAudioStream(id: string) {
    const source = this.audioSources.get(id);
    if (source) {
      source.disconnect();
      this.audioSources.delete(id);
    }
  }

  /**
   * Update overlay graphics like scoreboard and logo
   */
  public updateOverlays(updates: Partial<OverlayConfig>) {
    Object.assign(this.overlays, updates);
    if (updates.logoUrl && this.overlays.logoUrl !== updates.logoUrl) {
      this.loadLogo(updates.logoUrl);
    }
  }

  private loadLogo(url: string) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      this.logoImage = img;
    };
    img.src = url;
  }

  /**
   * Extract the final mixed MediaStream (Canvas Video + Mixed Audio)
   * which can be piped to Cloudflare Stream (WHIP).
   */
  public getMixedStream(fps: number = 30): MediaStream {
    // 1. Get video output from the canvas (e.g. 30 FPS)
    const canvasStream = this.canvas.captureStream(fps);
    const videoTracks = canvasStream.getVideoTracks();

    // 2. Get the mixed audio output from the Web Audio API destination
    const audioTracks = this.audioDestination.stream.getAudioTracks();

    // 3. Combine them into a single broadcastable MediaStream
    return new MediaStream([...videoTracks, ...audioTracks]);
  }

  /**
   * Starts the video render loop & audio context
   */
  public start() {
    void this.resumeAudio();
    if (!this.animationId) {
      this.renderLoop();
    }
  }

  public async resumeAudio() {
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /**
   * Stops the video render loop
   */
  public stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }
  }

  /**
   * Main 60fps render loop to draw the video and overlays
   */
  private renderLoop = () => {
    this.animationId = requestAnimationFrame(this.renderLoop);

    // 1. Draw solid background
    this.ctx.fillStyle = "#131313";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Update transition progress
    if (this.transitionProgress < 1) {
      const elapsed = performance.now() - this.transitionStartTime;
      this.transitionProgress = Math.min(1, elapsed / this.FADE_DURATION_MS);
    }

    // 3. Draw video frame(s) with transition
    const isFading = this.transitionProgress < 1 && this.previousVideo;

    if (isFading && this.previousVideo && this.previousVideo.readyState >= 2) {
      // Draw the outgoing (previous) camera at full opacity first
      this.ctx.globalAlpha = 1;
      this.drawVideo(this.previousVideo);

      // Draw the incoming (active) camera with increasing opacity
      if (this.activeVideo && this.activeVideo.readyState >= 2) {
        this.ctx.globalAlpha = this.transitionProgress;
        this.drawVideo(this.activeVideo);
        this.ctx.globalAlpha = 1;
      }
    } else if (this.activeVideo && this.activeVideo.readyState >= 2) {
      this.ctx.globalAlpha = 1;
      this.drawVideo(this.activeVideo);
    } else {
      this.drawNoSignalPlaceholder();
    }

    // Clean up previous video reference after transition completes
    if (this.transitionProgress >= 1 && this.previousVideo) {
      this.previousVideo = undefined;
    }

    // 4. Draw Overlays (Scoreboard, Logo) — always at full alpha
    this.ctx.globalAlpha = 1;
    this.drawOverlays();
  };

  private drawVideo(video: HTMLVideoElement) {
    if (this.overlays.videoFitMode === "cover") {
      this.drawVideoAspectCover(video);
      return;
    }

    this.drawVideoAspectContain(video);
  }

  private drawVideoAspectCover(video: HTMLVideoElement) {
    const canvasH = this.canvas.height;
    const canvasW = this.canvas.width;
    const videoH = video.videoHeight || canvasH;
    const videoW = video.videoWidth || canvasW;

    const canvasAspect = canvasW / canvasH;
    const videoAspect = videoW / videoH;

    let drawW = canvasW;
    let drawH = canvasH;
    let offsetX = 0;
    let offsetY = 0;

    if (canvasAspect > videoAspect) {
      // Canvas is wider than video aspect ratio -> Scale to width and crop height
      drawH = canvasW / videoAspect;
      offsetY = (canvasH - drawH) / 2;
    } else {
      // Canvas is taller than video aspect ratio -> Scale to height and crop width
      drawW = canvasH * videoAspect;
      offsetX = (canvasW - drawW) / 2;
    }

    this.ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
  }

  private drawVideoAspectContain(video: HTMLVideoElement) {
    const canvasH = this.canvas.height;
    const canvasW = this.canvas.width;
    const videoH = video.videoHeight || canvasH;
    const videoW = video.videoWidth || canvasW;

    const scale = Math.min(canvasW / videoW, canvasH / videoH);
    const drawW = videoW * scale;
    const drawH = videoH * scale;
    const offsetX = (canvasW - drawW) / 2;
    const offsetY = (canvasH - drawH) / 2;

    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(0, 0, canvasW, canvasH);
    this.ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
  }

  private drawNoSignalPlaceholder() {
    // Draw TV static/placeholder lines or simply text
    this.ctx.fillStyle = "#2a2a2a";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = "#e5e2e1";
    this.ctx.font = "bold 40px 'Inter', sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("NO SIGNAL / WAITING FOR CAMERA", this.canvas.width / 2, this.canvas.height / 2);
  }

  private drawOverlays() {
    this.ctx.save();

    // A. "LIVE" Badge (Top Left)
    const padding = 30;
    this.ctx.fillStyle = "#ff525c"; // Stitch primary container neon red
    this.ctx.beginPath();
    this.ctx.roundRect(padding, padding, 90, 40, 6);
    this.ctx.fill();

    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "bold 18px 'Inter', sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("LIVE", padding + 45, padding + 20);

    // B. Main Scoreboard Bug (Top Center)
    if (this.overlays.showScoreboard) {
      const boardW = 500;
      const boardH = 60;
      const x = (this.canvas.width - boardW) / 2;
      const y = padding;

      // Scoreboard Background (Glassmorphism style fallback)
      this.ctx.fillStyle = "rgba(28, 27, 27, 0.85)"; // surface-container-low highly opaque
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, boardW, boardH, 8);
      this.ctx.fill();

      // Team Names & Scores
      this.ctx.fillStyle = "#ffffff";
      this.ctx.font = "bold 26px 'Inter', sans-serif";
      
      const middleY = y + boardH / 2;
      
      // Left Team Name
      this.ctx.textAlign = "right";
      this.ctx.fillText(this.overlays.teamA.toUpperCase(), x + 160, middleY);
      
      // Right Team Name
      this.ctx.textAlign = "left";
      this.ctx.fillText(this.overlays.teamB.toUpperCase(), x + boardW - 160, middleY);

      // VS / Dash area
      this.ctx.textAlign = "center";
      this.ctx.fillStyle = "#e5e2e1";
      this.ctx.fillText("-", x + boardW / 2, middleY);

      // Score Box (Darker container holding numbers)
      const scoreBoxW = 100;
      const scoreBoxX = (this.canvas.width - scoreBoxW) / 2;
      
      this.ctx.fillStyle = "rgba(14, 14, 14, 0.9)"; // surface-container-lowest
      this.ctx.beginPath();
      this.ctx.roundRect(scoreBoxX, y + 4, scoreBoxW, boardH - 8, 4);
      this.ctx.fill();

      // The actual numerical score
      this.ctx.fillStyle = "#00daf3"; // Cyber Cyan accent
      this.ctx.font = "bold 32px 'Space Grotesk', sans-serif"; // Numeric font from design system
      this.ctx.fillText(`${this.overlays.scoreA}       ${this.overlays.scoreB}`, x + boardW / 2, middleY + 2);
    }

    // C. Sponsor/Station Logo (Top Right)
    if (this.overlays.showLogo && this.logoImage) {
      const logoSizeX = 120;
      const ratio = this.logoImage.height / this.logoImage.width;
      const logoSizeY = logoSizeX * ratio;

      this.ctx.drawImage(
        this.logoImage,
        this.canvas.width - logoSizeX - padding,
        padding,
        logoSizeX,
        logoSizeY
      );
    }

    this.ctx.restore();
  }
}
