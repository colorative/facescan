# Face Scan Check-In Kiosk — UI prototype

A design prototype for the attendee check-in kiosk: walk up, get scanned, badge
appears, print it. Two screens, everything else is overlay or popup.

Face **tracking** is real (MediaPipe FaceLandmarker, in-browser). Face
**recognition** is mocked — swap one function to make it real.

```bash
npm install          # also vendors MediaPipe wasm + model into public/
npm run dev          # http://localhost:5273  — this machine
npm run dev:lan      # https://<your-lan-ip>:5273 — any device on the network
```

### Opening it on another device

`getUserMedia` only runs in a **secure context**. `localhost` is treated as one;
a bare LAN IP over HTTP is not — `http://192.168.x.x` would load the entire UI
and then fail into the "Scanner unavailable" panel with no camera. So sharing
over the network means sharing over HTTPS.

`npm run dev:lan` handles it: it generates a self-signed cert covering the
current LAN addresses (`npm run cert` prints them) and binds every interface.
Each device shows a certificate warning **once** — choose Advanced → Proceed,
and from then on it is a real secure context and the camera works.

The IP is baked into the certificate's SAN, because browsers reject a cert for
an IP that only appears in the Common Name. DHCP will eventually move the
address; `npm run dev:lan` notices and regenerates, so there is nothing to
maintain.

This is LAN-only — it is not reachable from the internet. Certs live in
`certs/` and are gitignored.

---

## The flow

```
ATTRACT ──tap──> STARTING-CAMERA ──> SEARCHING ──face──> ALIGNING
                                                            │ all gates held 600ms
                                                            ▼
                       MATCHING <──1200ms── CAPTURING (sweep ×2, ring fills)
                          │                      ▲ lost alignment → back to ALIGNING
             ┌────────────┴────────────┐
         match                     no match
             ▼                         ▼
         VERIFIED ──600ms──> CARD    ERROR panel
                               ├─ Print ─> PRINTING ─> PRINT-OK ─> ATTRACT
                               ├─ Not me ─> ERROR (wrong-person)
                               └─ Done / 15s ─> ATTRACT

A finished session (Done, a timeout, a dismissed error) returns to Attract and
sets `ended`. Retry — the error panel's Try again — resets the same scan state
but deliberately does not, so it looks again instead of sending the attendee
back to the start screen. Re-arming the scanner in place after a finished
session would immediately re-scan whoever is still standing there.

Any state: 45s inactivity ─> ATTRACT, full session reset
```

Stable face to badge on screen is about **3.3s**.

## Instruction gates

One instruction on screen, ever — chosen by fixed priority:

**lighting → occupancy → distance → centering → pose → stability**

| Gate | Measure | Instruction |
| --- | --- | --- |
| lighting | mean frame luma | "Move to better lighting" / "Too much light behind you" |
| occupancy | face count | "One person at a time" |
| distance | face height ÷ circle height | "Move closer" / "Move back a little" |
| centering | offset in reticle-radius units | "Centre your face" + arrow |
| pose | eye-line angle, nose vs cheeks | "Straighten your head" / "Look at the screen" |
| stability | centre variance over 500ms | "Hold still" |

Two rules keep this from feeling broken, and both are easy to lose in a
refactor:

1. **Hysteresis.** A satisfied gate is re-judged against a threshold widened by
   15%, so a face on a boundary doesn't strobe the instruction.
2. **Debounce.** A change must persist 250ms to reach the screen. A beat
   shorter than that is deliberately never shown.

## Tuning

Everything lives in [`src/config/kiosk.ts`](src/config/kiosk.ts) — every
duration, every threshold, and per-layer feature flags. Nothing else hard-codes
a timing. `FEATURES` switches individual overlay layers off, both to isolate a
performance problem and to compare design options honestly.

## Brand vs scanner colour

Two separate roles, deliberately not merged:

- `--color-brand: #105efb` — taken straight from the Eventify logo. Used for
  the logo lockup, the Attract headline accent, the entry buttons and the
  ambient background. White text on it, since near-black on that blue is only
  about 3.5:1.
- `--color-accent: #4fd8ff` — the **scanner's** colour. The reticle, tick wave,
  sweep and telemetry keep this cyan and are not rebranded. Retinting them blue
  put chrome and scan state in the same hue, and the state sequence
  (cyan → amber → violet → green) needs the cyan end to stay distinct.

The logo lives in `public/brand/`, served locally rather than hotlinked, for
the same reason the face model is vendored: the kiosk must work offline.
Brandfetch's CDN also blocks non-browser requests. Only the dark-wordmark
vector exists upstream (the "light" variant is a WebP raster), so
`eventify-logo.svg` is that file with its `#34383e` wordmark recoloured to the
ink token for legibility on the dark ground; `eventify-logo-original.svg` is
kept exactly as supplied.

## Tracking source

**The camera is the default.** The mock is an explicit dev choice — `?mock=1`,
any `?scenario=…`, or the DEV panel — and never a silent fallback. A kiosk that
quietly switched to synthetic data when the camera failed would check people in
against a fake face; no camera is an error panel instead, which is correct.

So a screenshot taken without a webcam shows "No camera found", not a scan.
That is the camera path working.

## Dev panel and deep links

A **DEV** button sits top-left in dev builds. It forces any phase, any error
panel, any mock scenario, and the match/print outcomes.

Deep links, for review and deterministic screenshots:

```
?screen=scan                     open the scanner directly
?screen=scan&scenario=off-left   pick a mock tracking scenario
?screen=scan&force=no-match      jump straight to an error panel
?screen=scan&phase=card          jump straight to a phase
```

Scenarios: `approach` (the scripted walk-up), `aligned`, `absent`, `too-far`,
`too-close`, `off-left/right/up/down`, `dark`, `bright`, `two-faces`, `roll`,
`yaw`, `jitter`.

The mock exists so the whole instruction set can be exercised **without a
webcam** — useful for design work, and necessary on machines that have no
camera at all.

## The overlay

Back to front, all registered to one `OvalGeometry` (a general ellipse —
`RETICLE.aspect` in the config is `1` for the circle; drop it below 1 for a
portrait oval):

1. vignette mask — darkens and desaturates outside the circle
2. sweep wave — a curved sheet, 2 passes per capture. Modelled as a plane
   cutting a sphere the size of the reticle, so its half-width is
   `sqrt(r² - dy²)`: widest at the equator, narrowing to nothing at the poles.
   The far half of its rim is dimmer than the near half, standing in for the
   occlusion a solid head would give. That is what makes it read as a surface
   in depth rather than a bar sliding over glass.
3. rim ticks — 120 radial lines whose **length** rises and falls as a wave
   travels around the circle (`RETICLE.tickWave`: crests, speed, length
   range). Drawn on canvas in the shared frame loop, not as SVG nodes: the
   wave wants a continuous function of position and time, and 120 individually
   animated elements cost frames. They are batched into 7 brightness bands so
   the whole ring is 7 stroke calls rather than 120 — that alone was worth
   16fps. The ring also rotates while matching, and the wave rotates with it.
4. progress ring — fills 0→1 from twelve o'clock across the capture
5. corner brackets — snap inward on face acquisition
6. success burst — halos, tick draw-on, green wash
7. telemetry HUD — small, dim, real gate values

The circle's interior is left clear: what fills it is the attendee's own face.
Two point-cloud layers exist but ship **off** — `FEATURES.mesh` (a depth cloud
revealed in the sweep's wake, driven by MediaPipe's real `z`) and
`FEATURES.particles`. Flip either on in the config to compare.

State is carried by colour: cyan searching · amber aligning · cyan capturing ·
violet matching · green verified · red error.

**On success the whole surround goes solid green** and the reticle inverts to
dark ink — ring, ticks, brackets, halos, the instruction and the Cancel button
all flip. Left green they would be green-on-green and simply vanish. The circle
itself stays clear, so the attendee's face keeps its true colour, and the badge
scrim matches the surround so the success reading does not drop back to neutral
the moment the card appears.

## Architecture notes

- **Per-frame values never touch React state.** Ring progress, sweep position
  and landmarks live in refs, read by a single shared `requestAnimationFrame`
  ([`src/overlay/frameLoop.ts`](src/overlay/frameLoop.ts)). A 60Hz `setState`
  would re-render the overlay every frame.
- **Detection is throttled to 18fps**, rendering runs at 60. Between inference
  runs the previous sample is reused so gates stay stable.
- **Mock and real tracker emit identical shapes** (`FaceSample`, `FaceMesh`), so
  no overlay code knows which source is live.
- **`object-cover` cropping and mirroring** are both undone when mapping
  landmarks to screen space — get either wrong and the mesh sits off the face
  or every arrow points backwards.
- **GPU delegate falls back to CPU.** MediaPipe hard-fails without WebGL and
  does not retry on its own; on locked-down or low-end kiosk hardware that
  would kill face check-in entirely.

## Swapping in the real backend

| Mock | Replace with |
| --- | --- |
| [`src/vision/mockRecognizer.ts`](src/vision/mockRecognizer.ts) | your identity lookup API |
| [`src/modals/printBadge.ts`](src/modals/printBadge.ts) | the native print service call |
| [`src/data/mockAttendees.ts`](src/data/mockAttendees.ts) | real attendee records |

Every error panel already exists for the failures these can return.

## Privacy

No frame is persisted. The badge photo is a data URL held in one state variable
for the length of a session and dropped on reset; it is never uploaded and
never written to storage. Audio is never requested. The camera light going out
between attendees is deliberate — tracks are stopped explicitly.

There is **no on-screen privacy notice during the scan** — it was removed by
request. If this deployment needs a biometric disclosure in front of the
attendee, it has to come from kiosk signage or a separate consent step, because
the UI no longer carries one.

## Kiosk deployment

`FEATURES.kioskMode` hides the cursor and requests fullscreen plus a screen
wake lock on the first tap (both need a user gesture). Context menu, drag,
pinch-zoom and overscroll are suppressed. Touch targets are ≥64px and sit in
the lower two-thirds for wheelchair reach. Instruction changes are announced
through an `aria-live` region.

## Known gaps

- Not yet run against a live camera. The machine this was built on has no
  webcam and Chrome's fake device does not work on that macOS build, so every
  screenshot so far is the mock. The detection path (landmark mapping, crop and
  mirror correction, roll/yaw maths, depth) is written but unverified against a
  real face — that is the first thing to check on real hardware.
- The badge QR is a seeded placeholder pattern, not a real encoder.
- The mesh can be switched off entirely with `FEATURES.mesh = false`.
- Print goes through `window.print()` with a CR80 (54×86mm) stylesheet, for
  checking the badge against real stock. Production drives a print service.
