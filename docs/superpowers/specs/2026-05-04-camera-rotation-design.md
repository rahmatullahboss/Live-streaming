# Camera Rotation System — Design Spec

**Date:** 2026-05-04
**Status:** Approved

---

## Overview

Add a rotation button to the mobile camera screen that re-acquires the camera with landscape constraints and replaces the video track via `RTCRtpSender.replaceTrack()`. The director dashboard receives correctly oriented video with crop-fill display (no director-side rotation control).

---

## Architecture

### Mobile Camera Flow

```
User taps rotation button
  → Stop current videoTrack
  → getUserMedia with landscape 16:9 HD constraints
  → client.replaceTrack(newVideoTrack)
  → Update button state to show landscape mode
```

### Key Components

| Component | File | Role |
|-----------|------|------|
| `CameraPublisher` | `app/routes/camera.tsx` | Add rotation button, handle click, manage track state |
| `CloudflareSFUClient` | `app/lib/sfu.ts` | Expose `replaceTrack()` method |
| `getCameraPublishConstraints` | `app/lib/webrtc/camera-quality.ts` | Already exists — returns landscape HD constraints |

---

## UI Specification

### Rotation Button

- **Position:** Bottom center, floating above video preview
- **Style:** Circular, 56px diameter, semi-transparent dark background
- **Icon:** Landscape/rotate icon (SVG)
- **States:**
  - Default (portrait): Gray icon, "Switch to Landscape" tooltip
  - Active (landscape): Highlighted icon, "Currently Landscape" label
- **Behavior:** Tap → track replacement → UI state update

### Local Preview

- CSS `transform: rotate()` on `<video>` element during transition
- Maintains `object-cover` fill behavior
- After track replacement, preview may appear letterboxed briefly (expected)

---

## Implementation Details

### Track Replacement Flow (camera.tsx)

```typescript
async function handleRotation() {
  // 1. Stop current track
  const oldTrack = session.stream.getVideoTracks()[0];
  oldTrack.stop();

  // 2. Get new landscape stream
  const newStream = await navigator.mediaDevices.getUserMedia({
    video: getCameraPublishConstraints(), // landscape 16:9 HD
    audio: true,
  });
  const newVideoTrack = newStream.getVideoTracks()[0];

  // 3. Replace track on SFU client
  await session.client.replaceTrack(newVideoTrack);

  // 4. Update session stream
  session.stream = newStream;

  // 5. Update UI state
  setIsLandscape(true);
  setNotice("Landscape mode active");
}
```

### SFU Client replaceTrack() (sfu.ts)

The existing `CloudflareSFUClient` publishes via `RTCRtpSender`. Add method:

```typescript
async replaceTrack(newVideoTrack: MediaStreamTrack) {
  const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
  if (sender) {
    await sender.replaceTrack(newVideoTrack);
  }
}
```

### Button State Management

- `useState<boolean>(false)` — `isLandscape`
- Persist to session for reconnection scenarios
- Heartbeat payload includes orientation state

---

## API Changes

### Camera Heartbeat (existing)

No new endpoints. Rotation state communicated via existing heartbeat mechanism if needed.

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| getUserMedia fails | Show error notice, revert to previous state |
| replaceTrack fails | Retry once, then show error with "Try Again" button |
| Track already landscape | Button disabled or shows "Already Landscape" |

---

## Testing Checklist

- [ ] Rotation button visible on mobile camera screen
- [ ] Tapping button acquires landscape video track
- [ ] Video stream to SFU updates with new track
- [ ] Director dashboard receives correctly oriented video
- [ ] Button state reflects current orientation
- [ ] Error recovery works when getUserMedia fails
- [ ] Portrait video still works if user rotates back without button

---

## Files to Modify

1. `app/routes/camera.tsx` — Add rotation button, handle rotation logic
2. `app/lib/sfu.ts` — Add `replaceTrack()` method to `CloudflareSFUClient`
3. `app/lib/webrtc/camera-quality.ts` — Already exports `getCameraPublishConstraints()`, no changes needed