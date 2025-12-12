# Data Model (Phase 1): Spherical Lithophane Generator

**Date**: 2025-12-12  
**Feature**: [specs/001-sphere-lithophane/spec.md](spec.md)

## Entities

### Source Image

Represents the user-provided panorama.

- **Fields**
  - `fileName` (string)
  - `mimeType` (string; must be JPEG or PNG)
  - `widthPx` (integer > 0)
  - `heightPx` (integer > 0)
  - `aspectRatio` (derived; must be 2:1 for acceptance)

- **Validation Rules**
  - File type must be JPEG/PNG.
  - Aspect ratio must be exactly 2:1 (or within a narrowly defined tolerance if adopted by implementation).

### Lithophane Parameters

User-controlled settings that influence geometry.

- **Fields**
  - `radiusMm` (number > 0)
  - `minThicknessMm` (number >= 0)
  - `maxThicknessMm` (number >= 0)
  - `widthSegments` (integer >= 8)
  - `heightSegments` (integer >= 4)
  - `brightnessCurve` (number; user-facing brightness curve control)
  - `minCos` (number in [0,1])

- **Validation Rules**
  - `minThicknessMm` must be <= `maxThicknessMm`.
  - Segment counts must be within a safe range (upper bound defined by implementation constraints).

### Generated Model

Represents the output geometry derived from the source image and parameters.

- **Fields**
  - `generatedAt` (datetime)
  - `parameters` (Lithophane Parameters snapshot)
  - `sourceImage` (Source Image snapshot)
  - `vertexCount` (integer >= 0)
  - `triangleCount` (integer >= 0)

- **Invariants**
  - Inner surface radius is constant: `radiusMm`.
  - Outer surface radius is `radiusMm + thickness(u,v)` where thickness is constrained to `[minThicknessMm, maxThicknessMm]`.

### Export File

Represents a downloadable artifact.

- **Fields**
  - `format` (enum: STL)
  - `fileName` (string)
  - `createdAt` (datetime)

## Relationships

- Source Image (1) → Generated Model (many over time, as parameters change)
- Lithophane Parameters (1) → Generated Model (many over time)
- Generated Model (1) → Export File (0..many)

## State Transitions

- `Idle` → `ImageLoaded` → `Generating` → `PreviewReady` → (`Exporting` → `ExportReady`) 
- Any state → `Error` (with user-recoverable message) → returns to prior safe state (`ImageLoaded` or `Idle`)
