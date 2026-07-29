/**
 * export-3d.js — GLTF/OBJ extrusion from zones + entities
 *
 * Builds a Three.js scene from the current project:
 * - Zones extruded as transparent boxes (roomHeight)
 * - Entities as colored cylinders/spheres at mountHeight
 *
 * Downloads as GLTF binary (.glb) via Three.js GLTFExporter.
 * ponytail: Minimal geometry — trades only need rough layout.
 */

import { getProject, getMountHeight } from './state.js';

/**
 * Build a Three.js scene from the project data.
 * @param {*} THREE — the Three.js module reference
 * @returns {THREE.Scene}
 */
export function buildScene(THREE) {
  const proj = getProject();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  // Ambient light for basic visibility
  const ambient = new THREE.AmbientLight(0x666666);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  // Grid helper at floor level
  const grid = new THREE.GridHelper(50, 20, 0x444444, 0x333333);
  scene.add(grid);

  // Extrude each zone
  for (const zone of proj.zones) {
    const zoneGroup = new THREE.Group();
    zoneGroup.name = `zone-${zone.name}`;

    if (zone.boundary && zone.boundary.length >= 3) {
      // Floor slab
      const floorShape = boundaryToShape(zone.boundary);
      const floorGeo = new THREE.ShapeGeometry(floorShape);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x333366,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.y = 0.01;
      floorMesh.name = `floor-${zone.name}`;
      zoneGroup.add(floorMesh);

      // Walls (extrude floor to ceiling)
      const extrudeSettings = {
        depth: zone.roomHeight || 8,
        bevelEnabled: false,
      };
      const wallGeo = new THREE.ExtrudeGeometry(floorShape, extrudeSettings);
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x446688,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        wireframe: false,
      });
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.y = 0;
      wallMesh.name = `walls-${zone.name}`;
      zoneGroup.add(wallMesh);

      // Wireframe outline for clarity
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0x6699cc,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
      });
      const wireMesh = new THREE.Mesh(wallGeo.clone(), wireMat);
      wireMesh.position.y = 0;
      wireMesh.name = `wire-${zone.name}`;
      zoneGroup.add(wireMesh);
    }

    // Place entities
    for (const entity of zone.entities) {
      const mh = getMountHeight(entity);
      const color = entity.type === 'fixture' ? 0xffcc44 : 0x44aaff;
      const radius = entity.type === 'fixture' ? 0.3 : 0.4;
      const height = 0.2;

      const entGroup = new THREE.Group();
      entGroup.name = `entity-${entity.id}`;

      // Disc at mount height
      const discGeo = new THREE.CylinderGeometry(radius, radius, height, 16);
      const discMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.set(entity.position.x, mh, entity.position.y);
      disc.rotation.y = (entity.rotation || 0) * Math.PI / 180;
      entGroup.add(disc);

      // Vertical stem from floor to mount height
      const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, mh, 4);
      const stemMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.4 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(entity.position.x, mh / 2, entity.position.y);
      entGroup.add(stem);

      // Label sprite (optional — use position for simplicity)
      entGroup.position.set(0, 0, 0);

      zoneGroup.add(entGroup);
    }

    scene.add(zoneGroup);
  }

  return scene;
}

/**
 * Convert boundary array {x,y}[] to THREE.Shape
 */
function boundaryToShape(boundary) {
  const shape = new THREE.Shape();
  shape.moveTo(boundary[0].x, boundary[0].y);
  for (let i = 1; i < boundary.length; i++) {
    shape.lineTo(boundary[i].x, boundary[i].y);
  }
  shape.closePath();
  return shape;
}

/**
 * Export scene as GLTF binary blob via GLTFExporter.
 * Must be called from a browser context where THREE is loaded.
 */
export async function exportGLTF(THREE) {
  // Dynamic import of the exporter
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const scene = buildScene(THREE);
  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (glb) => {
        if (glb instanceof ArrayBuffer) {
          resolve(new Blob([glb], { type: 'application/octet-stream' }));
        } else {
          // JSON GLTF — stringify
          resolve(new Blob([JSON.stringify(glb, null, 2)], { type: 'application/json' }));
        }
      },
      (err) => reject(err),
      { binary: true, trs: false, onlyVisible: true }
    );
  });
}

/**
 * Build scene and download as .glb
 */
export async function downloadGLTF(THREE, filename = 'audio-lighting-sim-3d.glb') {
  const blob = await exportGLTF(THREE);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
