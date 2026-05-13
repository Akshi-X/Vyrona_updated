import {
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  type ReactElement,
} from "react";
import type { ActivityLogRecord } from "../../../services/activityLogService";
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
  Scene,
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
  history?: number[];
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
  systemActivity?: ActivityLogRecord[];
  externalTempAlert?: boolean;
  internalTempAlert?: boolean;
  onSensorSelect?: (sensorId: string) => void;
  onCanisterSelect?: (canisterId: string) => void;
  onStrawSelect?: (canisterId: string, strawId: string) => void;
  tankCode?: string;
  branchName?: string;
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
  caneCode: string;
  cryolockGroups: Group[];
  cryolockMats: MeshPhysicalMaterial[];
};

type CanisterRuntime = {
  group: Group;
  handleMat: MeshPhysicalMaterial;
  strawSubgroups: StrawSubgroup[];
  strawGroup: Group;
  homePos: Vector3;
  homeAngle: number;
  index: number;
  labelSprite: THREE.Mesh;
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

// Cryolock cap geometry constants
const CRYO_R = 0.018;   // cap radius — must fit inside cane STRAW_R=0.022
const CRYO_H = 0.12;    // cap height
const CRYO_GAP = 0.015; // gap between stacked caps
const CANE_H = CAN_HEIGHT * 0.62; // matches STRAW_H inside makeCanister

// Derived motion constants (shared across animation effects)
const LIFT_Y = TANK_HEIGHT / 2 + CAN_HEIGHT / 2 + 0.5;
const ROD_LENGTH_DYN = TANK_HEIGHT - CAN_HEIGHT - 0.06;
const LID_OPEN_Y = LIFT_Y + CAN_HEIGHT / 2 + ROD_LENGTH_DYN + 0.6;
const LID_CLOSED_Y = TANK_HEIGHT / 2 + 0.05;
const PARK_DIST = TANK_RADIUS + 1.6;
const PARK_Y = -TANK_HEIGHT / 2 + CAN_HEIGHT / 2 + 0.4;
const PARK_Z_FORWARD = 2.8;  // canister Z offset toward camera during inspection
const ORBIT_R = CAN_RADIUS * 0.55;  // cane orbit radius inside canister ≈ 0.121

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

const GOBLET_COLOR_MAP: Record<string, string> = {
  red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#eab308",
  orange: "#f97316", purple: "#a855f7", pink: "#ec4899", white: "#e5e7eb",
  black: "#1f2937", gray: "#9ca3af", grey: "#9ca3af", brown: "#92400e",
};

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

// ─── Activity log helpers (mirror of Reports page) ───────────────────────────

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
  "email.support_ticket_comment_queued": "Support Ticket Comment Queued",
  "email.support_ticket_comment_sent": "Support Ticket Comment Sent",
  "email.support_ticket_created": "Support Ticket Email Sent",
  "email.support_ticket_status_queued": "Support Ticket Status Queued",
  "email.support_ticket_status_sent": "Support Ticket Status Email Sent",
  "email.user_approval_requested": "Approval Email Sent",
  "email.user_approved_sent": "Approval Confirmation Sent",
  "integration.auth.login": "Integration Login",
  "integration.auth.token_revoked": "Integration Token Revoked",
  "ivf_cycle.created": "IVF Cycle Created",
  "ivf_cycle.oocyte_log.d0_saved": "Oocyte Day 0 Saved",
  "ivf_cycle.oocyte_log.d1_updated": "Oocyte Day 1 Updated",
  "ivf_cycle.oocyte_log.d3_updated": "Oocyte Day 3 Updated",
  "ivf_cycle.oocyte_log.d5_updated": "Oocyte Day 5 Updated",
  "ivf_cycle.oocyte_log.d6_updated": "Oocyte Day 6 Updated",
  "ivf_cycle.oocyte_log.fate_set": "Oocyte Fate Set",
  "ivf_cycle.updated": "IVF Cycle Updated",
  "patient_crylock.hms_update": "Patient Crylock HMS Updated",
  "refill_detection.created": "Refill Detection Created",
  "refill_detection.reviewed": "Refill Detection Reviewed",
  "report.activity_logs.downloaded": "Activity Logs Downloaded",
  "report.ivf.critical_alerts.downloaded": "Critical Alerts Downloaded",
  "report.ivf.monthly_summary.downloaded": "Monthly Summary Downloaded",
  "report.ivf.refill_logs.downloaded": "Refill Logs Downloaded",
  "support_ticket.comment_added": "Support Ticket Commented",
  "support_ticket.created": "Support Ticket Created",
  "support_ticket.status_updated": "Support Ticket Status Updated",
  "task.created": "Task Created",
  "task.deleted": "Task Deleted",
  "task.status_updated": "Task Status Updated",
  "task.updated": "Task Updated",
  "user.approved": "User Approved",
  "user.invite_registered": "User Registered via Invite",
  "user.invited": "User Invited",
  "user.login": "Login Successful",
  "user.login_requested": "Login Requested",
  "user.logout": "Logged Out",
  "user.password_reset_completed": "Password Reset Completed",
  "user.profile_updated": "Profile Updated",
  "user.registered": "User Registered",
  "user.rejected": "User Rejected",
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

function getActivityMetadataLines(action: string, metadata?: Record<string, any> | null): string[] {
  if (!metadata) return [];
  const lines: string[] = [];
  const val = (v: any) => (v === null || v === undefined || v === "" ? null : String(v));

  if (action.startsWith("task.")) {
    if (val(metadata.status)) lines.push(`Status: ${metadata.status}`);
    if (val(metadata.priority)) lines.push(`Priority: ${metadata.priority}`);
    return lines;
  }
  if (action.startsWith("refill_detection.")) {
    if (metadata.is_confirmed !== undefined)
      lines.push(`Confirmed: ${metadata.is_confirmed ? "Yes" : "No"}`);
    if (val(metadata.refill_weight)) lines.push(`Weight: ${metadata.refill_weight} kg`);
    if (val(metadata.notes)) lines.push(`Notes: ${String(metadata.notes).slice(0, 60)}`);
    return lines;
  }
  if (action.startsWith("alert.")) {
    if (val(metadata.message))
      lines.push(String(metadata.message).slice(0, 70));
    else if (val(metadata.alert_type))
      lines.push(`KPI: ${metadata.alert_type}`);
    if (val(metadata.severity)) lines.push(`Severity: ${metadata.severity}`);
    return lines;
  }
  if (action.startsWith("alert_configuration.")) {
    if (metadata.before || metadata.after) {
      const b = metadata.before || {};
      const a = metadata.after || {};
      if (b.kpi_name && b.kpi_name !== a.kpi_name) lines.push(`KPI: ${b.kpi_name} → ${a.kpi_name}`);
      else if (b.kpi_name) lines.push(`KPI: ${b.kpi_name}`);
      if (b.max !== a.max && a.max !== undefined) lines.push(`Max: ${b.max} → ${a.max}`);
    } else {
      if (val(metadata.kpi_name)) lines.push(`KPI: ${metadata.kpi_name}`);
      if (val(metadata.alert_name)) lines.push(`Alert: ${metadata.alert_name}`);
    }
    return lines;
  }
  if (action.startsWith("email.")) {
    if (action === "email.critical_alert_sent") {
      if (val(metadata.email_message))
        lines.push(String(metadata.email_message).slice(0, 70));
      else if (val(metadata.alert_type))
        lines.push(`KPI: ${metadata.alert_type}`);
      if (val(metadata.severity)) lines.push(`Severity: ${metadata.severity}`);
    } else {
      if (val(metadata.recipient_email)) lines.push(`To: ${metadata.recipient_email}`);
    }
    return lines;
  }
  if (action.startsWith("report.")) {
    if (val(metadata.month)) lines.push(`Month: ${metadata.month}`);
    if (val(metadata.start_date) || val(metadata.end_date))
      lines.push(`Range: ${metadata.start_date || ""} – ${metadata.end_date || ""}`);
    return lines;
  }
  if (action.startsWith("user.")) {
    if (val(metadata.role)) lines.push(`Role: ${metadata.role}`);
    if (val(metadata.branch_name)) lines.push(`Branch: ${metadata.branch_name}`);
    return lines;
  }
  if (action.startsWith("ivf_cycle.")) {
    if (val(metadata.his_id)) lines.push(`HIS: ${metadata.his_id}`);
    if (val(metadata.patient_name)) lines.push(`Patient: ${metadata.patient_name}`);
    return lines;
  }
  return [];
}

type ActivityIconType = "refill" | "alert" | "config" | "task" | "email" | "user" | "report" | "ivf" | "default";

function getActivityIconType(action: string): ActivityIconType {
  if (action.startsWith("refill_detection.")) return "refill";
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
  refill:  { bg: "#e8f4fd", color: "#1a6fa8", label: "Refill"  },
  alert:   { bg: "#fef3c7", color: "#92400e", label: "Alert"   },
  config:  { bg: "#f1e7f4", color: "#401153", label: "Config"  },
  task:    { bg: "#ecfdf5", color: "#065f46", label: "Task"    },
  email:   { bg: "#eff6ff", color: "#1e40af", label: "Email"   },
  user:    { bg: "#f9fafb", color: "#374151", label: "User"    },
  report:  { bg: "#e8f4fd", color: "#1a6fa8", label: "Export"  },
  ivf:     { bg: "#f5f3ff", color: "#4c1d95", label: "IVF"    },
  default: { bg: "#f1e7f4", color: "#401153", label: "System"  },
};

// ─── End activity log helpers ─────────────────────────────────────────────────

// ─── Cane / cryolock hierarchy helpers ───────────────────────────────────────

function extractCaneCode(s: string | undefined | null): string | null {
  if (!s) return null;
  const parts = s.split('/');
  return parts.length >= 3 ? parts[2] : null;
}

function groupByCane(contents: StrawInfo[]): Map<string, StrawInfo[]> {
  const map = new Map<string, StrawInfo[]>();
  contents.forEach((item, idx) => {
    const code =
      item.caneCode ||
      extractCaneCode(item.cryolockNumber) ||
      `G${String(idx).padStart(2, '0')}`;
    if (!map.has(code)) map.set(code, []);
    map.get(code)!.push(item);
  });
  return map;
}

// ─── End cane helpers ─────────────────────────────────────────────────────────

function sparklinePoints(history: number[], w: number, h: number): string {
  if (history.length < 2) return "";
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const pad = 2;
  return history
    .map((v, i) => {
      const x = ((i / (history.length - 1)) * (w - pad * 2) + pad).toFixed(1);
      const y = (h - pad - ((v - min) / range) * (h - pad * 2)).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");
}

const SENSOR_ICONS: Record<string, ReactElement> = {
  temp_external: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  temp_internal: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"/>
    </svg>
  ),
  ln2_level: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>
    </svg>
  ),
  ln2_evaporation_rate: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2"/>
    </svg>
  ),
  tive_battery_percentage: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="6" width="18" height="12" rx="2" ry="2"/><line x1="23" y1="13" x2="23" y2="11"/>
    </svg>
  ),
  ln2_lid_state: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  ),
  shock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
};

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
    systemActivity = [],
    externalTempAlert = false,
    internalTempAlert = false,
    onSensorSelect,
    onCanisterSelect,
    onStrawSelect,
    tankCode,
    branchName,
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
  const sceneRef = useRef<Scene | null>(null);
  // Set to true once all inspection animations complete so auto-rotate can restart
  const inspectionReadyRef = useRef<boolean>(false);
  const sceneCanisterCountRef = useRef<number>(CAN_COUNT);
  const canisterGlowRef = useRef<THREE.Group | null>(null);
  const glowRingMatsRef = useRef<THREE.MeshBasicMaterial[]>([]);

  // Material handles for live tweaking from a dev panel
  const materialsRef = useRef<MaterialMap>({});

  // ln2Level prop drives both the displayed percentage and the 3D fill animation.
  // displayPct is the smoothly-tweened version that the counter shows.
  const fill = Math.max(0, Math.min(100, ln2Level));
  const [displayPct, setDisplayPct] = useState<number>(fill);
  const [animeReady, setAnimeReady] = useState<boolean>(false);
  const [selectedCanister, setSelectedCanister] = useState<number | null>(null); // null | index into canisters[]
  // Stage progresses idle → inspecting on canister click; back to idle on dismiss
  const [viewStage, setViewStage] = useState<"idle" | "extracted" | "inspecting">("idle"); // 'idle' | 'extracted' | 'inspecting'
  const [selectedStraw, setSelectedStraw] = useState<number | null>(null); // null | 0..8
  const [loadedCaneCount, setLoadedCaneCount] = useState<number>(0);
  const autoRotateRef = useRef<boolean>(true);
  const selectedCanisterRef = useRef<number | null>(null);
  const viewStageRef = useRef<"idle" | "extracted" | "inspecting">("idle");
  const selectedStrawRef = useRef<number | null>(null);
  // flat index → {caneIdx, cryolockIdx} per canister
  const cryolockFlatMapRef = useRef<{ caneIdx: number; cryolockIdx: number }[][]>([]);

  type CanvasTooltip = { x: number; y: number; item: StrawInfo; caneCode: string };
  const [canvasTooltip, setCanvasTooltip] = useState<CanvasTooltip | null>(null);

  const [hoveredCane, setHoveredCane] = useState<number | null>(null);
  const hoveredCaneRef = useRef<number | null>(null);
  type CaneHoverCard = { x: number; y: number; caneIdx: number; caneCode: string; count: number };
  const [caneHoverCard, setCaneHoverCard] = useState<CaneHoverCard | null>(null);

  useEffect(() => {
    selectedCanisterRef.current = selectedCanister;
  }, [selectedCanister]);
  useEffect(() => {
    viewStageRef.current = viewStage;
  }, [viewStage]);
  useEffect(() => {
    selectedStrawRef.current = selectedStraw;
  }, [selectedStraw]);
  useEffect(() => {
    hoveredCaneRef.current = hoveredCane;
  }, [hoveredCane]);

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
    sceneRef.current = scene;

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
      color: 0xf2ecf8,
      metalness: 0.06,
      roughness: 0.22,
      transmission: 0,
      transparent: true,
      opacity: 0.78,
      thickness: 0.6,
      ior: 1.38,
      side: THREE.DoubleSide,
      clearcoat: 0.8,
      clearcoatRoughness: 0.14,
      attenuationColor: new THREE.Color(0xd8c4ec),
      attenuationDistance: 1.8,
    });
    materialsRef.current.tankShell = shellMat;
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.renderOrder = 3;
    group.add(shell);

    // Chrome bottom cap — opaque metallic disc sealing the tank base, gives chrome shine
    const bottomCapMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0dce8,
      metalness: 0.95,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    });
    const bottomCap = new THREE.Mesh(
      new THREE.CircleGeometry(TANK_RADIUS * 0.97, 64),
      bottomCapMat,
    );
    bottomCap.rotation.x = Math.PI / 2;
    bottomCap.position.y = -TANK_HEIGHT / 2 + 0.01;
    group.add(bottomCap);

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
      color: 0xeae0f2,
      metalness: 0.04,
      roughness: 0.24,
      transmission: 0,
      transparent: true,
      opacity: 0.60,
      thickness: 0.5,
      ior: 1.4,
      side: THREE.DoubleSide,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
      attenuationColor: new THREE.Color(0xc8b4e0),
      attenuationDistance: 1.4,
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
      color: 0xd8ceb8,
      metalness: 0.88,
      roughness: 0.3,
      clearcoat: 0.4,
      clearcoatRoughness: 0.2,
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

      // ===== Label plate on canister outer surface =====
      const lblCanvas = document.createElement('canvas');
      lblCanvas.width = 512;
      lblCanvas.height = 128;
      const lctx = lblCanvas.getContext('2d')!;
      // Metallic dark background band
      const grad = lctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, 'rgba(80, 20, 100, 0.95)');
      grad.addColorStop(1, 'rgba(50, 10, 70, 0.95)');
      lctx.fillStyle = grad;
      lctx.beginPath();
      lctx.roundRect(4, 4, 504, 120, 14);
      lctx.fill();
      // Top highlight line
      lctx.strokeStyle = 'rgba(200,120,255,0.6)';
      lctx.lineWidth = 2;
      lctx.beginPath();
      lctx.moveTo(20, 8);
      lctx.lineTo(492, 8);
      lctx.stroke();
      // Label text
      lctx.fillStyle = '#ffffff';
      lctx.font = 'bold 72px monospace';
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      lctx.fillText(`C${idx + 1}`, 256, 68);
      const lblTex = new THREE.CanvasTexture(lblCanvas);
      const labelSprite = new THREE.Mesh(
        new THREE.PlaneGeometry(CAN_RADIUS * 1.55, CAN_RADIUS * 0.88),
        new THREE.MeshBasicMaterial({ map: lblTex, transparent: true, depthWrite: false }),
      );
      // Sit flush on the canister outer wall, facing +Z
      labelSprite.position.set(0, CAN_HEIGHT * 0.12, CAN_RADIUS + 0.003);
      g.add(labelSprite);

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
          metalness: 0.0,
          roughness: 0.15,
          transmission: 0.55,
          transparent: true,
          opacity: 0.75,
          thickness: 0.05,
          ior: 1.38,
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
          caneCode: '',
          cryolockGroups: [],
          cryolockMats: [],
        });
      });
      g.add(strawGroup);

      return { group: g, handleMat, strawSubgroups, strawGroup, labelSprite };
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
        labelSprite: parts.labelSprite,
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
      color: 0x1888d8,
      metalness: 0.0,
      roughness: 0.1,
      transmission: 0.18,
      transparent: true,
      opacity: 0.92,
      thickness: 1.4,
      ior: 1.24,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      attenuationColor: new THREE.Color(0x0050a0),
      attenuationDistance: 0.7,
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
      color: 0x30b8f8,
      metalness: 0.0,
      roughness: 0.06,
      transmission: 0.22,
      transparent: true,
      opacity: 0.96,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      side: THREE.DoubleSide,
      ior: 1.33,
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

    // ===== Canister portal ring glow (neon halo shown when canister is parked) =====
    const RING_R = 0.68;           // ring radius — a bit wider than canister
    const RING_TUBE = 0.045;       // main ring tube thickness
    const RING_Y = PARK_Y - CAN_HEIGHT / 2 + 0.06;

    const glowGroup = new THREE.Group();
    glowGroup.position.set(PARK_DIST, RING_Y, 0);
    glowGroup.visible = false;
    scene.add(glowGroup);
    canisterGlowRef.current = glowGroup;

    const ringMats: THREE.MeshBasicMaterial[] = [];

    // Core bright ring
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xd050ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    ringMats.push(coreMat);
    const coreRing = new THREE.Mesh(
      new THREE.TorusGeometry(RING_R, RING_TUBE, 16, 100),
      coreMat,
    );
    coreRing.rotation.x = Math.PI / 2;
    glowGroup.add(coreRing);

    // Outer soft glow ring (wider tube, dimmer)
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x8820cc,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    ringMats.push(outerMat);
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(RING_R, RING_TUBE * 3.5, 8, 100),
      outerMat,
    );
    outerRing.rotation.x = Math.PI / 2;
    glowGroup.add(outerRing);

    // Inner thin bright highlight ring
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xf090ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    ringMats.push(innerMat);
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(RING_R * 0.96, RING_TUBE * 0.35, 8, 100),
      innerMat,
    );
    innerRing.rotation.x = Math.PI / 2;
    glowGroup.add(innerRing);

    // Dot nodes evenly distributed around the ring
    const DOT_COUNT = 32;
    const dotBaseMat = new THREE.MeshBasicMaterial({
      color: 0xee88ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    ringMats.push(dotBaseMat);
    for (let di = 0; di < DOT_COUNT; di++) {
      const a = (di / DOT_COUNT) * Math.PI * 2;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 6, 6),
        dotBaseMat,
      );
      dot.position.set(Math.cos(a) * RING_R, 0, Math.sin(a) * RING_R);
      glowGroup.add(dot);
    }

    // Wide floor glow disc for ambient color spill
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x5500aa,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    ringMats.push(floorMat);
    const floorDisc = new THREE.Mesh(
      new THREE.CircleGeometry(RING_R * 1.6, 48),
      floorMat,
    );
    floorDisc.rotation.x = -Math.PI / 2;
    floorDisc.position.y = -0.005;
    glowGroup.add(floorDisc);

    glowRingMatsRef.current = ringMats;

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

        if (stage === "inspecting") {
          // Clicking a cane selects the first cryolock of that cane
          const caneIdx = pickStraw(upX, upY);
          if (caneIdx !== null && selectedCanisterRef.current !== null) {
            const flatMap = cryolockFlatMapRef.current[selectedCanisterRef.current] ?? [];
            const firstFlatIdx = flatMap.findIndex((m) => m.caneIdx === caneIdx);
            if (firstFlatIdx !== -1) {
              setSelectedStraw((prev) => prev === firstFlatIdx ? null : firstFlatIdx);
            }
          }
          return;
        }

        const idx = pickCanister(upX, upY);
        if (idx === null) return;

        if (stage === "idle") {
          setSelectedCanister(idx);
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
        let actionable = false;
        if (stage === "inspecting") {
          const strawIdx = pickStraw(x, y);
          actionable = strawIdx !== null;

          // Cane hover card
          const sel = selectedCanisterRef.current;
          if (sel !== null) {
            const flatMap = cryolockFlatMapRef.current[sel] ?? [];
            const caneIdx = strawIdx !== null ? (flatMap[strawIdx]?.caneIdx ?? null) : null;
            if (caneIdx !== hoveredCaneRef.current) {
              hoveredCaneRef.current = caneIdx;
              setHoveredCane(caneIdx);
              if (caneIdx !== null && canistersRef.current[sel]) {
                const sub = canistersRef.current[sel].strawSubgroups[caneIdx];
                if (sub) {
                  const _wp = new THREE.Vector3();
                  sub.group.getWorldPosition(_wp);
                  const projected = _wp.clone().project(camera);
                  const rect = renderer.domElement.getBoundingClientRect();
                  const sx = (projected.x + 1) / 2 * rect.width;
                  const sy = (-projected.y + 1) / 2 * rect.height;
                  const caneCount = flatMap.filter((m) => m.caneIdx === caneIdx).length;
                  setCaneHoverCard({ x: sx, y: sy, caneIdx, caneCode: sub.caneCode, count: caneCount });
                }
              } else {
                setCaneHoverCard(null);
              }
            }
          }
        } else {
          if (hoveredCaneRef.current !== null) {
            hoveredCaneRef.current = null;
            setHoveredCane(null);
            setCaneHoverCard(null);
          }
          if (stage === "idle") {
            actionable = pickCanister(x, y) !== null;
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

      if (autoRotateRef.current && !dragging) {
        const stage = viewStageRef.current;
        if (stage === "idle") {
          group.rotation.y += 0.00384;
          // Hide ring when idle
          if (canisterGlowRef.current && canisterGlowRef.current.visible) {
            canisterGlowRef.current.visible = false;
          }
        } else if (stage === "extracted" || stage === "inspecting") {
          // Tank does not rotate while a canister is extracted/inspecting
          // (group stays at targetGroupRot so local tilt = world tilt)

          const selIdx = selectedCanisterRef.current;
          if (selIdx !== null && canistersRef.current[selIdx]) {
            const c = canistersRef.current[selIdx];

            if (stage === "inspecting" && inspectionReadyRef.current) {
              // Orbit all canes together via strawGroup rotation
              c.strawGroup.rotation.y += 0.022;
            }

            // Portal ring — follow canister world position, pulsate
            const glowGrp = canisterGlowRef.current;
            if (glowGrp) {
              glowGrp.visible = true;
              // Must use world position: c.group is a child of the rotating tank group
              const _wp = new THREE.Vector3();
              c.group.getWorldPosition(_wp);
              glowGrp.position.x = _wp.x;
              glowGrp.position.z = _wp.z;
              // Slow ring rotation for the portal effect
              glowGrp.rotation.y += 0.012;

              const pulse = 0.72 + Math.sin(t * 2.2) * 0.18;
              const mats = glowRingMatsRef.current;
              if (mats[0]) mats[0].opacity = pulse;                    // core
              if (mats[1]) mats[1].opacity = pulse * 0.42;             // outer soft
              if (mats[2]) mats[2].opacity = 0.55 + Math.sin(t * 3.5 + 1) * 0.25; // inner highlight
              if (mats[3]) mats[3].opacity = 0.6 + Math.sin(t * 2.8 + 0.5) * 0.2; // dots
              if (mats[4]) mats[4].opacity = pulse * 0.22;             // floor disc
            }
          }
        }
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

  // ---------- Internal temp alert — tint inner vessel red ----------
  useEffect(() => {
    const mat = materialsRef.current.innerVessel as any;
    if (!mat || !mat.color) return;
    if (internalTempAlert) {
      mat.color.set("#f0c0c0");
      if (mat.attenuationColor) mat.attenuationColor.set("#f08080");
    } else {
      mat.color.set("#f6f0f7");
      if (mat.attenuationColor) mat.attenuationColor.set("#ece0f0");
    }
    mat.needsUpdate = true;
  }, [internalTempAlert]);

  // ---------- Lid open/close driven by live sensor in idle state ----------
  useEffect(() => {
    const lidPivot = lidGroupRef.current;
    if (!lidPivot) return;
    // Only control the lid from sensor when no canister is being extracted/inspected
    if (selectedCanister !== null) return;
    const targetY = lidStatus === "open" ? LID_OPEN_Y : LID_CLOSED_Y;
    const anime = window.anime;
    if (animeReady && anime) {
      anime.remove(lidPivot.position);
      anime({
        targets: lidPivot.position,
        y: targetY,
        duration: 1200,
        easing: "easeInOutCubic",
      });
    } else {
      lidPivot.position.y = targetY;
    }
  }, [lidStatus, selectedCanister, animeReady]);

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

  // ---------- Cryolock cap injection / cleanup ----------
  // MUST be declared before the animation effect so React fires it first when
  // selectedCanister changes — the animation reads strawSubgroups[].group.visible
  // which cap-injection sets; if animation fires first it sees all 9 canes visible.
  useEffect(() => {
    const cans = canistersRef.current;
    if (!cans.length) return;

    const clearAllCaps = () => {
      cans.forEach((can) => {
        can.strawSubgroups.forEach((sub) => {
          sub.cryolockGroups.forEach((g) => sub.group.remove(g));
          sub.cryolockGroups.length = 0;
          sub.cryolockMats.length = 0;
          sub.caneCode = '';
          sub.group.visible = true;
        });
      });
    };

    if (selectedCanister === null) {
      clearAllCaps();
      setLoadedCaneCount(0);
      return;
    }

    const can = cans[selectedCanister];
    if (!can) return;

    const embeddedMode = variant === 'embedded';
    const effCanisters = canisters ?? (embeddedMode ? [] : DEFAULT_CANISTERS);
    const effContents = canisterContents ?? (embeddedMode ? {} : DEFAULT_CONTENTS);
    const canData = effCanisters[selectedCanister];
    const contents = canData ? (effContents[canData.id] ?? []) : [];

    const caneMap = groupByCane(contents);
    const caneEntries = Array.from(caneMap.entries());

    const flatMap: { caneIdx: number; cryolockIdx: number }[] = [];

    can.strawSubgroups.forEach((sub, i) => {
      sub.cryolockGroups.forEach((g) => sub.group.remove(g));
      sub.cryolockGroups.length = 0;
      sub.cryolockMats.length = 0;

      if (i < caneEntries.length) {
        const [code, items] = caneEntries[i];
        sub.caneCode = code;
        sub.group.visible = true;

        items.forEach((item, j) => {
          const capGroup = new THREE.Group();
          // Caps sit INSIDE the cane, stacked from top down so they're hidden until popped
          const capY = CANE_H / 2 - CRYO_H / 2 - 0.02 - j * (CRYO_H + CRYO_GAP);
          capGroup.position.y = capY;
          capGroup.userData['cryolockHomeY'] = capY;

          const colorInt =
            typeof item.color === 'number'
              ? item.color
              : STRAW_COLORS[j % STRAW_COLORS.length];
          const capMat = new THREE.MeshPhysicalMaterial({
            color: colorInt,
            metalness: 0.25,
            roughness: 0.35,
            emissive: 0x000000,
            emissiveIntensity: 0,
          });
          const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(CRYO_R, CRYO_R * 0.88, CRYO_H, 12),
            capMat,
          );
          capGroup.add(cap);
          sub.group.add(capGroup);
          sub.cryolockGroups.push(capGroup);
          sub.cryolockMats.push(capMat);

          flatMap.push({ caneIdx: i, cryolockIdx: j });
        });
      } else {
        sub.group.visible = false;
      }
    });

    cryolockFlatMapRef.current[selectedCanister] = flatMap;
    setLoadedCaneCount(caneEntries.length);
  }, [selectedCanister, canisterContents, canisters, variant]);

  // ---------- Canister extraction + straw inspection animation ----------
  useEffect(() => {
    const cam = cameraRef.current;
    const target = camTargetRef.current;
    const grp = sceneGroupRef.current;
    const scene = sceneRef.current;
    const lidPivot = lidGroupRef.current;
    const interior = interiorLightRef.current;
    const cans = canistersRef.current;
    if (!cam || !target || !grp || !scene || !lidPivot || !interior || !cans.length)
      return;

    const anime = window.anime;

    // Canister parks at world (-3.1, PARK_Y, PARK_Z_FORWARD); tank at origin.
    // Stage 1 (extracted) — centered between them, slightly left.
    const STAGE1_TARGET = { x: -0.8, y: 0.0, z: 0.8 };
    const STAGE1_CAM    = { x: -0.8, y: 2.0, z: 10.5 };

    // Stage 2 (inspecting) — pull back slightly, raise to look down into canister opening.
    const STAGE2_TARGET = { x: -1.0, y: 0.2, z: 1.0 };
    const STAGE2_CAM    = { x: -1.0, y: 3.5, z: 11.5 };

    // Idle framing — tank centered
    const IDLE_TARGET = { x: 0, y: 0, z: 0 };
    const IDLE_CAM    = { x: 0, y: 0.5, z: 11.0 };

    // ---------- STAGE: idle (return to default) ----------
    if (selectedCanister === null) {
      inspectionReadyRef.current = false;
      if (!animeReady || !anime) {
        cans.forEach((c) => {
          c.group.position.copy(c.homePos);
          c.handleMat.opacity = 1;
          c.strawSubgroups.forEach((s) =>
            s.group.position.copy(s.homeLocalPos),
          );
          c.strawGroup.position.set(0, 0, 0);
          c.strawGroup.rotation.set(0, 0, 0);
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
        // Stop orbit and reset strawGroup rotation
        anime.remove(c.strawGroup.rotation);
        anime({ targets: c.strawGroup.rotation, y: 0, duration: 500, easing: "easeOutQuad" });

        c.strawSubgroups.forEach((s) => {
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
          anime.remove(s.group.rotation);
          anime({ targets: s.group.rotation, x: 0, y: 0, z: 0, duration: 600, easing: "easeInOutCubic", delay: 200 });
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

        // Reset tilt when returning to tank
        anime.remove(c.group.rotation);
        anime({
          targets: c.group.rotation,
          x: 0, y: 0, z: 0,
          duration: 700,
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
    // World target: (-PARK_DIST, PARK_Y, PARK_Z_FORWARD). Derived local coords for Y-rotation group:
    const parkLocalX = -dirX * PARK_DIST - dirZ * PARK_Z_FORWARD;
    const parkLocalZ = -dirZ * PARK_DIST + dirX * PARK_Z_FORWARD;

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

      // Determine if we're entering from inspecting (canes at orbit positions) or from idle
      const comingFromInspecting = can.strawSubgroups.some(
        (s) => s.group.position.distanceTo(s.homeLocalPos) > 0.1
      );

      if (comingFromInspecting) {
        // Stop orbit and animate canes back to home positions inside canister
        anime.remove(can.strawGroup.rotation);
        anime({ targets: can.strawGroup.rotation, y: 0, duration: 600, easing: "easeOutQuad" });
        can.strawSubgroups.forEach((s, i) => {
          anime.remove(s.group.position);
          anime({
            targets: s.group.position,
            x: s.homeLocalPos.x,
            y: s.homeLocalPos.y,
            z: s.homeLocalPos.z,
            duration: 600,
            easing: "easeInOutCubic",
            delay: i * 30,
          });
          anime.remove(s.group.rotation);
          anime({ targets: s.group.rotation, x: 0, y: 0, z: 0, duration: 500, easing: "easeInOutCubic", delay: i * 30 });
        });
        // Reset canister to correct world tilt (opening faces camera)
        {
          const h = targetGroupRot;
          const TILT = Math.PI * 0.4;
          const ct = Math.cos(TILT / 2), st = Math.sin(TILT / 2);
          const ch = Math.cos(h / 2), sh = Math.sin(h / 2);
          anime.remove(can.group.quaternion);
          anime({
            targets: can.group.quaternion,
            x: ch * st, y: -sh * ct, z: sh * st, w: ch * ct,
            duration: 700, easing: "easeInOutCubic",
            update: () => can.group.quaternion.normalize(),
          });
        }
        // Restore handle
        anime({ targets: can.handleMat, opacity: 1, duration: 500, easing: "easeOutQuad", delay: 600 });
        // Camera back to stage 1 framing
        anime({ targets: cam.position, x: STAGE1_CAM.x, y: STAGE1_CAM.y, z: STAGE1_CAM.z, duration: 1000, easing: "easeInOutCubic" });
        anime({ targets: target, x: STAGE1_TARGET.x, y: STAGE1_TARGET.y, z: STAGE1_TARGET.z, duration: 1000, easing: "easeInOutCubic" });
        anime({ targets: interior, intensity: 0.5, duration: 800, easing: "easeInOutQuad" });
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

      // Tilt canister so opening faces camera.
      // Group is frozen at targetGroupRot; correct world tilt = Ry(-h) * Rx(0.4π) as quaternion.
      {
        const h = targetGroupRot;
        const TILT = Math.PI * 0.4;
        const ct = Math.cos(TILT / 2), st = Math.sin(TILT / 2);
        const ch = Math.cos(h / 2), sh = Math.sin(h / 2);
        anime.remove(can.group.quaternion);
        anime({
          targets: can.group.quaternion,
          x: ch * st, y: -sh * ct, z: sh * st, w: ch * ct,
          duration: 900, easing: "easeOutBack", delay: 2800,
          update: () => can.group.quaternion.normalize(),
        });
      }

      // 4) Camera shifts to stage 1 framing — tank RIGHT, canister LEFT
      anime({
        targets: cam.position,
        keyframes: [
          { x: -0.5, y: 2.0, z: 8.0, duration: 1100 },
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
          { x: -0.5, y: 0.5, z: 0, duration: 1100 },
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

      // 5) Soft fill light positions near the parked canister (LEFT side)
      anime({
        targets: interior.position,
        x: -PARK_DIST,
        y: PARK_Y + 1.2,
        z: PARK_Z_FORWARD,
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
      inspectionReadyRef.current = false;

      // Detect if canister is still inside the tank (coming directly from idle)
      const comingFromIdle =
        can.group.position.y < PARK_Y + 0.5 &&
        !can.strawSubgroups.some((s) => s.group.position.distanceTo(s.homeLocalPos) > 0.1);

      const visibleSubs = can.strawSubgroups.filter((s) => s.group.visible);
      const N = visibleSubs.length || 1;

      if (!animeReady || !anime) {
        // Fallback: position canister at park, open lid, place canes in orbit
        grp.rotation.y = can.homeAngle;
        lidPivot.position.y = LID_OPEN_Y;
        can.group.position.set(parkLocalX, PARK_Y, parkLocalZ);
        {
          const h = targetGroupRot;
          const TILT = Math.PI * 0.4;
          const ct = Math.cos(TILT / 2), st = Math.sin(TILT / 2);
          const ch = Math.cos(h / 2), sh = Math.sin(h / 2);
          can.group.quaternion.set(ch * st, -sh * ct, sh * st, ch * ct);
          can.group.quaternion.normalize();
        }
        visibleSubs.forEach((s, i) => {
          const angle = (i / N) * Math.PI * 2;
          s.group.position.set(ORBIT_R * Math.cos(angle), 0, ORBIT_R * Math.sin(angle));
          s.group.rotation.set(0, angle, 0);
        });
        cam.position.set(STAGE2_CAM.x, STAGE2_CAM.y, STAGE2_CAM.z);
        target.set(STAGE2_TARGET.x, STAGE2_TARGET.y, STAGE2_TARGET.z);
        interior.intensity = 1.5;
        return;
      }

      anime.remove(cam.position);
      anime.remove(target);
      anime.remove(interior);
      anime.remove(interior.position);

      // Extraction delay: if coming from idle, run the full extraction sequence first
      // Canister finishes parking at: delay 1500 + 1100 + 900 + 500 = 4000ms
      const EXTRACT_DELAY = comingFromIdle ? 4300 : 0;

      if (comingFromIdle) {
        anime.remove(grp.rotation);
        anime.remove(lidPivot.position);
        anime.remove(can.group.position);

        // 1) Align group so chosen canister faces outward
        anime({ targets: grp.rotation, y: targetGroupRot, duration: 800, easing: "easeInOutCubic" });

        // 2) Lid lifts straight up
        anime({ targets: lidPivot.position, y: LID_OPEN_Y, duration: 1100, easing: "easeOutQuart", delay: 600 });

        // 3) Canister rises out, then arcs to LEFT park position
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

        // 4) Camera sweeps to stage 1 framing
        anime({
          targets: cam.position,
          keyframes: [
            { x: -0.5, y: 2.0, z: 8.0, duration: 1100 },
            { x: STAGE1_CAM.x, y: STAGE1_CAM.y, z: STAGE1_CAM.z, duration: 1500 },
          ],
          easing: "easeInOutCubic",
          delay: 1700,
        });
        anime({
          targets: target,
          keyframes: [
            { x: -0.5, y: 0.5, z: 0, duration: 1100 },
            { x: STAGE1_TARGET.x, y: STAGE1_TARGET.y, z: STAGE1_TARGET.z, duration: 1500 },
          ],
          easing: "easeInOutCubic",
          delay: 1700,
        });

        // Tilt canister for top-down view — quaternion animation accounts for group rotation
        {
          const h = targetGroupRot;
          const TILT = Math.PI * 0.4;
          const ct = Math.cos(TILT / 2), st = Math.sin(TILT / 2);
          const ch = Math.cos(h / 2), sh = Math.sin(h / 2);
          anime.remove(can.group.quaternion);
          anime({
            targets: can.group.quaternion,
            x: ch * st, y: -sh * ct, z: sh * st, w: ch * ct,
            duration: 900, easing: "easeOutBack", delay: 2800,
            update: () => can.group.quaternion.normalize(),
          });
        }
      }

      // 2) Animate each visible cane to orbit positions inside canister (no reparenting)
      visibleSubs.forEach((s, i) => {
        const angle = (i / N) * Math.PI * 2;
        anime.remove(s.group.position);
        anime({
          targets: s.group.position,
          x: ORBIT_R * Math.cos(angle),
          y: 0,
          z: ORBIT_R * Math.sin(angle),
          duration: 900,
          easing: "easeOutBack",
          delay: EXTRACT_DELAY + 400 + i * 80,
        });
        anime.remove(s.group.rotation);
        anime({ targets: s.group.rotation, x: 0, y: angle, z: 0, duration: 700, easing: "easeOutQuad", delay: EXTRACT_DELAY + 400 });
      });

      // 3) Camera shifts to stage 2 framing
      anime({ targets: cam.position, x: STAGE2_CAM.x, y: STAGE2_CAM.y, z: STAGE2_CAM.z, duration: 1400, easing: "easeInOutCubic", delay: EXTRACT_DELAY + 400 });
      anime({ targets: target, x: STAGE2_TARGET.x, y: STAGE2_TARGET.y, z: STAGE2_TARGET.z, duration: 1400, easing: "easeInOutCubic", delay: EXTRACT_DELAY + 400 });

      // 4) Light moves to illuminate canister area (LEFT side)
      anime({ targets: interior.position, x: -PARK_DIST, y: PARK_Y + 1.0, z: PARK_Z_FORWARD, duration: 1400, easing: "easeInOutCubic", delay: EXTRACT_DELAY + 800 });
      anime({ targets: interior, intensity: 1.5, duration: 1200, easing: "easeOutQuad", delay: EXTRACT_DELAY + 800 });

      // 5) After orbit animation settles, enable inspection ready
      const readyDelay = EXTRACT_DELAY + 400 + (N - 1) * 80 + 1200;
      const selCanSnap = selectedCanister;
      setTimeout(() => {
        if (viewStageRef.current === "inspecting" && selectedCanisterRef.current === selCanSnap) {
          inspectionReadyRef.current = true;
        }
      }, readyDelay);
    }
  }, [selectedCanister, viewStage, animeReady]);

  // ---------- Cryolock / cane selection highlight (3D side) ----------
  useEffect(() => {
    const cans = canistersRef.current;
    if (!cans.length || selectedCanister === null) return;
    const can = cans[selectedCanister];
    if (!can) return;

    const anime = window.anime;
    const flatMap = cryolockFlatMapRef.current[selectedCanister] ?? [];
    const selCaneIdx = selectedStraw !== null ? (flatMap[selectedStraw]?.caneIdx ?? -1) : -1;
    const selCapIdx  = selectedStraw !== null ? (flatMap[selectedStraw]?.cryolockIdx ?? -1) : -1;

    can.strawSubgroups.forEach((s, caneI) => {
      const thisCanSelected = caneI === selCaneIdx;

      // Cane cylinder: dim highlight when its cryolock is selected
      const caneEmissive = thisCanSelected ? 0.15 : 0;
      const caneScale    = thisCanSelected ? 1.08 : 1.0;
      s.strawMat.emissive.setHex(s.baseColor);
      if (animeReady && anime) {
        anime.remove(s.strawMat);
        anime({ targets: s.strawMat, emissiveIntensity: caneEmissive, duration: 350, easing: "easeOutQuad" });
        anime.remove(s.group.scale);
        anime({ targets: s.group.scale, x: caneScale, y: caneScale, z: caneScale, duration: 350, easing: "easeOutBack" });
      } else {
        s.strawMat.emissiveIntensity = caneEmissive;
        s.group.scale.set(caneScale, caneScale, caneScale);
      }

      // Cryolock caps: pop selected cap up, reset others
      s.cryolockGroups.forEach((capGroup, capJ) => {
        const isThisCap = thisCanSelected && capJ === selCapIdx;
        const capMat = s.cryolockMats[capJ];
        const homeY: number = capGroup.userData['cryolockHomeY'] ?? capGroup.position.y;
        const targetY     = isThisCap ? CANE_H / 2 + CRYO_H / 2 + 0.08 : homeY;
        const targetScale = isThisCap ? 1.35 : 1.0;
        const targetEmit  = isThisCap ? 0.65 : 0;

        if (capMat) {
          capMat.emissive.setHex(s.baseColor);
          if (animeReady && anime) {
            anime.remove(capMat);
            anime({ targets: capMat, emissiveIntensity: targetEmit, duration: 350, easing: "easeOutQuad" });
          } else {
            capMat.emissiveIntensity = targetEmit;
          }
        }
        if (animeReady && anime) {
          anime.remove(capGroup.position);
          anime({ targets: capGroup.position, y: targetY, duration: 420, easing: "easeOutBack" });
          anime.remove(capGroup.scale);
          anime({ targets: capGroup.scale, x: targetScale, y: targetScale, z: targetScale, duration: 350, easing: "easeOutBack" });
        } else {
          capGroup.position.y = targetY;
          capGroup.scale.set(targetScale, targetScale, targetScale);
        }
      });
    });
  }, [selectedStraw, selectedCanister, animeReady]);

  // ---------- Auto-clear straw selection when leaving inspecting stage ----------
  useEffect(() => {
    if (viewStage !== "inspecting") {
      setSelectedStraw(null);
      setCanvasTooltip(null);
    }
  }, [viewStage]);

  // ---------- Canvas cryolock tooltip — project 3D cap position to screen ----------
  useEffect(() => {
    if (selectedStraw === null || selectedCanister === null) {
      setCanvasTooltip(null);
      return;
    }
    // Wait for the pop-out animation (420ms) before projecting
    const timer = setTimeout(() => {
      const cam = cameraRef.current;
      const mount = mountRef.current;
      const cans = canistersRef.current;
      if (!cam || !mount || !cans.length) return;
      const can = cans[selectedCanister];
      if (!can) return;

      const flatMap = cryolockFlatMapRef.current[selectedCanister] ?? [];
      const mapping = flatMap[selectedStraw];
      if (!mapping) return;

      const sub = can.strawSubgroups[mapping.caneIdx];
      const capGroup = sub?.cryolockGroups[mapping.cryolockIdx];
      if (!sub || !capGroup) return;

      // World position of the selected cap
      const worldPos = new THREE.Vector3();
      capGroup.getWorldPosition(worldPos);

      // Project world → NDC → canvas pixels
      worldPos.project(cam);
      const rect = mount.getBoundingClientRect();
      const x = ((worldPos.x + 1) / 2) * rect.width;
      const y = ((-worldPos.y + 1) / 2) * rect.height;

      // Pull the item from the flat contents list
      const effCanisters = canisters ?? DEFAULT_CANISTERS;
      const effContents = canisterContents ?? DEFAULT_CONTENTS;
      const canData = effCanisters[selectedCanister];
      const contents = canData ? (effContents[canData.id] ?? []) : [];
      const item = contents[selectedStraw] ?? {};

      setCanvasTooltip({ x, y, item, caneCode: sub.caneCode });
    }, 520);

    return () => clearTimeout(timer);
  }, [selectedStraw, selectedCanister, canisters, canisterContents]);

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
  const isInspecting = viewStage === "inspecting";

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

  // ---------- Update canister label plates from prop ----------
  useEffect(() => {
    const cans = canistersRef.current;
    if (!cans.length) return;
    const effCanisters = canisters ?? DEFAULT_CANISTERS;
    cans.forEach((can, idx) => {
      const canData = effCanisters[idx];
      const label = canData?.id ?? `C${idx + 1}`;
      const mat = can.labelSprite.material as THREE.MeshBasicMaterial;
      const c = document.createElement('canvas');
      c.width = 512; c.height = 128;
      const ctx = c.getContext('2d')!;
      const gr = ctx.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, 'rgba(80, 20, 100, 0.95)');
      gr.addColorStop(1, 'rgba(50, 10, 70, 0.95)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.roundRect(4, 4, 504, 120, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,120,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, 8);
      ctx.lineTo(492, 8);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 72px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 256, 68);
      mat.map?.dispose();
      mat.map = new THREE.CanvasTexture(c);
      mat.needsUpdate = true;
    });
  }, [canisters]);

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
            gridTemplateColumns:
              showSensorTiles && showSidebar
                ? `${isInspecting ? 0 : 220}px minmax(0, 1fr) 300px`
                : showSensorTiles
                  ? `${isInspecting ? 0 : 220}px minmax(0, 1fr)`
                  : showSidebar
                    ? "minmax(0, 1fr) 300px"
                    : "minmax(0, 1fr)",
            gap: isEmbedded ? 16 : 18,
            alignItems: "stretch",
            transition: "grid-template-columns 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Left sensor column — Live Conditions card (kept in DOM for smooth collapse animation) */}
          {showSensorTiles && (
            <div
              style={{
                overflow: "hidden",
                opacity: isInspecting ? 0 : 1,
                transition: "opacity 0.3s ease",
                pointerEvents: isInspecting ? "none" : undefined,
              }}
            >
            <div
              className="cryo-fade-in bg-white flex flex-col"
              style={{
                width: 220,
                height: isEmbedded ? 520 : 620,
                border: "1px solid #E7E1E1",
                borderRadius: 18,
                boxShadow: "0 6px 16px #40115308",
                overflow: "hidden",
              }}
            >
              {/* Card header */}
              <div
                className="flex items-center justify-between"
                style={{
                  padding: "14px 16px 10px",
                  borderBottom: "1px solid #f0e8f4",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14, color: "#6B1176" }}>
                  Live Conditions
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6B1176"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  <polyline points="17 6 23 6 23 12" />
                </svg>
              </div>

              {/* Scrollable tile list */}
              <div
                className="flex flex-col"
                style={{
                  flex: 1,
                  overflowY: "auto",
                  gap: 6,
                  padding: "10px 12px",
                }}
              >
                {sensorTiles.map((tile) => {
                  const isActive = selectedSensorId === tile.id;
                  const icon = SENSOR_ICONS[tile.id];
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
                        border: isActive ? "1px solid #6B117650" : "1px solid #E7E1E1",
                        background: isActive
                          ? "linear-gradient(135deg, #6B117610 0%, #6B117605 100%)"
                          : "#f9f5fc",
                        boxShadow: isActive ? "0 4px 14px #6B117620" : "none",
                        opacity: tile.isMuted ? 0.6 : 1,
                        flexShrink: 0,
                      }}
                      title={tile.tooltip}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {icon && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 20,
                                height: 20,
                                borderRadius: 6,
                                background: isActive ? "#FDF4FF" : "#f0eaf4",
                                color: isActive ? "#6B1176" : "#9ca3af",
                                flexShrink: 0,
                              }}
                            >
                              {icon}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 500,
                              color: "#6b7280",
                            }}
                          >
                            {tile.label}
                          </span>
                        </div>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: tile.isMissing || tile.isMuted ? "#d1d5db" : "#22c55e",
                            boxShadow: tile.isMissing || tile.isMuted ? "none" : "0 0 0 3px #22c55e22",
                            flexShrink: 0,
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 6 }}>
                        <div
                          className="cryo-display"
                          style={{
                            fontSize: 18,
                            fontWeight: 500,
                            color: tile.isMissing ? "#9ca3af" : "#6B1176",
                          }}
                        >
                          {tile.value}
                        </div>
                        {tile.history && tile.history.length > 2 && (
                          <svg
                            width="72"
                            height="28"
                            viewBox="0 0 72 28"
                            style={{ flexShrink: 0, marginBottom: 2 }}
                          >
                            <polyline
                              fill="none"
                              stroke={isActive ? "#6B1176" : "#b39cc2"}
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity={tile.isMissing ? 0.3 : 0.75}
                              points={sparklinePoints(tile.history, 72, 28)}
                            />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Card footer — last updated */}
              <div
                style={{
                  padding: "8px 16px 12px",
                  borderTop: "1px solid #f0e8f4",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                <span style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.08em" }}>
                  Last updated:{" "}
                  {sensorTiles.find((t) => t.timestamp)?.timestamp ?? "—"}
                </span>
              </div>
            </div>
            </div>
          )}

          {/* 3D canvas column */}
          <div
            className="cryo-fade-in relative overflow-hidden"
            style={{
              background: externalTempAlert
                ? "linear-gradient(160deg, #fff0f0 0%, #fde4e4 50%, #ffd6d6 100%)"
                : "linear-gradient(160deg, #f3eaf9 0%, #ede0f5 40%, #e4d4f0 100%)",
              borderRadius: isEmbedded ? 16 : 20,
              border: externalTempAlert ? "1px solid #f5c2c2" : "1px solid #d8c6e8",
              height: isEmbedded ? 520 : 620,
              boxShadow: isEmbedded
                ? "0 8px 20px -12px #4011531f, 0 2px 6px #4011530a"
                : "0 20px 50px -20px #40115325, 0 2px 6px #4011530a",
              opacity: isEmbedded ? 1 : 0,
              transition: "background 0.6s ease, border-color 0.6s ease",
            }}
          >
            {/* Grid pattern */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
                backgroundImage:
                  "linear-gradient(rgba(100,40,140,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(100,40,140,0.09) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
                backgroundPosition: "center center",
              }}
            />
            {/* Radial depth vignette — brighter center, darker corners */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
                background: externalTempAlert
                  ? "radial-gradient(ellipse 70% 65% at 50% 50%, rgba(255,220,220,0.62) 0%, transparent 72%)"
                  : "radial-gradient(ellipse 70% 65% at 50% 50%, rgba(255,255,255,0.62) 0%, transparent 72%)",
              }}
            />
            {/* Floor gradient at the base of the tank */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "30%",
                zIndex: 0,
                pointerEvents: "none",
                background: externalTempAlert
                  ? "linear-gradient(0deg, rgba(253,210,210,0.5) 0%, transparent 100%)"
                  : "linear-gradient(0deg, rgba(220,195,240,0.4) 0%, transparent 100%)",
              }}
            />
            {externalTempAlert && (
              <div
                className="absolute flex items-center"
                style={{
                  top: 0,
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  background: "linear-gradient(90deg, #ff5a5a 0%, #e83030 100%)",
                  padding: "7px 16px",
                  gap: 8,
                  pointerEvents: "none",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span style={{ color: "#ffffff", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  High Temperature Detected
                </span>
                <span style={{ color: "#ffcccc", fontSize: 10, letterSpacing: "0.04em" }}>
                  · External temperature is above the critical threshold
                </span>
              </div>
            )}
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
                      setSelectedCanister(null);
                      setViewStage("idle");
                    }}
                    title="Return canister to tank"
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
                    Return Canister
                  </button>
                ) : null}
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


            {/* Cryolock 3D tooltip — appears above the selected cap */}
            {canvasTooltip && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: canvasTooltip.x,
                  top: canvasTooltip.y - 12,
                  transform: "translate(-50%, -100%)",
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.97)",
                    backdropFilter: "blur(16px)",
                    border: "1.5px solid #c8a8dc",
                    borderRadius: 12,
                    padding: "10px 14px",
                    boxShadow: "0 8px 32px #6B117628, 0 2px 8px #6B117614",
                    minWidth: 158,
                    maxWidth: 220,
                  }}
                >
                  {/* Purple accent bar at top */}
                  <div style={{ position: "absolute", top: 0, left: 12, right: 12, height: 3, borderRadius: "0 0 3px 3px", background: "linear-gradient(90deg, #6B1176, #9b4aaa)" }} />
                  {canvasTooltip.caneCode && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#6B1176", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 5, marginTop: 2 }}>
                      Cane {canvasTooltip.caneCode}
                    </div>
                  )}
                  {canvasTooltip.item.cryolockNumber && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a1f", marginBottom: 3 }}>
                      {canvasTooltip.item.cryolockNumber}
                    </div>
                  )}
                  {canvasTooltip.item.stage && (
                    <div style={{ fontSize: 11, color: "#401153", fontWeight: 500, marginBottom: 2 }}>
                      {canvasTooltip.item.stage}
                    </div>
                  )}
                  {canvasTooltip.item.grade && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 10, background: "#FDF4FF", color: "#6B1176", fontWeight: 600, borderRadius: 4, padding: "1px 6px" }}>
                        {canvasTooltip.item.grade}
                      </span>
                      {canvasTooltip.item.patient && (
                        <span style={{ fontSize: 10, color: "#6b7280" }}>{canvasTooltip.item.patient}</span>
                      )}
                    </div>
                  )}
                  {canvasTooltip.item.type && !canvasTooltip.item.stage && (
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{canvasTooltip.item.type}</div>
                  )}
                </div>
                {/* Downward-pointing arrow matching card border */}
                <div style={{ position: "relative", height: 10, margin: "0 auto", width: 20 }}>
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: "9px solid transparent",
                      borderRight: "9px solid transparent",
                      borderTop: "9px solid #c8a8dc",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: "7px solid transparent",
                      borderRight: "7px solid transparent",
                      borderTop: "8px solid rgba(255,255,255,0.97)",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Canister info cards — bottom-left of canvas when inspecting */}
            {isInspecting && selectedCanisterData && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: 14,
                  bottom: 14,
                  zIndex: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  maxWidth: 220,
                }}
              >
                {/* Canister identity card */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.88)",
                    backdropFilter: "blur(14px)",
                    border: "1px solid #d8c6e8",
                    borderRadius: 12,
                    padding: "10px 14px",
                    boxShadow: "0 4px 18px #40115322",
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 600, color: "#6B1176", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                    Selected Canister
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a1f" }}>
                    {selectedCanisterData.label}
                  </div>
                  {selectedCanisterData.status && (
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{selectedCanisterData.status}</div>
                  )}
                </div>

                {/* Cane slots card */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.88)",
                    backdropFilter: "blur(14px)",
                    border: "1px solid #d8c6e8",
                    borderRadius: 12,
                    padding: "10px 14px",
                    boxShadow: "0 4px 18px #40115322",
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 600, color: "#6B1176", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                    Cane Slots
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#6B1176", lineHeight: 1 }}>{loadedCaneCount}</span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>/ 17 slots</span>
                  </div>
                  {/* Slot grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
                    {Array.from({ length: 17 }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          background: i < loadedCaneCount
                            ? "linear-gradient(135deg, #6B1176, #9b4aaa)"
                            : "#f0e8f5",
                          border: `1px solid ${i < loadedCaneCount ? "#6B117640" : "#ddd"}`,
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>
                    {17 - loadedCaneCount} slots available
                  </div>
                </div>

              </div>
            )}

            {/* LN2 scale — right side of tank (middle of canvas) */}
            {isInspecting && (
              <div
                style={{
                  position: "absolute",
                  left: "63%",
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  zIndex: 8,
                  pointerEvents: "none",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: "#6B1176", letterSpacing: "0.1em" }}>LN2</span>
                  <div style={{ position: "relative", width: 14, height: 140, background: "#e8ddf2", borderRadius: 8, overflow: "hidden", border: "1px solid #c8a8dc" }}>
                    <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${displayPct}%`, background: "linear-gradient(to top, #1258b8, #2888f0)", transition: "height 1s ease", borderRadius: 8 }} />
                    {[25, 50, 75].map((pct) => (
                      <div key={pct} style={{ position: "absolute", left: 0, right: 0, bottom: `${pct}%`, height: 1, background: "rgba(107,17,118,0.25)" }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#6B1176" }}>{Math.round(displayPct)}%</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: 140, paddingTop: 2, paddingBottom: 2 }}>
                  {[100, 75, 50, 25, 0].map((tick) => (
                    <span key={tick} style={{ fontSize: 8, color: "#9ca3af", lineHeight: 1 }}>{tick}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Tank code / branch name — bottom center */}
            {isInspecting && (tankCode || branchName) && (
              <div
                style={{
                  position: "absolute",
                  bottom: 52,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(255,255,255,0.88)",
                  backdropFilter: "blur(14px)",
                  border: "1px solid #d8c6e8",
                  borderRadius: 10,
                  padding: "6px 14px",
                  zIndex: 8,
                  textAlign: "center",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a0a1f" }}>{tankCode || "—"}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{branchName || "—"}</div>
              </div>
            )}

            {/* Cane hover popup */}
            {caneHoverCard && (
              <div
                style={{
                  position: "absolute",
                  left: Math.min(caneHoverCard.x + 12, (mountRef.current?.offsetWidth ?? 600) - 160),
                  top: Math.max(caneHoverCard.y - 48, 8),
                  background: "rgba(255,255,255,0.97)",
                  border: "1px solid #c8a8dc",
                  borderRadius: 10,
                  padding: "8px 12px",
                  zIndex: 12,
                  pointerEvents: "none",
                  boxShadow: "0 4px 16px #40115330",
                  minWidth: 120,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: "#6B1176", marginBottom: 3 }}>
                  Cane {caneHoverCard.caneCode || `#${caneHoverCard.caneIdx + 1}`}
                </div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>
                  {caneHoverCard.count} cryolock{caneHoverCard.count !== 1 ? "s" : ""}
                </div>
              </div>
            )}

            {!isEmbedded && (
              <div
                className="cryo-mono absolute"
                style={{
                  right: isInspecting ? 272 : 16,
                  bottom: 16,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  color: "#6b5a70",
                  textTransform: "uppercase",
                  zIndex: 3,
                  transition: "right 0.35s ease",
                }}
              >
                {viewStage === "inspecting"
                  ? `inspecting canister #${selectedCanister! + 1} · ${samplesPerCanister} samples`
                  : "click a canister · drag to rotate"}
              </div>
            )}

            {/* Cryolock Details — right side overlay inside canvas during inspection */}
            {isInspecting && (
              <div
                className="cryo-fade-in"
                style={{
                  position: "absolute",
                  right: 12,
                  top: 12,
                  bottom: 12,
                  width: 252,
                  zIndex: 9,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.90)",
                    backdropFilter: "blur(18px)",
                    border: "1px solid #d8c6e8",
                    borderRadius: 16,
                    boxShadow: "0 8px 28px #40115320",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    height: "100%",
                  }}
                >
                  {/* Panel header */}
                  <div
                    style={{
                      padding: "13px 14px 11px",
                      borderBottom: "1px solid #ede5f5",
                      background: "linear-gradient(135deg, #f9f4fc 0%, #ffffff 100%)",
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>
                          {selectedCanisterData?.label ?? "Canister"}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#6B1176" }}>
                          Cryolock Details
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#6B1176",
                          background: "#f0e6f8",
                          borderRadius: 8,
                          padding: "3px 9px",
                        }}
                      >
                        {selectedContents.length}
                      </span>
                    </div>
                  </div>

                  {/* Scrollable card list */}
                  {selectedContents.length === 0 ? (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 11 }}>
                      No contents recorded
                    </div>
                  ) : (
                    <div
                      style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: "10px 10px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 7,
                        pointerEvents: "auto",
                      }}
                    >
                      {selectedContents.map((item, i) => {
                        const parts = item.cryolockNumber?.split("/") ?? [];
                        const caneId    = parts[2] ?? null;
                        const lockId    = parts[3] ?? null;
                        const gobletHex = GOBLET_COLOR_MAP[item.gobletColor?.toLowerCase() ?? ""] ?? null;
                        const lockHex   = GOBLET_COLOR_MAP[item.cryolockColor?.toLowerCase() ?? ""] ?? null;
                        const typeLabel = item.type || (item.cryolockNumber ? "Cryolock" : "Sample");
                        const typeBg =
                          typeLabel === "Embryo"  ? { bg: "#7a1a8812", color: "#7a1a88" }
                          : typeLabel === "Sperm"   ? { bg: "#1f7a3a12", color: "#1f7a3a" }
                          : typeLabel === "Oocyte"  ? { bg: "#1a4a7a12", color: "#1a4a7a" }
                          : { bg: "#6b728012", color: "#6b7280" };
                        return (
                          <div
                            key={i}
                            style={{
                              border: "1px solid #ede5f5",
                              borderRadius: 12,
                              overflow: "hidden",
                              background: "#fdfbfe",
                              boxShadow: "0 2px 8px #40115308",
                            }}
                          >
                            {/* Card header */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                padding: "8px 10px 6px",
                                borderBottom: "1px solid #f0e8f4",
                                background: "linear-gradient(135deg, #fbf6fc 0%, #ffffff 100%)",
                              }}
                            >
                              {gobletHex && (
                                <div
                                  style={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: 3,
                                    background: gobletHex,
                                    flexShrink: 0,
                                    boxShadow: `0 0 0 2px ${gobletHex}44`,
                                  }}
                                />
                              )}
                              <span
                                className="cryo-mono"
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "#401153",
                                  flex: 1,
                                  minWidth: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {item.cryolockNumber || item.id || `Sample ${i + 1}`}
                              </span>
                              <span
                                style={{
                                  fontSize: 8,
                                  fontWeight: 600,
                                  padding: "2px 6px",
                                  borderRadius: 999,
                                  background: typeBg.bg,
                                  color: typeBg.color,
                                  letterSpacing: "0.07em",
                                  textTransform: "uppercase",
                                  flexShrink: 0,
                                }}
                              >
                                {typeLabel}
                              </span>
                            </div>
                            {/* Card body */}
                            <div
                              style={{
                                padding: "7px 10px 9px",
                                display: "grid",
                                gridTemplateColumns: "auto 1fr",
                                gap: "3px 8px",
                                fontSize: 10,
                              }}
                            >
                              {caneId && (
                                <>
                                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>Cane</span>
                                  <span style={{ color: "#1a0a1f", fontWeight: 600 }}>{caneId}</span>
                                </>
                              )}
                              {lockId && (
                                <>
                                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>Lock #</span>
                                  <span style={{ color: "#1a0a1f", fontWeight: 600 }}>{lockId}</span>
                                </>
                              )}
                              {item.hisNumber && (
                                <>
                                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>HIS</span>
                                  <span style={{ color: "#1a0a1f" }}>{item.hisNumber}</span>
                                </>
                              )}
                              {item.patient && (
                                <>
                                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>Patient</span>
                                  <span style={{ color: "#1a0a1f" }}>{item.patient}</span>
                                </>
                              )}
                              {item.stage && (
                                <>
                                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>Stage</span>
                                  <span style={{ color: "#1a0a1f" }}>{item.stage}</span>
                                </>
                              )}
                              {item.grade && (
                                <>
                                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>Grade</span>
                                  <span style={{ color: "#6B1176", fontWeight: 600 }}>{item.grade}</span>
                                </>
                              )}
                              {item.caneCode && (
                                <>
                                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>Code</span>
                                  <span style={{ color: "#1a0a1f" }}>{item.caneCode}</span>
                                </>
                              )}
                              {item.gobletColor && (
                                <>
                                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>Goblet</span>
                                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    {gobletHex && <span style={{ width: 8, height: 8, borderRadius: 2, background: gobletHex, display: "inline-block", flexShrink: 0 }} />}
                                    <span style={{ color: "#1a0a1f", textTransform: "capitalize" }}>{item.gobletColor}</span>
                                  </span>
                                </>
                              )}
                              {item.cryolockColor && (
                                <>
                                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>Lock</span>
                                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    {lockHex && <span style={{ width: 8, height: 8, borderRadius: 2, background: lockHex, display: "inline-block", flexShrink: 0 }} />}
                                    <span style={{ color: "#1a0a1f", textTransform: "capitalize" }}>{item.cryolockColor}</span>
                                  </span>
                                </>
                              )}
                              {item.vitrificationDate && (
                                <>
                                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>Vitrified</span>
                                  <span style={{ color: "#1a0a1f" }}>{item.vitrificationDate}</span>
                                </>
                              )}
                              {item.description && (
                                <span
                                  style={{
                                    gridColumn: "1 / -1",
                                    marginTop: 4,
                                    color: "#6b5a70",
                                    fontStyle: "italic",
                                    fontSize: 10,
                                    lineHeight: 1.5,
                                    borderTop: "1px solid #f0e8f4",
                                    paddingTop: 4,
                                  }}
                                >
                                  {item.description}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
            {/* System Activity panel */}
            <div
              className="cryo-fade-in bg-white"
              style={{
                flexShrink: 0,
                border: "1px solid #E7E1E1",
                borderRadius: 18,
                padding: "16px 16px 12px",
                boxShadow: "0 6px 16px #40115308",
                opacity: isEmbedded ? 1 : 0,
                maxHeight: 260,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: "#6B1176",
                  marginBottom: 12,
                  flexShrink: 0,
                }}
              >
                System Activity
              </div>
              <div
                className="flex flex-col"
                style={{ gap: 8, overflowY: "auto" }}
              >
                {systemActivity.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9ca3af",
                      textAlign: "center",
                      padding: "16px 0",
                    }}
                  >
                    No recent activity
                  </div>
                ) : (
                  systemActivity.map((log) => {
                    const action = log.action ?? "";
                    const iconType = getActivityIconType(action);
                    const badge = ACTIVITY_BADGE_STYLE[iconType];
                    const timeStr = log.created_at
                      ? new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "";
                    const title = formatActivityActionLabel(action);
                    const metaLines = getActivityMetadataLines(action, log.metadata).slice(0, 2);
                    const actorName = log.actor_label || (log.actor_details
                      ? `${(log.actor_details as any).first_name || ""} ${(log.actor_details as any).last_name || ""}`.trim()
                      : "");
                    return (
                      <div
                        key={log.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid #f0e8f4",
                          background: "#fdfbfe",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: badge.bg,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {iconType === "refill" ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2L8 6h3v8a4 4 0 008 0V6h3L12 2z"/>
                            </svg>
                          ) : iconType === "alert" ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            </svg>
                          ) : iconType === "config" ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
                            </svg>
                          ) : iconType === "task" ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                            </svg>
                          ) : iconType === "email" ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                            </svg>
                          ) : iconType === "user" ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                            </svg>
                          ) : iconType === "report" ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                          ) : iconType === "ivf" ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                            </svg>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 9, color: "#6b7280", fontWeight: 500 }}>
                              {timeStr}
                            </span>
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 600,
                                padding: "1px 6px",
                                borderRadius: 999,
                                background: badge.bg,
                                color: badge.color,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                              }}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "#1a0a1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {title}
                          </div>
                          {actorName && (
                            <div style={{ fontSize: 10, color: "#6b5a70", marginTop: 1 }}>
                              {actorName}
                            </div>
                          )}
                          {metaLines.map((line, i) => (
                            <div key={i} style={{ fontSize: 10, color: "#6b5a70", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Container Data */}
            <div
              className="cryo-fade-in bg-white"
              style={{
                flexShrink: 0,
                border: "1px solid #E7E1E1",
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
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: "#6B1176",
                      marginBottom: 4,
                    }}
                  >
                    Container Data
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
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "3px 9px",
                      borderRadius: 999,
                      background: "#FDF4FF",
                      color: "#6B1176",
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
                  const cursor = viewStage === "idle" ? "pointer" : "default";
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        if (viewStage === "idle") {
                          setSelectedCanister(i);
                          setViewStage("inspecting");
                          onCanisterSelect && onCanisterSelect(c.id);
                        }
                      }}
                      className="flex items-center"
                      style={{
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: isSelected
                          ? "linear-gradient(135deg, #6B117610 0%, #6B117605 100%)"
                          : "#ffffff",
                        border: isSelected
                          ? "1px solid #6B117650"
                          : "1px solid #E7E1E1",
                        boxShadow: isSelected
                          ? "0 4px 14px #6B117620"
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
                          stroke={isSelected ? "#6B1176" : "#6b7280"}
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
                            fill={isSelected ? "#6B1176" : "#6b7280"}
                          />
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#1a0a1f",
                          }}
                        >
                          {c.label}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#6b7280",
                            marginTop: 2,
                          }}
                        >
                          {canSampleCount} samples ·{" "}
                          {isSelected ? "inspecting" : c.status ?? "stored"}
                        </div>
                      </div>
                      {isSelected && (
                        <span
                          style={{
                            flexShrink: 0,
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#a8751a",
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
                  border: "1px solid #E7E1E1",
                  borderRadius: 18,
                  boxShadow: "0 6px 16px #40115308",
                }}
              >
                <div
                  style={{
                    padding: "16px 18px 12px",
                    borderBottom: "1px solid #E7E1E1",
                    background:
                      "linear-gradient(180deg, #fbf6fc 0%, #ffffff 100%)",
                    flexShrink: 0,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "#6B1176",
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