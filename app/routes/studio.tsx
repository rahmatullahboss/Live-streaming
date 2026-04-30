import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  CameraOff,
  Languages,
  Loader2,
  Mic,
  MicOff,
  Radio,
  RefreshCcw,
  Save,
  Shield,
  Trash2,
  Upload,
  Video,
  WandSparkles,
} from "lucide-react";

import { ScoreboardOverlay } from "~/components/scoreboard-overlay";
import { LocalRelayBroadcaster } from "~/lib/local-relay";
import { getAdVideoUrlIssue } from "~/lib/ad-video";
import {
  getStreamGuardState,
  type StudioVisibilityState,
} from "~/lib/stream-guard";
import {
  getBroadcastConfig,
  getRelayConfig,
  getOverlayConfig,
  saveBroadcastConfig,
  saveOverlayConfig,
  startRoomSession,
  deleteRoomAsset,
  uploadRoomAsset,
  type BroadcastDestinationConfig,
  type OverlayConfig,
  type RoomSummary,
  verifyRoomPin,
} from "~/lib/realtime";
import { CloudflareSFUClient, type RemoteTrackRequest } from "~/lib/sfu";
import { getRoomCameras } from "~/lib/sfu-room";
import {
  chooseDirectorCameraId,
  getCameraSourceKey,
  reconcilePulledCameras,
  type DirectorCameraState,
} from "~/lib/studio-cameras";

type JoinState = {
  room: RoomSummary;
};

type PulledCamera = DirectorCameraState;

type RelayStatus = "idle" | "starting" | "live" | "stopping";

type RequestableCanvasTrack = MediaStreamTrack & {
  requestFrame?: () => void;
};

type StudioLanguage = "bn" | "en";

const defaultDestinations: BroadcastDestinationConfig[] = [
  {
    key: "youtube",
    label: "YouTube",
    rtmpUrl: "rtmp://a.rtmp.youtube.com/live2",
    streamKey: "",
  },
  {
    key: "facebook",
    label: "Facebook",
    rtmpUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
    streamKey: "",
  },
];

const defaultOverlay: OverlayConfig = {
  ad_title: "",
  ad_video_url: "",
  clock_text: "00:00",
  external_scoreboard_url: "",
  left_logo_url: "",
  logo_url: "",
  match_status: "LIVE",
  program_source: "live",
  right_logo_url: "",
  scoreboard_active: 0,
  scoring_data: {},
  sponsor_text: "",
  sport: "football",
  team1_name: "TEAM A",
  team1_score: 0,
  team2_name: "TEAM B",
  team2_score: 0,
  theme_variant: "broadcast",
  ticker_active: 0,
  ticker_text: "",
};

const studioCopy: Record<
  StudioLanguage,
  {
    adMode: string;
    adPromo: string;
    adTitle: string;
    adVideoUrl: string;
    cameraPool: string;
    cameras: string;
    chooseFile: string;
    connected: string;
    directorAccess: string;
    directorControls: string;
    enterStudio: string;
    externalOverlay: string;
    externalOverlayHelp: string;
    externalOverlayOff: string;
    externalOverlayOn: string;
    goLive: string;
    graphics: string;
    graphicsHelp: string;
    leftLogo: string;
    liveCameras: string;
    loadingSettings: string;
    matchStatus: string;
    monitorAudioOff: string;
    monitorAudioOn: string;
    monitorVolume: string;
    noCamera: string;
    off: string;
    on: string;
    onAir: string;
    openCommandRoom: string;
    pin: string;
    programSource: string;
    refresh: string;
    relay: string;
    relayHelp: string;
    remove: string;
    rightLogo: string;
    roomStatus: string;
    save: string;
    saveGraphics: string;
    sponsor: string;
    stopRelay: string;
    studioEyebrow: string;
    studioHelp: string;
    takeAdLive: string;
    ticker: string;
    tickerOff: string;
    tickerOn: string;
    uploadLogo: string;
  }
> = {
  bn: {
    adMode: "অ্যাড মোড",
    adPromo: "অ্যাড / প্রোমো",
    adTitle: "অ্যাডের শিরোনাম",
    adVideoUrl: "অ্যাড ভিডিও URL",
    cameraPool: "ক্যামেরা পুল",
    cameras: "ক্যামেরা",
    chooseFile: "ফাইল বাছুন",
    connected: "সংযুক্ত",
    directorAccess: "ডিরেক্টর অ্যাক্সেস",
    directorControls: "ডিরেক্টর কন্ট্রোল",
    enterStudio: "স্টুডিওতে ঢুকুন",
    externalOverlay: "এক্সটার্নাল ওভারলে",
    externalOverlayHelp: "স্কোরিং বা গ্রাফিক্স ওয়েবসাইটের overlay URL দিন। এটি এই ওয়েবসাইটের প্রিভিউ/প্লেয়ারের উপর iframe হিসেবে দেখা যাবে।",
    externalOverlayOff: "ওভারলে বন্ধ",
    externalOverlayOn: "ওভারলে চালু",
    goLive: "লাইভ শুরু",
    graphics: "গ্রাফিক্স ও মেট্রিক্স",
    graphicsHelp: "লোগো, স্পন্সর, অ্যাড ভিডিও, চলন্ত বার্তা এবং এক্সটার্নাল ওভারলে নিয়ন্ত্রণ করুন।",
    leftLogo: "বাম লোগো",
    liveCameras: "লাইভ ক্যামেরা",
    loadingSettings: "রুম সেটিংস লোড হচ্ছে...",
    matchStatus: "ম্যাচ স্ট্যাটাস",
    monitorAudioOff: "মনিটর অডিও বন্ধ",
    monitorAudioOn: "মনিটর অডিও চালু",
    monitorVolume: "মনিটর ভলিউম",
    noCamera: "এখনও কোনো ফোন ক্যামেরা যুক্ত হয়নি। একই PIN দিয়ে ফোনে /camera খুলুন।",
    off: "বন্ধ",
    on: "চালু",
    onAir: "অন এয়ার",
    openCommandRoom: "কমান্ড রুম খুলুন।",
    pin: "PIN",
    programSource: "প্রোগ্রাম সোর্স",
    refresh: "রিফ্রেশ",
    relay: "VPS রিলে",
    relayHelp: "ব্রাউজার মিক্সার থেকে managed RTMP রিলে।",
    remove: "রিমুভ",
    rightLogo: "ডান লোগো",
    roomStatus: "রুম স্ট্যাটাস",
    save: "সেভ",
    saveGraphics: "গ্রাফিক্স সেভ",
    sponsor: "স্পন্সর",
    stopRelay: "রিলে বন্ধ",
    studioEyebrow: "SFU ডিরেক্টর স্টুডিও",
    studioHelp: "Cloudflare SFU ক্যামেরা ফিড টানুন, প্রোগ্রাম সুইচ করুন, গ্রাফিক্স চালান, তারপর রিলেতে পাঠান।",
    takeAdLive: "অ্যাড লাইভ নিন",
    ticker: "চলন্ত বার্তা",
    tickerOff: "বার্তা বন্ধ",
    tickerOn: "বার্তা চালু",
    uploadLogo: "লোগো আপলোড",
  },
  en: {
    adMode: "Ad Mode",
    adPromo: "Ad / Promo",
    adTitle: "Ad Title",
    adVideoUrl: "Ad Video URL",
    cameraPool: "Camera Pool",
    cameras: "Cameras",
    chooseFile: "Choose file",
    connected: "Connected",
    directorAccess: "Director Access",
    directorControls: "Director Controls",
    enterStudio: "Enter Studio",
    externalOverlay: "External Overlay",
    externalOverlayHelp: "Paste a scoring or graphics overlay URL. It appears as an iframe over this website player and preview.",
    externalOverlayOff: "Overlay Off",
    externalOverlayOn: "Overlay On",
    goLive: "Go Live",
    graphics: "Graphics & Metrics",
    graphicsHelp: "Control logos, sponsor, ad video, ticker, and external overlay.",
    leftLogo: "Left Logo",
    liveCameras: "Live Cameras",
    loadingSettings: "Loading room settings...",
    matchStatus: "Match Status",
    monitorAudioOff: "Monitor Audio Off",
    monitorAudioOn: "Monitor Audio On",
    monitorVolume: "Monitor Volume",
    noCamera: "No field camera has joined yet. Open /camera on a phone and join with the same PIN.",
    off: "Off",
    on: "On",
    onAir: "On Air",
    openCommandRoom: "Open the command room.",
    pin: "PIN",
    programSource: "Program Source",
    refresh: "Refresh",
    relay: "VPS Relay",
    relayHelp: "Browser mixer to managed RTMP relay.",
    remove: "Remove",
    rightLogo: "Right Logo",
    roomStatus: "Room Status",
    save: "Save",
    saveGraphics: "Save Graphics",
    sponsor: "Sponsor",
    stopRelay: "Stop Relay",
    studioEyebrow: "SFU Director Studio",
    studioHelp: "Pull Cloudflare SFU camera feeds, switch the program, control graphics, then send the final output to relay.",
    takeAdLive: "Take Ad Live",
    ticker: "Ticker Text",
    tickerOff: "Ticker Off",
    tickerOn: "Ticker On",
    uploadLogo: "Upload Logo",
  },
};

function buildRelayTarget(rtmpUrl: string, streamKey: string): string {
  return `${rtmpUrl.trim().replace(/\/+$/, "")}/${streamKey.trim().replace(/^\/+/, "")}`;
}

function getStudioVisibilityState(): StudioVisibilityState {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return "hidden";
  }

  return "visible";
}

export default function DirectorStudio() {
  const [language, setLanguage] = useState<StudioLanguage>("bn");
  const [pin, setPin] = useState("");
  const [directorName, setDirectorName] = useState("Director");
  const [joinState, setJoinState] = useState<JoinState | null>(null);
  const [destinations, setDestinations] = useState<BroadcastDestinationConfig[]>(defaultDestinations);
  const [overlay, setOverlay] = useState<OverlayConfig>(defaultOverlay);
  const [cameras, setCameras] = useState<PulledCamera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [destinationsSaving, setDestinationsSaving] = useState(false);
  const [overlaySaving, setOverlaySaving] = useState(false);
  const [refreshingCameras, setRefreshingCameras] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [destinationsNotice, setDestinationsNotice] = useState<string | null>(null);
  const [overlayNotice, setOverlayNotice] = useState<string | null>(null);
  const [monitorAudioEnabled, setMonitorAudioEnabled] = useState(false);
  const [monitorVolume, setMonitorVolume] = useState(0.7);
  const [documentVisibility, setDocumentVisibility] = useState<StudioVisibilityState>(() =>
    getStudioVisibilityState()
  );
  const [wasHiddenWhileLive, setWasHiddenWhileLive] = useState(false);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const overlayDirtyRef = useRef(false);
  const pullClientsRef = useRef<Map<string, { client: CloudflareSFUClient; sourceKey: string }>>(new Map());
  const pullingIdsRef = useRef<Set<string>>(new Set());
  const relayBroadcastersRef = useRef<LocalRelayBroadcaster[]>([]);
  const copy = studioCopy[language];

  const activeOutputs = destinations
    .filter((destination) => destination.rtmpUrl.trim() && destination.streamKey.trim())
    .map((destination) => ({
      key: destination.key,
      rtmpUrl: destination.rtmpUrl.trim(),
      streamKey: destination.streamKey.trim(),
    }))
    .filter((destination, index, outputs) => {
      const target = buildRelayTarget(destination.rtmpUrl, destination.streamKey);
      return outputs.findIndex((output) => buildRelayTarget(output.rtmpUrl, output.streamKey) === target) === index;
    });

  const selectedCamera = cameras.find((camera) => camera.id === selectedCameraId) ?? null;
  const adVideoIssue = getAdVideoUrlIssue(overlay.ad_video_url ?? "");
  const playableAdVideoUrl = adVideoIssue ? "" : overlay.ad_video_url ?? "";
  const selectedStream = overlay.program_source === "live" ? selectedCamera?.stream ?? null : null;
  const streamGuardState = getStreamGuardState(
    relayStatus === "live",
    documentVisibility,
    wasHiddenWhileLive
  );
  const handleMixedStreamReady = useCallback((stream: MediaStream) => {
    mixedStreamRef.current = stream;
  }, []);

  const refreshCameras = useCallback(async () => {
    if (!joinState) {
      return;
    }

    setRefreshingCameras(true);
    try {
      const latestCameras = await getRoomCameras(joinState.room.id);
      setCameras((current) => {
        return reconcilePulledCameras(current, latestCameras);
      });
    } catch (refreshError: unknown) {
      setSettingsError(
        refreshError instanceof Error ? refreshError.message : "Could not refresh cameras"
      );
    } finally {
      setRefreshingCameras(false);
    }
  }, [joinState]);

  useEffect(() => {
    if (!joinState) {
      return;
    }

    void refreshCameras();
    const intervalId = window.setInterval(() => void refreshCameras(), 5_000);
    return () => window.clearInterval(intervalId);
  }, [joinState, refreshCameras]);

  useEffect(() => {
    if (!joinState) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (overlayDirtyRef.current) {
        return;
      }

      void getOverlayConfig(joinState.room.id)
        .then((overlayConfig) => {
          setOverlay({
            ...defaultOverlay,
            ...overlayConfig,
            scoring_data: overlayConfig.scoring_data ?? {},
          });
        })
        .catch(() => undefined);
    }, 2_000);

    return () => window.clearInterval(intervalId);
  }, [joinState]);

  useEffect(() => {
    if (!joinState) {
      return;
    }

    const activeCameraIds = new Set(cameras.map((camera) => camera.id));
    for (const [cameraId, entry] of pullClientsRef.current.entries()) {
      const camera = cameras.find((item) => item.id === cameraId);
      if (!camera || getCameraSourceKey(camera) !== entry.sourceKey) {
        entry.client.close();
        pullClientsRef.current.delete(cameraId);
        pullingIdsRef.current.delete(cameraId);
      }
    }
    for (const pullingId of [...pullingIdsRef.current]) {
      if (!activeCameraIds.has(pullingId)) {
        pullingIdsRef.current.delete(pullingId);
      }
    }

    const pending = cameras.filter(
      (camera) => camera.status === "pulling" && !pullingIdsRef.current.has(camera.id)
    );

    for (const camera of pending) {
      pullingIdsRef.current.add(camera.id);
      void pullCamera(camera);
    }
  }, [cameras, joinState]);

  useEffect(() => {
    const nextCameraId = chooseDirectorCameraId(selectedCameraId, cameras);
    if (nextCameraId !== selectedCameraId) {
      setSelectedCameraId(nextCameraId);
    }
  }, [cameras, selectedCameraId]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    function updateVisibility() {
      const nextVisibility = getStudioVisibilityState();
      setDocumentVisibility(nextVisibility);
      if (relayStatus === "live" && nextVisibility === "hidden") {
        setWasHiddenWhileLive(true);
      }
    }

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, [relayStatus]);

  useEffect(() => {
    if (relayStatus !== "live") {
      setWasHiddenWhileLive(false);
    }
  }, [relayStatus]);

  useEffect(() => {
    return () => {
      relayBroadcastersRef.current.forEach((broadcaster) => broadcaster.stop());
      relayBroadcastersRef.current = [];
      pullClientsRef.current.forEach((entry) => entry.client.close());
      pullClientsRef.current.clear();
    };
  }, []);

  async function pullCamera(camera: PulledCamera) {
    const sourceKey = getCameraSourceKey(camera);
    let clientEntry = pullClientsRef.current.get(camera.id);
    if (clientEntry && clientEntry.sourceKey !== sourceKey) {
      clientEntry.client.close();
      pullClientsRef.current.delete(camera.id);
      clientEntry = undefined;
    }

    try {
      if (!clientEntry) {
        clientEntry = {
          client: await CloudflareSFUClient.create(),
          sourceKey,
        };
        pullClientsRef.current.set(camera.id, clientEntry);
      }

      const trackRequests: RemoteTrackRequest[] = [
        {
          kind: "video",
          sessionId: camera.sessionId,
          trackName: camera.videoTrackName,
        },
      ];

      if (camera.audioTrackName) {
        trackRequests.push({
          kind: "audio",
          sessionId: camera.sessionId,
          trackName: camera.audioTrackName,
        });
      }

      const tracks = await clientEntry.client.pullTracks(trackRequests);
      const stream = new MediaStream([
        ...(tracks.video ? [tracks.video] : []),
        ...(tracks.audio ? [tracks.audio] : []),
      ]);

      if (!tracks.video) {
        throw new Error("Cloudflare SFU did not deliver a video track.");
      }

      setCameras((current) =>
        current.map((item) =>
          item.id === camera.id && getCameraSourceKey(item) === sourceKey
            ? { ...item, error: null, status: "ready", stream }
            : item
        )
      );
    } catch (pullError: unknown) {
      setCameras((current) =>
        current.map((item) =>
          item.id === camera.id && getCameraSourceKey(item) === sourceKey
            ? {
                ...item,
                error: pullError instanceof Error ? pullError.message : "Could not pull camera",
                status: "error",
                stream: null,
              }
            : item
        )
      );
    } finally {
      pullingIdsRef.current.delete(camera.id);
    }
  }

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSettingsError(null);

    try {
      const verifiedRoom = await verifyRoomPin(pin.trim());
      const room =
        verifiedRoom.status === "ready"
          ? await startRoomSession(verifiedRoom.id)
          : verifiedRoom;
      setJoinState({ room });
      setSettingsLoading(true);

      const [destinationResult, overlayResult] = await Promise.allSettled([
        getBroadcastConfig(room.id),
        getOverlayConfig(room.id),
      ]);

      if (destinationResult.status === "fulfilled") {
        setDestinations(destinationResult.value);
      } else {
        setSettingsError("Broadcast destinations could not be loaded.");
      }

      if (overlayResult.status === "fulfilled") {
        setOverlay({
          ...defaultOverlay,
          ...overlayResult.value,
          scoring_data: overlayResult.value.scoring_data ?? {},
        });
      } else {
        setSettingsError("Graphics settings could not be loaded.");
      }
    } catch (joinError: unknown) {
      setError(joinError instanceof Error ? joinError.message : "Could not join studio");
    } finally {
      setLoading(false);
      setSettingsLoading(false);
    }
  }

  async function handleSaveDestinations() {
    if (!joinState) {
      return;
    }

    setDestinationsSaving(true);
    setBroadcastError(null);
    setDestinationsNotice(null);

    try {
      const persistedDestinations = await saveBroadcastConfig(joinState.room.id, destinations);
      setDestinations(persistedDestinations);
      setDestinationsNotice("Broadcast destinations saved.");
    } catch (saveError: unknown) {
      setBroadcastError(
        saveError instanceof Error ? saveError.message : "Could not save destinations"
      );
    } finally {
      setDestinationsSaving(false);
    }
  }

  async function handleSaveOverlay() {
    if (!joinState) {
      return;
    }

    setOverlaySaving(true);
    setOverlayNotice(null);
    setSettingsError(null);

    try {
      await saveOverlayConfig(joinState.room.id, overlay);
      overlayDirtyRef.current = false;
      setOverlayNotice("Graphics saved for this room.");
    } catch (saveError: unknown) {
      setSettingsError(saveError instanceof Error ? saveError.message : "Could not save graphics");
    } finally {
      setOverlaySaving(false);
    }
  }

  async function handleStartRelay() {
    if (!joinState) {
      return;
    }

    if (relayStatus === "starting") {
      return;
    }

    if (activeOutputs.length === 0) {
      setBroadcastError("Add at least one YouTube or Facebook destination before going live.");
      return;
    }

    if (!mixedStreamRef.current) {
      setBroadcastError("Program mixer is not ready yet.");
      return;
    }

    setRelayStatus("starting");
    setBroadcastError(null);
    setDestinationsNotice(null);

    try {
      const persistedDestinations = await saveBroadcastConfig(joinState.room.id, destinations);
      setDestinations(persistedDestinations);
      await saveOverlayConfig(joinState.room.id, overlay);
      const relayConfig = await getRelayConfig(joinState.room.id);

      relayBroadcastersRef.current.forEach((broadcaster) => broadcaster.stop());
      relayBroadcastersRef.current = [];

      const relayTargets = activeOutputs.map((output) => ({ ...output, testOutputPath: undefined }));
      const broadcasters = relayTargets.map(() => new LocalRelayBroadcaster());
      await Promise.all(
        broadcasters.map((broadcaster, index) =>
          broadcaster.start(mixedStreamRef.current as MediaStream, {
            onRelayMessage: (message) => {
              if (message.type === "error" || message.type === "closed") {
                setRelayStatus("idle");
                setBroadcastError(message.message ?? "Relay connection stopped");
              }
            },
            relayUrl: relayConfig.websocketUrl,
            roomId: joinState.room.id,
            rtmpUrl: relayTargets[index].rtmpUrl,
            streamKey: relayTargets[index].streamKey,
            testOutputPath: relayTargets[index].testOutputPath,
          })
        )
      );

      relayBroadcastersRef.current = broadcasters;
      setRelayStatus("live");
      setDestinationsNotice("Managed relay is live.");
    } catch (startError: unknown) {
      relayBroadcastersRef.current.forEach((broadcaster) => broadcaster.stop());
      relayBroadcastersRef.current = [];
      setRelayStatus("idle");
      setBroadcastError(
        startError instanceof Error ? startError.message : "Could not start relay"
      );
    }
  }

  function handleStopRelay() {
    setRelayStatus("stopping");
    relayBroadcastersRef.current.forEach((broadcaster) => broadcaster.stop());
    relayBroadcastersRef.current = [];
    setRelayStatus("idle");
  }

  function updateDestination(
    key: string,
    field: "rtmpUrl" | "streamKey",
    value: string
  ) {
    setDestinations((current) =>
      current.map((destination) =>
        destination.key === key ? { ...destination, [field]: value } : destination
      )
    );
    setDestinationsNotice(null);
  }

  function updateOverlay(field: keyof OverlayConfig, value: OverlayConfig[keyof OverlayConfig]) {
    overlayDirtyRef.current = true;
    setOverlay((current) => ({
      ...current,
      [field]: value,
    }));
    setOverlayNotice(null);
  }

  function setCameraTrackEnabled(cameraId: string, kind: "audio" | "video", enabled: boolean) {
    setCameras((current) =>
      current.map((camera) => {
        if (camera.id !== cameraId) {
          return camera;
        }

        const tracks = kind === "audio" ? camera.stream?.getAudioTracks() : camera.stream?.getVideoTracks();
        tracks?.forEach((track) => {
          track.enabled = enabled;
        });

        return { ...camera };
      })
    );
  }

  if (!joinState) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8 sm:px-6">
        <section className="glass-panel w-full rounded-[2rem] p-6 sm:p-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-cyan)]">
                <Shield size={14} />
                {copy.directorAccess}
              </div>
              <h1 data-display className="text-4xl font-bold tracking-tight text-[var(--text-main)]">
                {copy.openCommandRoom}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                {copy.studioHelp}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLanguage((current) => (current === "bn" ? "en" : "bn"))}
              className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-main)]"
            >
              <Languages size={14} />
              {language === "bn" ? "EN" : "বাংলা"}
            </button>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <InputField
              label="Room PIN"
              value={pin}
              tracking
              onChange={setPin}
              placeholder="123456"
            />
            <InputField
              label="Director Name"
              value={directorName}
              onChange={setDirectorName}
              placeholder="Match Director"
            />

            {error ? <ErrorBox message={error} /> : null}

            <button
              type="submit"
              disabled={loading || pin.trim().length < 4}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent-cyan)] px-5 py-4 text-sm font-semibold text-[#041016] hover:scale-[1.01] disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <BadgeCheck size={18} />}
              {copy.enterStudio}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid min-h-[calc(100vh-2rem)] gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="glass-panel overflow-hidden rounded-[2rem]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-4 sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-lime)]">
                {copy.studioEyebrow}
              </p>
              <h1 data-display className="text-2xl font-bold text-[var(--text-main)]">
                {joinState.room.name}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm text-[var(--text-main)]">
                {copy.pin} {joinState.room.pin}
              </div>
              <div className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm text-[var(--text-main)]">
                {copy.relay} {relayStatus}
              </div>
              <button
                type="button"
                onClick={() => setLanguage((current) => (current === "bn" ? "en" : "bn"))}
                className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]"
              >
                <Languages size={15} />
                {language === "bn" ? "EN" : "বাংলা"}
              </button>
            </div>
          </header>

          <ProgramMixer
            adVideoIssue={overlay.program_source === "ad" ? adVideoIssue : null}
            adVideoUrl={overlay.program_source === "ad" ? playableAdVideoUrl : ""}
            monitorAudioEnabled={monitorAudioEnabled}
            monitorVolume={monitorVolume}
            overlay={overlay}
            selectedStream={selectedStream}
            onMixedStreamReady={handleMixedStreamReady}
          />

          <StreamGuardBanner state={streamGuardState} />

          <div className="grid gap-4 border-t border-[var(--border-soft)] px-4 py-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <MiniStat label={copy.roomStatus} value={copy.connected} />
                <MiniStat label={copy.cameras} value={String(cameras.length)} />
                <MiniStat label={copy.onAir} value={overlay.program_source === "ad" ? copy.adMode : copy.liveCameras} />
                <MiniStat
                  label={copy.externalOverlay}
                  value={overlay.scoreboard_active === 1 && overlay.external_scoreboard_url?.trim() ? copy.on : copy.off}
                />
              </div>

              <div className="glass-panel rounded-[1.75rem] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 data-display className="text-xl font-semibold text-[var(--text-main)]">
                      {copy.cameraPool}
                    </h2>
                    <p className="text-sm text-[var(--text-muted)]">
                      {copy.studioHelp}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshCameras()}
                    disabled={refreshingCameras}
                    className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-main)] disabled:opacity-50"
                  >
                    {refreshingCameras ? <Loader2 className="animate-spin" size={14} /> : <RefreshCcw size={14} />}
                    {copy.refresh}
                  </button>
                </div>

                {settingsError ? <ErrorBox message={settingsError} className="mt-4" /> : null}

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {cameras.length > 0 ? (
                    cameras.map((camera) => (
                      <CameraCard
                        key={getCameraSourceKey(camera)}
                        camera={camera}
                        copy={copy}
                        isLive={overlay.program_source === "live" && selectedCameraId === camera.id}
                        onToggleAudio={(enabled) => setCameraTrackEnabled(camera.id, "audio", enabled)}
                        onToggleVideo={(enabled) => setCameraTrackEnabled(camera.id, "video", enabled)}
                        onTakeLive={() => {
                          setSelectedCameraId(camera.id);
                          updateOverlay("program_source", "live");
                        }}
                      />
                    ))
                  ) : (
                    <div className="rounded-[1.5rem] border border-dashed border-[var(--border-soft)] bg-black/10 px-5 py-8 text-center text-sm text-[var(--text-muted)] xl:col-span-1">
                      {copy.noCamera}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="glass-panel rounded-[1.75rem] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 data-display className="text-lg font-semibold text-[var(--text-main)]">
                      {copy.directorControls}
                    </h2>
                    <p className="text-sm text-[var(--text-muted)]">
                      {copy.studioHelp}
                    </p>
                  </div>
                  <WandSparkles className="text-[var(--accent-cyan)]" size={18} />
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ToggleChip
                    active={overlay.program_source === "live"}
                    label={copy.liveCameras}
                    onClick={() => updateOverlay("program_source", "live")}
                  />
                  <ToggleChip
                    active={overlay.program_source === "ad"}
                    label={copy.adMode}
                    onClick={() => updateOverlay("program_source", "ad")}
                  />
                  <ToggleChip
                    active={monitorAudioEnabled}
                    label={monitorAudioEnabled ? copy.monitorAudioOn : copy.monitorAudioOff}
                    onClick={() => setMonitorAudioEnabled((current) => !current)}
                  />
                </div>
                <label className="mt-4 block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    {copy.monitorVolume}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={monitorVolume}
                    onChange={(event) => setMonitorVolume(Number(event.target.value))}
                    className="w-full"
                  />
                </label>
                {overlay.program_source === "ad" && adVideoIssue ? (
                  <ErrorBox message={adVideoIssue} className="mt-4" />
                ) : null}
              </div>

            </section>
          </div>
        </section>

        <aside className="space-y-3">
          <GraphicsPanel
            copy={copy}
            onOverlayChange={updateOverlay}
            onSaveOverlay={handleSaveOverlay}
            overlay={overlay}
            overlayNotice={overlayNotice}
            overlaySaving={overlaySaving}
            room={joinState.room}
          />

          <section className="glass-panel rounded-[1.5rem] p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-full bg-[var(--accent-cyan)]/12 p-2.5 text-[var(--accent-cyan)]">
                <Radio size={18} />
              </div>
              <div>
                <h2 data-display className="text-lg font-semibold text-[var(--text-main)]">
                  {copy.relay}
                </h2>
                <p className="text-xs leading-5 text-[var(--text-muted)]">
                  {copy.relayHelp}
                </p>
              </div>
            </div>

            {settingsLoading ? (
              <div className="rounded-[1.25rem] border border-[var(--border-soft)] bg-black/15 px-4 py-4 text-sm text-[var(--text-muted)]">
                {copy.loadingSettings}
              </div>
            ) : (
              <div className="space-y-3">
                {destinations.map((destination) => (
                  <div
                    key={destination.key}
                    className="rounded-[1.1rem] border border-[var(--border-soft)] bg-black/20 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-main)]">
                      <Video size={14} />
                      {destination.label}
                    </div>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={destination.rtmpUrl}
                        onChange={(event) =>
                          updateDestination(destination.key, "rtmpUrl", event.target.value)
                        }
                        className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-2.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
                        placeholder="RTMP URL"
                      />
                      <input
                        type="password"
                        value={destination.streamKey}
                        onChange={(event) =>
                          updateDestination(destination.key, "streamKey", event.target.value)
                        }
                        className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-2.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
                        placeholder="Stream key"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {broadcastError ? <ErrorBox message={broadcastError} className="mt-4" /> : null}
            {destinationsNotice ? <NoticeBox message={destinationsNotice} className="mt-4" /> : null}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleSaveDestinations}
                disabled={destinationsSaving || settingsLoading}
                className="flex items-center justify-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--text-main)] disabled:opacity-50"
              >
                {destinationsSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {copy.save}
              </button>
              <button
                type="button"
                onClick={() => void handleStartRelay()}
                disabled={relayStatus === "starting" || settingsLoading}
                className="rounded-full bg-[var(--accent-coral)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {relayStatus === "starting" ? "Starting..." : relayStatus === "live" ? "Restart Relay" : copy.goLive}
              </button>
              <button
                type="button"
                onClick={handleStopRelay}
                disabled={relayStatus !== "live"}
                className="rounded-full border border-[var(--border-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--text-main)] disabled:opacity-50 sm:col-span-2"
              >
                {copy.stopRelay}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function ProgramMixer({
  adVideoUrl,
  adVideoIssue,
  monitorAudioEnabled,
  monitorVolume,
  onMixedStreamReady,
  overlay,
  selectedStream,
}: {
  adVideoUrl: string;
  adVideoIssue: string | null;
  monitorAudioEnabled: boolean;
  monitorVolume: number;
  onMixedStreamReady: (stream: MediaStream) => void;
  overlay: OverlayConfig;
  selectedStream: MediaStream | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const adVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasCaptureTrackRef = useRef<RequestableCanvasTrack | null>(null);
  const renderTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const logoImagesRef = useRef<{ left: HTMLImageElement | null; right: HTMLImageElement | null }>({
    left: null,
    right: null,
  });

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = selectedStream;
    video.muted = true;
    video.volume = 0;
    if (selectedStream) {
      void video.play().catch(() => undefined);
    }

    return () => {
      video.srcObject = null;
    };
  }, [selectedStream]);

  useEffect(() => {
    const leftLogo = overlay.left_logo_url || overlay.logo_url || "";
    const rightLogo = overlay.right_logo_url || overlay.logo_url || "";
    logoImagesRef.current.left = leftLogo ? createLogoImage(leftLogo) : null;
    logoImagesRef.current.right = rightLogo ? createLogoImage(rightLogo) : null;
  }, [overlay.left_logo_url, overlay.logo_url, overlay.right_logo_url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.width = 1280;
    canvas.height = 720;
    const canvasStream = canvas.captureStream(0);
    const [canvasVideoTrack] = canvasStream.getVideoTracks() as RequestableCanvasTrack[];
    if (canvasVideoTrack) {
      canvasVideoTrack.contentHint = "motion";
      canvasCaptureTrackRef.current = canvasVideoTrack;
    }
    const audioContext = new AudioContext();
    const audioDestination = audioContext.createMediaStreamDestination();
    const monitorGain = audioContext.createGain();
    monitorGain.gain.value = 0;
    monitorGain.connect(audioContext.destination);
    audioContextRef.current = audioContext;
    audioDestinationRef.current = audioDestination;
    monitorGainRef.current = monitorGain;
    onMixedStreamReady(
      new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ])
    );

    return () => {
      canvasStream.getTracks().forEach((track) => track.stop());
      void audioContext.close().catch(() => undefined);
      canvasCaptureTrackRef.current = null;
      audioContextRef.current = null;
      audioDestinationRef.current = null;
      monitorGainRef.current = null;
    };
  }, [onMixedStreamReady]);

  useEffect(() => {
    const audioContext = audioContextRef.current;
    const monitorGain = monitorGainRef.current;
    if (!audioContext || !monitorGain) {
      return;
    }

    monitorGain.gain.value = monitorAudioEnabled ? monitorVolume : 0;
    if (monitorAudioEnabled) {
      void audioContext.resume().catch(() => undefined);
    }
  }, [monitorAudioEnabled, monitorVolume]);

  useEffect(() => {
    const audioContext = audioContextRef.current;
    const audioDestination = audioDestinationRef.current;
    if (!audioContext || !audioDestination) {
      return;
    }

    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;

    if (selectedStream && selectedStream.getAudioTracks().length > 0) {
      const source = audioContext.createMediaStreamSource(selectedStream);
      source.connect(audioDestination);
      if (monitorGainRef.current) {
        source.connect(monitorGainRef.current);
      }
      audioSourceRef.current = source;
      void audioContext.resume().catch(() => undefined);
    }

    return () => {
      audioSourceRef.current?.disconnect();
      audioSourceRef.current = null;
    };
  }, [selectedStream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    function drawFrame() {
      if (!canvas || !context) {
        return;
      }

      const activeVideo = overlay.program_source === "ad" && adVideoUrl ? adVideoRef.current : liveVideoRef.current;
      const now = performance.now();
      drawProgramFrame(context, canvas, activeVideo, overlay, logoImagesRef.current, now);
      canvasCaptureTrackRef.current?.requestFrame?.();
    }

    drawFrame();
    renderTimerRef.current = window.setInterval(drawFrame, 1000 / 30);
    return () => {
      if (renderTimerRef.current !== null) {
        window.clearInterval(renderTimerRef.current);
        renderTimerRef.current = null;
      }
    };
  }, [adVideoUrl, overlay]);

  return (
    <section className="relative bg-[#02070c]">
      <canvas ref={canvasRef} className="h-[58vh] w-full bg-[#02070c] object-contain" />
      {overlay.scoreboard_active === 1 && overlay.external_scoreboard_url?.trim() ? (
        <ScoreboardOverlay overlay={overlay} />
      ) : null}
      {adVideoIssue ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl border border-[var(--accent-coral)]/40 bg-black/80 px-4 py-3 text-sm text-[var(--text-main)]">
          {adVideoIssue}
        </div>
      ) : null}
      <video ref={liveVideoRef} autoPlay playsInline className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" />
      {adVideoUrl ? (
        <video
          key={adVideoUrl}
          ref={adVideoRef}
          src={adVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          crossOrigin="anonymous"
          className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
        />
      ) : null}
    </section>
  );
}

function StreamGuardBanner({ state }: { state: ReturnType<typeof getStreamGuardState> }) {
  if (state.level === "idle") {
    return null;
  }

  const isWarning = state.level === "warning";

  return (
    <div
      className={`border-t border-[var(--border-soft)] px-4 py-3 sm:px-6 ${
        isWarning
          ? "bg-[var(--accent-coral)]/12 text-[#ffd8d4]"
          : "bg-[var(--accent-lime)]/8 text-[#d9ffe4]"
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={isWarning ? "mt-0.5 text-[var(--accent-coral)]" : "mt-0.5 text-[var(--accent-lime)]"}
          size={18}
        />
        <div>
          <p className="text-sm font-semibold text-[var(--text-main)]">{state.title}</p>
          <p className="mt-1 text-sm leading-5">{state.message}</p>
        </div>
      </div>
    </div>
  );
}

function createLogoImage(url: string): HTMLImageElement {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  return image;
}

function drawProgramFrame(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement | null,
  overlay: OverlayConfig,
  logos: { left: HTMLImageElement | null; right: HTMLImageElement | null },
  now: number
) {
  context.fillStyle = "#02070c";
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (video && video.readyState >= 2) {
    drawVideoCover(context, canvas, video);
  } else {
    drawNoSignal(context, canvas);
  }

  drawLiveBadge(context);

  if (overlay.scoreboard_active === 1 && !overlay.external_scoreboard_url?.trim()) {
    drawScoreboard(context, canvas, overlay);
  }

  drawLogos(context, canvas, logos);

  if (overlay.ticker_active === 1 && overlay.ticker_text?.trim()) {
    drawTicker(context, canvas, overlay.ticker_text, now);
  }
}

function drawVideoCover(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement
) {
  const videoWidth = video.videoWidth || canvas.width;
  const videoHeight = video.videoHeight || canvas.height;
  const scale = Math.max(canvas.width / videoWidth, canvas.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;
  context.drawImage(video, x, y, width, height);
}

function drawNoSignal(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  context.fillStyle = "#07111d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#d7e2ea";
  context.font = "700 34px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText("NO SIGNAL / WAITING FOR CAMERA", canvas.width / 2, canvas.height / 2);
}

function drawLiveBadge(context: CanvasRenderingContext2D) {
  context.fillStyle = "#ff6b5c";
  roundRect(context, 32, 28, 74, 30, 15);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "800 14px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText("LIVE", 69, 48);
}

function drawScoreboard(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  overlay: OverlayConfig
) {
  if (overlay.sport === "cricket") {
    drawCricketScoreboard(context, canvas, overlay);
    return;
  }

  const width = 640;
  const height = 82;
  const x = (canvas.width - width) / 2;
  const y = 28;

  context.fillStyle = "rgba(3,10,18,0.82)";
  roundRect(context, x, y, width, height, 14);
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.16)";
  context.stroke();

  context.fillStyle = "#9ff8ff";
  context.font = "800 24px Inter, sans-serif";
  context.textAlign = "right";
  context.fillText(truncateCanvasText(overlay.team1_name, 12), x + 226, y + 50);
  context.textAlign = "left";
  context.fillStyle = "#d8ff79";
  context.fillText(truncateCanvasText(overlay.team2_name, 12), x + width - 226, y + 50);

  context.fillStyle = "#ffffff";
  context.font = "900 38px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText(`${overlay.team1_score} - ${overlay.team2_score}`, x + width / 2, y + 54);

  context.fillStyle = "#ffffffcc";
  context.font = "700 14px Inter, sans-serif";
  context.fillText(`${overlay.match_status ?? "LIVE"} · ${overlay.clock_text ?? "00:00"}`, x + width / 2, y + 75);
}

function drawCricketScoreboard(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  overlay: OverlayConfig
) {
  const width = 720;
  const height = 96;
  const x = (canvas.width - width) / 2;
  const y = 28;
  const runs = `${overlay.scoring_data?.runs ?? overlay.team1_score}`;
  const wickets = `${overlay.scoring_data?.wickets ?? 0}`;
  const overs = `${overlay.scoring_data?.overs ?? "0.0"}`;
  const target = `${overlay.scoring_data?.target ?? ""}`.trim();

  context.fillStyle = "rgba(3,10,18,0.86)";
  roundRect(context, x, y, width, height, 14);
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.16)";
  context.stroke();

  context.fillStyle = "#9ff8ff";
  context.font = "800 17px Inter, sans-serif";
  context.textAlign = "left";
  context.fillText("CRICKET", x + 26, y + 30);
  context.fillStyle = "#ffffff";
  context.font = "900 36px Inter, sans-serif";
  context.fillText(`${runs}/${wickets}`, x + 26, y + 70);

  context.fillStyle = "#d8ff79";
  context.font = "800 24px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText(truncateCanvasText(overlay.team1_name, 18), x + width / 2, y + 44);
  context.fillStyle = "#ffffffcc";
  context.font = "700 15px Inter, sans-serif";
  const meta = target ? `${overs} overs · Target ${target}` : `${overs} overs`;
  context.fillText(`${meta} · ${overlay.match_status ?? "LIVE"}`, x + width / 2, y + 72);

  context.fillStyle = "#ffffff";
  context.font = "800 18px Inter, sans-serif";
  context.textAlign = "right";
  context.fillText(truncateCanvasText(overlay.team2_name, 15), x + width - 26, y + 56);
}

function drawLogos(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  logos: { left: HTMLImageElement | null; right: HTMLImageElement | null }
) {
  if (logos.left?.complete && logos.left.naturalWidth > 0) {
    context.drawImage(logos.left, 32, 108, 96, 96);
  }

  if (logos.right?.complete && logos.right.naturalWidth > 0) {
    context.drawImage(logos.right, canvas.width - 128, 108, 96, 96);
  }
}

function drawTicker(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
  now: number
) {
  const height = 46;
  const y = canvas.height - height - 24;
  context.fillStyle = "rgba(0,0,0,0.72)";
  roundRect(context, 32, y, canvas.width - 64, height, 10);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "700 20px Inter, sans-serif";
  context.textAlign = "left";
  const repeated = `${text}     ${text}     ${text}`;
  const offset = -((now / 28) % Math.max(320, context.measureText(text).width + 80));
  context.fillText(repeated, 48 + offset, y + 30);
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function truncateCanvasText(value: string | null | undefined, maxLength: number): string {
  const text = value?.trim() || "";
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function CameraCard({
  camera,
  copy,
  isLive,
  onTakeLive,
  onToggleAudio,
  onToggleVideo,
}: {
  camera: PulledCamera;
  copy: (typeof studioCopy)[StudioLanguage];
  isLive: boolean;
  onTakeLive: () => void;
  onToggleAudio: (enabled: boolean) => void;
  onToggleVideo: (enabled: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = camera.stream;
    if (camera.stream) {
      void video.play().catch(() => undefined);
    }

    return () => {
      video.srcObject = null;
    };
  }, [camera.stream]);

  const audioEnabled = Boolean(
    camera.stream?.getAudioTracks().some((track) => track.readyState === "live" && track.enabled)
  );
  const videoEnabled = Boolean(
    camera.stream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled)
  );

  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-[var(--border-soft)] bg-black/20">
      <div className="relative aspect-video overflow-hidden bg-[#04080d]">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        {camera.status !== "ready" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/65">
            <div className="text-center">
              {camera.status === "pulling" ? (
                <Loader2 className="mx-auto animate-spin text-[var(--accent-cyan)]" size={24} />
              ) : (
                <CameraOff className="mx-auto text-white/70" size={24} />
              )}
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
                {camera.status === "pulling" ? "Pulling SFU Track" : "Pull Failed"}
              </p>
            </div>
          </div>
        ) : null}
        <div className="absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
          {camera.id}
        </div>
        {isLive ? (
          <div className="absolute right-3 top-3 rounded-full bg-[var(--accent-coral)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
            {copy.onAir}
          </div>
        ) : null}
      </div>
      <div className="space-y-3 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 data-display className="truncate text-lg font-semibold text-[var(--text-main)]">
              {camera.id}
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge icon={videoEnabled ? <Camera size={12} /> : <CameraOff size={12} />} label={videoEnabled ? "Video On" : "Video Off"} />
              <Badge icon={audioEnabled ? <Mic size={12} /> : <MicOff size={12} />} label={audioEnabled ? "Audio On" : "Audio Off"} />
            </div>
          </div>
        </div>

        {camera.error ? (
          <p className="rounded-xl border border-[var(--accent-coral)]/25 bg-[var(--accent-coral)]/10 px-3 py-2 text-xs text-[#ffd8d4]">
            {camera.error}
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onToggleAudio(!audioEnabled)}
            disabled={camera.status !== "ready" || camera.stream?.getAudioTracks().length === 0}
            className="rounded-full border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-main)] disabled:opacity-50"
          >
            {audioEnabled ? "Mute Mic" : "Unmute Mic"}
          </button>
          <button
            type="button"
            onClick={() => onToggleVideo(!videoEnabled)}
            disabled={camera.status !== "ready"}
            className="rounded-full border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-main)] disabled:opacity-50"
          >
            {videoEnabled ? "Hide Video" : "Show Video"}
          </button>
          <button
            type="button"
            onClick={onTakeLive}
            disabled={camera.status !== "ready"}
            className={`rounded-full px-3 py-2 text-xs font-semibold ${
              isLive
                ? "bg-[var(--accent-cyan)] text-[#041016]"
                : "border border-[var(--border-soft)] text-[var(--text-main)]"
            } disabled:opacity-50`}
          >
            {isLive ? copy.onAir : copy.liveCameras}
          </button>
        </div>
      </div>
    </article>
  );
}

function GraphicsPanel({
  copy,
  onOverlayChange,
  onSaveOverlay,
  overlay,
  overlayNotice,
  overlaySaving,
  room,
}: {
  copy: (typeof studioCopy)[StudioLanguage];
  onOverlayChange: (field: keyof OverlayConfig, value: OverlayConfig[keyof OverlayConfig]) => void;
  onSaveOverlay: () => Promise<void>;
  overlay: OverlayConfig;
  overlayNotice: string | null;
  overlaySaving: boolean;
  room: RoomSummary;
}) {
  const [assetBusyField, setAssetBusyField] = useState<"left_logo_url" | "right_logo_url" | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);

  async function handleLogoUpload(field: "left_logo_url" | "right_logo_url", file: File) {
    setAssetBusyField(field);
    setAssetError(null);

    try {
      const compressedFile = await compressLogoFile(file);
      const result = await uploadRoomAsset({
        field,
        file: compressedFile,
        filename: `${field}.webp`,
        roomId: room.id,
      });
      onOverlayChange(field, result.asset.publicUrl);
    } catch (uploadError: unknown) {
      setAssetError(uploadError instanceof Error ? uploadError.message : "Could not upload logo");
    } finally {
      setAssetBusyField(null);
    }
  }

  async function handleLogoRemove(field: "left_logo_url" | "right_logo_url") {
    setAssetBusyField(field);
    setAssetError(null);

    try {
      await deleteRoomAsset(room.id, field);
      onOverlayChange(field, "");
    } catch (deleteError: unknown) {
      setAssetError(deleteError instanceof Error ? deleteError.message : "Could not remove logo");
    } finally {
      setAssetBusyField(null);
    }
  }

  return (
    <section className="glass-panel rounded-[2rem] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 data-display className="text-xl font-semibold text-[var(--text-main)]">
            {copy.graphics}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            {copy.graphicsHelp}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOverlayChange("scoreboard_active", overlay.scoreboard_active === 1 ? 0 : 1)}
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
            overlay.scoreboard_active === 1
              ? "bg-[var(--accent-cyan)] text-[#041016]"
              : "border border-[var(--border-soft)] text-[var(--text-main)]"
          }`}
        >
          {overlay.scoreboard_active === 1 ? copy.externalOverlayOn : copy.externalOverlayOff}
        </button>
      </div>

      <div className="mt-4 space-y-4 rounded-[1.5rem] border border-[var(--border-soft)] bg-black/15 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField label={copy.matchStatus} value={overlay.match_status ?? ""} onChange={(value) => onOverlayChange("match_status", value)} />
          <InputField label={copy.sponsor} value={overlay.sponsor_text ?? ""} onChange={(value) => onOverlayChange("sponsor_text", value)} />
          <SelectField
            label={copy.programSource}
            value={overlay.program_source ?? "live"}
            onChange={(value) => onOverlayChange("program_source", value as OverlayConfig["program_source"])}
            options={[
              { label: copy.liveCameras, value: "live" },
              { label: copy.adPromo, value: "ad" },
            ]}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <LogoUploadControl
            busy={assetBusyField === "left_logo_url"}
            copy={copy}
            field="left_logo_url"
            label={copy.leftLogo}
            value={overlay.left_logo_url ?? ""}
            onRemove={() => void handleLogoRemove("left_logo_url")}
            onUpload={(file) => void handleLogoUpload("left_logo_url", file)}
          />
          <LogoUploadControl
            busy={assetBusyField === "right_logo_url"}
            copy={copy}
            field="right_logo_url"
            label={copy.rightLogo}
            value={overlay.right_logo_url ?? ""}
            onRemove={() => void handleLogoRemove("right_logo_url")}
            onUpload={(file) => void handleLogoUpload("right_logo_url", file)}
          />
        </div>

        {assetError ? <ErrorBox message={assetError} /> : null}

        <div className="rounded-[1.25rem] border border-[var(--border-soft)] bg-black/15 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-lime)]">
                {copy.externalOverlay}
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {copy.externalOverlayHelp}
              </p>
            </div>
            <ToggleChip
              active={overlay.scoreboard_active === 1}
              label={overlay.scoreboard_active === 1 ? copy.on : copy.off}
              onClick={() => onOverlayChange("scoreboard_active", overlay.scoreboard_active === 1 ? 0 : 1)}
            />
          </div>
          <div className="mt-4">
            <InputField
              label={copy.externalOverlay}
              type="url"
              value={overlay.external_scoreboard_url ?? ""}
              onChange={(value) => onOverlayChange("external_scoreboard_url", value)}
            placeholder="https://scores.example.com/overlay/match-1"
            />
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {copy.ticker}
          </span>
          <textarea
            value={overlay.ticker_text ?? ""}
            onChange={(event) => onOverlayChange("ticker_text", event.target.value)}
            className="min-h-24 w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
            placeholder="Breaking update · kickoff in 10 minutes · sponsored by ..."
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleChip
            active={overlay.ticker_active === 1}
            label={overlay.ticker_active === 1 ? copy.tickerOn : copy.tickerOff}
            onClick={() => onOverlayChange("ticker_active", overlay.ticker_active === 1 ? 0 : 1)}
          />
          <InputField label={copy.adVideoUrl} type="url" value={overlay.ad_video_url ?? ""} onChange={(value) => onOverlayChange("ad_video_url", value)} />
          <InputField label={copy.adTitle} value={overlay.ad_title ?? ""} onChange={(value) => onOverlayChange("ad_title", value)} />
          <ToggleChip
            active={overlay.program_source === "ad"}
            label={overlay.program_source === "ad" ? copy.onAir : copy.takeAdLive}
            onClick={() => onOverlayChange("program_source", "ad")}
          />
        </div>
      </div>

      {overlayNotice ? <NoticeBox message={overlayNotice} className="mt-4" /> : null}

      <button
        type="button"
        onClick={() => void onSaveOverlay()}
        disabled={overlaySaving}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-[var(--border-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-main)] disabled:opacity-50"
      >
        {overlaySaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
        {copy.saveGraphics}
      </button>
    </section>
  );
}

function LogoUploadControl({
  busy,
  copy,
  label,
  onRemove,
  onUpload,
  value,
}: {
  busy: boolean;
  copy: (typeof studioCopy)[StudioLanguage];
  field: "left_logo_url" | "right_logo_url";
  label: string;
  onRemove: () => void;
  onUpload: (file: File) => void;
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[var(--border-soft)] bg-black/15 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-lime)]">
            {label}
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {copy.uploadLogo}
          </p>
        </div>
        {value ? (
          <img
            src={value}
            alt={label}
            className="h-12 w-12 rounded-xl border border-[var(--border-soft)] object-cover"
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold text-[var(--text-main)]">
          {busy ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
          {copy.chooseFile}
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              const [file] = event.target.files ?? [];
              event.target.value = "";
              if (file) {
                onUpload(file);
              }
            }}
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy || !value}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold text-[var(--text-main)] disabled:opacity-50"
        >
          <Trash2 size={14} />
          {copy.remove}
        </button>
      </div>
    </div>
  );
}

async function compressLogoFile(file: File): Promise<Blob> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(imageUrl);
    const maxSide = 1200;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Browser canvas is not available for logo compression");
    }

    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Could not compress logo image"));
          }
        },
        "image/webp",
        0.82
      );
    });

    return blob;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read logo image"));
    image.src = src;
  });
}

function ErrorBox({ className = "", message }: { className?: string; message: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--accent-coral)]/30 bg-[var(--accent-coral)]/10 px-4 py-3 text-sm text-[#ffd8d4] ${className}`}>
      {message}
    </div>
  );
}

function NoticeBox({ className = "", message }: { className?: string; message: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 px-4 py-3 text-sm text-[#d9ffe4] ${className}`}>
      {message}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[var(--border-soft)] bg-black/15 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 break-all text-sm text-[var(--text-main)]">{value}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.2rem] border border-[var(--border-soft)] bg-black/15 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </p>
      <p data-display className="mt-2 text-lg font-bold text-[var(--text-main)]">
        {value}
      </p>
    </div>
  );
}

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
        active
          ? "bg-[var(--accent-cyan)] text-[#041016]"
          : "border border-[var(--border-soft)] text-[var(--text-main)]"
      }`}
    >
      {label}
    </button>
  );
}

function Badge({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">
      {icon}
      {label}
    </div>
  );
}

function InputField({
  label,
  onChange,
  placeholder,
  tracking = false,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  tracking?: boolean;
  type?: "number" | "text" | "url";
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        type={type}
        required={label === "Room PIN"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)] ${
          tracking ? "text-lg font-semibold tracking-[0.35em]" : ""
        }`}
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
