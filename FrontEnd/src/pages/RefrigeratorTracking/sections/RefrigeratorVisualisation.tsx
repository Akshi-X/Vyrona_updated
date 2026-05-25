import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  EquirectangularReflectionMapping,
  Fog,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  ShadowMaterial,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Snowflake, Thermometer, TrendingUp } from 'lucide-react';
import type { ActivityLogRecord } from '../../../services/activityLogService';
import { tasksService, type Task } from '../../../services/tasksService';
import type { RefrigeratorSensorTile } from './useRefrigeratorKpiSnapshot';
import StakeholderChatBox from '../../../components/StakeholderChatBox';
import MyTasksModal, { type MyTask } from '../../../components/MyTasksModal';
import RefrigeratorKpiChartModal from './RefrigeratorKpiChartModal';

/**
 * Procedural 3D refrigerator. Two stacked glass-door compartments: top =
 * refrigerator (lavender accent), bottom = freezer (blue accent), charcoal
 * anodised body, four legs, subtle ground grid. Drag to rotate.
 *
 * Geometry/materials are procedural (no GLB), mirroring the cryocan/incubator
 * approach already in the codebase.
 */

export type RefrigeratorVisualisationProps = {
  sensorTiles?: RefrigeratorSensorTile[];
  selectedSensorId?: string | null;
  onSensorSelect?: (sensorId: string) => void;

  freezerTemp?: number | null;
  fridgeTemp?: number | null;
  hasAlert?: boolean;
  doorStatus?: 'open' | 'closed';

  systemActivity?: ActivityLogRecord[];
  tasks?: Task[];
  onTaskCreated?: () => void;
  onEditTask?: (task: MyTask) => Promise<void>;
  currentUserName?: string;
  currentUserId?: string;

  refrigeratorCode?: string;
  refrigeratorId?: number;
  branchName?: string;
};

const FRIDGE_TIPS = [
  'Refrigerator compartment should be maintained between 2 °C and 8 °C for culture media and reagent storage.',
  'Freezer compartment must remain at −20 °C or below to preserve cryoprotectants and enzymes.',
  'Inspect door seals monthly — a compromised gasket can cause a measurable daily temperature drift.',
  'Never place items directly against the rear wall; allow clearance for even air circulation.',
  'Log any temperature excursion immediately and quarantine affected batches pending assessment.',
  'Allow warm reagents to reach equilibrium before returning them to the refrigerator after use.',
  'Perform a full inventory audit quarterly and remove expired or near-expiry items promptly.',
  'Dedicate separate shelves for culture media, reagents, and cryoprotectants to prevent cross-contamination.',
  'Avoid frequent door-opening cycles during active lab sessions to minimise thermal fluctuation.',
  'Ensure the unit is not placed near heat sources or direct sunlight to reduce compressor workload.',
];

// ── Geometry constants ────────────────────────────────────────────────────────
const BODY_W = 1.6;
const BODY_H = 3.0;
const BODY_D = 1.4;
// Split: fridge (top) is taller, freezer (bottom) is shorter (~2/3 : 1/3).
const FRIDGE_H = BODY_H * 0.6;
const FREEZER_H = BODY_H * 0.4;
const LEG_H = 0.08;
const DOOR_THICK = 0.06;
const DOOR_INSET = 0.04;
const GLASS_INSET = 0.085;

const FRIDGE_TINT = new Color('#b48cf7'); // lavender
const FREEZER_TINT = new Color('#5db4ff'); // sky blue
const BODY_COLOR = new Color('#2b2d34');
const BODY_ACCENT = new Color('#4a4d57');

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildEnvironmentTexture(renderer: WebGLRenderer): Texture {
  // Procedural sky→ground gradient used for soft reflections on glass + metal.
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#dfe6ef');
  grad.addColorStop(0.5, '#f4f1ec');
  grad.addColorStop(1.0, '#b6b9c0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  const tex = new Texture(canvas);
  tex.mapping = EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

function buildCompartment(
  width: number,
  height: number,
  depth: number,
  tint: Color,
  isFridge: boolean,
  bodyMat: MeshStandardMaterial,
  trimMat: MeshStandardMaterial,
): {
  group: Group;
  doorHit: Mesh;
  doorGroup: Group;
  highlightRing: Mesh;
  interiorLight: PointLight;
  interiorBack: Mesh;
} {
  const group = new Group();

  // Inner cavity walls (slightly inset)
  const cavityW = width - 0.18;
  const cavityH = height - 0.16;
  const cavityD = depth - 0.16;
  const interiorMat = new MeshStandardMaterial({
    color: new Color(tint).lerp(new Color('#0c0c10'), 0.55),
    roughness: 0.85,
    metalness: 0.05,
    side: DoubleSide,
  });
  const back = new Mesh(new PlaneGeometry(cavityW, cavityH), interiorMat);
  back.position.set(0, 0, -cavityD / 2);
  group.add(back);

  // Subtle inner side walls so the cavity reads as a box, not a card
  const sideMat = interiorMat.clone();
  sideMat.color = new Color(tint).lerp(new Color('#101015'), 0.4);
  const leftWall = new Mesh(new PlaneGeometry(cavityD, cavityH), sideMat);
  leftWall.position.set(-cavityW / 2, 0, 0);
  leftWall.rotation.y = Math.PI / 2;
  group.add(leftWall);
  const rightWall = new Mesh(new PlaneGeometry(cavityD, cavityH), sideMat);
  rightWall.position.set(cavityW / 2, 0, 0);
  rightWall.rotation.y = -Math.PI / 2;
  group.add(rightWall);
  const topWall = new Mesh(new PlaneGeometry(cavityW, cavityD), sideMat);
  topWall.position.set(0, cavityH / 2, 0);
  topWall.rotation.x = Math.PI / 2;
  group.add(topWall);
  const bottomWall = new Mesh(new PlaneGeometry(cavityW, cavityD), sideMat);
  bottomWall.position.set(0, -cavityH / 2, 0);
  bottomWall.rotation.x = -Math.PI / 2;
  group.add(bottomWall);

  // Shelves — 3 for fridge (top), 2 for freezer (bottom)
  const shelfCount = isFridge ? 3 : 2;
  const shelfGeom = new BoxGeometry(cavityW * 0.92, 0.018, cavityD * 0.78);
  const shelfMat = new MeshPhysicalMaterial({
    color: new Color('#dfe7f2'),
    roughness: 0.05,
    metalness: 0.0,
    transmission: 0.85,
    transparent: true,
    opacity: 0.7,
    thickness: 0.05,
    ior: 1.45,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
    side: DoubleSide,
  });
  const shelfSpacing = cavityH / (shelfCount + 1);
  for (let i = 0; i < shelfCount; i++) {
    const shelf = new Mesh(shelfGeom, shelfMat);
    shelf.position.y = cavityH / 2 - shelfSpacing * (i + 1);
    shelf.position.z = 0.02;
    group.add(shelf);
  }

  // ── Shelf contents ────────────────────────────────────────────────────────
  const vialPalette = isFridge
    ? ['#c8a4d8', '#90b8e0', '#a8d4a0', '#e0c898', '#d4a0a8']
    : ['#7ab8e0', '#5aa8d8', '#90c8f0', '#60a8d0', '#a0d0f0'];
  const vR = isFridge ? 0.042 : 0.026;
  const vH = isFridge ? 0.13  : 0.09;

  for (let s = 0; s < shelfCount; s++) {
    const sy  = cavityH / 2 - shelfSpacing * (s + 1);
    const iy  = sy + 0.009 + vH / 2;
    // First fridge shelf: 4 vials on the left half + 3 boxes on the right half.
    // All other shelves: full-width row of vials.
    const hasBoxes = isFridge && s === 0;
    const vN    = hasBoxes ? 4 : (isFridge ? 6 : 7);
    const xSpan = hasBoxes ? cavityW * 0.50 : cavityW * 0.82;
    const vGap  = xSpan / vN;
    const vX0   = hasBoxes ? -cavityW * 0.42 + vGap / 2 : -xSpan / 2 + vGap / 2;

    for (let v = 0; v < vN; v++) {
      const col  = new Color(vialPalette[(v + s) % vialPalette.length]);
      const vMat = new MeshStandardMaterial({ color: col, roughness: 0.28, metalness: 0.08, transparent: true, opacity: 0.9 });
      const vial = new Mesh(new CylinderGeometry(vR, vR * 0.92, vH, 10), vMat);
      vial.position.set(vX0 + v * vGap, iy, 0.10);
      group.add(vial);
      const capMat = new MeshStandardMaterial({ color: col.clone().lerp(new Color('#ffffff'), 0.52), roughness: 0.35, metalness: 0.3 });
      const cap = new Mesh(new CylinderGeometry(vR * 1.08, vR * 1.08, 0.02, 10), capMat);
      cap.position.set(vX0 + v * vGap, iy + vH / 2 + 0.01, 0.10);
      group.add(cap);
    }

    if (hasBoxes) {
      const bW = 0.09, bH = 0.11, bD = 0.08;
      const bX0 = cavityW * 0.10;
      for (let b = 0; b < 3; b++) {
        const bx  = bX0 + b * (bW + 0.04);
        const box = new Mesh(new BoxGeometry(bW, bH, bD),
          new MeshStandardMaterial({ color: new Color('#ccd8e4'), roughness: 0.45, metalness: 0.04 }));
        box.position.set(bx, sy + 0.009 + bH / 2, 0.10);
        group.add(box);
        // Label strip on the front face of each box
        const lbl = new Mesh(new BoxGeometry(bW * 0.72, 0.012, 0.001),
          new MeshBasicMaterial({ color: new Color('#8090a4') }));
        lbl.position.set(bx, sy + 0.009 + bH * 0.6, 0.10 + bD / 2 + 0.001);
        group.add(lbl);
      }
    }
  }

  // Door frame (slim ring around the glass)
  const frameThick = 0.08;
  const frameMat = trimMat;
  const frameTopBot = new BoxGeometry(width - DOOR_INSET * 2, frameThick, DOOR_THICK);
  const frameSide = new BoxGeometry(frameThick, height - DOOR_INSET * 2 - frameThick * 2, DOOR_THICK);

  const doorGroup = new Group();
  // Door geometry is pivoted on the LEFT edge so it can swing open later if
  // door state ever animates. Hinge axis runs along (−width/2, 0, depth/2).
  const hinge = new Group();
  hinge.position.set(-width / 2 + DOOR_INSET, 0, depth / 2);
  doorGroup.add(hinge);

  const frameOffset = width / 2 - DOOR_INSET;

  const top = new Mesh(frameTopBot, frameMat);
  top.position.set(frameOffset, height / 2 - DOOR_INSET - frameThick / 2, 0);
  hinge.add(top);
  const bottom = new Mesh(frameTopBot, frameMat);
  bottom.position.set(frameOffset, -height / 2 + DOOR_INSET + frameThick / 2, 0);
  hinge.add(bottom);
  const left = new Mesh(frameSide, frameMat);
  left.position.set(frameThick / 2, 0, 0);
  hinge.add(left);
  const right = new Mesh(frameSide, frameMat);
  right.position.set(width - DOOR_INSET * 2 - frameThick / 2, 0, 0);
  hinge.add(right);

  // Glass pane — alpha-blended so the racks behind read clearly through it.
  // Using BasicMaterial keeps the pane fully see-through (no shading darkening
  // it) while a faint tint mimics the lit cavity colour from the reference.
  const glassW = width - DOOR_INSET * 2 - frameThick * 2 - GLASS_INSET * 2;
  const glassH = height - DOOR_INSET * 2 - frameThick * 2 - GLASS_INSET * 2;
  const glassMat = new MeshBasicMaterial({
    color: new Color(tint).lerp(new Color('#ffffff'), 0.6),
    transparent: true,
    opacity: 0.12,
    side: DoubleSide,
    depthWrite: false,
  });
  const glass = new Mesh(new PlaneGeometry(glassW, glassH), glassMat);
  glass.position.set(frameThick + GLASS_INSET + glassW / 2, 0, DOOR_THICK / 2 + 0.001);
  glass.renderOrder = 5;
  hinge.add(glass);

  // Soft white inner reflection band across the top of the glass — sells the
  // "lit interior" look from the reference without obscuring the shelves.
  const reflectMat = new MeshBasicMaterial({
    color: new Color('#ffffff'),
    transparent: true,
    opacity: 0.18,
    side: DoubleSide,
    depthWrite: false,
  });
  const reflect = new Mesh(new PlaneGeometry(glassW * 0.85, glassH * 0.15), reflectMat);
  reflect.position.set(frameThick + GLASS_INSET + glassW / 2, glassH * 0.35, DOOR_THICK / 2 + 0.002);
  reflect.renderOrder = 6;
  hinge.add(reflect);

  // Invisible hit mesh (placeholder for future interaction)
  const hitMat = new MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const doorHit = new Mesh(new PlaneGeometry(width, height), hitMat);
  doorHit.position.set(0, 0, depth / 2 + DOOR_THICK + 0.05);
  group.add(doorHit);

  // Handle (vertical bar on the right side of the door)
  const handleMat = new MeshStandardMaterial({
    color: new Color('#d6d8de'),
    roughness: 0.2,
    metalness: 0.95,
  });
  const handleHeight = Math.min(height * 0.4, 1.0);
  const handle = new Mesh(new CylinderGeometry(0.02, 0.02, handleHeight, 16), handleMat);
  handle.position.set(width / 2 - 0.12, 0, depth / 2 + DOOR_THICK + 0.04);
  group.add(handle);
  const handleTop = new Mesh(new CylinderGeometry(0.022, 0.022, 0.05, 16), handleMat);
  handleTop.rotation.x = Math.PI / 2;
  handleTop.position.set(width / 2 - 0.12, handleHeight / 2, depth / 2 + DOOR_THICK + 0.02);
  group.add(handleTop);
  const handleBot = new Mesh(new CylinderGeometry(0.022, 0.022, 0.05, 16), handleMat);
  handleBot.rotation.x = Math.PI / 2;
  handleBot.position.set(width / 2 - 0.12, -handleHeight / 2, depth / 2 + DOOR_THICK + 0.02);
  group.add(handleBot);

  // Highlight ring (drawn around the door when this zone is selected)
  const ringMat = new MeshStandardMaterial({
    color: new Color(tint),
    emissive: new Color(tint),
    emissiveIntensity: 0.0,
    transparent: true,
    opacity: 0.0,
    side: DoubleSide,
    metalness: 0.0,
    roughness: 0.6,
  });
  const ringPad = 0.02;
  const ringT = 0.025;
  const ringW = width + ringPad * 2;
  const ringH = height + ringPad * 2;
  const ring = new Group();
  const ringTop = new Mesh(new BoxGeometry(ringW, ringT, DOOR_THICK * 0.6), ringMat);
  ringTop.position.set(0, ringH / 2 - ringT / 2, depth / 2 + DOOR_THICK / 2);
  ring.add(ringTop);
  const ringBot = new Mesh(new BoxGeometry(ringW, ringT, DOOR_THICK * 0.6), ringMat);
  ringBot.position.set(0, -ringH / 2 + ringT / 2, depth / 2 + DOOR_THICK / 2);
  ring.add(ringBot);
  const ringLeft = new Mesh(new BoxGeometry(ringT, ringH, DOOR_THICK * 0.6), ringMat);
  ringLeft.position.set(-ringW / 2 + ringT / 2, 0, depth / 2 + DOOR_THICK / 2);
  ring.add(ringLeft);
  const ringRight = new Mesh(new BoxGeometry(ringT, ringH, DOOR_THICK * 0.6), ringMat);
  ringRight.position.set(ringW / 2 - ringT / 2, 0, depth / 2 + DOOR_THICK / 2);
  ring.add(ringRight);
  // We grab the first mesh as the "ring" handle for material toggling; all four
  // children share `ringMat`, so changing it affects all.
  const highlightRing = ringTop;
  group.add(ring);

  // Interior point light — illuminates the back wall + shelves
  const interiorLight = new PointLight(new Color(tint), 0.0, depth * 2.5, 1.4);
  interiorLight.position.set(0, cavityH / 2 - 0.05, -cavityD / 2 + 0.2);
  group.add(interiorLight);

  group.add(doorGroup);
  // Suppress unused-locals on the body material wiring (it's used elsewhere
  // when the compartment is composed into the cabinet).
  void bodyMat;

  return { group, doorHit, doorGroup, highlightRing, interiorLight, interiorBack: back };
}


export default function RefrigeratorVisualisation({
  sensorTiles = [],
  selectedSensorId,
  onSensorSelect,
  freezerTemp,
  fridgeTemp,
  hasAlert,
  systemActivity = [],
  tasks = [],
  onTaskCreated,
  onEditTask,
  currentUserName = '',
  currentUserId = '',
  refrigeratorCode,
  refrigeratorId,
  branchName,
}: RefrigeratorVisualisationProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<{
    renderer: WebGLRenderer;
    scene: Scene;
    camera: PerspectiveCamera;
    rafId: number;
    onResize: () => void;
    fridgeLight: PointLight;
    freezerLight: PointLight;
  } | null>(null);

  // ── Set up the scene once on mount ─────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    const { clientWidth, clientHeight } = mount;
    renderer.setSize(Math.max(clientWidth, 1), Math.max(clientHeight, 1));
    mount.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = null;
    // Lavender fog matches cryocan — fades the grid to a soft horizon so the
    // canvas reads as an infinity plane instead of a finite rectangle.
    scene.fog = new Fog(0xe8d4f4, 18, 55);
    const env = buildEnvironmentTexture(renderer);
    scene.environment = env;

    // Camera — pulled back so the full cabinet fits with headroom; slight
    // three-quarter angle so both doors and the side bevels are visible.
    const camera = new PerspectiveCamera(
      30,
      Math.max(clientWidth, 1) / Math.max(clientHeight, 1),
      0.1,
      100,
    );
    camera.position.set(3.8, 2.2, 8.4);
    const cameraTarget = new Vector3(0, BODY_H / 2 + LEG_H / 2, 0);
    camera.lookAt(cameraTarget);
    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    // ── Lights ──
    const ambient = new AmbientLight(0xffffff, 0.45);
    scene.add(ambient);

    const key = new DirectionalLight(0xffffff, 1.3);
    key.position.set(3.5, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0005;
    scene.add(key);

    const fill = new DirectionalLight(new Color('#cfd3df'), 0.45);
    fill.position.set(-3, 2, 3);
    scene.add(fill);

    const rim = new DirectionalLight(new Color('#b48cf7'), 0.55);
    rim.position.set(-2, 3, -3);
    scene.add(rim);

    // ── Floor (catches shadow only — fog handles the visible "ground") ──
    const floor = new Mesh(
      new PlaneGeometry(40, 40),
      new ShadowMaterial({ opacity: 0.22 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // ── Infinity grid (cryocan-style: large GridHelper that fades to fog) ──
    const GRID_SIZE = 80;
    const GRID_DIVS = 64;
    const floorGrid = new GridHelper(GRID_SIZE, GRID_DIVS, 0xc4a8dc, 0xc4a8dc);
    floorGrid.position.y = 0.0;
    const gridMat = floorGrid.material as LineBasicMaterial | LineBasicMaterial[];
    (Array.isArray(gridMat) ? gridMat : [gridMat]).forEach((m) => {
      m.transparent = true;
      m.opacity = 0.5;
      m.depthWrite = false;
    });
    scene.add(floorGrid);

    // ── Cabinet ──
    const cabinet = new Group();
    cabinet.position.y = LEG_H;
    scene.add(cabinet);

    const bodyMat = new MeshStandardMaterial({
      color: BODY_COLOR,
      roughness: 0.45,
      metalness: 0.7,
    });
    const trimMat = new MeshStandardMaterial({
      color: BODY_ACCENT,
      roughness: 0.35,
      metalness: 0.85,
    });

    // Main body — 6-material BoxGeometry where the front (+Z, group index 4)
    // is invisible. Without this, the solid front face would block sightlines
    // through the glass door and you'd never see the racks inside.
    // BoxGeometry group order: [+X, -X, +Y, -Y, +Z, -Z].
    const invisibleFront = new MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    });
    const body = new Mesh(new BoxGeometry(BODY_W, BODY_H, BODY_D), [
      bodyMat,         // +X right
      bodyMat,         // -X left
      bodyMat,         // +Y top
      bodyMat,         // -Y bottom
      invisibleFront,  // +Z front  (cut-out for the doors)
      bodyMat,         // -Z back
    ]);
    body.position.y = BODY_H / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    cabinet.add(body);

    // Top accent strip
    const topStrip = new Mesh(new BoxGeometry(BODY_W + 0.02, 0.04, BODY_D + 0.02), trimMat);
    topStrip.position.y = BODY_H + 0.005;
    cabinet.add(topStrip);

    // Mid divider between fridge and freezer
    const divider = new Mesh(new BoxGeometry(BODY_W + 0.012, 0.025, BODY_D + 0.012), trimMat);
    divider.position.y = FREEZER_H;
    cabinet.add(divider);

    // ── Side / back / top details ──────────────────────────────────────────
    // Wireframe edges around the whole body — picks up the slate panel seams
    // and makes the silhouette read better as the cabinet rotates.
    const bodyEdges = new LineSegments(
      new EdgesGeometry(new BoxGeometry(BODY_W, BODY_H, BODY_D)),
      new LineBasicMaterial({ color: new Color('#1a1c20'), transparent: true, opacity: 0.5 }),
    );
    bodyEdges.position.y = BODY_H / 2;
    cabinet.add(bodyEdges);

    // Recessed side panel insets — gives the L/R sides the brushed-aluminium
    // panel look from the reference instead of a flat plane.
    const sidePanelMat = new MeshStandardMaterial({
      color: new Color('#3a3d46'),
      roughness: 0.35,
      metalness: 0.85,
    });
    const sidePanelW = BODY_D - 0.18;
    const sidePanelH = BODY_H - 0.22;
    [-1, 1].forEach((dir) => {
      const panel = new Mesh(new PlaneGeometry(sidePanelW, sidePanelH), sidePanelMat);
      panel.position.set(dir * (BODY_W / 2 + 0.0015), BODY_H / 2, 0);
      panel.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      cabinet.add(panel);
      // Hairline groove around the panel
      const grooveMat = new LineBasicMaterial({
        color: new Color('#1a1c20'),
        transparent: true,
        opacity: 0.7,
      });
      const groove = new LineSegments(
        new EdgesGeometry(new PlaneGeometry(sidePanelW, sidePanelH)),
        grooveMat,
      );
      groove.position.copy(panel.position);
      groove.position.x += dir * 0.002;
      groove.rotation.copy(panel.rotation);
      cabinet.add(groove);
    });

    // Vertical hinge column on the LEFT side of each door (matches reference)
    const hingeColMat = new MeshStandardMaterial({
      color: new Color('#1f2026'),
      roughness: 0.4,
      metalness: 0.8,
    });
    const hingeCol = new Mesh(
      new BoxGeometry(0.06, BODY_H - 0.08, 0.04),
      hingeColMat,
    );
    hingeCol.position.set(-BODY_W / 2 + 0.04, BODY_H / 2, BODY_D / 2 + 0.005);
    cabinet.add(hingeCol);
    // Two hinge knuckles (small cylinders) along the column
    const hingeKnuckleMat = new MeshStandardMaterial({
      color: new Color('#c8cad0'),
      roughness: 0.25,
      metalness: 0.95,
    });
    [BODY_H * 0.78, BODY_H * 0.22].forEach((y) => {
      const knuckle = new Mesh(
        new CylinderGeometry(0.025, 0.025, 0.07, 16),
        hingeKnuckleMat,
      );
      knuckle.rotation.z = Math.PI / 2;
      knuckle.position.set(-BODY_W / 2 + 0.04, y, BODY_D / 2 + 0.03);
      cabinet.add(knuckle);
    });

    // Back panel: compressor housing (lower box) + ventilation slats
    const backPanelMat = new MeshStandardMaterial({
      color: new Color('#22242a'),
      roughness: 0.55,
      metalness: 0.5,
    });
    const compressor = new Mesh(
      new BoxGeometry(BODY_W * 0.78, BODY_H * 0.22, 0.18),
      backPanelMat,
    );
    compressor.position.set(0, BODY_H * 0.11, -BODY_D / 2 - 0.09);
    cabinet.add(compressor);
    // Heat-exchanger coils on the compressor face
    const coilMat = new LineBasicMaterial({
      color: new Color('#8a8c92'),
      transparent: true,
      opacity: 0.8,
    });
    const coilGroup = new Group();
    const coilW = BODY_W * 0.62;
    const coilStep = 0.04;
    const coilRows = 6;
    const coilStart = -coilRows * coilStep * 0.5;
    for (let i = 0; i < coilRows; i++) {
      // Each row drawn as a thin box rendered as edges for a wire look
      const row = new LineSegments(
        new EdgesGeometry(new BoxGeometry(coilW, 0.008, 0.008)),
        coilMat,
      );
      row.position.set(0, coilStart + i * coilStep + BODY_H * 0.11, -BODY_D / 2 - 0.18);
      coilGroup.add(row);
    }
    cabinet.add(coilGroup);

    // Vertical ventilation slats on the back upper area
    const slatMat = new MeshStandardMaterial({
      color: new Color('#15171c'),
      roughness: 0.7,
      metalness: 0.4,
    });
    const slatCount = 8;
    const slatSpacing = (BODY_W * 0.6) / slatCount;
    for (let i = 0; i < slatCount; i++) {
      const slat = new Mesh(
        new BoxGeometry(0.012, BODY_H * 0.18, 0.025),
        slatMat,
      );
      slat.position.set(
        -BODY_W * 0.3 + i * slatSpacing + slatSpacing / 2,
        BODY_H * 0.62,
        -BODY_D / 2 - 0.013,
      );
      cabinet.add(slat);
    }

    // Branding plate on the back-top
    const plateMat = new MeshStandardMaterial({
      color: new Color('#d6d8de'),
      roughness: 0.4,
      metalness: 0.6,
    });
    const plate = new Mesh(new BoxGeometry(0.55, 0.12, 0.012), plateMat);
    plate.position.set(0, BODY_H * 0.88, -BODY_D / 2 - 0.007);
    cabinet.add(plate);

    // Top vent (thin slot near the back of the top surface)
    const topVent = new Mesh(
      new BoxGeometry(BODY_W * 0.7, 0.012, 0.06),
      new MeshStandardMaterial({
        color: new Color('#0e0f13'),
        roughness: 0.7,
        metalness: 0.3,
      }),
    );
    topVent.position.set(0, BODY_H + 0.015, -BODY_D / 2 + 0.18);
    cabinet.add(topVent);

    // Toe kick / bottom plinth (recessed front skirt above the legs)
    const plinthMat = new MeshStandardMaterial({
      color: new Color('#1a1c20'),
      roughness: 0.5,
      metalness: 0.5,
    });
    const plinth = new Mesh(new BoxGeometry(BODY_W * 0.85, 0.06, 0.04), plinthMat);
    plinth.position.set(0, 0.04, BODY_D / 2 + 0.005);
    cabinet.add(plinth);

    // Fridge compartment (top)
    const fridge = buildCompartment(BODY_W, FRIDGE_H, BODY_D, FRIDGE_TINT, true, bodyMat, trimMat);
    fridge.group.position.y = FREEZER_H + FRIDGE_H / 2;
    cabinet.add(fridge.group);

    // Freezer compartment (bottom)
    const freezer = buildCompartment(BODY_W, FREEZER_H, BODY_D, FREEZER_TINT, false, bodyMat, trimMat);
    freezer.group.position.y = FREEZER_H / 2;
    cabinet.add(freezer.group);

    // Legs (four feet)
    const legMat = new MeshStandardMaterial({
      color: new Color('#1a1c20'),
      roughness: 0.5,
      metalness: 0.6,
    });
    const legGeom = new CylinderGeometry(0.06, 0.07, LEG_H, 16);
    const legX = BODY_W / 2 - 0.12;
    const legZ = BODY_D / 2 - 0.12;
    [[legX, legZ], [-legX, legZ], [legX, -legZ], [-legX, -legZ]].forEach(([x, z]) => {
      const leg = new Mesh(legGeom, legMat);
      leg.position.set(x, LEG_H / 2, z);
      leg.castShadow = true;
      cabinet.add(leg);
    });

    // ── Interaction: drag-to-rotate ──
    let dragging = false;
    let lastX = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      renderer.domElement.style.cursor = 'grabbing';
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort; some browsers (older Safari) throw.
      }
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      renderer.domElement.style.cursor = 'grab';
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // Mirror onDown: capture release is best-effort.
      }
    };
    const onMove = (e: PointerEvent) => {
      const x = e.clientX;
      if (dragging) {
        cabinet.rotation.y += (x - lastX) * 0.01;
      }
      lastX = x;
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);

    // ── Resize ──
    const onResize = () => {
      const w = Math.max(mount.clientWidth, 1);
      const h = Math.max(mount.clientHeight, 1);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ── Render loop ──
    let rafId = 0;
    let t0 = performance.now();
    const animate = () => {
      const now = performance.now();
      const dt = (now - t0) / 1000;
      t0 = now;
      // Slow auto-rotate while idle, paused when the user drags (cryocan pattern)
      if (!dragging) {
        cabinet.rotation.y += 0.0025;
      }
      // Smoothly tween light intensities toward their target values
      const lerpLight = (l: PointLight) => {
        const target = (l.userData._target as number | undefined) ?? 1.0;
        l.intensity += (target - l.intensity) * Math.min(1, dt * 4);
      };
      lerpLight(fridge.interiorLight);
      lerpLight(freezer.interiorLight);
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    // Set steady-state interior light targets (no zone selection)
    fridge.interiorLight.userData._target = 1.0;
    freezer.interiorLight.userData._target = 1.0;

    sceneRef.current = {
      renderer,
      scene,
      camera,
      rafId,
      onResize,
      fridgeLight: fridge.interiorLight,
      freezerLight: freezer.interiorLight,
    };

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      renderer.dispose();
      env.dispose();
      mount.removeChild(renderer.domElement);
      // Best-effort traversal to free geometry/material
      scene.traverse((obj) => {
        const mesh = obj as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as Mesh).material as MeshStandardMaterial | MeshStandardMaterial[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
    };
  }, []);

  // ── Alert glow override ────────────────────────────────────────────────────
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (hasAlert) {
      s.fridgeLight.color.set('#ff4d6d');
      s.freezerLight.color.set('#ff4d6d');
      s.fridgeLight.userData._target = 3.0;
      s.freezerLight.userData._target = 3.0;
    } else {
      s.fridgeLight.color.copy(FRIDGE_TINT);
      s.freezerLight.color.copy(FREEZER_TINT);
      s.fridgeLight.userData._target = 1.0;
      s.freezerLight.userData._target = 1.0;
    }
  }, [hasAlert]);

  // ── Activity dedup (stable list for the right panel) ───────────────────────
  const activity = useMemo(() => systemActivity.slice(0, 20), [systemActivity]);

  const myTasks: MyTask[] = tasks.map((t) => ({
    id: String(t.id),
    patientId: t.patient_id ?? '',
    canisterNumber: t.tank_code ?? '',
    tankCode: t.tank_code ?? undefined,
    tankId: t.tank_id ?? undefined,
    assigneeId: t.assignee?.user_id ?? undefined,
    taskName: t.task_name,
    description: t.description ?? '',
    assigneeBy: t.created_by_name ?? '',
    assignedTo: t.assignee
      ? `${t.assignee.first_name ?? ''} ${t.assignee.last_name ?? ''}`.trim()
      : '',
    dueDate: t.due_date ?? '',
    priority: (t.priority as 'Low' | 'Medium' | 'High') ?? 'Medium',
    status: (t.status as 'Not started' | 'In progress' | 'Done' | 'Cancelled') ?? 'Not started',
  }));

  const handleEditTask = async (task: MyTask) => {
    const taskId = parseInt(task.id, 10);
    if (!onEditTask) {
      if (task.assigneeBy?.trim().toLowerCase() === currentUserName?.trim().toLowerCase()) {
        await tasksService.updateTask(taskId, {
          task_name: task.taskName,
          description: task.description,
          status: task.status as import('../../../services/tasksService').TaskStatus,
        });
      } else {
        await tasksService.updateTaskStatus(taskId, task.status as import('../../../services/tasksService').TaskStatus);
      }
      onTaskCreated?.();
      return;
    }
    await onEditTask(task);
  };

  const [kpiModalKey, setKpiModalKey] = useState<string | null>(null);

  return (
    <>
    <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-4">

      {/* Left: Live Conditions (top) + Tasks (bottom) */}
      <aside className="flex flex-col gap-3 min-h-[560px]">

        {/* Live Conditions card */}
        <div className="flex-1 min-h-0 rounded-2xl border border-line bg-white overflow-hidden flex flex-col">
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ background: '#f7f2fa', borderBottom: '1px solid #efe5f4' }}
          >
            <div>
              <span className="block text-sm font-semibold" style={{ color: '#5f3b73' }}>Live Conditions</span>
              <span className="block text-[10px] mt-0.5" style={{ color: '#a07ab8' }}>Click a tile to view trend</span>
            </div>
            <TrendingUp size={16} style={{ color: '#6b4a78' }} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
            {sensorTiles.length === 0 ? (
              <div className="text-xs text-gray-400 italic">No sensor data.</div>
            ) : (
              sensorTiles.map((tile) => {
                const isSelected = selectedSensorId === tile.id;
                const isAlert = hasAlert && !tile.isMissing;
                const isFreezer = tile.id === 'freezer_temperature';
                const accent = isAlert ? '#dc2626' : (isFreezer ? '#1a7abb' : '#7a22c8');
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => { onSensorSelect?.(tile.id); setKpiModalKey(tile.id); }}
                    className={[
                      'text-left w-full rounded-2xl border transition',
                      isSelected ? 'border-primary' : 'border-[#e6d6ee] hover:border-primary/50',
                      isAlert ? 'ring-1 ring-red-300' : '',
                    ].join(' ')}
                    style={{
                      padding: '12px 14px',
                      background: '#fdfbfe',
                      boxShadow: isSelected
                        ? '0 6px 16px rgba(107,17,118,0.12)'
                        : '0 4px 12px rgba(64,17,83,0.06)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          className="text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: '#8b6c97' }}
                        >
                          {tile.label}
                        </div>
                        <div
                          className="text-2xl font-bold mt-1"
                          style={{ color: isAlert ? '#dc2626' : accent }}
                        >
                          {tile.value}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{tile.timestamp ?? '—'}</div>
                      </div>
                      <div className="shrink-0 mt-1">
                        {isFreezer
                          ? <Snowflake size={18} style={{ color: accent }} />
                          : <Thermometer size={18} style={{ color: accent }} />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Tasks card — reuses MyTasksModal in embedded mode */}
        <div className="flex-1 min-h-0 rounded-2xl border border-line bg-white overflow-hidden flex flex-col">
          <MyTasksModal
            embedded
            isOpen={false}
            onClose={() => {}}
            variant="refrigerator"
            tasks={myTasks}
            defaultRefrigeratorId={refrigeratorId}
            currentUserName={currentUserName}
            currentUserId={currentUserId}
            onAdd={() => {}}
            onEdit={handleEditTask}
            onTaskCreated={onTaskCreated}
          />
        </div>
      </aside>

      {/* Center 3D viewer */}
      <section
        data-refrigerator-3d-mount
        className="relative min-h-[560px] rounded-2xl border border-line bg-linear-to-br from-white to-gray-50 overflow-hidden"
        aria-label="Refrigerator 3D visualisation"
      >
        <div ref={mountRef} className="absolute inset-0" />

        {/* Top-left: device code */}
        {refrigeratorCode && (
          <div className="absolute top-3 left-4 text-xs font-bold tracking-widest text-gray-500 uppercase pointer-events-none">
            {refrigeratorCode}
          </div>
        )}

        {/* Top-right: status badge */}
        <div className="absolute top-3 right-3 pointer-events-none">
          {hasAlert ? (
            <div className="flex items-center gap-1.5 bg-red-50/90 backdrop-blur-sm border border-red-200 rounded-full px-3 py-1 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] font-semibold text-red-600">Alert active</span>
            </div>
          ) : sensorTiles.some((t) => !t.isMissing) ? (
            <div className="flex items-center gap-1.5 bg-emerald-50/90 backdrop-blur-sm border border-emerald-200 rounded-full px-3 py-1 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-semibold text-emerald-700">Normal</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-gray-100/90 backdrop-blur-sm border border-gray-200 rounded-full px-3 py-1 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              <span className="text-[11px] font-semibold text-gray-500">No signal</span>
            </div>
          )}
        </div>

        {/* Left side: fridge compartment card (upper area, matching the top compartment) */}
        <div className="absolute left-2 pointer-events-none" style={{ top: '24%', zIndex: 2 }}>
          <div className="bg-white/82 backdrop-blur-sm rounded-2xl border-l-2 border-[#b48cf7] border border-white/60 shadow-md px-3 py-2.5 w-[108px]">
            <div className="text-[8px] font-bold tracking-widest uppercase mb-1" style={{ color: '#9b6bc7' }}>Refrigerator</div>
            <div className="text-xl font-black leading-none" style={{ color: '#7a22c8' }}>
              {fridgeTemp != null ? `${fridgeTemp.toFixed(1)}°C` : '—'}
            </div>
            <div className="text-[8px] mt-0.5" style={{ color: '#b48cf7' }}>2 – 8 °C</div>
            <div className="w-full border-t border-purple-100 my-2" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] text-gray-500">· 3 shelves</span>
              <span className="text-[8px] text-gray-500">· Culture media</span>
              <span className="text-[8px] text-gray-500">· Buffers</span>
            </div>
          </div>
        </div>

        {/* Right side: freezer compartment card (lower area, matching the bottom compartment) */}
        <div className="absolute right-2 pointer-events-none" style={{ top: '62%', zIndex: 2 }}>
          <div className="bg-white/82 backdrop-blur-sm rounded-2xl border-l-2 border-[#5db4ff] border border-white/60 shadow-md px-3 py-2.5 w-[108px]">
            <div className="text-[8px] font-bold tracking-widest uppercase mb-1" style={{ color: '#4a9fd0' }}>Freezer</div>
            <div className="text-xl font-black leading-none" style={{ color: '#1a7abb' }}>
              {freezerTemp != null ? `${freezerTemp.toFixed(1)}°C` : '—'}
            </div>
            <div className="text-[8px] mt-0.5" style={{ color: '#5db4ff' }}>≤ −20 °C</div>
            <div className="w-full border-t border-sky-100 my-2" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] text-gray-500">· 2 shelves</span>
              <span className="text-[8px] text-gray-500">· Cryoprotectants</span>
              <span className="text-[8px] text-gray-500">· Frozen samples</span>
            </div>
          </div>
        </div>

        {/* Bottom-left: branch + online status info cards */}
        <div className="absolute bottom-10 left-3 flex flex-col gap-1.5 pointer-events-none">
          {branchName && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-white/70 shadow-sm px-3 py-2">
              <div className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Branch</div>
              <div className="text-[11px] font-semibold text-gray-800">{branchName}</div>
            </div>
          )}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-white/70 shadow-sm px-3 py-2 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${sensorTiles.some((t) => !t.isMissing) ? 'bg-emerald-400' : 'bg-gray-300'}`} />
            <span className="text-[11px] font-semibold text-gray-700">
              {sensorTiles.some((t) => !t.isMissing) ? 'Online' : 'No data'}
            </span>
          </div>
        </div>

        {/* Bottom: scrolling tips strip */}
        <style>{`@keyframes rfg-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
        <div className="absolute bottom-0 inset-x-0 bg-white/65 backdrop-blur-sm border-t border-white/50 py-2 flex items-center gap-3 overflow-hidden">
          <span className="shrink-0 text-[9px] font-bold tracking-widest text-primary/50 uppercase pl-3 pr-1">Tips</span>
          <div className="overflow-hidden flex-1">
            <div style={{ display: 'flex', gap: '2.5rem', whiteSpace: 'nowrap', animation: 'rfg-marquee 70s linear infinite' }}>
              {[...FRIDGE_TIPS, ...FRIDGE_TIPS].map((tip, i) => (
                <span key={i} className="text-[11px] text-gray-500 shrink-0">
                  <span className="text-primary/30 mr-2">◆</span>{tip}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Right: System Activity (top) + Messages (bottom) */}
      <aside className="flex flex-col gap-3 min-h-[560px]">

        {/* System Activity card */}
        <div className="flex-1 min-h-0 rounded-2xl border border-line bg-surface overflow-hidden flex flex-col">
          <div className="px-4 py-3 shrink-0">
            <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase">System Activity</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 flex flex-col gap-2">
            {activity.length === 0 ? (
              <div className="text-xs text-gray-400 italic">No recent activity.</div>
            ) : (
              activity.map((record) => (
                <div key={record.id} className="rounded-lg border border-line bg-white px-3 py-2">
                  <div className="text-xs font-semibold text-gray-800">{record.action}</div>
                  <div className="text-[11px] text-gray-500">{record.created_at}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Messages card — reuses StakeholderChatBox in embedded mode */}
        <div className="flex-1 min-h-0 rounded-2xl border border-line bg-white overflow-hidden flex flex-col">
          <div className="px-4 py-3 shrink-0 border-b border-line bg-surface">
            <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase">Messages</h3>
          </div>
          <StakeholderChatBox
            embedded
            isOpen={false}
            onClose={() => {}}
            refrigeratorId={refrigeratorId}
          />
        </div>
      </aside>
    </div>

    {kpiModalKey && refrigeratorId != null && (
      <RefrigeratorKpiChartModal
        refrigeratorId={refrigeratorId}
        kpiKey={kpiModalKey}
        onClose={() => setKpiModalKey(null)}
      />
    )}
    </>
  );
}
