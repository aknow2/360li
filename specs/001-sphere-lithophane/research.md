# Research (Phase 0): Spherical Lithophane Generator

**Date**: 2025-12-12  
**Feature**: [specs/001-sphere-lithophane/spec.md](spec.md)

## Decisions

### 1) Client-only architecture (no backend in v1)

- **Decision**: Implement v1 as a purely in-browser tool (upload → generate → preview → STL export), with no server-side generation.
- **Rationale**: The feature spec does not require accounts, persistence, sharing, or server compute. Keeping it client-only reduces scope and operational complexity.
- **Alternatives considered**:
  - Server-side generation API (rejected: adds deployment, upload constraints, and authentication questions not in scope).

### 2) Image sampling method

- **Decision**: Sample brightness from the source image using a pre-decoded pixel buffer and **bilinear sampling** in UV space.
- **Rationale**: Bilinear sampling reduces aliasing artifacts on the sphere compared to nearest-neighbor sampling, especially at lower mesh segment counts.
- **Alternatives considered**:
  - Nearest-neighbor sampling (rejected: produces visible blocky artifacts).

### 3) UV ↔ equirectangular mapping and seam handling

- **Decision**: Treat the input as an equirectangular panorama where:
  - $u \in [0,1]$ maps to longitude $\lambda \in [0,2\pi)$
  - $v \in [0,1]$ maps to latitude $\phi \in [0,\pi]$
  - Sampling wraps in $u$ (seam-safe) and clamps in $v$.
- **Rationale**: This is the standard interpretation of 2:1 equirectangular panoramas.
- **Alternatives considered**:
  - Cropping/remapping non-2:1 inputs (rejected: out of scope; spec requires 2:1).

### 4) Brightness curve (gamma-like control)

- **Decision**: Provide a single user-facing “brightness curve” control; internally it behaves like a gamma curve where the sampled brightness is transformed before thickness mapping.
- **Rationale**: A single knob is sufficient for v1 to tune contrast/visibility across different images.
- **Alternatives considered**:
  - Full curves / histograms (rejected: UX and implementation complexity not required for v1).

### 5) Thickness mapping

- **Decision**: Map brightness to base thickness using an inverted linear mapping between user-selected min/max thickness.
- **Rationale**: Matches common lithophane behavior (darker → thicker).
- **Alternatives considered**:
  - Non-linear thickness mapping (rejected: keep v1 simple).

### 6) Sphere-specific compensation

- **Decision**: Apply a sphere-specific compensation factor based on the cosine between a fixed direction vector and the surface normal, clamped by a minimum cosine.
- **Rationale**: Prevents “detail collapse” (visible detail only in a limited region) and improves visibility across the sphere.
- **Alternatives considered**:
  - No compensation (rejected: known failure mode in spec).
  - Camera-dependent compensation (rejected: spec calls for a fixed direction).

### 7) Geometry represents a hollow shell (printable lamp-style body)

- **Decision**: The generated object is a closed hollow shell with:
  - **Outer surface**: variable radius $R + thickness(u,v)$
  - **Inner surface**: constant radius $R$
- **Rationale**: Matches the spec’s “inner constant radius / outer deformed” design and supports internal lighting use cases.
- **Alternatives considered**:
  - Fully solid sphere (rejected: contradicts the explicit “inner constant radius” structure).

### 8) Export contract strategy

- **Decision**: Provide an OpenAPI schema file containing **data contracts (schemas only)** with no HTTP paths.
- **Rationale**: v1 is client-only, but having explicit schemas documents module boundaries and enables a future API without changing the conceptual model.
- **Alternatives considered**:
  - Full REST endpoints in OpenAPI (rejected: would imply a backend not in scope).

### 9) Constitution / gates

- **Decision**: Treat `.specify/memory/constitution.md` as a placeholder template (no ratified constraints). Use only generic quality gates for this plan.
- **Rationale**: The constitution file currently contains placeholders and no enforceable rules.
- **Alternatives considered**:
  - Blocking planning until constitution is defined (rejected: would halt progress with no guidance).

## Open Questions

None required for v1 planning based on the current feature spec.
