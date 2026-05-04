import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Camera,
  CameraOff,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  Signal,
  Video,
} from "lucide-react";

import { CloudflareSFUClient } from "~/lib/sfu";
import {
  buildCameraTrackNames,
  createCameraId,
  heartbeatRoomCamera,
  registerRoomCamera,
  removeRoomCamera,
} from "~/lib/sfu-room";
import { verifyRoomPin, type RoomSummary } from "~/lib/realtime";
import { getCameraPublishConstraints } from "~/lib/webrtc/camera-quality";

type CameraSession = {
  cameraId: string;
  client: CloudflareSFUClient;
  room: RoomSummary;
  stream: MediaStream;
};

export default function CameraPublisher() {
  const [pin, setPin] = useState("");
  const [operatorName, setOperatorName] = useState("Field Camera");
  const [session, setSession] = useState<CameraSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("Standby");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const heartbeatRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !session) {
      return;
    }

    video.srcObject = session.stream;
    void video.play().catch(() => undefined);

    return () => {
      video.srcObject = null;
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    heartbeatRef.current = window.setInterval(() => {
      void heartbeatRoomCamera(session.room.id, session.cameraId).catch(() => {
        setNotice("Heartbeat retrying");
      });
    }, 20_000);

    return () => {
      if (heartbeatRef.current !== null) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [session]);

  useEffect(() => {
    if (!session || !("wakeLock" in navigator)) {
      return;
    }

    let cancelled = false;

    async function requestWakeLock() {
      if (document.visibilityState !== "visible") {
        return;
      }

      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener("release", () => {
          wakeLockRef.current = null;
        });
      } catch {
        wakeLockRef.current = null;
      }
    }

    void requestWakeLock();

    function handleVisibilityChange() {
      if (!cancelled && document.visibilityState === "visible" && wakeLockRef.current === null) {
        void requestWakeLock();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        void wakeLockRef.current.release().catch(() => undefined);
        wakeLockRef.current = null;
      }
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const [videoTrack] = session.stream.getVideoTracks();
    if (!videoTrack) {
      return;
    }

    function applyLandscapeConstraints() {
      void videoTrack.applyConstraints(getCameraPublishConstraints()).catch(() => {
        setNotice("Landscape mode retrying");
      });
    }

    applyLandscapeConstraints();
    window.addEventListener("orientationchange", applyLandscapeConstraints);
    window.addEventListener("resize", applyLandscapeConstraints);

    return () => {
      window.removeEventListener("orientationchange", applyLandscapeConstraints);
      window.removeEventListener("resize", applyLandscapeConstraints);
    };
  }, [session]);

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice("Checking room");

    try {
      const room = await verifyRoomPin(pin.trim());
      const cameraId = createCameraId();
      const trackNames = buildCameraTrackNames(cameraId);
      setNotice("Opening camera");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: {
          ...getCameraPublishConstraints(),
          facingMode: { ideal: "environment" },
        },
      });

      const client = await CloudflareSFUClient.create();
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0] ?? null;

      if (!videoTrack) {
        throw new Error("No camera track was returned by this device.");
      }

      setNotice("Publishing to Cloudflare SFU");
      await client.publishTracks([
        { track: videoTrack, trackName: trackNames.videoTrackName },
        ...(audioTrack ? [{ track: audioTrack, trackName: trackNames.audioTrackName }] : []),
      ]);

      const sessionId = client.getSessionId();
      if (!sessionId) {
        throw new Error("Cloudflare SFU did not return a session id.");
      }

      await registerRoomCamera(room.id, {
        audioTrackName: audioTrack ? trackNames.audioTrackName : null,
        id: cameraId,
        sessionId,
        videoTrackName: trackNames.videoTrackName,
      });

      setSession({ cameraId, client, room, stream });
      setAudioEnabled(audioTrack ? audioTrack.enabled : false);
      setVideoEnabled(videoTrack.enabled);
      setNotice("Sending Signal");
    } catch (joinError: unknown) {
      setError(joinError instanceof Error ? joinError.message : "Could not publish camera");
      setNotice("Failed");
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!session) {
      return;
    }

    setNotice("Disconnecting");
    const currentSession = session;
    setSession(null);

    currentSession.stream.getTracks().forEach((track) => track.stop());
    currentSession.client.close();
    await removeRoomCamera(currentSession.room.id, currentSession.cameraId).catch(() => undefined);
    setNotice("Standby");
  }

  function toggleAudio() {
    if (!session) {
      return;
    }

    const next = !audioEnabled;
    session.stream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setAudioEnabled(next);
  }

  function toggleVideo() {
    if (!session) {
      return;
    }

    const next = !videoEnabled;
    session.stream.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setVideoEnabled(next);
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8 sm:px-6">
        <section className="glass-panel w-full rounded-[2rem] p-6 sm:p-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-lime)]">
                <Signal size={14} />
                SFU Camera Uplink
              </div>
              <h1 data-display className="text-4xl font-bold tracking-tight text-[var(--text-main)]">
                Join the live room.
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                This phone publishes video and audio directly to Cloudflare Realtime SFU.
              </p>
            </div>
            <div className="rounded-full bg-[var(--accent-cyan)]/12 p-4 text-[var(--accent-cyan)]">
              <Camera size={24} />
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <InputField
              label="Room PIN"
              placeholder="123456"
              value={pin}
              tracking
              onChange={setPin}
            />
            <InputField
              label="Camera Label"
              placeholder="North Goal Camera"
              value={operatorName}
              onChange={setOperatorName}
            />
            {error ? <ErrorBox message={error} /> : null}

            <button
              type="submit"
              disabled={loading || pin.trim().length < 4}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent-coral)] px-5 py-4 text-sm font-semibold text-white hover:scale-[1.01] disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
              {loading ? notice : "Connect Camera"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-5 sm:py-5">
      <header className="relative z-10 mb-3 flex items-center justify-between gap-4">
        <div className="glass-panel rounded-[1.6rem] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-lime)]">
            Live Room
          </p>
          <p className="text-sm text-[var(--text-main)]">
            {session.room.name} · {session.room.pin}
          </p>
        </div>

        <div className="glass-panel rounded-[1.6rem] px-4 py-3 text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Camera
          </p>
          <p className="text-sm text-[var(--text-main)]">{operatorName || "Field Camera"}</p>
        </div>
      </header>

      <section className="space-y-3">
        {error ? <ErrorBox message={error} /> : null}

        <div className="glass-panel overflow-hidden rounded-[2rem]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-cyan)]">
                Field Camera
              </p>
              <h1 data-display className="text-2xl font-bold text-[var(--text-main)]">
                {operatorName}
              </h1>
            </div>

            <StatusPill
              accent="lime"
              icon={<Signal size={14} />}
              label={notice}
            />
          </div>

          <div className="relative aspect-video w-full overflow-hidden bg-[#02070c]">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            {!videoEnabled ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center">
                  <CameraOff className="mx-auto text-white/75" size={28} />
                  <p className="mt-3 text-sm font-medium text-white/85">Camera is muted</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="grid grid-cols-3 gap-3">
              <MiniPanel label="Video" value={videoEnabled ? "On" : "Off"} />
              <MiniPanel label="Audio" value={audioEnabled ? "On" : "Off"} />
              <MiniPanel label="SFU" value="Live" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <IconButton
                active={audioEnabled}
                icon={audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                label={audioEnabled ? "Mic On" : "Mic Off"}
                onClick={toggleAudio}
              />
              <IconButton
                active={videoEnabled}
                icon={videoEnabled ? <Video size={18} /> : <CameraOff size={18} />}
                label={videoEnabled ? "Camera On" : "Camera Off"}
                onClick={toggleVideo}
              />
              <IconButton
                active={false}
                icon={<PhoneOff size={18} />}
                label="Leave"
                onClick={() => void disconnect()}
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function InputField({
  label,
  onChange,
  placeholder,
  tracking = false,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  tracking?: boolean;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        type="text"
        required={label === "Room PIN"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-2xl border border-[var(--border-soft)] bg-black/20 px-4 py-4 text-base text-[var(--text-main)] outline-none focus:border-[var(--border-strong)] ${
          tracking ? "text-lg font-semibold tracking-[0.35em]" : ""
        }`}
        placeholder={placeholder}
      />
    </label>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-[var(--accent-coral)]/30 bg-[var(--accent-coral)]/10 px-4 py-3 text-sm text-[#ffd8d4]">
      {message}
    </div>
  );
}

function StatusPill({
  accent,
  icon,
  label,
}: {
  accent: "coral" | "cyan" | "lime";
  icon: ReactNode;
  label: string;
}) {
  const palette =
    accent === "lime"
      ? "border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 text-[var(--accent-lime)]"
      : accent === "coral"
        ? "border-[var(--accent-coral)]/25 bg-[var(--accent-coral)]/10 text-[var(--accent-coral)]"
        : "border-[var(--accent-cyan)]/25 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]";

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${palette}`}>
      {icon}
      {label}
    </div>
  );
}

function MiniPanel({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.2rem] border border-[var(--border-soft)] bg-black/15 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </p>
      <p data-display className="mt-2 text-base font-bold text-[var(--text-main)]">
        {value}
      </p>
    </div>
  );
}

function IconButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[1.2rem] border px-3 py-3 text-center transition ${
        active
          ? "border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/12 text-[var(--accent-cyan)]"
          : "border-[var(--border-soft)] bg-black/15 text-[var(--text-main)]"
      }`}
    >
      <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/20">
        {icon}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</p>
    </button>
  );
}
