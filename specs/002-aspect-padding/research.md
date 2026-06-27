# Research: Non-2:1 Image Support (2:1 Padding)

## Decision 1: Define a “working image” as a 2:1 padded canvas

- Decision: Always generate a derived 2:1 working image from the uploaded input image; the working image is the sole source for both height sampling and (if enabled) preview texture.
- Rationale: Keeps geometry generation consistent with preview and removes the hard “input must be 2:1” constraint.
- Alternatives considered:
  - Reject non-2:1 inputs (breaks desired UX).
  - Stretch input to 2:1 (violates requirement: no stretching).

## Decision 2: Padding canvas size rule (no cropping, no stretching)

- Decision: Choose the smallest 2:1 canvas that fully contains the original image.
  - If input aspect < 2 (too tall): set canvas height = input height; canvas width = 2 × canvas height.
  - If input aspect > 2 (too wide): set canvas width = input width; canvas height = canvas width ÷ 2.
  - If input aspect == 2: canvas size equals input size.
- Rationale: Guarantees that the entire original image remains visible and undistorted, while achieving exactly 2:1.
- Alternatives considered:
  - Fixed working resolution (simple but may reduce detail or increase memory use unexpectedly).
  - Cropping to 2:1 (not requested; loses content).

## Decision 3: imageScale (shrink) is applied inside the 2:1 canvas

- Decision: Apply a user-controlled imageScale factor $0 < \text{imageScale} \le 1$ by drawing the original image scaled by that factor, centered in the working canvas; the remaining area stays white.
- Rationale: Matches the user’s request to control the amount of white margin and therefore control what maps onto the sphere.
- Alternatives considered:
  - Scale applied by changing the working canvas size (harder to reason about; complicates downstream assumptions).

## Decision 4: Background and transparency

- Decision: Working canvas background is solid white. If the input has transparency (PNG), transparent pixels effectively become white via compositing.
- Rationale: Aligns with the requirement “expanded area is white” and produces a deterministic working image.
- Alternatives considered:
  - Preserve transparency (would require additional rules for thickness mapping and texture rendering).

## Decision 5: Large-image handling (graceful behavior)

- Decision: If the input image is extremely large, optionally downscale the working image to keep processing interactive.
  - Use a pixel-count based threshold rather than a fixed dimension.
  - Default pixel budget: 8,000,000 pixels (≈ 8 MP) for the working image.
- Rationale: Browser-based processing can freeze with very large canvases; a pixel budget is a pragmatic safeguard.
- Alternatives considered:
  - No cap (highest fidelity but risks UI freezes).
  - Strict fixed-size cap (predictable but may overly reduce detail for some inputs).
