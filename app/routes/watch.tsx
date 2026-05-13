import { useEffect, useState } from "react";
import { Loader2, PlayCircle, RadioTower, RefreshCcw, ShieldAlert } from "lucide-react";

import { ScoreboardOverlay } from "~/components/scoreboard-overlay";
import {
  getOverlayConfig,
  getRealtimeRoom,
  type OverlayConfig,
  type RoomSummary,
  verifyRoomPin,
} from "~/lib/realtime";

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
};

export default function WatchPage() {
  const [pin, setPin] = useState("");
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [overlay, setOverlay] = useState<OverlayConfig>(defaultOverlay);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRoomState(nextPin: string) {
    const matchedRoom = await verifyRoomPin(nextPin.trim());
    const [refreshedRoom, overlayConfig] = await Promise.all([
      getRealtimeRoom(matchedRoom.id),
      getOverlayConfig(matchedRoom.id),
    ]);

    setRoom(refreshedRoom);
    setOverlay({
      ...defaultOverlay,
      ...overlayConfig,
      scoring_data: overlayConfig.scoring_data ?? {},
    });
  }

  async function handleLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await loadRoomState(pin);
    } catch (lookupError: unknown) {
      setError(lookupError instanceof Error ? lookupError.message : "    ");
      setRoom(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    if (!room) {
      return;
    }

    setRefreshing(true);
    setError(null);

    try {
      const [refreshedRoom, overlayConfig] = await Promise.all([
        getRealtimeRoom(room.id),
        getOverlayConfig(room.id),
      ]);
      setRoom(refreshedRoom);
      setOverlay({
        ...defaultOverlay,
        ...overlayConfig,
        scoring_data: overlayConfig.scoring_data ?? {},
      });
    } catch (refreshError: unknown) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh playback");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!room) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void Promise.all([getRealtimeRoom(room.id), getOverlayConfig(room.id)])
        .then(([refreshedRoom, overlayConfig]) => {
          setRoom(refreshedRoom);
          setOverlay({
            ...defaultOverlay,
            ...overlayConfig,
            scoring_data: overlayConfig.scoring_data ?? {},
          });
        })
        .catch(() => undefined);
    }, 2_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [room]);

  const playbackUrl = room?.stream_playback_url ?? null;
  const showAd = overlay.program_source === "ad" && Boolean(overlay.ad_video_url);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6">
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-cyan)]">
            <RadioTower size={14} />
             
          </div>
          <h1 data-display className="text-4xl font-bold tracking-tight text-[var(--text-main)]">
              ।
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
                -      ।
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={!room || refreshing}
          className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)] disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
           
        </button>
      </section>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="glass-panel rounded-[2rem] p-5">
          <form onSubmit={handleLookup} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                 
              </span>
              <input
                type="text"
                required
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                className="w-full rounded-2xl border border-[var(--border-soft)] bg-black/20 px-4 py-4 text-lg font-semibold tracking-[0.32em] text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
                placeholder="123456"
              />
            </label>

            <button
              type="submit"
              disabled={loading || pin.trim().length < 4}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent-cyan)] px-5 py-4 text-sm font-semibold text-[#041016] disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <PlayCircle size={18} />}
                
            </button>
          </form>

          {error ? (
            <div className="mt-4 rounded-2xl border border-[var(--accent-coral)]/30 bg-[var(--accent-coral)]/10 px-4 py-3 text-sm text-[#ffd8d4]">
              {error}
            </div>
          ) : null}

          {room ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-black/15 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--text-main)]">{room.name}</p>
                <p className="mt-3 text-xs text-[var(--text-muted)]"> </p>
                <p className="mt-2 break-all text-sm text-[var(--accent-cyan)]">
                  {playbackUrl ?? "      ।"}
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-black/15 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                   
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--text-main)]">
                  {showAd ? overlay.ad_title || " " : "  "}
                </p>
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  {overlay.external_overlay_active === 1 && overlay.external_scoreboard_url?.trim()
                    ? "       ।"
                    : overlay.scoreboard_active === 1
                    ? "      ।"
                    : "    ।"}
                </p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="glass-panel overflow-hidden rounded-[2rem] p-3 sm:p-4">
          {showAd ? (
            <div className="relative overflow-hidden rounded-[1.6rem] border border-[var(--border-soft)] bg-black">
              <video
                key={overlay.ad_video_url ?? "ad"}
                src={overlay.ad_video_url ?? undefined}
                className="aspect-video min-h-[60vh] w-full bg-black object-cover"
                autoPlay
                controls
                loop
                muted
              />
              <ScoreboardOverlay overlay={overlay} />
            </div>
          ) : playbackUrl ? (
            <div className="relative overflow-hidden rounded-[1.6rem] border border-[var(--border-soft)] bg-black">
              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-black/65 to-transparent px-4 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-cyan)]">
                     
                  </p>
                  <p className="text-sm font-semibold text-[var(--text-main)]">
                    {room?.name ?? "Cloudflare Playback"}
                  </p>
                </div>
                <div className="rounded-full border border-white/12 bg-black/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-lime)]">
                  
                </div>
              </div>

              <iframe
                title="Cloudflare Playback"
                src={playbackUrl}
                className="aspect-video min-h-[60vh] w-full border-0 bg-black"
                allow="autoplay; fullscreen"
              />

              <ScoreboardOverlay overlay={overlay} />
            </div>
          ) : (
            <div className="flex min-h-[60vh] items-center justify-center rounded-[1.6rem] border border-[var(--border-soft)] bg-black/20 px-6 text-center">
              <div>
                <ShieldAlert className="mx-auto text-[var(--accent-lime)]" size={28} />
                <p className="mt-4 text-lg font-semibold text-[var(--text-main)]">
                     
                </p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                     ।          ।
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
