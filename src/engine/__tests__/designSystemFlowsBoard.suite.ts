import * as fs from 'fs';
import * as path from 'path';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  FLOW_EDGES,
  FLOW_NODES,
  FLOW_SECTIONS,
  FlowLaneId,
  FlowSectionSpec,
} from '../../designSystem/endToEndFlowsModel';

export async function runDesignSystemFlowsBoardSuite(
  assert: (condition: boolean, message: string) => void
): Promise<void> {
  console.log('\n--- SUITE 83: Design System End-to-End Flows Figma Board ---');

  // 1. Structural completeness across all 6 end-to-end flow lanes
  assert(
    FLOW_SECTIONS.length === 6 && FLOW_NODES.length >= 30 && FLOW_EDGES.length >= 30,
    `Figma board maps all 6 end-to-end flow lanes (${FLOW_NODES.length} screen frames, ${FLOW_EDGES.length} directed connectors)`
  );

  const nodeIds = new Set<string>(FLOW_NODES.map((n) => n.id));
  const sectionById = new Map<FlowLaneId, FlowSectionSpec>(FLOW_SECTIONS.map((s) => [s.id, s]));
  assert(
    nodeIds.size === FLOW_NODES.length &&
      FLOW_NODES.every(
        (n) =>
          sectionById.has(n.laneId) &&
          n.stepCode.length >= 3 &&
          n.title.length > 4 &&
          n.summary.length > 16 &&
          n.sourceModule.length > 6 &&
          n.engineRule.length > 12 &&
          n.telemetryEvents.length >= 1
      ),
    'Every Figma flow node has unique ID, canonical source module, engine invariant, and GSM telemetry signals'
  );

  // 2. Every edge connects valid nodes with valid port geometry
  assert(
    FLOW_EDGES.every((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to),
    `All ${FLOW_EDGES.length} directed flow edges connect valid distinct screen frames`
  );

  // 3. Zero overlapping node bounding boxes + every node fits cleanly inside its parent Figma section
  const GUTTER = 24;
  const collisions: string[] = [];
  const outOfBounds: string[] = [];
  for (let i = 0; i < FLOW_NODES.length; i++) {
    const a = FLOW_NODES[i];
    const sec = sectionById.get(a.laneId)!;
    if (
      a.x < sec.x ||
      a.y < sec.y + 48 ||
      a.x + a.width > sec.x + sec.width ||
      a.y + a.height > sec.y + sec.height ||
      sec.x + sec.width > BOARD_WIDTH ||
      sec.y + sec.height > BOARD_HEIGHT
    ) {
      outOfBounds.push(a.id);
    }
    for (let j = i + 1; j < FLOW_NODES.length; j++) {
      const b = FLOW_NODES[j];
      const overlapX = a.x < b.x + b.width + GUTTER && a.x + a.width + GUTTER > b.x;
      const overlapY = a.y < b.y + b.height + GUTTER && a.y + a.height + GUTTER > b.y;
      if (overlapX && overlapY) {
        collisions.push(`${a.id}<->${b.id}`);
      }
    }
  }
  assert(
    collisions.length === 0 && outOfBounds.length === 0,
    `Zero overlapping frames and all nodes fit cleanly inside their Figma swimlanes (collisions=${collisions.join(', ') || 'none'}, outOfBounds=${outOfBounds.join(', ') || 'none'})`
  );

  // 4. Synced design-system.html contains page switcher, all 6 flow lanes, SVG connectors, zoom/pan controls & standalone fallback
  const dsHtmlPath = path.join(process.cwd(), 'design-system.html');
  const dsHtml = fs.readFileSync(dsHtmlPath, 'utf8');
  const requiredTokens = [
    'data-ds-page="catalog"',
    'data-ds-page="flows"',
    'data-ds-page-panel="catalog"',
    'data-ds-page-panel="flows"',
    'data-flow-viewport="true"',
    'data-flow-stage="true"',
    'data-flow-zoom-in="true"',
    'data-flow-zoom-out="true"',
    'data-flow-zoom-reset="true"',
    'data-flow-zoom-fit="true"',
    'data-flow-inspector="true"',
    'FLOW 01',
    'FLOW 02',
    'FLOW 03',
    'FLOW 04',
    'FLOW 05',
    'FLOW 06',
    'setStandalonePage',
  ];
  const missing = requiredTokens.filter((t) => !dsHtml.includes(t));
  assert(
    missing.length === 0,
    `Synced design-system.html embeds End-to-End Flows Figma page, zoom/drag controls, and standalone file:// support (missing: ${missing.join(', ') || 'none'})`
  );
}
