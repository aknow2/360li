# Quickstart: Non-2:1 Image Support (2:1 Padding)

## Goal

Verify that non-2:1 images can be used by generating a 2:1 working image with white padding, and that adjusting scale changes the resulting lithophane output.

## Run

- `npm install`
- `npm run dev`

## Manual Test Checklist

1. **Baseline (2:1 input, imageScale = 1.0)**
   - Upload a known-good 2:1 image.
   - Ensure Build works as before.
   - (If you have a known “before” build) compare the STL output qualitatively to confirm no unexpected regression.

2. **Non-2:1 input acceptance**
   - Upload a clearly non-2:1 image (e.g., square or portrait).
   - Confirm you can proceed to Build (no “must be 2:1” blocking error).

3. **Scale affects output**
   - Using the same input, build once with imageScale = 1.0.
   - Build again with a smaller imageScale (e.g., 0.7).
   - Confirm the output changes (more white area / different thickness distribution).

4. **Orientation preservation**
   - Use a test image with an obvious marker (e.g., text in the top-left).
   - Confirm the preview texture (if enabled) and the bumps/valleys correspond (no flip/mismatch).

5. **Transparency**
   - Upload a PNG with transparency.
   - Confirm transparent regions behave like white.
