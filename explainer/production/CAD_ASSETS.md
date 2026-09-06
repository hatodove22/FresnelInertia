# Explainer CAD assets

## Deliverables

- `device-cad.glb`: real visible BRep geometry tessellated through the installed Fusion API. GLB 2.0, 1.91 MB, 57 mesh nodes, 51,610 triangles. Each mesh is independently addressable.
- `device-cad-metadata.json`: exact exported node names, bounding boxes, component centers, source boundaries and suggested camera.
- `device-cad-preview.png`: Chrome / Three.js GLTFLoader visual verification.
- `fusion-active-view.png`: Fusion viewport exported at 2400 × 1800.
- `fusion-visible-meshes.json`: intermediate positions, normals, indices and assembly transforms, retained for reproducibility.
- `FusionExplainerExport/`: read-only Fusion export script and manifest. Registered manually through the existing Fusion Scripts and Add-ins UI; no auto-run.
- `convert_fusion_glb.py`: standalone standard-library Python conversion.
- `preview.html`: local verification viewer. Imports the existing repository's Three.js install.
- `easyeda-project-thumbnail-6.webp`: PCB view embedded in the current local EasyEDA project file. 1920 × 1360. This is cached design evidence, not a fabrication or as-built verification image. Other numbered thumbnails are extracted companion schematic previews and are not presentation-ready.

## Scale and orientation

GLB coordinates are meters. Translation recenters the assembly; original CAD XYZ orientation is preserved. The exported axes are **not** automatically the firmware's calibrated body frame.

Overall visible bounding dimensions in CAD XYZ: **63.000 × 74.033 × 74.030 mm**. The main surrounding ring spans 70 × 70 mm in CAD YZ; the controller envelope increases the overall bounding dimensions.

A useful oblique camera is `(0.12, 0.08, 0.12)`, target `(0,0,0)`, up `(0,1,0)`, vertical FOV 35 degrees. The viewer was visually checked at this direction.

Parts can be matched by these substrings (Three.js may sanitize punctuation):

- `fin:1`, `fin:4`: left/right fingertip contact-plane components.
- `pinion:1`, `pinion:3`: their transmission gears.
- `XL,XC-330 v1:1`, `XL,XC-330 v1:2`: two servo assemblies, subdivided into cases, horns, screws and connectors.
- `HapticReactor:1` … `HapticReactor:4`: four transducer **envelopes already simplified in the source CAD**. Each envelope measures 16 × 6.2 × 23 mm in its local frame. Do not describe these boxes as full detailed actuator CAD.
- `M5 ATOM Matrix`: controller envelope retained in the CAD. The implemented hardware is **AtomS3** per current repository docs.

GLB nodes have `extras.role` (`servo`, `contactPlane`, `vibration`, `controller`, `structure`) and `extras.centerMeters`. These become `userData` through GLTFLoader. The first node is a common assembly group; subsequent nodes hold world-positioned geometry.

## Provenance and limitations

Source was the user's already open **VRSJ2026 v30** Fusion design. Its window already showed an unsaved-change asterisk before this work. The export queried visible component/body geometry and calculated meshes, then wrote files under this output directory. **No original CAD geometry, placements, visibility, materials or document saves were changed.**

A read-only cache copy was also located at:

`C:/Users/tesul/AppData/Local/Autodesk/Autodesk Fusion 360/XNYLK4UT325T/W.login/F/_VRSJ2026.98e3055e-673e-4339-8d7d-b929eaa2400c.f3d`

The active design was preferred to this cache for the export. FSR400, old MAX98357A breakout assemblies and other hidden components were excluded. The current custom PCB is not present in this mechanical GLB. Do not turn the CAD's legacy M5 ATOM Matrix part name into a claim that the current controller is Matrix.

Colors are an approximate PBR conversion of Fusion appearance properties. Surface colors can be restyled for explanation without affecting geometric fidelity. In particular, a darker servo case and bright transducer highlight improve contrast on an ink-black background. Colors are not measured as-built finishes.

EasyEDA evidence was read from:

`C:/Users/tesul/Documents/EasyEDA-Pro/projects/M5AtomS3_MAX98357A_4CH_TDM_DXL2.eprj2`

The SQLite database was opened with `mode=ro`. Its embedded `project_images` table supplied the thumbnails. Document history is stored separately in that project format, so cached preview freshness relative to the final assembled PCB is not established. A matching 2026-07-31 Gerber archive and BOM/CPL exports are also present in Downloads, but were not represented as a 3D board.

## Verification

- Fusion API: **57 bodies, 0 export errors**.
- GLB constructed with correct aligned chunks, vertex/index accessors and meter coordinates.
- Chrome + Three.js GLTFLoader: all 57 bodies loaded; oblique rendering inspected for assembly consistency, gaps, clipping and shading.
- Inspected artifact: `device-cad-preview.png`.
- No firmware, serial ports, USB devices or actuators were accessed.

