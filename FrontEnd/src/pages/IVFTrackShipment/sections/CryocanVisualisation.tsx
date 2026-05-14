import {
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import type {
  Material,
  Color,
  Group,
  Vector3,
  MeshPhysicalMaterial,
  Mesh,
  PerspectiveCamera,
  PointLight,
  Object3D,
} from "three";

declare global {
  interface Window {
    anime?: any;
  }
}

type LidStatus = "open" | "closed";

type CryocanThemeOverrides = {
  shell?: {
    color?: string | number;
    opacity?: number;
    transmission?: number;
    roughness?: number;
  };
  innerShell?: {
    color?: string | number;
    opacity?: number;
    transmission?: number;
  };
  ln2?: {
    color?: string | number;
    opacity?: number;
    transmission?: number;
  };
  wave?: {
    color?: string | number;
    opacity?: number;
  };
  lid?: {
    color?: string | number;
    topColor?: string | number;
  };
  platform?: {
    color?: string | number;
    metalness?: number;
    roughness?: number;
  };
};

type CanisterInfo = {
  id: string;
  label: string;
  sampleCount?: number;
  status?: string;
};

type StrawInfo = {
  id?: string;
  type?: string;
  stage?: string;
  grade?: string;
  patient?: string;
  hisNumber?: string;
  cryolockNumber?: string;
  caneCode?: string;
  gobletColor?: string;
  cryolockColor?: string;
  vitrificationDate?: string;
  description?: string | null;
  color?: number;
};

type CanisterContents = Record<string, StrawInfo[]>;

export type CryocanSensorTile = {
  id: string;
  label: string;
  value: string;
  timestamp: string | null;
  isMissing?: boolean;
  isMuted?: boolean;
  tooltip?: string;
};

type CryocanVisualizerProps = {
  ln2Level?: number;
  internalTemp?: number;
  externalTemp?: number;
  lidStatus?: LidStatus;
  canisters?: CanisterInfo[];
  canisterContents?: CanisterContents;
  theme?: CryocanThemeOverrides | null;
  variant?: "full" | "embedded";
  hideSidebar?: boolean;
  sensorTiles?: CryocanSensorTile[];
  selectedSensorId?: string | null;
  onSensorSelect?: (sensorId: string) => void;
  onCanisterSelect?: (canisterId: string) => void;
  onStrawSelect?: (canisterId: string, strawId: string) => void;
};

type MaterialLike = Material & {
  color?: Color;
  opacity?: number;
  transmission?: number;
  roughness?: number;
  metalness?: number;
  thickness?: number;
  ior?: number;
  clearcoat?: number;
  attenuationColor?: Color;
  attenuationDistance?: number;
  [key: string]: any;
};

type MaterialMap = Record<string, MaterialLike>;

type StrawSubgroup = {
  group: Group;
  homeLocalPos: Vector3;
  index: number;
  strawMat: MeshPhysicalMaterial;
  baseColor: number;
};

type CanisterRuntime = {
  group: Group;
  handleMat: MeshPhysicalMaterial;
  strawSubgroups: StrawSubgroup[];
  strawGroup: Group;
  homePos: Vector3;
  homeAngle: number;
  index: number;
};

type CryocanVisualizerHandle = {
  setMaterial: (key: string, prop: string, value: number | string) => void;
  getMaterialSnapshot: () => Record<string, any>;
};

/**
 * CryocanVisualizer
 * ------------------------------------------------------------------
 * 3D visualisation of a cryogenic storage dewar used in IVF facilities
 * to store embryos / sperm straws inside canisters submerged in
 * liquid nitrogen (LN2).
 *
 * - Three.js    : 3D modelling of the transparent tank, LN2, canisters,
 *                 vapour particles, radial wave surface.
 * - anime.js    : loaded from CDN; powers percentage counter,
 *                 smooth LN2 level transitions and UI micro-interactions.
 *
 * Theme: light, #7a1a88 / #401153 as primary / secondary purple accents.
 * ------------------------------------------------------------------
 */

// Tank geometry constants
const TANK_RADIUS = 1.5;
const TANK_HEIGHT = 5.0;
const MAX_LN2_HEIGHT = TANK_HEIGHT * 0.78;
const LN2_BOTTOM_MARGIN = 0.15;
// Shoulder of the tank (where body starts curving inward toward the neck)
const SHOULDER_START = 0.86; // fraction of total height
const TOP_RADIUS_RATIO = 0.68; // neck radius as fraction of body radius

// Canister constants
const CAN_COUNT = 6;
const CAN_RADIUS = 0.22;
const CAN_HEIGHT = TANK_HEIGHT * 0.72;
const CAN_RING_R = TANK_RADIUS * 0.34;
const CAN_WALL = 0.018; // wall thickness for hollow body
const CAN_FLOOR = 0.05; // inside floor thickness

// Straw configuration — colors and synthetic IVF sample metadata
const STRAW_COLORS = [
  0x9b4aaa, 0xf5e0f5, 0xb467c4, 0xe0c4e8, 0x7a1a88,
  0xf0e5f2, 0xa84fb0, 0xd8b4e0, 0x6b1474,
];
const STRAW_OFFSETS = [
  [0, 0],
  [0.085, 0],
  [-0.085, 0],
  [0, 0.085],
  [0, -0.085],
  [0.06, 0.06],
  [-0.06, 0.06],
  [0.06, -0.06],
  [-0.06, -0.06],
];
// Sample data for each straw position (per canister these are the same template;
// the canister index will be combined to make IDs unique)
const STRAW_TEMPLATE = [
  { type: "Embryo", stage: "Day 5 Blastocyst", grade: "4AA", patient: "P-1042" },
  { type: "Embryo", stage: "Day 5 Blastocyst", grade: "5AA", patient: "P-1042" },
  { type: "Embryo", stage: "Day 6 Blastocyst", grade: "4BA", patient: "P-1207" },
  { type: "Embryo", stage: "Day 5 Blastocyst", grade: "3AB", patient: "P-1207" },
  { type: "Sperm",  stage: "Frozen Vial",     grade: "Donor",  patient: "D-0034" },
  { type: "Embryo", stage: "Day 6 Blastocyst", grade: "4AB", patient: "P-0918" },
  { type: "Sperm",  stage: "Frozen Vial",     grade: "Partner", patient: "P-1042" },
  { type: "Embryo", stage: "Day 5 Blastocyst", grade: "4AA", patient: "P-1331" },
  { type: "Oocyte", stage: "MII Vitrified",   grade: "—",     patient: "P-1331" },
];

// Default canister list (used when no prop provided)
const DEFAULT_CANISTERS = Array.from({ length: 6 }, (_, i) => ({
  id: `C${i + 1}`,
  label: `Canister #${i + 1}`,
  sampleCount: 9,
}));

// Default contents per canister
const DEFAULT_CONTENTS: CanisterContents = {};
DEFAULT_CANISTERS.forEach((c) => {
  DEFAULT_CONTENTS[c.id] = STRAW_TEMPLATE.map((s, i) => ({
    id: `${c.id}-S${(i + 1).toString().padStart(2, "0")}`,
    type: s.type,
    stage: s.stage,
    grade: s.grade,
    patient: s.patient,
    color: STRAW_COLORS[i % STRAW_COLORS.length],
  }));
});

const CryocanVisualizer = forwardRef<CryocanVisualizerHandle, CryocanVisualizerProps>(function CryocanVisualizer(
  {
    ln2Level = 78,
    internalTemp = -195.8,
    externalTemp = 22.4,
    lidStatus = "closed", // "open" | "closed"
    canisters,
    canisterContents,
    theme: themeOverrides = null,
    variant = "full",
    hideSidebar = false,
    sensorTiles = [],
    selectedSensorId = null,
    onSensorSelect,
    onCanisterSelect,
    onStrawSelect,
  } = {},
  ref,
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const ln2Ref = useRef<Mesh | null>(null);
  const waveRef = useRef<Mesh | null>(null);
  const waveOrigPosRef = useRef<Float32Array | null>(null);
  const percentTextRef = useRef<HTMLDivElement | null>(null);

  // Camera + dive animation refs
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const camTargetRef = useRef<Vector3 | null>(null);
  const canistersRef = useRef<CanisterRuntime[]>([]); // [{group, homePos, homeAngle, index}]
  const lidGroupRef = useRef<Group | null>(null); // the lidPivot
  const interiorLightRef = useRef<PointLight | null>(null);
  const sceneGroupRef = useRef<Group | null>(null);
  const sceneCanisterCountRef = useRef<number>(CAN_COUNT);

  // Material handles for live tweaking from a dev panel
  const materialsRef = useRef<MaterialMap>({});

  // ln2Level prop drives both the displayed percentage and the 3D fill animation.
  // displayPct is the smoothly-tweened version that the counter shows.
  const fill = Math.max(0, Math.min(100, ln2Level));
  const [displayPct, setDisplayPct] = useState<number>(fill);
  const [animeReady, setAnimeReady] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [selectedCanister, setSelectedCanister] = useState<number | null>(null); // null | index into canisters[]
  // Stage progresses idle → extracted → inspecting on each canister click
  const [viewStage, setViewStage] = useState<"idle" | "extracted" | "inspecting">("idle"); // 'idle' | 'extracted' | 'inspecting'
  const [selectedStraw, setSelectedStraw] = useState<number | null>(null); // null | 0..8
  const autoRotateRef = useRef<boolean>(true);
  const selectedCanisterRef = useRef<number | null>(null);
  const viewStageRef = useRef<"idle" | "extracted" | "inspecting">("idle");
  const selectedStrawRef = useRef<number | null>(null);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);
  useEffect(() => {
    selectedCanisterRef.current = selectedCanister;
  }, [selectedCanister]);
  useEffect(() => {
    viewStageRef.current = viewStage;
  }, [viewStage]);
  useEffect(() => {
    selectedStrawRef.current = selectedStraw;
  }, [selectedStraw]);

  // ---------- Load anime.js from CDN ----------
  useEffect(() => {
    if (window.anime) {
      setAnimeReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js";
    script.async = true;
    script.onload = () => setAnimeReady(true);
    script.onerror = () => setAnimeReady(false);
    document.head.appendChild(script);
  }, []);

  // ---------- Inject fonts ----------
  useEffect(() => {
    if (document.getElementById("cryocan-fonts")) return;
    const link = document.createElement("link");
    link.id = "cryocan-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);

  // ---------- Build the 3D scene once ----------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const getDims = () => ({
      w: mount.clientWidth || 800,
      h: mount.clientHeight || 600,
    });
    let { w, h } = getDims();

    // ----- Scene / camera / renderer -----
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    camera.position.set(-1.4, 0.5, 11.0);
    const camTarget = new THREE.Vector3(-1.4, 0, 0);
    camera.lookAt(camTarget);
    cameraRef.current = camera;
    camTargetRef.current = camTarget;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if ("outputColorSpace" in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else {
      (renderer as any).outputEncoding = (THREE as any).sRGBEncoding;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "grab";

    // ----- Procedural envmap (soft sky/ground gradient) for proper metallic reflections -----
    // Without this, MeshPhysicalMaterial with high metalness renders nearly black because
    // there is nothing for it to reflect.
    const envCanvas = document.createElement("canvas");
    envCanvas.width = 256;
    envCanvas.height = 128;
    const envCtx = envCanvas.getContext("2d")!;
    const envGrad = envCtx.createLinearGradient(0, 0, 0, 128);
    envGrad.addColorStop(0, "#ffffff"); // sky / top
    envGrad.addColorStop(0.42, "#f3eef5"); // upper horizon (very light purple-tinted)
    envGrad.addColorStop(0.55, "#d8d2dc"); // horizon
    envGrad.addColorStop(0.75, "#a8a0ad"); // lower
    envGrad.addColorStop(1, "#6a6470"); // ground
    envCtx.fillStyle = envGrad;
    envCtx.fillRect(0, 0, envCanvas.width, envCanvas.height);
    const envTexture = new THREE.CanvasTexture(envCanvas);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envMap = pmrem.fromEquirectangular(envTexture).texture;
    scene.environment = envMap;
    envTexture.dispose();
    pmrem.dispose();

    // ----- Lighting rig -----
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(5, 8, 6);
    scene.add(key);

    const fillLight = new THREE.DirectionalLight(0xe9d9ef, 0.45);
    fillLight.position.set(-5, 2, 3);
    scene.add(fillLight);

    const rim1 = new THREE.PointLight(0x7a1a88, 1.6, 12);
    rim1.position.set(-3.5, 2, -3);
    scene.add(rim1);

    const rim2 = new THREE.PointLight(0xc070d0, 0.7, 10);
    rim2.position.set(3, -1.5, 2);
    scene.add(rim2);

    // Interior fill light - illuminates straws during dive. Starts dim.
    const interior = new THREE.PointLight(0xffe8d0, 0.0, 6, 2);
    interior.position.set(0, TANK_HEIGHT / 2 - 0.3, 0);
    scene.add(interior);
    interiorLightRef.current = interior;

    // ----- Main group -----
    const group = new THREE.Group();
    scene.add(group);
    sceneGroupRef.current = group;

    // ===== Chrome/steel square platform =====
    const PLATFORM_SIZE = TANK_RADIUS * 2.6;
    const PLATFORM_HEIGHT = 0.16;
    const baseMat = new THREE.MeshPhysicalMaterial({
      color: 0xcdcdd5,
      metalness: 1.0,
      roughness: 0.22,
      clearcoat: 0.5,
      clearcoatRoughness: 0.15,
    });
    materialsRef.current.platform = baseMat;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM_SIZE, PLATFORM_HEIGHT, PLATFORM_SIZE),
      baseMat,
    );
    base.position.y = -TANK_HEIGHT / 2 - PLATFORM_HEIGHT / 2;
    group.add(base);

    // Subtle dark edge highlight around the platform top to define its silhouette
    const platformEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(PLATFORM_SIZE, PLATFORM_HEIGHT, PLATFORM_SIZE),
      ),
      new THREE.LineBasicMaterial({
        color: 0x6b6b75,
        transparent: true,
        opacity: 0.45,
      }),
    );
    platformEdges.position.y = base.position.y;
    group.add(platformEdges);

    // ===== Transparent tank shell (lathe with pronounced domed shoulder, BA-20 style) =====
    const shellProfile = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = -TANK_HEIGHT / 2 + t * TANK_HEIGHT;
      let r = TANK_RADIUS;
      // Domed shoulder: smooth S-curve from body radius down to neck radius
      if (t > SHOULDER_START) {
        const st = (t - SHOULDER_START) / (1 - SHOULDER_START); // 0..1
        const taper = (1 - Math.cos(st * Math.PI)) / 2; // smooth 0..1
        r = TANK_RADIUS * (1 - taper * (1 - TOP_RADIUS_RATIO));
      }
      // Slight rounding at base
      if (t < 0.04) {
        const bt = t / 0.04;
        r = TANK_RADIUS * (0.9 + bt * 0.1);
      }
      shellProfile.push(new THREE.Vector2(r, y));
    }
    const shellGeo = new THREE.LatheGeometry(shellProfile, 72);
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0xfaf6fa,
      metalness: 0.0,
      roughness: 0.35,
      transmission: 0.55,
      transparent: true,
      opacity: 0.55,
      thickness: 0.6,
      ior: 1.35,
      side: THREE.DoubleSide,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
      attenuationColor: new THREE.Color(0xe9dcf0),
      attenuationDistance: 2.2,
    });
    materialsRef.current.tankShell = shellMat;
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.renderOrder = 3;
    group.add(shell);

    // Thin outline to give the tank definition
    const outlineGeo = new THREE.EdgesGeometry(shellGeo, 25);
    const outline = new THREE.LineSegments(
      outlineGeo,
      new THREE.LineBasicMaterial({
        color: 0x401153,
        transparent: true,
        opacity: 0.28,
      }),
    );
    group.add(outline);

    // ===== Inner vessel (vacuum-jacketed dewar inner shell) =====
    // The gap between this and the outer shell shows the vacuum/insulation space,
    // making the tank wall feel substantially thicker.
    const INNER_R = TANK_RADIUS * 0.88;
    const INNER_WALL_T = 0.045;
    const INNER_FLOOR_T = 0.05;
    const innerBottomY = -TANK_HEIGHT / 2 + 0.05;
    const innerTopY =
      -TANK_HEIGHT / 2 + TANK_HEIGHT * (SHOULDER_START - 0.05);
    // U-shaped profile (open at top): outer-bottom → outer wall → top edge →
    // inner wall → inner floor → back to axis. Crucially, this leaves an OPENING
    // at the top (the profile does NOT return to the axis at the top — only at
    // the inner floor level).
    const innerProfile = [
      new THREE.Vector2(0, innerBottomY), // bottom outer corner (touches axis)
      new THREE.Vector2(INNER_R, innerBottomY), // outer-bottom-right
      new THREE.Vector2(INNER_R, innerTopY), // top of outer wall
      new THREE.Vector2(INNER_R - INNER_WALL_T, innerTopY), // top of inner wall (across the rim)
      new THREE.Vector2(
        INNER_R - INNER_WALL_T,
        innerBottomY + INNER_FLOOR_T,
      ), // bottom of inner wall
      new THREE.Vector2(0, innerBottomY + INNER_FLOOR_T), // close the floor at axis
    ];
    const innerShellGeo = new THREE.LatheGeometry(innerProfile, 64);
    const innerShellMat = new THREE.MeshPhysicalMaterial({
      color: 0xf6f0f7,
      metalness: 0.0,
      roughness: 0.32,
      transmission: 0.7,
      transparent: true,
      opacity: 0.45,
      thickness: 0.5,
      ior: 1.4,
      side: THREE.DoubleSide,
      clearcoat: 0.7,
      clearcoatRoughness: 0.15,
      attenuationColor: new THREE.Color(0xece0f0),
      attenuationDistance: 1.8,
    });
    materialsRef.current.innerVessel = innerShellMat;
    const innerShell = new THREE.Mesh(innerShellGeo, innerShellMat);
    innerShell.renderOrder = 2;
    group.add(innerShell);

    // ===== Measurement ticks on side =====
    const tickMat = new THREE.MeshBasicMaterial({
      color: 0x401153,
      transparent: true,
      opacity: 0.45,
    });
    for (let i = 1; i <= 10; i++) {
      const y = -TANK_HEIGHT / 2 + (i / 10) * (TANK_HEIGHT * 0.88);
      const tickLen = i % 5 === 0 ? 0.14 : 0.07;
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(tickLen, 0.012, 0.012),
        tickMat,
      );
      tick.position.set(-TANK_RADIUS - 0.02 - tickLen / 2, y, 0);
      group.add(tick);
    }

    // ===== Top neck rim — HOLLOW RING so the tank opening shows through =====
    const neckRadius = TANK_RADIUS * TOP_RADIUS_RATIO;
    const NECK_INNER_R = neckRadius * 0.82; // wall thickness
    const NECK_HEIGHT = 0.1;
    const NECK_BOTTOM_Y = TANK_HEIGHT / 2 - 0.02;
    const neckMat = new THREE.MeshPhysicalMaterial({
      color: 0x401153,
      metalness: 0.75,
      roughness: 0.22,
    });
    const neckHoleMat = new THREE.MeshStandardMaterial({
      color: 0x1a0420,
      metalness: 0.0,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });

    const neckTopRing = new THREE.Mesh(
      new THREE.RingGeometry(NECK_INNER_R, neckRadius, 64),
      neckMat,
    );
    neckTopRing.rotation.x = -Math.PI / 2;
    neckTopRing.position.y = NECK_BOTTOM_Y + NECK_HEIGHT;
    group.add(neckTopRing);

    const neckBottomRing = new THREE.Mesh(
      new THREE.RingGeometry(NECK_INNER_R, neckRadius, 64),
      neckMat,
    );
    neckBottomRing.rotation.x = -Math.PI / 2;
    neckBottomRing.position.y = NECK_BOTTOM_Y;
    group.add(neckBottomRing);

    const neckOuterWall = new THREE.Mesh(
      new THREE.CylinderGeometry(neckRadius, neckRadius, NECK_HEIGHT, 64, 1, true),
      neckMat,
    );
    neckOuterWall.position.y = NECK_BOTTOM_Y + NECK_HEIGHT / 2;
    group.add(neckOuterWall);

    const neckInnerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(NECK_INNER_R, NECK_INNER_R, NECK_HEIGHT + 0.1, 64, 1, true),
      neckHoleMat,
    );
    neckInnerWall.position.y = NECK_BOTTOM_Y + NECK_HEIGHT / 2;
    group.add(neckInnerWall);

    // ===== Tank Lid (annular ring with central opening for canister access) =====
    const lidGroup = new THREE.Group();
    const lidPivot = new THREE.Group();
    lidPivot.position.y = TANK_HEIGHT / 2 + 0.05;
    lidPivot.add(lidGroup);
    group.add(lidPivot);

    // Solid disc lid — covers the tank opening completely.
    // Outer radius matches the neck so it sits flush on top.
    const LID_OUTER_R = neckRadius * 1.04;
    const LID_THICKNESS = 0.18;

    // Bottom face (filled disc, viewed from below when lid is lifted)
    const lidBottomMat = new THREE.MeshPhysicalMaterial({
      color: 0x7a1a88,
      metalness: 0.5,
      roughness: 0.28,
      side: THREE.DoubleSide,
    });
    materialsRef.current.lidBottom = lidBottomMat;
    const lidBottom = new THREE.Mesh(
      new THREE.CircleGeometry(LID_OUTER_R, 64),
      lidBottomMat,
    );
    lidBottom.rotation.x = Math.PI / 2; // face down
    lidBottom.position.y = 0.04;
    lidGroup.add(lidBottom);

    // Top face — slightly darker for visual layering
    const lidTopMat = new THREE.MeshPhysicalMaterial({
      color: 0x401153,
      metalness: 0.6,
      roughness: 0.22,
      side: THREE.DoubleSide,
    });
    materialsRef.current.lidTop = lidTopMat;
    const lidTop = new THREE.Mesh(
      new THREE.CircleGeometry(LID_OUTER_R, 64),
      lidTopMat,
    );
    lidTop.rotation.x = -Math.PI / 2; // face up
    lidTop.position.y = 0.04 + LID_THICKNESS;
    lidGroup.add(lidTop);

    // Outer cylindrical wall (the side of the lid disc)
    const lidOuterWallMat = new THREE.MeshPhysicalMaterial({
      color: 0x7a1a88,
      metalness: 0.55,
      roughness: 0.25,
    });
    materialsRef.current.lidWall = lidOuterWallMat;
    const lidOuterWall = new THREE.Mesh(
      new THREE.CylinderGeometry(
        LID_OUTER_R,
        LID_OUTER_R,
        LID_THICKNESS,
        64,
        1,
        true,
      ),
      lidOuterWallMat,
    );
    lidOuterWall.position.y = 0.04 + LID_THICKNESS / 2;
    lidGroup.add(lidOuterWall);

    // Small handle/knob on top of the lid (so it looks like a real cryocan lid)
    const lidKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.08, 24),
      new THREE.MeshPhysicalMaterial({
        color: 0x401153,
        metalness: 0.7,
        roughness: 0.25,
      }),
    );
    lidKnob.position.y = 0.04 + LID_THICKNESS + 0.04;
    lidGroup.add(lidKnob);

    const lidKnobTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 20, 14),
      new THREE.MeshPhysicalMaterial({
        color: 0x7a1a88,
        metalness: 0.6,
        roughness: 0.3,
      }),
    );
    lidKnobTop.position.y = 0.04 + LID_THICKNESS + 0.1;
    lidGroup.add(lidKnobTop);

    // ===== Side handle grips — HORIZONTAL bars near the top of the straight body =====
    // SHOULDER_START = 0.86 means the body curves above this fraction. Place handles
    // at 0.78 so they sit near the top but on the straight wall.
    const handleY = -TANK_HEIGHT / 2 + TANK_HEIGHT * 0.78;
    const HANDLE_BAR_LEN = 0.55;
    const HANDLE_STANDOFF = 0.18; // how far the bar sits from the tank wall
    const HANDLE_BAR_R = 0.022;

    [0, Math.PI].forEach((ang) => {
      const holder = new THREE.Group();
      holder.position.set(
        Math.cos(ang) * TANK_RADIUS,
        handleY,
        Math.sin(ang) * TANK_RADIUS,
      );
      holder.rotation.y = ang;
      // Inside this holder, +X points outward from the tank wall, Y is vertical (world up),
      // and Z runs tangent to the tank circumference.

      const handleMatLocal = new THREE.MeshPhysicalMaterial({
        color: 0x401153,
        metalness: 0.75,
        roughness: 0.25,
      });

      // Horizontal grip bar — runs along Z (tangent to tank), parallel to the floor.
      // Default cylinder axis is Y, so rotate 90° around X to lay it horizontal along Z.
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(
          HANDLE_BAR_R,
          HANDLE_BAR_R,
          HANDLE_BAR_LEN,
          12,
        ),
        handleMatLocal,
      );
      grip.rotation.x = Math.PI / 2;
      grip.position.set(HANDLE_STANDOFF, 0, 0);
      holder.add(grip);

      // Two brackets connecting the grip ends to the tank wall.
      // Brackets run along X (outward from wall). Default cylinder is Y, rotate around Z.
      [HANDLE_BAR_LEN / 2, -HANDLE_BAR_LEN / 2].forEach((zOff) => {
        const bracket = new THREE.Mesh(
          new THREE.CylinderGeometry(
            HANDLE_BAR_R,
            HANDLE_BAR_R,
            HANDLE_STANDOFF,
            10,
          ),
          handleMatLocal,
        );
        bracket.rotation.z = Math.PI / 2;
        bracket.position.set(HANDLE_STANDOFF / 2, 0, zOff);
        holder.add(bracket);

        // Mounting plate against the wall
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16),
          handleMatLocal,
        );
        plate.rotation.z = Math.PI / 2;
        plate.position.set(0.005, 0, zOff);
        holder.add(plate);
      });

      group.add(holder);
    });

    // ===== Tive Multi-Sensor Tracker (attached to tank side) + PT100 probe =====
    // Real device is 15cm tall but at 50% scale here (7.5cm representational).
    // In scene units (1 unit = 12cm), that's ~0.625 units.
    // Aspect ratio from the reference: ~2:3.4 (W:H), with thickness ~3cm.
    const TIVE_H = 0.625;
    const TIVE_W = 0.37; // 0.625 * 2/3.4 ≈ 0.37
    const TIVE_D = 0.13;
    const TIVE_Y = 1.0; // upper portion of tank body (just below the shoulder curve)
    // Place on the front of the tank (toward +Z so it faces the camera in idle view)
    const TIVE_ATTACH = { x: 0, z: TANK_RADIUS + TIVE_D / 2 + 0.01 };

    const tiveGroup = new THREE.Group();
    tiveGroup.position.set(TIVE_ATTACH.x, TIVE_Y, TIVE_ATTACH.z);
    // Slight outward tilt at the bottom so the device sits flat against the tank curvature
    group.add(tiveGroup);

    // Body — slightly rounded blue box
    const tiveBodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x1574d4, // Tive blue
      metalness: 0.15,
      roughness: 0.45,
      clearcoat: 0.7,
      clearcoatRoughness: 0.3,
    });
    const tiveBody = new THREE.Mesh(
      new THREE.BoxGeometry(TIVE_W, TIVE_H, TIVE_D),
      tiveBodyMat,
    );
    tiveGroup.add(tiveBody);

    // Beveled edge highlights (thin lighter strips on box edges for that photographic
    // "rounded plastic" feel)
    const tiveEdgeMat = new THREE.MeshBasicMaterial({
      color: 0x4ea0e8,
      transparent: true,
      opacity: 0.5,
    });
    const tiveEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(TIVE_W, TIVE_H, TIVE_D)),
      tiveEdgeMat,
    );
    tiveGroup.add(tiveEdges);

    // Top hanging loop (the small ring on top of the device in the reference)
    const tiveLoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.03, 0.007, 8, 20),
      new THREE.MeshPhysicalMaterial({
        color: 0x0f5ba8,
        metalness: 0.4,
        roughness: 0.4,
      }),
    );
    tiveLoop.rotation.x = Math.PI / 2;
    tiveLoop.position.set(0, TIVE_H / 2 + 0.03, 0);
    tiveGroup.add(tiveLoop);

    // Front face label area (white background panel for branding/barcode)
    const tiveLabelMat = new THREE.MeshBasicMaterial({ color: 0xf5f7fa });
    const tiveLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(TIVE_W * 0.78, TIVE_H * 0.42),
      tiveLabelMat,
    );
    tiveLabel.position.set(0, TIVE_H * 0.05, TIVE_D / 2 + 0.001);
    tiveGroup.add(tiveLabel);

    // "tive" wordmark — drawn as a canvas texture so it renders crisp text
    const wordCanvas = document.createElement("canvas");
    wordCanvas.width = 256;
    wordCanvas.height = 96;
    const wctx = wordCanvas.getContext("2d")!;
    wctx.fillStyle = "#1574d4";
    wctx.font = "600 56px 'Outfit', sans-serif";
    wctx.textAlign = "center";
    wctx.textBaseline = "middle";
    wctx.fillText("tive", 128, 36);
    wctx.fillStyle = "#5a7188";
    wctx.font = "400 18px 'Outfit', sans-serif";
    wctx.fillText("Multi-Sensor Tracker", 128, 76);
    const wordTex = new THREE.CanvasTexture(wordCanvas);
    const wordMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(TIVE_W * 0.74, TIVE_W * 0.74 * (96 / 256)),
      new THREE.MeshBasicMaterial({ map: wordTex, transparent: true }),
    );
    wordMesh.position.set(0, TIVE_H * 0.22, TIVE_D / 2 + 0.002);
    tiveGroup.add(wordMesh);

    // Barcode — vertical bars
    const barcodeCanvas = document.createElement("canvas");
    barcodeCanvas.width = 256;
    barcodeCanvas.height = 72;
    const bctx = barcodeCanvas.getContext("2d")!;
    bctx.fillStyle = "#ffffff";
    bctx.fillRect(0, 0, 256, 72);
    bctx.fillStyle = "#0a0e14";
    let bx = 14;
    while (bx < 240) {
      const w = 1 + Math.floor(Math.random() * 4);
      bctx.fillRect(bx, 6, w, 44);
      bx += w + 1 + Math.floor(Math.random() * 3);
    }
    bctx.fillStyle = "#0a0e14";
    bctx.font = "600 18px 'JetBrains Mono', monospace";
    bctx.textAlign = "center";
    bctx.fillText("T50000", 128, 64);
    const bcTex = new THREE.CanvasTexture(barcodeCanvas);
    const barcodeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(TIVE_W * 0.62, TIVE_W * 0.62 * (72 / 256)),
      new THREE.MeshBasicMaterial({ map: bcTex }),
    );
    barcodeMesh.position.set(0, TIVE_H * -0.05, TIVE_D / 2 + 0.002);
    tiveGroup.add(barcodeMesh);

    // Power button (small rounded rect at bottom front)
    const tivePowerBtn = new THREE.Mesh(
      new THREE.CircleGeometry(0.025, 24),
      new THREE.MeshPhysicalMaterial({
        color: 0x0f5ba8,
        metalness: 0.3,
        roughness: 0.4,
      }),
    );
    tivePowerBtn.position.set(-TIVE_W * 0.18, -TIVE_H * 0.36, TIVE_D / 2 + 0.003);
    tiveGroup.add(tivePowerBtn);

    // Cable/probe gland on the top edge of the device (where wire exits)
    const tiveGland = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.035, 12),
      new THREE.MeshPhysicalMaterial({
        color: 0x1a1a1a,
        metalness: 0.3,
        roughness: 0.6,
      }),
    );
    tiveGland.position.set(0.09, TIVE_H / 2 + 0.018, 0);
    tiveGroup.add(tiveGland);

    // ===== PT100 probe wire =====
    // Goes from the device's top (gland), up & over the lid rim, then down through
    // the lid hole into the tank. Modelled as a CatmullRom curve through anchor points.
    const wireStartLocal = new THREE.Vector3(0.09, TIVE_H / 2 + 0.035, 0);
    const wireStartWorld = wireStartLocal.clone().add(tiveGroup.position);

    // Anchor points (in world coords, since wire is added directly to group)
    // The probe enters through the NECK opening (the actual tank hole).
    const lidTopY = TANK_HEIGHT / 2 + 0.05 + 0.04 + LID_THICKNESS + 0.05;
    const HOLE_R = NECK_INNER_R; // tank's actual opening
    const wirePoints = [
      wireStartWorld.clone(),
      // Up along the tank side
      new THREE.Vector3(
        wireStartWorld.x,
        TANK_HEIGHT / 2 - 0.4,
        wireStartWorld.z,
      ),
      // Curve toward the top
      new THREE.Vector3(
        wireStartWorld.x * 0.8,
        TANK_HEIGHT / 2 + 0.1,
        wireStartWorld.z * 0.85,
      ),
      // Approach the neck opening (front side)
      new THREE.Vector3(0, lidTopY + 0.1, HOLE_R * 0.85),
      // Drape over the rim and start descending into the tank
      new THREE.Vector3(0, lidTopY - 0.05, HOLE_R * 0.55),
      // Drop into the tank — through the neck hole
      new THREE.Vector3(0, TANK_HEIGHT / 2 - 0.2, HOLE_R * 0.35),
      // Continue dropping inside the tank near the canister cluster
      new THREE.Vector3(0, 0.2, HOLE_R * 0.3),
      // Probe tip rests near LN2 surface, between canisters
      new THREE.Vector3(0, -0.5, HOLE_R * 0.3),
    ];

    const wireCurve = new THREE.CatmullRomCurve3(wirePoints, false, "catmullrom", 0.3);
    const wireGeo = new THREE.TubeGeometry(wireCurve, 80, 0.018, 8, false);
    const wireMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a2a2a,
      metalness: 0.2,
      roughness: 0.6,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    group.add(wireMesh);

    // PT100 probe tip — a small stainless steel tube at the wire's end
    const probeTipPos = wirePoints[wirePoints.length - 1];
    const probeTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.18, 12),
      new THREE.MeshPhysicalMaterial({
        color: 0xcfd2d8,
        metalness: 0.85,
        roughness: 0.25,
      }),
    );
    probeTip.position.set(probeTipPos.x, probeTipPos.y - 0.09, probeTipPos.z);
    group.add(probeTip);
    // Sealed cap at the bottom of the probe
    const probeCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 12, 8),
      new THREE.MeshPhysicalMaterial({
        color: 0xa5a8ad,
        metalness: 0.85,
        roughness: 0.3,
      }),
    );
    probeCap.position.set(probeTipPos.x, probeTipPos.y - 0.18, probeTipPos.z);
    group.add(probeCap);

    // ===== Canisters =====
    const canBodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xcfcfd5,
      metalness: 0.85,
      roughness: 0.38,
    });
    const rodMat = new THREE.MeshPhysicalMaterial({
      color: 0x401153,
      metalness: 0.85,
      roughness: 0.2,
    });

    const makeCanister = (idx: number) => {
      const g = new THREE.Group();

      // Per-canister handle material so its opacity can fade independently
      const handleMat = rodMat.clone();
      handleMat.transparent = true;
      handleMat.opacity = 1;

      // ===== Hollow canister body (open top, sealed bottom) =====
      const innerR = CAN_RADIUS - CAN_WALL;
      const innerBottomY = -CAN_HEIGHT / 2 + CAN_FLOOR;

      // Outer wall — open-ended cylinder; receives clicks
      const outerWall = new THREE.Mesh(
        new THREE.CylinderGeometry(
          CAN_RADIUS,
          CAN_RADIUS,
          CAN_HEIGHT,
          32,
          1,
          true, // openEnded
        ),
        canBodyMat,
      );
      outerWall.userData.canisterIndex = idx;
      outerWall.userData.clickable = true;
      g.add(outerWall);

      // Outside bottom seal — disc closing the underside (so you can't see through from below)
      const outerBottom = new THREE.Mesh(
        new THREE.CircleGeometry(CAN_RADIUS, 32),
        canBodyMat,
      );
      outerBottom.rotation.x = Math.PI / 2; // face down
      outerBottom.position.y = -CAN_HEIGHT / 2;
      g.add(outerBottom);

      // Top rim — annulus showing the wall thickness
      const topRim = new THREE.Mesh(
        new THREE.RingGeometry(innerR, CAN_RADIUS, 32),
        canBodyMat,
      );
      topRim.rotation.x = -Math.PI / 2; // face up
      topRim.position.y = CAN_HEIGHT / 2;
      g.add(topRim);

      // Inner wall — slightly smaller cylinder, double-sided so it lights well
      const innerWallMat = new THREE.MeshPhysicalMaterial({
        color: 0xb8b8c2,
        metalness: 0.5,
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      const innerWall = new THREE.Mesh(
        new THREE.CylinderGeometry(
          innerR,
          innerR,
          CAN_HEIGHT - CAN_FLOOR,
          32,
          1,
          true,
        ),
        innerWallMat,
      );
      innerWall.position.y = CAN_FLOOR / 2; // sits on top of the inside floor
      g.add(innerWall);

      // Inside floor — disc the straws sit on
      const insideFloor = new THREE.Mesh(
        new THREE.CircleGeometry(innerR, 32),
        new THREE.MeshPhysicalMaterial({
          color: 0xa0a0aa,
          metalness: 0.6,
          roughness: 0.6,
        }),
      );
      insideFloor.rotation.x = -Math.PI / 2; // face up
      insideFloor.position.y = innerBottomY;
      g.add(insideFloor);

      // Subtle striations on canister
      for (let s = 0; s < 3; s++) {
        const stripe = new THREE.Mesh(
          new THREE.TorusGeometry(CAN_RADIUS * 1.001, 0.006, 6, 20),
          new THREE.MeshBasicMaterial({
            color: 0x9090a0,
            transparent: true,
            opacity: 0.5,
          }),
        );
        stripe.rotation.x = Math.PI / 2;
        stripe.position.y = -CAN_HEIGHT / 2 + (s + 1) * (CAN_HEIGHT / 4);
        g.add(stripe);
      }

      // Handle: long rod reaching from canister top up to the tank lid + grip ring at top
      // Rod must span from canister top (CAN_HEIGHT/2) to just below the lid base.
      // Lid bottom in world ≈ TANK_HEIGHT/2 + 0.09. Canister top in world = HOME_Y + CAN_HEIGHT/2.
      // → required rod length ≈ TANK_HEIGHT - CAN_HEIGHT - 0.1 + 0.09 ≈ 1.39 (TANK_H=5, CAN_H=3.6)
      // Rod reaches up so the grip ring sits just below the closed lid bottom.
      // Closed lid bottom in world ≈ TANK_HEIGHT/2 + 0.09. Ring world Y =
      // HOME_Y + CAN_HEIGHT/2 + ROD_LENGTH. Solving: ROD_LENGTH = TANK_HEIGHT - CAN_HEIGHT - 0.06
      // gives a 0.05-unit gap between ring and lid bottom.
      const ROD_LENGTH = TANK_HEIGHT - CAN_HEIGHT - 0.06;
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, ROD_LENGTH, 10),
        handleMat,
      );
      rod.position.y = CAN_HEIGHT / 2 + ROD_LENGTH / 2;
      rod.userData.canisterIndex = idx;
      rod.userData.clickable = true;
      g.add(rod);

      const topRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.022, 10, 24),
        handleMat,
      );
      topRing.position.y = CAN_HEIGHT / 2 + ROD_LENGTH;
      topRing.rotation.x = Math.PI / 2;
      topRing.userData.canisterIndex = idx;
      topRing.userData.clickable = true;
      g.add(topRing);

      // ===== IVF straws bundled inside the canister =====
      const strawGroup = new THREE.Group();
      const STRAW_R = 0.022;
      const STRAW_H = CAN_HEIGHT * 0.62;
      // Straws sit on the inside floor (just above CAN_FLOOR)
      const strawBaseY = innerBottomY + STRAW_H / 2 + 0.005;
      const strawSubgroups: StrawSubgroup[] = []; // [{group, homeLocalPos, strawMat, baseColor}]
      STRAW_OFFSETS.forEach((off, i) => {
        // Each straw + tip lives in its own sub-group so we can fly it out
        const sub = new THREE.Group();
        sub.position.set(off[0], strawBaseY, off[1]);
        const homeLocalPos = sub.position.clone();

        const baseColor = STRAW_COLORS[i % STRAW_COLORS.length];
        const strawMat = new THREE.MeshPhysicalMaterial({
          color: baseColor,
          metalness: 0.15,
          roughness: 0.45,
          emissive: 0x000000,
          emissiveIntensity: 0,
        });
        const straw = new THREE.Mesh(
          new THREE.CylinderGeometry(STRAW_R, STRAW_R, STRAW_H, 10),
          strawMat,
        );
        straw.userData.strawIndex = i;
        straw.userData.strawClickable = true;
        sub.add(straw);

        const tip = new THREE.Mesh(
          new THREE.CylinderGeometry(STRAW_R * 1.05, STRAW_R * 1.05, 0.05, 10),
          new THREE.MeshPhysicalMaterial({
            color: 0x401153,
            metalness: 0.3,
            roughness: 0.3,
          }),
        );
        tip.position.y = STRAW_H / 2 + 0.025;
        tip.userData.strawIndex = i;
        tip.userData.strawClickable = true;
        sub.add(tip);

        strawGroup.add(sub);
        strawSubgroups.push({
          group: sub,
          homeLocalPos,
          index: i,
          strawMat,
          baseColor,
        });
      });
      g.add(strawGroup);

      return { group: g, handleMat, strawSubgroups, strawGroup };
    };

    const canisters: CanisterRuntime[] = [];
    const HOME_Y = -TANK_HEIGHT / 2 + CAN_HEIGHT / 2 + 0.1;
    for (let i = 0; i < CAN_COUNT; i++) {
      const ang = (i / CAN_COUNT) * Math.PI * 2;
      const parts = makeCanister(i);
      const homePos = new THREE.Vector3(
        Math.cos(ang) * CAN_RING_R,
        HOME_Y,
        Math.sin(ang) * CAN_RING_R,
      );
      parts.group.position.copy(homePos);
      parts.group.rotation.y = ang;
      group.add(parts.group);
      canisters.push({
        group: parts.group,
        handleMat: parts.handleMat,
        strawSubgroups: parts.strawSubgroups,
        strawGroup: parts.strawGroup,
        homePos,
        homeAngle: ang,
        index: i,
      });
    }
    canistersRef.current = canisters;
    lidGroupRef.current = lidPivot;

    // ===== LN2 liquid (fits inside the inner vessel) =====
    const LN2_R = INNER_R - 0.07;
    const ln2Geo = new THREE.CylinderGeometry(
      LN2_R,
      LN2_R,
      MAX_LN2_HEIGHT,
      48,
    );
    ln2Geo.translate(0, MAX_LN2_HEIGHT / 2, 0);
    const ln2Mat = new THREE.MeshPhysicalMaterial({
      color: 0x6aa8d8,
      metalness: 0.0,
      roughness: 0.15,
      transmission: 0.55,
      transparent: true,
      opacity: 0.72,
      thickness: 1.2,
      ior: 1.22,
      clearcoat: 0.4,
      clearcoatRoughness: 0.15,
      attenuationColor: new THREE.Color(0x4e8fc9),
      attenuationDistance: 1.6,
    });
    materialsRef.current.ln2 = ln2Mat;
    const ln2 = new THREE.Mesh(ln2Geo, ln2Mat);
    ln2.position.y = -TANK_HEIGHT / 2 + LN2_BOTTOM_MARGIN;
    ln2.scale.y = fill / 100;
    ln2.renderOrder = 1;
    group.add(ln2);
    ln2Ref.current = ln2;

    // ===== Wave surface (radial disc with concentric vertex rings) =====
    const RADIAL_SEG = 56;
    const RADIUS_RINGS = 10;
    const waveGeo = new THREE.BufferGeometry();
    const positions = [];
    const indices = [];

    positions.push(0, 0, 0);
    for (let r = 1; r <= RADIUS_RINGS; r++) {
      const radius = (r / RADIUS_RINGS) * LN2_R * 0.98;
      for (let s = 0; s < RADIAL_SEG; s++) {
        const angle = (s / RADIAL_SEG) * Math.PI * 2;
        positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      }
    }

    // Triangles: center fan
    for (let s = 0; s < RADIAL_SEG; s++) {
      indices.push(0, 1 + s, 1 + ((s + 1) % RADIAL_SEG));
    }
    // Ring bands
    for (let r = 1; r < RADIUS_RINGS; r++) {
      const inner = 1 + (r - 1) * RADIAL_SEG;
      const outer = 1 + r * RADIAL_SEG;
      for (let s = 0; s < RADIAL_SEG; s++) {
        const n = (s + 1) % RADIAL_SEG;
        indices.push(
          inner + s,
          outer + s,
          inner + n,
          inner + n,
          outer + s,
          outer + n,
        );
      }
    }

    waveGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    waveGeo.setIndex(indices);
    waveGeo.computeVertexNormals();

    const waveMat = new THREE.MeshPhysicalMaterial({
      color: 0x8fc0df,
      metalness: 0.0,
      roughness: 0.08,
      transmission: 0.45,
      transparent: true,
      opacity: 0.88,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      side: THREE.DoubleSide,
      ior: 1.3,
    });
    materialsRef.current.wave = waveMat;
    const waveMesh = new THREE.Mesh(waveGeo, waveMat);
    waveMesh.position.y =
      -TANK_HEIGHT / 2 + LN2_BOTTOM_MARGIN + MAX_LN2_HEIGHT * (fill / 100);
    group.add(waveMesh);
    waveRef.current = waveMesh;
    waveOrigPosRef.current = new Float32Array(positions);

    // ===== Vapour particles above the lid =====
    const P_COUNT = 42;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(P_COUNT * 3);
    const pVel: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < P_COUNT; i++) {
      const r = Math.random() * TANK_RADIUS * 0.35;
      const a = Math.random() * Math.PI * 2;
      pPos[i * 3] = Math.cos(a) * r;
      pPos[i * 3 + 1] = TANK_HEIGHT / 2 + 0.6 + Math.random() * 2.8;
      pPos[i * 3 + 2] = Math.sin(a) * r;
      pVel.push({
        y: 0.008 + Math.random() * 0.014,
        x: (Math.random() - 0.5) * 0.003,
        z: (Math.random() - 0.5) * 0.003,
      });
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xf3eaf6,
      size: 0.14,
      transparent: true,
      opacity: 0.42,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // ===== Soft shadow ellipse under tank =====
    const shadowTexCanvas = document.createElement("canvas");
    shadowTexCanvas.width = shadowTexCanvas.height = 256;
    const stx = shadowTexCanvas.getContext("2d")!;
    const rg = stx.createRadialGradient(128, 128, 10, 128, 128, 128);
    rg.addColorStop(0, "rgba(64, 17, 83, 0.55)");
    rg.addColorStop(0.6, "rgba(64, 17, 83, 0.15)");
    rg.addColorStop(1, "rgba(64, 17, 83, 0)");
    stx.fillStyle = rg;
    stx.fillRect(0, 0, 256, 256);
    const shadowTex = new THREE.CanvasTexture(shadowTexCanvas);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(TANK_RADIUS * 3.4, TANK_RADIUS * 3.4),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -TANK_HEIGHT / 2 - 0.25;
    scene.add(shadow);

    // ===== Pointer: drag to rotate (when exterior, no canister selected) + click on canisters =====
    let dragging = false;
    let pressed = false;
    let pressX = 0;
    let pressY = 0;
    let lastX = 0;
    let dragDist = 0;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const pickCanister = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const clickables: Object3D[] = [];
      canisters.forEach((c) =>
        c.group.traverse((o: Object3D) => {
          if (o.userData && o.userData.clickable) clickables.push(o);
        }),
      );
      const hits = raycaster.intersectObjects(clickables, false);
      if (!hits.length) return null;
      const idx = hits[0].object.userData.canisterIndex;
      return idx < sceneCanisterCountRef.current ? idx : null;
    };

    const pickStraw = (clientX: number, clientY: number) => {
      const sel = selectedCanisterRef.current;
      if (sel === null) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const clickables: Object3D[] = [];
      canisters[sel].strawSubgroups.forEach((s) =>
        s.group.traverse((o: Object3D) => {
          if (o.userData && o.userData.strawClickable) clickables.push(o);
        }),
      );
      const hits = raycaster.intersectObjects(clickables, false);
      return hits.length ? hits[0].object.userData.strawIndex : null;
    };

    const getClientPos = (e: PointerEvent | TouchEvent) => {
      if ("touches" in e && e.touches.length) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if ("changedTouches" in e && e.changedTouches.length) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      }
      return { x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY };
    };

    const onDown = (e: PointerEvent | TouchEvent) => {
      pressed = true;
      const pos = getClientPos(e);
      pressX = pos.x ?? 0;
      pressY = pos.y ?? 0;
      lastX = pressX;
      dragDist = 0;
      if (viewStageRef.current === "idle") {
        dragging = true;
        renderer.domElement.style.cursor = "grabbing";
      }
    };
    const onUp = (e: PointerEvent | TouchEvent) => {
      const pos = getClientPos(e);
      const upX = pos.x ?? lastX;
      const upY = pos.y ?? pressY;
      const wasClick =
        pressed &&
        Math.abs(upX - pressX) < 5 &&
        Math.abs(upY - pressY) < 5 &&
        dragDist < 6;
      dragging = false;
      pressed = false;
      renderer.domElement.style.cursor = "grab";

      if (wasClick) {
        const stage = viewStageRef.current;
        const sel = selectedCanisterRef.current;

        if (stage === "inspecting") {
          // In inspecting stage, clicks select straws
          const strawIdx = pickStraw(upX, upY);
          if (strawIdx !== null) {
            setSelectedStraw((prev) =>
              prev === strawIdx ? null : strawIdx,
            );
          }
          return;
        }

        const idx = pickCanister(upX, upY);
        if (idx === null) return;

        if (stage === "idle") {
          setSelectedCanister(idx);
          setViewStage("extracted");
        } else if (stage === "extracted" && idx === sel) {
          setViewStage("inspecting");
        }
      }
    };
    const onMove = (e: PointerEvent | TouchEvent) => {
      const pos = getClientPos(e);
      const x = pos.x ?? 0;
      const y = pos.y ?? 0;

      if (pressed) {
        dragDist += Math.abs(x - lastX);
      }
      if (dragging) {
        group.rotation.y += (x - lastX) * 0.01;
      }
      lastX = x;

      // Hover affordance — pointer if click would do something useful
      if (!pressed) {
        const stage = viewStageRef.current;
        const sel = selectedCanisterRef.current;
        let actionable = false;
        if (stage === "inspecting") {
          actionable = pickStraw(x, y) !== null;
        } else {
          const idx = pickCanister(x, y);
          if (idx !== null) {
            if (stage === "idle") actionable = true;
            else if (stage === "extracted" && idx === sel) actionable = true;
          }
        }
        renderer.domElement.style.cursor = actionable
          ? "pointer"
          : stage === "idle"
            ? "grab"
            : "default";
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown as EventListener);
    window.addEventListener("pointerup", onUp as EventListener);
    window.addEventListener("pointermove", onMove as EventListener);

    // ===== Animation loop =====
    let t = 0;
    let animId = 0;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      t += 0.02;

      if (
        autoRotateRef.current &&
        !dragging &&
        viewStageRef.current === "idle"
      ) {
        group.rotation.y += 0.0032;
      }

      // Camera always looks at its tweened target
      camera.lookAt(camTarget);

      // Wave ripple
      if (waveRef.current && waveOrigPosRef.current) {
        const pos = waveRef.current.geometry.attributes.position;
        const arr = pos.array;
        const orig = waveOrigPosRef.current;
        for (let i = 0; i < arr.length; i += 3) {
          const x = orig[i];
          const z = orig[i + 2];
          const d = Math.sqrt(x * x + z * z);
          arr[i + 1] =
            Math.sin(d * 5.0 - t * 2.4) * 0.045 +
            Math.cos(x * 4.2 + t * 1.3) * 0.025 +
            Math.sin(z * 4.2 + t * 1.1) * 0.025;
        }
        pos.needsUpdate = true;
        waveRef.current.geometry.computeVertexNormals();
      }

      // Vapour
      const pa = particles.geometry.attributes.position.array;
      for (let i = 0; i < P_COUNT; i++) {
        pa[i * 3] += pVel[i].x + Math.sin(t * 0.6 + i) * 0.0008;
        pa[i * 3 + 1] += pVel[i].y;
        pa[i * 3 + 2] += pVel[i].z + Math.cos(t * 0.6 + i) * 0.0008;
        if (pa[i * 3 + 1] > TANK_HEIGHT / 2 + 3.4) {
          const r = Math.random() * TANK_RADIUS * 0.35;
          const a = Math.random() * Math.PI * 2;
          pa[i * 3] = Math.cos(a) * r;
          pa[i * 3 + 1] = TANK_HEIGHT / 2 + 0.55;
          pa[i * 3 + 2] = Math.sin(a) * r;
        }
      }
      particles.geometry.attributes.position.needsUpdate = true;

      // Breathing rim light
      rim1.intensity = 1.4 + Math.sin(t * 0.45) * 0.25;

      renderer.render(scene, camera);
    };
    tick();

    // ===== Resize =====
    const onResize = () => {
      const { w: nw, h: nh } = getDims();
      if (!nw || !nh) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown as EventListener);
      window.removeEventListener("pointerup", onUp as EventListener);
      window.removeEventListener("pointermove", onMove as EventListener);
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
      scene.traverse((o: Object3D) => {
        const mesh = o as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m: Material) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, []); // scene built once

  // ---------- Live theme overrides ----------
  useEffect(() => {
    const mats = materialsRef.current;
    if (!mats || !mats.tankShell || !themeOverrides) return;
    // Helper to set color from a hex string or number
    const setColor = (
      mat: MaterialLike,
      val: string | number | null | undefined,
    ) => {
      if (val == null) return;
      if (!mat.color) return;
      if (typeof val === "string") mat.color.set(val);
      else mat.color.setHex(val);
      mat.needsUpdate = true;
    };
    const setNumber = (
      mat: MaterialLike,
      key: string,
      val: number | null | undefined,
    ) => {
      if (val == null) return;
      mat[key] = val;
      mat.needsUpdate = true;
    };

    if (themeOverrides.shell && mats.tankShell) {
      setColor(mats.tankShell, themeOverrides.shell.color);
      setNumber(mats.tankShell, "opacity", themeOverrides.shell.opacity);
      setNumber(mats.tankShell, "transmission", themeOverrides.shell.transmission);
      setNumber(mats.tankShell, "roughness", themeOverrides.shell.roughness);
    }
    if (themeOverrides.innerShell && mats.innerVessel) {
      setColor(mats.innerVessel, themeOverrides.innerShell.color);
      setNumber(mats.innerVessel, "opacity", themeOverrides.innerShell.opacity);
      setNumber(mats.innerVessel, "transmission", themeOverrides.innerShell.transmission);
    }
    if (themeOverrides.ln2 && mats.ln2) {
      setColor(mats.ln2, themeOverrides.ln2.color);
      setNumber(mats.ln2, "opacity", themeOverrides.ln2.opacity);
      setNumber(mats.ln2, "transmission", themeOverrides.ln2.transmission);
    }
    if (themeOverrides.wave && mats.wave) {
      setColor(mats.wave, themeOverrides.wave.color);
      setNumber(mats.wave, "opacity", themeOverrides.wave.opacity);
    }
    if (themeOverrides.lid) {
      if (mats.lidBottom) setColor(mats.lidBottom, themeOverrides.lid.color);
      if (mats.lidWall) setColor(mats.lidWall, themeOverrides.lid.color);
      if (mats.lidTop) setColor(mats.lidTop, themeOverrides.lid.topColor);
    }
    if (themeOverrides.platform && mats.platform) {
      setColor(mats.platform, themeOverrides.platform.color);
      setNumber(mats.platform, "metalness", themeOverrides.platform.metalness);
      setNumber(mats.platform, "roughness", themeOverrides.platform.roughness);
    }
  }, [themeOverrides]);

  // ---------- Smoothly tween LN2 level + percentage when fill changes ----------
  useEffect(() => {
    const ln2 = ln2Ref.current;
    const wave = waveRef.current;
    if (!ln2 || !wave) return;

    const targetScale = fill / 100;
    const targetWaveY =
      -TANK_HEIGHT / 2 + LN2_BOTTOM_MARGIN + MAX_LN2_HEIGHT * (fill / 100);

    if (animeReady && window.anime) {
      window.anime.remove(ln2.scale);
      window.anime.remove(wave.position);
      window.anime({
        targets: ln2.scale,
        y: targetScale,
        duration: 1400,
        easing: "easeOutCubic",
      });
      window.anime({
        targets: wave.position,
        y: targetWaveY,
        duration: 1400,
        easing: "easeOutCubic",
      });
      const counter = { v: displayPct };
      window.anime.remove(counter);
      window.anime({
        targets: counter,
        v: fill,
        duration: 1400,
        easing: "easeOutCubic",
        update: () => setDisplayPct(counter.v),
      });
    } else {
      ln2.scale.y = targetScale;
      wave.position.y = targetWaveY;
      setDisplayPct(fill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill, animeReady]);

  // ---------- Canister extraction + straw inspection animation ----------
  useEffect(() => {
    const cam = cameraRef.current;
    const target = camTargetRef.current;
    const grp = sceneGroupRef.current;
    const lidPivot = lidGroupRef.current;
    const interior = interiorLightRef.current;
    const cans = canistersRef.current;
    if (!cam || !target || !grp || !lidPivot || !interior || !cans.length)
      return;

    const anime = window.anime;

    const ROD_LENGTH_DYN = TANK_HEIGHT - CAN_HEIGHT - 0.06;
    const LIFT_Y = TANK_HEIGHT / 2 + CAN_HEIGHT / 2 + 0.5;
    const LID_OPEN_Y =
      LIFT_Y + CAN_HEIGHT / 2 + ROD_LENGTH_DYN + 0.6;
    const LID_CLOSED_Y = TANK_HEIGHT / 2 + 0.05;
    const PARK_DIST = TANK_RADIUS + 1.6; // canister parking distance from tank center
    const PARK_Y = -TANK_HEIGHT / 2 + CAN_HEIGHT / 2 + 0.4;

    // Stage 1 (extracted) framing — tank on LEFT of frame, canister CENTERED
    // Stage 1 (extracted) framing — canister centered in visible area (right of vitals).
    // halfW at z=8.5 ≈ 4.39; visible center = target.x + 0.245·halfW.
    // Want canister at world x=PARK_DIST=3.1 → target.x = 3.1 - 0.245·4.39 ≈ 2.02
    const STAGE1_TARGET = { x: 2.0, y: 0.2, z: 0 };
    const STAGE1_CAM = { x: 2.0, y: 1.0, z: 8.5 };

    // Stage 2 (inspecting) framing — STRAWS are the focal subject.
    // Straws moved to outside-right sidebar, so canvas only has vitals on LEFT (~24.5%).
    // Visible center = target.x + 0.245·halfW. Want straws (x=STRAW_SHELF_X=5.1) at center.
    // halfW at z=6.5 ≈ 3.36; target.x = 5.1 - 0.245·3.36 ≈ 4.28.
    const STRAW_SHELF_X = PARK_DIST + 2.0; // = 5.1
    const ROW_SPACING = 0.22;
    const STAGE2_TARGET = { x: 4.3, y: 0.0, z: 0 };
    const STAGE2_CAM = { x: 4.3, y: 0.6, z: 6.5 };

    // Idle framing — tank centered
    // Idle framing — vitals stack on the LEFT covers ~24.5% of the canvas pixels.
    // The visible 3D area is the RIGHT 75.5%, whose CENTER in world is at
    // (target.x + 0.245·halfW). To put the tank (world x=0) at that visible center,
    // we need target.x = -0.245·halfW. At z=11, halfW≈5.68, so target.x ≈ -1.4.
    const IDLE_TARGET = { x: -1.4, y: 0, z: 0 };
    const IDLE_CAM = { x: -1.4, y: 0.5, z: 11.0 };

    // ---------- STAGE: idle (return to default) ----------
    if (selectedCanister === null) {
      if (!animeReady || !anime) {
        cans.forEach((c) => {
          c.group.position.copy(c.homePos);
          c.handleMat.opacity = 1;
          c.strawSubgroups.forEach((s) =>
            s.group.position.copy(s.homeLocalPos),
          );
          c.strawGroup.position.set(0, 0, 0);
          c.strawGroup.parent !== c.group && c.group.add(c.strawGroup);
        });
        lidPivot.position.y = LID_CLOSED_Y;
        cam.position.set(IDLE_CAM.x, IDLE_CAM.y, IDLE_CAM.z);
        target.set(IDLE_TARGET.x, IDLE_TARGET.y, IDLE_TARGET.z);
        interior.intensity = 0;
        return;
      }

      anime.remove(cam.position);
      anime.remove(target);
      anime.remove(lidPivot.position);
      anime.remove(interior);
      anime.remove(interior.position);

      // 1) Camera pulls back to default
      anime({
        targets: cam.position,
        keyframes: [
          { x: 1.5, y: 3.0, z: 6.5, duration: 1100 },
          { x: IDLE_CAM.x, y: IDLE_CAM.y, z: IDLE_CAM.z, duration: 1000 },
        ],
        easing: "easeInOutCubic",
      });
      anime({
        targets: target,
        keyframes: [
          { x: 0.5, y: 1.0, z: 0, duration: 1100 },
          { x: IDLE_TARGET.x, y: IDLE_TARGET.y, z: IDLE_TARGET.z, duration: 1000 },
        ],
        easing: "easeInOutCubic",
      });

      // 2) Return any displaced straws to their canister, then displaced canisters home
      let returningCan = null;
      cans.forEach((c) => {
        // Reparent stray straws back into canister if they were detached
        c.strawSubgroups.forEach((s) => {
          if (s.group.parent !== c.strawGroup) {
            const wp = new THREE.Vector3();
            s.group.getWorldPosition(wp);
            c.strawGroup.add(s.group);
            // Convert world -> strawGroup-local (the new parent)
            const lp = c.strawGroup.worldToLocal(wp.clone());
            s.group.position.copy(lp);
          }
          anime.remove(s.group.position);
          anime({
            targets: s.group.position,
            x: s.homeLocalPos.x,
            y: s.homeLocalPos.y,
            z: s.homeLocalPos.z,
            duration: 700,
            easing: "easeInOutCubic",
            delay: 200,
          });
        });

        // Canister return motion
        const dx = c.group.position.x - c.homePos.x;
        const dy = c.group.position.y - c.homePos.y;
        const dz = c.group.position.z - c.homePos.z;
        if (dx * dx + dy * dy + dz * dz < 0.01) return;
        returningCan = c;

        const startX = c.group.position.x;
        const startZ = c.group.position.z;
        anime.remove(c.group.position);
        anime({
          targets: c.group.position,
          keyframes: [
            { x: startX, y: LIFT_Y, z: startZ, duration: 700 },
            {
              x: Math.cos(c.homeAngle) * CAN_RING_R,
              y: LIFT_Y,
              z: Math.sin(c.homeAngle) * CAN_RING_R,
              duration: 700,
            },
            { x: c.homePos.x, y: c.homePos.y, z: c.homePos.z, duration: 800 },
          ],
          easing: "easeInOutCubic",
          delay: 1100,
        });

        anime.remove(c.handleMat);
        anime({
          targets: c.handleMat,
          opacity: 1,
          duration: 600,
          easing: "easeOutQuad",
          delay: 1300,
        });
      });

      const canisterLandedAt = returningCan ? 1100 + 700 + 700 + 800 : 0;
      anime({
        targets: lidPivot.position,
        y: LID_CLOSED_Y,
        duration: 900,
        easing: "easeInOutCubic",
        delay: canisterLandedAt,
      });

      anime({
        targets: interior,
        intensity: 0,
        duration: 800,
        easing: "easeInQuad",
      });

      return;
    }

    // ---------- selectedCanister is set: STAGE depends on viewStage ----------
    const can = cans[selectedCanister];
    if (!can) return;

    const targetGroupRot = can.homeAngle;
    const dirX = Math.cos(can.homeAngle);
    const dirZ = Math.sin(can.homeAngle);
    const liftLocalX = dirX * CAN_RING_R;
    const liftLocalZ = dirZ * CAN_RING_R;
    const parkLocalX = dirX * PARK_DIST;
    const parkLocalZ = dirZ * PARK_DIST;

    // ---------- STAGE: extracted ----------
    if (viewStage === "extracted") {
      if (!animeReady || !anime) {
        grp.rotation.y = targetGroupRot;
        lidPivot.position.y = LID_OPEN_Y;
        can.group.position.set(parkLocalX, PARK_Y, parkLocalZ);
        can.handleMat.opacity = 1;
        // Make sure straws are home
        can.strawSubgroups.forEach((s) => {
          if (s.group.parent !== can.strawGroup) can.strawGroup.add(s.group);
          s.group.position.copy(s.homeLocalPos);
        });
        cam.position.set(STAGE1_CAM.x, STAGE1_CAM.y, STAGE1_CAM.z);
        target.set(STAGE1_TARGET.x, STAGE1_TARGET.y, STAGE1_TARGET.z);
        interior.intensity = 0.5;
        return;
      }

      anime.remove(cam.position);
      anime.remove(target);
      anime.remove(grp.rotation);
      anime.remove(lidPivot.position);
      anime.remove(can.group.position);
      anime.remove(interior);
      anime.remove(interior.position);
      anime.remove(can.handleMat);

      // Determine if we're entering from idle (full lift sequence) or from inspecting (reverse straws)
      const comingFromInspecting =
        can.strawSubgroups.some((s) => s.group.parent !== can.strawGroup);

      if (comingFromInspecting) {
        // Reverse: straws fly back into canister
        can.strawSubgroups.forEach((s, i) => {
          // Reparent back to canister's strawGroup
          const wp = new THREE.Vector3();
          s.group.getWorldPosition(wp);
          can.strawGroup.add(s.group);
          const lp = can.strawGroup.worldToLocal(wp.clone());
          s.group.position.copy(lp);

          anime.remove(s.group.position);
          anime({
            targets: s.group.position,
            x: s.homeLocalPos.x,
            y: s.homeLocalPos.y,
            z: s.homeLocalPos.z,
            duration: 700,
            easing: "easeInOutCubic",
            delay: i * 30,
          });
        });
        // Restore handle
        anime({
          targets: can.handleMat,
          opacity: 1,
          duration: 500,
          easing: "easeOutQuad",
          delay: 600,
        });
        // Camera back to stage 1 framing
        anime({
          targets: cam.position,
          x: STAGE1_CAM.x,
          y: STAGE1_CAM.y,
          z: STAGE1_CAM.z,
          duration: 1000,
          easing: "easeInOutCubic",
        });
        anime({
          targets: target,
          x: STAGE1_TARGET.x,
          y: STAGE1_TARGET.y,
          z: STAGE1_TARGET.z,
          duration: 1000,
          easing: "easeInOutCubic",
        });
        anime({
          targets: interior,
          intensity: 0.5,
          duration: 800,
          easing: "easeInOutQuad",
        });
        return;
      }

      // Coming from idle — full extraction sequence
      // 1) Align group so the chosen canister faces +X
      anime({
        targets: grp.rotation,
        y: targetGroupRot,
        duration: 800,
        easing: "easeInOutCubic",
      });

      // 2) Lid lifts straight up
      anime({
        targets: lidPivot.position,
        y: LID_OPEN_Y,
        duration: 1100,
        easing: "easeOutQuart",
        delay: 600,
      });

      // 3) Canister rises out, then arcs to park position
      anime({
        targets: can.group.position,
        keyframes: [
          { x: liftLocalX, y: LIFT_Y, z: liftLocalZ, duration: 1100 },
          { x: parkLocalX, y: PARK_Y + 0.4, z: parkLocalZ, duration: 900 },
          { x: parkLocalX, y: PARK_Y, z: parkLocalZ, duration: 500 },
        ],
        easing: "easeInOutCubic",
        delay: 1500,
      });

      // 4) Camera shifts to stage 1 framing — tank LEFT, canister CENTER
      anime({
        targets: cam.position,
        keyframes: [
          { x: 1.0, y: 2.0, z: 8.0, duration: 1100 },
          {
            x: STAGE1_CAM.x,
            y: STAGE1_CAM.y,
            z: STAGE1_CAM.z,
            duration: 1500,
          },
        ],
        easing: "easeInOutCubic",
        delay: 1700,
      });
      anime({
        targets: target,
        keyframes: [
          { x: 0.5, y: 0.5, z: 0, duration: 1100 },
          {
            x: STAGE1_TARGET.x,
            y: STAGE1_TARGET.y,
            z: STAGE1_TARGET.z,
            duration: 1500,
          },
        ],
        easing: "easeInOutCubic",
        delay: 1700,
      });

      // 5) Soft fill light positions near the parked canister (subtle highlight)
      anime({
        targets: interior.position,
        x: PARK_DIST,
        y: PARK_Y + 1.2,
        z: 1.0,
        duration: 1800,
        easing: "easeInOutCubic",
        delay: 2000,
      });
      anime({
        targets: interior,
        intensity: 0.8,
        duration: 1500,
        easing: "easeOutQuad",
        delay: 2000,
      });
      return;
    }

    // ---------- STAGE: inspecting ----------
    if (viewStage === "inspecting") {
      if (!animeReady || !anime) {
        // Fallback: detach straws to world coords, fan them out
        can.handleMat.opacity = 0;
        can.strawSubgroups.forEach((s, i) => {
          if (s.group.parent !== grp) {
            const wp = new THREE.Vector3();
            s.group.getWorldPosition(wp);
            grp.add(s.group);
            s.group.position.copy(grp.worldToLocal(wp));
          }
          // Horizontal row in world coords — convert to scene-local accounting
          // for the group rotation by +can.homeAngle.
          const h = can.homeAngle;
          const desiredWorldX = STRAW_SHELF_X + (i - 4) * ROW_SPACING;
          s.group.position.set(
            Math.cos(h) * desiredWorldX,
            PARK_Y + 0.1,
            Math.sin(h) * desiredWorldX,
          );
          s.group.rotation.set(0, 0, 0);
        });
        cam.position.set(STAGE2_CAM.x, STAGE2_CAM.y, STAGE2_CAM.z);
        target.set(STAGE2_TARGET.x, STAGE2_TARGET.y, STAGE2_TARGET.z);
        interior.intensity = 1.5;
        return;
      }

      anime.remove(cam.position);
      anime.remove(target);
      anime.remove(can.handleMat);
      anime.remove(interior);
      anime.remove(interior.position);

      // 1) Fade canister handle so straws can lift out cleanly
      anime({
        targets: can.handleMat,
        opacity: 0,
        duration: 500,
        easing: "easeInQuad",
      });

      // 2) Reparent each straw from canister-local to world-grp space at its current position,
      //    then animate to its grid slot
      can.strawSubgroups.forEach((s, i) => {
        // Compute current world position
        const wp = new THREE.Vector3();
        s.group.getWorldPosition(wp);
        // Reparent to scene group so motion is in world coords
        grp.add(s.group);
        s.group.position.copy(grp.worldToLocal(wp));

        // Horizontal row layout — all 9 straws side-by-side along WORLD +X.
        // The scene group is rotated by +can.homeAngle, so we need to compute
        // scene-local positions that, after rotation, land at the desired world
        // positions. For desired world (WX, Y, 0), scene-local is
        // (cos(h)·WX, Y, sin(h)·WX). Verified for all 6 canister angles.
        const h = can.homeAngle;
        const cosH = Math.cos(h);
        const sinH = Math.sin(h);
        const desiredWorldX = STRAW_SHELF_X + (i - 4) * ROW_SPACING; // i=0..8, centered on i=4
        const targetX = cosH * desiredWorldX;
        const targetZ = sinH * desiredWorldX;
        const targetY = PARK_Y + 0.1; // sit at canister parked level

        anime.remove(s.group.position);
        anime({
          targets: s.group.position,
          keyframes: [
            // Rise up out of canister (preserve current x/z)
            {
              x: s.group.position.x,
              y: PARK_Y + CAN_HEIGHT / 2 + 0.6,
              z: s.group.position.z,
              duration: 600,
            },
            // Translate along the rotated row direction to its slot
            { x: targetX, y: targetY, z: targetZ, duration: 1100 },
          ],
          easing: "easeInOutCubic",
          delay: 500 + i * 60,
        });
      });

      // 3) Camera shifts to stage 2 framing — wider view to show all three areas
      anime({
        targets: cam.position,
        x: STAGE2_CAM.x,
        y: STAGE2_CAM.y,
        z: STAGE2_CAM.z,
        duration: 1400,
        easing: "easeInOutCubic",
        delay: 400,
      });
      anime({
        targets: target,
        x: STAGE2_TARGET.x,
        y: STAGE2_TARGET.y,
        z: STAGE2_TARGET.z,
        duration: 1400,
        easing: "easeInOutCubic",
        delay: 400,
      });

      // 4) Light moves to highlight straw shelf
      anime({
        targets: interior.position,
        x: STRAW_SHELF_X,
        y: PARK_Y + 1.0,
        z: 1.5,
        duration: 1400,
        easing: "easeInOutCubic",
        delay: 800,
      });
      anime({
        targets: interior,
        intensity: 1.5,
        duration: 1200,
        easing: "easeOutQuad",
        delay: 800,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCanister, viewStage, animeReady]);

  // ---------- Straw selection highlight (3D side) ----------
  useEffect(() => {
    const cans = canistersRef.current;
    if (!cans.length || selectedCanister === null) return;
    const can = cans[selectedCanister];
    if (!can) return;

    const anime = window.anime;

    can.strawSubgroups.forEach((s, i) => {
      const isSelected = selectedStraw === i;
      // Reset emissive to baseColor when selected, black when not
      const targetEmissiveIntensity = isSelected ? 0.55 : 0;
      const targetScale = isSelected ? 1.18 : 1.0;
      // Slight Y lift on selection (only meaningful when fanned out, harmless otherwise)
      if (animeReady && anime) {
        anime.remove(s.strawMat);
        anime({
          targets: s.strawMat,
          emissiveIntensity: targetEmissiveIntensity,
          duration: 350,
          easing: "easeOutQuad",
        });
        anime.remove(s.group.scale);
        anime({
          targets: s.group.scale,
          x: targetScale,
          y: targetScale,
          z: targetScale,
          duration: 350,
          easing: "easeOutBack",
        });
      } else {
        s.strawMat.emissiveIntensity = targetEmissiveIntensity;
        s.group.scale.set(targetScale, targetScale, targetScale);
      }

      // Set the emissive COLOR to match base color (so glow tints correctly)
      s.strawMat.emissive.setHex(s.baseColor);
    });
  }, [selectedStraw, selectedCanister, animeReady]);

  // ---------- Auto-clear straw selection when leaving inspecting stage ----------
  useEffect(() => {
    if (viewStage !== "inspecting") {
      setSelectedStraw(null);
    }
  }, [viewStage]);

  // ---------- Entrance animation for UI panels ----------
  useEffect(() => {
    if (!animeReady || !window.anime) return;
    window.anime({
      targets: ".cryo-fade-in",
      translateY: [16, 0],
      opacity: [0, 1],
      duration: 900,
      easing: "easeOutQuad",
      delay: window.anime.stagger(90, { start: 150 }),
    });
  }, [animeReady]);

  // ---------- Derived state for status ----------
  const status =
    fill >= 60
      ? { label: "Optimal", color: "#1f7a3a", dot: "#27a04a" }
      : fill >= 30
        ? { label: "Monitor", color: "#a8751a", dot: "#d49220" }
        : { label: "Refill Required", color: "#a82020", dot: "#d43030" };

  const daysLeft = Math.max(0, Math.round((fill / 100) * 42));
  const isEmbedded = variant === "embedded";
  const effectiveCanisters =
    canisters ?? (isEmbedded ? [] : DEFAULT_CANISTERS);
  const effectiveContents =
    canisterContents ?? (isEmbedded ? {} : DEFAULT_CONTENTS);
  const sceneCanisterCount = Math.min(
    CAN_COUNT,
    effectiveCanisters.length || (isEmbedded ? 0 : CAN_COUNT),
  );
  const visibleCanisters: CanisterInfo[] = Array.from(
    { length: sceneCanisterCount },
    (_, i) =>
      effectiveCanisters[i] ?? {
        id: `C${i + 1}`,
        label: `Canister #${i + 1}`,
        sampleCount: 0,
      },
  );
  const selectedCanisterData =
    selectedCanister !== null ? visibleCanisters[selectedCanister] : null;
  const selectedContents =
    selectedCanisterData != null
      ? effectiveContents[selectedCanisterData.id] ?? []
      : [];
  const samplesPerCanister = selectedContents.length;
  const showSensorTiles = sensorTiles.length > 0;
  const showSidebar = !hideSidebar;

  useEffect(() => {
    const cans = canistersRef.current;
    if (!cans.length) return;
    sceneCanisterCountRef.current = sceneCanisterCount;
    cans.forEach((can, idx) => {
      can.group.visible = idx < sceneCanisterCount;
    });
  }, [sceneCanisterCount]);

  useEffect(() => {
    if (selectedCanister == null) return;
    if (selectedCanister >= sceneCanisterCount) {
      setSelectedCanister(null);
      setViewStage("idle");
    }
  }, [selectedCanister, sceneCanisterCount]);

  // Expose imperative API for live material tweaking from a dev panel.
  useImperativeHandle(
    ref,
    () => ({
      /**
       * Update a property on a registered material.
       * @param {string} key - one of "platform" | "tankShell" | "innerVessel" | "ln2" | "wave"
       * @param {string} prop - material property name (e.g. "opacity", "color", "roughness")
       * @param {number|string} value - new value (hex string for colors, number for scalars)
       */
      setMaterial(key, prop, value) {
        const m = materialsRef.current[key];
        if (!m) return;
        if (prop === "color" || prop === "attenuationColor") {
          if (m[prop]) m[prop].set(value);
        } else {
          m[prop] = value;
        }
        m.needsUpdate = true;
      },
      /**
       * Get the current snapshot of all registered materials' tweakable props.
       * Useful for printing the final values once you've dialed them in.
       */
      getMaterialSnapshot() {
        const snap: Record<string, any> = {};
        for (const [key, m] of Object.entries(materialsRef.current)) {
          if (!m) continue;
          snap[key] = {
            color: m.color ? "#" + m.color.getHexString() : null,
            opacity: m.opacity,
            transmission: m.transmission ?? 0,
            roughness: m.roughness,
            metalness: m.metalness,
            thickness: m.thickness ?? 0,
            ior: m.ior ?? 1.5,
            clearcoat: m.clearcoat ?? 0,
            attenuationColor: m.attenuationColor
              ? "#" + m.attenuationColor.getHexString()
              : null,
            attenuationDistance: m.attenuationDistance ?? 0,
          };
        }
        return snap;
      },
    }),
    [],
  );

  return (
    <div
      className="relative w-full overflow-hidden box-border cryo-root"
      style={{
        minHeight: isEmbedded ? 520 : 720,
        padding: isEmbedded ? 0 : 24,
        color: "#1a0a1f",
        background:
          isEmbedded
            ? "linear-gradient(180deg, #ffffff 0%, #fbf6fc 100%)"
            : "radial-gradient(1200px 600px at 85% -10%, #f1e7f4 0%, #faf6fb 55%, #faf6fb 100%)",
      }}
    >
      <style>{customCss}</style>

      {/* Decorative background grid */}
      {!isEmbedded && (
        <>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              opacity: 0.55,
              backgroundImage:
                "linear-gradient(#e4d4ea 1px, transparent 1px), linear-gradient(90deg, #e4d4ea 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage:
                "radial-gradient(ellipse at 50% 40%, #000 30%, transparent 80%)",
              WebkitMaskImage:
                "radial-gradient(ellipse at 50% 40%, #000 30%, transparent 80%)",
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              top: -120,
              right: -80,
              width: 420,
              height: 420,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, #7a1a8822 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              bottom: -160,
              left: -100,
              width: 500,
              height: 500,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, #4011531e 0%, transparent 70%)",
            }}
          />
        </>
      )}

      <div
        className="relative mx-auto flex flex-col"
        style={{ maxWidth: isEmbedded ? undefined : 1240, gap: isEmbedded ? 0 : 20 }}
      >
        {/* Header */}
        {!isEmbedded && (
          <header
            className="cryo-fade-in flex items-center justify-between flex-wrap"
            style={{ gap: 16, opacity: 0 }}
          >
          <div className="flex items-center" style={{ gap: 14 }}>
            <div
              className="flex items-center justify-center bg-white"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: "1px solid #e4d4ea",
                boxShadow: "0 6px 18px #40115314",
              }}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#7a1a88"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2v20" />
                <path d="M8 4h8" />
                <path d="M6 8c0 4 2 4 2 8s-2 4-2 6h12c0-2-2-2-2-6s2-4 2-8" />
              </svg>
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#6b5a70",
                  fontWeight: 500,
                }}
              >
                Cryogenic Storage · IVF Lab
              </div>
              <h1
                className="cryo-display"
                style={{
                  margin: 0,
                  fontSize: 34,
                  lineHeight: 1,
                  fontWeight: 400,
                  color: "#1a0a1f",
                  letterSpacing: "-0.02em",
                }}
              >
                Cryo
                <em
                  className="cryo-display"
                  style={{
                    color: "#7a1a88",
                    fontStyle: "italic",
                    fontWeight: 500,
                  }}
                >
                  can
                </em>{" "}
                BA-20
              </h1>
            </div>
          </div>
          <div
            className="cryo-mono inline-flex items-center bg-white"
            style={{
              gap: 10,
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid #e4d4ea",
              fontSize: 13,
              boxShadow: "0 2px 10px #4011530d",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                background: status.dot,
                boxShadow: `0 0 0 4px ${status.dot}22`,
              }}
            />
            <span style={{ color: status.color, fontWeight: 500 }}>
              {status.label}
            </span>
          </div>
          </header>
        )}

        {/* Main grid — uses inline grid styles so it works regardless of Tailwind JIT support */}
        <div
          className="cryo-main-grid"
          style={{
            display: "grid",
            gridTemplateColumns: showSidebar ? "minmax(0, 1fr) 320px" : "minmax(0, 1fr)",
            gap: isEmbedded ? 16 : 18,
            alignItems: "stretch",
          }}
        >
          {/* 3D canvas column */}
          <div
            className="cryo-fade-in relative overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, #ffffff 0%, #fbf6fc 100%)",
              borderRadius: isEmbedded ? 16 : 20,
              border: "1px solid #e4d4ea",
              height: isEmbedded ? 520 : 620,
              boxShadow: isEmbedded
                ? "0 8px 20px -12px #4011531f, 0 2px 6px #4011530a"
                : "0 20px 50px -20px #40115325, 0 2px 6px #4011530a",
              opacity: isEmbedded ? 1 : 0,
            }}
          >
            <div
              className="absolute flex justify-between items-start"
              style={{
                top: 16,
                left: 16,
                right: 16,
                zIndex: 3,
                pointerEvents: "none",
              }}
            >
              <div
                className="cryo-mono inline-flex items-center"
                style={{
                  gap: 8,
                  padding: "6px 12px",
                  background: "rgba(255,255,255,0.85)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid #e4d4ea",
                  borderRadius: 999,
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  color: "#401153",
                  fontWeight: 600,
                }}
              >
                <span
                  className="cryo-pulse"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#7a1a88",
                    boxShadow: "0 0 0 3px #7a1a8830",
                  }}
                />
                LIVE · LN2 LEVEL
              </div>
              <div
                className="flex"
                style={{ gap: 8, pointerEvents: "auto" }}
              >
                {selectedCanister !== null ? (
                  <button
                    className="cryo-mono inline-flex items-center cryo-btn"
                    onClick={() => {
                      if (viewStage === "inspecting") {
                        setViewStage("extracted");
                      } else {
                        setSelectedCanister(null);
                        setViewStage("idle");
                      }
                    }}
                    title={
                      viewStage === "inspecting"
                        ? "Pack straws back"
                        : "Return canister to tank"
                    }
                    style={{
                      gap: 6,
                      height: 32,
                      padding: "0 14px",
                      borderRadius: 10,
                      border: "1px solid #7a1a88",
                      background:
                        "linear-gradient(135deg, #401153, #7a1a88)",
                      color: "#ffffff",
                      cursor: "pointer",
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      boxShadow: "0 4px 14px #7a1a8840",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m12 19-7-7 7-7" />
                      <path d="M19 12H5" />
                    </svg>
                    {viewStage === "inspecting"
                      ? "Pack Straws"
                      : "Return Canister"}
                  </button>
                ) : (
                  <button
                    className="cryo-btn inline-flex items-center justify-center"
                    onClick={() => setAutoRotate((v) => !v)}
                    title={autoRotate ? "Pause rotation" : "Resume rotation"}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      border: autoRotate
                        ? "1px solid #7a1a88"
                        : "1px solid #e4d4ea",
                      background: autoRotate ? "#7a1a88" : "#ffffff",
                      color: autoRotate ? "#ffffff" : "#401153",
                      cursor: "pointer",
                    }}
                  >
                    {autoRotate ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="6" y="5" width="4" height="14" />
                        <rect x="14" y="5" width="4" height="14" />
                      </svg>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polygon points="6 4 20 12 6 20 6 4" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div
              ref={mountRef}
              style={{
                width: "100%",
                height: "100%",
                touchAction: "none",
              }}
            />

            {/* In-canvas vitals stack on the LEFT side */}
            {!isEmbedded && (
              <div
                className="absolute flex flex-col"
                style={{
                  left: 16,
                  top: 64,
                  bottom: 56,
                  gap: 10,
                  zIndex: 3,
                  width: 180,
                  pointerEvents: "none",
                }}
              >
              <div
                ref={percentTextRef}
                style={{
                  background: "rgba(255,255,255,0.85)",
                  backdropFilter: "blur(14px)",
                  border: "1px solid #e4d4ea",
                  borderRadius: 14,
                  padding: "12px 14px",
                  boxShadow: "0 6px 20px #40115310",
                }}
              >
                <div
                  className="cryo-mono"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.22em",
                    color: "#6b5a70",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  LN2 LEVEL
                </div>
                <div
                  className="cryo-display"
                  style={{
                    fontSize: 28,
                    lineHeight: 1,
                    fontWeight: 500,
                    color: "#401153",
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {displayPct.toFixed(1)}
                  <span
                    style={{ fontSize: 14, color: "#7a1a88", marginLeft: 2 }}
                  >
                    %
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    background: "#f1e7f4",
                    borderRadius: 2,
                    overflow: "hidden",
                    marginTop: 8,
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 2,
                      background:
                        "linear-gradient(90deg, #401153, #7a1a88)",
                      transition: "width 0.4s ease",
                      width: `${Math.min(100, Math.max(0, displayPct))}%`,
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255,255,255,0.85)",
                  backdropFilter: "blur(14px)",
                  border: "1px solid #e4d4ea",
                  borderRadius: 14,
                  padding: "12px 14px",
                  boxShadow: "0 6px 20px #40115310",
                }}
              >
                <div
                  className="cryo-mono"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.22em",
                    color: "#6b5a70",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  INTERNAL TEMP
                </div>
                <div
                  className="cryo-display"
                  style={{
                    fontSize: 28,
                    lineHeight: 1,
                    fontWeight: 500,
                    color: "#401153",
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {internalTemp.toFixed(1)}
                  <span
                    style={{ fontSize: 14, color: "#7a1a88", marginLeft: 2 }}
                  >
                    °C
                  </span>
                </div>
                <div
                  className="cryo-mono flex items-center"
                  style={{
                    fontSize: 10,
                    color: "#6b5a70",
                    marginTop: 6,
                    gap: 6,
                    letterSpacing: "0.04em",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#27a04a",
                      boxShadow: "0 0 0 3px #27a04a22",
                    }}
                  />
                  vapor phase · stable
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255,255,255,0.85)",
                  backdropFilter: "blur(14px)",
                  border: "1px solid #e4d4ea",
                  borderRadius: 14,
                  padding: "12px 14px",
                  boxShadow: "0 6px 20px #40115310",
                }}
              >
                <div
                  className="cryo-mono"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.22em",
                    color: "#6b5a70",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  EXTERNAL TEMP
                </div>
                <div
                  className="cryo-display"
                  style={{
                    fontSize: 28,
                    lineHeight: 1,
                    fontWeight: 500,
                    color: "#401153",
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {externalTemp.toFixed(1)}
                  <span
                    style={{ fontSize: 14, color: "#7a1a88", marginLeft: 2 }}
                  >
                    °C
                  </span>
                </div>
                <div
                  className="cryo-mono flex items-center"
                  style={{
                    fontSize: 10,
                    color: "#6b5a70",
                    marginTop: 6,
                    gap: 6,
                    letterSpacing: "0.04em",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#27a04a",
                      boxShadow: "0 0 0 3px #27a04a22",
                    }}
                  />
                  ambient · normal
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255,255,255,0.85)",
                  backdropFilter: "blur(14px)",
                  border: "1px solid #e4d4ea",
                  borderRadius: 14,
                  padding: "12px 14px",
                  boxShadow: "0 6px 20px #40115310",
                }}
              >
                <div
                  className="cryo-mono"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.22em",
                    color: "#6b5a70",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  LID STATUS
                </div>
                <div
                  className="cryo-display"
                  style={{
                    fontSize: 22,
                    lineHeight: 1,
                    fontWeight: 500,
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                    color:
                      lidStatus === "closed" ? "#401153" : "#a8751a",
                  }}
                >
                  {lidStatus === "closed" ? "Closed" : "Open"}
                </div>
                <div
                  className="cryo-mono flex items-center"
                  style={{
                    fontSize: 10,
                    color: "#6b5a70",
                    marginTop: 6,
                    gap: 6,
                    letterSpacing: "0.04em",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background:
                        lidStatus === "closed" ? "#27a04a" : "#d49220",
                      boxShadow:
                        lidStatus === "closed"
                          ? "0 0 0 3px #27a04a22"
                          : "0 0 0 3px #d4922022",
                    }}
                  />
                  {lidStatus === "closed" ? "sealed · secure" : "unsealed"}
                </div>
              </div>
              </div>
            )}

            {isEmbedded && showSensorTiles && (
              <div
                className="absolute"
                style={{
                  left: 16,
                  top: 16,
                  bottom: 16,
                  width: 230,
                  zIndex: 4,
                  pointerEvents: "auto",
                }}
              >
                <div
                  className="flex flex-col"
                  style={{
                    gap: 10,
                    height: "100%",
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid #e4d4ea",
                    background: "rgba(255,255,255,0.9)",
                    backdropFilter: "blur(10px)",
                    boxShadow: "0 6px 20px #40115312",
                  }}
                >
                  <div
                    className="cryo-mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      color: "#6b5a70",
                      fontWeight: 600,
                    }}
                  >
                    Sensors
                  </div>
                  <div
                    className="flex flex-col"
                    style={{ gap: 8, overflowY: "auto", paddingRight: 4 }}
                  >
                    {sensorTiles.map((tile) => {
                      const isActive = selectedSensorId === tile.id;
                      return (
                        <button
                          key={tile.id}
                          type="button"
                          onClick={() => onSensorSelect && onSensorSelect(tile.id)}
                          className="text-left"
                          style={{
                            cursor: "pointer",
                            borderRadius: 12,
                            padding: "10px 12px",
                            border: isActive ? "1px solid #7a1a8850" : "1px solid #e4d4ea",
                            background: isActive
                              ? "linear-gradient(135deg, #7a1a8810 0%, #7a1a8805 100%)"
                              : "#ffffff",
                            boxShadow: isActive ? "0 4px 14px #7a1a8820" : "none",
                            opacity: tile.isMuted ? 0.6 : 1,
                          }}
                          title={tile.tooltip}
                        >
                          <div
                            className="cryo-mono"
                            style={{
                              fontSize: 10,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                              color: "#6b5a70",
                              marginBottom: 4,
                            }}
                          >
                            {tile.label}
                          </div>
                          <div
                            className="cryo-display"
                            style={{
                              fontSize: 18,
                              fontWeight: 500,
                              color: tile.isMissing ? "#9ca3af" : "#401153",
                            }}
                          >
                            {tile.value}
                          </div>
                          {tile.timestamp && (
                            <div
                              className="cryo-mono"
                              style={{
                                fontSize: 9,
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                color: "#6b5a70",
                                marginTop: 6,
                              }}
                            >
                              {tile.timestamp}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {!isEmbedded && (
              <div
                className="cryo-mono absolute"
                style={{
                  right: 16,
                  bottom: 16,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  color: "#6b5a70",
                  textTransform: "uppercase",
                  zIndex: 3,
                }}
              >
                {viewStage === "inspecting"
                  ? `inspecting canister #${selectedCanister! + 1} · ${samplesPerCanister} samples`
                  : viewStage === "extracted"
                    ? `canister #${selectedCanister! + 1} extracted · click again to inspect`
                    : "click a canister · drag to rotate"}
              </div>
            )}
          </div>

          {/* Info + controls column */}
          {showSidebar && (
            <aside
              className="cryo-side-scroll flex flex-col overflow-x-hidden"
              style={{
                gap: 14,
                height: isEmbedded ? 520 : 620,
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
            <div
              className="cryo-fade-in bg-white"
              style={{
                flexShrink: 0,
                border: "1px solid #e4d4ea",
                borderRadius: 18,
                padding: "18px 20px",
                boxShadow: "0 6px 16px #40115308",
                opacity: isEmbedded ? 1 : 0,
              }}
            >
              <div
                className="cryo-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#6b5a70",
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Autonomy
              </div>
              <div
                className="cryo-display"
                style={{
                  fontSize: 38,
                  fontWeight: 500,
                  color: "#1a0a1f",
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {daysLeft}
                <span
                  style={{ fontSize: 18, marginLeft: 4, color: "#7a1a88" }}
                >
                  d
                </span>
              </div>
              <div
                style={{ marginTop: 8, fontSize: 12, color: "#6b5a70" }}
              >
                est. before next top-up at current evap. rate
              </div>
            </div>

            {/* Canister list */}
            <div
              className="cryo-fade-in bg-white"
              style={{
                flexShrink: 0,
                border: "1px solid #e4d4ea",
                borderRadius: 18,
                padding: "16px 16px 12px",
                boxShadow: "0 6px 16px #40115308",
                opacity: isEmbedded ? 1 : 0,
              }}
            >
              <div
                className="flex justify-between items-start"
                style={{ gap: 10, marginBottom: 12 }}
              >
                <div>
                  <div
                    className="cryo-mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      color: "#6b5a70",
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    Canisters
                  </div>
                  <div
                    className="cryo-display"
                    style={{
                      fontSize: 16,
                      fontWeight: 500,
                      color: "#1a0a1f",
                      letterSpacing: "-0.015em",
                      marginTop: 2,
                    }}
                  >
                    {viewStage === "inspecting"
                      ? "Selected"
                      : selectedCanister !== null
                        ? "Extracted"
                        : `${sceneCanisterCount} loaded`}
                  </div>
                </div>
                {viewStage !== "inspecting" && (
                  <span
                    className="cryo-mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      padding: "3px 9px",
                      borderRadius: 999,
                      background: "#f1e7f4",
                      color: "#401153",
                      fontWeight: 600,
                    }}
                  >
                    samples per canister
                  </span>
                )}
              </div>

              <div
                className="flex flex-col"
                style={{ gap: 6, transition: "all 0.4s ease" }}
              >
                {visibleCanisters.map((c, i) => {
                  const isSelected = selectedCanister === i;
                  if (viewStage === "inspecting" && !isSelected) return null;
                  const canSampleCount =
                    c.sampleCount ?? effectiveContents[c.id]?.length ?? 0;
                  const cursor =
                    viewStage === "idle" ||
                    (viewStage === "extracted" && isSelected)
                      ? "pointer"
                      : "default";
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        if (viewStage === "idle") {
                          setSelectedCanister(i);
                          setViewStage("extracted");
                          onCanisterSelect && onCanisterSelect(c.id);
                        } else if (
                          viewStage === "extracted" &&
                          selectedCanister === i
                        ) {
                          setViewStage("inspecting");
                        }
                      }}
                      className="flex items-center"
                      style={{
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: isSelected
                          ? "linear-gradient(135deg, #7a1a8810 0%, #7a1a8805 100%)"
                          : "#ffffff",
                        border: isSelected
                          ? "1px solid #7a1a8850"
                          : "1px solid #e4d4ea",
                        boxShadow: isSelected
                          ? "0 4px 14px #7a1a8820"
                          : "none",
                        transition: "all 0.2s ease",
                        cursor,
                      }}
                    >
                      <div
                        className="flex items-center justify-center"
                        style={{ flexShrink: 0, width: 24 }}
                      >
                        <svg
                          width="14"
                          height="20"
                          viewBox="0 0 14 20"
                          fill="none"
                          stroke={isSelected ? "#7a1a88" : "#6b5a70"}
                          strokeWidth="1.6"
                        >
                          <rect
                            x="2"
                            y="4"
                            width="10"
                            height="14"
                            rx="1"
                          />
                          <path d="M7 4V1" />
                          <circle
                            cx="7"
                            cy="1"
                            r="0.8"
                            fill={isSelected ? "#7a1a88" : "#6b5a70"}
                          />
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="cryo-mono"
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "#1a0a1f",
                            letterSpacing: "0.02em",
                          }}
                        >
                          {c.label}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#6b5a70",
                            marginTop: 2,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}
                        >
                          {canSampleCount} samples ·{" "}
                          {isSelected
                            ? viewStage === "inspecting"
                              ? "inspecting"
                              : "extracted"
                            : c.status ?? "stored"}
                        </div>
                      </div>
                      {isSelected && (
                        <span
                          style={{
                            flexShrink: 0,
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background:
                              viewStage === "inspecting"
                                ? "#a8751a"
                                : "#7a1a88",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Straw list — appears when inspecting */}
            {viewStage === "inspecting" && (
              <div
                className="cryo-panel-in flex flex-col bg-white overflow-hidden"
                style={{
                  flexShrink: 0,
                  border: "1px solid #e4d4ea",
                  borderRadius: 18,
                  boxShadow: "0 6px 16px #40115308",
                }}
              >
                <div
                  style={{
                    padding: "16px 18px 12px",
                    borderBottom: "1px solid #e4d4ea",
                    background:
                      "linear-gradient(180deg, #fbf6fc 0%, #ffffff 100%)",
                    flexShrink: 0,
                  }}
                >
                  <div>
                    <div
                      className="cryo-mono"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        color: "#6b5a70",
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Contents
                    </div>
                    <div
                      className="cryo-display"
                      style={{
                        fontSize: 16,
                        fontWeight: 500,
                        color: "#1a0a1f",
                        letterSpacing: "-0.015em",
                      }}
                    >
                      {samplesPerCanister} samples
                    </div>
                  </div>
                </div>
                <div
                  className="flex flex-col"
                  style={{ padding: "10px 12px", gap: 8 }}
                >
                  {selectedContents.map((s, i) => {
                    const colorInt =
                      typeof s.color === "number"
                        ? s.color
                        : STRAW_COLORS[i % STRAW_COLORS.length];
                    const colorHex =
                      "#" + colorInt.toString(16).padStart(6, "0");
                    const isSelected = selectedStraw === i;
                    const hasTrackingDetails =
                      !!(
                        s.cryolockNumber ||
                        s.hisNumber ||
                        s.caneCode ||
                        s.gobletColor ||
                        s.cryolockColor ||
                        s.vitrificationDate ||
                        s.description
                      );
                    const primaryId =
                      s.cryolockNumber ||
                      s.id ||
                      "Cryolock";
                    const typeLabel =
                      s.type || (hasTrackingDetails ? "Cryolock" : "Sample");
                    const metaItems: string[] = [];
                    if (s.hisNumber) metaItems.push(`HIS ${s.hisNumber}`);
                    if (s.caneCode) metaItems.push(`Cane ${s.caneCode}`);
                    if (s.gobletColor) metaItems.push(`Goblet ${s.gobletColor}`);
                    if (s.cryolockColor) metaItems.push(`Cryolock ${s.cryolockColor}`);
                    if (s.vitrificationDate) {
                      metaItems.push(`Vitrified ${s.vitrificationDate}`);
                    }
                    return (
                      <div
                        key={s.id ?? i}
                        onClick={() => {
                          setSelectedStraw((prev) =>
                            prev === i ? null : i,
                          );
                          if (
                            onStrawSelect &&
                            selectedCanisterData &&
                            s.id
                          ) {
                            onStrawSelect(selectedCanisterData.id, s.id);
                          }
                        }}
                        className="flex"
                        style={{
                          gap: 10,
                          padding: "10px 12px",
                          background: isSelected
                            ? "linear-gradient(135deg, #7a1a8810 0%, #7a1a8805 100%)"
                            : "#ffffff",
                          border: isSelected
                            ? "1px solid #7a1a8850"
                            : "1px solid #e4d4ea",
                          borderLeft: `3px solid ${
                            isSelected ? colorHex : "transparent"
                          }`,
                          borderRadius: 12,
                          boxShadow: isSelected
                            ? "0 4px 14px #7a1a8825, 0 1px 3px #7a1a8815"
                            : "none",
                          transform: isSelected
                            ? "translateX(-2px)"
                            : "none",
                          transition: "all 0.2s ease",
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                        ref={(el) => {
                          if (el && isSelected) {
                            el.scrollIntoView({
                              behavior: "smooth",
                              block: "nearest",
                            });
                          }
                        }}
                      >
                        <span
                          style={{
                            width: 4,
                            flexShrink: 0,
                            borderRadius: 2,
                            alignSelf: "stretch",
                            background: colorHex,
                            ...(isSelected
                              ? { boxShadow: `0 0 0 3px ${colorHex}40` }
                              : null),
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            className="flex items-center justify-between"
                            style={{ gap: 8, marginBottom: 4 }}
                          >
                            <span
                              className="cryo-mono"
                              style={{
                                fontSize: 11,
                                color: "#401153",
                                fontWeight: 600,
                                letterSpacing: "0.04em",
                              }}
                            >
                              {primaryId}
                            </span>
                            <span
                              className="cryo-mono"
                              style={{
                                fontSize: 9,
                                letterSpacing: "0.14em",
                                textTransform: "uppercase",
                                fontWeight: 600,
                                padding: "2px 7px",
                                borderRadius: 999,
                                background:
                                  typeLabel === "Embryo"
                                    ? "#7a1a8819"
                                    : typeLabel === "Sperm"
                                      ? "#1f7a3a19"
                                      : "#a8751a19",
                                color:
                                  typeLabel === "Embryo"
                                    ? "#7a1a88"
                                    : typeLabel === "Sperm"
                                      ? "#1f7a3a"
                                      : "#a8751a",
                              }}
                            >
                              {typeLabel}
                            </span>
                          </div>
                          {hasTrackingDetails ? (
                            <>
                              {metaItems.length > 0 && (
                                <div
                                  className="flex flex-wrap"
                                  style={{
                                    fontSize: 11,
                                    color: "#6b5a70",
                                    gap: 6,
                                  }}
                                >
                                  {metaItems.map((item, idx) => (
                                    <span key={`${item}-${idx}`}>
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {s.description && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "#6b5a70",
                                    marginTop: 6,
                                  }}
                                >
                                  {s.description}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "#1a0a1f",
                                  fontWeight: 500,
                                  marginBottom: 2,
                                }}
                              >
                                {s.stage}
                              </div>
                              <div
                                className="flex items-center"
                                style={{
                                  fontSize: 11,
                                  color: "#6b5a70",
                                  gap: 6,
                                }}
                              >
                                <span>Grade {s.grade}</span>
                                <span style={{ color: "#7a1a88" }}>•</span>
                                <span>{s.patient}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </aside>
          )}
        </div>

        {!isEmbedded && (
          <footer
            className="cryo-mono cryo-fade-in flex items-center justify-center"
            style={{
              gap: 10,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#6b5a70",
              marginTop: 4,
              opacity: 0,
            }}
          >
            <span>ISO 21973 · IVF cryostorage</span>
            <span style={{ color: "#7a1a88" }}>•</span>
            <span>Three.js r128</span>
            <span style={{ color: "#7a1a88" }}>•</span>
            <span>anime.js</span>
          </footer>
        )}
      </div>
    </div>
  );
});

// Wrapper as default export: artifact preview environments expect a plain
// function component as the default export. This wraps the forwardRef'd
// CryocanVisualizer so the artifact host can mount it without needing to
// pass a ref itself.
export default function CryocanVisualizerArtifact(
  props: CryocanVisualizerProps,
) {
  return <CryocanVisualizer {...props} />;
}

// ============================================================
// Custom CSS — keyframes, scrollbar, and range thumb
// (these can't be expressed as Tailwind utilities)
// ============================================================
const customCss = `
.cryo-root {
  font-family: inherit;
}
.cryo-display {
  font-family: 'Fraunces', Georgia, 'Times New Roman', serif;
  font-feature-settings: 'liga', 'kern';
}
.cryo-mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

@keyframes cryoPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.35); opacity: 0.6; }
}
.cryo-pulse { animation: cryoPulse 1.8s ease-in-out infinite; }

@keyframes cryoPanelIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cryo-panel-in { animation: cryoPanelIn 600ms cubic-bezier(0.2, 0.8, 0.2, 1); }

.cryo-side-scroll::-webkit-scrollbar { width: 6px; }
.cryo-side-scroll::-webkit-scrollbar-track { background: transparent; }
.cryo-side-scroll::-webkit-scrollbar-thumb { background: #e4d4ea; border-radius: 3px; }
.cryo-side-scroll::-webkit-scrollbar-thumb:hover { background: #7a1a8866; }
.cryo-side-scroll { scrollbar-width: thin; scrollbar-color: #e4d4ea transparent; }

.cryo-btn { transition: transform 0.15s ease, box-shadow 0.2s ease; }
.cryo-btn:hover { transform: translateY(-1px); }

/* Only collapse to single column on very narrow viewports (mobile) */
@media (max-width: 640px) {
  .cryo-main-grid { grid-template-columns: 1fr !important; }
}
`;