import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  CameraOff,
  Clipboard,
  ExternalLink,
  Home,
  Languages,
  Layout,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  RefreshCcw,
  Save,
  Shield,
  Square,
  Trash2,
  Upload,
  Video,
  VideoOff,
  WandSparkles,
  Zap,
} from "lucide-react";

import { Link, useSearchParams } from "react-router";

import { ScoreboardOverlay } from "~/components/scoreboard-overlay";
import { LocalRelayBroadcaster } from "~/lib/local-relay";
import { getAdVideoUrlIssue } from "~/lib/ad-video";
import {
  CAMERA_CROSSFADE_MS,
  getCameraCrossfadeOpacity,
  getProgramMediaPolicy,
  getProgramVideoLayerState,
} from "~/lib/mixer/program-mixer";
import {
  getRelayStatusText,
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
  pauseRoomSession,
  resumeRoomSession,
  stopRoomSession,
  getTimePool,
  deleteRoomAsset,
  getRoomAssets,
  uploadRoomAsset,
  type BroadcastDestinationConfig,
  type OverlayConfig,
  type RoomAssetSummary,
  type RoomSummary,
  type TimePool,
  verifyDirectorAccess,
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

type StudioLanguage = "en";

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
  external_overlay_active: 0,
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
  team1_logo_url: "",
  team2_logo_url: "",
};

const studioCopy: Record<
  StudioLanguage,
  {
    adMode: string;
    adPromo: string;
    adTitle: string;
    adVideoUpload: string;
    adVideoSlots: string;
    adVideoUrl: string;
    audioOff: string;
    audioOn: string;
    bat: string;
    bowl: string;
    cameraPool: string;
    cameras: string;
    chooseFile: string;
    connected: string;
    copyLink: string;
    crr: string;
    dashboard: string;
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
    hideVideo: string;
    home: string;
    inn: string;
    leftLogo: string;
    live: string;
    liveCameras: string;
    loadingSettings: string;
    matchStatus: string;
    monitorAudioOff: string;
    monitorAudioOn: string;
    monitorVolume: string;
    muteMic: string;
    noCamera: string;
    noSignal: string;
    off: string;
    on: string;
    onAir: string;
    openCommandRoom: string;
    ov: string;
    pauseRoom: string;
    pin: string;
    presentedBy: string;
    programSource: string;
    ptn: string;
    pullFailed: string;
    pullingSfu: string;
    refresh: string;
    relay: string;
    relayHelp: string;
    remove: string;
    restartRelay: string;
    resumeRoom: string;
    rightLogo: string;
    roomRequired: string;
    roomPaused: string;
    roomStatus: string;
    rrr: string;
    runs: string;
    save: string;
    saveGraphics: string;
    showVideo: string;
    sponsor: string;
    starting: string;
    stopRelay: string;
    studioEyebrow: string;
    studioHelp: string;
    takeAdLive: string;
    takeLive: string;
    target: string;
    team1Logo: string;
    team2Logo: string;
    teamLogo: string;
    ticker: string;
    tickerOff: string;
    tickerOn: string;
    timeLeft: string;
    unmuteMic: string;
    update: string;
    uploadLogo: string;
    videoOff: string;
    videoOn: string;
    wickets: string;
  }
> = {
  en: {
    adMode: "অ্যাড মোড",
    adPromo: "অ্যাড / প্রোমো",
    adTitle: "অ্যাডের শিরোনাম",
    adVideoUpload: "অ্যাড ভিডিও আপলোড",
    adVideoSlots: "আপলোড করা অ্যাড",
    adVideoUrl: "অ্যাড ভিডিও URL",
    audioOff: "অডিও বন্ধ",
    audioOn: "অডিও চালু",
    bat: "ব্যাটিং",
    bowl: "বোলিং",
    cameraPool: "ক্যামেরা পুল",
    cameras: "ক্যামেরা",
    chooseFile: "ফাইল বাছুন",
    connected: "সংযুক্ত",
    copyLink: "লিঙ্ক কপি করুন",
    crr: "রান রেট",
    dashboard: "ড্যাশবোর্ড",
    directorAccess: "ডিরেক্টর অ্যাক্সেস",
    directorControls: "ডিরেক্টর কন্ট্রোল",
    enterStudio: "স্টুডিওতে ঢুকুন",
    externalOverlay: "এক্সটার্নাল ওভারলে",
    externalOverlayHelp: "স্কোরিং বা গ্রাফিক্স ওয়েবসাইটের overlay URL দিন। আপাতত এটি শুধু এই ওয়েবসাইটের প্রিভিউ/প্লেয়ারের উপর iframe হিসেবে দেখা যাবে।",
    externalOverlayOff: "ওভারলে বন্ধ",
    externalOverlayOn: "ওভারলে চালু",
    goLive: "লাইভ শুরু",
    graphics: "গ্রাফিক্স ও মেট্রিক্স",
    graphicsHelp: "লোগো, স্পন্সর, অ্যাড ভিডিও, চলন্ত বার্তা এবং এক্সটার্নাল ওভারলে নিয়ন্ত্রণ করুন।",
    hideVideo: "ভিডিও লুকান",
    home: "হোম",
    inn: "ইনিংস",
    leftLogo: "বাম লোগো",
    live: "লাইভ",
    liveCameras: "লাইভ ক্যামেরা",
    loadingSettings: "রুম সেটিংস লোড হচ্ছে...",
    matchStatus: "ম্যাচ স্ট্যাটাস",
    monitorAudioOff: "মনিটর অডিও বন্ধ",
    monitorAudioOn: "মনিটর অডিও চালু",
    monitorVolume: "মনিটর ভলিউম",
    muteMic: "মাইক বন্ধ",
    noCamera: "এখনও কোনো ফোন ক্যামেরা যুক্ত হয়নি। একই PIN দিয়ে ফোনে /camera খুলুন।",
    noSignal: "সিগন্যাল নেই / ক্যামেরার জন্য অপেক্ষা করা হচ্ছে",
    off: "বন্ধ",
    on: "চালু",
    onAir: "অন এয়ার",
    openCommandRoom: "কমান্ড রুম খুলুন।",
    ov: "ওভার",
    pauseRoom: "রুম পজ করুন",
    pin: "PIN",
    presentedBy: "স্পন্সরড বাই",
    programSource: "প্রোগ্রাম সোর্স",
    ptn: "পার্টনারশিপ",
    pullFailed: "লোড ব্যর্থ হয়েছে",
    pullingSfu: "ক্যামেরা লোড হচ্ছে",
    refresh: "রিফ্রেশ",
    relay: "VPS রিলে",
    relayHelp: "ব্রাউজার মিক্সার থেকে managed RTMP রিলে।",
    remove: "রিমুভ",
    restartRelay: "রিলে পুনরায় শুরু করুন",
    resumeRoom: "রুম রিজিউম করুন",
    rightLogo: "ডান লোগো",
    roomRequired: "ড্যাশবোর্ডের নির্দিষ্ট রুম থেকে স্টুডিও খুলুন।",
    roomPaused: "রুম পজ করা আছে",
    roomStatus: "রুম স্ট্যাটাস",
    rrr: "প্রয়োজনীয় রেট",
    runs: "রান",
    save: "সেভ",
    saveGraphics: "গ্রাফিক্স সেভ",
    showVideo: "ভিডিও দেখান",
    sponsor: "স্পন্সর",
    starting: "শুরু হচ্ছে...",
    stopRelay: "রিলে বন্ধ",
    studioEyebrow: "SFU ডিরেক্টর স্টুডিও",
    studioHelp: "Cloudflare SFU ক্যামেরা ফিড টানুন, প্রোগ্রাম সুইচ করুন, গ্রাফিক্স চালান, তারপর রিলেতে পাঠান।",
    takeAdLive: "অ্যাড লাইভ নিন",
    takeLive: "লাইভ নিন",
    target: "টার্গেট",
    team1Logo: "টিম ১ লোগো",
    team2Logo: "টিম ২ লোগো",
    teamLogo: "টিম লোগো (স্কোরকার্ড)",
    ticker: "চলন্ত বার্তা",
    tickerOff: "বার্তা বন্ধ",
    tickerOn: "বার্তা চালু",
    timeLeft: "মিনিট বাকি",
    unmuteMic: "মাইক চালু",
    update: "আপডেট",
    uploadLogo: "লোগো আপলোড",
    videoOff: "ভিডিও বন্ধ",
    videoOn: "ভিডিও চালু",
    wickets: "উইকেট",
  },
  en: {
    adMode: "Ad Mode",
    adPromo: "Ad / Promo",
    adTitle: "Ad Title",
    adVideoUpload: "Upload Ad Video",
    adVideoSlots: "Uploaded Ads",
    adVideoUrl: "Ad Video URL",
    audioOff: "Audio Off",
    audioOn: "Audio On",
    bat: "Bat",
    bowl: "Bowl",
    cameraPool: "Camera Pool",
    cameras: "Cameras",
    chooseFile: "Choose file",
    connected: "Connected",
    copyLink: "Copy Link",
    crr: "CRR",
    dashboard: "Dashboard",
    directorAccess: "Director Access",
    directorControls: "Director Controls",
    enterStudio: "Enter Studio",
    externalOverlay: "External Overlay",
    externalOverlayHelp: "Paste a scoring or graphics overlay URL. For now it appears as an iframe over this website player and preview only.",
    externalOverlayOff: "Overlay Off",
    externalOverlayOn: "Overlay On",
    goLive: "Go Live",
    graphics: "Graphics & Metrics",
    graphicsHelp: "Control logos, sponsor, ad video, ticker, and external overlay.",
    hideVideo: "Hide Video",
    home: "Home",
    inn: "Inn",
    leftLogo: "Left Logo",
    live: "Live",
    liveCameras: "Live Cameras",
    loadingSettings: "Loading room settings...",
    matchStatus: "Match Status",
    monitorAudioOff: "Monitor Audio Off",
    monitorAudioOn: "Monitor Audio On",
    monitorVolume: "Monitor Volume",
    muteMic: "Mute Mic",
    noCamera: "No field camera has joined yet. Open /camera on a phone and join with the same PIN.",
    noSignal: "No Signal / Waiting for camera",
    off: "Off",
    on: "On",
    onAir: "On Air",
    openCommandRoom: "Open the command room.",
    ov: "Ov",
    pauseRoom: "Pause Room",
    pin: "PIN",
    presentedBy: "Presented By",
    programSource: "Program Source",
    ptn: "Ptn",
    pullFailed: "Pull Failed",
    pullingSfu: "Pulling SFU",
    refresh: "Refresh",
    relay: "VPS Relay",
    relayHelp: "Browser mixer to managed RTMP relay.",
    remove: "Remove",
    restartRelay: "Restart Relay",
    resumeRoom: "Resume Room",
    rightLogo: "Right Logo",
    roomRequired: "Open the studio from a specific dashboard room.",
    roomPaused: "Room Paused",
    roomStatus: "Room Status",
    rrr: "RRR",
    runs: "Runs",
    save: "Save",
    saveGraphics: "Save Graphics",
    showVideo: "Show Video",
    sponsor: "Sponsor",
    starting: "Starting...",
    stopRelay: "Stop Relay",
    studioEyebrow: "SFU Director Studio",
    studioHelp: "Pull Cloudflare SFU camera feeds, switch the program, control graphics, then send the final output to relay.",
    takeAdLive: "Take Ad Live",
    takeLive: "Take Live",
    target: "Target",
    team1Logo: "Team 1 Logo",
    team2Logo: "Team 2 Logo",
    teamLogo: "Team Logo (Scorecard)",
    ticker: "Ticker Text",
    tickerOff: "Ticker Off",
    tickerOn: "Ticker On",
    timeLeft: "min left",
    unmuteMic: "Unmute Mic",
    update: "Update",
    uploadLogo: "Upload Logo",
    videoOff: "Video Off",
    videoOn: "Video On",
    wickets: "Wickets",
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

import { Walkthrough } from "~/components/walkthrough";

export default function DirectorStudio() {
  const [language, setLanguage] = useState<StudioLanguage>("en");
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("room")?.trim() ?? "";
  const [directorAccessToken, setDirectorAccessToken] = useState("");
  const [directorName, setDirectorName] = useState("Director");
  const [joinState, setJoinState] = useState<JoinState | null>(null);
  const [destinations, setDestinations] = useState<BroadcastDestinationConfig[]>(defaultDestinations);
  const [overlay, setOverlay] = useState<OverlayConfig>(defaultOverlay);
  const [cameras, setCameras] = useState<PulledCamera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(() => {
    if (typeof window !== "undefined" && joinState) {
      return localStorage.getItem(`selected_camera_${joinState.room.id}`);
    }
    return null;
  });

  // Persist joinState to localStorage
  useEffect(() => {
    if (joinState) {
      window.localStorage.setItem("live-studio-join-state", JSON.stringify(joinState));
    } else {
      window.localStorage.removeItem("live-studio-join-state");
    }
  }, [joinState]);

  useEffect(() => {
    if (selectedCameraId && joinState) {
      localStorage.setItem(`selected_camera_${joinState.room.id}`, selectedCameraId);
    }
  }, [selectedCameraId, joinState?.room.id]);

  // Auto-select first available camera if none selected but live mode is active
  useEffect(() => {
    if (overlay.program_source === "live" && !selectedCameraId && cameras.length > 0) {
      const firstReady = cameras.find(c => c.status === "ready");
      if (firstReady) {
        setSelectedCameraId(firstReady.id);
      }
    }
  }, [overlay.program_source, selectedCameraId, cameras]);
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [destinationsSaving, setDestinationsSaving] = useState(false);
  const [overlaySaving, setOverlaySaving] = useState(false);
  const [refreshingCameras, setRefreshingCameras] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetBusyField, setAssetBusyField] = useState<"left_logo_url" | "right_logo_url" | "team1_logo_url" | "team2_logo_url" | "ad_video_url" | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [adVideoAssets, setAdVideoAssets] = useState<RoomAssetSummary[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [activeControlTab, setActiveControlTab] = useState<"cameras" | "graphics" | "relay" | "media">("cameras");

  const [destinationsNotice, setDestinationsNotice] = useState<string | null>(null);
  const [overlayNotice, setOverlayNotice] = useState<string | null>(null);
  const [monitorAudioEnabled, setMonitorAudioEnabled] = useState(false);
  const [monitorVolume, setMonitorVolume] = useState(0.7);
  const [documentVisibility, setDocumentVisibility] = useState<StudioVisibilityState>(() =>
    getStudioVisibilityState()
  );
  const [wasHiddenWhileLive, setWasHiddenWhileLive] = useState(false);
  const [roomPaused, setRoomPaused] = useState(false);

  const refreshAdVideoAssets = useCallback(async () => {
    if (!joinState) return;
    try {
      setAdVideoAssets(await getRoomAssets(joinState.room.id, "ad_video_url"));
    } catch {
      setAdVideoAssets([]);
    }
  }, [joinState?.room.id]);

  useEffect(() => {
    void refreshAdVideoAssets();
  }, [refreshAdVideoAssets]);

  const [timePool, setTimePool] = useState<TimePool | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const overlayDirtyRef = useRef(false);
  const lastServerUpdatedAtRef = useRef<number | null>(null);
  const pullClientsRef = useRef<Map<string, { client: CloudflareSFUClient; sourceKey: string }>>(new Map());
  const pullingIdsRef = useRef<Set<string>>(new Set());
  const relayBroadcastersRef = useRef<LocalRelayBroadcaster[]>([]);
  const copy = studioCopy[language];

  useEffect(() => {
    const storedToken = window.localStorage.getItem("live-studio-account-token");
    if (storedToken) {
      setDirectorAccessToken(storedToken);
    }

    // Restore joinState from localStorage
    const storedJoinState = window.localStorage.getItem("live-studio-join-state");
    if (storedJoinState) {
      try {
        const parsed = JSON.parse(storedJoinState) as JoinState;
        setJoinState(parsed);
      } catch {
        // ignore invalid JSON
      }
    }
  }, []);

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
  const relayStatusText = getRelayStatusText(relayStatus, error);
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
      void getOverlayConfig(joinState.room.id)
        .then((overlayConfig) => {
          const serverUpdatedAt = overlayConfig.updated_at ?? null;
          if (serverUpdatedAt && serverUpdatedAt === lastServerUpdatedAtRef.current) {
            return;
          }
          lastServerUpdatedAtRef.current = serverUpdatedAt;

          if (overlayDirtyRef.current) {
            // Director has local unsaved changes. Only merge score-related fields
            // from the score operator so live scores still update in real time.
            setOverlay((current) => ({
              ...current,
              clock_text: overlayConfig.clock_text ?? current.clock_text,
              match_status: overlayConfig.match_status ?? current.match_status,
              scoreboard_active: overlayConfig.scoreboard_active ?? current.scoreboard_active,
              scoring_data: overlayConfig.scoring_data ?? current.scoring_data ?? {},
              sport: overlayConfig.sport ?? current.sport,
              team1_name: overlayConfig.team1_name ?? current.team1_name,
              team1_score: overlayConfig.team1_score ?? current.team1_score,
              team2_name: overlayConfig.team2_name ?? current.team2_name,
              team2_score: overlayConfig.team2_score ?? current.team2_score,
            }));
          } else {
            setOverlay({
              ...defaultOverlay,
              ...overlayConfig,
              scoring_data: overlayConfig.scoring_data ?? {},
            });
          }
        })
        .catch(() => undefined);
    }, 1_000);

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
      const accessToken = window.localStorage.getItem("live-studio-account-token") ?? "";
      if (!accessToken) {
        throw new Error("Director account access is required. Sign in from the home page first.");
      }

      const verifiedRoom = await verifyDirectorAccess({
        accessToken,
        roomId,
      });
      let room =
        verifiedRoom.status === "ready"
          ? await startRoomSession(verifiedRoom.id, accessToken)
          : verifiedRoom;

      // Auto-pause the room upon joining to prevent wasting session time during setup
      if (room.status === "active" && room.is_paused !== 1) {
        try {
          room = await pauseRoomSession(room.id, accessToken);
        } catch (pauseError) {
          console.error("Could not auto-pause room:", pauseError);
        }
      }

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

  async function loadTimePool() {
    if (!joinState) return;
    const token = window.localStorage.getItem("live-studio-account-token");
    if (!token) return;
    setPoolLoading(true);
    try {
      const result = await getTimePool(token);
      setTimePool(result.pool);
      const currentRoom = result.rooms.find((r) => r.id === joinState.room.id);
      if (currentRoom) {
        setRoomPaused(currentRoom.isPaused);
      }
    } catch {
      // ignore
    } finally {
      setPoolLoading(false);
    }
  }

  async function handlePauseRoom() {
    if (!joinState) return;
    const token = window.localStorage.getItem("live-studio-account-token") ?? "";
    try {
      const room = await pauseRoomSession(joinState.room.id, token);
      setJoinState({ room });
      setRoomPaused(true);
      if (relayStatus === "live") {
        handleStopRelay();
      }
      await loadTimePool();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not pause room");
    }
  }

  async function handleResumeRoom() {
    if (!joinState) return;
    const token = window.localStorage.getItem("live-studio-account-token") ?? "";
    try {
      const room = await resumeRoomSession(joinState.room.id, token);
      setJoinState({ room });
      setRoomPaused(false);
      await loadTimePool();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not resume room");
    }
  }

  async function handleStopRoom() {
    if (!joinState) return;
    const token = window.localStorage.getItem("live-studio-account-token") ?? "";
    try {
      await stopRoomSession(joinState.room.id, token);
      if (relayStatus === "live") {
        handleStopRelay();
      }
      await loadTimePool();
      setJoinState(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not stop room");
    }
  }

  useEffect(() => {
    if (!joinState) return;
    void loadTimePool();
    const id = window.setInterval(() => void loadTimePool(), 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinState?.room.id]);

  async function handleSaveDestinations() {
    if (!joinState) {
      return;
    }

    setDestinationsSaving(true);
    setError(null);
    setDestinationsNotice(null);

    try {
      const persistedDestinations = await saveBroadcastConfig(joinState.room.id, destinations);
      setDestinations(persistedDestinations);
      setDestinationsNotice("Broadcast destinations saved.");
    } catch (saveError: unknown) {
      setError(
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

    if (relayStatus !== "idle") {
      return;
    }

    // Auto-resume room if it was paused (starts counting minutes)
    if (roomPaused) {
      await handleResumeRoom();
    }

    if (activeOutputs.length === 0) {
      setError("Add at least least one YouTube or Facebook destination before going live.");
      return;
    }

    if (!mixedStreamRef.current) {
      setError("Program mixer is not ready yet.");
      return;
    }

    setRelayStatus("starting");
    setError(null);
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
                setError(message.message ?? "Relay connection stopped");
                void handlePauseRoom();
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
      setRelayStatus("idle");
      setError(
        startError instanceof Error ? startError.message : "Could not start relay"
      );
      void handlePauseRoom();
    }
  }

  async function handleStopRelay() {
    setRelayStatus("stopping");
    relayBroadcastersRef.current.forEach((broadcaster) => broadcaster.stop());
    relayBroadcastersRef.current = [];
    setRelayStatus("idle");
    await handlePauseRoom();
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

  function updateOverlayScoringData(patch: NonNullable<OverlayConfig["scoring_data"]>) {
    overlayDirtyRef.current = true;
    setOverlay((current) => ({
      ...current,
      scoring_data: {
        ...(current.scoring_data ?? {}),
        ...patch,
      },
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



  async function handleLogoUpload(field: "left_logo_url" | "right_logo_url" | "team1_logo_url" | "team2_logo_url", file: File) {
    setAssetBusyField(field);
    setAssetError(null);

    try {
      const compressedFile = await compressLogoFile(file);
      const result = await uploadRoomAsset({
        field,
        file: compressedFile,
        filename: `${field}.webp`,
        roomId: joinState!.room.id,
      });
      updateOverlay(field, result.asset.publicUrl);
    } catch (uploadError: unknown) {
      setAssetError(uploadError instanceof Error ? uploadError.message : "Could not upload logo");
    } finally {
      setAssetBusyField(null);
    }
  }

  async function handleLogoRemove(field: "left_logo_url" | "right_logo_url" | "team1_logo_url" | "team2_logo_url") {
    setAssetBusyField(field);
    setAssetError(null);

    try {
      await deleteRoomAsset(joinState!.room.id, field);
      updateOverlay(field, "");
    } catch (deleteError: unknown) {
      setAssetError(deleteError instanceof Error ? deleteError.message : "Could not remove logo");
    } finally {
      setAssetBusyField(null);
    }
  }

  async function handleAdVideoUpload(file: File) {
    const MAX_VIDEO_SIZE = 250_000_000;
    if (file.size > MAX_VIDEO_SIZE) {
      setAssetError(`ভিডিও ফাইল ${Math.round(file.size / 1_000_000)}MB — সর্বোচ্চ 250MB অনুমোদিত।`);
      return;
    }

    if (!file.type.startsWith("video/")) {
      setAssetError("শুধুমাত্র ভিডিও ফাইল (MP4, WebM, MOV) আপলোড করুন।");
      return;
    }

    setAssetBusyField("ad_video_url");
    setAssetError(null);
    setUploadProgress(0);

    try {
      const result = await uploadRoomAsset({
        field: "ad_video_url",
        file,
        filename: file.name || "ad-video.mp4",
        onProgress: setUploadProgress,
        roomId: joinState!.room.id,
      });
      updateOverlay("ad_video_url", result.asset.publicUrl);
      updateOverlay("program_source", "ad");
      await refreshAdVideoAssets();
    } catch (uploadError: unknown) {
      setAssetError(uploadError instanceof Error ? uploadError.message : "Could not upload ad video");
    } finally {
      setAssetBusyField(null);
      setUploadProgress(null);
    }
  }

  async function handleAdVideoRemove(asset?: RoomAssetSummary) {
    setAssetBusyField("ad_video_url");
    setAssetError(null);

    try {
      await deleteRoomAsset(joinState!.room.id, "ad_video_url", asset?.id);
      if (!asset || overlay.ad_video_url === asset.publicUrl) {
        updateOverlay("ad_video_url", "");
        updateOverlay("program_source", "live");
      }
      await refreshAdVideoAssets();
    } catch (deleteError: unknown) {
      setAssetError(deleteError instanceof Error ? deleteError.message : "Could not remove ad video");
    } finally {
      setAssetBusyField(null);
    }
  }

  if (!joinState) {
    return (
      <main className="relative min-h-screen bg-[#081217] text-[#edf7fb] selection:bg-[var(--accent-cyan)] selection:text-black">
        <Walkthrough />
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
            <div className="flex items-center gap-2">
              <Link
                to="/dashboard"
                className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-main)]"
              >
                <Home size={14} />
                {copy.dashboard}
              </Link>
              <button
                type="button"
                onClick={() => setLanguage((current) => (current === "en" ? "en" : "en"))}
                className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-main)]"
              >
                <Languages size={14} />
                {language === "en" ? "EN" : "Bengali"}
              </button>
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            {!roomId ? <ErrorBox message={copy.roomRequired} /> : null}

            {error ? <ErrorBox message={error} /> : null}

            <button
              type="submit"
              disabled={loading || !roomId}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent-cyan)] px-5 py-4 text-sm font-semibold text-[#041016] hover:scale-[1.01] disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <BadgeCheck size={18} />}
              {loading ? copy.starting : copy.enterStudio}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-[#081217] text-[#edf7fb] selection:bg-[var(--accent-cyan)] selection:text-black">
      <Walkthrough />

      {/* 1. Header Bar - Ultra Compact */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 bg-black/20 px-4 py-2">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-[var(--accent-cyan)] hover:opacity-80">
            <Layout size={18} />
            <span className="text-sm font-black uppercase tracking-tighter">Director</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <h1 className="text-xs font-semibold text-[var(--text-muted)]">
            {joinState.room.name} · PIN: {joinState.room.pin}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {timePool && (
            <div className="flex items-center gap-2 rounded-full border border-[var(--accent-lime)]/30 bg-[var(--accent-lime)]/10 px-3 py-1 text-[10px] font-bold text-[var(--accent-lime)]">
              <Zap size={10} />
              {poolLoading ? "..." : `${timePool.remainingMinutes} ${copy.timeLeft}`}
            </div>
          )}
          
          <div className="flex items-center gap-1 rounded-full bg-black/40 p-1">
            <button
              onClick={() => setLanguage((c) => (c === "en" ? "en" : "en"))}
              className="px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)] hover:text-white"
            >
              {language === "en" ? "EN" : "Bengali"}
            </button>
            <div className="h-3 w-px bg-white/10" />
            <button
              onClick={() => void (roomPaused ? handleResumeRoom() : handlePauseRoom())}
              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold ${
                roomPaused ? "text-[var(--accent-lime)]" : "text-yellow-400"
              }`}
            >
              {roomPaused ? <Play size={10} /> : <Pause size={10} />}
              {roomPaused ? copy.resumeRoom : copy.pauseRoom}
            </button>
            <div className="h-3 w-px bg-white/10" />
            <button
              onClick={() => void handleStopRoom()}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-[var(--accent-coral)]"
            >
              <Square size={10} />
              Stop
            </button>
          </div>

          <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
            relayStatus === "live" ? "bg-[var(--accent-coral)] text-white" : "bg-white/10 text-[var(--text-muted)]"
          }`}>
            <Radio size={10} className={relayStatus === "live" ? "animate-pulse" : ""} />
            {relayStatus}
          </div>
        </div>
      </header>

      {/* 2. Main Workspace - Responsive Layout */}
      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* Left: Main Control Center */}
        <div className="flex flex-1 flex-col p-3 lg:p-4 lg:overflow-y-auto scrollbar-hide">
          <div className="flex flex-col gap-4">
            {/* Program View - Expanded */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-coral)]">Program Out</span>
                <div className="flex gap-2">
                  <div className="h-1 w-8 rounded-full bg-[var(--accent-coral)]" />
                  <div className="h-1 w-8 rounded-full bg-[var(--accent-coral)]/30" />
                </div>
              </div>
              <div id="walkthrough-program-source" className="aspect-video w-full overflow-hidden rounded-2xl border-2 border-[var(--accent-coral)]/50 bg-black shadow-2xl">
                <ProgramMixer
                  adVideoIssue={overlay.program_source === "ad" ? adVideoIssue : null}
                  adVideoUrl={overlay.program_source === "ad" ? playableAdVideoUrl : ""}
                  monitorAudioEnabled={monitorAudioEnabled}
                  monitorVolume={monitorVolume}
                  overlay={overlay}
                  selectedStream={selectedStream}
                  onMixedStreamReady={handleMixedStreamReady}
                  language={language}
                />
              </div>
            </div>

          {/* 3. Control Hub (Tabs) */}
          <div className="mt-4 flex flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-black/20">
            <nav className="flex items-center gap-1 border-b border-white/5 p-2">
              <ControlTab 
                active={activeControlTab === "cameras"} 
                onClick={() => setActiveControlTab("cameras")}
                icon={<Camera size={14} />}
                label={copy.cameraPool}
              />
              <ControlTab 
                active={activeControlTab === "graphics"} 
                onClick={() => setActiveControlTab("graphics")}
                icon={<WandSparkles size={14} />}
                label={copy.graphics}
              />
              <ControlTab 
                active={activeControlTab === "media"} 
                onClick={() => setActiveControlTab("media")}
                icon={<Video size={14} />}
                label="Media & Ads"
              />
              <ControlTab 
                active={activeControlTab === "relay"} 
                onClick={() => setActiveControlTab("relay")}
                icon={<Radio size={14} />}
                label={copy.relay}
              />
            </nav>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {activeControlTab === "cameras" && (
                <div id="walkthrough-camera-pool" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-widest">{copy.cameraPool}</h3>
                    <button
                      onClick={() => void refreshCameras()}
                      disabled={refreshingCameras}
                      className="text-[10px] font-bold uppercase text-[var(--accent-cyan)] hover:underline"
                    >
                      {refreshingCameras ? "Refreshing..." : copy.refresh}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
                      <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-[var(--text-muted)]">
                        {copy.noCamera}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeControlTab === "graphics" && (
                <div id="walkthrough-graphics-panel">
                  <GraphicsPanel
                    copy={copy}
                    onOverlayChange={updateOverlay}
                    onScoringDataChange={updateOverlayScoringData}
                    onSaveOverlay={handleSaveOverlay}
                    overlay={overlay}
                    overlayNotice={overlayNotice}
                    overlaySaving={overlaySaving}
                    room={joinState.room}
                    assetBusyField={assetBusyField}
                    assetError={assetError}
                    onLogoUpload={handleLogoUpload}
                    onLogoRemove={handleLogoRemove}
                    compact={true}
                  />
                </div>
              )}

              {activeControlTab === "media" && (
                <div className="space-y-4">
                   <AdVideoUploadControl
                    busy={assetBusyField === "ad_video_url"}
                    assets={adVideoAssets}
                    copy={copy}
                    uploadProgress={uploadProgress}
                    value={overlay.ad_video_url ?? ""}
                    onRemove={(asset) => void handleAdVideoRemove(asset)}
                    onTakeLive={(asset) => {
                      updateOverlay("ad_video_url", asset.publicUrl);
                      updateOverlay("program_source", "ad");
                    }}
                    onUpload={(file) => void handleAdVideoUpload(file)}
                  />
                </div>
              )}

              {activeControlTab === "relay" && (
                <div className="max-w-2xl space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {destinations.map((destination) => (
                      <div key={destination.key} className="glass-panel rounded-2xl p-4">
                        <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-[var(--accent-cyan)]">{destination.label}</span>
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={destination.rtmpUrl}
                            onChange={(e) => updateDestination(destination.key, "rtmpUrl", e.target.value)}
                            placeholder="RTMP URL"
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs"
                          />
                          <input
                            type="password"
                            value={destination.streamKey}
                            onChange={(e) => updateDestination(destination.key, "streamKey", e.target.value)}
                            placeholder="Stream Key"
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDestinations}
                      disabled={destinationsSaving}
                      className="rounded-full bg-white/10 px-6 py-2 text-xs font-bold hover:bg-white/20"
                    >
                      {destinationsSaving ? "Saving..." : copy.save}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>

        {/* Right: Sidebar - Stats & Master Controls */}
        <aside className="w-full shrink-0 border-t border-white/5 bg-black/40 p-4 lg:w-72 lg:border-l lg:border-t-0 lg:overflow-y-auto">
          <div className="space-y-6">
            {/* Production Stats Moved Here */}
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Production Stats</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="glass-panel flex flex-col justify-center rounded-xl p-3">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{copy.cameras}</span>
                  <span className="text-xl font-black text-[var(--accent-cyan)]">{cameras.length}</span>
                </div>
                <div className="glass-panel flex flex-col justify-center rounded-xl p-3">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{copy.roomStatus}</span>
                  <span className="text-xl font-black text-[var(--accent-lime)]">{copy.connected}</span>
                </div>
                <div className="glass-panel col-span-2 p-3">
                  <StreamGuardBanner state={streamGuardState} />
                </div>
              </div>
            </div>

            <div className="h-px bg-white/5" />

             <button
              id="walkthrough-go-live-btn"
              onClick={() => void (relayStatus === "live" ? handleStopRelay() : handleStartRelay())}
              disabled={relayStatus === "starting" || relayStatus === "stopping"}
              className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl py-6 transition-all active:scale-95 ${
                relayStatus === "live" 
                  ? "bg-[var(--accent-coral)] text-white shadow-[0_0_30px_rgba(255,107,107,0.3)]" 
                  : "bg-[var(--accent-lime)] text-black shadow-[0_0_20px_rgba(159,255,84,0.2)]"
              }`}
            >
              {relayStatus === "starting" || relayStatus === "stopping" ? (
                <Loader2 className="animate-spin" size={24} />
              ) : relayStatus === "live" ? (
                <Square size={24} fill="white" />
              ) : (
                <Play size={24} fill="black" />
              )}
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                {relayStatus === "live" ? "Stop Relay" : "Go Live"}
              </span>
            </button>

            <div className="h-px bg-white/5" />

            {/* Quick Toggles */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Quick Toggles</span>
              <QuickToggle 
                active={overlay.scoreboard_active === 1} 
                onClick={() => updateOverlay("scoreboard_active", overlay.scoreboard_active === 1 ? 0 : 1)}
                label="Scoreboard"
              />
              <QuickToggle 
                active={overlay.ticker_active === 1} 
                onClick={() => updateOverlay("ticker_active", overlay.ticker_active === 1 ? 0 : 1)}
                label="Ticker"
              />
              <QuickToggle 
                active={monitorAudioEnabled} 
                onClick={() => setMonitorAudioEnabled(!monitorAudioEnabled)}
                label="Monitor Audio"
              />
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Monitor Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={monitorVolume}
                onChange={(e) => setMonitorVolume(Number(e.target.value))}
                className="w-full accent-[var(--accent-cyan)]"
              />
            </div>
            
            <div className="h-px bg-white/5" />
            
            <div className="rounded-xl bg-black/40 p-3">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Relay Status</span>
              <p className="mt-1 text-xs font-mono text-[var(--accent-lime)]">
                {relayStatusText}
              </p>
              {error ? <ErrorBox message={error} className="mt-3 text-xs" /> : null}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
function ControlTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
        active ? "bg-[var(--accent-cyan)] text-[#041016]" : "text-[var(--text-muted)] hover:bg-white/5"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function QuickToggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[10px] font-bold transition-all ${
        active 
          ? "border-[var(--accent-lime)]/50 bg-[var(--accent-lime)]/10 text-[var(--accent-lime)]" 
          : "border-white/5 bg-black/20 text-[var(--text-muted)]"
      }`}
    >
      {label}
      <div className={`h-1.5 w-1.5 rounded-full ${active ? "animate-pulse bg-[var(--accent-lime)]" : "bg-white/20"}`} />
    </button>
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
  language,
}: {
  adVideoUrl: string;
  adVideoIssue: string | null;
  monitorAudioEnabled: boolean;
  monitorVolume: number;
  onMixedStreamReady: (stream: MediaStream) => void;
  overlay: OverlayConfig;
  selectedStream: MediaStream | null;
  language: StudioLanguage;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const adVideoRef = useRef<HTMLVideoElement | null>(null);
  const previousVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasCaptureTrackRef = useRef<RequestableCanvasTrack | null>(null);
  const renderTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const liveAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const adAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const adAudioElementRef = useRef<HTMLVideoElement | null>(null);
  const cameraFadeStartRef = useRef<number | null>(null);
  const logoImagesRef = useRef<{
    left: HTMLImageElement | null;
    right: HTMLImageElement | null;
    team1: HTMLImageElement | null;
    team2: HTMLImageElement | null;
  }>({
    left: null,
    right: null,
    team1: null,
    team2: null,
  });
  const mediaPolicy = useMemo(
    () =>
      getProgramMediaPolicy({
        adVideoUrl,
        programSource: overlay.program_source,
      }),
    [adVideoUrl, overlay.program_source]
  );

  useEffect(() => {
    if (!previousVideoRef.current) {
      previousVideoRef.current = document.createElement("video");
      previousVideoRef.current.muted = true;
      previousVideoRef.current.playsInline = true;
    }
  }, []);

  useEffect(() => {
    const video = liveVideoRef.current;
    const adVideo = adVideoRef.current;
    if (!video) return;

    const newActiveVideo = mediaPolicy.videoSource === "ad" ? adVideo : video;
    
    // If the active video element itself is changing (e.g. ad <-> live)
    if (activeVideoRef.current && newActiveVideo && activeVideoRef.current !== newActiveVideo) {
      const prev = previousVideoRef.current;
      if (prev) {
        // Capture current state of the old active video
        if (activeVideoRef.current.srcObject) {
          prev.srcObject = activeVideoRef.current.srcObject;
        } else if (activeVideoRef.current.src) {
          prev.src = activeVideoRef.current.src;
        }
        void prev.play().catch(() => undefined);
        cameraFadeStartRef.current = performance.now();
      }
    }
    
    // If we are in live mode and the camera stream itself is changing
    if (mediaPolicy.videoSource === "live" && video.srcObject && selectedStream && video.srcObject !== selectedStream) {
      const prev = previousVideoRef.current;
      if (prev) {
        prev.srcObject = video.srcObject;
        void prev.play().catch(() => undefined);
        cameraFadeStartRef.current = performance.now();
      }
    }

    if (mediaPolicy.videoSource === "live") {
      video.srcObject = selectedStream;
      if (selectedStream) void video.play().catch(() => undefined);
    }

    if (newActiveVideo) {
      activeVideoRef.current = newActiveVideo;
    }
  }, [selectedStream, mediaPolicy.videoSource]);

  useEffect(() => {
    const leftLogo = overlay.left_logo_url || overlay.logo_url || "";
    const rightLogo = overlay.right_logo_url || overlay.logo_url || "";
    const team1Logo = overlay.team1_logo_url || "";
    const team2Logo = overlay.team2_logo_url || "";

    logoImagesRef.current.left = leftLogo ? createLogoImage(leftLogo) : null;
    logoImagesRef.current.right = rightLogo ? createLogoImage(rightLogo) : null;
    logoImagesRef.current.team1 = team1Logo ? createLogoImage(team1Logo) : null;
    logoImagesRef.current.team2 = team2Logo ? createLogoImage(team2Logo) : null;
  }, [
    overlay.left_logo_url,
    overlay.logo_url,
    overlay.right_logo_url,
    overlay.team1_logo_url,
    overlay.team2_logo_url,
  ]);

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

    liveAudioSourceRef.current?.disconnect();
    liveAudioSourceRef.current = null;

    if (mediaPolicy.liveAudioEnabled && selectedStream && selectedStream.getAudioTracks().length > 0) {
      const source = audioContext.createMediaStreamSource(selectedStream);
      source.connect(audioDestination);
      if (monitorGainRef.current) {
        source.connect(monitorGainRef.current);
      }
      liveAudioSourceRef.current = source;
      void audioContext.resume().catch(() => undefined);
    }

    return () => {
      liveAudioSourceRef.current?.disconnect();
      liveAudioSourceRef.current = null;
    };
  }, [mediaPolicy.liveAudioEnabled, selectedStream]);

  useEffect(() => {
    const audioContext = audioContextRef.current;
    const audioDestination = audioDestinationRef.current;
    const adVideo = adVideoRef.current;
    if (!audioContext || !audioDestination) {
      return;
    }

    adAudioSourceRef.current?.disconnect();

    if (!mediaPolicy.adAudioEnabled || !adVideo) {
      return;
    }

    function connectAdAudio() {
      const currentAdVideo = adVideoRef.current;
      const currentAudioContext = audioContextRef.current;
      const currentAudioDestination = audioDestinationRef.current;
      if (!currentAdVideo || !currentAudioContext || !currentAudioDestination) {
        return;
      }

      try {
        if (!adAudioSourceRef.current || adAudioElementRef.current !== currentAdVideo) {
          adAudioSourceRef.current?.disconnect();
          adAudioSourceRef.current = currentAudioContext.createMediaElementSource(currentAdVideo);
          adAudioElementRef.current = currentAdVideo;
        }

        const source = adAudioSourceRef.current;
        source.disconnect();
        source.connect(currentAudioDestination);
        if (monitorGainRef.current) {
          source.connect(monitorGainRef.current);
        }
        void currentAudioContext.resume().catch(() => undefined);
      } catch (audioError) {
        console.warn("Could not route ad video audio into the program mix:", audioError);
      }
    }

    void adVideo.play().then(connectAdAudio).catch(connectAdAudio);
    adVideo.addEventListener("loadedmetadata", connectAdAudio);
    adVideo.addEventListener("canplay", connectAdAudio);

    return () => {
      adVideo.removeEventListener("loadedmetadata", connectAdAudio);
      adVideo.removeEventListener("canplay", connectAdAudio);
      adAudioSourceRef.current?.disconnect();
    };
  }, [adVideoUrl, mediaPolicy.adAudioEnabled]);

  const copy = studioCopy[language];

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

      const activeVideo = mediaPolicy.videoSource === "ad" ? adVideoRef.current : liveVideoRef.current;
      const now = performance.now();
      drawProgramFrame(
        context,
        canvas,
        activeVideo,
        overlay,
        logoImagesRef.current,
        now,
        previousVideoRef.current,
        cameraFadeStartRef,
        copy
      );
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
  }, [mediaPolicy.videoSource, overlay, language]);

  return (
    <section className="relative bg-[#02070c]">
      <canvas ref={canvasRef} className="h-full w-full bg-[#02070c] object-contain" />
      {overlay.external_overlay_active === 1 && overlay.external_scoreboard_url?.trim() ? (
        <ScoreboardOverlay overlay={overlay} />
      ) : null}
      {adVideoIssue ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl border border-[var(--accent-coral)]/40 bg-black/80 px-4 py-3 text-sm text-[var(--text-main)]">
          {adVideoIssue}
        </div>
      ) : null}
      
      {/* Off-screen video elements for the mixer to capture */}
      <video 
        ref={liveVideoRef} 
        autoPlay 
        muted 
        playsInline 
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" 
      />
      
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
  logos: {
    left: HTMLImageElement | null;
    right: HTMLImageElement | null;
    team1: HTMLImageElement | null;
    team2: HTMLImageElement | null;
  },
  now: number,
  previousVideo: HTMLVideoElement | null = null,
  cameraFadeStartRef: MutableRefObject<number | null> | null = null,
  copy: (typeof studioCopy)[StudioLanguage]
) {
  context.fillStyle = "#02070c";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const fadeStart = cameraFadeStartRef?.current ?? null;
  const fadeOpacity =
    fadeStart === null ? 1 : getCameraCrossfadeOpacity(now - fadeStart, CAMERA_CROSSFADE_MS);
  const activeReady = Boolean(video && video.readyState >= 2);
  const previousReady = Boolean(previousVideo && previousVideo.readyState >= 2);
  const layerState = getProgramVideoLayerState({
    activeReady,
    fadeOpacity,
    hasFade: fadeStart !== null,
    previousReady,
  });

  if (layerState === "crossfade" && previousVideo && video) {
    context.globalAlpha = 1;
    drawVideoCover(context, canvas, previousVideo);
    context.globalAlpha = fadeOpacity;
    drawVideoCover(context, canvas, video);
    context.globalAlpha = 1;
  } else if (layerState === "previous" && previousVideo) {
    context.globalAlpha = 1;
    drawVideoCover(context, canvas, previousVideo);
  } else if (layerState === "active" && video) {
    context.globalAlpha = 1;
    drawVideoCover(context, canvas, video);
  } else {
    drawNoSignal(context, canvas, copy);
  }

  if (cameraFadeStartRef && fadeStart !== null && fadeOpacity >= 1) {
    cameraFadeStartRef.current = null;
    if (previousVideo) {
      previousVideo.srcObject = null;
      previousVideo.removeAttribute("src");
      previousVideo.load();
    }
  }

  drawLiveBadge(context, copy);

  const externalActive = overlay.external_overlay_active === 1 && overlay.external_scoreboard_url?.trim();

  if (overlay.scoreboard_active === 1 && !externalActive) {
    drawScoreboard(context, canvas, overlay, logos, copy, now);
  }

  if (!externalActive) {
    drawLogos(context, canvas, logos);
  }

  const tickerIsInsideCricketScoreboard =
    overlay.scoreboard_active === 1 &&
    overlay.sport === "cricket" &&
    getScoringText(overlay, "overlay_position", "top") === "lower";

  if (overlay.ticker_active === 1 && overlay.ticker_text?.trim() && !externalActive && !tickerIsInsideCricketScoreboard) {
    drawTicker(context, canvas, overlay.ticker_text, now, copy, overlay.theme_variant);
  }
}

const THEME_COLORS = {
  arena: {
    frame: "rgba(10,16,23,0.85)",
    pill: "rgba(18,30,41,0.9)",
    scoreLeft: "#67e8f9",
    scoreRight: "#d9f99d",
    ticker: "rgba(12,21,31,0.95)",
  },
  broadcast: {
    frame: "rgba(7,17,25,0.85)",
    pill: "rgba(16,28,39,0.9)",
    scoreLeft: "#ff7a6b",
    scoreRight: "#baff66",
    ticker: "rgba(9,18,26,0.95)",
  },
  classic: {
    frame: "rgba(16,16,16,0.85)",
    pill: "rgba(24,24,24,0.9)",
    scoreLeft: "#fca5a5",
    scoreRight: "#bfdbfe",
    ticker: "rgba(20,20,20,0.95)",
  },
};

function getThemeColors(variant?: string | null) {
  return THEME_COLORS[(variant as keyof typeof THEME_COLORS) || "broadcast"] || THEME_COLORS.broadcast;
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

function drawNoSignal(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, copy: (typeof studioCopy)[StudioLanguage]) {
  context.fillStyle = "#07111d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#d7e2ea";
  context.font = "700 34px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText(copy.noSignal, canvas.width / 2, canvas.height / 2);
}

function drawLiveBadge(context: CanvasRenderingContext2D, copy: (typeof studioCopy)[StudioLanguage]) {
  context.save();
  context.fillStyle = "#ff6b5c";
  roundRect(context, 28, 24, 70, 28, 14);
  context.fill();

  context.fillStyle = "#ffffff";
  context.font = "800 12px Inter, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(copy.live, 28 + 35, 24 + 14);
  context.restore();
}

function drawScoreboard(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  overlay: OverlayConfig,
  logos: {
    left: HTMLImageElement | null;
    right: HTMLImageElement | null;
    team1: HTMLImageElement | null;
    team2: HTMLImageElement | null;
  },
  copy: (typeof studioCopy)[StudioLanguage],
  now: number
) {
  if (overlay.sport === "cricket") {
    drawCricketScoreboard(context, canvas, overlay, logos, copy, now);
    return;
  }

  const preset = getScoringText(overlay, "overlay_preset", "scoreboard");
  if (preset !== "scoreboard") {
    drawCustomOverlayPanel(context, canvas, overlay, preset, logos, copy);
    return;
  }

  const period = `${overlay.scoring_data?.period ?? ""}`.trim();
  const clock = overlay.clock_text ?? "00:00";
  const sponsorText = overlay.sponsor_text?.trim() ?? "";
  const statusLabel = overlay.match_status?.trim() || copy.live;
  const isFootball = overlay.sport === "football";

  const totalWidth = 680;
  const totalHeight = isFootball ? 96 : 86;
  const x = (canvas.width - totalWidth) / 2;
  const y = 28;

  context.save();

  // Outer frame shadow
  context.shadowColor = "rgba(0,0,0,0.5)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 12;

  // Outer frame: rounded-2xl, bg-[#0a1219]/88, border-white/10
  context.fillStyle = "rgba(10,18,25,0.88)";
  roundRect(context, x, y, totalWidth, totalHeight, 16);
  context.fill();
  context.shadowColor = "transparent";

  // Border
  context.strokeStyle = "rgba(255,255,255,0.10)";
  context.lineWidth = 1;
  context.stroke();

  const topRowHeight = isFootball ? 64 : 56;

  // Team 1 (left)
  if (logos.team1) {
    drawTeamCrest(context, logos.team1, x + 14, y + 10, 44);
  }

  context.fillStyle = "#ffffff";
  context.font = "800 14px Inter, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";
  context.fillText(truncateCanvasText(overlay.team1_name, 14), x + totalWidth / 2 - 66, y + topRowHeight / 2);

  // Score center: bg-[#111c28]
  const scoreBlockWidth = 160;
  context.fillStyle = "rgb(17,28,40)";
  roundRect(context, x + totalWidth / 2 - scoreBlockWidth / 2, y + 6, scoreBlockWidth, topRowHeight - 12, 10);
  context.fill();

  context.fillStyle = "#ff7a6b";
  context.font = "900 38px Inter, sans-serif";
  context.textAlign = "right";
  context.fillText(`${overlay.team1_score}`, x + totalWidth / 2 - 14, y + topRowHeight / 2 + 6);

  context.fillStyle = "rgba(255,255,255,0.30)";
  context.font = "700 28px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText("–", x + totalWidth / 2, y + topRowHeight / 2 + 4);

  context.fillStyle = "#baff66";
  context.font = "900 38px Inter, sans-serif";
  context.textAlign = "left";
  context.fillText(`${overlay.team2_score}`, x + totalWidth / 2 + 18, y + topRowHeight / 2 + 6);

  // Team 2 (right)
  context.fillStyle = "#ffffff";
  context.font = "800 14px Inter, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(truncateCanvasText(overlay.team2_name, 14), x + totalWidth / 2 + 66, y + topRowHeight / 2);

  if (logos.team2) {
    drawTeamCrest(context, logos.team2, x + totalWidth - 58, y + 10, 44);
  }

  // Bottom info strip
  const stripY = y + topRowHeight;
  context.fillStyle = "rgba(8,16,23,0.60)";
  context.fillRect(x, stripY, totalWidth, totalHeight - topRowHeight);

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x, stripY);
  context.lineTo(x + totalWidth, stripY);
  context.stroke();

  const items: { text: string; color: string }[] = [];
  items.push({ text: `● ${statusLabel}`, color: "rgba(255,255,255,0.65)" });
  if (isFootball && period) {
    items.push({ text: period, color: "rgba(255,255,255,0.55)" });
  }
  if (clock) {
    items.push({ text: clock, color: "rgba(255,255,255,0.75)" });
  }
  if (sponsorText) {
    items.push({ text: sponsorText, color: "rgba(255,255,255,0.40)" });
  }

  context.font = "700 11px Inter, sans-serif";
  let totalItemsWidth = 0;
  const itemWidths: number[] = [];
  const gap = 20;
  for (const item of items) {
    const w = context.measureText(item.text).width;
    itemWidths.push(w);
    totalItemsWidth += w;
  }
  totalItemsWidth += (items.length - 1) * gap;
  let currentX = x + totalWidth / 2 - totalItemsWidth / 2;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    context.fillStyle = item.color;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(item.text, currentX, stripY + (totalHeight - topRowHeight) / 2 + 1);
    currentX += itemWidths[i] + gap;
  }

  context.restore();
}

function drawCustomOverlayPanel(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  overlay: OverlayConfig,
  preset: string,
  logos: {
    left: HTMLImageElement | null;
    right: HTMLImageElement | null;
    team1: HTMLImageElement | null;
    team2: HTMLImageElement | null;
  },
  copy: (typeof studioCopy)[StudioLanguage]
) {
  const position = getScoringText(overlay, "overlay_position", "top");
  const title = getScoringText(overlay, "overlay_title", overlay.match_status ?? "Live Match");
  const subtitle = getScoringText(overlay, "overlay_subtitle", overlay.sponsor_text ?? "");
  const primaryLabel = getScoringText(overlay, "overlay_primary_label", "Team 1");
  const primaryValue = getScoringText(overlay, "overlay_primary_value", overlay.team1_name);
  const secondaryLabel = getScoringText(overlay, "overlay_secondary_label", "Team 2");
  const secondaryValue = getScoringText(overlay, "overlay_secondary_value", overlay.team2_name);

  const colors = getThemeColors(overlay.theme_variant);

  if (preset === "sponsor-bug") {
    const width = 250;
    const height = 74;
    const x = canvas.width - width - 34;
    const y = position === "lower" ? canvas.height - height - 34 : 34;
    
    context.fillStyle = colors.frame;
    context.shadowColor = "rgba(0,0,0,0.3)";
    context.shadowBlur = 16;
    context.shadowOffsetY = 8;
    roundRect(context, x, y, width, height, 16);
    context.fill();
    context.shadowColor = "transparent";

    context.strokeStyle = "rgba(255,255,255,0.12)";
    context.stroke();
    if (logos.right?.complete && logos.right.naturalWidth > 0) {
      context.drawImage(logos.right, x + width - 58, y + 13, 46, 46);
    }
    context.fillStyle = "#ffffff99";
    context.font = "800 11px Inter, sans-serif";
    context.textAlign = "left";
    context.fillText(copy.presentedBy.toUpperCase(), x + 16, y + 28);
    context.fillStyle = "#ffffff";
    context.font = "900 20px Inter, sans-serif";
    context.fillText(truncateCanvasText(overlay.sponsor_text || title, 18), x + 16, y + 54);
    return;
  }

  const width = preset === "lower-third" ? 760 : 520;
  const height = 112;
  const x = position === "side" ? canvas.width - width - 34 : (canvas.width - width) / 2;
  const y = position === "lower" ? canvas.height - height - 34 : 34;

  context.fillStyle = colors.frame;
  context.shadowColor = "rgba(0,0,0,0.4)";
  context.shadowBlur = 20;
  context.shadowOffsetY = 10;
  roundRect(context, x, y, width, height, 16);
  context.fill();
  context.shadowColor = "transparent";

  context.strokeStyle = "rgba(255,255,255,0.12)";
  context.stroke();

  context.fillStyle = colors.scoreLeft;
  context.font = "800 12px Inter, sans-serif";
  context.textAlign = "left";
  context.fillText(truncateCanvasText(overlay.match_status ?? copy.live, 18), x + 22, y + 28);

  context.fillStyle = "#ffffff";
  context.font = "900 28px Inter, sans-serif";
  context.fillText(truncateCanvasText(title, 30), x + 22, y + 62);

  context.fillStyle = "#ffffffaa";
  context.font = "700 14px Inter, sans-serif";
  context.fillText(truncateCanvasText(subtitle, 50), x + 22, y + 86);

  context.fillStyle = colors.scoreRight;
  context.font = "800 12px Inter, sans-serif";
  context.fillText(truncateCanvasText(primaryLabel, 18), x + width - 238, y + 36);
  context.fillStyle = "#ffffff";
  context.font = "900 18px Inter, sans-serif";
  context.fillText(truncateCanvasText(primaryValue, 18), x + width - 238, y + 61);

  context.fillStyle = colors.scoreRight;
  context.font = "800 12px Inter, sans-serif";
  context.fillText(truncateCanvasText(secondaryLabel, 18), x + width - 238, y + 84);
  context.fillStyle = "#ffffff";
  context.font = "900 18px Inter, sans-serif";
  context.fillText(truncateCanvasText(secondaryValue, 18), x + width - 238, y + 106);
}

function getScoringText(
  overlay: OverlayConfig,
  key: keyof NonNullable<OverlayConfig["scoring_data"]>,
  fallback: string
): string {
  const value = `${overlay.scoring_data?.[key] ?? ""}`.trim();
  return value || fallback;
}

function drawCricketScoreboard(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  overlay: OverlayConfig,
  logos: {
    left: HTMLImageElement | null;
    right: HTMLImageElement | null;
    team1: HTMLImageElement | null;
    team2: HTMLImageElement | null;
  },
  copy: (typeof studioCopy)[StudioLanguage],
  now: number
) {
  const runs = `${overlay.scoring_data?.runs ?? overlay.team1_score}`;
  const wickets = `${overlay.scoring_data?.wickets ?? 0}`;
  const overs = `${overlay.scoring_data?.overs ?? "0.0"}`;
  const target = `${overlay.scoring_data?.target ?? ""}`.trim();
  const currentRate = `${overlay.scoring_data?.current_rate ?? ""}`.trim();
  const requiredRate = `${overlay.scoring_data?.required_rate ?? ""}`.trim();
  const ballsInOver = Number(overlay.scoring_data?.balls_in_over ?? 0);
  const partnership = `${overlay.scoring_data?.partnership ?? ""}`.trim();
  const innings = overlay.scoring_data?.innings ? `${overlay.scoring_data.innings}` : "";
  const maxOvers = `${overlay.scoring_data?.max_overs ?? ""}`.trim();
  const extras = `${overlay.scoring_data?.extras ?? 0}`.trim();
  const sponsorText = overlay.sponsor_text?.trim() ?? "";
  const statusLabel = overlay.match_status?.trim() || copy.live;
  const batsman1Name = getScoringValue(overlay, "batsman1_name", "Striker");
  const batsman2Name = getScoringValue(overlay, "batsman2_name", "Non-striker");
  const batsman1Runs = getScoringValue(overlay, "batsman1_runs", "0");
  const batsman1Balls = getScoringValue(overlay, "batsman1_balls", "0");
  const batsman2Runs = getScoringValue(overlay, "batsman2_runs", "0");
  const batsman2Balls = getScoringValue(overlay, "batsman2_balls", "0");
  const bowlerName = getScoringValue(overlay, "bowler_name", overlay.team2_name);
  const bowlerBalls = getScoringValue(overlay, "bowler_balls_this_over", `${ballsInOver}`);
  const lastOutName = getScoringValue(overlay, "last_out_name", "");
  const lastOutRuns = getScoringValue(overlay, "last_out_runs", "0");
  const lastOutBalls = getScoringValue(overlay, "last_out_balls", "0");
  const runsNeeded = Math.max(0, parseCanvasScoreNumber(target) - parseCanvasScoreNumber(runs));
  const tickerText = overlay.ticker_active === 1 ? overlay.ticker_text?.trim() ?? "" : "";
  const chaseLine = target
    ? `${runsNeeded} needed`
    : "First innings";

  const totalWidth = 920;
  const totalHeight = 132;
  const x = (canvas.width - totalWidth) / 2;
  const y = getScoringText(overlay, "overlay_position", "top") === "lower" ? canvas.height - totalHeight - 28 : 28;
  const scoreWidth = 160;
  const scoreX = x + totalWidth - scoreWidth;
  const topRowHeight = 58;
  const playerRowHeight = 36;
  const bottomRowHeight = totalHeight - topRowHeight - playerRowHeight;

  context.save();

  context.shadowColor = "rgba(0,0,0,0.5)";
  context.shadowBlur = 26;
  context.shadowOffsetY = 12;
  context.fillStyle = "rgba(7,17,22,0.94)";
  roundRect(context, x, y, totalWidth, totalHeight, 12);
  context.fill();
  context.shadowColor = "transparent";

  context.strokeStyle = "rgba(255,255,255,0.12)";
  context.lineWidth = 1;
  context.stroke();

  context.fillStyle = "#11252d";
  context.fillRect(x, y, totalWidth - scoreWidth, topRowHeight);

  if (logos.team1) {
    drawTeamCrest(context, logos.team1, x + 14, y + 9, 40);
  }

  context.fillStyle = "#ffffff";
  context.font = "900 21px Inter, sans-serif";
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillText(truncateCanvasText(overlay.team1_name, 24), x + 68, y + 23);

  context.fillStyle = "#f5c542";
  roundRect(context, x + 68, y + 36, innings ? 54 : 42, 16, 3);
  context.fill();
  context.fillStyle = "#071116";
  context.font = "900 9px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText(innings ? `INN ${innings}` : "BAT", x + 68 + (innings ? 27 : 21), y + 44);

  context.fillStyle = "#e13f31";
  roundRect(context, x + 132, y + 36, 46, 16, 8);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "900 9px Inter, sans-serif";
  context.fillText(statusLabel.toUpperCase(), x + 155, y + 44);

  context.fillStyle = "rgba(255,255,255,0.56)";
  context.font = "700 12px Inter, sans-serif";
  context.textAlign = "left";
  context.fillText(
    truncateCanvasText(`vs ${overlay.team2_name}${maxOvers ? ` | ${maxOvers} overs` : ""}`, 54),
    x + 190,
    y + 44
  );

  context.fillStyle = "#f5c542";
  context.fillRect(scoreX, y, scoreWidth, topRowHeight + playerRowHeight);
  context.fillStyle = "#071116";
  context.font = "900 48px Inter, sans-serif";
  context.textAlign = "right";
  context.fillText(runs, scoreX + 92, y + 43);
  context.fillStyle = "rgba(7,17,22,0.45)";
  context.font = "900 28px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText("/", scoreX + 104, y + 41);
  context.fillStyle = "#071116";
  context.font = "900 30px Inter, sans-serif";
  context.textAlign = "left";
  context.fillText(wickets, scoreX + 116, y + 42);

  context.fillStyle = "#071116";
  context.font = "900 12px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText(`${overs} OV`, scoreX + scoreWidth / 2, y + 76);

  for (let i = 0; i < 6; i++) {
    context.beginPath();
    context.arc(scoreX + 44 + i * 14, y + 87, i < ballsInOver ? 3.5 : 2.5, 0, Math.PI * 2);
    context.fillStyle = i < ballsInOver ? "#071116" : "rgba(7,17,22,0.25)";
    context.fill();
  }

  const playerY = y + topRowHeight;
  context.fillStyle = "#08171d";
  context.fillRect(x, playerY, scoreX - x, playerRowHeight);
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.beginPath();
  context.moveTo(x, playerY);
  context.lineTo(scoreX, playerY);
  context.stroke();

  drawCanvasBatter(context, x + 16, playerY + 22, 245, batsman1Name, batsman1Runs, batsman1Balls, true);
  drawCanvasBatter(context, x + 278, playerY + 22, 245, batsman2Name, batsman2Runs, batsman2Balls, false);

  context.fillStyle = "rgba(255,255,255,0.45)";
  context.font = "900 10px Inter, sans-serif";
  context.textAlign = "left";
  context.fillText("BOWLER", x + 540, playerY + 22);
  context.fillStyle = "#ffffff";
  context.font = "900 13px Inter, sans-serif";
  context.fillText(truncateCanvasText(bowlerName, 16), x + 595, playerY + 22);
  context.fillStyle = "#f5c542";
  context.font = "900 11px Inter, sans-serif";
  context.fillText(`${bowlerBalls}/6`, x + 710, playerY + 22);

  const stripY = y + topRowHeight + playerRowHeight;
  context.fillStyle = "rgba(3,8,11,0.82)";
  context.fillRect(x, stripY, totalWidth, bottomRowHeight);

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.beginPath();
  context.moveTo(x, stripY);
  context.lineTo(x + totalWidth, stripY);
  context.stroke();

  const items: { text: string; color: string }[] = [];
  items.push({ text: `${copy.crr.toUpperCase()} ${currentRate || "0.00"}`, color: "#baff66" });
  if (target) {
    items.push({ text: `${copy.target} ${target}`, color: "rgba(255,255,255,0.70)" });
  }
  if (requiredRate) {
    items.push({ text: `${copy.rrr.toUpperCase()} ${requiredRate}`, color: "#ff7a6b" });
  }
  items.push({ text: `EXTRAS ${extras}`, color: "rgba(255,255,255,0.70)" });
  if (partnership) {
    items.push({ text: `${copy.ptn} ${partnership}`, color: "rgba(255,255,255,0.55)" });
  }
  if (lastOutName) {
    items.push({ text: `OUT ${lastOutName} ${lastOutRuns}(${lastOutBalls})`, color: "rgba(255,255,255,0.62)" });
  }
  if (!tickerText) {
    items.push({ text: chaseLine, color: "rgba(255,255,255,0.55)" });
  }
  if (sponsorText) {
    items.push({ text: sponsorText, color: "rgba(255,255,255,0.40)" });
  }

  context.font = "900 11px Inter, sans-serif";
  let currentX = x + 16;
  const tickerWidth = tickerText ? 330 : 0;
  const itemLimitX = tickerText ? x + totalWidth - tickerWidth - 24 : x + totalWidth - 16;
  for (const item of items) {
    if (currentX >= itemLimitX) {
      break;
    }
    context.fillStyle = item.color;
    context.textAlign = "left";
    context.textBaseline = "middle";
    const text = truncateCanvasText(item.text.toUpperCase(), 24);
    const width = context.measureText(text).width;
    if (currentX + width > itemLimitX) {
      break;
    }
    context.fillText(text, currentX, stripY + bottomRowHeight / 2 + 1);
    currentX += width + 22;
  }

  if (tickerText) {
    drawInlineCricketTicker(context, x + totalWidth - tickerWidth - 12, stripY + 5, tickerWidth, bottomRowHeight - 10, tickerText, now, copy);
  }

  context.restore();
}

function drawInlineCricketTicker(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  now: number,
  copy: (typeof studioCopy)[StudioLanguage]
) {
  context.save();
  context.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(context, x, y, width, height, height / 2);
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  context.stroke();

  const badgeWidth = 68;
  context.fillStyle = "#e53e3e";
  roundRect(context, x, y, badgeWidth, height, height / 2);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "900 10px Inter, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(copy.update.toUpperCase(), x + badgeWidth / 2, y + height / 2 + 1);

  context.beginPath();
  context.rect(x + badgeWidth + 8, y + 1, width - badgeWidth - 14, height - 2);
  context.clip();
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.font = "800 12px Inter, sans-serif";
  context.textAlign = "left";

  const textWidth = context.measureText(text).width;
  const scrollWidth = textWidth + 80;
  const offset = -((now / 22) % scrollWidth);
  context.fillText(text, x + badgeWidth + 12 + offset, y + height / 2 + 1);
  context.fillText(text, x + badgeWidth + 12 + offset + scrollWidth, y + height / 2 + 1);
  context.restore();
}

function getScoringValue(overlay: OverlayConfig, key: string, fallback: string): string {
  const value = overlay.scoring_data?.[key];
  const text = `${value ?? ""}`.trim();
  return text || fallback;
}

function parseCanvasScoreNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function drawCanvasBatter(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  name: string,
  runs: string,
  balls: string,
  striker: boolean
) {
  context.fillStyle = striker ? "#f5c542" : "rgba(255,255,255,0.22)";
  context.beginPath();
  context.arc(x, y - 2, 4, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#ffffff";
  context.font = "900 13px Inter, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(truncateCanvasText(name, 18), x + 12, y);

  context.fillStyle = "#ffffff";
  context.font = "900 18px Inter, sans-serif";
  context.textAlign = "right";
  context.fillText(runs, x + width - 32, y);

  context.fillStyle = "rgba(255,255,255,0.45)";
  context.font = "900 11px Inter, sans-serif";
  context.fillText(`(${balls})`, x + width, y);
}

function drawLogos(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  logos: {
    left: HTMLImageElement | null;
    right: HTMLImageElement | null;
    team1: HTMLImageElement | null;
    team2: HTMLImageElement | null;
  }
) {
  context.save();
  context.shadowColor = "rgba(0,0,0,0.35)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 6;

  if (logos.left?.complete && logos.left.naturalWidth > 0) {
    const size = 56;
    context.fillStyle = "rgba(0,0,0,0.30)";
    roundRect(context, 28, 64, size, size, 12);
    context.fill();
    context.drawImage(logos.left, 28 + 2, 64 + 2, size - 4, size - 4);
  }

  if (logos.right?.complete && logos.right.naturalWidth > 0) {
    const size = 56;
    context.fillStyle = "rgba(0,0,0,0.30)";
    roundRect(context, canvas.width - 28 - size, 64, size, size, 12);
    context.fill();
    context.drawImage(logos.right, canvas.width - 26 - size, 66, size - 4, size - 4);
  }

  context.restore();
}

function drawTicker(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
  now: number,
  copy: (typeof studioCopy)[StudioLanguage],
  themeVariant?: string | null
) {
  const height = 46;
  const y = canvas.height - height - 28;
  const x = 28;
  const width = canvas.width - 56;

  context.save();

  // Rounded-full, border-white/10, bg-[#0a1219]/92
  context.shadowColor = "rgba(0,0,0,0.5)";
  context.shadowBlur = 20;
  context.shadowOffsetY = 8;

  context.fillStyle = "rgba(10,18,25,0.92)";
  roundRect(context, x, y, width, height, 23);
  context.fill();
  context.shadowColor = "transparent";

  context.strokeStyle = "rgba(255,255,255,0.10)";
  context.lineWidth = 1;
  context.stroke();

  // UPDATE badge: rounded-full bg-[#e53e3e]
  const badgeWidth = 84;
  const badgeHeight = height - 8;
  const badgeX = x + 4;
  const badgeY = y + 4;

  context.fillStyle = "#e53e3e";
  roundRect(context, badgeX, badgeY, badgeWidth, badgeHeight, 19);
  context.fill();

  context.fillStyle = "#ffffff";
  context.font = "bold 12px Inter, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(copy.update.toUpperCase(), badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);

  // Clipping region for scrolling text
  context.beginPath();
  context.rect(x + badgeWidth + 12, y + 2, width - badgeWidth - 24, height - 4);
  context.clip();

  context.fillStyle = "rgba(255,255,255,0.95)";
  context.font = "500 16px Inter, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";

  const textWidth = context.measureText(text).width;
  const scrollWidth = textWidth + 150;
  const offset = -((now / 20) % scrollWidth);

  context.fillText(text, x + badgeWidth + 20 + offset, y + height / 2 + 1);
  context.fillText(text, x + badgeWidth + 20 + offset + scrollWidth, y + height / 2 + 1);

  context.restore();
}

function drawTeamCrest(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  size: number = 32
) {
  if (!img || !img.complete || img.naturalWidth === 0) return;

  ctx.save();
  // Shadow like React: shadow-[0_4px_12px_rgba(0,0,0,0.4)]
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  // Background: rounded-lg, border-white/10, bg-black/30
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  roundRect(ctx, x, y, size, size, 8);
  ctx.fill();

  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw logo image with small padding (p-[2px])
  ctx.drawImage(img, x + 2, y + 2, size - 4, size - 4);
  ctx.restore();
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
    if (!video) return;

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
    <article 
      onClick={() => !isLive && camera.status === "ready" && onTakeLive()}
      className={`group relative overflow-hidden rounded-[1.25rem] border transition-all ${
        isLive 
          ? "border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/5 shadow-[0_0_20px_rgba(255,122,107,0.1)]" 
          : "border-white/5 bg-black/40 hover:border-white/20 cursor-pointer hover:scale-[1.02]"
      }`}
    >
      <div className="relative aspect-video overflow-hidden bg-black">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        
        {camera.status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center">
              {camera.status === "pulling" ? (
                <Loader2 className="mx-auto animate-spin text-[var(--accent-cyan)]" size={20} />
              ) : (
                <CameraOff className="mx-auto text-white/40" size={20} />
              )}
              <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-white/60">
                {camera.status === "pulling" ? copy.pullingSfu : copy.pullFailed}
              </p>
            </div>
          </div>
        )}

        {/* Hover Switch Overlay */}
        {!isLive && camera.status === "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--accent-cyan)]/20 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="rounded-full bg-[var(--accent-cyan)] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#041016] shadow-2xl">
              {copy.takeLive}
            </div>
          </div>
        )}

        <div className="absolute left-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white/70 backdrop-blur-md">
          {camera.id.split('-').pop()}
        </div>

        {isLive && (
          <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg bg-[var(--accent-coral)] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-lg">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            {copy.onAir}
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onTakeLive();
          }}
          disabled={camera.status !== "ready" || isLive}
          className={`absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${
            isLive 
              ? "bg-white/10 text-white/40" 
              : "bg-[var(--accent-cyan)] text-[#041016] shadow-lg hover:scale-105 active:scale-95"
          }`}
        >
          <Zap size={10} fill="currentColor" />
          {isLive ? copy.onAir : copy.takeLive}
        </button>
      </div>

      <div className="flex items-center justify-between p-2">
        <div className="flex gap-1">
          <button
            onClick={() => onToggleVideo(!videoEnabled)}
            className={`p-1.5 rounded-lg transition-colors ${videoEnabled ? 'text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10' : 'text-white/20 hover:bg-white/5'}`}
          >
            {videoEnabled ? <Video size={14} /> : <VideoOff size={14} />}
          </button>
          <button
            onClick={() => onToggleAudio(!audioEnabled)}
            className={`p-1.5 rounded-lg transition-colors ${audioEnabled ? 'text-[var(--accent-lime)] hover:bg-[var(--accent-lime)]/10' : 'text-white/20 hover:bg-white/5'}`}
          >
            {audioEnabled ? <Mic size={14} /> : <MicOff size={14} />}
          </button>
        </div>
        
        {camera.error && (
          <span className="text-[9px] font-bold text-[var(--accent-coral)] animate-pulse">Error</span>
        )}
      </div>
    </article>
  );
}

function GraphicsPanel({
  copy,
  onOverlayChange,
  onScoringDataChange,
  onSaveOverlay,
  overlay,
  overlayNotice,
  overlaySaving,
  room,
  assetBusyField,
  assetError,
  onLogoUpload,
  onLogoRemove,
  compact = false,
}: {
  copy: (typeof studioCopy)[StudioLanguage];
  onOverlayChange: (field: keyof OverlayConfig, value: OverlayConfig[keyof OverlayConfig]) => void;
  onScoringDataChange: (patch: NonNullable<OverlayConfig["scoring_data"]>) => void;
  onSaveOverlay: () => Promise<void>;
  overlay: OverlayConfig;
  overlayNotice: string | null;
  overlaySaving: boolean;
  room: RoomSummary;
  assetBusyField: string | null;
  assetError: string | null;
  onLogoUpload: (field: "left_logo_url" | "right_logo_url" | "team1_logo_url" | "team2_logo_url", file: File) => void;
  onLogoRemove: (field: "left_logo_url" | "right_logo_url" | "team1_logo_url" | "team2_logo_url") => void;
  compact?: boolean;
}) {
  const scoringLink =
    room.scoring_token && typeof window !== "undefined"
      ? `${window.location.origin}/score/${room.scoring_token}`
      : "";



  async function handleCopyScoringLink() {
    if (!scoringLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(scoringLink);
    } catch {
      // Ignore
    }
  }

  return (
    <section className={`glass-panel rounded-[2rem] ${compact ? 'p-0 bg-transparent border-none' : 'p-5'}`}>
      {!compact && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 data-display className="text-xl font-semibold text-[var(--text-main)]">
              {copy.graphics}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              {copy.graphicsHelp}
            </p>
          </div>
        </div>
      )}

      <div className={`space-y-4 rounded-[1.5rem] ${compact ? 'mt-0' : 'mt-4 border border-[var(--border-soft)] bg-black/15 p-4'}`}>
        <div className="grid gap-3 sm:grid-cols-3">
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
            onRemove={() => onLogoRemove("left_logo_url")}
            onUpload={(file) => onLogoUpload("left_logo_url", file)}
          />
          <LogoUploadControl
            busy={assetBusyField === "right_logo_url"}
            copy={copy}
            field="right_logo_url"
            label={copy.rightLogo}
            value={overlay.right_logo_url ?? ""}
            onRemove={() => onLogoRemove("right_logo_url")}
            onUpload={(file) => onLogoUpload("right_logo_url", file)}
          />
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-cyan)]">
          {copy.teamLogo}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <LogoUploadControl
            busy={assetBusyField === "team1_logo_url"}
            copy={copy}
            field="team1_logo_url"
            label={copy.team1Logo}
            value={overlay.team1_logo_url ?? ""}
            onRemove={() => onLogoRemove("team1_logo_url")}
            onUpload={(file) => onLogoUpload("team1_logo_url", file)}
          />
          <LogoUploadControl
            busy={assetBusyField === "team2_logo_url"}
            copy={copy}
            field="team2_logo_url"
            label={copy.team2Logo}
            value={overlay.team2_logo_url ?? ""}
            onRemove={() => onLogoRemove("team2_logo_url")}
            onUpload={(file) => onLogoUpload("team2_logo_url", file)}
          />
        </div>

        {assetError ? <ErrorBox message={assetError} /> : null}

        <div className="rounded-[1.25rem] border border-[var(--border-soft)] bg-black/15 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-lime)]">
                Score Control Link
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                এই লিঙ্কটি স্কোরারের সাথে শেয়ার করুন। সেখান থেকে আপডেট করা স্কোর সরাসরি ব্রডকাস্টে দেখা যাবে।
              </p>
            </div>
            <ToggleChip
              active={overlay.scoreboard_active === 1}
              label={overlay.scoreboard_active === 1 ? copy.on : copy.off}
              onClick={() => onOverlayChange("scoreboard_active", overlay.scoreboard_active === 1 ? 0 : 1)}
            />
          </div>
          {overlay.scoreboard_active === 1 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCopyScoringLink()}
              disabled={!scoringLink}
              className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-main)] disabled:opacity-50"
            >
              <Clipboard size={14} />
              {copy.copyLink}
            </button>
            {scoringLink ? (
              <a
                href={scoringLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-main)]"
              >
                <ExternalLink size={14} />
                খুলুন
              </a>
            ) : null}
          </div>
          ) : null}
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {copy.ticker}
          </span>
          <textarea
            value={overlay.ticker_text ?? ""}
            onChange={(event) => onOverlayChange("ticker_text", event.target.value)}
            className="min-h-24 w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
            placeholder="ব্রেকিং আপডেট · খেলা শুরু ১০ মিনিটে · স্পন্সরড বাই ..."
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
  field: "left_logo_url" | "right_logo_url" | "team1_logo_url" | "team2_logo_url";
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
            className="h-12 w-12 rounded-xl border border-[var(--border-soft)] bg-white/10 object-contain p-1"
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

function AdVideoUploadControl({
  assets,
  busy,
  copy,
  onRemove,
  onTakeLive,
  onUpload,
  uploadProgress,
  value,
}: {
  assets: RoomAssetSummary[];
  busy: boolean;
  copy: (typeof studioCopy)[StudioLanguage];
  onRemove: (asset?: RoomAssetSummary) => void;
  onTakeLive: (asset: RoomAssetSummary) => void;
  onUpload: (file: File) => void;
  uploadProgress: number | null;
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[var(--border-soft)] bg-black/15 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-lime)]">
            {copy.adVideoUpload}
          </p>
          <p className="mt-2 break-all text-sm text-[var(--text-muted)]">
            {assets.length}/3 {copy.adVideoSlots}
          </p>
        </div>
        {value ? (
          <Video className="shrink-0 text-[var(--accent-cyan)]" size={22} />
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold text-[var(--text-main)]">
          {busy ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
          {copy.chooseFile}
          <input
            type="file"
            accept="video/*"
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
          onClick={() => onRemove(assets.find((asset) => asset.publicUrl === value))}
          disabled={busy || !value}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold text-[var(--text-main)] disabled:opacity-50"
        >
          <Trash2 size={14} />
          {copy.remove}
        </button>
      </div>

      {uploadProgress !== null && uploadProgress >= 0 ? (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>আপলোড হচ্ছে...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-[var(--accent-cyan)] transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      ) : null}

      {assets.length > 0 ? (
        <div className="mt-4 space-y-2">
          {assets.map((asset, index) => (
            <div
              key={asset.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-soft)] bg-black/15 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-main)]">
                  Ad {index + 1}
                </p>
                <p className="mt-1 max-w-48 truncate text-xs text-[var(--text-muted)]">
                  {asset.publicUrl}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onTakeLive(asset)}
                  className={`rounded-full px-3 py-2 text-xs font-semibold ${
                    value === asset.publicUrl
                      ? "bg-[var(--accent-cyan)] text-[#041016]"
                      : "border border-[var(--border-soft)] text-[var(--text-main)]"
                  }`}
                >
                  {value === asset.publicUrl ? copy.onAir : copy.takeAdLive}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(asset)}
                  disabled={busy}
                  className="rounded-full border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-main)] disabled:opacity-50"
                >
                  {copy.remove}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
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
  type?: "number" | "password" | "text" | "url";
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
