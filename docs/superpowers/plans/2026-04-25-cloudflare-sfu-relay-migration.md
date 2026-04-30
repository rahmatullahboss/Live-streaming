# Cloudflare SFU Relay Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace RealtimeKit camera/studio operation with Cloudflare Realtime SFU + TURN, then send the mixed program output through a VPS-friendly RTMP relay.

**Architecture:** Cameras publish local media tracks to Cloudflare Realtime SFU through the existing `/api/calls` proxy and register their session/track names in D1. The director dashboard polls the camera registry, pulls tracks from SFU, switches a local browser program output, renders graphics/ad overlays, and sends the final mixed stream to the existing ffmpeg relay for YouTube/Facebook.

**Tech Stack:** TypeScript, React Router, React 19, Tailwind, Hono on Cloudflare Workers, D1, Cloudflare Realtime SFU/TURN, browser WebRTC, MediaRecorder, ffmpeg relay.

---

### Task 1: Lock Shared SFU Room Types And Helpers

**Files:**
- Create: `app/lib/sfu-room.test.ts`
- Create: `app/lib/sfu-room.ts`
- Modify: `app/lib/realtime.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildCameraTrackNames, normalizeCameraRecord } from "./sfu-room";

describe("buildCameraTrackNames", () => {
  it("creates stable video and audio names from a camera id", () => {
    expect(buildCameraTrackNames("camera-abc")).toEqual({
      audioTrackName: "camera-abc-audio",
      videoTrackName: "camera-abc-video",
    });
  });
});

describe("normalizeCameraRecord", () => {
  it("accepts active records with a video track and optional audio track", () => {
    expect(
      normalizeCameraRecord({
        audio_track_id: "cam-1-audio",
        id: "cam-1",
        is_active: 1,
        last_seen_at: "2026-04-25 10:00:00",
        session_id: "session-1",
        track_id: "cam-1-video",
      })
    ).toEqual({
      audioTrackName: "cam-1-audio",
      id: "cam-1",
      isActive: true,
      lastSeenAt: "2026-04-25 10:00:00",
      sessionId: "session-1",
      videoTrackName: "cam-1-video",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/lib/sfu-room.test.ts`
Expected: FAIL because `app/lib/sfu-room.ts` does not exist.

- [ ] **Step 3: Implement shared helpers and fetch wrappers**

Add `CameraSource`, `buildCameraTrackNames`, `normalizeCameraRecord`, `getRoomCameras`, `registerRoomCamera`, `heartbeatRoomCamera`, and `removeRoomCamera`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/lib/sfu-room.test.ts`
Expected: PASS.

### Task 2: Replace Camera Route With SFU Publisher

**Files:**
- Modify: `app/routes/camera.tsx`
- Use existing: `app/lib/sfu.ts`, `app/lib/webrtc/camera-quality.ts`, `app/lib/sfu-room.ts`

- [ ] **Step 1: Implement camera join without RealtimeKit**

On PIN submit, verify room, call `getUserMedia`, create a `CloudflareSFUClient`, publish video/audio tracks, register session/track names with `/api/rooms/:id/cameras`, start heartbeat, show local preview, and expose mic/camera toggles by changing `MediaStreamTrack.enabled`.

- [ ] **Step 2: Cleanup on disconnect**

Stop tracks, clear heartbeat, soft-remove the camera registry entry, and close the SFU client.

### Task 3: Replace Studio Route With SFU Puller And Relay Output

**Files:**
- Modify: `app/routes/studio.tsx`
- Use existing: `app/lib/sfu.ts`, `app/lib/local-relay.ts`, `app/components/scoreboard-overlay.tsx`, `app/lib/realtime.ts`

- [ ] **Step 1: Remove RealtimeKit imports and join flow**

PIN submit verifies the room and loads destinations/overlay. It does not create RealtimeKit meetings or participants.

- [ ] **Step 2: Pull active cameras from SFU**

Poll `/api/rooms/:id/cameras`, pull video/audio tracks using `CloudflareSFUClient.pullTracks`, store each pulled camera as a `MediaStream`, and render preview cards.

- [ ] **Step 3: Build final program output**

Render the selected camera or ad video in the program preview, draw the same frame plus broadcast graphics into a hidden 1280x720 canvas, mix the selected audio track through Web Audio, and expose the mixed stream.

- [ ] **Step 4: Start/stop VPS relay**

On `Go Live`, save destinations and overlay, then create one `LocalRelayBroadcaster` per active YouTube/Facebook destination using the mixed stream and `ws://localhost:8899` by default. Stop all broadcasters on demand or route teardown.

### Task 4: Remove RealtimeKit Dependencies And Docs Drift

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Remove RealtimeKit packages**

Remove `@cloudflare/realtimekit-react` and `@cloudflare/realtimekit-react-ui` dependencies.

- [ ] **Step 2: Update setup docs**

Document required Cloudflare SFU/TURN secrets, VPS relay command, and current cost model.

### Task 5: Verify

**Files:**
- Existing tests and typecheck.

- [ ] **Step 1: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.
