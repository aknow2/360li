# Implementation Plan: Non-2:1 Image Support (2:1 Padding)

**Branch**: `002-aspect-padding` | **Date**: 2025-12-16 | **Spec**: specs/002-aspect-padding/spec.md

## Summary

This feature removes the strict 2:1 input requirement by converting any uploaded image into a 2:1 “working image” using white padding (no stretching). The user can also apply a scale factor to shrink the original inside the 2:1 working image to control how much white margin appears. The working image must drive both heightfield generation and (if enabled) the preview texture, preserving orientation.

## Technical Context

**Language/Version**: TypeScript (~5.9), React (19), Vite (7)
**Primary Dependencies**: `three`, `react`, `react-dom`
**Storage**: N/A (client-only, in-memory)
**Testing**: No automated test runner currently; validate with `npm run build` and manual checks in `npm run dev`
**Target Platform**: Modern desktop browsers (Vite dev server / static build)
**Project Type**: Single frontend web app (Vite)
**Performance Goals**: Keep Build interactive for typical images; avoid long UI freezes on large images
**Constraints**: Entirely client-side; memory/CPU bounded by browser; handle large images gracefully
**Scale/Scope**: Single-user local tool; no backend and no persistence

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- `.specify/memory/constitution.md` is currently an unfilled template (placeholders), so there are no enforceable project-specific gates to evaluate.
- Gate status: **PASS (no defined constraints)**
- Follow-up (non-blocking): Define/ratify a real constitution if this workflow is meant to enforce specific quality gates.

## Project Structure

### Documentation (this feature)

```text
specs/002-aspect-padding/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── tasks.md             # Created later by /speckit.tasks (out of scope for /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── components/          # UI controls + viewer
├── domain/              # parameter types + validation
├── lithophane/          # image decode/sampling + geometry generation
└── three/               # three.js scene setup + exporting
```

**Structure Decision**: Single Vite frontend (no backend). Image transformation is implemented as a preprocessing step in the existing image decode/processing pipeline.

## Phase 0 — Research (output: research.md)

Decide and document the concrete “working image” transformation rules:

- Working canvas size selection for padding-only (no scale): choose the smallest 2:1 canvas that contains the original without cropping or stretching.
- Scale application: draw the original at `scale` inside the 2:1 canvas, centered; fill remaining area with white.
- Transparency behavior: transparent pixels should be treated as white.
- Orientation: ensure the working image flows through both height sampling and preview texture consistently.
- Large images: define a pragmatic upper bound / downscaling strategy if needed to avoid UI freezes.

## Phase 1 — Design & Contracts (outputs: data-model.md, contracts/*, quickstart.md)

- Data model: add image transform settings (scale + fixed padding color) and define the working image as a derived artifact.
- Contracts: document the parameters in a schema-only OpenAPI file.
- Quickstart: provide a deterministic manual test procedure (non-2:1 inputs, scale changes, orientation marker image).

## Phase 1 — Agent Context Update

Run `.specify/scripts/bash/update-agent-context.sh copilot` after generating the artifacts so the agent context reflects this feature.
