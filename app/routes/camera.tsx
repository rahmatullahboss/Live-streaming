import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import {
  Camera,
  CameraOff,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  RotateCw,
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
import { getCameraPublishConstraints, getQualityConstraints } from "~/lib/webrtc/camera-quality";

type CameraSession = {
  cameraId: string;
  client: CloudflareSFUClient;
  room: RoomSummary;
  stream: MediaStream;
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait") => Promise<void>;
  unlock?: () => void;
};

function getLockableScreenOrientation(): LockableScreenOrientation | null {
  return screen.orientation as LockableScreenOrientation | undefined ?? null;
}

export default function CameraPublisher() {
  const [searchParams] = useSearchParams();
  const [pin, setPin] = useState(searchParams.get("pin") ?? "");
  const [operatorName, setOperatorName] = useState(" ");
  const [session, setSession] = useState<CameraSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isLandscape, setIsLandscape] = useState(false);
  const [currentOrientation, setCurrentOrientation] = useState<"portrait" | "landscape">("portrait");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const isLandscapeRef = useRef(false);
  const manualOverrideRef = useRef(false);
  const rotationBusyRef = useRef(false);

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video || !session) {
      return;
    }

    video.srcObject = session.stream;
    void video.play().catch(() => undefined);

    return () => {
      video.srcObject = null;
    };
  }, [session, isLandscape]);

  useEffect(() => {
    if (!session) {
      return;
    }

    heartbeatRef.current = window.setInterval(() => {
      void heartbeatRoomCamera(session.room.id, session.cameraId).catch(() => {
        setNotice("    ");
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

    const activeSession = session;
    const [videoTrack] = session.stream.getVideoTracks();
    if (!videoTrack) {
      return;
    }

    function getOrientation(): "portrait" | "landscape" {
      if (screen.orientation) {
        const angle = screen.orientation.angle;
        if (angle === 90 || angle === 270) {
          return "landscape";
        }
        return "portrait";
      }
      return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
    }

    async function handleAutoRotation() {
      // Skip if a manual rotation is in progress or the user manually
      // forced landscape mode (we don't want auto-rotation to fight it).
      if (rotationBusyRef.current || manualOverrideRef.current) {
        return;
      }

      const orientation = getOrientation();
      const landscape = orientation === "landscape";

      if (landscape === isLandscapeRef.current) {
        return;
      }

      rotationBusyRef.current = true;
      setNotice(landscape ? "   " : "   ");

      const oldTrack = activeSession.stream.getVideoTracks()[0];

      // Stop old video track FIRST to avoid "Could not start video source"
      // on mobile devices that can't run two camera streams simultaneously.
      if (oldTrack) {
        oldTrack.stop();
      }

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: {
            ...getQualityConstraints("hd", landscape),
            facingMode: { ideal: "environment" },
          },
        });
        const newVideoTrack = newStream.getVideoTracks()[0];

        await activeSession.client.replaceTrack(newVideoTrack);

        setSession((prev) => prev ? { ...prev, stream: newStream } : null);

        setCurrentOrientation(orientation);
        setIsLandscape(landscape);
        isLandscapeRef.current = landscape;

        if (landscape) {
          try {
            await document.documentElement.requestFullscreen();
            const orientation = getLockableScreenOrientation();
            if (orientation?.lock) {
              await orientation.lock("landscape").catch(() => {
                // orientation lock not supported
              });
            }
          } catch {
            // CSS pseudo-fullscreen fallback
          }
        } else {
          const orientation = getLockableScreenOrientation();
          if (orientation?.unlock) {
            orientation.unlock();
          }
          if (document.fullscreenElement) {
            try {
              await document.exitFullscreen();
            } catch {
              // ignore
            }
          }
        }

        setNotice(landscape ? " " : " ");
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "   ");
        setNotice("   ");
      } finally {
        rotationBusyRef.current = false;
      }
    }

    // Only listen for PHYSICAL device rotation events.
    // Do NOT listen to `resize` — fullscreen triggers resize which causes
    // auto-rotation to detect portrait and immediately revert landscape.
    const handleOrientationChange = () => {
      void handleAutoRotation();
    };

    function handleFullscreenChange() {
      if (!document.fullscreenElement && isLandscapeRef.current) {
        // User exited fullscreen manually — go back to portrait.
        if (screen.orientation?.unlock) {
          screen.orientation.unlock();
        }
        manualOverrideRef.current = false;
        setIsLandscape(false);
        isLandscapeRef.current = false;
        setCurrentOrientation("portrait");
        setNotice(" ");
      }
    }

    window.addEventListener("orientationchange", handleOrientationChange);

    if (screen.orientation) {
      screen.orientation.addEventListener("change", handleOrientationChange);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      window.removeEventListener("orientationchange", handleOrientationChange);
      screen.orientation?.removeEventListener("change", handleOrientationChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [session]);

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice("   ");

    try {
      const room = await verifyRoomPin(pin.trim());
      const cameraId = createCameraId();
      const trackNames = buildCameraTrackNames(cameraId);
      setNotice("  ");

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

      setNotice("Cloudflare SFU-  ");
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
      setNotice("  ");
    } catch (joinError: unknown) {
      setError(joinError instanceof Error ? joinError.message : "    ");
      setNotice(" ");
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!session) {
      return;
    }

    setNotice("  ");
    const currentSession = session;
    setSession(null);

    currentSession.stream.getTracks().forEach((track) => track.stop());
    currentSession.client.close();
    await removeRoomCamera(currentSession.room.id, currentSession.cameraId).catch(() => undefined);
    setNotice("");
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

  async function handleRotation() {
    if (!session || rotationBusyRef.current) return;

    rotationBusyRef.current = true;
    const targetLandscape = !isLandscape;
    setNotice(targetLandscape ? "   " : "   ");

    // Set manual override so auto-rotation doesn't fight this.
    manualOverrideRef.current = targetLandscape;

    const oldVideoTrack = session.stream.getVideoTracks()[0];
    const oldAudioTrack = session.stream.getAudioTracks()[0] ?? null;

    // Stop the old video track FIRST — mobile devices can't run two
    // camera streams at the same time, causing "Could not start video source".
    if (oldVideoTrack) {
      oldVideoTrack.stop();
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: oldAudioTrack
          ? { echoCancellation: true, noiseSuppression: true }
          : false,
        video: {
          ...getQualityConstraints("hd", targetLandscape),
          facingMode: { ideal: "environment" },
        },
      });
      const newVideoTrack = newStream.getVideoTracks()[0];

      await session.client.replaceTrack(newVideoTrack);

      // Re-apply the current audio enabled state to the new audio track
      const newAudioTrack = newStream.getAudioTracks()[0] ?? null;
      if (newAudioTrack) {
        newAudioTrack.enabled = audioEnabled;
      }

      setSession((prev) => prev ? { ...prev, stream: newStream } : null);

      setIsLandscape(targetLandscape);
      isLandscapeRef.current = targetLandscape;
      setCurrentOrientation(targetLandscape ? "landscape" : "portrait");

      if (targetLandscape) {
        try {
          // Must enter fullscreen FIRST — orientation lock only works in
          // fullscreen mode on mobile browsers (MDN requirement).
          await document.documentElement.requestFullscreen();

          // Now lock the orientation to landscape. Await it fully so the
          // screen actually rotates before we release the busy flag.
          const orientation = getLockableScreenOrientation();
          if (orientation?.lock) {
            try {
              await orientation.lock("landscape");
            } catch {
              // Some browsers/devices don't support orientation lock.
              // Fullscreen alone will have to do.
            }
          }
        } catch {
          // Fullscreen not supported — CSS pseudo-fullscreen handles it.
        }
      } else {
        // Leaving landscape: clear manual override, unlock orientation, exit fullscreen.
        manualOverrideRef.current = false;
        const orientation = getLockableScreenOrientation();
        if (orientation?.unlock) {
          orientation.unlock();
        }
        if (document.fullscreenElement) {
          try {
            await document.exitFullscreen();
          } catch {
            // ignore
          }
        }
      }

      setNotice(targetLandscape ? "  " : "  ");
      setError(null);
    } catch (err) {
      // Recovery: re-acquire the camera since we already stopped the old track.
      manualOverrideRef.current = false;
      setError(err instanceof Error ? err.message : "    ");
      setNotice("   ");

      try {
        const recoveryStream = await navigator.mediaDevices.getUserMedia({
          audio: oldAudioTrack
            ? { echoCancellation: true, noiseSuppression: true }
            : false,
          video: {
            ...getQualityConstraints("hd", isLandscape),
            facingMode: { ideal: "environment" },
          },
        });
        const recoveryVideoTrack = recoveryStream.getVideoTracks()[0];
        await session.client.replaceTrack(recoveryVideoTrack);

        const recoveryAudioTrack = recoveryStream.getAudioTracks()[0] ?? null;
        if (recoveryAudioTrack) {
          recoveryAudioTrack.enabled = audioEnabled;
        }

        setSession((prev) => prev ? { ...prev, stream: recoveryStream } : null);
        setNotice("  -    ");
      } catch {
        setNotice("   -   ");
      }
    } finally {
      rotationBusyRef.current = false;
    }
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8 sm:px-6">
        <section className="glass-panel w-full rounded-[2rem] p-6 sm:p-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-lime)]">
                <Signal size={14} />
                SFU  
              </div>
              <h1 data-display className="text-4xl font-bold tracking-tight text-[var(--text-main)]">
                   ।
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                       Cloudflare Realtime SFU-  ।
              </p>
            </div>
            <div className="rounded-full bg-[var(--accent-cyan)]/12 p-4 text-[var(--accent-cyan)]">
              <Camera size={24} />
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <InputField
              label="  (PIN)"
              placeholder="123456"
              value={pin}
              tracking
              onChange={setPin}
            />
            <InputField
              label=" "
              placeholder="  "
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
              {loading ? notice : "  "}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (isLandscape) {
    return (
      <main className="fixed inset-0 z-50 bg-[#02070c]">
        <div className="absolute inset-0">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        </div>

        {!videoEnabled ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center">
              <CameraOff className="mx-auto text-white/75" size={28} />
              <p className="mt-3 text-sm font-medium text-white/85">   </p>
            </div>
          </div>
        ) : null}

        <div className="absolute left-0 right-0 top-0 z-20 bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-4">
          <div className="flex items-center justify-between">
            <StatusPill
              accent="lime"
              icon={<Signal size={14} />}
              label={notice}
            />
            <p className="text-xs font-semibold tracking-[0.16em] text-white/80">
              {session.room.name} · {session.room.pin}
            </p>
          </div>
        </div>

        {error ? (
          <div className="absolute left-4 right-4 top-16 z-20">
            <ErrorBox message={error} />
          </div>
        ) : null}

        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pb-5 pt-10">
          <div className="flex items-center justify-between gap-3">
            <IconButton
              active={audioEnabled}
              icon={audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              label={audioEnabled ? " " : " "}
              onClick={toggleAudio}
            />
            <IconButton
              active={videoEnabled}
              icon={videoEnabled ? <Video size={18} /> : <CameraOff size={18} />}
              label={videoEnabled ? " " : " "}
              onClick={toggleVideo}
            />
            <IconButton
              active={isLandscape}
              icon={<RotateCw size={18} />}
              label=""
              onClick={() => void handleRotation()}
            />
            <IconButton
              active={false}
              icon={<PhoneOff size={18} />}
              label=" "
              onClick={() => void disconnect()}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-5 sm:py-5">
      <header className="relative z-10 mb-3 flex items-center justify-between gap-4">
        <div className="glass-panel rounded-[1.6rem] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-lime)]">
             
          </p>
          <p className="text-sm text-[var(--text-main)]">
            {session.room.name} · {session.room.pin}
          </p>
        </div>

        <div className="glass-panel rounded-[1.6rem] px-4 py-3 text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            
          </p>
          <p className="text-sm text-[var(--text-main)]">{operatorName || " "}</p>
        </div>
      </header>

      <section className="space-y-3">
        {error ? <ErrorBox message={error} /> : null}

        <div className="glass-panel overflow-hidden rounded-[2rem]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-cyan)]">
                 
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
                  <p className="mt-3 text-sm font-medium text-white/85">   </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="grid grid-cols-3 gap-3">
              <MiniPanel label="" value={videoEnabled ? "" : ""} />
              <MiniPanel label="" value={audioEnabled ? "" : ""} />
              <MiniPanel label="SFU" value="" />
              <MiniPanel label="" value={currentOrientation === "landscape" ? "" : ""} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <IconButton
                active={audioEnabled}
                icon={audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                label={audioEnabled ? " " : " "}
                onClick={toggleAudio}
              />
              <IconButton
                active={videoEnabled}
                icon={videoEnabled ? <Video size={18} /> : <CameraOff size={18} />}
                label={videoEnabled ? " " : " "}
                onClick={toggleVideo}
              />
              <IconButton
                active={false}
                icon={<PhoneOff size={18} />}
                label=" "
                onClick={() => void disconnect()}
              />
              <IconButton
                active={isLandscape}
                icon={<RotateCw size={18} />}
                label={isLandscape ? "" : ""}
                onClick={() => void handleRotation()}
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
        required={label === "  (PIN)"}
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
