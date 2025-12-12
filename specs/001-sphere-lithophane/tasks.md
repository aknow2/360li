# Tasks: Spherical Lithophane Generator

**Input**: Design documents from `/specs/001-sphere-lithophane/`

- plan: [specs/001-sphere-lithophane/plan.md](plan.md)
- spec: [specs/001-sphere-lithophane/spec.md](spec.md)
- research: [specs/001-sphere-lithophane/research.md](research.md)
- data model: [specs/001-sphere-lithophane/data-model.md](data-model.md)
- contracts: [specs/001-sphere-lithophane/contracts/openapi.yaml](contracts/openapi.yaml)
- quickstart: [specs/001-sphere-lithophane/quickstart.md](quickstart.md)

**Tests**: Not requested in the feature spec; tasks below focus on implementation + manual verification.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the web app skeleton and repo structure per the plan.

- [x] T001 Initialize Vite + React + TypeScript app in repo root (creates package.json, src/, vite config)
- [x] T002 Install runtime dependencies in package.json (three, STL export helper) and run npm install
- [x] T003 [P] Create planned source folders in src/components/, src/domain/, src/lithophane/, src/three/
- [x] T004 [P] Add baseline app shell in src/App.tsx (mount Viewer + Controls placeholders)
- [x] T005 [P] Add baseline entry wiring in src/main.tsx (render App)
- [x] T006 [P] Add minimal global styles in src/index.css (no design system assumptions)

**Checkpoint**: `npm run dev` starts and renders an empty shell UI.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared domain primitives and utilities required by all user stories.

- [x] T007 Define Lithophane parameter types + defaults in src/domain/params.ts
- [x] T008 [P] Define runtime validation helpers in src/domain/validation.ts (min/max thickness, segment ranges, 2:1 checks)
- [x] T009 [P] Define user-facing error type + mapping in src/domain/errors.ts
- [x] T010 Define internal contracts (TypeScript types mirroring contracts/openapi.yaml schemas) in src/domain/contracts.ts
- [x] T011 Implement image decode pipeline to ImageData in src/lithophane/imageDecode.ts
- [x] T012 Implement bilinear brightness sampling with seam-safe wrapping in src/lithophane/imageSampler.ts
- [x] T013 Implement brightness curve + thickness mapping in src/lithophane/thickness.ts
- [x] T014 Implement sphere-specific compensation function in src/lithophane/compensation.ts
- [x] T015 Implement geometry generator entrypoint in src/lithophane/sphereLithophane.ts (inputs: ImageData + params; output: THREE.BufferGeometry + summary)
- [x] T016 Implement Three.js scene bootstrap (renderer/camera/controls/lights) in src/three/scene.ts

**Checkpoint**: A small script/component can call the generator and receive a geometry without UI.

---

## Phase 3: User Story 1 - Create a spherical lithophane from a 360 image (Priority: P1) 🎯 MVP

**Goal**: Upload a valid 2:1 equirectangular image and see a generated spherical lithophane in an interactive 3D preview.

**Independent Test**: Upload a valid 2:1 JPEG/PNG and confirm the model generates and is rotatable/zoomable.

### Implementation (US1)

- [x] T017 [P] [US1] Implement image upload control + validation wiring in src/components/Controls.tsx
- [x] T018 [US1] Add “selected image” state + load flow in src/domain/state.ts (idle → imageLoaded → generating → ready/error)
- [x] T019 [US1] Wire decode pipeline into state flow in src/domain/generate.ts (uses src/lithophane/imageDecode.ts)
- [x] T020 [P] [US1] Build Viewer component that renders the generated mesh in src/components/Viewer.tsx
- [x] T021 [US1] Connect Viewer to Three.js scene bootstrap in src/three/scene.ts
- [x] T022 [US1] Add user-visible error messages for invalid image / decode failure in src/components/Controls.tsx
- [x] T023 [US1] Ensure interactive orbit rotate/zoom works in src/three/scene.ts

**Checkpoint**: US1 works end-to-end with defaults and a valid image.

---

## Phase 4: User Story 2 - Tune lithophane parameters and preview changes (Priority: P2)

**Goal**: User adjusts parameters (radius, min/max thickness, brightness curve, segment counts, minCos) and sees updated preview.

**Independent Test**: Change each parameter and verify the preview updates and thickness constraints hold.

### Implementation (US2)

- [x] T024 [P] [US2] Add parameter controls (sliders/inputs) in src/components/Controls.tsx (radiusMm, minThicknessMm, maxThicknessMm, brightnessCurve, minCos)
- [x] T025 [P] [US2] Add segment controls (widthSegments, heightSegments) with safe bounds in src/components/Controls.tsx
- [x] T026 [US2] Validate parameters on change and show inline feedback in src/components/Controls.tsx (uses src/domain/validation.ts)
- [x] T027 [US2] Trigger regeneration when parameters change in src/domain/state.ts (update flow + prevent invalid generation)
- [x] T028 [US2] Ensure thickness clamp invariants are enforced by generator in src/lithophane/thickness.ts and src/lithophane/sphereLithophane.ts
- [x] T029 [US2] Make regeneration robust under rapid changes (cancel/ignore stale results) in src/domain/generate.ts
- [x] T038 [US2] Add adjustable bottom hole (diameter) and apply it in src/lithophane/sphereLithophane.ts + controls

**Checkpoint**: US2 works independently with a loaded image; invalid ranges are blocked with clear messaging.

---

## Phase 5: User Story 3 - Export a printable 3D file (STL) (Priority: P3)

**Goal**: User exports the current generated model to STL for 3D printing.

**Independent Test**: Export STL and import into a slicer; it appears as a single watertight solid.

### Implementation (US3)

- [x] T030 [P] [US3] Implement STL export wrapper in src/three/exporter.ts (input: THREE.Mesh or geometry; output: string/blob)
- [x] T031 [US3] Add “Export STL” button and download behavior in src/components/Controls.tsx
- [x] T032 [US3] Ensure exported object is a printable solid (supports optional bottom hole) in src/lithophane/sphereLithophane.ts
- [x] T033 [US3] Add export-time validation errors (no model, generation in progress) in src/components/Controls.tsx


**Checkpoint**: STL export downloads successfully and imports cleanly in a slicer.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories without expanding scope.

- [x] T034 [P] Update docs with real dev commands and verification steps in specs/001-sphere-lithophane/quickstart.md
- [ ] T035 Improve error recovery so UI returns to a safe state after failures in src/domain/state.ts
- [x] T036 Add minimal loading indication during generation/export in src/components/Controls.tsx
- [ ] T037 Confirm defaults produce a successful first run (no tuning) by adjusting src/domain/params.ts defaults if needed

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1) → blocks Foundational (Phase 2)
- Foundational (Phase 2) → blocks all User Story phases
- User stories can proceed in priority order after Foundational:
  - US1 (P1) → US2 (P2) → US3 (P3)
- Polish (Phase 6) depends on completing desired user stories

### User Story Dependencies

- US1 has no dependency on US2/US3 beyond shared Foundational modules.
- US2 depends on US1 only for having an image/model to tune (must remain independently testable once implemented).
- US3 depends on US1 for having a generated model to export.

## Parallel Execution Examples

### Setup (parallelizable)

- T003 (folder structure), T004 (App shell), T005 (main wiring), T006 (styles) can be done in parallel.

### US1 (parallelizable)

- T017 (upload control in src/components/Controls.tsx) can proceed while T020/T021 (Viewer + scene wiring) are implemented.

### US2 (parallelizable)

- T024 (main parameter controls) and T025 (segment controls) can be done in parallel.

### US3 (parallelizable)

- T030 (exporter module) can be implemented in parallel with finishing US2.

### Cross-cutting (parallelizable)

- T034 (quickstart docs) can be done in parallel with feature work.

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 + Phase 2
2. Implement Phase 3 (US1)
3. Validate US1 independently using the acceptance scenarios in specs/001-sphere-lithophane/spec.md

### Incremental Delivery

- Add US2 (parameter tuning) after US1 is stable
- Add US3 (STL export) after preview/regeneration behavior is reliable
- Finish with Polish tasks only after the user stories meet acceptance criteria
