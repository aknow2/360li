# Implementation Plan: Spherical Lithophane Generator

**Branch**: `001-sphere-lithophane` | **Date**: 2025-12-12 | **Spec**: [specs/001-sphere-lithophane/spec.md](spec.md)
**Input**: Feature specification from [specs/001-sphere-lithophane/spec.md](spec.md)

**Note**: This file is generated/maintained by the `/speckit.plan` workflow.

## Summary

Build a client-side web tool that:

- Accepts a single 2:1 equirectangular image (JPEG/PNG)
- Generates a spherical lithophane as a hollow shell (constant inner radius, variable outer thickness)
- Provides interactive 3D preview
- Exports a printable STL

Research decisions are captured in [specs/001-sphere-lithophane/research.md](research.md).

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript (React-based web app; exact tooling version decided at implementation start)  
**Primary Dependencies**: Three.js (three.js), STL export support, React UI  
**Storage**: N/A (no persistence required beyond the current session)  
**Testing**: Unit tests for parameter validation and sampling/mapping logic; lightweight integration tests for export validity  
**Target Platform**: Modern browsers with WebGL2 (Chrome/Safari latest)  
**Project Type**: Web application (single frontend)  
**Performance Goals**: Smooth interactive preview; generation should complete within the success criteria thresholds in the spec  
**Constraints**: Must handle large images without freezing the UI indefinitely; must show recoverable errors on failure  
**Scale/Scope**: Single-user, local-only usage; no auth, no multi-tenant concerns

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution source: [.specify/memory/constitution.md](../../.specify/memory/constitution.md)

- **Gate 1 — Enforceable principles exist**: PASS (no enforceable principles; file is a placeholder template)
- **Gate 2 — Scope discipline**: PASS (feature remains client-only; no backend implied)
- **Gate 3 — Testability**: PASS (spec defines independently testable user stories and requirement-level acceptance criteria)

If a real constitution is later ratified, revisit this section and update the plan accordingly.

## Project Structure

### Documentation (this feature)

```text
specs/001-sphere-lithophane/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
src/
├── components/          # Viewer + controls
├── domain/              # Parameter validation, contracts (types), orchestration
├── lithophane/          # Image sampling + thickness mapping + sphere generation
├── three/               # Scene setup + renderer helpers + STL export wrapper
└── main.tsx / App.tsx

tests/
├── unit/
└── integration/
```

**Structure Decision**: Single client-side web application with a domain-oriented `src/` layout to keep UI, generation, and export responsibilities separated.

## Phase 0 Output (Research)

- Produced: [specs/001-sphere-lithophane/research.md](research.md)

## Phase 1 Output (Design & Contracts)

- Data model: [specs/001-sphere-lithophane/data-model.md](data-model.md)
- Contracts: [specs/001-sphere-lithophane/contracts/openapi.yaml](contracts/openapi.yaml)
- Quickstart: [specs/001-sphere-lithophane/quickstart.md](quickstart.md)

## Phase 2 Plan (Tasks)

Tasks are intentionally not created by `/speckit.plan`. When proceeding to `/speckit.tasks`, expected task groups:

1. Project scaffolding (web app skeleton)
2. Image validation + decoding pipeline
3. Brightness sampling + mapping utilities
4. Sphere shell geometry generation
5. three.js preview (camera controls + lighting)
6. STL export and basic export validation
7. Minimal UI wiring (upload, sliders, export)

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
