# Quickstart (Phase 1): Spherical Lithophane Generator

**Date**: 2025-12-12  
**Branch**: `001-sphere-lithophane`

## Prerequisites

- Node.js (LTS recommended)
- A modern browser with WebGL2 (Chrome/Safari latest)

## Local Development (planned)

Install dependencies:

```sh
npm install
```

Start the dev server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

## Manual Verification Checklist (runtime)

- Upload a valid 2:1 equirectangular JPEG/PNG → model appears in preview
- Adjust parameters → preview updates
- Set Bottom hole diameter (mm) > 0 → bottom opening appears
- Export STL → file downloads and imports into a slicer

## How it works

- Image → 3D conversion notes: [specs/001-sphere-lithophane/image-to-3d.md](image-to-3d.md)
