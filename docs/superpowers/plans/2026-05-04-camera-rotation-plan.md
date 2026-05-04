# Camera Rotation System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rotation button to mobile camera screen that re-acquires camera with landscape constraints and replaces the video track via `RTCRtpSender.replaceTrack()`.

**Architecture:** Mobile camera re-acquires video track with landscape constraints on button tap, replaces track on SFU client without disconnecting. Director dashboard receives correctly oriented video with crop-fill display.

**Tech Stack:** TypeScript, React, WebRTC, Cloudflare SFU

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app/lib/sfu.ts` | Add `replaceTrack()` method to `CloudflareSFUClient` |
| `app/routes/camera.tsx` | Add rotation button, rotation state, handle rotation logic |

---

## Tasks

### Task 1: Add `replaceTrack()` to SFU Client

**Files:**
- Modify: `app/lib/sfu.ts:71-482` — Add `replaceTrack()` method to `CloudflareSFUClient` class

- [ ] **Step 1: Add the replaceTrack method**

Find the closing of `CloudflareSFUClient` class — after line 481 (before the closing `}` of the class). Add this method:

```typescript
async replaceTrack(newVideoTrack: MediaStreamTrack): Promise<void> {
  return this.enqueueOperation(async () => {
    const videoSender = this.pc.getSenders().find((s) => s.track?.kind === "video");
    if (!videoSender) {
      throw new Error("[SFU] No video sender found to replace track");
    }
    await videoSender.replaceTrack(newVideoTrack);
    console.log("[SFU] Video track replaced");
    this.diagnostics.info("track-replaced", {
      trackId: newVideoTrack.id,
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/lib/sfu.ts
git commit -m "feat(sfu): add replaceTrack method for video rotation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Add Rotation Button to Camera Screen

**Files:**
- Modify: `app/routes/camera.tsx:33-502` — Add rotation button, state, and handler

- [ ] **Step 1: Add isLandscape state**

After line 42 (`const [videoEnabled, setVideoEnabled] = useState(true);`), add:

```typescript
const [isLandscape, setIsLandscape] = useState(false);
```

- [ ] **Step 2: Add handleRotation function**

After the `toggleVideo` function (after line 245), add:

```typescript
async function handleRotation() {
  if (!session) return;

  setNotice("Switching to landscape");
  const oldTrack = session.stream.getVideoTracks()[0];
  const audioTrack = session.stream.getAudioTracks()[0] ?? null;

  try {
    // Stop old video track
    oldTrack.stop();

    // Get new landscape stream
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: {
        ...getCameraPublishConstraints(),
        facingMode: { ideal: "environment" },
      },
    });
    const newVideoTrack = newStream.getVideoTracks()[0];

    // Replace track on SFU client
    await session.client.replaceTrack(newVideoTrack);

    // Update session stream reference
    setSession((prev) => prev ? { ...prev, stream: newStream } : null);

    // Update UI state
    setIsLandscape(true);
    setNotice("Landscape mode active");
    setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to switch to landscape");
    setNotice("Rotation failed");
  }
}
```

- [ ] **Step 3: Add rotation icon import**

Check line 13 — icons are imported from lucide-react. Add `RotateCw` to the import list:

```typescript
import {
  Camera,
  CameraOff,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  RotateCw, // add this
  ShieldCheck,
  Signal,
  Video,
} from "lucide-react";
```

- [ ] **Step 4: Add rotation button to control bar**

Find the IconButton block in the control bar (lines 365-385). After the last IconButton (the Leave button, line 378-383), add:

```typescript
<IconButton
  active={isLandscape}
  icon={<RotateCw size={18} />}
  label={isLandscape ? "Landscape" : "Rotate"}
  onClick={() => void handleRotation()}
/>
```

- [ ] **Step 5: Add landscape indicator to MiniPanel**

Find the grid of MiniPanels (lines 359-363). Add a new MiniPanel after the SFU panel:

```typescript
<MiniPanel label="Orientation" value={isLandscape ? "Landscape" : "Portrait"} />
```

- [ ] **Step 6: Commit**

```bash
git add app/routes/camera.tsx
git commit -m "feat(camera): add rotation button for landscape mode

- Add isLandscape state to track rotation state
- Add handleRotation() to re-acquire camera and replace track
- Add RotateCw icon from lucide-react
- Add rotation button to camera control bar
- Add orientation indicator MiniPanel

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Verification

- [ ] **Step 1: Check for TypeScript errors**

Run: `cd "/Users/rahmatullahzisan/Desktop/Dev/Live streaming" && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors related to new code

- [ ] **Step 2: Verify rotation button appears in component**

Check that the new IconButton with `RotateCw` is inside the grid-cols-3 div in the control bar section.

- [ ] **Step 3: Review replaceTrack implementation**

Confirm `replaceTrack` uses `enqueueOperation` to maintain operation chain ordering.

---

## Summary

| Task | Change |
|------|--------|
| Task 1 | Add `replaceTrack()` to `CloudflareSFUClient` in `sfu.ts` |
| Task 2 | Add rotation button, state, handler to `camera.tsx` |
| Task 3 | TypeScript verification |