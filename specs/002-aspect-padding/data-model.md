# Data Model: Non-2:1 Image Support (2:1 Padding)

## Entities

### InputImage

- Description: The user-selected source image.
- Representation (runtime): decoded raster image (e.g., pixel buffer) plus metadata.
- Fields:
  - `width`: number
  - `height`: number
  - `pixels`: RGBA pixel data

### ImageTransformSettings

- Description: Settings controlling how the input image is transformed into the 2:1 working image.
- Fields:
  - `imageScale`: number
    - Validation: $0 < \text{imageScale} \le 1$
    - Default: 1.0
  - `padColor`: fixed white
    - Note: Not user-configurable in this feature.

### WorkingImage (2:1)

- Description: The derived 2:1 image used for lithophane generation.
- Derived from: `InputImage` + `ImageTransformSettings`.
- Invariants:
  - Aspect ratio is exactly 2:1.
  - No stretching of the original content.
  - Background is white.
- Fields:
  - `width`: number
  - `height`: number
  - `pixels`: RGBA pixel data

## Relationships

- `WorkingImage` is computed from (`InputImage`, `ImageTransformSettings`).

## Notes / State

- The user can change `imageScale` and then press Build; Build uses the latest `WorkingImage`.
- If preview texture is enabled, it must also be sourced from the same `WorkingImage` to avoid orientation/mapping mismatches.
