# GUI E2E Test Specification: Split Preview / STL Export

**Feature**: `003-split-stl-export`

**Artifact status**: Approved for implementation

**Execution target**: Vite application in a real Chrome browser controlled through Chrome DevTools MCP

**Definition lock**: After approval, everything from this heading through “Document review checklist” is immutable. After implementation, the orchestrator may edit only the execution-record cells in the final section. A failed scenario is fixed in product/test support code and rerun; its expected result is never weakened.

## 1. Authority, scope, and proof rules

This document derives from `spec.md`, `plan.md`, and `task.md`. It specifies browser acceptance before GUI implementation. Chrome DevTools MCP must execute every scenario through rendered controls. Source inspection, worker self-report, unit-test output standing alone, or a screenshot standing alone is not scenario execution proof.

The browser can prove rendered state, interaction, canvas presentation, persistence, download behavior, timing, console behavior, and network behavior. It cannot prove exact topology or private byte ownership. Therefore:

- watertightness, connectivity, positive volume, winding, shared-boundary equality, absence of foreign triangles, exact Preview/STL triangle parity, and exact legacy bytes require the approved `spherePartGeometry`, `meshTopology`, and `exportParity` automated evidence from T0.2/T5.2/T6.1/T6.2;
- `BuiltPart.workingImage.data` byte/hash immutability, distinct grayscale buffers, outer-only material assignment, and cleanup ownership require the approved `viewer`/`state` automated evidence from T7.2/T7.3;
- exact `1.2` camera-fit mathematics and exact legacy camera reset values require `sceneFit` automated evidence from T7.1; browser screenshots prove only the visible fit/reset outcome;
- common-slicer proof is the immutable T8.2 matrix `SLICE-001`..`SLICE-020` in section 3.1. All exactly 20 specified STL files must load as one watertight solid without repair. A canvas image does not prove slicer validity.

Every scenario record must link both its browser evidence and any named automated/slicer evidence. Code inspection and worker statements are forbidden evidence references.

## 2. Fixed execution environment

### 2.1 Application and browser

1. Use the implementation commit under acceptance, with a clean production build followed by the repository's Vite serving command on `http://127.0.0.1:<recorded-port>/`.
2. Use stable desktop Chrome, normal profile, browser zoom 100%, hardware acceleration and WebGL enabled. Record Chrome version, OS, device-pixel ratio, app commit, port, and whether the browser profile was fresh.
3. Clear site data for the app origin before E2E-001 unless a scenario explicitly seeds `localStorage`.
4. Keep DevTools console preservation and network-log preservation enabled. Disable network throttling and CPU throttling. Record any acceptance-machine hardware description for E2E-017.
5. Unique viewports:

   | ID | CSS viewport | Use |
   |---|---:|---|
   | `VP-DESKTOP` | 1440 × 1000 | E2E-001..014, E2E-016..017 and all legacy baselines |
   | `VP-COMPACT` | 1024 × 768 | E2E-015 compact supported desktop check |

6. Network allowlist: navigation plus Vite/static same-origin assets required to boot the page are allowed before each scenario action window. If the dev server exposes its HMR WebSocket, that one pre-existing same-origin socket is allowed. After the scenario's `NET-START` checkpoint, no new Fetch/XHR/WebSocket/beacon/document/image/media request is allowed for file selection, Build, Preview, settings, or Export. `blob:` download handling is local and is not a network request.
7. Console rule for every scenario: zero uncaught exceptions, unhandled rejections, `console.error`, or `console.warn` entries from `NET-START` through the final checkpoint. Expected user-facing validation/generation errors must appear in the DOM, not the console. Browser/Vite informational messages may be recorded but are not failures.

### 2.2 Chrome DevTools action notation

- `upload(label, path)`: use the file chooser/input associated with the exact accessible label and set one local file.
- `replace(label, text)`: focus the labeled control, press Ctrl/Cmd+A, type the exact text, then press Tab unless the scenario says otherwise. This must generate normal input/change events; directly assigning React state is forbidden.
- `replace H/V/Index with a/b/c`: perform `replace` in this exact order on `Horizontal split count`, `Vertical split count`, and `Split Index` using `a`, `b`, and `c` respectively.
- `toggle(label)`, `select(label, option)`, and `click(name)`: operate the rendered accessible control.
- `shot(id)`: capture a full viewport screenshot and a canvas-clipped screenshot.
- `dom(id)`: capture an accessibility/DOM snapshot including exact input values, enabled/disabled states, status/alerts, and the measurements in section 2.3.
- Runtime script may read DOM attributes, rectangles, pixels from captured screenshots, `localStorage`, `performance.now()`, and mutation timestamps. It may seed an old persistence payload where explicitly required. It may not read React internals, module variables, Three.js scene objects, or production source.

### 2.3 Required DOM/canvas measurements

At every Preview evidence checkpoint record this JSON-shaped observation:

```text
{
  viewport: { width, height, devicePixelRatio },
  previewRect: { x, y, width, height },
  canvasRect: { x, y, width, height },
  canvasBackingStore: { width, height },
  placeholderText: string | null,
  statusText: string | null,
  buildDisabled: boolean,
  exportDisabled: boolean,
  alerts: string[],
  horizontalScroll: { documentScrollWidth, documentClientWidth }
}
```

For visible framing/selection evidence, crop the screenshot to `canvasRect`. Against an empty-canvas crop captured at the same viewport, form a foreground mask where the maximum absolute RGB-channel difference is greater than 12. Record mask bounding box, centroid, edge clearances, width/height occupancy, and crop SHA-256. The selected mesh must be wholly visible: no mask pixel touches the crop edge and each limiting-axis clearance is positive. “Centered” means mask-centroid displacement is at most 5% of canvas width/height. Exact `1.2` fitting remains proved by `sceneFit`; do not infer it from raster bounds.

Directional selection uses the fixture's four documented cells. E2E-002 requires canvas screenshots at the initial view and after the specified orbit drag, visibly showing only the R2C1 marker/tone region for 2×2 Index 3. The browser evidence is paired with `splitCell`/`spherePartGeometry` automated evidence for exact row-major cell ownership.

### 2.4 Download observation without production hooks

Use a fresh temporary Chrome download directory per scenario. Before each click, record its complete listing and hashes. After one `Export STL` click, wait for Chrome's download completion and record the new listing.

A download assertion passes only when:

1. exactly one new file appears for one click and no partial `.crdownload` remains;
2. its basename exactly matches the Built Part snapshot filename expected by the scenario;
3. size is at least 84 bytes; bytes 80..83 interpreted as little-endian uint32 give `triangleCount > 0`; and `fileSize === 84 + 50 * triangleCount`, proving a nonzero binary STL container;
4. the before-click canvas crop hash and DOM Built Part state remain unchanged through the click;
5. the filename is derived from the last successful Build, not current unbuilt fields;
6. the execution record links the T6.2 `exportParity` result proving the binary triangles equal the displayed Built Part and include no foreign part. File structure plus a screenshot is not triangle-parity proof.

Do not alter production code to expose downloads, geometry, camera, or texture internals.

## 3. Deterministic local fixtures

Materialize the following exact JavaScript as the untracked temporary file `/tmp/360li-e2e-fixtures.mjs` through the orchestrator's filesystem edit/patch mechanism. Do not use `cat`, `echo` redirection, inline shell input redirection, or another shell-write shortcut. Run it with Node 22 as `node /tmp/360li-e2e-fixtures.mjs`; it uses only Node built-ins, writes fixtures outside the repository, uses a fully specified stored-DEFLATE encoder, and introduces no dependency or source change. Independently verify all four output files with a separate SHA-256 read command against the manifest below, then delete only `/tmp/360li-e2e-fixtures.mjs` through the orchestrator's filesystem edit/patch mechanism. Fixture outputs remain available for acceptance execution.

```js
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = '/tmp/360li-e2e-fixtures';
mkdirSync(out, { recursive: true });
const crcTable = Array.from({ length: 256 }, (_, n0) => {
  let n = n0;
  for (let k = 0; k < 8; k++) n = (n & 1) ? (0xedb88320 ^ (n >>> 1)) : (n >>> 1);
  return n >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function adler32(buf) {
  let a = 1, b = 0;
  for (const x of buf) { a = (a + x) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  t.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return result;
}
function storedZlib(raw) {
  const parts = [Buffer.from([0x78, 0x01])];
  for (let p = 0; p < raw.length;) {
    const n = Math.min(65535, raw.length - p), final = p + n === raw.length;
    const header = Buffer.alloc(5); header[0] = final ? 1 : 0;
    header.writeUInt16LE(n, 1); header.writeUInt16LE((~n) & 0xffff, 3);
    parts.push(header, raw.subarray(p, p + n)); p += n;
  }
  const sum = Buffer.alloc(4); sum.writeUInt32BE(adler32(raw)); parts.push(sum);
  return Buffer.concat(parts);
}
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0, p = 0; y < h; y++) {
    raw[p++] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = pixel(x, y, w, h);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr), chunk('IDAT', storedZlib(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const directional = png(512, 256, (x, y, w, h) => {
  const q = (y < h / 2 ? 0 : 2) + (x < w / 2 ? 0 : 1);
  const base = [24, 88, 160, 232][q];
  const cross = Math.abs(x - w / 2) < 3 || Math.abs(y - h / 2) < 3;
  const seam = x < 12;
  const marker = ((x - (40 + (q % 2) * 256)) ** 2 + (y - (36 + Math.floor(q / 2) * 128)) ** 2) < 16 ** 2;
  const v = marker ? 255 - base : cross ? 248 : seam ? 8 : base;
  return [v, v, v, 255];
});
const alternate = png(384, 192, (x, y) => {
  const checker = ((x >> 4) ^ (y >> 4)) & 1;
  const v = (x < 48 || y > 160) ? 210 : checker ? 48 : 132;
  return [v, (v + 37) & 255, 255 - v, 255];
});
const performance = png(4096, 2048, (x, y) => {
  const v = (x * 17 + y * 31 + ((x >> 5) ^ (y >> 4)) * 13) & 255;
  return [v, (v * 3 + 19) & 255, (v * 7 + 53) & 255, 255];
});
const badIhdr = Buffer.alloc(13);
badIhdr.writeUInt32BE(32, 0); badIhdr.writeUInt32BE(16, 4); badIhdr.set([8, 6, 0, 0, 0], 8);
const corrupt = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  chunk('IHDR', badIhdr),
  chunk('IDAT', Buffer.from([0x78, 0x01, 0x00, 0x00])),
  chunk('IEND', Buffer.alloc(0)),
]);
for (const [name, bytes] of Object.entries({
  'directional-512x256.png': directional,
  'alternate-384x192.png': alternate,
  'performance-4096x2048.png': performance,
  'corrupt.png': corrupt,
})) {
  writeFileSync(`${out}/${name}`, bytes);
  console.log(name, bytes.length, createHash('sha256').update(bytes).digest('hex'));
}
```

Expected manifest:

| Fixture ID | File | Bytes | SHA-256 | Deterministic meaning |
|---|---|---:|---|---|
| `FX-DIR` | `directional-512x256.png` | 524652 | `1ac41dba6ff0f580c49c38b42534867f65cf39d35d5fff95cc82b8c3ee315a33` | Four grayscale cells: R1C1=24, R1C2=88, R2C1=160, R2C2=232, each with an asymmetric circular marker; center cross and left seam stripe identify orientation. |
| `FX-ALT` | `alternate-384x192.png` | 295192 | `38ba8c89948409cf7eb77d82cd81d59b2695c8dfc58cf1b0d3a43a3c7984e11a` | Colored asymmetric checker/edge bands used to prove new-image invalidation and recovery. |
| `FX-PERF` | `performance-4096x2048.png` | 33559108 | `396db3030f4c7f73bf634f0f5613f7b27f29c6622bce12b0c4252dd7d5ae468b` | Required 4096×2048 deterministic performance input. |
| `FX-BAD` | `corrupt.png` | 61 | `acf9be481e059bcb762cdce76436a6d59058a49109d01b07bc4ad374aafe73b5` | Valid PNG signature/IHDR/IEND with deliberately incomplete zlib IDAT; image decode must fail. |

Before browser execution, independently hash all four files and fail setup on any mismatch.

### 3.1 Immutable common-slicer matrix

This is the exact T8.2 common-slicer input set. It contains exactly 20 parts. All unspecified build parameters retain `DEFAULT_PARAMS`; `FX-DIR` is the verified source fixture for every row. In the table, bottom/top values are the exact `Bottom hole diameter (mm)` / `Top hole diameter (mm)` inputs (`0` = absent, `24` = present), rotations are the exact `Hole latitude` / `Hole longitude` percentages, and stand state is derived from the real controls: `absent` when bottom hole is `0`, and `present (2.0 mm wall)` when bottom hole is `24` with `Stand wall thickness (mm) = 2.0`. `W/T` are exact Width/Height segment inputs. No invented stand or hole boolean is used.

For each row, Build once from a clean state with the stated exact inputs, Export once, retain the resulting file under its required basename, record its SHA-256/byte size/triangle count, and open that file in the same recorded common slicer. Acceptance requires one positive-volume watertight solid, no repair prompt/action, no missing or extra shell, and no rejection for every ID. Browser Preview/STL parity remains separate T6.2 evidence.

| Matrix ID | Source | H/V/Index | W/T | Direction | Bottom / top hole (mm) | Hole lat / lon (%) | Stand | Claimed coverage | Exact expected export filename |
|---|---|---:|---:|---|---:|---:|---|---|---|
| `SLICE-001` | `FX-DIR` | 1/1/1 | 256/128 | outward | 0 / 0 | 0 / 0 | absent | Legacy 1×1 control; no split wall; no holes | `spherical-lithophane.stl` |
| `SLICE-002` | `FX-DIR` | 2/2/1 | 32/16 | outward | 0 / 0 | 0 / 0 | absent | 2×2 south-pole row; seam-adjacent column 1; no holes | `spherical-lithophane-h2-v2-part-1-of-4.stl` |
| `SLICE-003` | `FX-DIR` | 2/2/2 | 32/16 | inward | 24 / 0 | 0 / 0 | present (2.0 mm wall) | 2×2 south-pole row; seam-adjacent column 2; bottom-only hole; inward; stand | `spherical-lithophane-h2-v2-part-2-of-4.stl` |
| `SLICE-004` | `FX-DIR` | 2/2/3 | 32/16 | outward | 0 / 24 | 0 / 0 | absent | 2×2 north-pole row; top-only hole | `spherical-lithophane-h2-v2-part-3-of-4.stl` |
| `SLICE-005` | `FX-DIR` | 2/2/4 | 32/16 | inward | 24 / 24 | 23 / 37 | present (2.0 mm wall) | 2×2 north-pole row; both holes; nonzero rotation; inward; stand | `spherical-lithophane-h2-v2-part-4-of-4.stl` |
| `SLICE-006` | `FX-DIR` | 3/2/1 | 10/5 | outward | 0 / 0 | 0 / 0 | absent | 3×2 non-divisible allocation (W 4/3/3, T 3/2); south pole; seam column 1 | `spherical-lithophane-h3-v2-part-1-of-6.stl` |
| `SLICE-007` | `FX-DIR` | 3/2/2 | 10/5 | inward | 24 / 0 | 0 / 0 | present (2.0 mm wall) | 3×2 non-divisible allocation; south row; bottom-only; inward; stand | `spherical-lithophane-h3-v2-part-2-of-6.stl` |
| `SLICE-008` | `FX-DIR` | 3/2/3 | 10/5 | outward | 24 / 0 | 0 / 41 | present (2.0 mm wall) | 3×2 non-divisible allocation; seam column 3; bottom-only; nonzero longitude; stand | `spherical-lithophane-h3-v2-part-3-of-6.stl` |
| `SLICE-009` | `FX-DIR` | 3/2/4 | 10/5 | inward | 24 / 24 | 31 / 0 | present (2.0 mm wall) | 3×2 non-divisible allocation; north pole; both holes; nonzero latitude; inward; stand | `spherical-lithophane-h3-v2-part-4-of-6.stl` |
| `SLICE-010` | `FX-DIR` | 3/2/5 | 10/5 | outward | 0 / 0 | 17 / 29 | absent | 3×2 non-divisible allocation; north row; no holes; both rotations nonzero | `spherical-lithophane-h3-v2-part-5-of-6.stl` |
| `SLICE-011` | `FX-DIR` | 3/2/6 | 10/5 | inward | 0 / 24 | 0 / 63 | absent | 3×2 non-divisible allocation; north pole; seam column 3; top-only; longitude rotation; inward | `spherical-lithophane-h3-v2-part-6-of-6.stl` |
| `SLICE-012` | `FX-DIR` | 4/3/1 | 11/7 | outward | 0 / 0 | 0 / 0 | absent | 4×3 non-divisible allocation (W 3/3/3/2, T 3/2/2); south pole; seam column 1 | `spherical-lithophane-h4-v3-part-1-of-12.stl` |
| `SLICE-013` | `FX-DIR` | 4/3/2 | 11/7 | inward | 24 / 0 | 0 / 0 | present (2.0 mm wall) | 4×3 non-divisible allocation; south row; bottom-only; inward; stand | `spherical-lithophane-h4-v3-part-2-of-12.stl` |
| `SLICE-014` | `FX-DIR` | 4/3/4 | 11/7 | outward | 24 / 0 | 0 / 19 | present (2.0 mm wall) | 4×3 non-divisible allocation; south pole; seam column 4; bottom-only; longitude rotation; stand | `spherical-lithophane-h4-v3-part-4-of-12.stl` |
| `SLICE-015` | `FX-DIR` | 4/3/5 | 11/7 | inward | 24 / 24 | 12 / 44 | present (2.0 mm wall) | 4×3 middle latitude; seam column 1; both holes; both rotations; inward; stand | `spherical-lithophane-h4-v3-part-5-of-12.stl` |
| `SLICE-016` | `FX-DIR` | 4/3/6 | 11/7 | outward | 0 / 0 | 48 / 0 | absent | 4×3 middle latitude; no holes; latitude rotation | `spherical-lithophane-h4-v3-part-6-of-12.stl` |
| `SLICE-017` | `FX-DIR` | 4/3/8 | 11/7 | inward | 0 / 24 | 0 / 72 | absent | 4×3 middle latitude; seam column 4; top-only; longitude rotation; inward | `spherical-lithophane-h4-v3-part-8-of-12.stl` |
| `SLICE-018` | `FX-DIR` | 4/3/9 | 11/7 | outward | 0 / 24 | 67 / 0 | absent | 4×3 north pole; seam column 1; top-only; latitude rotation | `spherical-lithophane-h4-v3-part-9-of-12.stl` |
| `SLICE-019` | `FX-DIR` | 4/3/10 | 11/7 | inward | 24 / 24 | 26 / 58 | present (2.0 mm wall) | 4×3 north row; both holes; both rotations; inward; stand | `spherical-lithophane-h4-v3-part-10-of-12.stl` |
| `SLICE-020` | `FX-DIR` | 4/3/12 | 11/7 | outward | 0 / 0 | 0 / 0 | absent | 4×3 north pole; seam column 4; no holes | `spherical-lithophane-h4-v3-part-12-of-12.stl` |

The immutable coverage set therefore includes both thickness directions; absent, bottom-only, top-only, and both-hole states; stand absent/present; nonzero latitude and longitude rotations; both sides of the longitude seam; south-, middle-, and north-latitude cells; 2×2, 3×2, and 4×3 splits; two explicit non-divisible allocations; and the 1×1 legacy control. T8.2 and final acceptance must report every matrix ID individually; “20 representative parts” without these IDs is insufficient.

## 4. Approved legacy reference-baseline protocol

Reference baselines may be captured only from the approved pre-feature legacy build at its recorded commit, before any split-preview implementation. Use Chrome/environment section 2 and the exact generated fixtures; never create a reference from the implementation under test.

Capture at `VP-DESKTOP`, cleared site data, default parameters, animation/light off, texture on:

1. `BASE-DIR-FRESH`: upload `FX-DIR`, Build 1×1, wait for `Ready`, then `shot`, `dom`, canvas crop/hash/mask measurements.
2. `BASE-DIR-REPEAT`: without orbit/zoom/edit, click Build again and capture the same evidence.
3. `BASE-ALT-FRESH`: fresh reload/cleared site data, upload `FX-ALT`, Build 1×1, capture the same evidence.

The baseline manifest records legacy commit, Chrome version, OS, DPR, viewport, fixture hash, screenshot/crop hash, DOM measurements, and mask bounds/centroid. `BASE-DIR-FRESH` and `BASE-DIR-REPEAT` must already agree within 1 CSS px for centroid and 2 CSS px per mask-bound edge; otherwise baseline capture fails and implementation acceptance does not begin. Exact geometry/STL compatibility is still T0.2/T6.2 automated proof.

## 5. Global scenario contract

Unless overridden, each scenario starts from a new tab with site data cleared, `VP-DESKTOP`, verified fixture hashes, and no prior download. At `NET-START`, clear the console and note the current network log boundary. Every scenario must finish with:

- the exact scenario-specific screenshots, DOM/canvas measurements, and downloads;
- zero forbidden console entries and zero post-`NET-START` requests under section 2.1;
- no uncaught page error and no browser reload/crash;
- an execution record containing evidence references, duration, and rerun history.

## 6. Immutable scenarios

### SP-E2E-001 — Empty initial state

| Field | Definition |
|---|---|
| Trace | FR-001..004, FR-002 defaults, FR-031, FR-034; AC-001, AC-007; SC-001; MVP-001, MVP-017, MVP-018; T1.1, T1.3, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove a clean launch exposes split defaults but no image, Preview, or exportable result. |
| Preconditions/data | Cleared site data; no fixture uploaded; `VP-DESKTOP`. |
| Actions | Navigate; wait for heading and controls; set `NET-START`; take `dom(001-empty)` and `shot(001-empty)`; click neither Build nor Export. |
| DOM/canvas/download assertions | Exact labels `Horizontal split count`, `Vertical split count`, `Split Index` are present and each value is `1`; Parameters are unavailable until an image is selected as designed; status is idle/no error; placeholder is `3D preview will appear here.`; Build and Export STL are disabled; canvas exists with nonzero CSS/backing dimensions; no download. |
| Console/network | Global zero-error rule; no post-`NET-START` request. |
| Evidence checkpoints | `001-empty` full/canvas screenshots, accessibility snapshot, required measurement JSON, console slice, network slice. |

### SP-E2E-002 — 2×2 Index 3 directional Preview and split-only fit

| Field | Definition |
|---|---|
| Trace | FR-005..009, FR-015..025, FR-033; AC-001, AC-003, AC-004, AC-008; SC-002, SC-004, SC-005; MVP-002..004, MVP-007..014, MVP-018; T2.1, T6.1, T7.1, T7.2, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove row-major directional selection displays one selected split part and that a split part is fully visible and centered. |
| Preconditions/data | Clean state; `FX-DIR`; default holes/rotation and segments; texture on; `VP-DESKTOP`. |
| Actions | Set `NET-START`; `upload(Source image (JPEG/PNG), FX-DIR)`; `replace(Horizontal split count, 2)`; `replace(Vertical split count, 2)`; `replace(Split Index, 3)`; click Build once; capture generating DOM; wait for `Ready`; `shot/dom(002-front)`; drag canvas exactly 160 CSS px left from its center with primary pointer, wait for damping to settle, then `shot/dom(002-orbit)`. |
| DOM/canvas/download assertions | On valid Build start the placeholder becomes `Generating…`, old geometry is absent, and Build/Export are disabled. At Ready, no placeholder remains and Export is enabled. Exactly one part is visible—no whole sphere, other part, or selection-guide geometry. The visible texture corresponds to fixture R2C1 (base 160 and its asymmetric marker); R1C1/R1C2/R2C2 markers/tones are absent across the two views. Foreground is wholly inside canvas, has positive clearance, and centroid is within 5% of canvas center before orbit. No download. Exact cell ownership/watertightness is supported by named automated/slicer evidence, not inferred from screenshots. |
| Console/network | Global zero-error rule; no request from upload, Build, or orbit. |
| Evidence checkpoints | `002-generating` DOM; `002-front` and `002-orbit` screenshots/crop hashes/mask measurements; console/network slices; T2.1/T6.1/T7.1 and slicer evidence references. |

### SP-E2E-003 — Export displayed part with frozen snapshot filename

| Field | Definition |
|---|---|
| Trace | FR-010, FR-012..014, FR-028; AC-002, AC-005; SC-006; MVP-005, MVP-006, MVP-015; T3.1, T3.3, T6.2, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove Export uses the displayed Built Part after unbuilt edits, emits exactly one valid binary STL, and uses the Build-time name. |
| Preconditions/data | Continue from SP-E2E-002 Ready with displayed H2/V2/Index3 part; fresh download directory. |
| Actions | Capture `shot/dom(003-before-edit)`; `replace(Split Index, 4)` and `replace(Horizontal split count, 3)` without Build; capture `003-after-edit`; set `NET-START`; click Export STL exactly once; wait for download completion; capture `003-after-download`. |
| DOM/canvas/download assertions | Canvas crop hash/mask and Ready status remain unchanged across edits/export; displayed Preview is still the H2/V2/Index3 result. Build remains valid for the draft while export refers to old result. Exactly one file named `spherical-lithophane-h2-v2-part-3-of-4.stl` appears—not an H3 or Index4 name—and passes all binary STL checks in section 2.4. T6.2 evidence must prove triangle parity and no foreign part. |
| Console/network | Global zero-error rule; Export causes no request. |
| Evidence checkpoints | Three screenshots/DOM snapshots and crop hashes; before/after download listings, STL size/count/hash; console/network slices; T6.2 `exportParity` reference. |

### SP-E2E-004 — Fresh and repeated 1×1 legacy framing/parity

| Field | Definition |
|---|---|
| Trace | FR-002, FR-026, FR-033; AC-005, AC-008; SC-001; MVP-015, MVP-018; T0.2, T6.2, T7.1, T7.2, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove fresh/default and repeated 1×1 retain the approved legacy Preview frame and legacy filename. |
| Preconditions/data | Clean state; `FX-DIR`; `VP-DESKTOP`; approved `BASE-DIR-FRESH/REPEAT`; fresh download directory. |
| Actions | `upload(Source image (JPEG/PNG), FX-DIR)`; verify H/V/Index `1/1/1`; set `NET-START`; `click(Build)`; wait Ready; capture `004-fresh`; `click(Build)` again without any other action; capture generating state, wait Ready, capture `004-repeat`; `click(Export STL)` once. |
| DOM/canvas/download assertions | Fresh and repeated canvas crop/mask bounds and centroid match their corresponding approved legacy baselines within baseline tolerances; neither run applies split auto-fit. Repeated output matches fresh within the same tolerances. Build clearing is visible between runs. Exactly one `spherical-lithophane.stl` passes binary checks. T0.2/T6.2—not raster comparison—prove exact geometry/groups/STL bytes. |
| Console/network | Global zero-error rule; no Build/Export requests. |
| Evidence checkpoints | `004-fresh`, `004-repeat`, generating DOM, baseline comparison report, download report, console/network, T0.2/T6.2 references. |

### SP-E2E-005 — Split → Build-clear → 1×1 frame reset

| Field | Definition |
|---|---|
| Trace | FR-011, FR-026, FR-033; AC-002, AC-005, AC-008; MVP-005, MVP-015, MVP-018; T7.1, T7.2, T8.1, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove the retained split-fit camera state is reset only when the replacement 1×1 Built Part arrives after normal Build clearing. |
| Preconditions/data | Clean state; `FX-DIR`; approved `BASE-DIR-FRESH`. |
| Actions | Upload `FX-DIR`; `replace(Horizontal split count, 2)`; `replace(Vertical split count, 2)`; `replace(Split Index, 3)`; `click(Build)` and wait Ready; orbit by the SP-E2E-002 drag and wheel up 6 notches; capture `005-split`; replace H/V/Index with `1/1/1`; set `NET-START`; `click(Build)` once; immediately capture generating DOM/canvas; wait Ready; capture `005-legacy`. |
| DOM/canvas/download assertions | Build start clears the split mesh and shows `Generating…`; no partial geometry and Export disabled. Final 1×1 frame matches `BASE-DIR-FRESH` within tolerances rather than retaining the off-center/zoomed split target. No download. Exact reset values are supported by T7.1. |
| Console/network | Global zero-error rule; no Build request. |
| Evidence checkpoints | `005-split`, generating placeholder, `005-legacy`, baseline comparison, console/network, T7.1/T7.2 references. |

### SP-E2E-006 — Split → new-image-clear → 1×1 frame reset

| Field | Definition |
|---|---|
| Trace | FR-031, FR-035, FR-026, FR-033; AC-002, AC-005, AC-007; MVP-005, MVP-015, MVP-017, MVP-018; T3.2, T7.2, T8.1, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove selecting a new image clears the old split result immediately and the next alternate-image 1×1 Build uses the approved legacy frame. |
| Preconditions/data | Clean state; `FX-DIR`, `FX-ALT`; approved `BASE-ALT-FRESH`. |
| Actions | Upload `FX-DIR`; replace H/V/Index with `2/2/3`; `click(Build)` and wait Ready; orbit/zoom as SP-E2E-005; capture `006-split`; set `NET-START`; `upload(Source image (JPEG/PNG), FX-ALT)`; immediately capture `006-cleared`; replace H/V/Index with `1/1/1`; `click(Build)`; wait Ready; capture `006-legacy-alt`. |
| DOM/canvas/download assertions | New image selection immediately removes old geometry, shows `Press Build to generate.`, disables Export, and does not auto-Build. Final 1×1 alternate Preview frame matches `BASE-ALT-FRESH` within tolerances rather than the old split camera target. No download. |
| Console/network | Global zero-error rule; file selection and Build make no request. |
| Evidence checkpoints | `006-split`, `006-cleared`, `006-legacy-alt`, baseline comparison, DOM/canvas measurements, console/network, T3.2/T7.2 references. |

### SP-E2E-007 — Raw split validation matrix without correction

| Field | Definition |
|---|---|
| Trace | FR-003, FR-004, FR-025, FR-027, FR-030; AC-006; SC-007; MVP-001, MVP-014, MVP-016; T1.1, T1.3, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove blank, fractional, zero, dynamic-limit, and Index-overflow values remain literal, receive nearby actionable errors, and block Build. |
| Preconditions/data | Clean state; upload `FX-DIR`; no Built Part; `VP-DESKTOP`. |
| Actions | Set `NET-START`; in order, restore valid `1/1/1` before each subcase, then: (a) clear Horizontal split count to blank; (b) enter Vertical split count `1.5`; (c) enter Split Index `0`; (d) set Width segments `8`, then Horizontal split count `9`; (e) set Width segments `32`, Height segments `16`, H=`3`, V=`2`, Index=`7`; (f) with H3/V2/Index6, reduce H to `2` leaving Index untouched. After each edit, Tab once and capture DOM. Never click Build. |
| DOM/canvas/download assertions | Each literal raw value remains exactly `''`, `1.5`, `0`, `9`, `7`, or retained `6`; it is never rounded, truncated, clamped, or rewritten. A nearby `role=alert` names the affected field and states integer/range correction including dynamic maximum (`8` for H in d, `6` total in e, `4` total in f as applicable). Build is disabled, Preview stays empty, Export disabled, no download. |
| Console/network | Global zero-error rule; validation makes no request. |
| Evidence checkpoints | Six labeled DOM/accessibility snapshots with literal values, alerts, and disabled Build; final empty-canvas screenshot; console/network. |

### SP-E2E-008 — Invalid edits retain old result; valid replacement clears; no duplicate Build

| Field | Definition |
|---|---|
| Trace | FR-008, FR-010, FR-011, FR-028; AC-002; MVP-004, MVP-005, MVP-016; T3.2, T8.1, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove invalid drafts do not destroy a ready result/export, while the next valid Build clears it atomically and cannot be duplicated. |
| Preconditions/data | Clean state; `FX-DIR`; fresh download directory. |
| Actions | Upload `FX-DIR`; replace H/V/Index with `2/2/3`; `click(Build)` and wait Ready; capture `008-old`; `replace(Split Index, 9)`; capture `008-invalid`; `click(Export STL)` once and verify old download; `replace(Split Index, 4)`; attach a DOM MutationObserver recording status text/timestamps only; set `NET-START`; issue two primary-pointer clicks on Build 50 ms apart; capture earliest generating state; wait Ready; capture `008-new`. |
| DOM/canvas/download assertions | Invalid edit shows nearby error and disables Build but leaves old canvas crop unchanged and Export enabled; old export name is H2/V2/part3. After valid value, first Build clears old Preview immediately, disables both buttons, shows exactly one `Generating…` transition followed by one `Ready`; second click is unavailable/ignored. New canvas differs from Index3 and shows only Index4 directional region. Exactly one old-part download exists; no automatic/duplicate download. Automated state/generator evidence supports one snapshot/generation. |
| Console/network | Global zero-error rule; no requests; no duplicate error. |
| Evidence checkpoints | `008-old`, `008-invalid`, download report, generating screenshot/DOM, mutation timestamp log, `008-new`, console/network, T3.2/T8.1 references. |

### SP-E2E-009 — Corrupt-image generation failure and recovery

| Field | Definition |
|---|---|
| Trace | FR-011, FR-032, FR-035; AC-002; SC-008 recovery clause; MVP-005, MVP-016; T6.1, T7.3, T8.1, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove decode/generation failure is recoverable, publishes no partial result, and does not require reload. |
| Preconditions/data | Clean state; `FX-BAD`, `FX-DIR`; verified hashes. |
| Actions | Upload `FX-BAD`; set `NET-START`; click Build; wait for error state; capture `009-error`; upload `FX-DIR` without reload; verify cleared/image-loaded state; set H2/V2/Index3; click Build; wait Ready; capture `009-recovered`; click Export once. |
| DOM/canvas/download assertions | Failure shows a recoverable visible error, placeholder `Fix the error and try again.`, no mesh/partial mesh, Build becomes usable after correction, Export remains disabled, and no failure download. Selecting valid image clears failure/old target. Recovery reaches Ready with selected part and one valid `spherical-lithophane-h2-v2-part-3-of-4.stl`. |
| Console/network | Expected decode failure is handled in DOM; zero uncaught/error/warn console entries; no requests in either attempt. |
| Evidence checkpoints | `009-error` and `009-recovered` screenshots/DOM, download report, console/network, T6.1/T7.3 evidence. |

### SP-E2E-010 — 3×2 Index 5 persistence/reload and old-v1 migration

| Field | Definition |
|---|---|
| Trace | FR-002, FR-029..031; AC-007; SC-001, SC-007; MVP-001, MVP-016, MVP-017; T1.2, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove valid split settings persist alone and a v1 payload lacking split fields migrates per field without losing existing settings. |
| Preconditions/data | `VP-DESKTOP`; `FX-DIR`; exact storage key `spherical-lithophane.settings.v1`. |
| Actions | Part A: clear site data, upload `FX-DIR`, replace H/V/Index with `3/2/5`, Build to Ready, reload normally, then set `NET-START` and capture `010-reload`. Part B: clear site data; via DevTools runtime before navigation seed exact JSON `{"version":1,"settings":{"params":{"radiusMm":73,"widthSegments":64,"heightSegments":32},"showTexture":false,"animationSettings":{"enabled":false,"rotationSpeedDegPerSec":20,"rotationAxis":"y","refreshRateHz":60},"centerLightSettings":{"enabled":false,"intensity":4}}}`; reload, set a new `NET-START`, and capture `010-migrated`. |
| DOM/canvas/download assertions | Part A restores exact H3/V2/Index5, but file input is empty, Preview placeholder is initial empty state, Build/Export disabled, and no STL/File/geometry state is restored. Part B retains Radius `73`, Width `64`, Height `32`, texture off, and supplies H/V/Index `1/1/1`; no error and no volatile result. No download. Runtime localStorage seed/read is allowed evidence; source inspection is not. |
| Console/network | Reload allows only normal navigation/static boot traffic before `NET-START`; after it, global zero-error/no-request rule applies. |
| Evidence checkpoints | Pre-reload Ready screenshot, `010-reload`, exact stored payload/hash, `010-migrated`, DOM values, console/network, T1.2 automated reference. |

### SP-E2E-011 — Grayscale outer-only toggle and Built Part texture immutability

| Field | Definition |
|---|---|
| Trace | FR-010, FR-023, FR-024, FR-028; AC-002, AC-004; MVP-005, MVP-013; T7.2, T7.3, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove texture toggle is immediate and outer-only, while unbuilt image-transform edits cannot alter the displayed Built Part. |
| Preconditions/data | Clean state; `FX-DIR`; texture initially on. |
| Actions | Set `NET-START`; upload `FX-DIR`; replace H/V/Index with `2/2/3`; `click(Build)` and wait Ready; orbit exactly 120 px right and 80 px down to expose outer surface plus split walls/inner surface; wait for damping; capture `011-on`; toggle `Show grayscale texture` off and capture `011-off`; toggle it on and capture `011-on-again`; without Build, `replace(Image scale (0..1), 0.63)`, toggle both build flips, and select Padding mode `Stretch`; capture `011-unbuilt-edits`; `click(Export STL)` once. |
| DOM/canvas/download assertions | Off removes directional grayscale only from outer shell; visible split/inner/hole/stand walls stay neutral rather than receiving stretched texture. On-again canvas crop matches `011-on` within raster tolerance. After unbuilt transform edits, crop matches `011-on-again`; Preview and frozen H2/V2/Index3 export remain old Built Part. One correctly named binary STL downloads. Browser images are paired with T7.2 byte-immutability/distinct-buffer/outer-group evidence and T6.2 parity evidence. |
| Console/network | Global zero-error rule; toggles/edits/export make no request. |
| Evidence checkpoints | Four screenshots/crop difference report, DOM values, download report, console/network, T7.2/T7.3/T6.2 references. |

### SP-E2E-012 — Orbit, zoom, center light, and animation remain usable

| Field | Definition |
|---|---|
| Trace | FR-033; AC-008; MVP-018; T7.2, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove existing interactive Preview controls remain functional on a selected split part. |
| Preconditions/data | Clean state; `FX-DIR`; animation/light initially off. |
| Actions | Set `NET-START`; upload `FX-DIR`; replace H/V/Index with `2/2/3`; `click(Build)` and wait Ready; capture `012-start`; drag canvas 140 px right then 70 px up and wait; capture `012-orbit`; wheel down 5 notches and capture `012-zoom`; toggle Center 360 deg light on, set intensity slider to `7.0`, capture `012-light`; select rotation axis `Y`, set speed `90`, refresh `30`, enable animation, capture `012-anim-a`, wait 800 ms, capture `012-anim-b`; disable animation, wait 500 ms, capture twice 500 ms apart. |
| DOM/canvas/download assertions | Orbit changes orientation while retaining one mesh; zoom changes foreground mask size without clipping; light changes mesh luminance without changing mask bounds materially; enabled animation changes orientation between `anim-a/b`; after disable and damping settlement, two crops remain stable. Controls show exact selected values. Preview remains fully visible and Export enabled throughout. No download. |
| Console/network | Global zero-error rule; interactions make no request. |
| Evidence checkpoints | All named screenshots, mask/crop difference metrics, DOM control values, console/network. |

### SP-E2E-013 — Keyboard access and focus order

| Field | Definition |
|---|---|
| Trace | FR-001, FR-027, FR-033; AC-006, AC-008; MVP-001, MVP-016, MVP-018; T1.3, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove all controls, validation, Build, and Export are operable in a predictable keyboard order without a focus trap. |
| Preconditions/data | Clean state; upload `FX-DIR` through DevTools, do not Build; center light off so its intensity is disabled. |
| Actions | Set `NET-START`; focus the Source image input, then press Tab one at a time and record the full `document.activeElement` accessible name and element type. For ordered comparison, use the exact static accessible-name text below; where a label contains a live numeric value, compare its stable accessible-name prefix exactly: `Center light intensity:`, `Rotation speed (deg/s):`, and `Refresh rate (Hz):`. Center light intensity remains disabled and is skipped. Expected order: Source image (JPEG/PNG); Show grayscale texture; Center 360 deg light; Enable animation mode; Rotation speed (deg/s):; Rotation axis; Refresh rate (Hz):; Radius (mm); Min thickness (mm); Max thickness (mm); Thickness direction; Bottom hole diameter (mm); Top hole diameter (mm); Hole latitude (0%=bottom, 100%=top); Hole longitude (0%–100%); Stand wall thickness (mm); Brightness curve; Contrast (0..3); Image scale (0..1); Flip horizontal for build; Flip vertical for build; Padding mode; minCos (0..1); Width segments; Height segments; Horizontal split count; Vertical split count; Split Index; Build. On Split Index type `1.5`, Tab, verify alert/focus progression; Shift+Tab back, replace `1`, Tab to Build, press Enter, wait Ready, Tab to Export STL, press Enter. |
| DOM/canvas/download assertions | Focus order matches exactly using the recorded full accessible names and element types, with live-value labels compared by the stated stable prefixes; disabled controls are skipped; visible focus is never lost/trapped; fractional literal/error appears without correction and Build is skipped while disabled; corrected value allows keyboard Build; Ready allows keyboard Export and exactly one `spherical-lithophane.stl` passes binary checks. |
| Console/network | Global zero-error rule; keyboard flow makes no request. |
| Evidence checkpoints | Focus-order log, screenshots of focus on split field/error/Build/Export, DOM alert/value states, download report, console/network. |

### SP-E2E-014 — Main desktop layout

| Field | Definition |
|---|---|
| Trace | FR-001, FR-009, FR-033; AC-008; MVP-001, MVP-004, MVP-018; T7.2, T8.1, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Prove controls and Preview remain usable in the intended desktop two-region layout. |
| Preconditions/data | `VP-DESKTOP`; clean state; `FX-DIR`. |
| Actions | Set `NET-START`; upload `FX-DIR`; replace H/V/Index with `2/2/3`; `click(Build)` and wait Ready; scroll sidebar from top to bottom; capture top and bottom full screenshots plus Ready canvas measurements; resize to 1200 × 900 and back to `VP-DESKTOP`; capture again without Build. |
| DOM/canvas/download assertions | Header, 320-ish sidebar, and Preview do not overlap; sidebar independently scrolls to all split fields/buttons; canvas width and height are each at least 400 CSS px; no document horizontal overflow; resize preserves one Ready part and does not refit/rebuild or change its Built Part identity; all controls remain reachable. No download. |
| Console/network | Global zero-error rule; resize/scroll make no request. |
| Evidence checkpoints | Top/bottom/after-resize screenshots, layout rectangles/scroll measurements, crop hash before/after resize, console/network. |

### SP-E2E-015 — Compact supported desktop layout

| Field | Definition |
|---|---|
| Trace | FR-001, FR-009, FR-033; AC-008; MVP-001, MVP-004, MVP-018; T7.2, T8.1, T8.2 |
| Viewport | `VP-COMPACT` (1024 × 768 CSS px). |
| Purpose | Prove the existing desktop two-region UI remains non-overlapping, scrollable, reachable, and usable at the compact supported desktop width without requiring a layout mode change. |
| Preconditions/data | `VP-COMPACT`; clean state; `FX-DIR`. |
| Actions | Navigate; set `NET-START`; upload `FX-DIR`; replace H/V/Index with `2/2/3`; scroll the sidebar from its top through every control to Build/Export; `click(Build)`; wait Ready; capture sidebar top, sidebar bottom, Ready layout, and canvas; orbit 80 px horizontally and wheel down 2 notches; capture the final layout. |
| DOM/canvas/download assertions | The existing 320-ish sidebar and Viewer remain side by side and do not overlap each other or the header; no stacking or alternate layout is required. The sidebar independently scrolls, every control plus Build/Export is reachable and operable, and the Viewer retains positive width/height with the canvas wholly inside its region. Document horizontal overflow does not hide either region or any required control; selected part is fully visible; orbit/zoom work; no rebuild/refit occurs from scrolling. No special control-height or canvas-minimum behavior is asserted. No download. |
| Console/network | Global zero-error rule; no requests. |
| Evidence checkpoints | Compact-desktop sidebar-top/sidebar-bottom/Ready/orbit screenshots, sidebar/header/viewer rectangles and scroll measurements, required canvas measurements, horizontal overflow values, console/network. |

### SP-E2E-016 — Client-only session, no unexpected requests/errors

| Field | Definition |
|---|---|
| Trace | FR-008, FR-011, FR-012, FR-034; AC-002, AC-008; MVP-004..006, MVP-018; T3.3, T7.3, T8.1, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Provide an explicit complete-session network/console gate in addition to each scenario's local assertion. |
| Preconditions/data | `VP-DESKTOP`; clean state; `FX-DIR`, `FX-ALT`; preserved DevTools logs and fresh download directory. |
| Actions | After initial boot reaches idle, mark `NET-START`; upload `FX-DIR`; replace H/V/Index with `2/2/3`; `click(Build)` and wait Ready; orbit 120 px left, wheel down 3 notches, toggle texture off/on, toggle center light on/off, enable animation for 800 ms then disable; `click(Export STL)` once; `replace(Split Index, 4)` without Build and `click(Export STL)` once; upload `FX-ALT`; replace H/V/Index with `1/1/1`; `click(Build)` and wait Ready; `click(Export STL)` once. Record every request/console entry from boundary to end. |
| DOM/canvas/download assertions | Each step reaches its expected visible state; three user clicks on Export produce exactly three downloads with snapshot-correct names (part3, part3 again, legacy). No partial download/object URL is left. Resource-leak ownership itself is supported by T7.3 automated evidence. |
| Console/network | Zero post-boundary Fetch/XHR/beacon/new WebSocket/document/image/media requests; zero forbidden console entries; only the pre-existing boot/HMR traffic is allowlisted. Any unexpected request or uncaught console error fails this and the originating scenario. |
| Evidence checkpoints | Complete HAR/request table with type/initiator/status, complete console export, action timeline, three download reports, final screenshot, T7.3 reference. |

### SP-E2E-017 — Real-browser 4096×2048 / 256×128 under 30 seconds

| Field | Definition |
|---|---|
| Trace | FR-008, FR-011, FR-025, FR-032, FR-034; AC-002, AC-008; SC-008; MVP-004, MVP-005, MVP-014, MVP-016, MVP-018; T6.1, T7.3, T8.1, T8.2 |
| Viewport | `VP-DESKTOP` (1440 × 1000 CSS px). |
| Purpose | Authoritatively measure real decode plus selected-part generation on the required large image and default segment resolution. |
| Preconditions/data | `VP-DESKTOP`; clean state; `FX-PERF`; Width segments exactly `256`, Height exactly `128`, H2/V2/Index3; no CPU/network throttling; acceptance hardware recorded; one warm app boot but no prior Build of this fixture. |
| Actions | Upload `FX-PERF`; verify fixture name and all exact parameter values; install a DOM MutationObserver that only timestamps status/placeholder text with `performance.now()`; set `NET-START`; immediately before trusted click record `tClick`; click Build once; attempt a second click at `tClick+50 ms`; wait for first `Ready` timestamp `tReady`; capture `017-ready`; compute `tReady-tClick`; orbit once and export once. |
| DOM/canvas/download assertions | Exactly one Generating and one Ready transition occur; duplicate click is unavailable/ignored; old/partial mesh is never visible; Build and Export are disabled during generation; completion is strictly `< 30000 ms`; Ready part is fully visible and interactive; one H2/V2/part3 binary STL downloads. On failure, page returns to recoverable controls without reload, but any failure or time ≥30 seconds fails acceptance and triggers stop/replan. |
| Console/network | Global zero-error/no-request rule. Decode/generation must remain client-only. |
| Evidence checkpoints | Fixture hash, machine/browser record, status mutation timestamps, `tClick/tReady/duration`, generating/Ready DOM, `017-ready` screenshot/mask, download report, console/network, T8.1 integration preflight reference. |

## 7. Scenario dependencies, order, isolation, and reruns

Mandatory order:

1. Generate/hash fixtures and capture/validate all three approved legacy baselines.
2. Run SP-E2E-001, 002, then dependent SP-E2E-003.
3. Run SP-E2E-004, 005, 006 in order because they establish and exercise legacy/split camera transitions.
4. Run SP-E2E-007, 008, 009, 010, 011, 012, 013.
5. Run layout SP-E2E-014 and 015.
6. Run complete-session SP-E2E-016.
7. Run performance SP-E2E-017 last, after functional correctness is green.
8. Run/attach all automated gates and every immutable common-slicer matrix row `SLICE-001`..`SLICE-020` before final acceptance.

SP-E2E-003 may continue only from a passing SP-E2E-002 state. All other scenarios start from their stated clean state; do not reuse implicit state. Clear the scenario download directory and console/network boundary each time. Persistence scenario state must not leak onward.

On failure, preserve the first failure screenshot, DOM/canvas measurements, console/network logs, downloads, timing, and exact action index before changing anything. After a fix:

- rerun the failed scenario from its first precondition;
- rerun every scenario that depends on it or shares the changed behavior;
- camera/Viewer changes require 002, 004, 005, 006, 011, 012, 014, 015;
- state/Build/export changes require 003, 006, 008, 009, 010, 013, 016, 017;
- validation/persistence changes require 001, 007, 008, 010, 013;
- geometry changes require 002..006, 008, 009, 011, 012, 016, 017 plus all automated and slicer gates;
- any console/network failure requires rerunning the originating scenario and SP-E2E-016.

Record every attempt in rerun history; never overwrite or delete failed evidence. Three flakes with no identified product/environment cause are a failure, not a pass.

## 8. Coverage map

| Coverage family | Browser scenarios | Required non-browser evidence |
|---|---|---|
| FR-001..007 / AC-001 | 001, 002, 007, 010, 013..015 | T1.1..T2.1 |
| FR-008..014 / AC-002 | 002..006, 008, 009, 011, 013, 016, 017 | T3.1..T3.3, T6.2 |
| FR-015..020 / AC-003 | 002, 003, 009, 017 | T4.1..T6.2 and `SLICE-001`..`SLICE-020` |
| FR-021..026 / AC-004..005 | 002, 004..006, 011, 012 | T0.2, T6.1..T7.2 and `SLICE-001`..`SLICE-020` |
| FR-027..031 / AC-006..007 | 001, 003, 006..010, 013 | T1.1..T1.3, T3.2 |
| FR-032..035 / AC-008 | 002, 005, 006, 009, 012..017 | T5.2, T7.1..T8.2 |
| SC-001..008 | 001..017 collectively | T0.2, T1.1..T8.2; SC-005 uses `SLICE-001`..`SLICE-020`; SC-008 real-browser timing |
| MVP-001..018 | 001..017 collectively | Full Phase 0..8 gates and `SLICE-001`..`SLICE-020` |
| Tasks | T0.2, T1.1..1.3, T2.1, T3.1..3.3, T4.1, T5.2, T6.1..6.2, T7.1..7.3, T8.1..8.2 directly referenced above; T0.1/T5.1 are prerequisite automated infrastructure/geometry evidence | Full task quality gates |

Coverage is complete only when every FR-001..035, AC-001..008, SC-001..008, MVP-001..018, and T0.1..T8.2 has either direct browser proof or its explicitly required automated/slicer proof. Browser proof never substitutes for topology/byte assertions, and automated proof never substitutes for executing a browser scenario.

## 9. Document review checklist

- [x] All source artifacts and current listed implementation files were read in full before authorship.
- [x] Scenario definitions precede GUI implementation and are marked immutable after approval.
- [x] Every scenario has a stable ID, trace, purpose, preconditions/data, viewport, exact actions, DOM/canvas/download assertions, console behavior, network behavior, and evidence checkpoints.
- [x] Exactly four deterministic local fixtures have reproducible recipes, byte sizes, and SHA-256 values; no dependency/source change is needed.
- [x] Empty, selection, export identity, legacy frames, split-only fit, both reset transitions, validation, retained/replaced state, failure/recovery, persistence/migration, texture/snapshot behavior, controls, keyboard, main and compact supported desktop viewports, client-only behavior, duplicate prevention, and real-browser timing are covered.
- [x] The immutable slicer table contains exactly `SLICE-001`..`SLICE-020`, with exact reproducible inputs and filenames, and T8.2/final acceptance requires an individual result for every ID.
- [x] Download proof checks count, exact filename, complete nonzero binary STL structure, and displayed Built Part association without a production test hook.
- [x] Canvas evidence defines screenshots, DOM/backing measurements, mask bounds, centering, visibility, directional views, and approved-legacy-only baselines.
- [x] Topology, triangle parity, legacy bytes, camera math, and working-image immutability are explicitly assigned to approved automated/slicer evidence rather than screenshots.
- [x] Dependency order, clean-state rules, failure preservation, affected-regression reruns, and flake handling are explicit.
- [x] No execution proof permits code inspection or worker self-report.
- [x] Execution-record rows contain all mandated fields and are the only mutable post-approval area.
- [x] Final rule is unanimous scenario PASS, complete evidence, green automated gates, and individually accepted `SLICE-001`..`SLICE-020`.
- [x] Open questions: none.

## 10. Execution record — only this section is mutable after approval

The orchestrator fills one row per scenario after implementation. Use `NOT RUN`, `PASS`, or `FAIL`; never delete prior attempts. Evidence references must be durable paths/IDs, not prose claims.

| Scenario | Status | Timestamp (ISO-8601) | App commit | Browser / OS / viewport / DPR | Screenshot evidence | DOM/canvas evidence | Download evidence | Console evidence | Network evidence | Automated/slicer evidence | Duration | Failure details | Rerun history |
|---|---|---|---|---|---|---|---|---|---|---|---:|---|---|
| SP-E2E-001 | PASS | 2026-07-20T16:37:00Z | f66bcb8 | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [full](evidence/e2e/screenshots/SP-E2E-001-empty-full.png), [canvas](evidence/e2e/screenshots/SP-E2E-001-empty-canvas.png) | Empty/default DOM and 1086×914 canvas | N/A | [run record](evidence/e2e/logs/2026-07-20-sp-e2e-002-rerun1-pass.json) | Browser connector exposes no HAR; automated client-only gates pass | 108/108 repository suite | — | — | Clean fresh-origin run |
| SP-E2E-002 | PASS | 2026-07-20T16:37:00Z | f66bcb8 | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [front](evidence/e2e/screenshots/SP-E2E-002-front-full-rerun1.png), [orbit](evidence/e2e/screenshots/SP-E2E-002-orbit-full-rerun1.png) | [front canvas](evidence/e2e/screenshots/SP-E2E-002-front-canvas-rerun1.png), [orbit canvas](evidence/e2e/screenshots/SP-E2E-002-orbit-canvas-rerun1.png) | N/A | [run record](evidence/e2e/logs/2026-07-20-sp-e2e-002-rerun1-pass.json) | Browser connector exposes no HAR; automated client-only gates pass | T2.1/T6.1/T7.1; split matrix STL files exported | — | — | Initial screenshot target failed; fresh target rerun passed |
| SP-E2E-003 | PASS | 2026-07-20T16:43:00Z | f66bcb8 | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [before](evidence/e2e/screenshots/SP-E2E-003-before-edit-full.png), [after](evidence/e2e/screenshots/SP-E2E-003-after-edit-full.png) | Canvas remained frozen across draft edits | [part3 STL](evidence/e2e/downloads/SP-E2E-003/spherical-lithophane-h2-v2-part-3-of-4.stl) | [run record](evidence/e2e/logs/2026-07-20-sp-e2e-003-pass.json) | Browser connector exposes no HAR; automated client-only gates pass | T3.1/T3.3/T6.2 | — | — | Clean dependent run after SP-E2E-002 |
| SP-E2E-004 | PASS | 2026-07-20T16:42:00Z | f66bcb8 | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [fresh](evidence/e2e/screenshots/SP-E2E-004-fresh-full.png), [repeat](evidence/e2e/screenshots/SP-E2E-004-repeat-full.png) | Fresh/repeat pixel SHA equal; legacy mask matches baseline | [legacy STL](evidence/e2e/downloads/SP-E2E-004/spherical-lithophane.stl) | [run record](evidence/e2e/logs/2026-07-20-sp-e2e-004-pass.json) | Browser connector exposes no HAR; automated client-only gates pass | T0.2/T6.2 fixture parity | — | — | Clean fresh-origin run |
| SP-E2E-005 | PASS | 2026-07-20T16:45:00Z | f66bcb8 | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [split](evidence/e2e/screenshots/SP-E2E-005-split-full.png), [legacy](evidence/e2e/screenshots/SP-E2E-005-legacy-full.png) | Final legacy frame pixel-exact to approved baseline | N/A | [run record](evidence/e2e/logs/2026-07-20-sp-e2e-005-pass.json) | Browser connector exposes no HAR; automated client-only gates pass | T7.1/T7.2 | — | — | Clean fresh-origin run |
| SP-E2E-006 | PASS | 2026-07-20T16:48:00Z | f66bcb8 | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [cleared](evidence/e2e/screenshots/SP-E2E-006-cleared-full.png), [legacy ALT](evidence/e2e/screenshots/SP-E2E-006-legacy-alt-full.png) | Clear canvas pixel-exact to empty; ALT mask matches baseline | N/A | [run record](evidence/e2e/logs/2026-07-20-sp-e2e-006-pass.json) | Browser connector exposes no HAR; automated client-only gates pass | T3.2/T7.2 | — | — | Clean fresh-origin run |
| SP-E2E-007 | PASS | 2026-07-20T16:49:00Z | f66bcb8 | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [final empty](evidence/e2e/screenshots/SP-E2E-007-final-empty-full.png) | Six literal validation cases and dynamic limits captured | N/A | [run record](evidence/e2e/logs/2026-07-20-sp-e2e-007-pass.json) | Browser connector exposes no HAR; automated client-only gates pass | T1.1/T1.3 validation suite | — | — | Clean fresh-origin run |
| SP-E2E-008 | PASS | 2026-07-20T17:06:08Z | 8f782de | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [old](evidence/e2e/SP-E2E-008/SP-E2E-008-rerun-old-full.png), [new](evidence/e2e/SP-E2E-008/SP-E2E-008-rerun-new-full.png) | Invalid canvas pixel-exact to old; Index4 differs by 98,005 pixels at threshold 12 | [old part3 STL](evidence/e2e/downloads/SP-E2E-008-rerun/spherical-lithophane-h2-v2-part-3-of-4.stl) | [pass record](evidence/e2e/logs/2026-07-21-sp-e2e-008-rerun-pass.json) | Browser connector exposes no HAR; automated client-only gates pass | All-index default regression; T3.2/T8.1 | — | — | [Index4 failure](evidence/e2e/logs/2026-07-20-sp-e2e-008-index4-failure.json) fixed by cell-local volume computation; rerun passed |
| SP-E2E-009 | PASS | 2026-07-20T17:30:00Z | 8f782de | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [error](evidence/e2e/SP-E2E-009/SP-E2E-009-error-full.png), [recovered](evidence/e2e/SP-E2E-009/SP-E2E-009-recovered-full.png) | Handled decode error; same-tab recovery reached Ready | [part3 STL](evidence/e2e/downloads/SP-E2E-009/spherical-lithophane-h2-v2-part-3-of-4.stl) | [summary](evidence/e2e/logs/2026-07-21-sp-e2e-009-017-summary.json) | Browser connector exposes no HAR; automated client-only gates pass | T6.1/T7.3/T8.1 | — | — | Clean fresh-origin run |
| SP-E2E-010 | NOT RUN | 2026-07-20T17:30:00Z | 8f782de | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [pre-reload](evidence/e2e/SP-E2E-010/SP-E2E-010-pre-reload-ready-full.png), [reload](evidence/e2e/SP-E2E-010/SP-E2E-010-reload-full.png) | Part A passed H3/V2/Index5 persistence with no volatile result restored | N/A | [summary](evidence/e2e/logs/2026-07-21-sp-e2e-009-017-summary.json) | Browser connector exposes no HAR | T1.2 automated migration passes | — | Part B old-v1 storage seed not run: browser safety policy rejects direct localStorage mutation and forbids workaround | Part A clean run passed; Part B remains tool-policy-limited |
| SP-E2E-011 | PASS | 2026-07-20T17:30:00Z | 8f782de | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [on](evidence/e2e/SP-E2E-011-rerun2/SP-E2E-011-on-full.png), [off](evidence/e2e/SP-E2E-011-rerun2/SP-E2E-011-off-full.png), [unbuilt](evidence/e2e/SP-E2E-011-rerun2/SP-E2E-011-unbuilt-edits-full.png) | On-again/unbuilt edits match within raster tolerance | [frozen part3 STL](evidence/e2e/downloads/SP-E2E-011-rerun2/spherical-lithophane-h2-v2-part-3-of-4.stl) | [summary](evidence/e2e/logs/2026-07-21-sp-e2e-009-017-summary.json) | Browser connector exposes no HAR; automated client-only gates pass | T7.2/T7.3/T6.2 | — | — | Attempt 1 damping wait insufficient; 4-second clean rerun passed |
| SP-E2E-012 | PASS | 2026-07-20T17:30:00Z | 8f782de | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [start](evidence/e2e/SP-E2E-012-rerun3/SP-E2E-012-start-full.png), [animation](evidence/e2e/SP-E2E-012-rerun3/SP-E2E-012-anim-b-full.png) | Orbit/zoom/light/animation differ; two stopped frames pixel-exact | N/A | [summary](evidence/e2e/logs/2026-07-21-sp-e2e-009-017-summary.json) | Browser connector exposes no HAR; automated client-only gates pass | T7.2/T8.2 viewer suite | — | — | Harness wheel/range semantics isolated; clean rerun 3 passed |
| SP-E2E-013 | PASS | 2026-07-20T17:30:00Z | 8f782de | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [invalid](evidence/e2e/SP-E2E-013-rerun3/SP-E2E-013-invalid-index-full.png), [export focus](evidence/e2e/SP-E2E-013-rerun3/SP-E2E-013-export-focus-full.png) | [28-entry focus order](evidence/e2e/SP-E2E-013-rerun3/SP-E2E-013-focus-order.json); 1.5 literal retained | [legacy STL](evidence/e2e/downloads/SP-E2E-013-rerun3/spherical-lithophane.stl) | [summary](evidence/e2e/logs/2026-07-21-sp-e2e-009-017-summary.json) | Browser connector exposes no HAR; automated client-only gates pass | T1.3/T8.2 | — | — | Chrome interruption isolated; clean port rerun passed |
| SP-E2E-014 | PASS | 2026-07-20T17:30:00Z | 8f782de | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [top](evidence/e2e/SP-E2E-014/SP-E2E-014-top-full.png), [bottom](evidence/e2e/SP-E2E-014/SP-E2E-014-bottom-full.png), [resized](evidence/e2e/SP-E2E-014/SP-E2E-014-after-resize-full.png) | [layout metrics](evidence/e2e/SP-E2E-014/SP-E2E-014-layout.json); canvas pixel-exact after resize round trip | N/A | [summary](evidence/e2e/logs/2026-07-21-sp-e2e-009-017-summary.json) | Browser connector exposes no HAR; automated client-only gates pass | T7.2/T8.1 | — | — | Clean fresh-origin run |
| SP-E2E-015 | PASS | 2026-07-20T17:30:00Z | 8f782de | Chrome 150.0.7871.125 / macOS 26.5.2 / 1024×768 / 1 | [ready](evidence/e2e/SP-E2E-015/SP-E2E-015-ready-full.png), [orbit](evidence/e2e/SP-E2E-015/SP-E2E-015-orbit-full.png) | [layout metrics](evidence/e2e/SP-E2E-015/SP-E2E-015-layout.json); canvas 670×682; no horizontal overflow | N/A | [summary](evidence/e2e/logs/2026-07-21-sp-e2e-009-017-summary.json) | Browser connector exposes no HAR; automated client-only gates pass | T7.2/T8.1 | — | — | Clean fresh-origin run |
| SP-E2E-016 | PASS | 2026-07-20T17:30:00Z | 8f782de | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [final](evidence/e2e/SP-E2E-016/SP-E2E-016-final-full.png) | Full control/action timeline in summary | [three exact downloads](evidence/e2e/downloads/SP-E2E-016/) | [summary](evidence/e2e/logs/2026-07-21-sp-e2e-009-017-summary.json) | Browser connector exposes no HAR; zero app-origin console entries plus automated client-only gates | T3.3/T7.3/T8.1 | — | — | Clean complete-session run |
| SP-E2E-017 | PASS | 2026-07-20T17:30:00Z | 8f782de | Chrome 150.0.7871.125 / macOS 26.5.2 / 1440×1000 / 1 | [ready](evidence/e2e/SP-E2E-017/SP-E2E-017-ready-full.png) | [generating DOM](evidence/e2e/SP-E2E-017/SP-E2E-017-generating-dom.txt), [ready DOM](evidence/e2e/SP-E2E-017/SP-E2E-017-ready-dom.txt); centered 1086×914 canvas | [part3 STL](evidence/e2e/downloads/SP-E2E-017/spherical-lithophane-h2-v2-part-3-of-4.stl) | [summary](evidence/e2e/logs/2026-07-21-sp-e2e-009-017-summary.json) | Browser connector exposes no HAR; zero app-origin console entries plus automated client-only gates | T8.1 Node preflight; 108/108 suite | 6878 ms | — | First clean performance run passed; one Generating and one Ready transition |

Common-slicer matrix execution records (definition inputs remain immutable; after implementation only these result/evidence cells may change):

| Matrix ID | Status | Timestamp (ISO-8601) | Slicer / version / OS | Export SHA-256 / bytes / triangles | Solid count | Repair action | Slicer evidence | Failure details | Rerun history |
|---|---|---|---|---|---:|---|---|---|---|
| `SLICE-001` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `65756d2821bf60fe57adeac56a7556e3a50b1d0f6cc17a0ca6c1c204bdaa4058` / 6502484 / 130048 | — | — | [STL](evidence/slicer/SLICE-001/spherical-lithophane.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Legacy 1×1 bytes/hash preserved; supplemental topology differs from split outputs |
| `SLICE-002` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `c2834332698d3a637baca1eee94812294fa2bbcf7fca092a3a6ffa012e1a3e10` / 27284 / 544 | — | — | [STL](evidence/slicer/SLICE-002/spherical-lithophane-h2-v2-part-1-of-4.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-003` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `fab3646eb63cbb025b9a97140980635072973c3adcba2609bfbdc4dd0620146d` / 33884 / 676 | — | — | [STL](evidence/slicer/SLICE-003/spherical-lithophane-h2-v2-part-2-of-4.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-004` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `42b0ff6721c6b31a67c852a6e4a4017084bfc6943933f0060665860836d11c0e` / 23684 / 472 | — | — | [STL](evidence/slicer/SLICE-004/spherical-lithophane-h2-v2-part-3-of-4.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-005` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `5d0faf49171fe4e47f2792fe3c260ae536292fdaea4adab84924cd85d189e40c` / 23684 / 472 | — | — | [STL](evidence/slicer/SLICE-005/spherical-lithophane-h2-v2-part-4-of-4.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-006` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `314f3b6aa80c41727a61b63baab6b353956e60fd4d3138666008b63007d40936` / 3084 / 60 | — | — | [STL](evidence/slicer/SLICE-006/spherical-lithophane-h3-v2-part-1-of-6.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-007` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `a3428594b8b697020abf637277d7c2b4f8164d0fb6196c06a29b2a58f851cb7b` / 4684 / 92 | — | — | [STL](evidence/slicer/SLICE-007/spherical-lithophane-h3-v2-part-2-of-6.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-008` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `c1d5c33f5d78016d1d3c12011e2bed95450e5c47eadafc180f313bcaecbf579c` / 4684 / 92 | — | — | [STL](evidence/slicer/SLICE-008/spherical-lithophane-h3-v2-part-3-of-6.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-009` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `dd7b709fcfab1d81b80de63849df32ed5e75878bc7724c0cc3692ee426cd81e3` / 1884 / 36 | — | — | [STL](evidence/slicer/SLICE-009/spherical-lithophane-h3-v2-part-4-of-6.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-010` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `5f926fc0e2e34e49c81d713278cd863014103cae29fca9374de6a430f2357b6f` / 1684 / 32 | — | — | [STL](evidence/slicer/SLICE-010/spherical-lithophane-h3-v2-part-5-of-6.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-011` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `18b88f228d0e8528d9092d2cefbac8236ef66033c24f5f52f7d93ecf4cacc9a8` / 1484 / 28 | — | — | [STL](evidence/slicer/SLICE-011/spherical-lithophane-h3-v2-part-6-of-6.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-012` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `944b446bc1607ec0293f6732fbed415daf2be6c11c64bb77ddbbaeb16af18350` / 2484 / 48 | — | — | [STL](evidence/slicer/SLICE-012/spherical-lithophane-h4-v3-part-1-of-12.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-013` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `eda74f4fe0ebfcd7bb6c6f09b1b1d7720062ab1cc65972607c8b884873dc8ce2` / 4684 / 92 | — | — | [STL](evidence/slicer/SLICE-013/spherical-lithophane-h4-v3-part-2-of-12.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-014` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `31cab905b437e8ae884f2630492b44c9184ae952e9d78b48899eb97bcb9f19b3` / 3484 / 68 | — | — | [STL](evidence/slicer/SLICE-014/spherical-lithophane-h4-v3-part-4-of-12.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-015` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `e7b03ce104ea34055ad447571bc5404f61bf6657b62f2824fb203558e9779200` / 2284 / 44 | — | — | [STL](evidence/slicer/SLICE-015/spherical-lithophane-h4-v3-part-5-of-12.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-016` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `4428b2d2628e8e8987bfd397acaecd7f6024e311f45b6c8643ae183fe8447e39` / 2284 / 44 | — | — | [STL](evidence/slicer/SLICE-016/spherical-lithophane-h4-v3-part-6-of-12.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-017` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `05d3ef198e8763baf5fc22eb941745cfadb17f946e3d7a32bc890add900ea951` / 1684 / 32 | — | — | [STL](evidence/slicer/SLICE-017/spherical-lithophane-h4-v3-part-8-of-12.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-018` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `e06d5406b0887eaad0f0c19b006679424454e3ce68352c1147eb28e30c0bdbcc` / 1484 / 28 | — | — | [STL](evidence/slicer/SLICE-018/spherical-lithophane-h4-v3-part-9-of-12.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-019` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `190a00829dd4c895ccaefbe91db5e8cb951009073d18d49a603a7911bab01afc` / 1484 / 28 | — | — | [STL](evidence/slicer/SLICE-019/spherical-lithophane-h4-v3-part-10-of-12.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |
| `SLICE-020` | NOT RUN | 2026-07-20T17:35:28Z | Manual import pending | `6e6383f6cdeba898c5d0b8e4253e2be5fd206d9dc97921fce1f278cc8818101c` / 1284 / 24 | — | — | [STL](evidence/slicer/SLICE-020/spherical-lithophane-h4-v3-part-12-of-12.stl), [manifest](evidence/slicer/matrix-preflight.json), [checklist](evidence/slicer/MANUAL-SLICER-CHECKLIST.md) | User will perform slicer import | Machine preflight: 1 component, 0 non-manifold edges, 0 degenerates, positive volume |

Baseline records (also immutable after implementation begins):

| Baseline | Legacy commit | Timestamp | Browser / OS / viewport / DPR | Fixture/hash | Screenshot/crop evidence | DOM/canvas/mask evidence | Result |
|---|---|---|---|---|---|---|---|
| BASE-DIR-FRESH | f4218ea3b95c245b2c4489197018e0283f443990 | 2026-07-20T04:33:07Z | Chrome 150.0.0.0 / macOS 26.5.2 build 25F84 / 1440x1000 / DPR 1 | FX-DIR / `directional-512x256.png` / 524652 bytes / `1ac41dba6ff0f580c49c38b42534867f65cf39d35d5fff95cc82b8c3ee315a33` | [full](evidence/baseline/BASE-DIR-FRESH-full.png), [canvas](evidence/baseline/BASE-DIR-FRESH-canvas.png), [manifest](evidence/baseline/legacy-baseline.json) | Ready; canvas 1086x914 backing store; rects and mask metrics in [manifest](evidence/baseline/legacy-baseline.json); zero error/warn/uncaught/unhandled messages | VALID |
| BASE-DIR-REPEAT | f4218ea3b95c245b2c4489197018e0283f443990 | 2026-07-20T04:33:07Z | Chrome 150.0.0.0 / macOS 26.5.2 build 25F84 / 1440x1000 / DPR 1 | FX-DIR / `directional-512x256.png` / 524652 bytes / `1ac41dba6ff0f580c49c38b42534867f65cf39d35d5fff95cc82b8c3ee315a33` | [full](evidence/baseline/BASE-DIR-REPEAT-full.png), [canvas](evidence/baseline/BASE-DIR-REPEAT-canvas.png), [manifest](evidence/baseline/legacy-baseline.json) | Ready; canvas crop/mask exactly equals DIR Fresh; centroid delta 0 px and bbox-edge deltas 0 px; DOM/rects/console in [manifest](evidence/baseline/legacy-baseline.json) | VALID |
| BASE-ALT-FRESH | f4218ea3b95c245b2c4489197018e0283f443990 | 2026-07-20T04:33:07Z | Chrome 150.0.0.0 / macOS 26.5.2 build 25F84 / 1440x1000 / DPR 1 | FX-ALT / `alternate-384x192.png` / 295192 bytes / `38ba8c89948409cf7eb77d82cd81d59b2695c8dfc58cf1b0d3a43a3c7984e11a` | [full](evidence/baseline/BASE-ALT-FRESH-full.png), [canvas](evidence/baseline/BASE-ALT-FRESH-canvas.png), [manifest](evidence/baseline/legacy-baseline.json) | Ready; canvas 1086x914 backing store; rects and mask metrics in [manifest](evidence/baseline/legacy-baseline.json); zero error/warn/uncaught/unhandled messages | VALID |

## Final acceptance rule

Accept the feature only when all 17 scenarios are `PASS`, every required browser/download/console/network/timing and cross-referenced automated evidence field is present, all repository automated gates are green, all approved legacy baselines are valid, and every immutable common-slicer row `SLICE-001`..`SLICE-020` is individually accepted as one watertight solid without repair. Any FAIL, NOT RUN, missing evidence, unexpected request/console error, timing of 30 seconds or more, automated-gate failure, missing matrix ID, or slicer repair/rejection blocks acceptance. Open questions: **none**.
