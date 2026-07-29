/**
 * bom.js — Hierarchical BOM (Zone → Entity) + CSV export
 */

import { getProject, getZone, getMountHeight, getAllFixtures, getAllSpeakers } from './state.js';

/**
 * Generate structured BOM data
 * Returns: { zones: [{ zoneName, area, entities: [...] }], totals: { fixtureCount, speakerCount } }
 */
export function generateBOM() {
  const proj = getProject();
  let totalFixtures = 0;
  let totalSpeakers = 0;

  const zones = proj.zones.map(zone => {
    const fixtures = zone.entities.filter(e => e.type === 'fixture');
    const speakers = zone.entities.filter(e => e.type === 'speaker');
    totalFixtures += fixtures.length;
    totalSpeakers += speakers.length;

    // Group by model
    const fixtureGroups = groupByModel(fixtures);
    const speakerGroups = groupByModel(speakers);

    return {
      zoneId: zone.id,
      zoneName: zone.name,
      area: calculateArea(zone.boundary),
      roomHeight: zone.roomHeight,
      fixtureCount: fixtures.length,
      speakerCount: speakers.length,
      fixtureGroups,
      speakerGroups,
      entities: zone.entities.map(e => ({
        id: e.id,
        type: e.type,
        modelKey: e.modelKey,
        modelName: getModelName(e.modelKey),
        position: e.position,
        rotation: e.rotation,
        aff: e.aff,
        aas: e.aas,
        mountHeight: getMountHeight(e),
      })),
    };
  });

  return {
    projectName: proj.meta.name,
    zones,
    totals: { fixtureCount: totalFixtures, speakerCount: totalSpeakers },
  };
}

function groupByModel(entities) {
  const groups = {};
  for (const e of entities) {
    const key = e.modelKey;
    if (!groups[key]) {
      groups[key] = { modelKey: key, name: getModelName(key), count: 0, entities: [] };
    }
    groups[key].count++;
    groups[key].entities.push(e);
  }
  return Object.values(groups);
}

function getModelName(modelKey) {
  const lib = getProject().modelLibrary;
  return lib[modelKey]?.name || modelKey;
}

function calculateArea(boundary) {
  if (!boundary || boundary.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < boundary.length; i++) {
    const j = (i + 1) % boundary.length;
    area += boundary[i].x * boundary[j].y;
    area -= boundary[j].x * boundary[i].y;
  }
  return Math.abs(area) / 2;
}

// --- HTML render (for inline display) ---

export function renderBOMHTML() {
  const data = generateBOM();
  let html = `<div class="bom-report">
  <h3>Bill of Materials</h3>
  <p class="bom-project">${escapeHtml(data.projectName || 'Untitled')}</p>
  <p class="bom-summary">${data.totals.fixtureCount} fixtures, ${data.totals.speakerCount} speakers across ${data.zones.length} zones</p>`;

  for (const zone of data.zones) {
    html += `<div class="bom-zone">
      <h4>${escapeHtml(zone.zoneName)}</h4>
      <p class="bom-meta">Area: ${zone.area.toFixed(1)} ft² · Room height: ${zone.roomHeight}'</p>`;

    if (zone.fixtureGroups.length) {
      html += '<table class="bom-table"><tr><th>Fixture</th><th>Count</th><th>Mount</th></tr>';
      for (const g of zone.fixtureGroups) {
        html += `<tr><td>${escapeHtml(g.name)}</td><td>${g.count}</td><td>AFF ${g.entities[0].aff}'</td></tr>`;
      }
      html += '</table>';
    }

    if (zone.speakerGroups.length) {
      html += '<table class="bom-table"><tr><th>Speaker</th><th>Count</th><th>Mount</th></tr>';
      for (const g of zone.speakerGroups) {
        const mountInfo = g.entities[0].aas
          ? `AAS ${g.entities[0].aas.affSurface}' above ${g.entities[0].aas.surfaceHeight}' surface`
          : `AFF ${g.entities[0].aff}'`;
        html += `<tr><td>${escapeHtml(g.name)}</td><td>${g.count}</td><td>${mountInfo}</td></tr>`;
      }
      html += '</table>';
    }

    html += '</div>';
  }

  html += '</div>';
  return html;
}

// --- CSV export ---

export function exportBOMCSV() {
  const data = generateBOM();
  const rows = [
    ['Zone', 'Type', 'Model', 'Model Name', 'X (ft)', 'Y (ft)', 'Mount Type', 'Mount Height (ft)', 'Rotation (°)'],
  ];

  for (const zone of data.zones) {
    for (const e of zone.entities) {
      const mountType = e.aas ? 'AAS' : 'AFF';
      const mountHeight = e.mountHeight;
      rows.push([
        zone.zoneName,
        e.type,
        e.modelKey,
        e.modelName,
        e.position.x.toFixed(2),
        e.position.y.toFixed(2),
        mountType,
        mountHeight.toFixed(1),
        e.rotation.toFixed(0),
      ]);
    }
  }

  return rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
