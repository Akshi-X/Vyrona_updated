import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Minimal static 3D cryocan for the Alert Configuration LN2 card.
 * Geometry distilled from IVFTrackShipment/sections/CryocanVisualisation.tsx
 * (which stays untouched). No orbit controls, no rotation, no animation loop —
 * a single render per prop/size change with exactly two indications:
 *   - liquid fill  = last live LN2 reading (%)
 *   - amber ring   = configured L2 threshold (%)
 */

const TANK_RADIUS = 1.5;
const TANK_HEIGHT = 5.0;
const MAX_LN2_HEIGHT = TANK_HEIGHT * 0.78;
const LN2_BOTTOM_MARGIN = 0.15;
const SHOULDER_START = 0.86;
const TOP_RADIUS_RATIO = 0.68;

const clampPct = (v: number | null): number | null =>
    v == null ? null : Math.min(100, Math.max(0, v));

function buildTank(scene: THREE.Scene) {
    const group = new THREE.Group();
    scene.add(group);

    // Outer shell — lathe with domed shoulder
    const shellProfile: THREE.Vector2[] = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const y = -TANK_HEIGHT / 2 + t * TANK_HEIGHT;
        let r = TANK_RADIUS;
        if (t > SHOULDER_START) {
            const st = (t - SHOULDER_START) / (1 - SHOULDER_START);
            const taper = (1 - Math.cos(st * Math.PI)) / 2;
            r = TANK_RADIUS * (1 - taper * (1 - TOP_RADIUS_RATIO));
        }
        if (t < 0.04) {
            const bt = t / 0.04;
            r = TANK_RADIUS * (0.9 + bt * 0.1);
        }
        shellProfile.push(new THREE.Vector2(r, y));
    }
    const shellGeo = new THREE.LatheGeometry(shellProfile, 72);
    const shell = new THREE.Mesh(
        shellGeo,
        new THREE.MeshPhysicalMaterial({
            color: 0x201e1e,
            metalness: 1.0,
            roughness: 1.0,
            transparent: true,
            opacity: 0.33,
            thickness: 0.6,
            ior: 1.38,
            side: THREE.DoubleSide,
            clearcoat: 0.8,
            clearcoatRoughness: 0.14,
            attenuationColor: new THREE.Color(0xd8c4ec),
            attenuationDistance: 1.8,
        }),
    );
    shell.renderOrder = 3;
    group.add(shell);

    const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(shellGeo, 25),
        new THREE.LineBasicMaterial({ color: 0x401153, transparent: true, opacity: 0.28 }),
    );
    group.add(outline);

    // Chrome bottom cap
    const bottomCap = new THREE.Mesh(
        new THREE.CircleGeometry(TANK_RADIUS * 0.97, 64),
        new THREE.MeshPhysicalMaterial({ color: 0xe0dce8, metalness: 0.95, roughness: 0, clearcoat: 1, clearcoatRoughness: 0.06 }),
    );
    bottomCap.rotation.x = Math.PI / 2;
    bottomCap.position.y = -TANK_HEIGHT / 2 + 0.01;
    group.add(bottomCap);

    // Inner vessel (vacuum dewar wall)
    const INNER_R = TANK_RADIUS * 0.88;
    const innerBottomY = -TANK_HEIGHT / 2 + 0.05;
    const innerTopY = -TANK_HEIGHT / 2 + TANK_HEIGHT * (SHOULDER_START - 0.05);
    const innerProfile = [
        new THREE.Vector2(0, innerBottomY),
        new THREE.Vector2(INNER_R, innerBottomY),
        new THREE.Vector2(INNER_R, innerTopY),
        new THREE.Vector2(INNER_R - 0.045, innerTopY),
        new THREE.Vector2(INNER_R - 0.045, innerBottomY + 0.05),
        new THREE.Vector2(0, innerBottomY + 0.05),
    ];
    const innerShell = new THREE.Mesh(
        new THREE.LatheGeometry(innerProfile, 64),
        new THREE.MeshPhysicalMaterial({
            color: 0x2320fe,
            roughness: 0,
            transparent: true,
            opacity: 0.09,
            thickness: 0.5,
            ior: 1.4,
            side: THREE.DoubleSide,
            clearcoat: 0.8,
            clearcoatRoughness: 0.1,
        }),
    );
    group.add(innerShell);

    // Neck ring
    const neckRadius = TANK_RADIUS * TOP_RADIUS_RATIO;
    const NECK_INNER_R = neckRadius * 0.82;
    const NECK_HEIGHT = 0.1;
    const NECK_BOTTOM_Y = TANK_HEIGHT / 2 - 0.02;
    const neckMat = new THREE.MeshPhysicalMaterial({ color: 0x401153, metalness: 0.75, roughness: 0.22 });
    const neckTop = new THREE.Mesh(new THREE.RingGeometry(NECK_INNER_R, neckRadius, 64), neckMat);
    neckTop.rotation.x = -Math.PI / 2;
    neckTop.position.y = NECK_BOTTOM_Y + NECK_HEIGHT;
    group.add(neckTop);
    const neckWall = new THREE.Mesh(
        new THREE.CylinderGeometry(neckRadius, neckRadius, NECK_HEIGHT, 64, 1, true),
        neckMat,
    );
    neckWall.position.y = NECK_BOTTOM_Y + NECK_HEIGHT / 2;
    group.add(neckWall);

    // Closed lid: bottom/top discs + wall + knob
    const LID_OUTER_R = neckRadius * 1.04;
    const LID_THICKNESS = 0.18;
    const lid = new THREE.Group();
    lid.position.y = TANK_HEIGHT / 2 + 0.05;
    group.add(lid);
    const lidTop = new THREE.Mesh(
        new THREE.CircleGeometry(LID_OUTER_R, 64),
        new THREE.MeshPhysicalMaterial({ color: 0x401153, metalness: 0.6, roughness: 0.22, side: THREE.DoubleSide }),
    );
    lidTop.rotation.x = -Math.PI / 2;
    lidTop.position.y = 0.04 + LID_THICKNESS;
    lid.add(lidTop);
    const lidWall = new THREE.Mesh(
        new THREE.CylinderGeometry(LID_OUTER_R, LID_OUTER_R, LID_THICKNESS, 64, 1, true),
        new THREE.MeshPhysicalMaterial({ color: 0x7a1a88, metalness: 0.55, roughness: 0.25 }),
    );
    lidWall.position.y = 0.04 + LID_THICKNESS / 2;
    lid.add(lidWall);
    const knob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 0.08, 24),
        new THREE.MeshPhysicalMaterial({ color: 0x401153, metalness: 0.7, roughness: 0.25 }),
    );
    knob.position.y = 0.04 + LID_THICKNESS + 0.04;
    lid.add(knob);

    // Indication 1 — LN2 liquid (last live reading)
    const LN2_R = INNER_R - 0.07;
    const ln2Geo = new THREE.CylinderGeometry(LN2_R, LN2_R, MAX_LN2_HEIGHT, 48);
    ln2Geo.translate(0, MAX_LN2_HEIGHT / 2, 0);
    const liquid = new THREE.Mesh(
        ln2Geo,
        new THREE.MeshPhysicalMaterial({
            color: 0x0092fa,
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
        }),
    );
    liquid.position.y = -TANK_HEIGHT / 2 + LN2_BOTTOM_MARGIN;
    liquid.renderOrder = 1;
    group.add(liquid);

    // Indication 2 — L2 threshold ring (amber marker at the configured level)
    const l2Ring = new THREE.Mesh(
        new THREE.TorusGeometry(INNER_R - 0.04, 0.03, 10, 64),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    l2Ring.rotation.x = Math.PI / 2;
    l2Ring.renderOrder = 4;
    group.add(l2Ring);

    return { liquid, l2Ring };
}

export default function MiniTank3D({
    levelPct,
    l2Pct,
    usableKg,
    className = "",
}: {
    /** Last live LN2 reading as % of full (liquid fill). */
    levelPct: number | null;
    /** Configured L2 threshold as % of full (amber ring). */
    l2Pct: number | null;
    /** Usable tank capacity in kg for converting % to kg display. */
    usableKg: number | null;
    className?: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const ln2MarkerRef = useRef<HTMLDivElement>(null);
    const l2MarkerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        renderer: THREE.WebGLRenderer;
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        liquid: THREE.Mesh;
        l2Ring: THREE.Mesh;
    } | null>(null);

    const updateMarkerPosition = () => {
        const ctx = sceneRef.current;
        if (!ctx || !ln2MarkerRef.current || !l2MarkerRef.current || !containerRef.current) return;

        const camera = ctx.camera;
        const INNER_R = TANK_RADIUS * 0.88;

        const projectToScreen = (worldPos: THREE.Vector3) => {
            const v = worldPos.clone().project(camera);
            const w = containerRef.current!.clientWidth;
            const h = containerRef.current!.clientHeight;
            const x = (v.x + 1) / 2 * w;
            const y = (1 - v.y) / 2 * h;
            return { x, y };
        };

        const level = levelPct != null ? Math.max(levelPct / 100, 0.001) : 0.001;
        const ln2Y = ctx.liquid.position.y + MAX_LN2_HEIGHT * level;
        const ln2Pos = projectToScreen(new THREE.Vector3(-INNER_R, ln2Y, 0));
        if (ln2Pos) {
            ln2MarkerRef.current.style.left = `${ln2Pos.x}px`;
            ln2MarkerRef.current.style.top = `${ln2Pos.y}px`;
        }

        const l2Y = ctx.l2Ring.position.y;
        const l2Pos = projectToScreen(new THREE.Vector3(INNER_R, l2Y, 0));
        if (l2Pos) {
            l2MarkerRef.current.style.left = `${l2Pos.x}px`;
            l2MarkerRef.current.style.top = `${l2Pos.y}px`;
        }
    };

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.appendChild(renderer.domElement);

        scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c4ec, 1.15));
        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(4, 6, 6);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xc9a8ff, 0.7);
        rim.position.set(-5, 2, -4);
        scene.add(rim);
        const fill = new THREE.PointLight(0xffffff, 0.5);
        fill.position.set(0, -2, 5);
        scene.add(fill);

        const { liquid, l2Ring } = buildTank(scene);
        sceneRef.current = { renderer, scene, camera, liquid, l2Ring };

        const render = () => renderer.render(scene, camera);
        // Model bounds: platform bottom (−2.66) to lid knob top (+2.85), platform half-width 1.95
        const CENTER_Y = 0.1;
        const HALF_H = 3.0;
        const HALF_W = 2.05;

        const resize = () => {
            const w = host.clientWidth || 1;
            const h = host.clientHeight || 1;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            // Fit both height and width in frame regardless of the slot's aspect ratio
            const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
            const distV = HALF_H / tanV;
            const distH = HALF_W / (tanV * camera.aspect);
            const dist = Math.max(distV, distH) + 0.3;
            camera.position.set(0.3, CENTER_Y + dist * 0.16, dist);
            camera.lookAt(0, CENTER_Y, 0);
            camera.updateProjectionMatrix();
            render();
            updateMarkerPosition();
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(host);

        return () => {
            ro.disconnect();
            renderer.dispose();
            scene.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                if (mesh.geometry) mesh.geometry.dispose();
                const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
                if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
                else if (mat) mat.dispose();
            });
            host.removeChild(renderer.domElement);
            sceneRef.current = null;
        };
    }, []);

    useEffect(() => {
        const ctx = sceneRef.current;
        if (!ctx) return;
        const level = clampPct(levelPct);
        ctx.liquid.scale.y = level != null ? Math.max(level / 100, 0.001) : 0.001;
        ctx.liquid.visible = level != null;
        const l2 = clampPct(l2Pct);
        ctx.l2Ring.visible = l2 != null;
        if (l2 != null) {
            ctx.l2Ring.position.y = -TANK_HEIGHT / 2 + LN2_BOTTOM_MARGIN + (l2 / 100) * MAX_LN2_HEIGHT;
        }
        ctx.renderer.render(ctx.scene, ctx.camera);
        updateMarkerPosition();
    }, [levelPct, l2Pct]);

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div ref={hostRef} className="absolute inset-0" aria-hidden />
            <div
                ref={ln2MarkerRef}
                className="absolute pointer-events-none"
                style={{
                    left: "0px",
                    top: "0px",
                    transform: "translate(-85%, -50%)",
                }}
            >
                <div className="flex items-center gap-0">
                    <div className="px-2 py-1 rounded-full bg-[#0092fa] text-white text-[9px] font-bold whitespace-nowrap">
                        {levelPct != null && usableKg != null ? `LN2 ${((levelPct / 100) * usableKg).toFixed(1)} kg` : "—"}
                    </div>
                    <svg className="w-8 h-2" viewBox="0 0 48 8" preserveAspectRatio="none">
                        <line x1="0" y1="4" x2="20" y2="4" stroke="#0092fa" strokeWidth="1" />
                    </svg>
                </div>
            </div>
            <div
                ref={l2MarkerRef}
                className="absolute pointer-events-none"
                style={{
                    left: "0px",
                    top: "0px",
                    transform: "translate(-20px, -50%)",
                }}
            >
                <div className="flex items-center gap-0">
                    <svg className="w-8 h-2" viewBox="0 0 48 8" preserveAspectRatio="none">
                        <line x1="28" y1="4" x2="48" y2="4" stroke="#f59e0b" strokeWidth="1" />
                    </svg>
                    <div className="px-2 py-1 rounded-full bg-[#f59e0b] text-white text-[9px] font-bold whitespace-nowrap">
                        {l2Pct != null && usableKg != null ? `L2 ${((l2Pct / 100) * usableKg).toFixed(1)} kg` : "—"}
                    </div>
                </div>
            </div>
        </div>
    );
}
