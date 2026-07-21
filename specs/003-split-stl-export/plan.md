# Implementation Plan: Spherical Lithophane Split Preview / STL Export

**Branch**: `003-split-stl-export` | **Date**: 2026-07-17 | **Spec**: [specs/003-split-stl-export/spec.md](spec.md)
**Input**: Approved feature specification from [specs/003-split-stl-export/spec.md](spec.md)

## Summary

Add three persisted split controls and make Build produce one immutable **Built Part** that owns the generated geometry, Build-time parameter/image snapshot, working texture image, summary, and export filename. Preview and STL export consume only that record, so editing any parameter after Build—including image scale, flips, and padding—cannot mutate the displayed texture, exported triangles, or filename.

The split path is a deterministic volumetric cell-complex implementation. It constructs conforming tetrahedral cells for the shell, holes, and the reviewed split-path collar / taper / tube stand in pre-rotation local space; selects the requested longitude segments; partitions stand layers at the requested latitude boundaries; extracts and validates one outward-wound boundary mesh; and only then applies the existing hole rotation. The existing `1×1 / Index 1` generator is an explicit untouched fast path, bypasses every split sample/scalar/allocation, retains the current legacy stand coordinates, and is locked by geometry and binary-STL fixtures.

## Technical Context and Baseline

**Language/Version**: TypeScript 5.9, React 19, Vite 7, Node 22
**Existing runtime dependencies**: `three`, `react`, `react-dom`; no new production dependency
**Storage**: browser `localStorage`, existing key `spherical-lithophane.settings.v1`; image and Built Part remain in memory only
**Target**: modern desktop browser, client-only, no network/API/backend
**Baseline (executed 2026-07-17)**:

- `npm run build` — PASS; existing Vite chunk-size warning only
- `npm run lint` — PASS
- Automated test command — absent from current `package.json`

**Constitution gate**: PASS. Prior plans record `.specify/memory/constitution.md` as an unfilled template; the authoritative gates for this feature are the approved spec and this pipeline.

## Scope and Ownership

### Exact implementation file list (35 files)

Modified (13):

```text
package.json
src/App.tsx
src/components/Controls.tsx
src/components/Viewer.tsx
src/domain/generate.ts
src/domain/params.ts
src/domain/preferences.ts
src/domain/state.ts
src/domain/validation.ts
src/lithophane/imageDecode.ts
src/lithophane/sphereLithophane.ts
src/three/exporter.ts
src/three/scene.ts
```

New production/configuration files (7):

```text
src/domain/builtPart.ts
src/lithophane/meshTopology.ts
src/lithophane/partSolid.ts
src/lithophane/splitCell.ts
src/lithophane/tetraClip.ts
src/three/cameraFit.ts
tsconfig.test.json
```

New test runner, fixtures, and test modules (15):

```text
tests/vite-runner.test.mjs
tests/fixtures/legacy-1x1-geometry.json
tests/fixtures/legacy-1x1-holes-stand-inward.stl
tests/fixtures/legacy-1x1-outward.stl
tests/unit/builtPart.test.ts
tests/unit/meshTopology.test.ts
tests/unit/preferences.test.ts
tests/unit/sceneFit.test.ts
tests/unit/splitCell.test.ts
tests/unit/state.test.ts
tests/unit/tetraClip.test.ts
tests/unit/validation.test.ts
tests/unit/viewer.test.ts
tests/integration/exportParity.test.ts
tests/integration/spherePartGeometry.test.ts
```

`specs/003-split-stl-export/task.md` and `specs/003-split-stl-export/e2e-test.md` are required subsequent pipeline artifacts, but are not implementation files and are not created by this plan round. No other source, spec, documentation, contract, or lockfile is in scope. In particular, no package is added, `package-lock.json` must remain unchanged, and the root `tsconfig.json` project-reference graph must remain byte-for-byte unchanged.

### Module boundaries

- `domain/params.ts`: numeric, persistable parameter contract and defaults only.
- `domain/validation.ts`: semantic validation of numeric parameters plus parsing/validation of the three raw split input strings.
- `domain/preferences.ts`: tolerant v1 payload reader/writer and field-by-field migration; never owns File, ImageData, geometry, or raw transient blanks.
- `domain/builtPart.ts`: immutable Build snapshot types, cloning, and filename derivation.
- `domain/state.ts`: editable state machine and the sole reference to the current Built Part; no geometry generation or disposal side effects.
- `domain/generate.ts`: decode once, construct the snapshot/result atomically, and return no partial result.
- `lithophane/splitCell.ts`: pure Index/range/allocation math; no Three.js or image knowledge.
- `lithophane/partSolid.ts`: build the local unrotated shell/hole/stand volumetric cell complex and emit the selected solid.
- `lithophane/tetraClip.ts`: deterministic tetra/polyhedron partitioning with provenance-preserving faces.
- `lithophane/meshTopology.ts`: boundary extraction, group assembly, and runtime solid validation.
- `lithophane/sphereLithophane.ts`: retains the exact legacy full-sphere routine and dispatches to the split routine only when the split tuple is not `1,1,1`.
- `three/cameraFit.ts` / `three/scene.ts`: pure fit calculation and scene/camera lifecycle; never changes source geometry.
- `three/exporter.ts`: serialize only the supplied Built Part geometry; never regenerates or reads live params.
- `App.tsx`, `Controls.tsx`, `Viewer.tsx`: orchestration, raw field presentation, and rendering respectively; none performs geometry math.

## Concrete Types, Symbols, and State

### Parameters and raw fields

`LithophaneParams` gains numeric fields:

```ts
horizontalSplitCount: number;
verticalSplitCount: number;
splitIndex: number;
```

All default to `1`. They remain `number`, rather than creating a second persisted model, because persistence must retain type-readable fractional/out-of-range values for normal validation after reload. UI editing uses a separate transient model:

```ts
export type SplitField =
  | 'horizontalSplitCount'
  | 'verticalSplitCount'
  | 'splitIndex';

export type SplitInputDraft = Record<SplitField, string>;

export type ParamsValidationError = {
  field: keyof LithophaneParams;
  message: string;
} | null;
```

New pure symbols:

```ts
splitDraftFromParams(params: LithophaneParams): SplitInputDraft;
applySplitDraft(
  params: LithophaneParams,
  drafts: SplitInputDraft,
  field: SplitField,
  raw: string,
): { params: LithophaneParams; drafts: SplitInputDraft; error: ParamsValidationError };
validateParams(params: LithophaneParams, splitDraft?: SplitInputDraft): ValidationResult<LithophaneParams>;
```

For a split field, the exact raw string is rendered. `raw.trim() === ''`, non-finite syntax, exponent overflow, or a non-integer produces a field error and blocks Build. A finite parsed number is copied without `Math.trunc`, rounding, or clamping into the numeric params and is then range-validated. Reducing H/V never rewrites Index. An empty/non-finite transient draft leaves the last coherent numeric value in `params`, but the raw-field error is authoritative. Finite fractional/out-of-range numbers remain numeric and persist so reload shows the same normal validation error; empty/non-finite transient strings do not overwrite persistence. Existing non-split inputs keep their current numeric model; the new split inputs do not use `numberOr`/`intOr`.

### Split cell

```ts
export type SegmentRange = {
  start: number; // inclusive, zero-based segment index
  end: number;   // exclusive
  count: number;
};

export type SplitCell = {
  row: number;             // 1-based, south to north
  column: number;          // 1-based, splitU=0 to 1
  index: number;           // 1-based row-major
  horizontalCount: number;
  verticalCount: number;
  uSegments: SegmentRange;
  vSegments: SegmentRange;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
};

allocateSegmentRange(total: number, parts: number, ordinal: number): SegmentRange;
resolveSplitCell(params: LithophaneParams): SplitCell;
```

### Built Part and app state

```ts
export type BuiltPartSnapshot = Readonly<{
  params: Readonly<LithophaneParams>;
  source: Readonly<{
    file: File;
    name: string;
    size: number;
    type: string;
    lastModified: number;
  }>;
}>;

export type BuiltPart = Readonly<{
  geometry: THREE.BufferGeometry;
  summary: GenerationSummary;
  workingImage: ImageData;
  snapshot: BuiltPartSnapshot;
  fileName: string;
}>;

createBuildSnapshot(file: File, params: LithophaneParams): BuiltPartSnapshot;
deriveStlFileName(params: Readonly<LithophaneParams>): string;
```

`createBuildSnapshot` shallow-copies every primitive param and freezes the copied objects. `workingImage` is the exact decoded/transformed image used for relief sampling and remains owned by the Built Part; `Readonly` does not make its `Uint8ClampedArray` immutable, so every consumer treats both the `ImageData` object and `workingImage.data` as read-only by contract. Viewer never reopens the File and never writes into that object or buffer: it allocates a distinct grayscale pixel buffer and canvas as described below. `fileName` is computed once from the copied params. UI-only `showTexture`, light, and animation settings are intentionally outside the snapshot because toggling them does not alter generated content.

The state union becomes:

```ts
type CommonState = {
  file: File | null;
  params: LithophaneParams;
  splitDraft: SplitInputDraft;
  paramsError: ParamsValidationError;
  builtPart: BuiltPart | null;
  errorMessage: string | null;
};

type AppState =
  | (CommonState & { status: 'idle'; file: null; builtPart: null })
  | (CommonState & { status: 'imageLoaded'; file: File; builtPart: null })
  | (CommonState & { status: 'generating'; file: File; builtPart: null })
  | (CommonState & { status: 'ready'; file: File; builtPart: BuiltPart })
  | (CommonState & { status: 'error'; builtPart: null; errorMessage: string });
```

Actions are `select_file`, `set_params`, `set_split_input`, `start_generate`, `generation_success { builtPart }`, `generation_error`, and `reset`. A valid Build captures `{file, params}` before dispatch, then `start_generate` clears the previous Built Part immediately. Parameter edits in `ready` retain the Built Part and therefore retain Preview/Export. `select_file` increments the run token and clears it immediately. Failure leaves `builtPart: null`; ignored stale success results are disposed immediately.

App owns disposal of Built Part source geometry through an effect cleanup keyed by `state.builtPart`. Viewer owns and disposes only its cloned geometry, grayscale texture handle/canvas, and materials; it never owns or disposes the Built Part working image. Reducer functions remain pure.

## Exact Split Mapping and Data Flow

For `W=widthSegments`, `T=heightSegments`, `H=horizontalSplitCount`, `V=verticalSplitCount`, and 1-based `index`:

```text
r = floor((index - 1) / H) + 1
c = ((index - 1) mod H) + 1

qW = floor(W / H), remW = W mod H
countW(c) = qW + (c <= remW ? 1 : 0)
startW(c) = (c - 1) * qW + min(c - 1, remW)
endW(c) = startW(c) + countW(c)

qT = floor(T / V), remT = T mod V
countT(r) = qT + (r <= remT ? 1 : 0)
startT(r) = (r - 1) * qT + min(r - 1, remT)
endT(r) = startT(r) + countT(r)

uMin = startW(c) / W; uMax = endW(c) / W
vMin = startT(r) / T; vMax = endT(r) / T
```

Rows are south-to-north and columns follow increasing local `splitU`. Thus `10×5 / 3×2` yields columns `4/3/3`, rows `3/2`, with `index=(r-1)*H+c`. A local normalized direction uses exactly:

```text
theta = acos(clamp(y, -1, 1))
phi = atan2(z, -x); if phi < 0, phi += 2*pi
splitU = 1 - phi/(2*pi)
splitV = 1 - theta/pi
```

The split seam is `-X`; increasing U is `-X -> -Z -> +X -> +Z -> -X`. Split ranges are computed from integer segment boundaries, never from rounded UV comparisons. Image UV remains separately computed from the final rotated direction.

Build data flow:

```text
raw edits -> exact raw validation -> numeric editable params + persistence
Build -> frozen File/params snapshot -> one working ImageData decode
      -> 1×1 legacy generator OR selected local volumetric solid
      -> rotate complete selected solid -> topology validation
      -> atomic BuiltPart(geometry, workingImage, snapshot, filename)
      -> Viewer clone + texture from copied BuiltPart image bytes / Export same source geometry
```

No edit-side value is read after snapshot capture. No Preview texture effect depends on live `state.params` or the current File.

## Deterministic Geometry Algorithm

### 1. Legacy compatibility gate

`generateSphereLithophane` first checks the copied tuple. For exactly `H===1 && V===1 && splitIndex===1`, it calls the existing full-model implementation before allocation, canonical sampling, all-W scalar reduction, clipping, or any other split work. That implementation’s current stand coordinates, vertex emission order, `Float32Array` values, index constructor, index order, groups, normal computation, and rotation order stay unchanged. `exportGeometryToStlBlob` also keeps its current binary serialization path. The two checked-in STL fixtures and the geometry manifest (attribute byte hashes, index bytes/type, groups, counts) are captured from the pre-feature baseline and must compare byte-for-byte. No topology welding, sorting, validation rewrite, geometry transform, or split auto-fit is allowed on this path. The Viewer performs only the transition-specific legacy camera reset defined below when the preceding displayed part was split; a fresh or repeated legacy 1×1 path performs no camera reset or fit.

### 2. Canonical local volumetric cell complex

The split path does not clip an already flattened surface mesh. `partSolid.ts` reproduces the existing sampling and radius formulas in Float64 working vertices and builds a conforming volume complex before rotation:

- Each retained `(uSegment, vSegment)` sphere quad becomes two prisms between its actual sampled inner and outer triangles. Each prism is divided by a fixed global diagonal into three positively oriented tetrahedra. The north/south pole bands use one welded pole per radius and explicit wedge tetrahedra; duplicated SphereGeometry pole/seam indices are not treated as different coordinates.
- A hole removes complete latitude cells using the existing `makeBottomHoleCut`/`makeTopHoleCut` ring-row rules. The exposed radial end of the shell is already a boundary face of the last retained shell volume; no disk is added, so the opening remains open.
- For the bottom cut ring set `R=radiusMm`, validated `W=widthSegments>=8`, `T=heightSegments`, `g=bottomHole.ringVGrid`, `theta=pi*(1-g/T)`, `s=sin(theta)>0`, `y0=cos(theta)`, `delta=2*pi/W`, and `halfDelta=delta/2`. `e_k` is the canonical unit X/Z radial direction, `d_k=(s*e_k.x,y0,s*e_k.z)`, and `tau_k>0` is the actual sampled cut-ring thickness. Preserve shell vertices exactly: outward `I_k=R*d_k`, `O_k=(R+tau_k)*d_k`; inward `I_k=(R-tau_k)*d_k`, `O_k=R*d_k`. Both directions use the same topology.
- Clamp `w=clamp(standWallThicknessMm,0,2R)` and `h=clamp(holeDiameterMm*.25,3,12)`. If `w===0`, emit no split-path collar, taper, or tube: preserve the exact shell hole rim and open lumen without changing global validation. If `w>0`, sample every required `tau_k` from frozen Build data; any nonfinite or non-positive sample fails the Build recoverably. Reduce all `W` samples in canonical order to `tauMin=min_k tau_k`, `j=min(h,tauMin)`, and `YcutMin=min_k(min(I_k.y,O_k.y))`.
- For sector `k`, define `m_k=(e_k+e_(k+1))/(2*cos(halfDelta))` and `L_k(p)=s*cos(halfDelta)*p.y-y0*dot(m_k,p.xz)`. Retained shell is `L_k>=0`; exterior below the cut is `L_k<0`. Since `s>0` and `cos(halfDelta)>0`, a `-Y` displacement from either cut-ring endpoint is strictly negative. Therefore the vertical collar is strictly exterior in every bottom-cut sector, including equator and slightly-north ring quantization.
- Set `q=R*s`, `qCritical=(y0<0 ? q+w : q)`, `Yradial=y0*qCritical/s`, `Yc=YcutMin-j`, `Ys=min(Yc,Yradial)-j`, and `Yb=Ys-h`. `Yradial` covers every stand radius `q..q+w`; these all-W Float64 scalars are computed in the same canonical order for each independent column Build and must satisfy strict `YcutMin>Yc>Ys>Yb`.
- Define collar `CI_k=(I_k.x,Yc,I_k.z)`, `CO_k=(O_k.x,Yc,O_k.z)`; stand top `SI_k=(q*e_k.x,Ys,q*e_k.z)`, `SO_k=((q+w)*e_k.x,Ys,(q+w)*e_k.z)`; and bottom `BI_k=(q*e_k.x,Yb,q*e_k.z)`, `BO_k=((q+w)*e_k.x,Yb,(q+w)*e_k.z)`. Shell, collar-inner/outer, stand-top-inner/outer, and stand-bottom-inner/outer use canonical modulo-`W` IDs.
- Each U sector contains three interior-disjoint annular layers: collar `I/O -> CI/CO`, taper `CI/CO -> SI/SO`, and tube `SI/SO -> BI/BO`. The exact named interfaces are shell/collar `I-O`, collar/taper `CI-CO`, and taper/tube `SI-SO`; both incident layers use the same IDs and global face diagonals, so every interface triangle occurs exactly twice with opposite directed winding. Layer interiors have positive heights. In the taper, material width is `(1-lambda)*s*tau+lambda*w>0`, supporting `w` below, equal to, or above projected shell relief, including `w=2R`.
- Triangulate every annular U sector as `(inner_k,inner_(k+1),outer_(k+1))` and `(inner_k,outer_(k+1),outer_k)`. Corresponding triangles on adjacent layer rings form prisms split by one fixed 3-tetra staircase. Do not swap tetra vertices after construction: every prescribed raw determinant must be positive or generation stops for replan. Per-cell tetra volume sum must equal its oriented boundary volume, and cells must not overlap.
- Angular sectors meet only at canonical U faces. The lumen follows `I -> CI -> SI -> BI` and remains open; only the `BI/BO` annulus closes the bottom. No disk/cap, `O==IT` special case, coordinate-tolerance identity, or welding is permitted.
- Original complex faces carry provenance `outer`, `inner`, or `wall`. Only sampled outer-shell faces carry image UVs and material `0`; inner faces use material `1`; hole rims, stand, and future split faces use material `2` with neutral UV `(0,0)`.
- Canonical vertex IDs are `(surface/ring kind, u grid index modulo W, v grid index, radial layer)`. The `u=0` and `u=W` seam is welded by ID. All computations use Float64 until final BufferAttributes.

This construction makes holes and stand part of one conforming volume, rather than copying the legacy overlapping/nonconforming internal stand join. The split correction intentionally changes only that previously nonexistent split-generation join: it preserves the sphere cut ring, lumen radius, wall thickness, derived stand height, local hole rotation, and image/thickness formulas, while the exact public 1×1 remains entirely legacy.

Replan record: the first Phase 4 diagnostic independently proved that, in outward mode, the sampled `O` ring lies below the legacy base-sphere top plane. The legacy triangular transition volume and annular tube occupy the same side of their claimed face; positive tetrahedra have identical directed winding (24 transition/tube and 24 shell/transition conflicts in the 12×8 case), while reversing winding makes negative volume. The first replan then introduced distinct `IT/OT`, `O==IT` degeneration, and `globalTopMin`; that construction was also disproved because its mode-specific coincidence and varying top do not establish one topology with strict exterior placement, prescribed raw-positive determinants, and three exact cancellable interfaces across outward/inward, brightness variation, south/equator/north cuts, and the complete wall-width range. Phase 4 remains incomplete. The reviewed collar / taper / tube construction above is the required second replan and does not change the public legacy route.

### 3. Face ownership and selected-cell partition

Each tetra carries its source `uSegment`. A column owns exactly `startW <= uSegment < endW`; there is no coordinate classification at U and therefore no seam ambiguity, missing sector, duplicate sector, or reflex-wedge problem. With `H=1`, no U split face exists.

Sphere-shell tetrahedra carry their source `vSegment` and are owned by exactly `startT <= vSegment < endT`. At an exact row boundary the integer half-open rule assigns volume once; both neighboring outputs independently expose the same boundary vertices/faces as their split walls. With `V=1`, no V split face exists.

Collar, taper, and tube tetrahedra are not assigned wholesale to the southern row. For the requested `vMin/vMax`, each original stand vertex `p=(x,y,z)` receives the two homogeneous cone scalars:

```text
theta(b) = pi * (1 - b)
g_b(p) = y - length(p) * cos(theta(b))
inside lower boundary: g_vMin(p) >= 0
inside upper boundary: g_vMax(p) <= 0
```

Within each original tetra, each scalar is linearly interpolated from the original vertex values. `tetraClip.ts` applies the lower then upper inequality with a fixed Sutherland-Hodgman face order. An intersected canonical edge uses `t=gA/(gA-gB)` in Float64 and an edge key `(minVertexId,maxVertexId,boundaryNumerator,boundaryDenominator)`; that exact key supplies the same cut vertex to all incident tetrahedra and, when a neighboring row is built later, recomputes the same Float32 coordinate. A zero scalar is on-boundary and retained by both closed halfspaces, but zero-volume cells/faces are removed; volume ownership remains half-open through the source-cell/clip-side tag.

Consequently collar, taper, and tube volume is partitioned among every vertical row it geometrically intersects. The per-tetra piecewise-linear cone partitions cover the original tetra exactly, so rows have neither duplicated positive volume nor gaps. The top-hole rim is part of the shell volume and follows its integer V-segment owner; if a row boundary coincides with its ring it becomes a shared, matching split-wall edge and no cap crosses the opening. This is the explicit stand/top-hole vertical assignment rule.

### 4. Polyhedron tetrahedralization and boundary extraction

Each clipped convex polyhedron retains ordered faces and face provenance. New clipping caps are tagged `splitWall(boundaryId)`. A face polygon is normalized by removing consecutive duplicate IDs and collinear triples, then triangulated as a fan from the lexicographically smallest canonical vertex ID after orienting it away from the polyhedron centroid. The polyhedron is filled by tetrahedra from one deterministic centroid vertex with a prescribed orientation; a non-positive raw determinant fails generation and is never repaired by silently swapping vertices.

Boundary extraction emits the four oriented faces of every positive-volume tetra. The undirected face key is its three sorted canonical vertex IDs:

- count `2` with opposite directed order: internal face, cancel both;
- count `1`: selected-solid boundary, retain its inherited provenance/winding;
- count `>2`, or count `2` with equal winding/provenance conflict: generation failure.

Because adjacent source tetrahedra share edge IDs and use the same global diagonal, their subdivided interface triangles cancel exactly. This includes shell/collar `I-O`, collar/taper `CI-CO`, and taper/tube `SI-SO`; Phase 5 treats a same-directed, missing, or multiply-owned triangle at any named interface as a provenance failure, never as a face to retain, flip, or weld. A cut face survives as material group `2`. Retained triangles are output deterministically in group order `outer`, `inner`, `wall`, then source cell key, boundary ID, and canonical vertex IDs. Vertices are compacted in first-use order. This gives stable results without coordinate-tolerance face matching.

### 5. Winding, UVs, degenerates, rotation, and solid validation

- Original outer faces point away from material volume; inner faces point into the lumen; hole/stand/split walls point away from material volume. The positive-tetra convention determines this mechanically rather than by per-feature guesses.
- Attributes on an original exterior face interpolate its existing final-direction image UV. A cut vertex interpolates endpoint UV with the same `t`; only material `0` is textured, so split/stand/rim UVs cannot stretch the image.
- Canonical stand construction uses the prescribed collar / taper / tube topology without identity collapse or tolerance welding. Later clipping/output validation may reject numerically degenerate tetrahedra or triangles using the scale-aware gate below, but may not use that gate to repair interface identity. Let `L=max(1,maxAbsCoordinate)` in millimeters: reject/remove a clipped tetra when `abs(signedVolume6) <= (L*1e-10)^3` and a triangle when `length(cross(b-a,c-a)) <= (L*1e-10)^2`; removal that leaves an unmatched edge is a failure.
- After the local selected solid is fully closed, apply exactly `R=Ry((holeLongitude/100)*2*pi) * Rx((holeLatitude/100)*pi)` to every position. Relief and UV sampling use `dFinal=R*dLocal` before the transform, preserving current final image orientation. Outward uses `innerR=radius`, `outerR=radius+thickness`; inward uses `innerR=radius-thickness`, `outerR=radius`.
- Convert positions/UVs to Float32 and indices to Uint16/Uint32 by final vertex count; compute normals once and create the existing three material groups.

`validateClosedSolid` runs before publication on the emitted Float32 geometry:

1. every finite triangle has nonzero area;
2. exact Float32 position-bit welding gives every undirected edge exactly two incidents with opposite direction;
3. triangle adjacency through edges has exactly one connected component;
4. signed volume is finite and greater than `(L*1e-8)^3` with outward sign;
5. a deterministic longest-axis AABB tree tests non-adjacent triangle pairs for proper/coplanar intersection. For topological neighbors, only the exact shared edge or shared vertex locus is permitted; overlap or crossing beyond that locus fails.

An empty cell, multiple components, open/non-manifold edge, self-intersection, non-positive volume, or allocation failure throws a recoverable `GENERATION_FAILED` message asking the user to change Split Index or hole settings. The result is never attached to state until all checks pass. Tests additionally parse exported STL and repeat manifold/connectivity/volume checks with the required `0.00001 mm` boundary comparison.

## Preview, Export, Persistence, and Cleanup

### Preview and texture snapshot

`Viewer` accepts `builtPart: BuiltPart | null` rather than live File/transform props and clones `builtPart.geometry` once. Changing H/V/Index, dimensions, holes, thickness, `imageScale`, flips, or padding cannot trigger either the geometry or texture effect. Texture creation uses a Viewer-owned `createGrayscaleTextureHandle(source: ImageData)` symbol. It first performs `grayBytes = new Uint8ClampedArray(source.data)`, creates a separate `ImageData`/canvas from `grayBytes`, and applies grayscale/opaque-alpha writes only to `grayBytes`; it never assigns through `source.data`, passes the source buffer to a mutating API, or reuses its `ArrayBuffer`. The returned handle owns the `CanvasTexture` and canvas, while the Built Part continues to own the unchanged working image. `showTexture` calls only the handle's attach/detach operations against material group `0`; groups `1/2` remain untextured and no toggle allocates, decodes, or converts again.

Camera behavior has two explicit Viewer states, `legacy` and `split-fitted`, stored in a ref that is not cleared when a Build temporarily supplies `builtPart: null`. `SceneHandle.setMesh(mesh)` keeps its existing add/remove-only behavior. `SceneHandle` adds `fitCameraToBounds(bounds)` and `resetLegacyCameraFrame()`; the former delegates to the pure `cameraFit.ts` calculation, while the latter restores exactly camera position `(0,0,180)`, `OrbitControls.target=(0,0,0)`, `near=0.1`, `far=10000`, `zoom=1`, `minDistance=0`, and `maxDistance=Infinity`, then reapplies the default look-at/projection/control update without changing the mesh.

For an exact `H===1 && V===1 && splitIndex===1` Built Part, Viewer always calls the existing `setMesh(mesh)` then `resize()` path and never calls `fitCameraToBounds`. If the Viewer state is already `legacy`—including a fresh/default 1×1 Build or a later 1×1 replacement—nothing resets the camera, preserving untouched legacy framing and the user's ordinary 1×1 orbit/zoom state. Only when the retained state is `split-fitted` does the 1×1 path additionally call `resetLegacyCameraFrame()` after `setMesh` and before `resize`, then mark the state `legacy`; this covers split -> Build-clear/null -> 1×1 and new-image-clear/null -> 1×1 transitions so the full sphere cannot inherit an off-center split target. For every non-legacy tuple, Viewer calls `setMesh(mesh)`, `resize()`, then `fitCameraToBounds` on the cloned geometry and marks the state `split-fitted`. The fit sets the target to the selected bounds center, preserves the current normalized view direction (fallback `+Z`), and chooses distance from both vertical and horizontal half-FOV with a `1.2` margin; it updates near/far and control distance limits without translating/scaling geometry and does not rerun on resize, null clearing, or live edits.

On replacement/unmount: App disposes the previous source geometry and releases the Built Part/working-image reference; Viewer removes the mesh, disposes its clone, detaches the outer material map, disposes the texture exactly once, sets the owned canvas width/height to zero to release its backing store, drops the temporary grayscale buffer/canvas/handle references, and disposes all three materials. The Built Part working-image bytes are never cleared or repurposed. Decoded `ImageBitmap` is closed in `imageDecode`; scene cleanup removes listeners/observer, cancels RAF, disposes controls/renderer, and clears mesh references. Stale async results dispose their geometry immediately. Object URLs keep their existing `finally` revocation.

### Export and filename

`handleExport` requires `state.builtPart` and `status==='ready'`, passes exactly `builtPart.geometry` to the binary exporter, and passes exactly `builtPart.fileName` to `downloadBlob`. It never calls generation or reads `state.params`/drafts.

```text
if H=1 and V=1 and index=1:
  spherical-lithophane.stl
else:
  spherical-lithophane-h{H}-v{V}-part-{index}-of-{H*V}.stl
```

H, V, and Index are taken only from the frozen Build snapshot. Invalid unbuilt edits may disable Build but do not disable Export while the prior Built Part remains displayed. Starting a valid Build or selecting a new image clears Preview and disables Export; Build failure keeps it disabled.

### Persistence migration

Keep storage key and envelope version at v1 to avoid discarding existing settings. `readParams` reads all old fields as today and adds each split field independently:

- missing, non-number, `NaN`, or infinite -> that field’s default `1`;
- finite number, including fractional or out-of-range -> preserve exactly, then normal validation displays the error without correction;
- valid existing settings remain unchanged.

The current `intFrom` truncation is not used for split fields. Saving writes the three numeric split values with the existing settings only after their raw drafts are parseable; transient empty/non-finite drafts do not overwrite the last persisted value. Corrupt JSON still returns defaults without preventing startup. File, working image, Built Part, and export readiness are never serialized, so reload always starts `idle` with an empty Preview.

## TDD and Verification Architecture

No dependency is indispensable. `package.json` adds scripts but no package entries:

```json
"test": "node --test tests/vite-runner.test.mjs",
"test:typecheck": "tsc -p tsconfig.test.json --noEmit"
```

`tests/vite-runner.test.mjs` uses Node’s built-in `node:test` and the already-installed Vite programmatic API. It starts one middleware-mode Vite server, discovers the eleven sorted `*.test.ts` modules, loads each with `server.ssrLoadModule`, calls its exported `registerTests(t)` to create subtests, and closes the server in `finally`. Tests use `node:assert/strict`; browser globals are minimal local fakes, not a DOM package.

`tsconfig.test.json` is a standalone, non-build test project: it extends `tsconfig.app.json` only to inherit the production compiler options, overrides `types` to `["vite/client", "node"]`, keeps `noEmit: true`, and replaces `include` with `["src", "tests/**/*.ts"]`. It declares neither `composite` nor `references`, and the unchanged root `tsconfig.json` does not reference it. Therefore the existing `npm run build` keeps running `tsc -b` only for the production app/node project graph, while `npm run test:typecheck` is the mandatory and sole test-TypeScript gate through `tsc -p tsconfig.test.json --noEmit`; both commands must pass independently.

Eleven test modules and their mandatory red-first scope:

1. `splitCell.test.ts`: row-major mapping, exact U/V ranges, `10×5/3×2`, `11×7/4×3`, at least three more non-divisible grids, one-segment cells, seam/poles.
2. `validation.test.ts`: blank, 0, negative, decimal, NaN/infinity syntax, dynamic segment bounds, Index overflow, and no truncation/clamp.
3. `preferences.test.ts`: valid 3×2/5 round trip, old v1 missing fields, per-field bad types/non-finite fallback, finite invalid preservation, corrupt JSON, no File/geometry serialization.
4. `state.test.ts`: Build snapshot lifecycle, unbuilt edit retention, valid Build/new File clearing, failure/export state, stale-result contract.
5. `builtPart.test.ts`: deep copied params/source metadata, transform edit isolation, both exact filename forms.
6. `tetraClip.test.ts`: shared edge intersection IDs/coordinates, half-open volume ownership, face triangulation, cone boundary contact, degenerate rejection.
7. `meshTopology.test.ts`: closed tetra/annulus acceptance and open, duplicate, same-winding, non-manifold, disconnected, zero-volume, self-intersecting rejection.
8. `spherePartGeometry.test.ts`: all parts for 2×2, 3×2, 4×3; outward/inward and brightness-varying `O`; south/equator/north bottom cuts; `w=0`, below/equal/above relief, and `w=2R`; minimum `W` and one-segment columns; exact three-interface cancellation; all-W canonical-order Float64/Float32 cross-Build equality; prescribed raw-positive determinants; per-cell tetra/oriented-boundary volume equality; non-overlap; open lumen/annular bottom; zero sampled thickness fail-closed; rotated holes; seam/poles; shared boundary equality; empty/non-connected failure; texture UV orientation; exact legacy parity.
9. `sceneFit.test.ts`: centered/full and off-center/small bounds, aspect/FOV distance, near/far, stable target and finite fallback; exact legacy reset position/target/near/far/zoom/control limits.
10. `viewer.test.ts`: fresh and repeated 1×1 use only legacy `setMesh`/resize with no fit/reset; split parts fit; split -> null -> 1×1 resets once to the exact legacy frame. It snapshots both SHA-256 and exact bytes of `builtPart.workingImage.data` before texture creation and asserts both remain identical after grayscale creation, detach/attach toggles, replacement, and unmount/dispose; it also proves the grayscale buffer/ArrayBuffer is distinct, only the copy becomes grayscale, texture disposal occurs exactly once, the canvas backing store is zeroed, and handle references are released.
11. `exportParity.test.ts`: Preview source triangle set equals binary STL triangle set/order/winding; no foreign part triangles; Build-snapshot filename; both legacy STL files byte-for-byte.

Legacy fixture capture is a one-time Phase 0 operation performed before production edits from two deterministic synthetic ImageData cases: default outward/no holes and inward/top+bottom holes+stand+nonzero rotation. Store binary STL bytes directly and a JSON manifest containing SHA-256 of position, UV, normal, index buffers, index constructor, groups, vertex/triangle counts. Tests never rewrite fixtures; an intentional baseline change requires stop/replan and explicit approval.

Planned commands, in order. The runner reads `TEST_MODULE` for the focused red/green cycle:

```sh
TEST_MODULE=splitCell npm test
npm test
npm run test:typecheck
npm run lint
npm run build
```

### Browser E2E scope (specified before GUI implementation)

`e2e-test.md` must give stable scenario IDs for: 2×2 Index 3 directional Preview; fresh/default 1×1 parity whose projected bounds/reference image match the untouched legacy frame; split-part auto-fit with the selected part centered and fully visible inside the `1.2`-margin framing; split -> Build-clear -> 1×1 and split -> new-image-clear -> 1×1 transitions whose full-sphere projected center/bounds match the fresh legacy 1×1 baseline rather than the prior off-center target; unbuilt Index and image-transform edits preserving geometry/texture/export filename; next Build and new-image clearing; fractional/blank/dynamic-range errors with nearby messages and no auto-correction; 3×2/5 persistence and old-payload migration; orbit/zoom/light/animation; grayscale toggle affecting only outer surface; generating/failure/export-disabled states; and client-only operation with no unexpected network request, console error, leaked object URL, or duplicate Build. Each scenario records viewport, fixture, exact actions/assertions, console/network expectations, and screenshot/DOM evidence. After implementation, every approved scenario is executed through Chrome DevTools MCP; inspection or unit tests cannot replace that gate.

## Phased Implementation Order (9 reviewable commits)

Implementation is TDD in every phase: add the specified failing focused test, observe the expected failure, implement only that phase, run focused/full gates, then review. Each phase is a separate commit made only by the orchestrator after review; the worker never commits.

### Phase 0 — Test harness and immutable legacy fixtures

Files: test scripts/config, runner, legacy fixtures, initial legacy assertions.

Completion: dependency-free runner works; standalone `npm run test:typecheck` passes without adding a root project reference or changing root `tsconfig.json`; fixtures are captured before source edits; existing legacy generator and STL pass byte checks; the separate production `npm run build` and lint gates pass.

Stop/replan: Vite SSR cannot execute source modules deterministically, fixture bytes differ between two clean captures, or adding a dependency appears necessary.

### Phase 1 — Split parameters, raw validation, and migration

Files: `params.ts`, `validation.ts`, `preferences.ts`, `Controls.tsx`, validation/preferences tests.

Completion: three exact labels/defaults; raw blank/fractional/range behavior; dynamic limits; no truncation/clamp; v1 migration and reload semantics pass.

Stop/replan: browser number input prevents preserving the raw string, old valid settings are lost, or a storage envelope version change becomes necessary.

### Phase 2 — Pure cell allocation and ordering

Files: `splitCell.ts`, `splitCell.test.ts`.

Completion: every allocation fixture, seam/pole mapping, one-segment cells, and five non-divisible grids pass with every segment owned exactly once.

Stop/replan: any formula conflicts with the approved spec; do not compensate in geometry code.

### Phase 3 — Built Part state, snapshot, and filename

Files: `builtPart.ts`, `state.ts`, `generate.ts`, `App.tsx`, `exporter.ts`, state/builtPart tests.

Completion: live edits cannot affect Built Part; start/new File/failure transitions are exact; stale geometry is disposed; export uses Built Part geometry and name only.

Stop/replan: reducer needs side effects, snapshot retains mutable params, or current UI cannot distinguish editable and built state.

### Phase 4 — Canonical local volume complex

Files: `partSolid.ts`, minimal routing in `sphereLithophane.ts`, geometry tests.

Completion: the unsplit split-path diagnostic complex (not the public 1×1 route) preserves sampled `I/O`, computes all-W `tauMin`, `YcutMin`, `Yc`, `Ys`, `Yb`, and builds the three disjoint collar / taper / tube layers. The exact `I-O`, `CI-CO`, and `SI-SO` interfaces cancel twice/opposite; every prescribed raw determinant is positive; per-cell tetra volume equals oriented boundary volume; cells do not overlap; `w===0` emits no stand; the lumen stays open with only an annular bottom; and public legacy fixtures remain byte-identical.

Stop/replan: any required scalar is invalid/nonfinite; `s==0`, `cos(halfDelta)<=0`, or a pole join occurs; stand-enabled `tauMin<=0`; `YcutMin>Yc>Ys>Yb` is not strict; any prescribed raw determinant is non-positive; per-cell tetra and oriented-boundary volumes mismatch; a named interface is not exactly twice/opposite; independent Builds differ in Float64 or Float32; extreme `w` collapses after Float32; intersection, lumen cap, or multiple components appear; or legacy bytes change. The legacy-overlap contradiction and the subsequently disproved `IT/OT + globalTopMin` replan are the reasons for this second replan and do not complete Phase 4.

### Phase 5 — Cell partition, extraction, and runtime topology gate

Files: `tetraClip.ts`, `meshTopology.ts`, clipping/topology tests.

Completion: deterministic U ownership and V cone partition; matching shared boundaries; exact cancellation of the owned `I-O`, `CI-CO`, and `SI-SO` interfaces; prescribed winding/groups/UVs; volume/non-overlap proof; all invalid topology fixtures rejected before publication.

Stop/replan: invalid/nonfinite scalar; `s==0`, `cos(halfDelta)<=0`, or pole join; enabled `tauMin<=0`; non-strict Y ordering; non-positive prescribed determinant; volume mismatch; any named interface not exactly twice/opposite; cross-Build Float64/Float32 mismatch; Float32 collapse at extreme `w`; intersection/lumen cap/multiple components; self-intersection validation exceeds budget; or legacy byte change.

### Phase 6 — Full generator integration and geometry matrix

Files: `sphereLithophane.ts`, `generate.ts`, `imageDecode.ts`, geometry/export integration tests and fixtures.

Completion: all representative 2×2/3×2/4×3 parts, the full direction/brightness/cut-latitude/wall-width matrix, 20-part slicer matrix, non-divisible grids, minimum `W`, one-segment columns, seam/poles, texture UV, all-W scalar/ring cross-Build equality, STL parity, recoverable fail-closed errors, and 1×1 fixtures pass.

Stop/replan: invalid/nonfinite scalar; `s==0`/`cos(halfDelta)<=0`/pole join; enabled `tauMin<=0`; non-strict Y ordering; non-positive prescribed determinant; volume mismatch; named-interface cancellation or cross-Build equality failure; Float32 collapse at extreme `w`; all-part gap/overlap, non-adjacent intersection, lumen cap, or multiple components; or legacy bytes change.

### Phase 7 — Snapshot Preview, split-only auto-fit, and cleanup

Files: `Viewer.tsx`, `cameraFit.ts`, `scene.ts`, `App.tsx`, scene/viewer/state tests.

Completion: texture comes only from a distinct grayscale copy of the Built Part working image; source hash/bytes remain identical through create/toggle/replacement/unmount; only outer group is textured; only split parts auto-fit; fresh/repeated 1×1 retains the untouched legacy path and split -> null -> 1×1 restores the exact legacy frame; controls remain usable; all geometry/texture/canvas/material/bitmap/RAF/listener resources have one owner and cleanup path.

Stop/replan: camera fit runs for a 1×1 Built Part or mutates source geometry, a split-fitted target survives return to 1×1, any operation changes `workingImage.data`, toggling texture decodes/converts again, or replacement/unmount leaks GPU/canvas/bitmap resources.

### Phase 8 — UI integration, full quality gates, and browser acceptance

Files: remaining listed UI/orchestration files only; no new scope.

Completion: all eleven modules pass; the standalone `npm run test:typecheck` test-type gate, lint, and the separate production `npm run build` gate pass; default 256×128 with 4096×2048 fixture meets 30 seconds on the acceptance machine; every approved E2E scenario—including fresh 1×1 legacy framing, split-only auto-fit, and both split-to-1×1 reset transitions—passes in Chrome DevTools MCP with recorded evidence; common slicer accepts the specified STL matrix without repair.

Stop/replan: any approved E2E fails, console/network contract is violated, slicer repairs a model, memory pressure publishes a partial result, or performance exceeds 30 seconds. Optimization may change storage/traversal only, never ownership, coordinates, winding, or legacy order.

## Error Handling, Performance, Compatibility, and Constraints

- Geometry work is synchronous after decode in the first implementation to preserve one atomic run; Build is disabled and status is visible. A worker is not introduced in MVP because it would add serialization/cancellation architecture not required by the spec. If the 30-second/UI responsiveness gate fails, stop and plan a worker as a separate reviewed change.
- Peak risk is Float64 tetra/polyhedron expansion plus Float32 output. Generate volume only for source U sectors and V bands that can intersect the selected cell; the required all-W pass samples only the canonical cut-ring values needed for `tau_k`, `tauMin`, `YcutMin`, `Yc`, `Ys`, `Yb` and canonical collar/stand/bottom rings, and never constructs every column or part. Stream completed original tetrahedra into a face map and release all-W scalar/ring temporaries plus face maps before publication. Never generate every part or clone the full model for clipping.
- The AABB self-intersection pass is `O(n log n + k)` expected; abort with a recoverable resource message on allocation failure. No partial BufferGeometry enters state.
- Split boundaries have zero offset/kerf/tolerance/additional thickness. Shared coordinates are formula/provenance-identical before STL Float32 conversion; the test tolerance after reparse is `0.00001 mm`.
- Existing units, origin, axes, relief sampling order, sphere cut ring, hole ring rows, clamped stand wall width, derived stand height, animation/light settings, three material groups, and STL orientation remain compatible. Split generation intentionally uses the reviewed collar / taper / tube construction and global all-W scalars; only the explicit untouched legacy branch is the authority for exact legacy stand coordinates and byte compatibility.
- Width/height segments remain unchanged and are the dynamic split maxima. No automatic split correction, batching, joinery, labels, multiple-part Preview, server, network call, or new export format is added.
- Validation and generation errors are recoverable in place. A failed replacement Build intentionally leaves Preview/Export empty, as required after Build start; the user may correct inputs and Build again without reload.
- Split stand generation fails atomically on any invalid/nonfinite required scalar, `s==0`, `cos(halfDelta)<=0`, pole join, enabled `tauMin<=0`, non-strict Y ordering, non-positive prescribed determinant, per-cell volume mismatch, named-interface ownership/winding failure, Float64/Float32 cross-Build mismatch, extreme-`w` Float32 collapse, intersection, lumen cap, multiple components, or legacy-byte change. None may be repaired by changing vertex order, tolerance welding, fabricated thickness, or topology substitution.

## Traceability Matrix

| Plan component / phase | Functional requirements | Acceptance criteria | MVP checklist |
|---|---|---|---|
| Phase 1: params, raw inputs, persistence migration | FR-001..FR-004, FR-025, FR-027, FR-029..FR-031 | AC-001, AC-006, AC-007 | MVP-001, MVP-014, MVP-016, MVP-017 |
| Phase 2: split ordering and ranges | FR-005..FR-007 | AC-001 | MVP-002, MVP-003, MVP-014 |
| Phase 3: Built Part lifecycle and export identity | FR-008..FR-013, FR-028, FR-035 | AC-002 | MVP-004, MVP-005, MVP-006, MVP-016 |
| Phases 4–6: selected solid construction and ownership | FR-014..FR-020, FR-022, FR-025, FR-032 | AC-003, AC-004 | MVP-007, MVP-008, MVP-009, MVP-010, MVP-012, MVP-014, MVP-016 |
| Phase 6: rotation, image/relief compatibility, legacy gate | FR-006, FR-021..FR-023, FR-026 | AC-004, AC-005 | MVP-011, MVP-012, MVP-013, MVP-015 |
| Phase 7: immutable Built Part Preview texture, split-only fit, legacy-frame reset, controls, cleanup | FR-009, FR-010, FR-024, FR-026, FR-033 | AC-002, AC-004, AC-005, AC-008 | MVP-004, MVP-005, MVP-013, MVP-015, MVP-018 |
| Phases 3 and 6: exact STL content and filename | FR-012..FR-014, FR-026, FR-028 | AC-002, AC-005 | MVP-006, MVP-015 |
| Phases 5, 6, and 8: failure gate, performance, client-only E2E | FR-011, FR-016, FR-032..FR-034 | AC-003, AC-008 | MVP-007, MVP-016, MVP-018 |

Coverage check: every FR from FR-001 through FR-035, every AC from AC-001 through AC-008, and every MVP item from MVP-001 through MVP-018 appears in at least one row. Success criteria SC-001..SC-007 are bound to the named automated/fixture tests; SC-005 additionally requires slicer acceptance, and SC-008 is the Phase 8 timed browser gate.

## Approval Gate and Open Questions

`specs/003-split-stl-export/task.md` and `specs/003-split-stl-export/e2e-test.md` already exist. Phase 4 remains paused and unchecked after the legacy contradiction and the disproved first `IT/OT + globalTopMin` replan; implementation may resume only after this second replan's spec/plan/task corrections are reviewed and approved. The approved E2E definitions require no wording change because they assert stable user-visible watertight/slicer behavior rather than either rejected internal join.

Open questions: **none**. The authoritative spec and the decisions above resolve parameter semantics, split ownership, stand/top-hole row assignment, topology failure behavior, snapshot identity, persistence, filename, test architecture, and acceptance gates.
