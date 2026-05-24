import { useEffect, useMemo, useRef } from 'react';
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
  Object3D,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  ShadowMaterial,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Snowflake, Thermometer } from 'lucide-react';
import type { ActivityLogRecord } from '../../../services/activityLogService';
import type { RefrigeratorSensorTile } from './useRefrigeratorKpiSnapshot';

/**
 * Procedural 3D refrigerator. Two stacked glass-door compartments matching the
 * reference: top = refrigerator (lavender accent), bottom = freezer (blue
 * accent), charcoal anodised body, four legs, subtle ground grid. Click a door
 * to fire onZoneSelect; the selected zone gets a stronger interior light and a
 * highlight ring.
 *
 * Geometry/materials are procedural (no GLB), mirroring the cryocan/incubator
 * approach already in the codebase.
 */

export type RefrigeratorZone = 'freezer' | 'fridge';

export type RefrigeratorVisualisationProps = {
  sensorTiles?: RefrigeratorSensorTile[];
  selectedSensorId?: string | null;
  onSensorSelect?: (sensorId: string) => void;

  selectedZone?: RefrigeratorZone | null;
  onZoneSelect?: (zone: RefrigeratorZone) => void;
  freezerTemp?: number | null;
  fridgeTemp?: number | null;
  freezerTempAlert?: boolean;
  fridgeTempAlert?: boolean;
  doorStatus?: 'open' | 'closed';

  systemActivity?: ActivityLogRecord[];

  refrigeratorCode?: string;
  refrigeratorId?: number;
  branchName?: string;
};

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
  zone: RefrigeratorZone,
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

  // Shelves — 3 for fridge, 2 for freezer
  const shelfCount = zone === 'fridge' ? 3 : 2;
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

  // Invisible hit mesh for click selection (covers whole door, sits in front
  // of the glass so the raycaster hits it instead of the transparent pane)
  const hitMat = new MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const doorHit = new Mesh(new PlaneGeometry(width, height), hitMat);
  doorHit.position.set(0, 0, depth / 2 + DOOR_THICK + 0.05);
  doorHit.userData.zone = zone;
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
  selectedZone,
  onZoneSelect,
  freezerTemp,
  fridgeTemp,
  freezerTempAlert,
  fridgeTempAlert,
  systemActivity = [],
  refrigeratorCode,
}: RefrigeratorVisualisationProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<{
    renderer: WebGLRenderer;
    scene: Scene;
    camera: PerspectiveCamera;
    rafId: number;
    onResize: () => void;
    onClick: (e: MouseEvent) => void;
    onMove: (e: MouseEvent) => void;
    fridgeRing: MeshStandardMaterial;
    freezerRing: MeshStandardMaterial;
    fridgeLight: PointLight;
    freezerLight: PointLight;
    raycaster: Raycaster;
    pointer: Vector2;
    hitMeshes: Mesh[];
    onZoneSelectRef: (z: RefrigeratorZone) => void;
  } | null>(null);

  const onZoneSelectStable = useRef(onZoneSelect);
  useEffect(() => {
    onZoneSelectStable.current = onZoneSelect;
  });

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
    const fridge = buildCompartment(BODY_W, FRIDGE_H, BODY_D, FRIDGE_TINT, 'fridge', bodyMat, trimMat);
    fridge.group.position.y = FREEZER_H + FRIDGE_H / 2;
    cabinet.add(fridge.group);

    // Freezer compartment (bottom)
    const freezer = buildCompartment(BODY_W, FREEZER_H, BODY_D, FREEZER_TINT, 'freezer', bodyMat, trimMat);
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

    // ── Interaction: drag-to-rotate + click-to-select (cryocan pattern) ──
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const hitMeshes: Mesh[] = [fridge.doorHit, freezer.doorHit];

    let dragging = false;
    let pressed = false;
    let pressX = 0;
    let pressY = 0;
    let lastX = 0;
    let dragDist = 0;

    const pickZone = (clientX: number, clientY: number): RefrigeratorZone | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(hitMeshes, false);
      if (intersects.length === 0) return null;
      const obj = intersects[0].object as Object3D;
      return (obj.userData?.zone as RefrigeratorZone | undefined) ?? null;
    };

    const onDown = (e: PointerEvent) => {
      pressed = true;
      pressX = e.clientX;
      pressY = e.clientY;
      lastX = pressX;
      dragDist = 0;
      dragging = true;
      renderer.domElement.style.cursor = 'grabbing';
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort; some browsers (older Safari) throw.
      }
    };
    const onUp = (e: PointerEvent) => {
      const upX = e.clientX;
      const upY = e.clientY;
      const wasClick =
        pressed &&
        Math.abs(upX - pressX) < 5 &&
        Math.abs(upY - pressY) < 5 &&
        dragDist < 6;
      dragging = false;
      pressed = false;
      renderer.domElement.style.cursor = 'grab';
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // Mirror onDown: capture release is best-effort.
      }
      if (wasClick) {
        const zone = pickZone(upX, upY);
        if (zone && onZoneSelectStable.current) {
          onZoneSelectStable.current(zone);
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      if (pressed) {
        dragDist += Math.abs(x - lastX);
      }
      if (dragging) {
        cabinet.rotation.y += (x - lastX) * 0.01;
      }
      lastX = x;
      if (!pressed) {
        const zone = pickZone(x, y);
        renderer.domElement.style.cursor = zone ? 'pointer' : 'grab';
      }
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
      if (!dragging && !pressed) {
        cabinet.rotation.y += 0.0025;
      }
      // Subtle pulse on the highlight rings of the selected zone
      const pulse = 0.6 + Math.sin(now / 500) * 0.4;
      const fridgeRingMat = fridge.highlightRing.material as MeshStandardMaterial;
      const freezerRingMat = freezer.highlightRing.material as MeshStandardMaterial;
      fridgeRingMat.emissiveIntensity = (fridgeRingMat.userData._target ?? 0) * pulse;
      freezerRingMat.emissiveIntensity = (freezerRingMat.userData._target ?? 0) * pulse;
      // Smoothly tween light intensities toward their target values
      const lerpLight = (l: PointLight) => {
        const target = (l.userData._target as number | undefined) ?? 0;
        l.intensity += (target - l.intensity) * Math.min(1, dt * 4);
      };
      lerpLight(fridge.interiorLight);
      lerpLight(freezer.interiorLight);
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    sceneRef.current = {
      renderer,
      scene,
      camera,
      rafId,
      onResize,
      onClick: () => {},
      onMove: () => {},
      fridgeRing: fridge.highlightRing.material as MeshStandardMaterial,
      freezerRing: freezer.highlightRing.material as MeshStandardMaterial,
      fridgeLight: fridge.interiorLight,
      freezerLight: freezer.interiorLight,
      raycaster,
      pointer,
      hitMeshes,
      onZoneSelectRef: () => {},
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

  // ── Update zone selection (lights + rings) ─────────────────────────────────
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;

    const setRing = (mat: MeshStandardMaterial, on: boolean, tint: Color) => {
      mat.color.copy(tint);
      mat.emissive.copy(tint);
      mat.userData._target = on ? 1.4 : 0;
      mat.opacity = on ? 0.9 : 0.0;
    };
    setRing(s.fridgeRing, selectedZone === 'fridge', FRIDGE_TINT);
    setRing(s.freezerRing, selectedZone === 'freezer', FREEZER_TINT);

    // Light intensity targets: the selected zone glows brighter, the other one
    // keeps a soft baseline so the cabinet doesn't go dark.
    s.fridgeLight.color.copy(FRIDGE_TINT);
    s.freezerLight.color.copy(FREEZER_TINT);
    s.fridgeLight.userData._target = selectedZone === 'fridge' ? 2.6 : 1.0;
    s.freezerLight.userData._target = selectedZone === 'freezer' ? 2.6 : 1.0;
  }, [selectedZone]);

  // ── Alert glow override ────────────────────────────────────────────────────
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (fridgeTempAlert) {
      s.fridgeLight.color.set('#ff4d6d');
      s.fridgeLight.userData._target = 3.0;
    }
    if (freezerTempAlert) {
      s.freezerLight.color.set('#ff4d6d');
      s.freezerLight.userData._target = 3.0;
    }
  }, [fridgeTempAlert, freezerTempAlert]);

  // ── Activity dedup (stable list for the right panel) ───────────────────────
  const activity = useMemo(() => systemActivity.slice(0, 20), [systemActivity]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-4">
      {/* Left KPI tiles */}
      <aside className="flex flex-col gap-3">
        {sensorTiles.map((tile) => {
          const isSelected = selectedSensorId === tile.id;
          const isAlert =
            (tile.id === 'freezer_temperature' && freezerTempAlert) ||
            (tile.id === 'refrigerator_temperature' && fridgeTempAlert);
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => onSensorSelect?.(tile.id)}
              className={[
                'text-left rounded-xl border px-4 py-3 transition',
                isSelected ? 'border-primary bg-primary/5' : 'border-line bg-surface hover:bg-primary/3',
                isAlert ? 'ring-1 ring-red-300' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                  {tile.label}
                </span>
                {tile.id === 'freezer_temperature' ? (
                  <Snowflake size={14} className="text-sky-500" />
                ) : (
                  <Thermometer size={14} className="text-emerald-500" />
                )}
              </div>
              <div className="mt-1 text-2xl font-black text-gray-900">{tile.value}</div>
              <div className="text-xs text-gray-500">{tile.timestamp ?? '—'}</div>
            </button>
          );
        })}
      </aside>

      {/* Center 3D viewer */}
      <section
        data-refrigerator-3d-mount
        className="relative min-h-[560px] rounded-2xl border border-line bg-linear-to-br from-white to-gray-50 overflow-hidden"
        aria-label="Refrigerator 3D visualisation"
      >
        <div ref={mountRef} className="absolute inset-0" />

        {/* Overlay header */}
        {refrigeratorCode && (
          <div className="absolute top-3 left-4 text-xs font-bold tracking-widest text-gray-500 uppercase">
            {refrigeratorCode}
          </div>
        )}

        {/* Floating zone temperature chips, positioned beside the compartments */}
        <div className="absolute right-4 top-12 flex flex-col gap-2 w-[210px]">
          <button
            type="button"
            onClick={() => onZoneSelect?.('fridge')}
            className={[
              'rounded-xl border px-3 py-2 flex items-center justify-between transition bg-white/85 backdrop-blur',
              selectedZone === 'fridge' ? 'border-primary shadow-lg' : 'border-line hover:border-primary/50',
              fridgeTempAlert ? 'ring-1 ring-red-300' : '',
            ].join(' ')}
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <Thermometer size={14} className="text-purple-500" />
              Refrigerator
            </span>
            <span className="text-sm font-black text-gray-900">
              {fridgeTemp != null ? `${fridgeTemp.toFixed(1)}°C` : '—'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onZoneSelect?.('freezer')}
            className={[
              'rounded-xl border px-3 py-2 flex items-center justify-between transition bg-white/85 backdrop-blur',
              selectedZone === 'freezer' ? 'border-primary shadow-lg' : 'border-line hover:border-primary/50',
              freezerTempAlert ? 'ring-1 ring-red-300' : '',
            ].join(' ')}
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <Snowflake size={14} className="text-sky-500" />
              Freezer
            </span>
            <span className="text-sm font-black text-gray-900">
              {freezerTemp != null ? `${freezerTemp.toFixed(1)}°C` : '—'}
            </span>
          </button>
        </div>
      </section>

      {/* Right activity feed */}
      <aside className="rounded-2xl border border-line bg-surface px-4 py-3 flex flex-col min-h-[560px]">
        <h3 className="text-xs font-bold tracking-widest text-gray-400 uppercase">System Activity</h3>
        <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
          {activity.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No recent activity.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {activity.map((record) => (
                <li key={record.id} className="rounded-lg border border-line bg-white px-3 py-2">
                  <div className="text-xs font-semibold text-gray-800">{record.action}</div>
                  <div className="text-[11px] text-gray-500">{record.created_at}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
