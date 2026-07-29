# Audio Lighting Sim v2 — Architecture

## Principle

Zero-dependency browser app. Static HTML/JS/CSS served from a laptop. No build step, no server, no npm. iPad-compatible for CEDIA demo floor.

## Data Model

```
Project
├── meta: { name, created }
├── calibration: { p1: {x,y}, p2: {x,y}, realLengthFeet }  // scale tool
├── floorPlan: { dataUrl, naturalW, naturalH }
├── zones[]
│   ├── id, name, color
│   ├── boundary: {x,y}[]          // closed polygon, world-space feet
│   ├── roomHeightFeet: number
│   └── entities[]
│       ├── id
│       ├── type: 'fixture' | 'speaker'
│       ├── modelKey: string       // references modelLibrary entry
│       ├── position: {x, y}       // world-space feet
│       ├── rotation: number       // degrees
│       ├── aff: number            // Above Finished Floor (feet, required)
│       └── aas: { affSurface: number, surfaceHeight: number } | null
│
├── modelLibrary: Map<modelKey, ModelDef>
│   // Populated from built-in presets + uploaded .ies and .gll.json files
│
└── orphans: entities[]            // entities before zone assignment (optional)
```

**AFF/AAS resolution:**
- If `aas` is null: mountHeight = aff
- If `aas` is set: mountHeight = aas.affSurface + aas.surfaceHeight
- Heatmap and 3D extrusion use mountHeight.

## File Tree

```
audio-lighting-sim-v2/
├── index.html           // shell with toolbar, palette, zone panel, info panel
├── css/
│   └── style.css
├── lib/
│   ├── lighting.js      // IES parse + illuminance calc (from v1, unchanged)
│   ├── acoustic.js      // SPL coverage (from v1, unchanged)
│   ├── coverage.js      // grid sampling + heatmap render (from v1, unchanged)
│   └── speaker-lib.js   // speaker presets + GLL JSON import (from v1, unchanged)
├── js/
│   ├── app.js           // entry: scene, camera, render loop, wire modules
│   ├── state.js         // Project data model + localStorage save/load
│   ├── calibration.js   // Click-two-points ruler tool
│   ├── zones.js         // Zone polygon draw, edit, select, name
│   ├── entity.js        // Create entity with AFF/AAS dialog, place, select, drag, delete
│   ├── palette.js       // Preset cards, IES upload, GLL upload → modelLibrary
│   ├── heatmap.js       // Zone-filtered lux/SPL heatmap with resolution slider
│   ├── bom.js           // Hierarchical zone→entity BOM (inline + CSV export)
│   ├── export-3d.js     // Extrude zones + entities to GLTF/OBJ
│   └── toolbar.js       // Button state, layer toggle, export triggers
```

## Module Responsibilities

### `state.js`
- Pure data. Holds `currentProject` object.
- `createProject()`, `addZone()`, `removeZone()`, `addEntity(zoneId, ...)`, `removeEntity(zoneId, entityId)`
- `saveProject()`, `loadProjectList()`, `loadProject(name)`, `deleteProject(name)` — all localStorage
- `exportProjectJSON()`, `importProjectJSON(file)` — download/upload for transfer between machines

### `calibration.js`
- User clicks two points on the floor plan → draws a temporary dashed line + ruler label
- Prompt: "How long is this wall?" (feet)
- Sets `project.calibration`: `{ p1, p2, realLengthFeet, pixelsPerFoot }`
- All subsequent world-space operations use pixelsPerFoot.
- Shows a permanent scale bar on the floor plan.

### `zones.js`
- Button: "Draw Zone" → enters polygon draw mode. Click-to-place vertices. Double-click or click-on-first-vertex closes polygon.
- After close: modal asks for zone name and room height (default 8').
- Zone displays as a filled translucent polygon with name label.
- Zones are clickable to select → shows zone panel (rename, delete, room height edit, entity list).
- Zone boundary is draggable (move vertex) for refinement.

### `entity.js`
- User clicks a palette card → enters place mode.
- Click inside a zone → AFF dialog pops (required field: height in feet).
- Optional toggle for AAS → shows two fields: "Above Surface" and "Surface Height" (defaults: 2' above a 2.5' counter).
- Confirm → entity appears as a colored circle/icon at the grid intersection nearest the click point.
- Entity is clickable → shows info panel: model, AFF/AAS, rotation slider, delete.
- Entity is draggable within its zone (cannot drag outside zone boundary).
- Delete: key or right-click menu.
- Rotation: slider in info panel (for wall speakers / directional fixtures).

### `palette.js`
- Cards for 5 built-in presets (narrow downlight, wide flood, ceiling speaker, wall speaker, subwoofer).
- "Upload IES" button — parses IES file, adds a new fixture type to the palette (modelLibrary).
- "Upload GLL" button — adds speaker type to palette.
- Selected palette card highlights. Click again to deselect.

### `heatmap.js`
- Wraps the v1 simulation modules. Accepts a resolution parameter (grid cells per foot) and a sensitivity scaling factor.
- On any entity add/remove/move/aff-change: recalculate. Debounced at 200ms.
- Respects layer toggle: Light = only fixtures' illuminance, Sound = only speakers' SPL, Both = composite overlay.
- Resolution slider: coarse (fast) to fine (accurate). Default 2 cells/ft.
- Sensitivity slider: multiplier on contribution (0.5x–2x) for dynamic range tuning.

### `bom.js`
- Reads all zones and entities from state.
- Generates: Zone → [Model, AFF/AAS, Count, Position, Wattage/BeamAngle]. Hierarchical grouping.
- Inline viewer panel (expandable per zone).
- CSV export: one row per entity with zone column.

### `export-3d.js`
- Takes zones (extruded by roomHeight) and entities (at mountHeight positions) → builds a Three.js scene.
- Downloads as GLTF binary or OBJ.
- ponytail: Minimal geometry — box rooms, cylinder/disc entities. Trades only need rough layout, not photoreal.

## Interaction States

| State | Entry | Events |
|-------|-------|--------|
| **Idle** | Default | Pan/zoom floor plan, select zone or entity, toggle layers |
| **Draw Zone** | Click "Draw Zone" | Clicks add polygon vertices. Double-click or close-loop completes. |
| **Place Entity** | Click palette card | Click inside zone → AFF dialog → entity created. Escape cancels. |
| **Calibrate** | Click "Calibrate" | Click two points → length prompt → scale set. |
| **Select Zone** | Click zone polygon | Zone panel shows with entity list, room height, delete. |
| **Select Entity** | Click entity circle | Entity panel shows with AFF/AAS, rotation, delete. |
| **Drag Entity** | Mousedown on entity | Entity follows cursor within zone boundary. Mouseup confirms new position. |

## Export Flow

```
                 ┌─────────────┐
                 │  Floor Plan  │
                 │  (SVG/PDF)   │
                 └──────┬──────┘
                        │
  ┌─────────────────────┼──────────────────────┐
  │                     │                      │
  ▼                     ▼                      ▼
┌────────┐       ┌────────────┐        ┌──────────────┐
│   BOM   │       │  Plan View  │        │  3D (GLTF)   │
│  (CSV)  │       │ (plan+ents) │        │  (zones+ents) │
└────────┘       └────────────┘        └──────────────┘
```

- **BOM CSV** — for client / procurement.
- **Plan view** — Printable page: floor plan image with zone boundaries, entity callouts (model + AFF), scale bar, title block. PNG or browser-print-to-PDF.
- **3D GLTF** — For trades (AV installer, electrician). Zones as transparent boxes, entities as colored markers at correct heights.

## v1 → v2 Migration

None. v1 stays as-is under `static/audio-lighting-sim/`. v2 is a clean directory `static/audio-lighting-sim-v2/`. The only shared code is `lib/` — a pure-copy of the v1 simulation modules with zero changes.

---

*Last updated: 2026-07-28*
*Status: Architecture draft — ready to build.*
