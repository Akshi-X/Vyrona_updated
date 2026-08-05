import {
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  type ReactElement,
} from "react";
import type { ActivityLogRecord } from "../../../services/activityLogService";
import { ivfService } from "../../../services/ivfService";
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
  tankMaxCapacity?: number | null;
  tankMinCapacity?: number | null;
  ln2L2Threshold?: number | null;
  onSensorSelect?: (sensorId: string) => void;
  onCanisterSelect?: (canisterId: string) => void;
  onStrawSelect?: (canisterId: string, strawId: string) => void;
  tankCode?: string;
  tankId?: number;
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
  handleGroup: Group;
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
const CRYO_R = 0.020;   // cap radius — must fit inside cane STRAW_R=0.022
const CRYO_H = 0.22;    // cap height — tall enough to be visible and clickable
const CRYO_GAP = 0.012; // gap between stacked caps
const CANE_H = CAN_HEIGHT * 0.62; // matches STRAW_H inside makeCanister

// Derived motion constants (shared across animation effects)
const LIFT_Y = TANK_HEIGHT / 2 + CAN_HEIGHT / 2 + 0.5;
const LID_OPEN_ROT = -2 * Math.PI / 3;
const PARK_DIST = 4.75;
const PARK_Y = 0.2;
const ORBIT_R = CAN_RADIUS * 0.55;  // cane orbit radius inside canister ≈ 0.121
const ORBIT_Y_LIFT = CAN_HEIGHT * 0.35;  // lifts cane orbit ring toward the canister opening

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
  refill:  { bg: "#dbeafe", color: "#1d4ed8", label: "Refill"  },
  alert:   { bg: "#fee2e2", color: "#dc2626", label: "Alert"   },
  config:  { bg: "#f3f4f6", color: "#374151", label: "Config"  },
  task:    { bg: "#dcfce7", color: "#16a34a", label: "Task"    },
  email:   { bg: "#e0f2fe", color: "#0369a1", label: "Email"   },
  user:    { bg: "#ede9fe", color: "#6d28d9", label: "User"    },
  report:  { bg: "#fef9c3", color: "#a16207", label: "Export"  },
  ivf:     { bg: "#fce7f3", color: "#be185d", label: "IVF"    },
  default: { bg: "#ccfbf1", color: "#0f766e", label: "System"  },
};

const ACTIVITY_ICON_INNER: Record<ActivityIconType, React.ReactNode> = {
  refill: <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />,
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

// function sparklinePoints(history: number[], w: number, h: number): string {
//   if (history.length < 2) return "";
//   const min = Math.min(...history);
//   const max = Math.max(...history);
//   const range = max - min || 1;
//   const pad = 2;
//   return history
//     .map((v, i) => {
//       const x = ((i / (history.length - 1)) * (w - pad * 2) + pad).toFixed(1);
//       const y = (h - pad - ((v - min) / range) * (h - pad * 2)).toFixed(1);
//       return `${x},${y}`;
//     })
//     .join(" ");
// }

const SENSOR_ICONS: Record<string, ReactElement> = {
  temp_external: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  temp_internal: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"/>
    </svg>
  ),
  ln2_level: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>
    </svg>
  ),
  ln2_evaporation_rate: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2"/>
    </svg>
  ),
  tive_battery_percentage: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="6" width="18" height="12" rx="2" ry="2"/><line x1="23" y1="13" x2="23" y2="11"/>
    </svg>
  ),
  ln2_lid_state: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  ),
  shock: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  humidity: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/>
      <path d="M12.56 6.6A10.97 10.97 0 0014 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 01-11.91 4.97"/>
    </svg>
  ),
};

const KPI_CARD_STYLES: Record<string, { accent: string; ring: string }> = {
  temp_external: { accent: "#c02640", ring: "rgba(192,38,64,0.12)" },
  temp_internal: { accent: "#b45309", ring: "rgba(180,83,9,0.12)" },
  ln2_level: { accent: "#6B1176", ring: "rgba(107,17,118,0.12)" },
  ln2_evaporation_rate: { accent: "#0f766e", ring: "rgba(15,118,110,0.12)" },
  tive_battery_percentage: { accent: "#2563eb", ring: "rgba(37,99,235,0.12)" },
  ln2_lid_state: { accent: "#7c3aed", ring: "rgba(124,58,237,0.12)" },
  shock: { accent: "#dc2626", ring: "rgba(220,38,38,0.12)" },
  humidity: { accent: "#0ea5e9", ring: "rgba(14,165,233,0.12)" },
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
    tankMaxCapacity = null,
    tankMinCapacity = null,
    ln2L2Threshold = null,
    onSensorSelect,
    onCanisterSelect,
    tankCode,
    tankId,
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
  const ln2RimMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const ln2ThresholdRingRef = useRef<THREE.Mesh | null>(null);
  const l2LabelRef = useRef<HTMLDivElement | null>(null);
  const vapSpriteDataRef = useRef<Array<{
    sprite: THREE.Sprite;
    mat: THREE.SpriteMaterial;
    vy: number; vx: number; vz: number;
    baseScale: number; baseOpacity: number; phase: number;
  }>>([]);

  // Material handles for live tweaking from a dev panel
  const materialsRef = useRef<MaterialMap>({});

  // ln2Level prop drives both the displayed percentage and the 3D fill animation.
  // displayPct is the smoothly-tweened version that the counter shows.
  const fill = Math.max(0, Math.min(100, ln2Level));
  const [displayPct, setDisplayPct] = useState<number>(fill);
  const [animeReady, setAnimeReady] = useState<boolean>(false);
  const [sceneReady, setSceneReady] = useState<boolean>(false);
  const sceneReadyRef = useRef<boolean>(false);
  const [selectedCanister, setSelectedCanister] = useState<number | null>(null); // null | index into canisters[]
  // Stage progresses idle → inspecting on canister click; back to idle on dismiss
  const [viewStage, setViewStage] = useState<"idle" | "extracted" | "inspecting">("idle"); // 'idle' | 'extracted' | 'inspecting'
  const [inspectionReady, setInspectionReady] = useState<boolean>(false);
  const [tankLabelPos, setTankLabelPos] = useState<{ x: number; y: number } | null>(null);
  const [canLabelPos, setCanLabelPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedStraw, setSelectedStraw] = useState<number | null>(null); // null | 0..8
  const [loadedCaneCount, setLoadedCaneCount] = useState<number>(0);
  const autoRotateRef = useRef<boolean>(true);
  const selectedCanisterRef = useRef<number | null>(null);

  // Dev-only 3D object debug panel
  const debugModeRef = useRef(false);
  const debugRegistryRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const debugSelectedNameRef = useRef<string | null>(null);
  const debugTransformRef = useRef({ pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugObjectNames, setDebugObjectNames] = useState<string[]>([]);
  const [debugSelectedName, setDebugSelectedName] = useState<string | null>(null);
  const [debugPos, setDebugPos] = useState({ x: 0, y: 0, z: 0 });
  const [debugRotDeg, setDebugRotDeg] = useState({ x: 0, y: 0, z: 0 });
  const [debugScale, setDebugScale] = useState({ x: 1, y: 1, z: 1 });
  const inspectOverrideRef = useRef({
    enabled: true,
    pos: { x: -3.75, y: 0.05, z: 4.55 },
    rotDeg: { x: 4, y: 2, z: -4 },
  });
  const [inspectOverride, setInspectOverride] = useState(true);
  const [inspectPos, setInspectPos] = useState({ x: -3.75, y: 0.05, z: 4.55 });
  const [inspectRotDeg, setInspectRotDeg] = useState({ x: 4, y: 2, z: -4 });
  // HTML overlay positions — sliders in dev panel update these; prod uses initial values
  const [dbgLn2, setDbgLn2] = useState({ left: 74, top: 50 });
  const [dbgNameCard, setDbgNameCard] = useState({ left: 50, bottom: 52 });

  // ---- Color debug ----
  const lightsRef = useRef<Record<string, THREE.Light>>({});
  const [debugTab, setDebugTab] = useState<"objects" | "colors">("objects");
  type MatEntry = { color: string; metalness?: number; roughness?: number; opacity?: number };
  const [matColors, setMatColors] = useState<Record<string, MatEntry>>({
    platform:    { color: "#bdbdbd", metalness: 1.00, roughness: 1.00 },
    tankShell:   { color: "#201e1e", metalness: 1.00, roughness: 1.00, opacity: 0.33 },
    innerVessel: { color: "#2320fe", metalness: 0.00, roughness: 0.00, opacity: 0.09 },
    bottomCap:   { color: "#e0dce8", metalness: 0.95, roughness: 0.00 },
    neck:        { color: "#401153", metalness: 0.75, roughness: 0.22 },
    lidTop:      { color: "#351048", metalness: 0.60, roughness: 0.22 },
    lidBottom:   { color: "#65166f", metalness: 0.50, roughness: 0.28 },
    lidWall:     { color: "#65166f", metalness: 0.55, roughness: 0.25 },
    canBody:     { color: "#000000", metalness: 1.00, roughness: 1.00 },
    rod:         { color: "#401153", metalness: 1.00, roughness: 0.47 },
    innerWall:   { color: "#b8b8c2", metalness: 1.00, roughness: 0.73 },
    ln2:         { color: "#0092fa", opacity: 0.62 },
    wave:        { color: "#30b8f8", opacity: 0.96 },
  });
  const [lightState, setLightState] = useState({
    ambientIntensity: 0.30,
    keyColor: "#ffffff",   keyIntensity: 1.35,
    fillColor: "#e9d9ef",  fillIntensity: 0.45,
    rim1Color: "#7a1a88",  rim1Intensity: 2.35,
    rim2Color: "#c070d0",  rim2Intensity: 0.95,
  });
  const [strawColors, setStrawColors] = useState([
    "#9b4aaa", "#f5e0f5", "#b467c4", "#e0c4e8", "#7a1a88",
    "#f0e5f2", "#a84fb0", "#d8b4e0", "#6b1474",
  ]);
  const viewStageRef = useRef<"idle" | "extracted" | "inspecting">("idle");
  const selectedStrawRef = useRef<number | null>(null);
  const canisterHasContentsRef = useRef<boolean[]>([]);
  // flat index → {caneIdx, cryolockIdx} per canister
  const cryolockFlatMapRef = useRef<{ caneIdx: number; cryolockIdx: number }[][]>([]);

  type CanvasTooltip = { x: number; y: number; item: StrawInfo; caneCode: string };
  const [canvasTooltip, setCanvasTooltip] = useState<CanvasTooltip | null>(null);
  const tooltipWorldPosRef = useRef<THREE.Vector3 | null>(null);

  const [hoveredCane, setHoveredCane] = useState<number | null>(null);
  const hoveredCaneRef = useRef<number | null>(null);
  type CaneHoverCard = { x: number; y: number; caneIdx: number; caneCode: string; count: number };
  const [caneHoverCard, setCaneHoverCard] = useState<CaneHoverCard | null>(null);

  const [activityScrollPaused, setActivityScrollPaused] = useState(false);
  const [editingCryolockIdx, setEditingCryolockIdx] = useState<number | null>(null);
  const [editColorValues, setEditColorValues] = useState({ gobletColor: "", cryolockColor: "" });
  const [colorSaving, setColorSaving] = useState(false);
  const [colorSaveError, setColorSaveError] = useState<string | null>(null);
  const [localContents, setLocalContents] = useState<StrawInfo[]>([]);
  const [containerWidth, setContainerWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 9999
  );
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  useEffect(() => {
    sceneReadyRef.current = sceneReady;
  }, [sceneReady]);
  useEffect(() => {
    selectedCanisterRef.current = selectedCanister;
  }, [selectedCanister]);
  useEffect(() => {
    const update = () => setContainerWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);


  useEffect(() => {
    const effectivePos = containerWidth < 515
      ? { x: -2.5, y: 0.5, z: 6.1 }
      : inspectPos;
    inspectOverrideRef.current = {
      enabled: inspectOverride,
      pos: effectivePos,
      rotDeg: containerWidth < 515 ? { ...inspectRotDeg, z: 0 } : inspectRotDeg,
    };
  }, [inspectOverride, inspectPos, inspectRotDeg, containerWidth]);
  useEffect(() => {
    viewStageRef.current = viewStage;
    const isInspecting = viewStage === "inspecting";
    setDbgLn2(isInspecting ? { left: 87.5, top: 50 } : { left: 74, top: 50 });
    setDbgNameCard(isInspecting ? { left: 72.5, bottom: 34 } : { left: 50, bottom: 52 });
  }, [viewStage]);
  useEffect(() => {
    setInspectionReady(false);
  }, [viewStage, selectedCanister]);
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
    scene.fog = new THREE.Fog(0xe8d4f4, 22, 60);

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    const ambient = new THREE.AmbientLight(0xffffff, 0.30);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(5, 8, 6);
    scene.add(key);

    const fillLight = new THREE.DirectionalLight(0xe9d9ef, 0.45);
    fillLight.position.set(-5, 2, 3);
    scene.add(fillLight);

    const rim1 = new THREE.PointLight(0x7a1a88, 2.35, 12);
    rim1.position.set(-3.5, 2, -3);
    scene.add(rim1);

    const rim2 = new THREE.PointLight(0xc070d0, 0.95, 10);
    rim2.position.set(3, -1.5, 2);
    scene.add(rim2);

    // Interior fill light - illuminates straws during dive. Starts dim.
    const interior = new THREE.PointLight(0xffe8d0, 0.0, 6, 2);
    interior.position.set(0, TANK_HEIGHT / 2 - 0.3, 0);
    scene.add(interior);
    interiorLightRef.current = interior;
    lightsRef.current = { ambient, key, fill: fillLight, rim1, rim2 };

    // ----- Main group -----
    const group = new THREE.Group();
    scene.add(group);
    sceneGroupRef.current = group;
    sceneRef.current = scene;

    // ===== Chrome/steel square platform =====
    const PLATFORM_SIZE = TANK_RADIUS * 2.6;
    const PLATFORM_HEIGHT = 0.16;
    const baseMat = new THREE.MeshPhysicalMaterial({
      color: 0xbdbdbd,
      metalness: 1.0,
      roughness: 1.00,
      clearcoat: 0.5,
      clearcoatRoughness: 0.15,
    });
    materialsRef.current.platform = baseMat;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM_SIZE, PLATFORM_HEIGHT, PLATFORM_SIZE),
      baseMat,
    );
    base.position.y = -TANK_HEIGHT / 2 - PLATFORM_HEIGHT / 2;
    base.name = "platform";
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
      color: 0x201e1e,
      metalness: 1.00,
      roughness: 1.00,
      transmission: 0,
      transparent: true,
      opacity: 0.33,
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
      roughness: 0.00,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    });
    materialsRef.current.bottomCap = bottomCapMat;
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
      color: 0x2320fe,
      metalness: 0.00,
      roughness: 0.00,
      transmission: 0,
      transparent: true,
      opacity: 0.09,
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
    materialsRef.current.neck = neckMat;
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

    // ===== L2 threshold ring (horizontal marker inside tank body at threshold height) =====
    const THRESHOLD_RING_R = INNER_R - 0.04;
    const ln2RimMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    ln2RimMatRef.current = ln2RimMat;
    const ln2Rim = new THREE.Mesh(
      new THREE.TorusGeometry(THRESHOLD_RING_R, 0.025, 10, 64),
      ln2RimMat,
    );
    ln2Rim.rotation.x = Math.PI / 2;
    ln2Rim.position.y = -TANK_HEIGHT / 2 + LN2_BOTTOM_MARGIN;
    group.add(ln2Rim);
    ln2ThresholdRingRef.current = ln2Rim;

    // ===== Tank Lid (disc lid that swings open 90° on a rim hinge) =====
    const lidPivot = new THREE.Group();
    lidPivot.position.y = TANK_HEIGHT / 2 + 0.05;
    group.add(lidPivot);

    // Outer radius matches the neck so it sits flush on top.
    const LID_OUTER_R = neckRadius * 1.04;
    const LID_THICKNESS = 0.18;

    // lidGroup is the hinge pivot — positioned at the +X rim edge.
    // lidInner holds all lid content offset back to center so it sits flush when closed.
    const lidGroup = new THREE.Group();
    lidGroup.position.x = LID_OUTER_R;
    lidPivot.add(lidGroup);

    const lidInner = new THREE.Group();
    lidInner.position.x = -LID_OUTER_R;
    lidGroup.add(lidInner);

    // Bottom face (filled disc, viewed from below)
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
    lidBottom.rotation.x = Math.PI / 2;
    lidBottom.position.y = 0.04;
    lidInner.add(lidBottom);

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
    lidTop.rotation.x = -Math.PI / 2;
    lidTop.position.y = 0.04 + LID_THICKNESS;
    lidInner.add(lidTop);

    // Outer cylindrical wall
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
    lidInner.add(lidOuterWall);

    // Handle/knob on top
    const lidKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.08, 24),
      new THREE.MeshPhysicalMaterial({
        color: 0x401153,
        metalness: 0.7,
        roughness: 0.25,
      }),
    );
    lidKnob.position.y = 0.04 + LID_THICKNESS + 0.04;
    lidInner.add(lidKnob);

    const lidKnobTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 20, 14),
      new THREE.MeshPhysicalMaterial({
        color: 0x7a1a88,
        metalness: 0.6,
        roughness: 0.3,
      }),
    );
    lidKnobTop.position.y = 0.04 + LID_THICKNESS + 0.1;
    lidInner.add(lidKnobTop);

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
      color: 0x000000,
      metalness: 1.00,
      roughness: 1.00,
      clearcoat: 0.0,
      clearcoatRoughness: 0.0,
    });
    const rodMat = new THREE.MeshPhysicalMaterial({
      color: 0x401153,
      metalness: 1.00,
      roughness: 0.47,
    });
    const innerWallMat = new THREE.MeshPhysicalMaterial({
      color: 0xb8b8c2,
      metalness: 1.00,
      roughness: 0.73,
      side: THREE.DoubleSide,
    });
    materialsRef.current.canBody = canBodyMat;
    materialsRef.current.rod = rodMat;
    materialsRef.current.innerWall = innerWallMat;

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
      const handleGroup = new THREE.Group();

      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, ROD_LENGTH, 10),
        handleMat,
      );
      rod.position.y = CAN_HEIGHT / 2 + ROD_LENGTH / 2;
      rod.userData.canisterIndex = idx;
      rod.userData.clickable = true;
      handleGroup.add(rod);

      const topRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.022, 10, 24),
        handleMat,
      );
      topRing.position.y = CAN_HEIGHT / 2 + ROD_LENGTH;
      topRing.rotation.x = Math.PI / 2;
      topRing.userData.canisterIndex = idx;
      topRing.userData.clickable = true;
      handleGroup.add(topRing);
      g.add(handleGroup);

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

      return { group: g, handleMat, handleGroup, strawSubgroups, strawGroup, labelSprite };
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
        handleGroup: parts.handleGroup,
        strawSubgroups: parts.strawSubgroups,
        strawGroup: parts.strawGroup,
        labelSprite: parts.labelSprite,
        homePos,
        homeAngle: ang,
        index: i,
      });
    }
    canistersRef.current = canisters;
    lidGroupRef.current = lidGroup;

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
      color: 0x0092fa,
      metalness: 0.0,
      roughness: 0.1,
      transmission: 0.18,
      transparent: true,
      opacity: 0.62,
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

    // ===== Vapour cloud above the lid (sprite-based soft puffs) =====
    const vapCanvas = document.createElement("canvas");
    vapCanvas.width = vapCanvas.height = 128;
    const vCtx = vapCanvas.getContext("2d")!;
    const vGrad = vCtx.createRadialGradient(64, 64, 4, 64, 64, 64);
    vGrad.addColorStop(0,    "rgba(130,190,255,1)");
    vGrad.addColorStop(0.25, "rgba(100,165,248,0.85)");
    vGrad.addColorStop(0.55, "rgba(70,140,240,0.45)");
    vGrad.addColorStop(0.8,  "rgba(50,120,230,0.15)");
    vGrad.addColorStop(1,    "rgba(30,100,220,0)");
    vCtx.fillStyle = vGrad;
    vCtx.fillRect(0, 0, 128, 128);
    const vapTex = new THREE.CanvasTexture(vapCanvas);

    vapSpriteDataRef.current = [];
    const VAP_COUNT = 58;
    for (let i = 0; i < VAP_COUNT; i++) {
      const baseOpacity = 0.22 + Math.random() * 0.32;
      const baseScale   = 0.45 + Math.random() * 1.1;
      const mat = new THREE.SpriteMaterial({
        map: vapTex,
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(baseScale, baseScale, 1);
      const r = Math.random() * TANK_RADIUS * 0.55;
      const a = Math.random() * Math.PI * 2;
      sprite.position.set(
        Math.cos(a) * r,
        TANK_HEIGHT / 2 + 0.25 + Math.random() * 2.8,
        Math.sin(a) * r,
      );
      group.add(sprite);
      vapSpriteDataRef.current.push({
        sprite, mat,
        vy: 0.004 + Math.random() * 0.008,
        vx: (Math.random() - 0.5) * 0.0022,
        vz: (Math.random() - 0.5) * 0.0022,
        baseScale,
        baseOpacity,
        phase: Math.random() * Math.PI * 2,
      });
    }


    // ===== 3D perspective floor grid (extends to fog horizon) =====
    const GRID_SIZE = 110;
    const GRID_DIVS = 88;
    const floorGrid = new THREE.GridHelper(GRID_SIZE, GRID_DIVS, 0xc4a8dc, 0xc4a8dc);
    floorGrid.position.y = -TANK_HEIGHT / 2 - 0.26;
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
        if (!canisterHasContentsRef.current[idx]) return;

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
              // Clear emissive on previously hovered cane
              const prevIdx = hoveredCaneRef.current;
              if (prevIdx !== null && canistersRef.current[sel]) {
                const prevSub = canistersRef.current[sel].strawSubgroups[prevIdx];
                if (prevSub) {
                  prevSub.strawMat.emissiveIntensity = 0;
                  prevSub.cryolockMats.forEach((m) => { m.emissiveIntensity = 0; });
                }
              }
              hoveredCaneRef.current = caneIdx;
              setHoveredCane(caneIdx);
              if (caneIdx !== null && canistersRef.current[sel]) {
                const sub = canistersRef.current[sel].strawSubgroups[caneIdx];
                if (sub) {
                  // Add emissive glow to signal hoverability
                  sub.strawMat.emissive.set(0xffffff);
                  sub.strawMat.emissiveIntensity = 0.18;
                  sub.cryolockMats.forEach((m) => {
                    m.emissive.set(0xffffff);
                    m.emissiveIntensity = 0.25;
                  });
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
            const sel = selectedCanisterRef.current;
            if (sel !== null && canistersRef.current[sel]) {
              const prevSub = canistersRef.current[sel].strawSubgroups[hoveredCaneRef.current];
              if (prevSub) {
                prevSub.strawMat.emissiveIntensity = 0;
                prevSub.cryolockMats.forEach((m) => { m.emissiveIntensity = 0; });
              }
            }
            hoveredCaneRef.current = null;
            setHoveredCane(null);
            setCaneHoverCard(null);
          }
          if (stage === "idle") {
            const idx = pickCanister(x, y);
            actionable = idx !== null && !!canisterHasContentsRef.current[idx];
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

    // ===== Dev debug object registry =====
    {
      const reg = debugRegistryRef.current;
      reg.clear();
      reg.set("camera", camera);
      reg.set("tank-group", group);
      canistersRef.current.forEach((c, i) => {
        reg.set(`canister-${i}`, c.group);
        reg.set(`canister-${i}-straws`, c.strawGroup);
      });
      scene.traverse((obj) => {
        if (obj.name && obj.name.trim() !== '' && !reg.has(obj.name)) {
          reg.set(obj.name, obj);
        }
      });
      setDebugObjectNames(Array.from(reg.keys()));
    }

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
        } else if (stage === "extracted") {
          // Tank frozen during extraction animation; glow ring hidden
          const glowGrp = canisterGlowRef.current;
          if (glowGrp && glowGrp.visible) glowGrp.visible = false;
        } else if (stage === "inspecting") {
          // Tank is paused; canes orbit around the parked canister
          const selIdx = selectedCanisterRef.current;
          if (selIdx !== null && canistersRef.current[selIdx] && inspectionReadyRef.current) {
            const c = canistersRef.current[selIdx];
            if (hoveredCaneRef.current === null && selectedStrawRef.current === null) {
              c.strawGroup.rotation.y += 0.022;
            }
          }
          const glowGrp = canisterGlowRef.current;
          if (glowGrp && glowGrp.visible) glowGrp.visible = false;
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

      // Vapour cloud — animate each sprite puff
      const inspecting = viewStageRef.current === "inspecting";
      for (const v of vapSpriteDataRef.current) {
        const sp = v.sprite;
        sp.position.y += v.vy;
        sp.position.x += v.vx + Math.sin(t * 0.32 + v.phase) * 0.0014;
        sp.position.z += v.vz + Math.cos(t * 0.32 + v.phase) * 0.0014;

        // Expand and fade as the puff rises
        const rise = (sp.position.y - (TANK_HEIGHT / 2 + 0.25)) / 3.0;
        const sc   = v.baseScale * (1 + rise * 0.9);
        const peak = inspecting ? Math.min(v.baseOpacity * 1.8, 0.88) : v.baseOpacity;
        const op   = peak * Math.max(0, 1 - rise * 0.85);
        sp.scale.set(sc, sc, 1);
        v.mat.opacity = Math.max(0, op);

        // Respawn at tank opening when fully risen or invisible
        if (sp.position.y > TANK_HEIGHT / 2 + 3.8 || v.mat.opacity < 0.01) {
          const spawnR = Math.random() * TANK_RADIUS * (inspecting ? 0.65 : 0.52);
          const spawnA = Math.random() * Math.PI * 2;
          sp.position.set(
            Math.cos(spawnA) * spawnR,
            TANK_HEIGHT / 2 + 0.15 + Math.random() * 0.55,
            Math.sin(spawnA) * spawnR,
          );
          v.baseScale   = inspecting ? (0.65 + Math.random() * 1.5) : (0.45 + Math.random() * 1.1);
          v.baseOpacity = inspecting ? (0.42 + Math.random() * 0.42) : (0.22 + Math.random() * 0.32);
          sp.scale.set(v.baseScale, v.baseScale, 1);
          v.mat.opacity = v.baseOpacity;
          v.vy = 0.004 + Math.random() * 0.008;
          v.vx = (Math.random() - 0.5) * 0.0022;
          v.vz = (Math.random() - 0.5) * 0.0022;
        }
      }

      // Breathing rim light
      rim1.intensity = 1.4 + Math.sin(t * 0.45) * 0.25;

      if (debugModeRef.current) {
        const name = debugSelectedNameRef.current;
        if (name) {
          const obj = debugRegistryRef.current.get(name);
          if (obj) {
            const { pos, rot, scale } = debugTransformRef.current;
            obj.position.set(pos.x, pos.y, pos.z);
            obj.rotation.set(rot.x, rot.y, rot.z);
            obj.scale.set(scale.x, scale.y, scale.z);
          }
        }
      }

      if (inspectOverrideRef.current.enabled) {
        const stage = viewStageRef.current;
        const selIdx = selectedCanisterRef.current;
        if (stage === "inspecting" && inspectionReadyRef.current && selIdx !== null && canistersRef.current[selIdx]) {
          const c = canistersRef.current[selIdx];
          const { pos, rotDeg } = inspectOverrideRef.current;
          if (c.group.parent !== scene) {
            scene.attach(c.group);
          }
          c.group.position.set(pos.x, pos.y, pos.z);
          c.group.rotation.set(
            rotDeg.x * Math.PI / 180,
            rotDeg.y * Math.PI / 180,
            rotDeg.z * Math.PI / 180,
          );
        }
      }

      renderer.render(scene, camera);

      // ===== L2 label overlay — visibility + colour only (position set by useEffect) =====
      const labelEl = l2LabelRef.current;
      const rimMat = ln2RimMatRef.current;
      if (labelEl) {
        const showLabel =
          sceneReadyRef.current &&
          viewStageRef.current !== "inspecting" &&
          rimMat != null &&
          rimMat.opacity > 0;
        labelEl.style.display = showLabel ? "flex" : "none";
        if (showLabel && rimMat) {
          const hex = `#${rimMat.color.getHexString()}`;
          const inner = labelEl.querySelector<HTMLElement>("[data-l2-badge]");
          const line = labelEl.querySelector<HTMLElement>("[data-l2-line]");
          const arrow = labelEl.querySelector<HTMLElement>("[data-l2-arrow]");
          if (inner) { inner.style.borderColor = hex; inner.style.color = hex; }
          if (line) line.style.background = hex;
          if (arrow) arrow.style.borderRightColor = hex;
        }
      }
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
    const lid = lidGroupRef.current;
    if (!lid) return;
    // Only control the lid from sensor when no canister is being extracted/inspected
    if (selectedCanister !== null) return;
    const targetRot = lidStatus === "open" ? LID_OPEN_ROT : 0;
    const anime = window.anime;
    if (animeReady && anime) {
      anime.remove(lid.rotation);
      anime({
        targets: lid.rotation,
        z: targetRot,
        duration: 1200,
        easing: "easeInOutCubic",
      });
    } else {
      lid.rotation.z = targetRot;
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
    const lid = lidGroupRef.current;
    const interior = interiorLightRef.current;
    const cans = canistersRef.current;
    if (!cam || !target || !grp || !scene || !lid || !interior || !cans.length)
      return;

    const anime = window.anime;

    // Canister parks at local (-PARK_DIST, PARK_Y, PARK_Z_FORWARD) within tank group (shifted to (1.3, -0.3, 1.35) during inspection).
    // Camera centers between them; target z = midpoint of canister z and tank z.
    const STAGE1_TARGET = { x: -1.5, y: 0.0, z: 2.0 };
    const STAGE1_CAM    = { x: -1.5, y: 3.0, z: 13.0 };

    // Stage 2 (inspecting) — pulled back to show canister opening + tank.
    const STAGE2_TARGET = { x: -1.5, y: 0.3, z: 2.0 };
    const STAGE2_CAM    = { x: -1.5, y: 3.5, z: 14.0 };

    // Idle framing — tank centered
    const IDLE_TARGET = { x: 0, y: 0, z: 0 };
    const IDLE_CAM    = { x: 0, y: 0.5, z: 11.0 };

    // ---------- STAGE: idle (return to default) ----------
    if (selectedCanister === null) {
      inspectionReadyRef.current = false;
      if (!animeReady || !anime) {
        cans.forEach((c) => {
          if (c.group.parent !== grp) {
            grp.add(c.group);
          }
          c.group.position.copy(c.homePos);
          c.handleMat.opacity = 1;
          c.strawSubgroups.forEach((s) =>
            s.group.position.copy(s.homeLocalPos),
          );
          c.strawGroup.position.set(0, 0, 0);
          c.strawGroup.rotation.set(0, 0, 0);
          c.strawGroup.parent !== c.group && c.group.add(c.strawGroup);
        });
        lid.rotation.z = lidStatus === "open" ? LID_OPEN_ROT : 0;
        grp.position.set(0, 0, 0);
        cam.position.set(IDLE_CAM.x, IDLE_CAM.y, IDLE_CAM.z);
        target.set(IDLE_TARGET.x, IDLE_TARGET.y, IDLE_TARGET.z);
        interior.intensity = 0;
        setSceneReady(true);
        return;
      }

      setSceneReady(false);
      anime.remove(cam.position);
      anime.remove(target);
      anime.remove(lid.rotation);
      anime.remove(interior);
      anime.remove(interior.position);
      anime.remove(grp.position);

      // 1) Camera pulls back to default; tank group returns to origin
      anime({
        targets: cam.position,
        keyframes: [
          { x: 1.5, y: 3.0, z: 6.5, duration: 1100 },
          { x: IDLE_CAM.x, y: IDLE_CAM.y, z: IDLE_CAM.z, duration: 1000 },
        ],
        easing: "easeInOutCubic",
        complete: () => setSceneReady(true),
      });
      anime({ targets: grp.position, x: 0, y: 0, z: 0, duration: 1400, easing: "easeInOutCubic", delay: 300 });
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
        if (c.group.parent !== grp) {
          grp.attach(c.group);
          c.group.rotation.set(0, 0, 0);
        }
        c.handleGroup.visible = true;
        // Stop orbit and reset strawGroup rotation + lift
        anime.remove(c.strawGroup.rotation);
        anime({ targets: c.strawGroup.rotation, y: 0, duration: 500, easing: "easeOutQuad" });
        anime.remove(c.strawGroup.position);
        anime({ targets: c.strawGroup.position, x: 0, y: 0, z: 0, duration: 600, easing: "easeInOutCubic" });

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
        targets: lid.rotation,
        z: lidStatus === "open" ? LID_OPEN_ROT : 0,
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
    // Inverse of parent Ry(h): local = R(-h) * world
    // wx = lx*cos(h) + lz*sin(h) = -PARK_DIST  →  lx = -cos(h)*PARK_DIST - sin(h)*PARK_Z_FORWARD
    // wz = -lx*sin(h) + lz*cos(h) = PARK_Z_FORWARD → lz = -sin(h)*PARK_DIST + cos(h)*PARK_Z_FORWARD
    const getInspectWorldPos = (ndcX: number) => {
      const tempCam = new THREE.PerspectiveCamera(cam.fov, cam.aspect, cam.near, cam.far);
      tempCam.position.set(STAGE2_CAM.x, STAGE2_CAM.y, STAGE2_CAM.z);
      tempCam.lookAt(new THREE.Vector3(STAGE2_TARGET.x, STAGE2_TARGET.y, STAGE2_TARGET.z));
      tempCam.updateMatrixWorld();

      const depth = tempCam.position.distanceTo(
        new THREE.Vector3(STAGE2_TARGET.x, STAGE2_TARGET.y, STAGE2_TARGET.z),
      );
      const ndc = new THREE.Vector3(ndcX, 0, 0.5);
      ndc.unproject(tempCam);
      const dir = ndc.sub(tempCam.position).normalize();
      return tempCam.position.clone().add(dir.multiplyScalar(depth));
    };
    const inspectOverride = inspectOverrideRef.current;
    const fixedInspectPos = { ...inspectOverride.pos };
    const fixedInspectRot = {
      x: inspectOverride.rotDeg.x * Math.PI / 180,
      y: inspectOverride.rotDeg.y * Math.PI / 180,
      z: inspectOverride.rotDeg.z * Math.PI / 180,
    };
    const tankInspectPos = getInspectWorldPos(0.5).add(new THREE.Vector3(0, -1.5, -3.5));

    // ---------- STAGE: extracted ----------
    if (viewStage === "extracted") {
      if (!animeReady || !anime) {
        grp.rotation.y = targetGroupRot;
        lid.rotation.z = LID_OPEN_ROT;
        if (can.group.parent !== scene) {
          scene.attach(can.group);
        }
        can.group.position.set(fixedInspectPos.x, fixedInspectPos.y, fixedInspectPos.z);
        can.group.rotation.set(fixedInspectRot.x, fixedInspectRot.y, fixedInspectRot.z);
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
      anime.remove(lid.rotation);
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
        // Reset canister to fixed inspection tilt
        anime.remove(can.group.rotation);
        anime({
          targets: can.group.rotation,
          x: fixedInspectRot.x,
          y: fixedInspectRot.y,
          z: fixedInspectRot.z,
          duration: 700,
          easing: "easeInOutCubic",
        });
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

      // 2) Lid swings open 90°
      anime({
        targets: lid.rotation,
        z: LID_OPEN_ROT,
        duration: 1100,
        easing: "easeOutQuart",
        delay: 600,
      });

      // 3) Canister rises out, then arcs to park position (world-space)
      const startWorld = new THREE.Vector3();
      can.group.getWorldPosition(startWorld);
      if (can.group.parent !== scene) {
        scene.attach(can.group);
        can.group.rotation.y = ((can.group.rotation.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      }
      anime({
        targets: can.group.position,
        keyframes: [
          { x: startWorld.x, y: LIFT_Y, z: startWorld.z, duration: 1100 },
          { x: fixedInspectPos.x, y: fixedInspectPos.y + 0.4, z: fixedInspectPos.z, duration: 900 },
          { x: fixedInspectPos.x, y: fixedInspectPos.y, z: fixedInspectPos.z, duration: 500 },
        ],
        easing: "easeInOutCubic",
        delay: 1500,
      });

      // Tilt canister to fixed inspection angle.
      anime.remove(can.group.rotation);
      anime({
        targets: can.group.rotation,
        x: fixedInspectRot.x,
        y: fixedInspectRot.y,
        z: fixedInspectRot.z,
        duration: 900,
        easing: "easeOutBack",
        delay: 2800,
      });

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
        x: fixedInspectPos.x,
        y: fixedInspectPos.y + 1.2,
        z: fixedInspectPos.z,
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
      can.handleGroup.visible = false;

      // Return any other canister that was previously extracted to its home position
      cans.forEach((c, ci) => {
        if (ci === selectedCanister) return;
        if (c.group.parent !== grp) {
          grp.attach(c.group);
          c.group.rotation.set(0, 0, 0);
          c.handleGroup.visible = true;
          // Stop orbit and return straws
          anime.remove(c.strawGroup.rotation);
          anime.remove(c.strawGroup.position);
          anime({ targets: c.strawGroup.rotation, y: 0, duration: 500, easing: "easeOutQuad" });
          anime({ targets: c.strawGroup.position, x: 0, y: 0, z: 0, duration: 600, easing: "easeInOutCubic" });
          c.strawSubgroups.forEach((s) => {
            if (s.group.parent !== c.strawGroup) c.strawGroup.add(s.group);
            anime.remove(s.group.position);
            anime.remove(s.group.rotation);
            anime({ targets: s.group.position, x: s.homeLocalPos.x, y: s.homeLocalPos.y, z: s.homeLocalPos.z, duration: 600, easing: "easeInOutCubic" });
            anime({ targets: s.group.rotation, x: 0, y: 0, z: 0, duration: 500, easing: "easeInOutCubic" });
          });
          // Lift → arc to ring → drop (mirrors the return-to-idle animation)
          const retX = c.group.position.x;
          const retZ = c.group.position.z;
          anime.remove(c.group.position);
          anime.remove(c.group.rotation);
          anime({
            targets: c.group.position,
            keyframes: [
              { x: retX, y: LIFT_Y, z: retZ, duration: 700 },
              { x: Math.cos(c.homeAngle) * CAN_RING_R, y: LIFT_Y, z: Math.sin(c.homeAngle) * CAN_RING_R, duration: 700 },
              { x: c.homePos.x, y: c.homePos.y, z: c.homePos.z, duration: 800 },
            ],
            easing: "easeInOutCubic",
          });
          anime({ targets: c.group.rotation, x: 0, y: 0, z: 0, duration: 700, easing: "easeInOutCubic" });
          anime.remove(c.handleMat);
          anime({ targets: c.handleMat, opacity: 1, duration: 600, easing: "easeOutQuad", delay: 200 });
        }
      });

      // Detect if canister is still inside the tank (coming directly from idle)
      const comingFromIdle =
        can.group.position.y < PARK_Y + 0.5 &&
        !can.strawSubgroups.some((s) => s.group.position.distanceTo(s.homeLocalPos) > 0.1);

      const visibleSubs = can.strawSubgroups.filter((s) => s.group.visible);
      const N = visibleSubs.length || 1;

      if (!animeReady || !anime) {
        // Fallback: position canister at park, open lid, place canes in orbit
        grp.rotation.set(6 * Math.PI / 180, 0, 0);
        grp.position.set(tankInspectPos.x, tankInspectPos.y, tankInspectPos.z);
        lid.rotation.z = LID_OPEN_ROT;
        if (can.group.parent !== scene) {
          scene.attach(can.group);
        }
        can.group.position.set(fixedInspectPos.x, fixedInspectPos.y, fixedInspectPos.z);
        can.group.rotation.set(fixedInspectRot.x, fixedInspectRot.y, fixedInspectRot.z);
        can.strawGroup.position.set(0, ORBIT_Y_LIFT, 0);
        visibleSubs.forEach((s, i) => {
          const angle = (i / N) * Math.PI * 2;
          s.group.position.set(ORBIT_R * Math.cos(angle), 0, ORBIT_R * Math.sin(angle));
          s.group.rotation.set(0, angle, 0);
        });
        cam.position.set(STAGE2_CAM.x, STAGE2_CAM.y, STAGE2_CAM.z);
        target.set(STAGE2_TARGET.x, STAGE2_TARGET.y, STAGE2_TARGET.z);
        interior.intensity = 1.5;
        inspectionReadyRef.current = true;
        setInspectionReady(true);
        return;
      }

      anime.remove(cam.position);
      anime.remove(target);
      anime.remove(interior);
      anime.remove(interior.position);
      anime.remove(grp.position);

      // Extraction delay: if coming from idle, run the full extraction sequence first
      // Canister finishes parking at: delay 1500 + 1100 + 900 + 500 = 4000ms
      const EXTRACT_DELAY = comingFromIdle ? 4300 : 0;

      // Shift tank group to inspection world position
      anime({ targets: grp.position, x: tankInspectPos.x, y: tankInspectPos.y, z: tankInspectPos.z, duration: 1200, easing: "easeInOutCubic", delay: EXTRACT_DELAY });
      anime.remove(grp.rotation);
      anime({
        targets: grp.rotation,
        x: 6 * Math.PI / 180,
        y: 0,
        z: 0,
        duration: 800,
        easing: "easeInOutCubic",
        delay: EXTRACT_DELAY,
      });

      if (comingFromIdle) {
        anime.remove(grp.rotation);
        anime.remove(lid.rotation);
        anime.remove(can.group.position);

        // 1) Lid swings open 90°
        anime({ targets: lid.rotation, z: LID_OPEN_ROT, duration: 1100, easing: "easeOutQuart", delay: 600 });

        // 2) Canister rises out, then arcs to LEFT park position (world-space)
        const startWorld = new THREE.Vector3();
        can.group.getWorldPosition(startWorld);
        if (can.group.parent !== scene) {
          scene.attach(can.group);
          // Normalize accumulated Y to [0, 2π) so the upcoming tilt animation
          // travels ≤ π — no spinning, no visual snap during the rise.
          can.group.rotation.x = 0;
          can.group.rotation.z = 0;
          can.group.rotation.y = ((can.group.rotation.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        }
        anime({
          targets: can.group.position,
          keyframes: [
            { x: startWorld.x, y: LIFT_Y, z: startWorld.z, duration: 1100 },
            { x: fixedInspectPos.x, y: fixedInspectPos.y + 0.4, z: fixedInspectPos.z, duration: 900 },
            { x: fixedInspectPos.x, y: fixedInspectPos.y, z: fixedInspectPos.z, duration: 500 },
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
            { x: -0.5, y: 0.5, z: 1.5, duration: 1100 },
            { x: STAGE1_TARGET.x, y: STAGE1_TARGET.y, z: STAGE1_TARGET.z, duration: 1500 },
          ],
          easing: "easeInOutCubic",
          delay: 1700,
        });

        // Tilt so opening faces camera.
        anime.remove(can.group.rotation);
        anime({
          targets: can.group.rotation,
          x: fixedInspectRot.x,
          y: fixedInspectRot.y,
          z: fixedInspectRot.z,
          duration: 900,
          easing: "easeInOutCubic",
          delay: 2800,
        });
      }

      if (!comingFromIdle) {
        if (can.group.parent !== scene) {
          scene.attach(can.group);
          can.group.rotation.x = 0;
          can.group.rotation.z = 0;
          can.group.rotation.y = ((can.group.rotation.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        }
        anime.remove(can.group.position);
        anime({
          targets: can.group.position,
          x: -5.45,
          y: 0.75,
          z: 4.8,
          duration: 700,
          easing: "easeInOutCubic",
        });
        anime.remove(can.group.rotation);
        anime({
          targets: can.group.rotation,
          x: fixedInspectRot.x,
          y: fixedInspectRot.y,
          z: fixedInspectRot.z,
          duration: 700,
          easing: "easeInOutCubic",
        });
      }

      // 2) Lift strawGroup toward canister opening and animate canes to orbit positions
      anime.remove(can.strawGroup.position);
      anime({ targets: can.strawGroup.position, x: 0, y: ORBIT_Y_LIFT, z: 0, duration: 900, easing: "easeInOutCubic", delay: EXTRACT_DELAY + 400 });
      visibleSubs.forEach((s, i) => {
        const angle = (i / N) * Math.PI * 2;
        s.group.userData['orbitAngle'] = angle; // saved for pop-out and hover
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

      // 3) Camera shifts to stage 2 framing (comingFromIdle handles its own camera sweep above)
      if (!comingFromIdle) {
        anime({ targets: cam.position, x: STAGE2_CAM.x, y: STAGE2_CAM.y, z: STAGE2_CAM.z, duration: 1400, easing: "easeInOutCubic" });
        anime({ targets: target, x: STAGE2_TARGET.x, y: STAGE2_TARGET.y, z: STAGE2_TARGET.z, duration: 1400, easing: "easeInOutCubic" });
      }

      // 4) Light moves to illuminate canister area (LEFT side)
      anime({ targets: interior.position, x: fixedInspectPos.x, y: fixedInspectPos.y + 1.0, z: fixedInspectPos.z, duration: 1400, easing: "easeInOutCubic", delay: EXTRACT_DELAY + 800 });
      anime({ targets: interior, intensity: 1.5, duration: 1200, easing: "easeOutQuad", delay: EXTRACT_DELAY + 800 });

      // 5) After orbit animation settles, enable inspection ready
      const readyDelay = EXTRACT_DELAY + 400 + (N - 1) * 80 + 1200;
      const selCanSnap = selectedCanister;
      setTimeout(() => {
        if (viewStageRef.current === "inspecting" && selectedCanisterRef.current === selCanSnap) {
          inspectionReadyRef.current = true;
          setInspectionReady(true);
          // Fan canes outward using the same orbit angles assigned in step 2
          const POP_R = ORBIT_R * 3.5;
          visibleSubs.forEach((s, i) => {
            const angle = s.group.userData['orbitAngle'] as number;
            anime.remove(s.group.position);
            anime({
              targets: s.group.position,
              x: POP_R * Math.cos(angle),
              y: 0,
              z: POP_R * Math.sin(angle),
              duration: 550,
              easing: "easeOutBack",
              delay: i * 40,
            });
          });
        }
      }, readyDelay);
    }
  }, [selectedCanister, viewStage, animeReady, lidStatus]);

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

  // (Pop-out on hover removed — canes stay at orbit radius regardless of hover)

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
      tooltipWorldPosRef.current = null;
      return;
    }
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
      tooltipWorldPosRef.current = worldPos.clone();
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

  // ---------- Project tank + canister world positions to canvas pixels for labels ----------
  useEffect(() => {
    if (!inspectionReady || selectedCanister === null) {
      setTankLabelPos(null);
      setCanLabelPos(null);
      return;
    }

    const compute = () => {
      const cam = cameraRef.current;
      const mount = mountRef.current;
      const grp = sceneGroupRef.current;
      const cans = canistersRef.current;
      if (!cam || !mount || !grp || !cans.length) return;
      const can = cans[selectedCanister];
      if (!can) return;

      const rect = mount.getBoundingClientRect();
      const project = (worldPos: THREE.Vector3) => {
        const ndc = worldPos.clone().project(cam);
        return { x: ((ndc.x + 1) / 2) * rect.width, y: ((-ndc.y + 1) / 2) * rect.height };
      };

      const tankWorld = new THREE.Vector3();
      grp.getWorldPosition(tankWorld);
      tankWorld.y -= 2.5;
      setTankLabelPos(project(tankWorld));

      const canWorld = new THREE.Vector3();
      can.group.getWorldPosition(canWorld);
      canWorld.y -= 1.0;
      setCanLabelPos(project(canWorld));
    };

    compute();

    const mount = mountRef.current;
    if (!mount) return;
    const ro = new ResizeObserver(compute);
    ro.observe(mount);
    return () => ro.disconnect();
  }, [inspectionReady, selectedCanister]);

  // ---------- Reproject cane tooltip on canvas resize ----------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const ro = new ResizeObserver(() => {
      const wp = tooltipWorldPosRef.current;
      const cam = cameraRef.current;
      if (!wp || !cam) return;
      const rect = mount.getBoundingClientRect();
      const ndc = wp.clone().project(cam);
      const x = ((ndc.x + 1) / 2) * rect.width;
      const y = ((-ndc.y + 1) / 2) * rect.height;
      setCanvasTooltip((prev) => (prev ? { ...prev, x, y } : null));
    });
    ro.observe(mount);
    return () => ro.disconnect();
  }, []);

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

  useEffect(() => {
    const rimMat = ln2RimMatRef.current;
    const thresholdRing = ln2ThresholdRingRef.current;
    if (!rimMat) return;

    const ln2CapacitySpan =
      tankMaxCapacity != null && tankMinCapacity != null
        ? tankMaxCapacity - tankMinCapacity
        : null;

    // No threshold configured — hide the ring.
    if (ln2L2Threshold == null || ln2CapacitySpan == null || ln2CapacitySpan <= 0) {
      rimMat.opacity = 0;
      rimMat.needsUpdate = true;
      return;
    }

    // Convert raw threshold to percentage of the LN2-fillable range and clamp.
    const thresholdPercent = Math.max(0, Math.min(100, (ln2L2Threshold / ln2CapacitySpan) * 100));

    // Position the ring at the threshold height within MAX_LN2_HEIGHT.
    if (thresholdRing) {
      thresholdRing.position.y = -TANK_HEIGHT / 2 + LN2_BOTTOM_MARGIN + MAX_LN2_HEIGHT * (thresholdPercent / 100);
    }

    // Colour: green when current fill is at or above threshold, amber when below.
    const ln2Clamped = typeof ln2Level === "number" ? Math.max(0, Math.min(100, ln2Level)) : null;
    const isOk = ln2Clamped == null ? true : ln2Clamped >= thresholdPercent;
    rimMat.color.set(isOk ? "#22c55e" : "#f59e0b");
    rimMat.opacity = 0.7;
    rimMat.needsUpdate = true;

    // Position the label once — deferred until the intro camera animation finishes
    // so the camera is at its final idle position when we project.
    if (sceneReady) {
      const labelEl = l2LabelRef.current;
      const cam = cameraRef.current;
      const mount = mountRef.current;
      if (labelEl && cam && mount) {
        const thresholdY = -TANK_HEIGHT / 2 + LN2_BOTTOM_MARGIN + MAX_LN2_HEIGHT * (thresholdPercent / 100);
        const pt = new THREE.Vector3(TANK_RADIUS * 1.12, thresholdY, 0);
        cam.updateMatrixWorld();
        pt.project(cam);
        const rect = mount.getBoundingClientRect();
        labelEl.style.left = `${((pt.x + 1) / 2) * rect.width}px`;
        labelEl.style.top = `${((-pt.y + 1) / 2) * rect.height}px`;
      }
    }
  }, [ln2Level, tankMaxCapacity, tankMinCapacity, ln2L2Threshold, sceneReady]);

  // ---------- Derived state for status ----------
  const status =
    fill >= 60
      ? { label: "Optimal", color: "#1f7a3a", dot: "#27a04a" }
      : fill >= 30
        ? { label: "Monitor", color: "#a8751a", dot: "#d49220" }
        : { label: "Refill Required", color: "#a82020", dot: "#d43030" };

  const isEmbedded = variant === "embedded";
  const effectiveCanisters =
    canisters ?? DEFAULT_CANISTERS;
  const effectiveContents =
    canisterContents ?? (isEmbedded ? {} : DEFAULT_CONTENTS);
  const sceneCanisterCount = CAN_COUNT;
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
  const canisterHasContents = visibleCanisters.map(
    (c) => (effectiveContents[c.id]?.length ?? c.sampleCount ?? 0) > 0,
  );

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));
  const canvasRect = mountRef.current?.getBoundingClientRect();
  const tooltipPad = 8;
  const canvasTooltipDims = { width: 220, height: 140, arrow: 12 };
  const canvasTooltipOffset = 14;
  const canvasTooltipSide = canvasTooltip && canvasRect
    ? ((canvasTooltip.x + canvasTooltipDims.width + canvasTooltipOffset + tooltipPad) <= canvasRect.width
        ? "right"
        : (canvasTooltip.x - canvasTooltipDims.width - canvasTooltipOffset - tooltipPad >= 0
            ? "left"
            : "right"))
    : "right";
  const canvasTooltipPos = canvasTooltip && canvasRect
    ? {
        left: clamp(
          canvasTooltipSide === "right"
            ? canvasTooltip.x + canvasTooltipOffset
            : canvasTooltip.x - canvasTooltipDims.width - canvasTooltipOffset,
          tooltipPad,
          canvasRect.width - canvasTooltipDims.width - tooltipPad,
        ),
        top: canvasTooltip.y - canvasTooltipDims.height / 2,
      }
    : null;
  const canvasTooltipTransform = canvasTooltipPos
    ? "translate(0, 0)"
    : "translate(-50%, -50%)";
  const caneTooltipPos = caneHoverCard && canvasRect
    ? {
        left: clamp(
          caneHoverCard.x + 12,
          tooltipPad,
          canvasRect.width - 160 - tooltipPad,
        ),
        top: clamp(
          caneHoverCard.y - 58,
          tooltipPad,
          canvasRect.height - 64 - tooltipPad,
        ),
      }
    : null;
  const tankLabelText = `${tankCode || "—"} · ${branchName || "—"} · LN2 ${Math.round(displayPct)}%`;
  const inspectLabelText = selectedCanisterData
    ? `${selectedCanisterData.label} · ${samplesPerCanister} samples`
    : null;

  useEffect(() => {
    setLocalContents(selectedContents);
    setEditingCryolockIdx(null);
    setEditColorValues({ gobletColor: "", cryolockColor: "" });
    setColorSaveError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCanister]);

  // Map from localContents original index → flat straw index (which may differ when items are grouped by cane)
  const localFlatIndices = (() => {
    const origByItem = new Map<StrawInfo, number>();
    localContents.forEach((item, i) => origByItem.set(item, i));
    const result = new Array(localContents.length).fill(-1);
    let flat = 0;
    Array.from(groupByCane(localContents).values()).forEach((items) => {
      items.forEach((item) => {
        const orig = origByItem.get(item);
        if (orig !== undefined) result[orig] = flat;
        flat++;
      });
    });
    return result;
  })();

  const showSensorTiles = sensorTiles.length > 0;
  const showSidebar = !hideSidebar;
  const isInspecting = viewStage === "inspecting";
  const isNarrow = containerWidth < 1450;
  const isRightNarrow = containerWidth < 1230;

  useEffect(() => {
    const cans = canistersRef.current;
    if (!cans.length) return;
    sceneCanisterCountRef.current = sceneCanisterCount;
    cans.forEach((can, idx) => {
      can.group.visible = idx < sceneCanisterCount;
    });
  }, [sceneCanisterCount]);

  useEffect(() => {
    canisterHasContentsRef.current = canisterHasContents;
  }, [canisterHasContents]);

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
            position: "relative",
            display: "grid",
            gridTemplateColumns:
              showSensorTiles && showSidebar && !isNarrow && !isRightNarrow
                ? "280px minmax(0, 1fr) 300px"
                : showSensorTiles && !isNarrow
                  ? "280px minmax(0, 1fr)"
                  : showSidebar && !isRightNarrow
                    ? "minmax(0, 1fr) 300px"
                    : "minmax(0, 1fr)",
            gap: isEmbedded ? 16 : 18,
            alignItems: "stretch",
            transition: "grid-template-columns 0.35s ease",
          }}
        >
          {/* Left overlay toggle — visible only below 1450 px */}
          {showSensorTiles && isNarrow && !rightOpen && (
            <button
              id="onboarding-cryo-left-toggle"
              type="button"
              onClick={() => { setLeftOpen(p => { if (!p) setRightOpen(false); return !p; }); }}
              style={{
                position:    "absolute",
                bottom:      20,
                left:        leftOpen ? 288 : 10,
                transform:   "translateX(0)",
                zIndex:      25,
                display:     "flex",
                flexDirection: "row",
                alignItems:  "center",
                justifyContent: "center",
                gap:         5,
                width:       "auto",
                padding:     "5px 10px",
                borderRadius: 10,
                border:      "1px solid #d8c6e8",
                background:  "#fff",
                cursor:      "pointer",
                boxShadow:   "0 2px 8px #40115318",
                color:       "#6b1176",
                transition:  "left 0.3s cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              <svg
                width="11" height="11" viewBox="0 0 24 24"
                fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{
                  transform:  leftOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.3s ease",
                }}
              >
                <path d="m9 18 6-6-6-6"/>
              </svg>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                {leftOpen
                  ? (isInspecting && selectedCanisterData ? `Hide ${selectedCanisterData.label}` : "Hide Conditions")
                  : (isInspecting && selectedCanisterData ? selectedCanisterData.label : "Live Conditions")}
              </span>
            </button>
          )}

          {/* Right overlay toggle — visible only below 1230 px */}
          {showSidebar && isRightNarrow && !leftOpen && (
            <button
              id="onboarding-cryo-right-toggle"
              type="button"
              onClick={() => { setRightOpen(p => { if (!p) setLeftOpen(false); return !p; }); }}
              style={{
                position:    "absolute",
                bottom:      20,
                right:       rightOpen ? 288 : 10,
                zIndex:      25,
                display:     "flex",
                flexDirection: "row",
                alignItems:  "center",
                justifyContent: "center",
                gap:         5,
                width:       "auto",
                padding:     "5px 10px",
                borderRadius: 10,
                border:      "1px solid #d8c6e8",
                background:  "#fff",
                cursor:      "pointer",
                boxShadow:   "0 2px 8px #40115318",
                color:       "#6b1176",
                transition:  "right 0.3s cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              <svg
                width="11" height="11" viewBox="0 0 24 24"
                fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{
                  transform:  rightOpen ? "rotate(0deg)" : "rotate(180deg)",
                  transition: "transform 0.3s ease",
                }}
              >
                <path d="m9 18 6-6-6-6"/>
              </svg>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                {rightOpen ? "Hide Activity" : "Activity"}
              </span>
            </button>
          )}

          {/* Left column — normal grid child above 1450 px, slide-in overlay below */}
          {showSensorTiles && (
            <div
              style={isNarrow ? {
                position:   "absolute",
                top:        0,
                left:       0,
                height:     "100%",
                zIndex:     20,
                transform:  leftOpen ? "translateX(0)" : "translateX(-290px)",
                transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
                boxShadow:  leftOpen ? "4px 0 20px #40115322" : "none",
              } : {
                overflow: "hidden",
              }}
            >

            <div style={{ position: "relative", width: 280, height: isEmbedded ? 520 : 620 }}>
              {/* Inspection panel: canister details + cryolock cards */}
              <div
                className="cryo-fade-in bg-white flex flex-col"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: 280,
                  height: isEmbedded ? 520 : 620,
                  border: "1px solid #e6d6ee",
                  borderRadius: 18,
                  boxShadow: "0 6px 16px #40115308",
                  overflow: "hidden",
                  opacity: isInspecting && inspectionReady ? 1 : 0,
                  transform: isInspecting && inspectionReady ? "translateY(0)" : "translateY(10px)",
                  pointerEvents: isInspecting && inspectionReady ? "auto" : "none",
                  transition: "opacity 0.35s ease, transform 0.35s ease",
                }}
              >
                {/* Header with Return button */}
                <div style={{ padding: "12px 14px 10px", background: "#f7f2fa", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #efe5f4" }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: "#8b6c97", letterSpacing: "0.1em", textTransform: "uppercase" }}>Selected</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#5f3b73" }}>{selectedCanisterData?.label ?? "Selected"}</div>
                  </div>
                  <button
                    onClick={() => { setSelectedCanister(null); setViewStage("idle"); }}
                    title="Return canister"
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d9c9e6", background: "#ffffff", color: "#6b4a78", cursor: "pointer", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                    Return
                  </button>
                </div>
                {/* Slot availability */}
                <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #f0e8f4", flexShrink: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-primary)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 7 }}>Cane Slots</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 6 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "var(--color-primary)", lineHeight: 1 }}>{loadedCaneCount}</span>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>/ 17 slots</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
                    {Array.from({ length: 17 }).map((_, si) => (
                      <div
                        key={si}
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 3,
                          background: si < loadedCaneCount ? "#dcfce7" : "#fee2e2",
                          border: `1px solid ${si < loadedCaneCount ? "#86efac" : "#fca5a5"}`,
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 5 }}>{17 - loadedCaneCount} slots available</div>
                </div>
                {/* Save error */}
                {colorSaveError && (
                  <div style={{ padding: "6px 14px", background: "#fef2f2", color: "#dc2626", fontSize: 10, borderBottom: "1px solid #fee2e2", flexShrink: 0 }}>
                    {colorSaveError}
                  </div>
                )}
                {/* Scrollable cryolock list */}
                <div style={{ padding: "6px 10px 2px", flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.03em" }}>Click a cane to inspect it on the canvas</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {localContents.length === 0 ? (
                    <div style={{ color: "#9ca3af", fontSize: 11, textAlign: "center", marginTop: 20 }}>No contents recorded</div>
                  ) : (
                    localContents.map((item, ci) => {
                      const parts = item.cryolockNumber?.split("/") ?? [];
                      const caneId = parts[2] ?? null;
                      const lockId = parts[3] ?? null;
                      const gobletHex = GOBLET_COLOR_MAP[item.gobletColor?.toLowerCase() ?? ""] ?? null;
                      const lockHex   = GOBLET_COLOR_MAP[item.cryolockColor?.toLowerCase() ?? ""] ?? null;
                      const isEditing = editingCryolockIdx === ci;
                      return (
                        <div
                          key={ci}
                          className={`cryo-lock-card${isEditing ? " cryo-lock-card--editing" : ""}`}
                          onClick={() => { if (!isEditing) { const fi = localFlatIndices[ci]; if (fi >= 0) setSelectedStraw((prev) => prev === fi ? null : fi); } }}
                          style={{ border: selectedStraw === localFlatIndices[ci] ? "1px solid var(--color-primary)" : "1px solid #ede5f5", borderRadius: 12, background: selectedStraw === localFlatIndices[ci] ? "#fdf4ff" : "#fdfbfe", cursor: isEditing ? "default" : "pointer" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 9px 5px", borderBottom: "1px solid #f0e8f4" }}>
                            {gobletHex && <div style={{ width: 10, height: 10, borderRadius: 2, background: gobletHex, flexShrink: 0 }} />}
                            <span className="cryo-mono" style={{ fontSize: 10, fontWeight: 700, color: "#401153", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.cryolockNumber || item.id || `Sample ${ci + 1}`}
                            </span>
                            {!isEditing ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingCryolockIdx(ci); setEditColorValues({ gobletColor: item.gobletColor ?? "", cryolockColor: item.cryolockColor ?? "" }); }}
                                style={{ padding: "3px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#f9f5fc", cursor: "pointer", color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                                title="Edit colors"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            ) : (
                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  disabled={colorSaving}
                                  onClick={async () => {
                                    if (!tankId) return;
                                    setColorSaving(true);
                                    setColorSaveError(null);
                                    try {
                                      const ps: Promise<any>[] = [];
                                      if (editColorValues.gobletColor !== (item.gobletColor ?? "") && editColorValues.gobletColor.trim() && item.cryolockNumber)
                                        ps.push(ivfService.updateGobletColor(tankId, item.cryolockNumber.trim(), editColorValues.gobletColor.trim()));
                                      if (editColorValues.cryolockColor !== (item.cryolockColor ?? "") && editColorValues.cryolockColor.trim() && item.cryolockNumber)
                                        ps.push(ivfService.updateCryolockColor(tankId, item.cryolockNumber.trim(), editColorValues.cryolockColor.trim()));
                                      await Promise.all(ps);
                                      setLocalContents((prev) => prev.map((x, j) => j !== ci ? x : { ...x, gobletColor: editColorValues.gobletColor || x.gobletColor, cryolockColor: editColorValues.cryolockColor || x.cryolockColor }));
                                      setEditingCryolockIdx(null);
                                    } catch (e: any) {
                                      setColorSaveError(e?.message || "Save failed");
                                    } finally {
                                      setColorSaving(false);
                                    }
                                  }}
                                  style={{ padding: "3px", borderRadius: 6, border: "1px solid #6B117650", background: "#f0e6ff", cursor: colorSaving ? "not-allowed" : "pointer", color: "var(--color-primary)", display: "flex", alignItems: "center", justifyContent: "center", opacity: colorSaving ? 0.5 : 1 }}
                                  title="Save"
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </button>
                                <button
                                  onClick={() => { setEditingCryolockIdx(null); setColorSaveError(null); }}
                                  style={{ padding: "3px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#f9f5fc", cursor: "pointer", color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center" }}
                                  title="Discard"
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              </div>
                            )}
                          </div>
                          <div style={{ padding: "6px 9px 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 10 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 7px", alignContent: "start" }}>
                              {caneId && <><span style={{ color: "#9ca3af" }}>Cane</span><span style={{ color: "#1a0a1f", fontWeight: 600 }}>{caneId}</span></>}
                              {lockId && <><span style={{ color: "#9ca3af" }}>Lock #</span><span style={{ color: "#1a0a1f", fontWeight: 600 }}>{lockId}</span></>}
                              {item.hisNumber && <><span style={{ color: "#9ca3af" }}>HIS</span><span style={{ color: "#1a0a1f" }}>{item.hisNumber}</span></>}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 7px", alignContent: "start", minWidth: 0 }}>
                              <span style={{ color: "#9ca3af" }}>Goblet</span>
                              {isEditing ? (
                                <input value={editColorValues.gobletColor} onChange={(e) => setEditColorValues((v) => ({ ...v, gobletColor: e.target.value }))} style={{ fontSize: 10, border: "1px solid #c8a8dc", borderRadius: 4, padding: "1px 5px", outline: "none", color: "#1a0a1f", width: "100%", minWidth: 0, boxSizing: "border-box" }} placeholder="e.g. Red" />
                              ) : (
                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  {gobletHex && <span style={{ width: 8, height: 8, borderRadius: 2, background: gobletHex, display: "inline-block", flexShrink: 0 }} />}
                                  <span style={{ color: "#1a0a1f", textTransform: "capitalize" }}>{item.gobletColor || "—"}</span>
                                </span>
                              )}
                              <span style={{ color: "#9ca3af" }}>Lock</span>
                              {isEditing ? (
                                <input value={editColorValues.cryolockColor} onChange={(e) => setEditColorValues((v) => ({ ...v, cryolockColor: e.target.value }))} style={{ fontSize: 10, border: "1px solid #c8a8dc", borderRadius: 4, padding: "1px 5px", outline: "none", color: "#1a0a1f", width: "100%", minWidth: 0, boxSizing: "border-box" }} placeholder="e.g. Blue" />
                              ) : (
                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  {lockHex && <span style={{ width: 8, height: 8, borderRadius: 2, background: lockHex, display: "inline-block", flexShrink: 0 }} />}
                                  <span style={{ color: "#1a0a1f", textTransform: "capitalize" }}>{item.cryolockColor || "—"}</span>
                                </span>
                              )}
                              {item.vitrificationDate && <><span style={{ color: "#9ca3af" }}>Vitrified</span><span style={{ color: "#1a0a1f" }}>{item.vitrificationDate}</span></>}
                            </div>
                            {item.description && (
                              <span style={{ gridColumn: "1 / -1", marginTop: 3, color: "#6b5a70", fontStyle: "italic", fontSize: 10, lineHeight: 1.4, borderTop: "1px solid #f0e8f4", paddingTop: 3 }}>
                                {item.description}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              {/* Live Conditions card — shown when not inspecting */}
              <div
                id="onboarding-cryo-live-conditions"
                className="cryo-fade-in bg-white flex flex-col"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: 280,
                  height: isEmbedded ? 520 : 620,
                  border: "1px solid #e6d6ee",
                  borderRadius: 18,
                  boxShadow: "0 6px 16px #40115308",
                  overflow: "hidden",
                  opacity: isInspecting ? 0 : 1,
                  transform: isInspecting ? "translateY(-10px)" : "translateY(0)",
                  pointerEvents: isInspecting ? "none" : "auto",
                  transition: "opacity 0.35s ease, transform 0.35s ease",
                }}
              >
              {/* Card header */}
              <div
                className="flex items-center justify-between"
                style={{
                  padding: "14px 16px 10px",
                  background: "#f7f2fa",
                  flexShrink: 0,
                  borderBottom: "1px solid #efe5f4",
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "#5f3b73", display: "block" }}>
                    Live Conditions
                  </span>
                  <span style={{ fontSize: 10, color: "#a07ab8", marginTop: 1, display: "block" }}>
                    Click a tile to view the trend graph
                  </span>
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6b4a78"
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
                  const isMuted = tile.isMissing || tile.isMuted;
                  const icon = SENSOR_ICONS[tile.id];
                  const palette = KPI_CARD_STYLES[tile.id];
                  const accent = isMuted
                    ? "#c9b8d2"
                    : palette?.accent ?? (isActive ? "var(--color-primary)" : "#7b5c8b");
                  const ring = palette?.ring ?? "rgba(123,92,139,0.08)";
                  const border = "#e6d6ee";
                  const ln2Clamped = typeof ln2Level === "number" ? Math.max(0, Math.min(100, ln2Level)) : null;
                  const valueText =
                    tile.id === "ln2_level"
                      ? (ln2Clamped != null ? `${ln2Clamped}%` : tile.value)
                      : tile.value;
                  return (
                    <button
                      key={tile.id}
                      id={`onboarding-cryo-tile-${tile.id}`}
                      type="button"
                      onClick={() => onSensorSelect && onSensorSelect(tile.id)}
                      className="text-left kpi-card group"
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
                          <div className="cryo-display" style={{ fontSize: 24, fontWeight: 700, color: isMuted ? "#b4a9be" : "var(--color-primary)", marginTop: 4 }}>
                            {valueText}
                          </div>
                          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                            {tile.timestamp ?? "All time"}
                          </div>
                        </div>
                        <div
                          style={{
                            width: 46,
                            height: 46,
                            borderRadius: "50%",
                            background: "rgba(255,255,255,0.8)",
                            border: `1px solid ${border}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: `inset 0 0 0 6px ${ring}`,
                            color: accent,
                            flexShrink: 0,
                          }}
                        >
                          <span style={{ display: "inline-flex", transform: "translateY(1px)" }}>{icon}</span>
                        </div>
                      </div>
                      <div
                        className="kpi-orb"
                        style={{
                          position: "absolute",
                          right: -20,
                          bottom: -18,
                          width: 140,
                          height: 70,
                          borderRadius: "50%",
                          border: "1px solid rgba(170,140,190,0.35)",
                          opacity: 0.7,
                        }}
                      />
                      <div
                        className="kpi-glow"
                        style={{
                          position: "absolute",
                          left: -30,
                          top: -24,
                          width: 110,
                          height: 110,
                          borderRadius: "50%",
                          background: "radial-gradient(circle, rgba(123,92,139,0.12) 0%, rgba(123,92,139,0) 70%)",
                          opacity: 0.6,
                        }}
                      />
                      <div
                        className="kpi-sheen"
                        style={{
                          position: "absolute",
                          inset: "12px 12px auto auto",
                          width: 46,
                          height: 46,
                          borderRadius: 10,
                          border: "1px solid rgba(230,214,238,0.9)",
                          opacity: 0.45,
                          transform: "rotate(12deg)",
                        }}
                      />
                      <div
                        className="kpi-curve"
                        style={{
                          position: "absolute",
                          left: -18,
                          bottom: -22,
                          width: 160,
                          height: 90,
                          borderRadius: "100%",
                          border: "1px solid rgba(214,198,228,0.5)",
                          transform: "rotate(-8deg)",
                          opacity: 0.55,
                        }}
                      />
                      <div
                        className="kpi-wave"
                        style={{
                          position: "absolute",
                          right: -40,
                          top: 28,
                          width: 180,
                          height: 80,
                          borderRadius: "100%",
                          border: "1px dashed rgba(214,198,228,0.45)",
                          transform: "rotate(10deg)",
                          opacity: 0.5,
                        }}
                      />
                      <div
                        className="opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-out"
                        style={{
                          position: "absolute",
                          right: 0,
                          bottom: 0,
                          zIndex: 2,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "5px 10px 5px 8px",
                          borderTopLeftRadius: 12,
                          borderBottomRightRadius: 16,
                          background: "var(--color-primary)",
                          color: "#fff",
                          boxShadow: "0 2px 8px rgba(64,17,83,0.3)",
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M7 7h10v10" />
                          <path d="M7 17 17 7" />
                        </svg>
                        <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" }}>View trend</span>
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
            </div>
          )}

          {/* 3D canvas column */}
          <div
            id="onboarding-cryo-canvas"
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
                transition: "background 0.6s ease, border-color 0.6s ease, width 0.35s ease",
            }}
          >
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
              <div className="flex" style={{ gap: 8, pointerEvents: "auto" }} />
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


            {/* L2 threshold label — tracks the 3D ring, hidden in inspecting mode */}
            <div
              ref={l2LabelRef}
              style={{
                position: "absolute",
                left: 0,
                display: "none",
                alignItems: "center",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                zIndex: 4,
                gap: 0,
              }}
            >
              <div
                data-l2-line
                style={{
                  width: 22,
                  height: 1.5,
                  background: "#f59e0b",
                  flexShrink: 0,
                }}
              />
              <div
                data-l2-arrow
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "5px solid transparent",
                  borderBottom: "5px solid transparent",
                  borderRight: "6px solid #f59e0b",
                  flexShrink: 0,
                }}
              />
              <div
                data-l2-badge
                style={{
                  background: "rgba(255,255,255,0.92)",
                  backdropFilter: "blur(8px)",
                  border: "1.5px solid #f59e0b",
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#f59e0b",
                  letterSpacing: "0.1em",
                  lineHeight: 1.5,
                  whiteSpace: "nowrap",
                  fontFamily: "Inter, system-ui, sans-serif",
                }}
              >
                L2
              </div>
            </div>

            {/* Cryolock 3D tooltip — appears above the selected cap */}
            {canvasTooltip && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: canvasTooltipPos?.left ?? canvasTooltip.x,
                  top: canvasTooltipPos?.top ?? canvasTooltip.y,
                  transform: canvasTooltipTransform,
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    position: "relative",
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
                  <div style={{ position: "absolute", top: 0, left: 12, right: 12, height: 3, borderRadius: "0 0 3px 3px", background: "linear-gradient(90deg, var(--color-primary), #9b4aaa)" }} />
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 0,
                      height: 0,
                      borderTop: "8px solid transparent",
                      borderBottom: "8px solid transparent",
                      ...(canvasTooltipSide === "right"
                        ? { left: -10, borderRight: "10px solid #c8a8dc" }
                        : { right: -10, borderLeft: "10px solid #c8a8dc" }),
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 0,
                      height: 0,
                      borderTop: "7px solid transparent",
                      borderBottom: "7px solid transparent",
                      ...(canvasTooltipSide === "right"
                        ? { left: -8, borderRight: "8px solid rgba(255,255,255,0.97)" }
                        : { right: -8, borderLeft: "8px solid rgba(255,255,255,0.97)" }),
                    }}
                  />
                  {canvasTooltip.caneCode && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-primary)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 5, marginTop: 2 }}>
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
                      <span style={{ fontSize: 10, background: "#FDF4FF", color: "var(--color-primary)", fontWeight: 600, borderRadius: 4, padding: "1px 6px" }}>
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
              </div>
            )}


            {/* LN2 scale — right of tank, clear of the 3D mesh */}
            {isInspecting && (
              <div
                style={{
                  position: "absolute",
                  left: `${dbgLn2.left}%`,
                  top: `${dbgLn2.top}%`,
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
                  <span style={{ fontSize: 9, fontWeight: 600, color: "var(--color-primary)", letterSpacing: "0.1em" }}>LN2</span>
                  <div style={{ position: "relative", width: 14, height: 140, background: "#e8ddf2", borderRadius: 8, overflow: "hidden", border: "1px solid #c8a8dc" }}>
                    <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${displayPct}%`, background: "linear-gradient(to top, #1258b8, #2888f0)", transition: "height 1s ease", borderRadius: 8 }} />
                    {[25, 50, 75].map((pct) => (
                      <div key={pct} style={{ position: "absolute", left: 0, right: 0, bottom: `${pct}%`, height: 1, background: "rgba(107,17,118,0.25)" }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-primary)" }}>{Math.round(displayPct)}%</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: 140, paddingTop: 2, paddingBottom: 2 }}>
                  {[100, 75, 50, 25, 0].map((tick) => (
                    <span key={tick} style={{ fontSize: 8, color: "#9ca3af", lineHeight: 1 }}>{tick}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Tank label — horizontally centred on tank, fixed near bottom */}
            {isInspecting && inspectionReady && (tankCode || branchName) && tankLabelPos && (
              <div
                style={{
                  position: "absolute",
                  bottom: 34,
                  left: tankLabelPos.x,
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
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1a0a1f" }}>{tankLabelText}</div>
              </div>
            )}

            {/* Canister label — horizontally centred on canister, fixed near bottom */}
            {isInspecting && inspectionReady && inspectLabelText && canLabelPos && (
              <div
                style={{
                  position: "absolute",
                  bottom: 34,
                  left: canLabelPos.x,
                  transform: "translateX(-50%)",
                  background: "rgba(255,255,255,0.88)",
                  backdropFilter: "blur(14px)",
                  border: "1px solid #d8c6e8",
                  borderRadius: 10,
                  padding: "6px 12px",
                  zIndex: 8,
                  textAlign: "center",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: "#1a0a1f" }}>{inspectLabelText}</div>
              </div>
            )}

            {/* Cane hover popup */}
            {caneHoverCard && (
              <div
                style={{
                  position: "absolute",
                  left: caneTooltipPos?.left ?? caneHoverCard.x + 12,
                  top: caneTooltipPos?.top ?? caneHoverCard.y - 48,
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
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-primary)", marginBottom: 3 }}>
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

          </div>

          {/* Info + controls column */}
          {showSidebar && (
            <div
              style={isRightNarrow ? {
                position:   "absolute",
                top:        0,
                right:      0,
                height:     "100%",
                zIndex:     20,
                transform:  rightOpen ? "translateX(0)" : "translateX(310px)",
                transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
                boxShadow:  rightOpen ? "-4px 0 20px #40115322" : "none",
              } : {
                overflow: "hidden",
              }}
            >
            <aside
              className="cryo-side-scroll flex flex-col overflow-x-hidden"
              style={{
                gap: 14,
                width: 300,
                height: isEmbedded ? 520 : 620,
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
            {/* System Activity panel */}
            <div
              id="onboarding-cryo-system-activity"
              className="cryo-fade-in bg-white"
              style={{
                flexShrink: 0,
                border: "1px solid #e6d6ee",
                borderRadius: 18,
                overflow: "hidden",
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
                  color: "#5f3b73",
                  padding: "12px 16px 10px",
                  background: "#f7f2fa",
                  flexShrink: 0,
                  borderBottom: "1px solid #efe5f4",
                }}
              >
                System Activity
              </div>
              <div
                style={{ flex: 1, overflow: "hidden", position: "relative", padding: "8px 0 0" }}
                onMouseEnter={() => setActivityScrollPaused(true)}
                onMouseLeave={() => setActivityScrollPaused(false)}
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
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      animation: `scrollActivity ${Math.max(systemActivity.length * 3, 8)}s linear infinite`,
                      animationPlayState: activityScrollPaused ? "paused" : "running",
                    }}
                  >
                  {[...systemActivity, ...systemActivity].flatMap((log, _idx) => {
                    const _key = `${log.id}-${_idx}`;
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
                    const card = (
                      <div
                        key={_key}
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
                            color: badge.color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {ACTIVITY_ICON_INNER[iconType]}
                          </svg>
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
                    const isCopyEnd = _idx === systemActivity.length - 1 || _idx === systemActivity.length * 2 - 1;
                    return isCopyEnd
                      ? [card, <div key={`gap-${_idx}`} style={{ height: 52, flexShrink: 0 }} />]
                      : [card];
                  })}
                  </div>
                )}
              </div>
            </div>

            {/* Container Data */}
            <div
              id="onboarding-cryo-container-data"
              className="cryo-fade-in bg-white"
              style={{
                flexShrink: 0,
                border: "1px solid #e6d6ee",
                borderRadius: 18,
                overflow: "hidden",
                boxShadow: "0 6px 16px #40115308",
                opacity: isEmbedded ? 1 : 0,
              }}
            >
              <div
                className="flex justify-between items-start"
                style={{ gap: 10, padding: "12px 16px 10px", background: "#f7f2fa", borderBottom: "1px solid #efe5f4" }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: "#5f3b73",
                    }}
                  >
                    Container Data
                  </div>
                  <div
                    className="cryo-display"
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "#8b6c97",
                      letterSpacing: "-0.015em",
                      marginTop: 2,
                    }}
                  >
                    {viewStage === "inspecting"
                      ? "Selected"
                      : selectedCanister !== null
                        ? "Extracted"
                        : "Click a loaded canister to inspect"}
                  </div>
                </div>
                {viewStage !== "inspecting" && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "3px 9px",
                      borderRadius: 999,
                      background: "#efe7f3",
                      color: "#6b4a78",
                    }}
                  >
                    Total {sceneCanisterCount}
                  </span>
                )}
              </div>

              <div
                className="flex flex-col"
                style={{ gap: 6, transition: "all 0.4s ease", padding: "12px 16px" }}
              >
                {visibleCanisters.map((c, i) => {
                  const isSelected = selectedCanister === i;
                  const canSampleCount =
                    c.sampleCount ?? effectiveContents[c.id]?.length ?? 0;
                  const hasContents = canSampleCount > 0;
                  const canSwitch = inspectionReady || viewStage === "idle";
                  const cursor = !isSelected && hasContents && canSwitch ? "pointer" : "default";
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        if (!isSelected && hasContents && canSwitch) {
                          setSelectedStraw(null);
                          setSelectedCanister(i);
                          setViewStage("inspecting");
                          onCanisterSelect && onCanisterSelect(c.id);
                        }
                      }}
                      className={`flex items-center cryo-canister-item${!isSelected && hasContents && canSwitch ? " cryo-canister-item--selectable" : ""}`}
                      style={{
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 12,
                        background: isSelected
                          ? "#f3e8ff"
                          : hasContents
                            ? "#ffffff"
                            : "#f8f5fa",
                        border: isSelected
                          ? "1px solid #6B1176"
                          : hasContents
                            ? "1px solid #E7E1E1"
                            : "1px solid #eee7f3",
                        boxShadow: isSelected ? "0 4px 14px #6B117620" : "none",
                        cursor,
                        opacity: hasContents || isSelected ? 1 : 0.7,
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
                            color: isSelected ? "#401153" : "#1a0a1f",
                          }}
                        >
                          {c.label}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: isSelected ? "#6b4a78" : "#6b7280",
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
                            background: "#6B1176",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            </aside>
            </div>
          )}
        </div>

        {import.meta.env.DEV && (
          <button
            onClick={() => setDebugPanelOpen(v => !v)}
            style={{
              position: "fixed", bottom: 16, right: 16, zIndex: 9999,
              width: 32, height: 32, borderRadius: 8,
              border: "1px solid rgba(107,17,118,0.5)",
              background: debugPanelOpen ? "#6B1176" : "rgba(14,6,22,0.85)",
              color: debugPanelOpen ? "#fff" : "#c084fc",
              cursor: "pointer", fontSize: 11, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(6px)",
            }}
            title="Toggle 3D debug panel"
          >D</button>
        )}

        {import.meta.env.DEV && debugPanelOpen && (
          <div className="cryo-mono" style={{
            position: "fixed", bottom: 56, right: 16, zIndex: 9998,
            background: "rgba(14,6,22,0.95)", color: "#e8d0f0",
            borderRadius: 12, padding: "12px 14px",
            fontSize: 11, width: 308,
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(107,17,118,0.4)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            maxHeight: "80vh", overflowY: "auto",
          }}>
            {/* Header + tabs */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: "#c084fc", letterSpacing: "0.05em" }}>3D DEBUG</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {(["objects", "colors"] as const).map(tab => (
                  <button key={tab} onClick={() => setDebugTab(tab)}
                    style={{ padding: "2px 7px", borderRadius: 5, border: "1px solid rgba(107,17,118,0.5)", background: debugTab === tab ? "#6B1176" : "transparent", color: debugTab === tab ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}
                  >{tab}</button>
                ))}
                <button
                  onClick={() => { const next = !debugMode; setDebugMode(next); debugModeRef.current = next; }}
                  style={{ padding: "2px 10px", borderRadius: 6, border: "1px solid rgba(107,17,118,0.5)", background: debugMode ? "#6B1176" : "transparent", color: debugMode ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em" }}
                >{debugMode ? "LIVE" : "OFF"}</button>
              </div>
            </div>

            {/* ── OBJECTS TAB ── */}
            {debugTab === "objects" && (<>
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 600, marginBottom: 4, letterSpacing: "0.1em" }}>OBJECT</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={debugSelectedName ?? ""}
                    onChange={(e) => {
                      const name = e.target.value || null;
                      setDebugSelectedName(name); debugSelectedNameRef.current = name;
                      if (name) {
                        const obj = debugRegistryRef.current.get(name);
                        if (obj) {
                          const p = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
                          const r = { x: obj.rotation.x * 180 / Math.PI, y: obj.rotation.y * 180 / Math.PI, z: obj.rotation.z * 180 / Math.PI };
                          const s = { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };
                          setDebugPos(p); setDebugRotDeg(r); setDebugScale(s);
                          debugTransformRef.current = { pos: p, rot: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }, scale: s };
                        }
                      }
                    }}
                    style={{ flex: 1, background: "rgba(255,255,255,0.07)", color: "#e8d0f0", border: "1px solid rgba(107,17,118,0.4)", borderRadius: 6, padding: "3px 6px", fontSize: 10, cursor: "pointer" }}
                  >
                    <option value="">-- select --</option>
                    {debugObjectNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button
                    onClick={() => {
                      if (!debugSelectedName) return;
                      const obj = debugRegistryRef.current.get(debugSelectedName);
                      if (!obj) return;
                      const p = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
                      const r = { x: obj.rotation.x * 180 / Math.PI, y: obj.rotation.y * 180 / Math.PI, z: obj.rotation.z * 180 / Math.PI };
                      const s = { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };
                      setDebugPos(p); setDebugRotDeg(r); setDebugScale(s);
                      debugTransformRef.current = { pos: p, rot: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }, scale: s };
                    }}
                    style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(107,17,118,0.4)", background: "rgba(107,17,118,0.2)", color: "#c084fc", cursor: "pointer", fontSize: 10, fontWeight: 700 }}
                  >SYNC</button>
                </div>
              </div>
              {(["POSITION", "ROTATION (deg)", "SCALE"] as const).map((section) => (
                <div key={section} style={{ marginBottom: 8 }}>
                  <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 600, marginBottom: 4, letterSpacing: "0.1em" }}>{section}</div>
                  {(["x", "y", "z"] as const).map((axis) => {
                    const color = axis === "x" ? "#f87171" : axis === "y" ? "#4ade80" : "#60a5fa";
                    const isPos = section === "POSITION", isScale = section === "SCALE";
                    const val = isPos ? debugPos[axis] : isScale ? debugScale[axis] : debugRotDeg[axis];
                    return (
                      <div key={axis} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ width: 10, color, fontWeight: 700 }}>{axis.toUpperCase()}</span>
                        <input type="range"
                          min={isPos ? -20 : isScale ? 0.05 : -180}
                          max={isPos ? 20 : isScale ? 5 : 180}
                          step={isPos ? 0.05 : isScale ? 0.05 : 1}
                          value={val}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (isPos) { const n = { ...debugPos, [axis]: v }; setDebugPos(n); debugTransformRef.current = { ...debugTransformRef.current, pos: n }; }
                            else if (isScale) { const n = { ...debugScale, [axis]: v }; setDebugScale(n); debugTransformRef.current = { ...debugTransformRef.current, scale: n }; }
                            else { const n = { ...debugRotDeg, [axis]: v }; setDebugRotDeg(n); debugTransformRef.current = { ...debugTransformRef.current, rot: { x: n.x*Math.PI/180, y: n.y*Math.PI/180, z: n.z*Math.PI/180 } }; }
                          }}
                          style={{ flex: 1, accentColor: color }}
                        />
                        <span style={{ width: 46, textAlign: "right", color: "#f3e8ff" }}>{val.toFixed(isScale ? 2 : isPos ? 2 : 0)}{section.includes("deg") ? "°" : ""}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "6px 8px", fontSize: 10, color: "#c4b5d4", marginBottom: 8, lineHeight: 1.7 }}>
                <div>pos x={debugPos.x.toFixed(3)} y={debugPos.y.toFixed(3)} z={debugPos.z.toFixed(3)}</div>
                <div>rot x={debugRotDeg.x.toFixed(1)}° y={debugRotDeg.y.toFixed(1)}° z={debugRotDeg.z.toFixed(1)}°</div>
                <div>scale x={debugScale.x.toFixed(2)} y={debugScale.y.toFixed(2)} z={debugScale.z.toFixed(2)}</div>
                <div style={{ color: "#7c6a8a", fontSize: 9, marginTop: 2 }}>rad {(debugRotDeg.x*Math.PI/180).toFixed(3)} / {(debugRotDeg.y*Math.PI/180).toFixed(3)} / {(debugRotDeg.z*Math.PI/180).toFixed(3)}</div>
              </div>
              <button
                onClick={() => {
                  const obj = debugSelectedName ?? "unknown";
                  void navigator.clipboard.writeText(
                    `// ${obj}\npos: x=${debugPos.x.toFixed(3)}, y=${debugPos.y.toFixed(3)}, z=${debugPos.z.toFixed(3)}\n` +
                    `rot: x=${debugRotDeg.x.toFixed(1)}deg, y=${debugRotDeg.y.toFixed(1)}deg, z=${debugRotDeg.z.toFixed(1)}deg\n` +
                    `scale: x=${debugScale.x.toFixed(3)}, y=${debugScale.y.toFixed(3)}, z=${debugScale.z.toFixed(3)}\n` +
                    `// radians: x=${(debugRotDeg.x*Math.PI/180).toFixed(4)}, y=${(debugRotDeg.y*Math.PI/180).toFixed(4)}, z=${(debugRotDeg.z*Math.PI/180).toFixed(4)}`
                  );
                }}
                style={{ width: "100%", padding: "5px 0", borderRadius: 6, border: "1px solid rgba(107,17,118,0.4)", background: "rgba(107,17,118,0.15)", color: "#c084fc", cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}
              >COPY 3D VALUES</button>
              <div style={{ borderTop: "1px solid rgba(107,17,118,0.25)", paddingTop: 10, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em" }}>INSPECT CANISTER</div>
                  <button
                    onClick={() => setInspectOverride(v => !v)}
                    style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(107,17,118,0.5)", background: inspectOverride ? "#6B1176" : "transparent", color: inspectOverride ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em" }}
                  >{inspectOverride ? "OVERRIDE" : "OFF"}</button>
                </div>
                {(["POSITION", "ROTATION (deg)"] as const).map((section) => (
                  <div key={section} style={{ marginBottom: 8 }}>
                    <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 600, marginBottom: 4, letterSpacing: "0.1em" }}>{section}</div>
                    {(["x", "y", "z"] as const).map((axis) => {
                      const color = axis === "x" ? "#f87171" : axis === "y" ? "#4ade80" : "#60a5fa";
                      const isPos = section === "POSITION";
                      const val = isPos ? inspectPos[axis] : inspectRotDeg[axis];
                      return (
                        <div key={axis} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ width: 10, color, fontWeight: 700 }}>{axis.toUpperCase()}</span>
                          <input type="range"
                            min={isPos ? -12 : -180}
                            max={isPos ? 12 : 180}
                            step={isPos ? 0.05 : 1}
                            value={val}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (isPos) setInspectPos((p) => ({ ...p, [axis]: v }));
                              else setInspectRotDeg((r) => ({ ...r, [axis]: v }));
                            }}
                            style={{ flex: 1, accentColor: color }}
                          />
                          <span style={{ width: 46, textAlign: "right", color: "#f3e8ff" }}>{val.toFixed(isPos ? 2 : 0)}{section.includes("deg") ? "°" : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "6px 8px", fontSize: 10, color: "#c4b5d4", marginBottom: 8, lineHeight: 1.7 }}>
                  <div>pos x={inspectPos.x.toFixed(3)} y={inspectPos.y.toFixed(3)} z={inspectPos.z.toFixed(3)}</div>
                  <div>rot x={inspectRotDeg.x.toFixed(1)}° y={inspectRotDeg.y.toFixed(1)}° z={inspectRotDeg.z.toFixed(1)}°</div>
                  <div style={{ color: "#7c6a8a", fontSize: 9, marginTop: 2 }}>rad {(inspectRotDeg.x*Math.PI/180).toFixed(4)} / {(inspectRotDeg.y*Math.PI/180).toFixed(4)} / {(inspectRotDeg.z*Math.PI/180).toFixed(4)}</div>
                </div>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `// canister-inspect\npos: x=${inspectPos.x.toFixed(3)}, y=${inspectPos.y.toFixed(3)}, z=${inspectPos.z.toFixed(3)}\n` +
                      `rot: x=${inspectRotDeg.x.toFixed(1)}deg, y=${inspectRotDeg.y.toFixed(1)}deg, z=${inspectRotDeg.z.toFixed(1)}deg\n` +
                      `scale: x=1.000, y=1.000, z=1.000\n` +
                      `// radians: x=${(inspectRotDeg.x*Math.PI/180).toFixed(4)}, y=${(inspectRotDeg.y*Math.PI/180).toFixed(4)}, z=${(inspectRotDeg.z*Math.PI/180).toFixed(4)}`
                    );
                  }}
                  style={{ width: "100%", padding: "5px 0", borderRadius: 6, border: "1px solid rgba(107,17,118,0.4)", background: "rgba(107,17,118,0.15)", color: "#c084fc", cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em" }}
                >COPY INSPECT VALUES</button>
              </div>
              <div style={{ borderTop: "1px solid rgba(107,17,118,0.25)", paddingTop: 10 }}>
                <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 600, marginBottom: 8, letterSpacing: "0.1em" }}>HTML OVERLAYS</div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ color: "#e8d0f0", fontSize: 10, fontWeight: 600, marginBottom: 4 }}>LN2 Scale</div>
                  {(["left", "top"] as const).map((prop) => (
                    <div key={prop} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ width: 28, color: prop === "left" ? "#f87171" : "#4ade80", fontWeight: 700, fontSize: 10 }}>{prop.toUpperCase()}</span>
                      <input type="range" min={0} max={100} step={0.5} value={dbgLn2[prop]} onChange={(e) => setDbgLn2(v => ({ ...v, [prop]: parseFloat(e.target.value) }))} style={{ flex: 1, accentColor: prop === "left" ? "#f87171" : "#4ade80" }} />
                      <span style={{ width: 42, textAlign: "right", color: "#f3e8ff", fontSize: 10 }}>{dbgLn2[prop].toFixed(1)}%</span>
                    </div>
                  ))}
                  <button onClick={() => void navigator.clipboard.writeText(`left: "${dbgLn2.left}%",\ntop: "${dbgLn2.top}%",`)} style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid rgba(107,17,118,0.4)", background: "rgba(107,17,118,0.12)", color: "#c084fc", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>COPY</button>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: "#e8d0f0", fontSize: 10, fontWeight: 600, marginBottom: 4 }}>Name Card</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ width: 28, color: "#f87171", fontWeight: 700, fontSize: 10 }}>LEFT</span>
                    <input type="range" min={0} max={100} step={0.5} value={dbgNameCard.left} onChange={(e) => setDbgNameCard(v => ({ ...v, left: parseFloat(e.target.value) }))} style={{ flex: 1, accentColor: "#f87171" }} />
                    <span style={{ width: 42, textAlign: "right", color: "#f3e8ff", fontSize: 10 }}>{dbgNameCard.left.toFixed(1)}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ width: 28, color: "#4ade80", fontWeight: 700, fontSize: 10 }}>BOT</span>
                    <input type="range" min={0} max={200} step={1} value={dbgNameCard.bottom} onChange={(e) => setDbgNameCard(v => ({ ...v, bottom: parseFloat(e.target.value) }))} style={{ flex: 1, accentColor: "#4ade80" }} />
                    <span style={{ width: 42, textAlign: "right", color: "#f3e8ff", fontSize: 10 }}>{dbgNameCard.bottom}px</span>
                  </div>
                  <button onClick={() => void navigator.clipboard.writeText(`bottom: ${dbgNameCard.bottom},\nleft: "${dbgNameCard.left}%",`)} style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid rgba(107,17,118,0.4)", background: "rgba(107,17,118,0.12)", color: "#c084fc", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>COPY</button>
                </div>
              </div>
            </>)}

            {/* ── COLORS TAB ── */}
            {debugTab === "colors" && (<>
              {([
                ["STRUCTURE", [
                  { key: "platform",    label: "Platform",      m: true, r: true },
                  { key: "tankShell",   label: "Tank Shell",    m: true, r: true, o: true },
                  { key: "innerVessel", label: "Inner Vessel",  m: true, r: true, o: true },
                  { key: "bottomCap",   label: "Bottom Cap",    m: true, r: true },
                  { key: "neck",        label: "Neck & Handles",m: true, r: true },
                ]],
                ["LID", [
                  { key: "lidTop",    label: "Lid Top",    m: true, r: true },
                  { key: "lidBottom", label: "Lid Bottom", m: true, r: true },
                  { key: "lidWall",   label: "Lid Wall",   m: true, r: true },
                ]],
                ["CANISTER", [
                  { key: "canBody",   label: "Body",       m: true, r: true },
                  { key: "rod",       label: "Handle Rod", m: true, r: true },
                  { key: "innerWall", label: "Inner Wall", m: true, r: true },
                ]],
                ["LN2", [
                  { key: "ln2",  label: "Liquid", o: true },
                  { key: "wave", label: "Wave",   o: true },
                ]],
              ] as [string, { key: string; label: string; m?: boolean; r?: boolean; o?: boolean }[]][]).map(([section, items]) => (
                <div key={section} style={{ marginBottom: 10 }}>
                  <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 5 }}>{section}</div>
                  {items.map(({ key, label, m, r, o }) => {
                    const entry = matColors[key];
                    if (!entry) return null;
                    return (
                      <div key={key} style={{ marginBottom: 6, paddingBottom: 5, borderBottom: "1px solid rgba(107,17,118,0.1)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                          <input type="color" value={entry.color}
                            onChange={(e) => {
                              const hex = e.target.value;
                              setMatColors(v => ({ ...v, [key]: { ...v[key], color: hex } }));
                              const mat = materialsRef.current[key] as any;
                              if (mat) { mat.color.set(hex); mat.needsUpdate = true; }
                              if (key === "rod") canistersRef.current.forEach(c => { c.handleMat.color.set(hex); c.handleMat.needsUpdate = true; });
                            }}
                            style={{ width: 22, height: 14, padding: 0, border: "none", cursor: "pointer", borderRadius: 2, flexShrink: 0 }}
                          />
                          <span style={{ color: "#c4b5d4", fontSize: 9, fontWeight: 600, flex: 1 }}>{label}</span>
                          <span style={{ color: "#5a4a6a", fontSize: 8 }}>{entry.color}</span>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[m && "metalness", r && "roughness", o && "opacity"].filter(Boolean).map((prop) => (
                            <div key={prop as string} style={{ flex: 1, display: "flex", alignItems: "center", gap: 2 }}>
                              <span style={{ fontSize: 8, color: "#6b7280", width: 8, flexShrink: 0 }}>{(prop as string)[0].toUpperCase()}</span>
                              <input type="range" min={0} max={1} step={0.01}
                                value={(entry as any)[prop as string] ?? (prop === "opacity" ? 1 : 0)}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  setMatColors(s => ({ ...s, [key]: { ...s[key], [prop as string]: v } }));
                                  const mat = materialsRef.current[key] as any;
                                  if (mat) { mat[prop as string] = v; mat.needsUpdate = true; }
                                }}
                                style={{ flex: 1, accentColor: "#c084fc" }}
                              />
                              <span style={{ fontSize: 8, color: "#9ca3af", width: 20, textAlign: "right", flexShrink: 0 }}>
                                {((entry as any)[prop as string] ?? (prop === "opacity" ? 1 : 0)).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Lights */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 5 }}>LIGHTS</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}>
                  <span style={{ fontSize: 9, color: "#8b7a99", width: 50, flexShrink: 0 }}>Ambient</span>
                  <input type="range" min={0} max={3} step={0.05} value={lightState.ambientIntensity}
                    onChange={(e) => { const v = parseFloat(e.target.value); setLightState(s => ({ ...s, ambientIntensity: v })); const l = lightsRef.current.ambient as any; if (l) l.intensity = v; }}
                    style={{ flex: 1, accentColor: "#c084fc" }} />
                  <span style={{ fontSize: 8, color: "#9ca3af", width: 22, textAlign: "right" }}>{lightState.ambientIntensity.toFixed(2)}</span>
                </div>
                {([
                  ["key",  "Key",    "keyColor",  "keyIntensity",  5] as const,
                  ["fill", "Fill",   "fillColor", "fillIntensity", 3] as const,
                  ["rim1", "Rim 1",  "rim1Color", "rim1Intensity", 5] as const,
                  ["rim2", "Rim 2",  "rim2Color", "rim2Intensity", 5] as const,
                ]).map(([lKey, label, cKey, iKey, maxI]) => (
                  <div key={lKey} style={{ marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                      <input type="color" value={lightState[cKey]}
                        onChange={(e) => { const hex = e.target.value; setLightState(s => ({ ...s, [cKey]: hex })); const l = lightsRef.current[lKey] as any; if (l) l.color.set(hex); }}
                        style={{ width: 20, height: 13, padding: 0, border: "none", cursor: "pointer", borderRadius: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 9, color: "#c4b5d4", width: 38, flexShrink: 0 }}>{label}</span>
                      <input type="range" min={0} max={maxI} step={0.05} value={lightState[iKey]}
                        onChange={(e) => { const v = parseFloat(e.target.value); setLightState(s => ({ ...s, [iKey]: v })); const l = lightsRef.current[lKey] as any; if (l) l.intensity = v; }}
                        style={{ flex: 1, accentColor: "#c084fc" }} />
                      <span style={{ fontSize: 8, color: "#9ca3af", width: 22, textAlign: "right" }}>{lightState[iKey].toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Straws */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 5 }}>STRAWS</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
                  {strawColors.map((c, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <input type="color" value={c}
                        onChange={(e) => {
                          const hex = e.target.value;
                          setStrawColors(s => s.map((x, j) => j === i ? hex : x));
                          const origColor = STRAW_COLORS[i];
                          canistersRef.current.forEach(can =>
                            can.strawSubgroups.forEach(s => {
                              if (s.baseColor === origColor) { s.strawMat.color.set(hex); s.strawMat.needsUpdate = true; }
                            })
                          );
                        }}
                        style={{ width: "100%", height: 22, padding: 0, border: "1px solid rgba(107,17,118,0.35)", cursor: "pointer", borderRadius: 3 }}
                      />
                      <span style={{ fontSize: 8, color: "#5a4a6a" }}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Copy all colors */}
              <button
                onClick={() => {
                  const dumpSections: [string, string[]][] = [
                    ["Structure", ["platform","tankShell","innerVessel","bottomCap","neck"]],
                    ["Lid",       ["lidTop","lidBottom","lidWall"]],
                    ["Canister",  ["canBody","rod","innerWall"]],
                    ["LN2",       ["ln2","wave"]],
                  ];
                  const lines = ["// ===== SCENE COLORS ====="];
                  dumpSections.forEach(([sec, keys]) => {
                    lines.push(`// ${sec}`);
                    keys.forEach(k => {
                      const v = matColors[k];
                      const props = [`color: "${v.color}"`];
                      if (v.metalness !== undefined) props.push(`metalness: ${v.metalness.toFixed(2)}`);
                      if (v.roughness !== undefined) props.push(`roughness: ${v.roughness.toFixed(2)}`);
                      if (v.opacity   !== undefined) props.push(`opacity: ${v.opacity.toFixed(2)}`);
                      lines.push(`${k}: { ${props.join(", ")} }`);
                    });
                  });
                  lines.push("// Lights");
                  lines.push(`ambient: { intensity: ${lightState.ambientIntensity.toFixed(2)} }`);
                  lines.push(`key:  { color: "${lightState.keyColor}",  intensity: ${lightState.keyIntensity.toFixed(2)} }`);
                  lines.push(`fill: { color: "${lightState.fillColor}", intensity: ${lightState.fillIntensity.toFixed(2)} }`);
                  lines.push(`rim1: { color: "${lightState.rim1Color}", intensity: ${lightState.rim1Intensity.toFixed(2)} }`);
                  lines.push(`rim2: { color: "${lightState.rim2Color}", intensity: ${lightState.rim2Intensity.toFixed(2)} }`);
                  lines.push("// Straws");
                  lines.push(`[${strawColors.map(c => `"${c}"`).join(", ")}]`);
                  void navigator.clipboard.writeText(lines.join("\n"));
                }}
                style={{ width: "100%", padding: "5px 0", borderRadius: 6, border: "1px solid rgba(107,17,118,0.4)", background: "rgba(107,17,118,0.15)", color: "#c084fc", cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em" }}
              >COPY COLORS</button>
            </>)}
          </div>
        )}

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
  font-family: inherit;
  font-weight:300;
}
.cryo-mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

@keyframes scrollActivity {
  0% { transform: translateY(0); }
  100% { transform: translateY(-50%); }
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

@keyframes kpiFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

@keyframes kpiSheen {
  0% { transform: translateX(0) rotate(12deg); opacity: 0.3; }
  50% { transform: translateX(8px) rotate(12deg); opacity: 0.6; }
  100% { transform: translateX(0) rotate(12deg); opacity: 0.3; }
}

.kpi-card .kpi-glow { animation: kpiFloat 4.8s ease-in-out infinite; }
.kpi-card .kpi-orb { animation: kpiFloat 5.6s ease-in-out infinite reverse; }
.kpi-card .kpi-sheen { animation: kpiSheen 6.2s ease-in-out infinite; }
.kpi-card .kpi-curve { animation: kpiFloat 7.4s ease-in-out infinite; }
.kpi-card .kpi-wave { animation: kpiFloat 8.2s ease-in-out infinite reverse; }

.cryo-side-scroll::-webkit-scrollbar { width: 6px; }
.cryo-side-scroll::-webkit-scrollbar-track { background: transparent; }
.cryo-side-scroll::-webkit-scrollbar-thumb { background: #e4d4ea; border-radius: 3px; }
.cryo-side-scroll::-webkit-scrollbar-thumb:hover { background: #7a1a8866; }
.cryo-side-scroll { scrollbar-width: thin; scrollbar-color: #e4d4ea transparent; }

.cryo-btn { transition: transform 0.15s ease, box-shadow 0.2s ease; }
.cryo-btn:hover { transform: translateY(-1px); }

.cryo-lock-card { transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease; }
.cryo-lock-card:not(.cryo-lock-card--editing):hover { box-shadow: 0 2px 10px #40115318; border-color: #c8a8dc !important; }

.cryo-canister-item { transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease; }
.cryo-canister-item--selectable:hover { background: #f9f0ff !important; border-color: #c8a8dc !important; box-shadow: 0 2px 10px #40115318; }

/* Only collapse to single column on very narrow viewports (mobile) */
@media (max-width: 640px) {
  .cryo-main-grid { grid-template-columns: 1fr !important; }
}
`;