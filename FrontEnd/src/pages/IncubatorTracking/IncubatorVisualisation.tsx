import { useRef, useState, useEffect, type ReactElement } from "react";
import type { ActivityLogRecord } from "../../services/activityLogService";
import * as THREE from "three";
import type {
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  MeshPhysicalMaterial,
  PointLight,
} from "three";

declare global {
  interface Window {
    anime?: any;
  }
}

// ─── 3D geometry constants ─────────────────────────────────────────────────────
const INC_BODY_W = 4.3;
const INC_BODY_H = 1.9;
const INC_BODY_D = 3.0;
const INC_PLINTH_H = 0.22;
const INC_LID_W = 1.85;
const INC_LID_H = 0.20;
const INC_LID_D = 2.15;
const INC_LID_GAP = 0.18;
const INC_LID_OPEN_ANGLE = -Math.PI * 0.55;
const INC_SCREEN_W = 1.55;
const INC_SCREEN_H = 0.95;

export type IncubatorSensorTile = {
  id: string;
  label: string;
  value: string;
  timestamp: string | null;
  isMissing?: boolean;
  isMuted?: boolean;
  tooltip?: string;
};

type ChamberInfo = {
  id: string;
  label: string;
};

type IncubatorVisualisationProps = {
  sensorTiles?: IncubatorSensorTile[];
  selectedSensorId?: string | null;
  systemActivity?: ActivityLogRecord[];
  chambers?: ChamberInfo[];
  selectedChamberId?: string | null;
  onSensorSelect?: (sensorId: string) => void;
  onChamberSelect?: (chamberId: string) => void;
  incubatorCode?: string;
  branchName?: string;
  tempAlert?: boolean;
};

// ─── Activity log helpers ──────────────────────────────────────────────────────

type ActivityIconType =
  | "alert" | "config" | "task" | "email" | "user" | "report" | "ivf" | "default";

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  "alert.acknowledged": "Alert Acknowledged",
  "alert.acknowledged_all": "All Alerts Acknowledged",
  "alert.created": "Critical Alert Created",
  "alert_configuration.kpi_config_bulk_upserted": "Alert Configuration Bulk Updated",
  "alert_configuration.kpi_config_created": "Alert Configuration Created",
  "alert_configuration.kpi_config_deleted": "Alert Configuration Deleted",
  "alert_configuration.kpi_config_updated": "Alert Configuration Updated",
  "alert_configuration.notification_settings_updated": "Alert Notification Settings Updated",
  "email.critical_alert_sent": "Critical Alert Email Sent",
  "email.escalation_sent": "Escalation Email Sent",
  "email.otp_sent": "OTP Email Sent",
  "email.password_reset_sent": "Password Reset Email Sent",
  "task.created": "Task Created",
  "task.deleted": "Task Deleted",
  "task.status_updated": "Task Status Updated",
  "task.updated": "Task Updated",
  "user.approved": "User Approved",
  "user.login": "Login Successful",
  "user.logout": "Logged Out",
  "user.profile_updated": "Profile Updated",
  "user.registered": "User Registered",
  "ivf_cycle.created": "IVF Cycle Created",
  "ivf_cycle.updated": "IVF Cycle Updated",
};

function formatActivityActionLabel(action: string) {
  if (ACTIVITY_ACTION_LABELS[action]) return ACTIVITY_ACTION_LABELS[action];
  return action
    .replace(/_/g, " ")
    .replace(/\./g, " · ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getActivityIconType(action: string): ActivityIconType {
  if (action.startsWith("alert.") || action.startsWith("email.critical_alert")) return "alert";
  if (action.startsWith("alert_configuration.")) return "config";
  if (action.startsWith("task.")) return "task";
  if (action.startsWith("email.")) return "email";
  if (action.startsWith("user.")) return "user";
  if (action.startsWith("report.")) return "report";
  if (action.startsWith("ivf_cycle.")) return "ivf";
  return "default";
}

const ACTIVITY_BADGE_STYLE: Record<ActivityIconType, { bg: string; color: string; label: string }> = {
  alert:   { bg: "#fee2e2", color: "#dc2626", label: "Alert"   },
  config:  { bg: "#f3f4f6", color: "#374151", label: "Config"  },
  task:    { bg: "#dcfce7", color: "#16a34a", label: "Task"    },
  email:   { bg: "#e0f2fe", color: "#0369a1", label: "Email"   },
  user:    { bg: "#ede9fe", color: "#6d28d9", label: "User"    },
  report:  { bg: "#fef9c3", color: "#a16207", label: "Export"  },
  ivf:     { bg: "#fce7f3", color: "#be185d", label: "IVF"     },
  default: { bg: "#ccfbf1", color: "#0f766e", label: "System"  },
};

const ACTIVITY_ICON_INNER: Record<ActivityIconType, React.ReactNode> = {
  alert: (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  config: (
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  ),
  task: (
    <>
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </>
  ),
  email: (
    <>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </>
  ),
  user: (
    <>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  report: (
    <>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </>
  ),
  ivf: (
    <>
      <path d="M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5V2" />
      <path d="M8.5 2h7" />
      <path d="M14.5 16h-5" />
    </>
  ),
  default: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
};

// ─── Sensor icons & KPI styles ─────────────────────────────────────────────────

const SENSOR_ICONS: Record<string, ReactElement> = {
  incubator_temp: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z" />
    </svg>
  ),
  incubator_co2: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2" />
    </svg>
  ),
  incubator_o2: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  incubator_ph: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
    </svg>
  ),
  incubator_humidity: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="19" x2="8" y2="21" /><line x1="8" y1="13" x2="8" y2="15" />
      <line x1="16" y1="19" x2="16" y2="21" /><line x1="16" y1="13" x2="16" y2="15" />
      <line x1="12" y1="21" x2="12" y2="23" /><line x1="12" y1="15" x2="12" y2="17" />
      <path d="M20 16.58A5 5 0 0018 7h-1.26A8 8 0 104 15.25" />
    </svg>
  ),
  incubator_voc: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  incubator_lid_state: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  ),
};

const KPI_CARD_STYLES: Record<string, { accent: string; ring: string }> = {
  incubator_temp:      { accent: "#c02640", ring: "rgba(192,38,64,0.12)"   },
  incubator_co2:       { accent: "#0f766e", ring: "rgba(15,118,110,0.12)"  },
  incubator_o2:        { accent: "#0369a1", ring: "rgba(3,105,161,0.12)"   },
  incubator_ph:        { accent: "#6B1176", ring: "rgba(107,17,118,0.12)"  },
  incubator_humidity:  { accent: "#2563eb", ring: "rgba(37,99,235,0.12)"   },
  incubator_voc:       { accent: "#b45309", ring: "rgba(180,83,9,0.12)"    },
  incubator_lid_state: { accent: "#7c3aed", ring: "rgba(124,58,237,0.12)"  },
};

// ─── CSS ───────────────────────────────────────────────────────────────────────

const incubatorCss = `
.incubator-root {
  font-family: inherit;
}
.incubator-display {
  font-family: inherit;
  font-weight: 300;
}
.incubator-mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

@keyframes incubatorScrollActivity {
  0%   { transform: translateY(0); }
  100% { transform: translateY(-50%); }
}

@keyframes incubatorPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%       { transform: scale(1.35); opacity: 0.6; }
}
.incubator-pulse { animation: incubatorPulse 1.8s ease-in-out infinite; }

@keyframes incubatorKpiFloat {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-6px); }
}

@keyframes incubatorKpiSheen {
  0%   { transform: translateX(0) rotate(12deg); opacity: 0.3; }
  50%  { transform: translateX(8px) rotate(12deg); opacity: 0.6; }
  100% { transform: translateX(0) rotate(12deg); opacity: 0.3; }
}

.incubator-kpi-card .incubator-kpi-glow  { animation: incubatorKpiFloat 4.8s ease-in-out infinite; }
.incubator-kpi-card .incubator-kpi-orb   { animation: incubatorKpiFloat 5.6s ease-in-out infinite reverse; }
.incubator-kpi-card .incubator-kpi-sheen { animation: incubatorKpiSheen 6.2s ease-in-out infinite; }
.incubator-kpi-card .incubator-kpi-curve { animation: incubatorKpiFloat 7.4s ease-in-out infinite; }
.incubator-kpi-card .incubator-kpi-wave  { animation: incubatorKpiFloat 8.2s ease-in-out infinite reverse; }

.incubator-side-scroll::-webkit-scrollbar { width: 6px; }
.incubator-side-scroll::-webkit-scrollbar-track { background: transparent; }
.incubator-side-scroll::-webkit-scrollbar-thumb { background: #e4d4ea; border-radius: 3px; }
.incubator-side-scroll::-webkit-scrollbar-thumb:hover { background: #7a1a8866; }
.incubator-side-scroll { scrollbar-width: thin; scrollbar-color: #e4d4ea transparent; }

@media (max-width: 640px) {
  .incubator-main-grid { grid-template-columns: 1fr !important; }
}
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function IncubatorVisualisation({
  sensorTiles = [],
  selectedSensorId = null,
  systemActivity = [],
  chambers = [],
  selectedChamberId = null,
  onSensorSelect,
  onChamberSelect,
  incubatorCode,
  branchName,
  tempAlert = false,
}: IncubatorVisualisationProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneGroupRef = useRef<Group | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const leftLidPivotRef = useRef<Group | null>(null);
  const rightLidPivotRef = useRef<Group | null>(null);
  const leftLidMatRef = useRef<MeshPhysicalMaterial | null>(null);
  const rightLidMatRef = useRef<MeshPhysicalMaterial | null>(null);
  const leftHaloRef = useRef<Mesh | null>(null);
  const rightHaloRef = useRef<Mesh | null>(null);
  const screenTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenDrawRef = useRef<((sensors: IncubatorSensorTile[], alert: boolean) => void) | null>(null);
  const statusLightRef = useRef<PointLight | null>(null);
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({ dragging: false, lastX: 0, lastY: 0 });

  const [animeReady, setAnimeReady] = useState<boolean>(false);
  const [activityScrollPaused, setActivityScrollPaused] = useState(false);

  // Map first/second chamber to left/right lids for click handling
  const leftChamberId = chambers[0]?.id ?? null;
  const rightChamberId = chambers[1]?.id ?? null;
  const leftChamberIdRef = useRef<string | null>(leftChamberId);
  const rightChamberIdRef = useRef<string | null>(rightChamberId);
  const onChamberSelectRef = useRef<typeof onChamberSelect>(onChamberSelect);
  useEffect(() => { leftChamberIdRef.current = leftChamberId; }, [leftChamberId]);
  useEffect(() => { rightChamberIdRef.current = rightChamberId; }, [rightChamberId]);
  useEffect(() => { onChamberSelectRef.current = onChamberSelect; }, [onChamberSelect]);

  // ─── Load anime.js from CDN ─────────────────────────────────────────────────
  useEffect(() => {
    if (window.anime) {
      setAnimeReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js";
    script.async = true;
    script.onload = () => setAnimeReady(true);
    script.onerror = () => setAnimeReady(false);
    document.head.appendChild(script);
  }, []);

  // ─── Build 3D scene once ────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const getDims = () => ({
      w: mount.clientWidth || 800,
      h: mount.clientHeight || 600,
    });
    const { w, h } = getDims();

    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.Fog(0xe8d4f4, 22, 60);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
    camera.position.set(0, 2.4, 11.5);
    camera.lookAt(0, 0.1, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "grab";

    // Procedural envmap for metallic reflections
    const envCanvas = document.createElement("canvas");
    envCanvas.width = 256; envCanvas.height = 128;
    const envCtx = envCanvas.getContext("2d")!;
    const envGrad = envCtx.createLinearGradient(0, 0, 0, 128);
    envGrad.addColorStop(0, "#ffffff");
    envGrad.addColorStop(0.45, "#f1eaf6");
    envGrad.addColorStop(0.6, "#d4cbdc");
    envGrad.addColorStop(0.85, "#9b94a3");
    envGrad.addColorStop(1, "#5b545f");
    envCtx.fillStyle = envGrad;
    envCtx.fillRect(0, 0, 256, 128);
    const envTexture = new THREE.CanvasTexture(envCanvas);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(envTexture).texture;
    envTexture.dispose();
    pmrem.dispose();

    // ─── Lighting rig ─────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(4, 8, 6);
    scene.add(key);

    const fillLight = new THREE.DirectionalLight(0xe9d9ef, 0.55);
    fillLight.position.set(-5, 2, 3);
    scene.add(fillLight);

    const rim1 = new THREE.PointLight(0x7a1a88, 1.6, 14);
    rim1.position.set(-3.5, 2.5, -3);
    scene.add(rim1);

    const rim2 = new THREE.PointLight(0xc070d0, 0.7, 12);
    rim2.position.set(3.5, -1.0, 2);
    scene.add(rim2);

    // Subtle accent under screen (status light)
    const statusLight = new THREE.PointLight(0x22dd88, 0.6, 2.6);
    statusLight.position.set(0, INC_BODY_H * 0.05, INC_BODY_D / 2 + 0.3);
    scene.add(statusLight);
    statusLightRef.current = statusLight;

    // ─── Root group (holds the entire incubator) ──────────────────────────────
    const group = new THREE.Group();
    group.position.y = -0.15;
    group.scale.setScalar(0.78); // shrink whole rig so it stays in-frame while rotating
    scene.add(group);
    sceneGroupRef.current = group;

    // ─── Dark base platform ───────────────────────────────────────────────────
    const PLATFORM_W = INC_BODY_W * 1.35;
    const PLATFORM_D = INC_BODY_D * 1.35;
    const PLATFORM_H = 0.12;
    const platformMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a242e, metalness: 0.6, roughness: 0.55,
      clearcoat: 0.4, clearcoatRoughness: 0.3,
    });
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM_W, PLATFORM_H, PLATFORM_D),
      platformMat,
    );
    platform.position.y = -INC_BODY_H / 2 - INC_PLINTH_H - PLATFORM_H / 2;
    group.add(platform);

    // ─── Dark plinth (lower black base of incubator) ──────────────────────────
    const plinthMat = new THREE.MeshPhysicalMaterial({
      color: 0x1a1a20, metalness: 0.35, roughness: 0.45,
      clearcoat: 0.6, clearcoatRoughness: 0.2,
    });
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(INC_BODY_W * 1.02, INC_PLINTH_H, INC_BODY_D * 1.02),
      plinthMat,
    );
    plinth.position.y = -INC_BODY_H / 2 - INC_PLINTH_H / 2;
    group.add(plinth);

    // ─── White main body (rounded box look via small chamfer rings) ───────────
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xf6f4f7, metalness: 0.18, roughness: 0.45,
      clearcoat: 0.45, clearcoatRoughness: 0.2,
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(INC_BODY_W, INC_BODY_H, INC_BODY_D),
      bodyMat,
    );
    group.add(body);

    // Subtle dark trim around the seam where lids sit
    const trimMat = new THREE.MeshPhysicalMaterial({
      color: 0x33272e, metalness: 0.5, roughness: 0.4,
    });
    const topTrim = new THREE.Mesh(
      new THREE.BoxGeometry(INC_BODY_W * 1.005, 0.04, INC_BODY_D * 1.005),
      trimMat,
    );
    // Raise so the trim's top face sits above the body's top face (avoids z-fighting)
    topTrim.position.y = INC_BODY_H / 2 - 0.016;
    group.add(topTrim);

    // Center seam between the two chamber lids
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.05, INC_LID_D),
      trimMat,
    );
    seam.position.y = INC_BODY_H / 2 + 0.005;
    seam.position.z = -(INC_BODY_D - INC_LID_D) / 2 + 0.1;
    group.add(seam);

    // ─── Two top lids (left + right chambers) ─────────────────────────────────
    const makeLid = (xOffset: number) => {
      const pivot = new THREE.Group();
      // Hinge at back edge of lid: pivot sits at back, lid offset forward
      pivot.position.set(
        xOffset,
        INC_BODY_H / 2 + 0.005,
        -INC_BODY_D / 2 + (INC_BODY_D - INC_LID_D) / 2,
      );

      const lidMat = new THREE.MeshPhysicalMaterial({
        color: 0x0e0e12, metalness: 0.65, roughness: 0.25,
        clearcoat: 0.95, clearcoatRoughness: 0.08,
      });
      const lid = new THREE.Mesh(
        new THREE.BoxGeometry(INC_LID_W, INC_LID_H, INC_LID_D),
        lidMat,
      );
      // Offset forward (positive z relative to pivot) so the back edge is the hinge
      lid.position.set(0, INC_LID_H / 2, INC_LID_D / 2);
      pivot.add(lid);

      // Subtle inset panel on top of the lid
      const insetMat = new THREE.MeshPhysicalMaterial({
        color: 0x1c1c22, metalness: 0.4, roughness: 0.55,
      });
      const inset = new THREE.Mesh(
        new THREE.BoxGeometry(INC_LID_W * 0.85, 0.005, INC_LID_D * 0.85),
        insetMat,
      );
      inset.position.set(0, INC_LID_H + 0.001, INC_LID_D / 2);
      pivot.add(inset);

      // Front-edge handle/lip (silver)
      const handleMat = new THREE.MeshPhysicalMaterial({
        color: 0xb8b8c2, metalness: 0.9, roughness: 0.28,
      });
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(INC_LID_W * 0.4, 0.04, 0.06),
        handleMat,
      );
      handle.position.set(0, INC_LID_H + 0.025, INC_LID_D - 0.04);
      pivot.add(handle);

      // Hinge cylinders at back
      const hingeMat = new THREE.MeshPhysicalMaterial({
        color: 0x6b6b75, metalness: 1.0, roughness: 0.32,
      });
      for (const sign of [-1, 1]) {
        const hinge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.18, 16),
          hingeMat,
        );
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(sign * INC_LID_W * 0.42, INC_LID_H * 0.5, 0.04);
        pivot.add(hinge);
      }

      group.add(pivot);
      return { pivot, lidMat };
    };

    const leftHalfX = -(INC_LID_W / 2 + INC_LID_GAP / 2);
    const rightHalfX = INC_LID_W / 2 + INC_LID_GAP / 2;
    const left = makeLid(leftHalfX);
    const right = makeLid(rightHalfX);
    leftLidPivotRef.current = left.pivot;
    rightLidPivotRef.current = right.pivot;
    leftLidMatRef.current = left.lidMat;
    rightLidMatRef.current = right.lidMat;
    (left.pivot.children[0] as Mesh).userData.chamberSide = "left";
    (right.pivot.children[0] as Mesh).userData.chamberSide = "right";

    // ─── Selection halo rings (above lids, shown when chamber selected) ───────
    const makeHalo = (xOffset: number) => {
      const ringGeo = new THREE.RingGeometry(INC_LID_W * 0.36, INC_LID_W * 0.44, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x9b4aaa, transparent: true, opacity: 0, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(
        xOffset,
        INC_BODY_H / 2 + 0.02,
        -INC_BODY_D / 2 + (INC_BODY_D - INC_LID_D) / 2 + INC_LID_D / 2,
      );
      group.add(ring);
      return ring;
    };
    leftHaloRef.current = makeHalo(leftHalfX);
    rightHaloRef.current = makeHalo(rightHalfX);

    // ─── Front screen with live vitals (canvas texture) ───────────────────────
    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 512;
    screenCanvas.height = 320;
    screenCanvasRef.current = screenCanvas;
    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    screenTextureRef.current = screenTexture;

    const drawScreen = (sensors: IncubatorSensorTile[], alert: boolean) => {
      const ctx = screenCanvas.getContext("2d");
      if (!ctx) return;
      const W = screenCanvas.width;
      const H = screenCanvas.height;
      // background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, alert ? "#1a0608" : "#0a0612");
      bgGrad.addColorStop(1, alert ? "#2a0a0e" : "#181028");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
      // top bar
      ctx.fillStyle = alert ? "#7a1010" : "#401153";
      ctx.fillRect(0, 0, W, 46);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px 'JetBrains Mono', monospace";
      ctx.textBaseline = "middle";
      ctx.fillText("PLANER · MONITOR", 18, 23);
      // status dot
      ctx.fillStyle = alert ? "#ff6464" : "#22dd88";
      ctx.beginPath();
      ctx.arc(W - 28, 23, 7, 0, Math.PI * 2);
      ctx.fill();
      // primary value (temp)
      const temp = sensors.find((s) => s.id === "incubator_temp");
      const tempValue = temp?.value ?? "--";
      ctx.fillStyle = alert ? "#ff8c8c" : "#9be3c1";
      ctx.font = "bold 96px 'JetBrains Mono', monospace";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(tempValue, 22, 160);
      ctx.fillStyle = alert ? "#ffd0d0" : "#cdb8d8";
      ctx.font = "bold 16px 'JetBrains Mono', monospace";
      ctx.fillText("TEMPERATURE", 24, 186);
      // secondary vitals (up to 3)
      const others = sensors
        .filter((s) => s.id !== "incubator_temp")
        .slice(0, 3);
      ctx.font = "bold 20px 'JetBrains Mono', monospace";
      others.forEach((s, i) => {
        const y = 220 + i * 32;
        ctx.fillStyle = "#7a4a8a";
        ctx.fillText(s.label.toUpperCase().slice(0, 14), 24, y);
        ctx.fillStyle = "#e0c8f0";
        ctx.textAlign = "right";
        ctx.fillText(s.value, W - 24, y);
        ctx.textAlign = "left";
      });
      // bottom scan line accent
      ctx.fillStyle = alert ? "#5a1010" : "#2a1842";
      ctx.fillRect(0, H - 6, W, 6);
      screenTexture.needsUpdate = true;
    };
    screenDrawRef.current = drawScreen;
    drawScreen(sensorTiles, tempAlert);

    // Screen bezel
    const bezelMat = new THREE.MeshPhysicalMaterial({
      color: 0x161018, metalness: 0.6, roughness: 0.3,
    });
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(INC_SCREEN_W + 0.14, INC_SCREEN_H + 0.14, 0.04),
      bezelMat,
    );
    bezel.position.set(0, -INC_BODY_H * 0.05, INC_BODY_D / 2 + 0.001);
    group.add(bezel);

    // Screen (emissive plane with texture)
    const screenMat = new THREE.MeshBasicMaterial({
      map: screenTexture,
      toneMapped: false,
    });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(INC_SCREEN_W, INC_SCREEN_H),
      screenMat,
    );
    screen.position.set(0, -INC_BODY_H * 0.05, INC_BODY_D / 2 + 0.025);
    group.add(screen);

    // ─── "PLANER" brand label below the screen ────────────────────────────────
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const labelCtx = labelCanvas.getContext("2d")!;
    labelCtx.fillStyle = "rgba(0,0,0,0)";
    labelCtx.fillRect(0, 0, 256, 64);
    labelCtx.fillStyle = "#4a3a52";
    labelCtx.font = "bold 38px 'JetBrains Mono', monospace";
    labelCtx.textBaseline = "middle";
    labelCtx.textAlign = "center";
    labelCtx.fillText("PLANER", 128, 32);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    const labelMat = new THREE.MeshBasicMaterial({
      map: labelTexture, transparent: true,
    });
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.22),
      labelMat,
    );
    label.position.set(0, -INC_BODY_H / 2 + 0.18, INC_BODY_D / 2 + 0.01);
    group.add(label);

    // ─── Vent slats on left side ──────────────────────────────────────────────
    const ventMat = new THREE.MeshPhysicalMaterial({
      color: 0x2d262f, metalness: 0.55, roughness: 0.6,
    });
    for (let i = 0; i < 5; i++) {
      const vent = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.04, INC_BODY_D * 0.55),
        ventMat,
      );
      vent.position.set(
        -INC_BODY_W / 2 - 0.005,
        -INC_BODY_H * 0.15 + i * 0.08,
        0,
      );
      group.add(vent);
    }

    // ─── Data logger unit on right side (white case, blue face plate) ─────────
    const LOGGER_T = 0.14;
    const LOGGER_H = 1.1;
    const LOGGER_D = 0.66;
    const LOGGER_X = INC_BODY_W / 2 + LOGGER_T / 2;
    const LOGGER_Z = 0.55;

    const loggerCaseMat = new THREE.MeshPhysicalMaterial({
      color: 0xd9d6db, metalness: 0.15, roughness: 0.45,
      clearcoat: 0.4, clearcoatRoughness: 0.25,
    });
    const logger = new THREE.Mesh(
      new THREE.BoxGeometry(LOGGER_T, LOGGER_H, LOGGER_D),
      loggerCaseMat,
    );
    logger.position.set(LOGGER_X, 0, LOGGER_Z);
    group.add(logger);

    // Face plate drawn on canvas (blue gradient, waves, LCD, branding)
    const loggerFaceCanvas = document.createElement("canvas");
    loggerFaceCanvas.width = 256;
    loggerFaceCanvas.height = 416;
    const lfc = loggerFaceCanvas.getContext("2d")!;
    lfc.fillStyle = "#f2f0f3";
    lfc.fillRect(0, 0, 256, 416);
    const plateGrad = lfc.createLinearGradient(0, 26, 256, 390);
    plateGrad.addColorStop(0, "#262a6e");
    plateGrad.addColorStop(0.5, "#1c1f54");
    plateGrad.addColorStop(1, "#12143a");
    lfc.beginPath();
    lfc.roundRect(14, 26, 228, 364, 18);
    lfc.fillStyle = plateGrad;
    lfc.fill();
    lfc.save();
    lfc.clip();
    lfc.strokeStyle = "rgba(255,255,255,0.2)";
    lfc.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      lfc.beginPath();
      lfc.moveTo(14, 90 + i * 18);
      lfc.bezierCurveTo(90, 56 + i * 26, 170, 132 - i * 14, 242, 88 + i * 20);
      lfc.stroke();
    }
    lfc.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 26; i++) {
      const dx = 20 + ((i * 53) % 216);
      const dy = 40 + ((i * 97) % 200);
      lfc.beginPath();
      lfc.arc(dx, dy, 1.4, 0, Math.PI * 2);
      lfc.fill();
    }
    lfc.restore();
    // LCD screen
    lfc.fillStyle = "#3f4547";
    lfc.beginPath();
    lfc.roundRect(66, 106, 124, 84, 6);
    lfc.fill();
    lfc.fillStyle = "#12181a";
    lfc.beginPath();
    lfc.roundRect(72, 112, 112, 72, 4);
    lfc.fill();
    // sensor badge
    lfc.fillStyle = "#15161c";
    lfc.beginPath();
    lfc.roundRect(126, 224, 26, 26, 6);
    lfc.fill();
    lfc.fillStyle = "#ffffff";
    lfc.font = "bold 15px sans-serif";
    lfc.textBaseline = "middle";
    lfc.fillText("UH₂", 160, 238);
    // myGrape branding
    lfc.font = "bold 24px sans-serif";
    lfc.fillText("myGrape", 62, 300);
    lfc.fillStyle = "#b98ecb";
    for (const [gx, gy] of [[48, 292], [42, 300], [54, 300], [48, 308]] as const) {
      lfc.beginPath();
      lfc.arc(gx, gy, 4, 0, Math.PI * 2);
      lfc.fill();
    }
    // "on" + USB-C port
    lfc.fillStyle = "#e58a2f";
    lfc.font = "bold 16px sans-serif";
    lfc.fillText("on", 168, 332);
    lfc.fillStyle = "#f5f3f6";
    lfc.beginPath();
    lfc.roundRect(148, 344, 62, 18, 9);
    lfc.fill();
    lfc.fillStyle = "#1a1c50";
    lfc.beginPath();
    lfc.roundRect(154, 349, 50, 8, 4);
    lfc.fill();
    const loggerFaceTexture = new THREE.CanvasTexture(loggerFaceCanvas);
    loggerFaceTexture.colorSpace = THREE.SRGBColorSpace;
    const loggerFace = new THREE.Mesh(
      new THREE.PlaneGeometry(LOGGER_D, LOGGER_H),
      new THREE.MeshBasicMaterial({ map: loggerFaceTexture }),
    );
    loggerFace.rotation.y = Math.PI / 2;
    loggerFace.position.set(LOGGER_X + LOGGER_T / 2 + 0.002, 0, LOGGER_Z);
    group.add(loggerFace);

    // Metal cable glands: 3 on front edge, 2 on bottom
    const glandMat = new THREE.MeshPhysicalMaterial({
      color: 0xc0c0c8, metalness: 0.95, roughness: 0.25,
    });
    const glandGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.1, 20);
    const glandTipGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.07, 16);
    for (const gy of [0.3, 0, -0.3]) {
      const g = new THREE.Mesh(glandGeo, glandMat);
      g.rotation.x = Math.PI / 2;
      g.position.set(LOGGER_X, gy, LOGGER_Z + LOGGER_D / 2 + 0.04);
      group.add(g);
      const tip = new THREE.Mesh(glandTipGeo, glandMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(LOGGER_X, gy, LOGGER_Z + LOGGER_D / 2 + 0.11);
      group.add(tip);
    }
    for (const gz of [LOGGER_Z - 0.14, LOGGER_Z + 0.14]) {
      const g = new THREE.Mesh(glandGeo, glandMat);
      g.position.set(LOGGER_X, -LOGGER_H / 2 - 0.04, gz);
      group.add(g);
    }
    // Top mounting tab
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.09), glandMat);
    tab.position.set(LOGGER_X, LOGGER_H / 2 + 0.05, LOGGER_Z);
    group.add(tab);

    // ─── Chamber interior trays: black insert with embossed dish rings ────────
    const trayMat = new THREE.MeshPhysicalMaterial({
      color: 0x141417, metalness: 0.3, roughness: 0.55,
      clearcoat: 0.5, clearcoatRoughness: 0.25,
    });
    const trayRimMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b0b0e, metalness: 0.4, roughness: 0.45,
    });
    const trayRingMat = new THREE.MeshPhysicalMaterial({
      color: 0x2e2e35, metalness: 0.5, roughness: 0.38,
    });
    const dishRingGeo = new THREE.TorusGeometry(0.13, 0.007, 10, 40);
    const pocketRimGeo = new THREE.TorusGeometry(0.21, 0.01, 10, 48);
    const makeChamberTray = (x: number) => {
      const tray = new THREE.Mesh(
        new THREE.BoxGeometry(INC_LID_W * 0.92, 0.05, INC_LID_D * 0.92),
        trayMat,
      );
      tray.position.set(x, INC_BODY_H / 2 - 0.018, 0);
      group.add(tray);
      // 2x2 dish pockets, each with a rounded rim + two overlapping circle moulds
      for (const px of [-0.37, 0.37]) {
        for (const pz of [-0.45, 0.45]) {
          const rim = new THREE.Mesh(pocketRimGeo, trayRimMat);
          rim.rotation.x = -Math.PI / 2;
          rim.position.set(x + px, INC_BODY_H / 2 + 0.006, pz);
          group.add(rim);
          for (const cx of [-0.07, 0.07]) {
            const ring = new THREE.Mesh(dishRingGeo, trayRingMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(x + px + cx, INC_BODY_H / 2 + 0.008, pz);
            group.add(ring);
          }
        }
      }
    };
    makeChamberTray(leftHalfX);
    makeChamberTray(rightHalfX);

    // ─── In-chamber sensor pucks (visible when a lid opens) ───────────────────
    const puckMat = new THREE.MeshPhysicalMaterial({
      color: 0x17171c, metalness: 0.55, roughness: 0.35,
      clearcoat: 0.7, clearcoatRoughness: 0.15,
    });
    const puckCapMat = new THREE.MeshPhysicalMaterial({
      color: 0xe3e3e0, metalness: 0.1, roughness: 0.8,
    });
    const makeSensorPuck = (x: number) => {
      const puck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.07, 32),
        puckMat,
      );
      puck.position.set(x, INC_BODY_H / 2 + 0.042, 0);
      group.add(puck);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.09, 32), puckCapMat);
      cap.rotation.x = -Math.PI / 2;
      cap.position.set(x, INC_BODY_H / 2 + 0.078, 0);
      group.add(cap);
    };
    makeSensorPuck(leftHalfX);
    makeSensorPuck(rightHalfX);

    // ─── Flat kapton ribbon cables: logger → each chamber sensor ─────────────
    const ribbonMat = new THREE.MeshPhysicalMaterial({
      color: 0xb5722f, metalness: 0.15, roughness: 0.35,
      clearcoat: 0.5, clearcoatRoughness: 0.2,
      transparent: true, opacity: 0.92, side: THREE.DoubleSide,
    });
    const makeRibbon = (pts: THREE.Vector3[], width: number) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const segs = 80;
      const positions: number[] = [];
      const indices: number[] = [];
      const half = width / 2;
      const sideV = new THREE.Vector3();
      const nh = new THREE.Vector3();
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        // Ribbon surface normal blends from +x (against side wall) to +y (flat on top)
        const k = THREE.MathUtils.smoothstep(t, 0.05, 0.3);
        nh.set(1 - k, k, 0).normalize();
        sideV.crossVectors(tan, nh).normalize();
        positions.push(
          p.x + sideV.x * half, p.y + sideV.y * half, p.z + sideV.z * half,
          p.x - sideV.x * half, p.y - sideV.y * half, p.z - sideV.z * half,
        );
        if (i < segs) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, ribbonMat);
      group.add(mesh);
      return mesh;
    };

    const TOP_Y = INC_BODY_H / 2 + 0.018;
    makeRibbon(
      [
        new THREE.Vector3(2.22, 0.56, 0.42),
        new THREE.Vector3(2.17, 0.8, 0.4),
        new THREE.Vector3(2.14, 0.95, 0.38),
        new THREE.Vector3(1.95, TOP_Y, 0.32),
        new THREE.Vector3(1.5, TOP_Y, 0.16),
        new THREE.Vector3(1.16, 0.99, 0.02),
      ],
      0.16,
    );
    makeRibbon(
      [
        new THREE.Vector3(2.22, 0.56, 0.7),
        new THREE.Vector3(2.17, 0.82, 0.75),
        new THREE.Vector3(2.13, 0.95, 0.8),
        new THREE.Vector3(1.7, TOP_Y, 0.92),
        new THREE.Vector3(0.5, TOP_Y, 1.02),
        new THREE.Vector3(-0.5, TOP_Y, 0.98),
        new THREE.Vector3(-0.85, TOP_Y, 0.55),
        new THREE.Vector3(-0.87, 0.99, 0.05),
      ],
      0.16,
    );

    // ─── Status LEDs on front-right corner ────────────────────────────────────
    const ledColors = [0x22dd88, 0xffa030, 0x4a90ff];
    ledColors.forEach((c, i) => {
      const ledMat = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
      const led = new THREE.Mesh(
        new THREE.CircleGeometry(0.025, 16),
        ledMat,
      );
      led.position.set(
        INC_BODY_W / 2 - 0.12,
        -INC_BODY_H * 0.05 + 0.18 - i * 0.12,
        INC_BODY_D / 2 + 0.005,
      );
      group.add(led);
    });

    // ─── Floor: subtle glow plane + perspective grid to fog horizon (matches cryocan) ──
    const GROUP_BASE_Y = -0.15;
    const GROUP_SCALE = 0.78;
    const floorY = GROUP_BASE_Y - (INC_BODY_H / 2 + INC_PLINTH_H) * GROUP_SCALE - 0.12;

    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x9b4aaa, transparent: true, opacity: 0.08,
    });
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      floorMat,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY + 0.001;
    scene.add(floor);

    const GRID_SIZE = 110;
    const GRID_DIVS = 88;
    const floorGrid = new THREE.GridHelper(GRID_SIZE, GRID_DIVS, 0xc4a8dc, 0xc4a8dc);
    floorGrid.position.y = floorY - 0.02;
    const setGridOpacity = (m: THREE.Material | THREE.Material[]) => {
      const mats = Array.isArray(m) ? m : [m];
      mats.forEach((mat) => {
        mat.transparent = true;
        (mat as THREE.LineBasicMaterial).opacity = 0.52;
        (mat as THREE.LineBasicMaterial).depthWrite = false;
      });
    };
    setGridOpacity(floorGrid.material);
    scene.add(floorGrid);

    // ─── Raycaster for lid clicks ─────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dom = renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      dragRef.current.dragging = true;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      dom.style.cursor = "grabbing";
    };
    const onPointerUp = (e: PointerEvent) => {
      const moved =
        Math.abs(e.clientX - dragRef.current.lastX) +
        Math.abs(e.clientY - dragRef.current.lastY);
      dragRef.current.dragging = false;
      dom.style.cursor = "grab";
      if (moved > 5) return; // treat as drag, not click
      const rect = dom.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const lids: Mesh[] = [];
      if (leftLidPivotRef.current) lids.push(leftLidPivotRef.current.children[0] as Mesh);
      if (rightLidPivotRef.current) lids.push(rightLidPivotRef.current.children[0] as Mesh);
      const hits = raycaster.intersectObjects(lids, false);
      if (hits.length > 0) {
        const side = (hits[0].object.userData.chamberSide as string) ?? null;
        const id = side === "left" ? leftChamberIdRef.current : rightChamberIdRef.current;
        if (id && onChamberSelectRef.current) onChamberSelectRef.current(id);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.lastX;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      if (sceneGroupRef.current) {
        sceneGroupRef.current.rotation.y += dx * 0.006;
      }
    };
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);

    // ─── Animation loop ───────────────────────────────────────────────────────
    let t = 0;
    let animId = 0;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      t += 0.016;

      // Idle auto-rotate (slow); pause while dragging
      if (!dragRef.current.dragging) {
        group.rotation.y += 0.0022;
      }
      // Gentle bob
      group.position.y = -0.15 + Math.sin(t * 0.9) * 0.025;

      // Halo pulse for selected lids
      const halos = [leftHaloRef.current, rightHaloRef.current];
      halos.forEach((halo) => {
        if (!halo) return;
        const mat = halo.material as THREE.MeshBasicMaterial;
        const target = (halo.userData.targetOpacity as number | undefined) ?? 0;
        mat.opacity += (target - mat.opacity) * 0.08;
        const s = 1 + Math.sin(t * 2.4) * 0.05 * (target > 0 ? 1 : 0);
        halo.scale.set(s, s, s);
      });

      renderer.render(scene, camera);
    };
    tick();

    // ─── Resize ───────────────────────────────────────────────────────────────
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
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose());
          else m.material.dispose();
        }
      });
      screenTexture.dispose();
      labelTexture.dispose();
      loggerFaceTexture.dispose();
      renderer.dispose();
    };
    // Scene built once on mount; sensor/alert updates handled by separate effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Animate lid open/close + halo on selection change ────────────────────
  useEffect(() => {
    const leftPivot = leftLidPivotRef.current;
    const rightPivot = rightLidPivotRef.current;
    const leftHalo = leftHaloRef.current;
    const rightHalo = rightHaloRef.current;
    if (!leftPivot || !rightPivot) return;

    const leftOpen = selectedChamberId != null && selectedChamberId === leftChamberId;
    const rightOpen = selectedChamberId != null && selectedChamberId === rightChamberId;

    if (leftHalo) leftHalo.userData.targetOpacity = leftOpen ? 0.55 : 0;
    if (rightHalo) rightHalo.userData.targetOpacity = rightOpen ? 0.55 : 0;

    const anime = window.anime;
    if (animeReady && anime) {
      anime.remove(leftPivot.rotation);
      anime.remove(rightPivot.rotation);
      anime({
        targets: leftPivot.rotation,
        x: leftOpen ? INC_LID_OPEN_ANGLE : 0,
        duration: 900,
        easing: "easeInOutCubic",
      });
      anime({
        targets: rightPivot.rotation,
        x: rightOpen ? INC_LID_OPEN_ANGLE : 0,
        duration: 900,
        easing: "easeInOutCubic",
      });
    } else {
      leftPivot.rotation.x = leftOpen ? INC_LID_OPEN_ANGLE : 0;
      rightPivot.rotation.x = rightOpen ? INC_LID_OPEN_ANGLE : 0;
    }
  }, [selectedChamberId, leftChamberId, rightChamberId, animeReady]);

  // ─── Repaint the on-screen vitals when sensor values change ───────────────
  useEffect(() => {
    if (screenDrawRef.current) screenDrawRef.current(sensorTiles, tempAlert);
    const light = statusLightRef.current;
    if (light) {
      light.color.set(tempAlert ? 0xff5050 : 0x22dd88);
    }
  }, [sensorTiles, tempAlert]);

  const showSensorTiles = sensorTiles.length > 0;
  const showSidebar = true;

  const gridCols =
    showSensorTiles && showSidebar
      ? "280px minmax(0, 1fr) 300px"
      : showSensorTiles
        ? "280px minmax(0, 1fr)"
        : showSidebar
          ? "minmax(0, 1fr) 300px"
          : "minmax(0, 1fr)";

  const lastTimestamp = sensorTiles.find((t) => t.timestamp)?.timestamp ?? "—";

  const incubatorLabel = [incubatorCode, branchName].filter(Boolean).join(" · ") || "Incubator";

  return (
    <div
      className="relative w-full overflow-hidden incubator-root"
      style={{
        color: "#1a0a1f",
        background:
          "radial-gradient(1200px 600px at 85% -10%, #f1e7f4 0%, #faf6fb 55%, #faf6fb 100%)",
      }}
    >
      <style>{incubatorCss}</style>

      {/* Decorative background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.55,
          backgroundImage:
            "linear-gradient(#e4d4ea 1px, transparent 1px), linear-gradient(90deg, #e4d4ea 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at 50% 40%, #000 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, #000 30%, transparent 80%)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{ top: -120, right: -80, width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, #7a1a8822 0%, transparent 70%)" }}
      />
      <div
        className="absolute pointer-events-none"
        style={{ bottom: -160, left: -100, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, #4011531e 0%, transparent 70%)" }}
      />

      <div className="relative flex flex-col" style={{ padding: "20px 24px", gap: 16 }}>
        {/* ── Chamber selector ── */}
        {chambers.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className="incubator-mono flex items-center gap-2"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "#6b5a70", fontWeight: 600, textTransform: "uppercase", flexShrink: 0 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 9h6M9 12h6M9 15h4" />
              </svg>
              Chamber
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {chambers.map((ch) => {
                const isSelected = selectedChamberId === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onChamberSelect && onChamberSelect(ch.id)}
                    style={{
                      padding: "4px 14px",
                      borderRadius: 999,
                      border: isSelected ? "1.5px solid #6B1176" : "1px solid #d8c6e8",
                      background: isSelected
                        ? "linear-gradient(135deg, #6B1176 0%, #9b4aaa 100%)"
                        : "rgba(255,255,255,0.75)",
                      backdropFilter: "blur(8px)",
                      color: isSelected ? "#ffffff" : "#5f3b73",
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 500,
                      cursor: "pointer",
                      boxShadow: isSelected ? "0 4px 14px #6B117630" : "0 1px 4px #40115310",
                      transition: "all 0.18s ease",
                      letterSpacing: isSelected ? "0.01em" : undefined,
                    }}
                  >
                    {ch.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Main grid ── */}
        <div
          className="incubator-main-grid"
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            gap: 18,
            alignItems: "stretch",
            transition: "grid-template-columns 0.35s ease",
          }}
        >
          {/* ── Left: Live Conditions ── */}
          {showSensorTiles && (
            <div style={{ overflow: "hidden" }}>
              <div
                className="bg-white flex flex-col"
                style={{
                  width: 280,
                  height: 620,
                  border: "1px solid #e6d6ee",
                  borderRadius: 18,
                  boxShadow: "0 6px 16px #40115308",
                  overflow: "hidden",
                }}
              >
                {/* Card header */}
                <div
                  className="flex items-center justify-between"
                  style={{ padding: "14px 16px 10px", background: "#f7f2fa", flexShrink: 0, borderBottom: "1px solid #efe5f4" }}
                >
                  <span style={{ fontWeight: 600, fontSize: 14, color: "#5f3b73" }}>Live Conditions</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b4a78" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                </div>

                {/* Tile list */}
                <div className="flex flex-col" style={{ flex: 1, overflowY: "auto", gap: 6, padding: "10px 12px" }}>
                  {sensorTiles.map((tile) => {
                    const isActive = selectedSensorId === tile.id;
                    const isMuted  = tile.isMissing || tile.isMuted;
                    const icon     = SENSOR_ICONS[tile.id];
                    const palette  = KPI_CARD_STYLES[tile.id];
                    const accent   = isMuted ? "#c9b8d2" : palette?.accent ?? (isActive ? "var(--color-primary)" : "#7b5c8b");
                    const ring     = palette?.ring ?? "rgba(123,92,139,0.08)";
                    const border   = "#e6d6ee";

                    return (
                      <button
                        key={tile.id}
                        type="button"
                        onClick={() => onSensorSelect && onSensorSelect(tile.id)}
                        className="text-left incubator-kpi-card"
                        style={{
                          cursor: "pointer",
                          borderRadius: 16,
                          padding: "12px 14px",
                          border: `1px solid ${border}`,
                          background: "#fdfbfe",
                          boxShadow: isActive ? "0 6px 16px #6B117620" : "0 4px 12px #40115310",
                          opacity: isMuted ? 0.7 : 1,
                          flexShrink: 0,
                          position: "relative",
                          overflow: "hidden",
                        }}
                        title={tile.tooltip}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "relative", zIndex: 1 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: "#8b6c97", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                              {tile.label}
                            </div>
                            <div className="incubator-display" style={{ fontSize: 24, fontWeight: 700, color: isMuted ? "#b4a9be" : "var(--color-primary)", marginTop: 4 }}>
                              {tile.value}
                            </div>
                            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                              {tile.timestamp ?? "All time"}
                            </div>
                          </div>
                          <div
                            style={{
                              width: 46, height: 46, borderRadius: "50%",
                              background: "rgba(255,255,255,0.8)",
                              border: `1px solid ${border}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              boxShadow: `inset 0 0 0 6px ${ring}`,
                              color: accent,
                              flexShrink: 0,
                            }}
                          >
                            <span style={{ display: "inline-flex", transform: "translateY(1px)" }}>{icon}</span>
                          </div>
                        </div>
                        {/* Decorative overlays */}
                        <div className="incubator-kpi-orb" style={{ position: "absolute", right: -20, bottom: -18, width: 140, height: 70, borderRadius: "50%", border: "1px solid rgba(170,140,190,0.35)", opacity: 0.7 }} />
                        <div className="incubator-kpi-glow" style={{ position: "absolute", left: -30, top: -24, width: 110, height: 110, borderRadius: "50%", background: "radial-gradient(circle, rgba(123,92,139,0.12) 0%, rgba(123,92,139,0) 70%)", opacity: 0.6 }} />
                        <div className="incubator-kpi-sheen" style={{ position: "absolute", inset: "12px 12px auto auto", width: 46, height: 46, borderRadius: 10, border: "1px solid rgba(230,214,238,0.9)", opacity: 0.45, transform: "rotate(12deg)" }} />
                        <div className="incubator-kpi-curve" style={{ position: "absolute", left: -18, bottom: -22, width: 160, height: 90, borderRadius: "100%", border: "1px solid rgba(214,198,228,0.5)", transform: "rotate(-8deg)", opacity: 0.55 }} />
                        <div className="incubator-kpi-wave"  style={{ position: "absolute", right: -40, top: 28, width: 180, height: 80, borderRadius: "100%", border: "1px dashed rgba(214,198,228,0.45)", transform: "rotate(10deg)", opacity: 0.5 }} />
                      </button>
                    );
                  })}
                </div>

                {/* Card footer */}
                <div style={{ padding: "8px 16px 12px", borderTop: "1px solid #f0e8f4", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                  </svg>
                  <span style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.08em" }}>
                    Last updated: {lastTimestamp}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Center: 3D Canvas ── */}
          <div
            className="relative overflow-hidden"
            style={{
              background: tempAlert
                ? "linear-gradient(160deg, #fff0f0 0%, #fde4e4 50%, #ffd6d6 100%)"
                : "linear-gradient(160deg, #f3eaf9 0%, #ede0f5 40%, #e4d4f0 100%)",
              borderRadius: 20,
              border: tempAlert ? "1px solid #f5c2c2" : "1px solid #d8c6e8",
              height: 620,
              boxShadow: "0 20px 50px -20px #40115325, 0 2px 6px #4011530a",
              transition: "background 0.6s ease, border-color 0.6s ease",
            }}
          >
            {/* Radial vignette */}
            <div
              style={{
                position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
                background: tempAlert
                  ? "radial-gradient(ellipse 70% 65% at 50% 50%, rgba(255,220,220,0.62) 0%, transparent 72%)"
                  : "radial-gradient(ellipse 70% 65% at 50% 50%, rgba(255,255,255,0.62) 0%, transparent 72%)",
              }}
            />
            {/* Floor gradient */}
            <div
              style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: "30%",
                zIndex: 0, pointerEvents: "none",
                background: tempAlert
                  ? "linear-gradient(0deg, rgba(253,210,210,0.5) 0%, transparent 100%)"
                  : "linear-gradient(0deg, rgba(220,195,240,0.4) 0%, transparent 100%)",
              }}
            />

            {/* Temperature alert banner */}
            {tempAlert && (
              <div className="absolute flex items-center" style={{ top: 0, left: 0, right: 0, zIndex: 10, background: "linear-gradient(90deg, #ff5a5a 0%, #e83030 100%)", padding: "7px 16px", gap: 8, pointerEvents: "none" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span style={{ color: "#ffffff", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>High Temperature Detected</span>
                <span style={{ color: "#ffcccc", fontSize: 10, letterSpacing: "0.04em" }}>· Temperature is above the critical threshold</span>
              </div>
            )}

            {/* Top label */}
            <div className="absolute flex justify-between items-start" style={{ top: 16, left: 16, right: 16, zIndex: 3, pointerEvents: "none" }}>
              <div
                className="incubator-mono inline-flex items-center"
                style={{
                  gap: 8, padding: "6px 12px",
                  background: "rgba(255,255,255,0.85)", backdropFilter: "blur(10px)",
                  border: "1px solid #e4d4ea", borderRadius: 999,
                  fontSize: 10, letterSpacing: "0.2em", color: "#401153", fontWeight: 600,
                }}
              >
                <span
                  className="incubator-pulse"
                  style={{ width: 6, height: 6, borderRadius: "50%", background: "#7a1a88", boxShadow: "0 0 0 3px #7a1a8830" }}
                />
                LIVE · MONITORING
              </div>
            </div>

            {/* 3D Planer incubator model */}
            <div
              ref={mountRef}
              style={{ width: "100%", height: "100%", touchAction: "none", position: "relative", zIndex: 1 }}
            />

            {/* Incubator label — bottom center */}
            {incubatorLabel && (
              <div
                style={{
                  position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
                  background: "rgba(255,255,255,0.88)", backdropFilter: "blur(14px)",
                  border: "1px solid #d8c6e8", borderRadius: 10, padding: "6px 14px",
                  zIndex: 8, pointerEvents: "none", whiteSpace: "nowrap",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1a0a1f" }}>{incubatorLabel}</div>
              </div>
            )}

            {/* Bottom hint */}
            <div
              className="incubator-mono absolute"
              style={{ right: 16, bottom: 16, fontSize: 10, letterSpacing: "0.18em", color: "#6b5a70", textTransform: "uppercase", zIndex: 3 }}
            >
              planer · drag to rotate
            </div>
          </div>

          {/* ── Right: Sidebar ── */}
          {showSidebar && (
            <aside
              className="incubator-side-scroll flex flex-col overflow-x-hidden"
              style={{ gap: 14, height: 620, overflowY: "auto", paddingRight: 4 }}
            >
              {/* System Activity */}
              <div
                className="bg-white"
                style={{ flexShrink: 0, border: "1px solid #e6d6ee", borderRadius: 18, overflow: "hidden", boxShadow: "0 6px 16px #40115308", maxHeight: 260, display: "flex", flexDirection: "column" }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: "#5f3b73", padding: "12px 16px 10px", background: "#f7f2fa", flexShrink: 0, borderBottom: "1px solid #efe5f4" }}>
                  System Activity
                </div>
                <div
                  style={{ flex: 1, overflow: "hidden", position: "relative", padding: "8px 0 0" }}
                  onMouseEnter={() => setActivityScrollPaused(true)}
                  onMouseLeave={() => setActivityScrollPaused(false)}
                >
                  {systemActivity.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>
                      No recent activity
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex", flexDirection: "column", gap: 8,
                        animation: `incubatorScrollActivity ${Math.max(systemActivity.length * 3, 8)}s linear infinite`,
                        animationPlayState: activityScrollPaused ? "paused" : "running",
                      }}
                    >
                      {[...systemActivity, ...systemActivity].flatMap((log, idx) => {
                        const key = `${log.id}-${idx}`;
                        const action = log.action ?? "";
                        const iconType = getActivityIconType(action);
                        const badge = ACTIVITY_BADGE_STYLE[iconType];
                        const timeStr = log.created_at
                          ? new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "";
                        const title = formatActivityActionLabel(action);
                        const actorName = log.actor_label || (log.actor_details
                          ? `${(log.actor_details as any).first_name || ""} ${(log.actor_details as any).last_name || ""}`.trim()
                          : "");
                        const card = (
                          <div
                            key={key}
                            style={{ display: "flex", gap: 10, padding: "8px 10px", borderRadius: 10, border: "1px solid #f0e8f4", background: "#fdfbfe", flexShrink: 0 }}
                          >
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: badge.bg, color: badge.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {ACTIVITY_ICON_INNER[iconType]}
                              </svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <span style={{ fontSize: 9, color: "#6b7280", fontWeight: 500 }}>{timeStr}</span>
                                <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: badge.bg, color: badge.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                  {badge.label}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 500, color: "#1a0a1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {title}
                              </div>
                              {actorName && (
                                <div style={{ fontSize: 10, color: "#6b5a70", marginTop: 1 }}>{actorName}</div>
                              )}
                            </div>
                          </div>
                        );
                        const isCopyEnd = idx === systemActivity.length - 1 || idx === systemActivity.length * 2 - 1;
                        return isCopyEnd ? [card, <div key={`gap-${idx}`} style={{ height: 52, flexShrink: 0 }} />] : [card];
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Chamber Data */}
              <div
                className="bg-white"
                style={{ flexShrink: 0, border: "1px solid #e6d6ee", borderRadius: 18, overflow: "hidden", boxShadow: "0 6px 16px #40115308" }}
              >
                <div
                  className="flex justify-between items-start"
                  style={{ gap: 10, padding: "12px 16px 10px", background: "#f7f2fa", borderBottom: "1px solid #efe5f4" }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#5f3b73" }}>Chamber Data</div>
                    <div
                      className="incubator-display"
                      style={{ fontSize: 11, fontWeight: 500, color: "#8b6c97", letterSpacing: "-0.015em", marginTop: 2 }}
                    >
                      {selectedChamberId ? `Chamber ${selectedChamberId} selected` : "Select a chamber to inspect"}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 9px", borderRadius: 999, background: "#efe7f3", color: "#6b4a78" }}>
                    Total {chambers.length}
                  </span>
                </div>

                <div className="flex flex-col" style={{ gap: 6, padding: "12px 16px" }}>
                  {chambers.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>
                      No chambers available
                    </div>
                  ) : (
                    chambers.map((ch) => {
                      const isSelected = selectedChamberId === ch.id;
                      return (
                        <div
                          key={ch.id}
                          onClick={() => onChamberSelect && onChamberSelect(ch.id)}
                          className="flex items-center"
                          style={{
                            gap: 10, padding: "8px 10px", borderRadius: 12,
                            background: isSelected ? "#f3e8ff" : "#ffffff",
                            border: isSelected ? "1px solid #6B1176" : "1px solid #E7E1E1",
                            boxShadow: isSelected ? "0 4px 14px #6B117620" : "none",
                            transition: "all 0.2s ease",
                            cursor: "pointer",
                          }}
                        >
                          <div className="flex items-center justify-center" style={{ flexShrink: 0, width: 24 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isSelected ? "#6B1176" : "#6b7280"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="3" />
                              <path d="M9 9h6M9 12h6M9 15h4" />
                            </svg>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? "#401153" : "#1a0a1f" }}>
                              {ch.label}
                            </div>
                            <div style={{ fontSize: 10, color: isSelected ? "#6b4a78" : "#6b7280", marginTop: 2 }}>
                              {isSelected ? "inspecting" : "active"}
                            </div>
                          </div>
                          {isSelected && (
                            <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: "50%", background: "#6B1176" }} />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
