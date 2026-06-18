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
import { MessageSquare, Snowflake, Thermometer, TrendingUp } from 'lucide-react';
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

  tempExternal?: number | null;
  probeTemp?: number | null;
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
  zoneId?: string | null;
};

// ── Activity log helpers (mirrored from CryocanVisualisation) ─────────────────

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  'alert.acknowledged': 'Alert Acknowledged',
  'alert.acknowledged_all': 'All Alerts Acknowledged',
  'alert.created': 'Critical Alert Created',
  'alert_configuration.kpi_config_bulk_upserted': 'Alert Configuration Bulk Updated',
  'alert_configuration.kpi_config_created': 'Alert Configuration Created',
  'alert_configuration.kpi_config_deleted': 'Alert Configuration Deleted',
  'alert_configuration.kpi_config_updated': 'Alert Configuration Updated',
  'alert_configuration.notification_settings_updated': 'Alert Notification Settings Updated',
  'email.critical_alert_sent': 'Critical Alert Email Sent',
  'email.escalation_sent': 'Escalation Email Sent',
  'email.otp_sent': 'OTP Email Sent',
  'email.password_reset_sent': 'Password Reset Email Sent',
  'email.support_ticket_comment_sent': 'Support Ticket Comment Sent',
  'email.support_ticket_created': 'Support Ticket Email Sent',
  'email.user_approval_requested': 'Approval Email Sent',
  'email.user_approved_sent': 'Approval Confirmation Sent',
  'integration.auth.login': 'Integration Login',
  'integration.auth.token_revoked': 'Integration Token Revoked',
  'refill_detection.created': 'Refill Detection Created',
  'refill_detection.reviewed': 'Refill Detection Reviewed',
  'report.activity_logs.downloaded': 'Activity Logs Downloaded',
  'report.ivf.critical_alerts.downloaded': 'Critical Alerts Downloaded',
  'report.ivf.monthly_summary.downloaded': 'Monthly Summary Downloaded',
  'support_ticket.comment_added': 'Support Ticket Commented',
  'support_ticket.created': 'Support Ticket Created',
  'support_ticket.status_updated': 'Support Ticket Status Updated',
  'task.created': 'Task Created',
  'task.deleted': 'Task Deleted',
  'task.status_updated': 'Task Status Updated',
  'task.updated': 'Task Updated',
  'user.approved': 'User Approved',
  'user.invite_registered': 'User Registered via Invite',
  'user.invited': 'User Invited',
  'user.login': 'Login Successful',
  'user.login_requested': 'Login Requested',
  'user.logout': 'Logged Out',
  'user.password_reset_completed': 'Password Reset Completed',
  'user.profile_updated': 'Profile Updated',
  'user.registered': 'User Registered',
  'user.rejected': 'User Rejected',
};

function formatActivityActionLabel(action: string) {
  if (ACTIVITY_ACTION_LABELS[action]) return ACTIVITY_ACTION_LABELS[action];
  return action.replace(/_/g, ' ').replace(/\./g, ' · ').split(' ').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getActivityMetadataLines(action: string, metadata?: Record<string, any> | null): string[] {
  if (!metadata) return [];
  const lines: string[] = [];
  const val = (v: any) => (v === null || v === undefined || v === '' ? null : String(v));
  if (action.startsWith('task.')) {
    if (val(metadata.status)) lines.push(`Status: ${metadata.status}`);
    if (val(metadata.priority)) lines.push(`Priority: ${metadata.priority}`);
    return lines;
  }
  if (action.startsWith('alert.')) {
    if (val(metadata.message)) lines.push(String(metadata.message).slice(0, 70));
    else if (val(metadata.alert_type)) lines.push(`KPI: ${metadata.alert_type}`);
    if (val(metadata.severity)) lines.push(`Severity: ${metadata.severity}`);
    return lines;
  }
  if (action.startsWith('user.')) {
    if (val(metadata.role)) lines.push(`Role: ${metadata.role}`);
    if (val(metadata.branch_name)) lines.push(`Branch: ${metadata.branch_name}`);
    return lines;
  }
  return [];
}

type ActivityIconType = 'alert' | 'config' | 'task' | 'email' | 'user' | 'report' | 'default';

function getActivityIconType(action: string): ActivityIconType {
  if (action.startsWith('alert.') || action.startsWith('email.critical_alert')) return 'alert';
  if (action.startsWith('alert_configuration.')) return 'config';
  if (action.startsWith('task.')) return 'task';
  if (action.startsWith('email.')) return 'email';
  if (action.startsWith('user.')) return 'user';
  if (action.startsWith('report.')) return 'report';
  return 'default';
}

const ACTIVITY_BADGE_STYLE: Record<ActivityIconType, { bg: string; color: string; label: string }> = {
  alert:   { bg: '#f3e8fd', color: '#7a22c8', label: 'Alert'  },
  config:  { bg: '#ede5f7', color: '#6b4a78', label: 'Config' },
  task:    { bg: '#f3e8fd', color: '#7a22c8', label: 'Task'   },
  email:   { bg: '#ede5f7', color: '#6b4a78', label: 'Email'  },
  user:    { bg: '#f3e8fd', color: '#7a22c8', label: 'User'   },
  report:  { bg: '#ede5f7', color: '#6b4a78', label: 'Export' },
  default: { bg: '#f3e8fd', color: '#7a22c8', label: 'System' },
};

const ACTIVITY_ICON_INNER: Record<ActivityIconType, React.ReactNode> = {
  alert: (
    <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>
  ),
  config: (
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  ),
  task: (
    <><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>
  ),
  email: (
    <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>
  ),
  user: (
    <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>
  ),
  report: (
    <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>
  ),
  default: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
};

// ── End activity log helpers ───────────────────────────────────────────────────

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
  mistMeshes: Mesh[];
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

  // Freezer mist — layered semi-transparent planes that breathe opacity for a cold-fog look.
  // Only added for the freezer compartment; planes are positioned at varying depths and heights
  // so the thickest haze sits at the back wall and thins toward the glass door.
  const mistMeshes: Mesh[] = [];
  if (!isFridge) {
    const mistData: Array<{ z: number; yOff: number; hScale: number; baseOpacity: number }> = [
      { z: -cavityD * 0.38, yOff: 0,              hScale: 0.85, baseOpacity: 0.10 },
      { z: -cavityD * 0.18, yOff: -cavityH * 0.10, hScale: 0.70, baseOpacity: 0.08 },
      { z:  0,              yOff: -cavityH * 0.20,  hScale: 0.55, baseOpacity: 0.07 },
      { z:  cavityD * 0.14, yOff: -cavityH * 0.28,  hScale: 0.42, baseOpacity: 0.05 },
      { z:  cavityD * 0.25, yOff: -cavityH * 0.32,  hScale: 0.30, baseOpacity: 0.04 },
    ];
    mistData.forEach(({ z, yOff, hScale, baseOpacity }, i) => {
      const mistMat = new MeshBasicMaterial({
        color: new Color('#b8d8f8'),
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        side: DoubleSide,
      });
      const mist = new Mesh(new PlaneGeometry(cavityW * 0.88, cavityH * hScale), mistMat);
      mist.position.set(0, yOff, z);
      mist.renderOrder = 3;
      mist.userData._mistPhase = i * (Math.PI * 2 / 5);
      mist.userData._mistBaseOpacity = baseOpacity;
      group.add(mist);
      mistMeshes.push(mist);
    });
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

  return { group, doorHit, doorGroup, highlightRing, interiorLight, interiorBack: back, mistMeshes };
}


export default function RefrigeratorVisualisation({
  sensorTiles = [],
  selectedSensorId,
  onSensorSelect,
  hasAlert,
  systemActivity = [],
  tasks = [],
  onTaskCreated,
  onEditTask,
  currentUserName = '',
  currentUserId = '',
  refrigeratorId,
  zoneId,
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
      // Adaptive auto-rotate: slow at front (interior visible), fast at sides/back
      if (!dragging) {
        // frontness → 1 when front faces camera, 0 at sides/back
        const frontness = Math.max(0, Math.cos(cabinet.rotation.y));
        const rotSpeed = 0.0007 + (1 - frontness) * 0.0093;
        cabinet.rotation.y += rotSpeed;
      }
      // Smoothly tween light intensities toward their target values
      const lerpLight = (l: PointLight) => {
        const target = (l.userData._target as number | undefined) ?? 1.0;
        l.intensity += (target - l.intensity) * Math.min(1, dt * 4);
      };
      lerpLight(fridge.interiorLight);
      lerpLight(freezer.interiorLight);
      // Animate freezer mist — slow breathing opacity simulates cold fog wisps
      freezer.mistMeshes.forEach((m) => {
        const phase = (m.userData._mistPhase as number) + now * 0.00035;
        const base = m.userData._mistBaseOpacity as number;
        (m.material as MeshBasicMaterial).opacity = base + Math.sin(phase) * base * 0.4;
      });
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
    assigneeBy: t.created_by ? `${t.created_by.first_name ?? ''} ${t.created_by.last_name ?? ''}`.trim() : '',
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
  const [activityScrollPaused, setActivityScrollPaused] = useState(false);

  return (
    <>
    <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-4 h-full min-h-0">

      {/* Left: Live Conditions (top) + Messages (bottom) */}
      <aside className="flex flex-col gap-3 min-h-0">

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
                const isProbe = tile.id === 'probe_temp';
                const accent = isAlert ? '#dc2626' : (isProbe ? '#7a22c8' : '#1a7abb');
                const ring = isAlert ? 'rgba(220,38,38,0.12)' : (isProbe ? 'rgba(122,34,200,0.12)' : 'rgba(26,122,187,0.12)');
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => { onSensorSelect?.(tile.id); setKpiModalKey(tile.id); }}
                    className={['text-left w-full rfg-kpi-card', isAlert ? 'ring-1 ring-red-300' : ''].join(' ')}
                    style={{
                      borderRadius: 16,
                      padding: '12px 14px',
                      border: `1px solid ${isSelected ? accent : '#e6d6ee'}`,
                      background: '#fdfbfe',
                      boxShadow: isSelected ? `0 6px 16px ${ring}` : '0 4px 12px rgba(64,17,83,0.06)',
                      position: 'relative',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, position: 'relative', zIndex: 1 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#8b6c97', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {tile.label}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: isAlert ? '#dc2626' : accent, marginTop: 4 }}>
                          {tile.value}
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                          {tile.timestamp ?? '—'}
                        </div>
                      </div>
                      <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,0.8)', border: '1px solid #e6d6ee', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `inset 0 0 0 6px ${ring}`, color: accent, flexShrink: 0 }}>
                        {isProbe ? <Snowflake size={18} /> : <Thermometer size={18} />}
                      </div>
                    </div>
                    <div className="rfg-kpi-orb" style={{ position: 'absolute', right: -20, bottom: -18, width: 140, height: 70, borderRadius: '50%', border: '1px solid rgba(170,140,190,0.35)', opacity: 0.7 }} />
                    <div className="rfg-kpi-glow" style={{ position: 'absolute', left: -30, top: -24, width: 110, height: 110, borderRadius: '50%', background: 'radial-gradient(circle, rgba(123,92,139,0.12) 0%, rgba(123,92,139,0) 70%)', opacity: 0.6 }} />
                    <div className="rfg-kpi-sheen" style={{ position: 'absolute', inset: '12px 12px auto auto', width: 46, height: 46, borderRadius: 10, border: '1px solid rgba(230,214,238,0.9)', opacity: 0.45, transform: 'rotate(12deg)' }} />
                    <div className="rfg-kpi-curve" style={{ position: 'absolute', left: -18, bottom: -22, width: 160, height: 90, borderRadius: '100%', border: '1px solid rgba(214,198,228,0.5)', transform: 'rotate(-8deg)', opacity: 0.55 }} />
                    <div className="rfg-kpi-wave" style={{ position: 'absolute', right: -40, top: 28, width: 180, height: 80, borderRadius: '100%', border: '1px dashed rgba(214,198,228,0.45)', transform: 'rotate(10deg)', opacity: 0.5 }} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Messages card */}
        <div className="shrink-0 rounded-2xl border border-line bg-white overflow-hidden flex flex-col" style={{ height: 220 }}>
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ background: '#f7f2fa', borderBottom: '1px solid #efe5f4' }}
          >
            <div>
              <span className="block text-sm font-semibold" style={{ color: '#5f3b73' }}>Messages</span>
              <span className="block text-[10px] mt-0.5" style={{ color: '#a07ab8' }}>Stakeholder communications</span>
            </div>
            <MessageSquare size={16} style={{ color: '#6b4a78' }} />
          </div>
          <StakeholderChatBox
            embedded
            isOpen={false}
            onClose={() => {}}
            refrigeratorId={refrigeratorId}
          />
        </div>
      </aside>

      {/* Center 3D viewer */}
      <section
        data-refrigerator-3d-mount
        className="relative min-h-0 overflow-hidden"
        style={{ borderRadius: 20, border: '1px solid #d8c6e8', background: 'linear-gradient(160deg, #f3eaf9 0%, #ede0f5 40%, #e4d4f0 100%)', boxShadow: '0 8px 20px -12px #4011531f, 0 2px 6px #4011530a' }}
        aria-label="Refrigerator 3D visualisation"
      >
        {/* Radial vignette — brighter centre, darker corners */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 70% 65% at 50% 50%, rgba(255,255,255,0.62) 0%, transparent 72%)' }} />
        {/* Floor gradient */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%', zIndex: 0, pointerEvents: 'none', background: 'linear-gradient(0deg, rgba(220,195,240,0.4) 0%, transparent 100%)' }} />
        <div ref={mountRef} className="absolute inset-0" />

        {/* Top-left: live status + meta info */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none" style={{ zIndex: 2 }}>
          {/* Connected status */}
          <div className="flex items-center gap-2 bg-white/85 backdrop-blur-sm rounded-xl border border-white/70 shadow-sm px-3 py-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${sensorTiles.some((t) => !t.isMissing) ? 'bg-emerald-400 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-[11px] font-bold text-gray-700">
              {sensorTiles.some((t) => !t.isMissing) ? 'Connected Live' : 'No Signal'}
            </span>
          </div>
        </div>

        {/* Top-right: status badge */}
        <div className="absolute top-3 right-3 pointer-events-none">
          {hasAlert ? (
            <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-red-200 rounded-xl px-2.5 py-1.5 shadow-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.35C17.25 23.15 21 18.25 21 13V7L12 2z" fill="#ef4444" />
                <line x1="12" y1="8" x2="12" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="15.5" r="0.8" fill="white" />
              </svg>
              <span className="text-[11px] font-semibold text-red-600">Alert active</span>
            </div>
          ) : sensorTiles.some((t) => !t.isMissing) ? (
            <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-emerald-200 rounded-xl px-2.5 py-1.5 shadow-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.35C17.25 23.15 21 18.25 21 13V7L12 2z" fill="#22c55e" />
                <polyline points="8 12 11 15 16 9" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[11px] font-semibold text-gray-700">Normal</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl px-2.5 py-1.5 shadow-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.35C17.25 23.15 21 18.25 21 13V7L12 2z" fill="#9ca3af" />
              </svg>
              <span className="text-[11px] font-semibold text-gray-500">No signal</span>
            </div>
          )}
        </div>

        {/* Mid-left: Storage Guidelines card */}
        <div className="absolute left-3 pointer-events-none" style={{ top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}>
          <div className="bg-white/85 backdrop-blur-sm rounded-xl border border-white/60 shadow-md px-3 py-2.5 w-[152px]">
            <div className="text-[8px] font-bold tracking-widest uppercase mb-1.5" style={{ color: '#5f3b73' }}>Storage Guidelines</div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-gray-500">Fridge</span>
                <span className="text-[9px] font-bold" style={{ color: '#7a22c8' }}>2 – 8 °C</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-gray-500">Freezer</span>
                <span className="text-[9px] font-bold" style={{ color: '#1a7abb' }}>≤ −20 °C</span>
              </div>
              <div className="w-full border-t border-gray-100 my-1" />
              {['Separate shelf zones', 'No rear-wall contact', 'Quarterly inventory audit'].map((t) => (
                <div key={t} className="flex items-start gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" className="shrink-0 mt-0.5" fill="none">
                    <circle cx="12" cy="12" r="12" fill="#22c55e" />
                    <polyline points="7 12 10.5 15.5 17 8.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[9px] text-gray-600 leading-tight">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mid-right: Daily SOP card */}
        <div className="absolute right-3 pointer-events-none" style={{ top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}>
          <div className="bg-white/85 backdrop-blur-sm rounded-xl border border-white/60 shadow-md px-3 py-2.5 w-[152px]">
            <div className="text-[8px] font-bold tracking-widest uppercase mb-1.5" style={{ color: '#1a4d7a' }}>Daily SOP</div>
            <div className="flex flex-col gap-1">
              {['Log temp morning and evening', 'Record any excursions', 'Minimise door-open cycles', 'Check door seals monthly', 'Allow items to equilibrate'].map((t) => (
                <div key={t} className="flex items-start gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" className="shrink-0 mt-0.5" fill="none">
                    <circle cx="12" cy="12" r="12" fill="#22c55e" />
                    <polyline points="7 12 10.5 15.5 17 8.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[9px] text-gray-600 leading-tight">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom: scrolling tips strip */}
        <style>{`
@keyframes rfg-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes rfgKpiFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes rfgKpiSheen { 0% { transform: translateX(0) rotate(12deg); opacity: 0.3; } 50% { transform: translateX(8px) rotate(12deg); opacity: 0.6; } 100% { transform: translateX(0) rotate(12deg); opacity: 0.3; } }
@keyframes rfgScrollActivity { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
.rfg-kpi-card .rfg-kpi-glow  { animation: rfgKpiFloat 4.8s ease-in-out infinite; }
.rfg-kpi-card .rfg-kpi-orb   { animation: rfgKpiFloat 5.6s ease-in-out infinite reverse; }
.rfg-kpi-card .rfg-kpi-sheen { animation: rfgKpiSheen 6.2s ease-in-out infinite; }
.rfg-kpi-card .rfg-kpi-curve { animation: rfgKpiFloat 7.4s ease-in-out infinite; }
.rfg-kpi-card .rfg-kpi-wave  { animation: rfgKpiFloat 8.2s ease-in-out infinite reverse; }
`}</style>
        <div className="absolute bottom-0 inset-x-0 bg-white/65 backdrop-blur-sm border-t border-white py-2 flex items-center gap-3 overflow-hidden">
          <span className="shrink-0 text-[9px] font-bold tracking-widest bg-primary text-white uppercase pl-3 pr-1">Tips</span>
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

      {/* Right: System Activity (top) + Tasks (bottom) */}
      <aside className="flex flex-col gap-3 min-h-0">

        {/* System Activity card */}
        <div
          className="flex-1 min-h-0 flex flex-col"
          style={{ border: '1px solid #e6d6ee', borderRadius: 18, overflow: 'hidden', boxShadow: '0 6px 16px #40115308', background: '#fff' }}
        >
          <div style={{ fontWeight: 600, fontSize: 14, color: '#5f3b73', padding: '12px 16px 10px', background: '#f7f2fa', flexShrink: 0, borderBottom: '1px solid #efe5f4' }}>
            System Activity
            <div style={{ fontSize: 10, fontWeight: 400, color: '#a07ab8', marginTop: 2 }}>Recent system events</div>
          </div>
          <div
            style={{ flex: 1, overflow: 'hidden', position: 'relative', padding: '8px 10px 0' }}
            onMouseEnter={() => setActivityScrollPaused(true)}
            onMouseLeave={() => setActivityScrollPaused(false)}
          >
            {activity.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No recent activity</div>
            ) : (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                animation: `rfgScrollActivity ${Math.max(activity.length * 3, 8)}s linear infinite`,
                animationPlayState: activityScrollPaused ? 'paused' : 'running',
              }}>
                {[...activity, ...activity].flatMap((log, idx) => {
                  const key = `${log.id}-${idx}`;
                  const action = log.action ?? '';
                  const iconType = getActivityIconType(action);
                  const badge = ACTIVITY_BADGE_STYLE[iconType];
                  const timeStr = log.created_at ? new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const title = formatActivityActionLabel(action);
                  const metaLines = getActivityMetadataLines(action, log.metadata).slice(0, 2);
                  const actorName = log.actor_label || (log.actor_details ? `${String(log.actor_details['first_name'] ?? '')} ${String(log.actor_details['last_name'] ?? '')}`.trim() : '');
                  const card = (
                    <div key={key} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid #f0e8f4', background: '#fdfbfe', flexShrink: 0 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: badge.bg, color: badge.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {ACTIVITY_ICON_INNER[iconType]}
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 500 }}>{timeStr}</span>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: badge.bg, color: badge.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{badge.label}</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#1a0a1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                        {actorName && <div style={{ fontSize: 10, color: '#6b5a70', marginTop: 1 }}>{actorName}</div>}
                        {metaLines.map((line, i) => (
                          <div key={i} style={{ fontSize: 10, color: '#6b5a70', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line}</div>
                        ))}
                      </div>
                    </div>
                  );
                  const isCopyEnd = idx === activity.length - 1 || idx === activity.length * 2 - 1;
                  return isCopyEnd ? [card, <div key={`gap-${idx}`} style={{ height: 52, flexShrink: 0 }} />] : [card];
                })}
              </div>
            )}
          </div>
        </div>

        {/* Tasks card */}
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
    </div>

    {kpiModalKey && refrigeratorId != null && (
      <RefrigeratorKpiChartModal
        refrigeratorId={refrigeratorId}
        kpiKey={kpiModalKey}
        zoneId={zoneId}
        onClose={() => setKpiModalKey(null)}
      />
    )}
    </>
  );
}
