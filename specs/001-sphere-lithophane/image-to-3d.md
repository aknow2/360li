# Image → 3D Model Conversion (Implementation Notes)

This document describes how the app converts a 2:1 equirectangular panorama (JPEG/PNG) into a spherical lithophane mesh.

## 0) Inputs

- **Source image**: a single **2:1 equirectangular** panorama (JPEG/PNG)
- **Parameters** (mm unless noted):
  - `radiusMm`: inner radius of the shell
  - `minThicknessMm`, `maxThicknessMm`: clamp range for thickness
  - `brightnessCurve`: gamma-like curve applied to brightness
  - `minCos`: minimum cosine clamp used by the sphere compensation
  - `widthSegments`, `heightSegments`: sphere mesh resolution
  - `holeDiameterMm`: optional bottom opening diameter (`0` = no hole)

## 1) Decode image → ImageData

Implementation: [src/lithophane/imageDecode.ts](../../src/lithophane/imageDecode.ts)

1. Validate MIME type is `image/jpeg` or `image/png`.
2. Decode into pixels:
   - Prefer `createImageBitmap(file)`
   - Fallback to `new Image()` + canvas draw
3. Validate aspect ratio is **2:1** using the decoded dimensions.
4. Read the pixel buffer via `ctx.getImageData(0, 0, width, height)`.

Result: `ImageData { width, height, data: Uint8ClampedArray }`.

## 2) Sample brightness from the panorama

Implementation: [src/lithophane/imageSampler.ts](../../src/lithophane/imageSampler.ts)

### UV mapping assumptions

We treat the panorama as standard equirectangular mapping:

- $u \in [0, 1]$ = longitude (wraps around)
- $v \in [0, 1]$ = latitude (clamps)

### UV → sphere direction (math)

Conceptually, equirectangular UV maps to spherical angles like this:

- Longitude (around the equator):

$$
\lambda = 2\pi u - \pi
$$

- Latitude (from south to north). With the common convention “$v=0$ at top of the image”:

$$
\varphi = \frac{\pi}{2} - \pi v
$$

Then a unit direction vector is:

$$
\hat{n}(u,v) =
\begin{bmatrix}
\cos\varphi\,\sin\lambda\\
\sin\varphi\\
\cos\varphi\,\cos\lambda
\end{bmatrix}
$$

and the point on a sphere of radius $R$ is:

$$
p(u,v) = R\,\hat{n}(u,v)
$$

Notes:

- The exact sign/axis conventions depend on the 3D engine (right-handed vs left-handed, which axis is “up”, and whether $v$ increases downward).
- A seam exists at $u=0$ / $u=1$ (same longitude).

### UV → sphere coordinates (implementation)

In this project we **do not manually compute** $p(u,v)$ for sampling.
Instead, we create a base sphere via `THREE.SphereGeometry(...)` which already provides:

- vertex positions (sphere coordinates)
- a matching `uv` attribute per vertex

We use the vertex’s `(u, v)` to sample the panorama, then move the vertex along its normal to create thickness.

### Seam handling

- `u` **wraps** (so sampling works across the seam)
- `v` **clamps** (no wrap across poles)

### Bilinear sampling

Given $(u, v)$:

- Convert to pixel space:
  - $x = u \cdot (W - 1)$
  - $y = v \cdot (H - 1)$
- Take the 4 neighbor pixels and interpolate bilinearly.

### Luminance

Brightness is computed from RGB (alpha ignored) using luma-like coefficients:

$$
B = \mathrm{clamp01}\left(\frac{0.2126R + 0.7152G + 0.0722B}{255}\right)
$$

Result: `brightness01 ∈ [0,1]`.

## 3) Brightness → thickness (mm)

Implementation: [src/lithophane/thickness.ts](../../src/lithophane/thickness.ts)

1. Apply user curve:

$$
B' = \mathrm{clamp01}(B^{\text{brightnessCurve}})
$$

### What `brightnessCurve` does

`brightnessCurve` is a **non-linear remap of the sampled brightness** (similar to “gamma”).
It is applied **before** converting brightness into thickness.

Because thickness is computed with `(1 - B')`, the curve affects *where* the thickness has more sensitivity:

- `brightnessCurve` **> 1.0**: pushes mid/high brightness **down** (darker), so the model becomes **thicker overall** and thickness variation is emphasized more toward the **bright end**.
- `brightnessCurve` **< 1.0**: pushes mid brightness **up** (brighter), so the model becomes **thinner overall** and thickness variation is emphasized more toward the **dark end**.
- `brightnessCurve` = 1.0: linear mapping (no curve).

Quick numeric intuition (showing only $B \to B'$):

| B | curve=0.7 | curve=1.0 | curve=1.8 |
|---:|---------:|---------:|---------:|
| 0.2 | 0.324 | 0.200 | 0.055 |
| 0.5 | 0.616 | 0.500 | 0.287 |
| 0.8 | 0.856 | 0.800 | 0.669 |

2. Convert to thickness (inverted: darker → thicker):

$$
T = \mathrm{minThickness} + (1 - B')\cdot(\mathrm{maxThickness} - \mathrm{minThickness})
$$

3. Clamp:

- $T \in [\mathrm{minThickness}, \mathrm{maxThickness}]$

## 4) Sphere compensation

Implementation: [src/lithophane/compensation.ts](../../src/lithophane/compensation.ts)

To avoid detail “collapsing” to only the front-facing region, we apply a compensation factor based on a cosine term:

- For each vertex, compute the unit normal $n$.
- Use a fixed view direction $v$ (currently `(0,0,1)` in generator).
- Compute:

$$
\mathrm{factor} = \max(n\cdot v, \mathrm{minCos})
$$

Final thickness at the vertex:

$$
T_{final} = T \cdot \mathrm{factor}
$$

## 5) Generate the spherical shell mesh

Implementation: [src/lithophane/sphereLithophane.ts](../../src/lithophane/sphereLithophane.ts)

### Base sphere topology

We start from `THREE.SphereGeometry(radiusMm, widthSegments, heightSegments)` to get a consistent topology, UVs, and indices.

### Inner + outer surfaces

For each base vertex $i$:

1. Compute normal $n_i$.
2. Sample panorama brightness using the vertex UV $(u_i, v_i)$.
3. Compute $T_{final}$ as described above.
4. Create two vertices:

- **Inner** vertex at constant radius:
  - $p_{in} = n_i \cdot R$
- **Outer** vertex offset outward by thickness:
  - $p_{out} = n_i \cdot (R + T_{final})$

The geometry contains both surfaces (2× vertex count).

### Indices / winding

- **Outer surface** keeps the original triangle winding.
- **Inner surface** uses reversed winding (so its normals face inward).

### Optional bottom hole

Parameter: `holeDiameterMm`.

- We compute a target cut latitude (in `v`) based on the requested hole radius and inner radius.
- For simplicity and robustness, we **do not split triangles**; we cut along the nearest mesh row.
- Triangles that go below the cut ring are removed, leaving an opening.

### Rim wall (connect inner to outer)

If a hole is enabled, we add a “rim wall” by connecting the inner and outer rings at the cut latitude with two triangles per segment.

This creates a printable shell with an opening (not watertight).

## 6) Export to STL

Implementation: [src/three/exporter.ts](../../src/three/exporter.ts)

- Use `three/examples/jsm/exporters/STLExporter`.
- Convert the current `BufferGeometry` to an STL `Blob` (binary by default).
- Trigger a browser download via an object URL.

## Notes / Limitations

- Hole diameter is **approximate** and depends on `heightSegments` (cut happens on a band boundary).
- Performance depends mainly on segment counts and image size. Segment counts have upper bounds enforced in validation.
- Current STL export does not perform mesh repair; it exports what we generate.
