# Tasks: Non-2:1 Image Support (2:1 Padding)

**Input**: Design documents from `/specs/002-aspect-padding/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

## Phase 1: Setup (Shared)

- [x] T001 [P] Update SC-004 in specs/002-aspect-padding/spec.md to be measurable
- [x] T002 [P] Update spec link to the 002 directory in specs/002-aspect-padding/checklists/requirements.md
- [x] T003 Validate baseline build succeeds via `npm run build` (scripts in package.json)

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T004 [P] Add `imageScale` parameter (default 1.0) to src/domain/params.ts
- [x] T005 [P] Add `imageScale` validation (0 < imageScale <= 1) to src/domain/validation.ts
- [x] T006 Implement working-image transform utility (2:1 padding + centered draw + white background) in src/lithophane/workingImage.ts

**Checkpoint**: Foundation ready — downstream stories can build on a shared working-image primitive.

---

## Phase 3: User Story 1 — Non-2:1 image can be used (Priority: P1) 🎯 MVP

**Goal**: Accept any JPEG/PNG aspect ratio by creating a derived 2:1 working image using white padding (no stretching) so Build → preview → STL works.

**Independent Test**: Upload a non-2:1 image and press Build; a 3D model appears and STL export succeeds.

- [x] T007 [US1] Update source-image label/help text to remove the hard “2:1” requirement in src/components/Controls.tsx
- [x] T008 [US1] Remove strict 2:1 rejection during decode and route all images through working-image creation in src/lithophane/imageDecode.ts
- [x] T009 [US1] Plumb `imageScale` into generation so the decoder can build a working image from params in src/domain/generate.ts
- [x] T010 [US1] Ensure aspect-ratio validation no longer blocks non-2:1 inputs (adjust usage/behavior) in src/domain/validation.ts

**Checkpoint**: US1 is shippable as MVP.

---

## Phase 4: User Story 2 — Adjust padding by scale (Priority: P2)

**Goal**: Let the user set a scale to control how much white margin is introduced.

**Independent Test**: Build with scale=1.0 and scale=0.7 and confirm the resulting bump pattern differs.

- [x] T011 [US2] Add an Image scale control (0..1) to the Parameters UI in src/components/Controls.tsx
- [x] T012 [US2] Surface validation errors for imageScale in the UI (field wiring) in src/components/Controls.tsx
- [x] T013 [US2] Confirm Build uses the updated scale (no stale values) by wiring through existing state flow in src/App.tsx
- [x] T014 [US2] Rename contract property scale to imageScale (and keep docs consistent) in specs/002-aspect-padding/contracts/openapi.yaml

**Checkpoint**: US2 can be demonstrated independently on top of US1.

---

## Phase 5: User Story 3 — Orientation is preserved (Priority: P3)

**Goal**: Prevent unintended flips; ensure preview texture (if enabled) matches the same working image used for geometry.

**Independent Test**: Use an image with a clear orientation marker and verify texture and bumps align (no mismatch).

- [x] T015 [US3] Refactor preview texture generation to use the same working-image pipeline (not raw file) in src/components/Viewer.tsx
- [x] T016 [US3] Pass `imageScale` (and any needed transform settings) into Viewer from src/App.tsx
- [x] T017 [US3] Ensure cached textures invalidate when transform settings change (e.g., scale) in src/components/Viewer.tsx

**Checkpoint**: US3 completes parity between preview and generated geometry.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Update and re-run the manual verification steps in specs/002-aspect-padding/quickstart.md
- [x] T019 [P] Document large-image handling decision (pixel budget / downscale) in specs/002-aspect-padding/research.md
- [x] T020 Add a practical large-image guard (optional downscale of working image) in src/lithophane/workingImage.ts
- [ ] T021 Run `npm run build` and address only regressions introduced by this feature (scripts in package.json)
- [ ] T022 [P] Verify backward-compat baseline: 2:1 input + imageScale=1.0 produces qualitatively similar STL output as before (manual compare)

---

## Dependencies & Execution Order

### User Story Dependencies

- **US1 (P1)** depends on **Phase 2** only.
- **US2 (P2)** depends on **US1** (and Phase 2).
- **US3 (P3)** depends on **US1** (and Phase 2). It can be developed in parallel with US2 after US1 is stable.

### Parallel Opportunities

- In **Phase 1**, T001 and T002 are parallel.
- In **Phase 2**, T004 and T005 are parallel; T006 depends on neither but is easiest after the param/validation shape is settled.
- After **US1** is complete, **US2** (UI/scale) and **US3** (texture alignment) can proceed in parallel.

---

## Parallel Examples

### User Story 1

- [ ] T007 [P] [US1] Update input label/help text in src/components/Controls.tsx
- [ ] T010 [P] [US1] Ensure validation no longer blocks non-2:1 inputs in src/domain/validation.ts

### User Story 2

- [ ] T011 [P] [US2] Add Image scale control in src/components/Controls.tsx
- [ ] T014 [P] [US2] Rename contract property scale to imageScale in specs/002-aspect-padding/contracts/openapi.yaml

### User Story 3

- [ ] T015 [US3] Refactor preview texture to use working image in src/components/Viewer.tsx
- [ ] T016 [P] [US3] Pass imageScale into Viewer props in src/App.tsx

---

## Implementation Strategy

### MVP First (US1 only)

- Complete Phase 1 → Phase 2 → Phase 3.
- Validate using the US1 independent test (non-2:1 upload → Build → Export).

### Incremental Delivery

- Add US2 (scale) and validate the "scale changes output" criterion.
- Add US3 (orientation/texture parity) and validate with a marker image.
