# Feature Specification: Spherical Lithophane Generator

**Feature Branch**: `001-sphere-lithophane`  
**Created**: 2025-12-12  
**Status**: Draft  
**Input**: User description: "360度画像（エクイレクタングラー）から球体リソファンを生成し、3DプレビューとSTL出力ができるWebアプリ"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Create a spherical lithophane from a 360 image (Priority: P1)

A user uploads a 360° equirectangular image and receives a generated spherical lithophane model that represents the image via thickness variation.

**Why this priority**: This is the core value—turning a 360 image into a printable spherical lithophane.

**Independent Test**: Can be fully tested by uploading a valid 2:1 image and confirming that a spherical model is produced and viewable.

**Acceptance Scenarios**:

1. **Given** the user has a valid 2:1 equirectangular image, **When** they upload it, **Then** the system generates a spherical lithophane model.
2. **Given** a generated model exists, **When** the user rotates/zooms the view, **Then** the model remains coherent and continuously rendered.

---

### User Story 2 - Tune lithophane parameters and preview changes (Priority: P2)

A user adjusts lithophane parameters (e.g., sphere size, minimum/maximum thickness, brightness-to-thickness mapping) and sees the model update so they can achieve a desirable appearance and printability.

**Why this priority**: Parameter tuning is required to fit different images, printers, and aesthetic goals.

**Independent Test**: Can be tested by changing each parameter and verifying the preview updates and the output stays within defined bounds.

**Acceptance Scenarios**:

1. **Given** a model is generated, **When** the user changes any parameter, **Then** the preview updates to reflect the new settings.
2. **Given** the user sets values outside allowed ranges, **When** the system validates inputs, **Then** it prevents invalid generation and explains what to fix.

---

### User Story 3 - Export a printable 3D file (STL) (Priority: P3)

A user exports the generated spherical lithophane as an STL file suitable for slicing and 3D printing.

**Why this priority**: Export is necessary to turn the preview into a physical object.

**Independent Test**: Can be tested by exporting STL and verifying it imports into a slicer as a closed, solid model.

**Acceptance Scenarios**:

1. **Given** a model is generated, **When** the user exports, **Then** the system downloads an STL file.
2. **Given** the exported STL, **When** it is imported into a typical slicer, **Then** it is recognized as a watertight solid without requiring manual mesh repairs.

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

- User uploads an image that is not 2:1 aspect ratio.
- User uploads a very large file that may cause long processing time or memory pressure.
- User uploads an unsupported/corrupted image.
- User sets minimum thickness greater than maximum thickness.
- Parameters produce thickness outside the allowed range due to rounding/precision.
- Generation fails partway through (e.g., due to resource limits) and should not leave the UI in a broken state.

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST allow users to upload a single image file (JPEG/PNG) as the source.
- **FR-002**: System MUST validate that the input image is equirectangular with 2:1 aspect ratio and provide a clear error when it is not.
- **FR-003**: System MUST derive a single-channel brightness signal from the image for thickness generation.
- **FR-004**: System MUST support a user-configurable brightness curve that affects thickness output.
- **FR-005**: System MUST generate a spherical lithophane with a fixed inner surface (constant radius) and an outer surface offset outward to represent thickness.
- **FR-006**: System MUST constrain thickness to a user-defined minimum and maximum.
- **FR-007**: System MUST apply a sphere-specific compensation so that image detail remains visible across the full sphere and does not collapse to only the central viewing area.
- **FR-008**: System MUST provide an interactive 3D preview that allows the user to rotate and zoom the model.
- **FR-009**: System MUST allow users to export the generated model as an STL file.
- **FR-010**: System MUST ensure the exported model is a single watertight, closed solid suitable for 3D printing.
- **FR-011**: System MUST provide sensible default parameters so a first-time user can generate a model without tuning.
- **FR-012**: System MUST show user-friendly error messages for invalid inputs and generation failures.

### Requirement Acceptance Criteria

- **FR-001**: Upload control accepts JPEG/PNG and rejects other types with a clear message.
- **FR-002**: A non-2:1 image is rejected with an explanation; a 2:1 image proceeds to generation.
- **FR-003**: A pure black source produces a thicker result than a pure white source under the same settings.
- **FR-004**: Changing the brightness curve visibly changes the preview and changes exported geometry (file differs).
- **FR-005**: The model has a constant inner surface radius and thickness appears only as outward variation.
- **FR-006**: For any pixel/region, generated thickness never goes below the configured minimum or above the configured maximum.
- **FR-007**: Using a test panorama with recognizable features near the poles, those features remain visible in the generated preview (not only at the equator/front).
- **FR-008**: User can rotate and zoom the preview without regenerating the model.
- **FR-009**: Export action downloads an STL file without requiring additional steps.
- **FR-010**: Exported STL imports into a typical slicer as a single solid object without manual repair.
- **FR-011**: With default settings and a valid image, the user can generate and export successfully.
- **FR-012**: When generation fails, the UI returns to an interactive state and provides a next-step suggestion.

### Out of Scope (v1)

- Physically-accurate light simulation or real-world photometric matching.
- Automatic model splitting (e.g., hemispheres) or joinery features.
- Multi-image compositing or time-based/animated displays.

### Key Entities *(include if feature involves data)*

- **Source Image**: Uploaded equirectangular 2:1 image; includes metadata such as dimensions and file type.
- **Lithophane Parameters**: User-controlled settings such as sphere radius, min/max thickness, and brightness mapping.
- **Generated Model**: The spherical lithophane geometry derived from the image and parameters.
- **Export File**: The downloadable STL representation of the generated model.

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: A first-time user can upload a valid 2:1 image and obtain a visible 3D preview in under 2 minutes (including reading and interacting with the UI).
- **SC-002**: For a 4096×2048 image, model generation completes in under 30 seconds in a current desktop browser on typical consumer hardware.
- **SC-003**: Exported STL files import into a typical slicer as a watertight solid without requiring manual mesh repair steps.
- **SC-004**: In a qualitative review by at least 3 testers, recognizable image detail is visible not only at the front-facing area but also in near-polar regions of the sphere.

## Assumptions

- The input is a single equirectangular panorama intended to wrap around the sphere.
- Units presented to users are millimeters.
- The v1 experience is single-user with no accounts, no sharing, and no persistence requirements beyond the current session.
