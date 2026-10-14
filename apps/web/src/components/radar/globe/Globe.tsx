"use client";

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  Object3D,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { themePalettes } from "@/radar/theme";
import { useRadarStore } from "@/radar/store";
import geography from "@/radar/geography.json";
import type { Visitor } from "@/radar/types";

const RADIUS = 2;
export function position(latitude: number, longitude: number, radius = RADIUS) {
  const lat = (latitude * Math.PI) / 180,
    lng = (longitude * Math.PI) / 180;
  return new Vector3(
    radius * Math.cos(lat) * Math.sin(lng),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.cos(lng),
  );
}
function geometryFrom(points: number[][], radius: number) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      points.flatMap(([lng, lat]) => position(lat, lng, radius).toArray()),
      3,
    ),
  );
  return geometry;
}

function Earth() {
  const land = useMemo(() => geometryFrom(geography.dots, 2.006), []);
  const borders = useMemo(() => geometryFrom(geography.lines, 2.009), []);
  const grid = useMemo(() => {
    const points: number[][] = [];
    for (let lat = -75; lat <= 75; lat += 15)
      for (let lng = -180; lng < 180; lng += 2)
        points.push([lng, lat], [lng + 2, lat]);
    for (let lng = -180; lng < 180; lng += 15)
      for (let lat = -90; lat < 90; lat += 2)
        points.push([lng, lat], [lng, lat + 2]);
    return geometryFrom(points, 2.002);
  }, []);
  const atmosphere = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: `varying vec3 vNormal; varying vec3 vPosition; void main(){vNormal=normalize(normalMatrix*normal); vec4 p=modelViewMatrix*vec4(position,1.0); vPosition=p.xyz; gl_Position=projectionMatrix*p;}`,
        fragmentShader: `varying vec3 vNormal; varying vec3 vPosition; void main(){float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(-vPosition))),4.0); gl_FragColor=vec4(0.23,0.61,0.57,rim*0.18);}`,
        transparent: true,
        side: BackSide,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  useEffect(
    () => () => {
      land.dispose();
      borders.dispose();
      grid.dispose();
      atmosphere.dispose();
    },
    [land, borders, grid, atmosphere],
  );
  return (
    <>
      <mesh onClick={(event) => event.stopPropagation()}>
        <sphereGeometry args={[2, 96, 64]} />
        <meshPhongMaterial color="#10161a" shininess={5} specular="#1b2733" />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#314548" transparent opacity={0.19} />
      </lineSegments>
      <points geometry={land}>
        <pointsMaterial
          color="#9ba9b1"
          size={0.015}
          sizeAttenuation
          transparent
          opacity={0.72}
        />
      </points>
      <lineSegments geometry={borders}>
        <lineBasicMaterial color="#65747d" transparent opacity={0.3} />
      </lineSegments>
      <mesh material={atmosphere}>
        <sphereGeometry args={[2.09, 64, 48]} />
      </mesh>
    </>
  );
}

/** DOM diagnostics for local QA; sampled once a second without React updates. */
function RenderDiagnostics() {
  const sample = useRef({ elapsed: 0, frames: 0 });
  useFrame(({ gl }, delta) => {
    sample.current.elapsed += delta;
    sample.current.frames++;
    if (sample.current.elapsed >= 1) {
      gl.domElement.dataset.renderFps = (
        sample.current.frames / sample.current.elapsed
      ).toFixed(1);
      gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
      sample.current = { elapsed: 0, frames: 0 };
    }
  });
  return null;
}

function VisitorLayer({ reducedMotion }: { reducedMotion: boolean }) {
  const points = useRef<InstancedMesh>(null);
  const targets = useRef<InstancedMesh>(null);
  const rings = useRef<InstancedMesh>(null);
  const visitorsRecord = useRadarStore((state) => state.visitors);
  const selected = useRadarStore((state) => state.selectedVisitor);
  const visitors = useMemo(
    () => Object.values(visitorsRecord).slice(0, 200),
    [visitorsRecord],
  );
  const placements = useMemo(() => {
    const groups = new Map<string, Visitor[]>();
    visitors.forEach((visitor) =>
      groups.set(visitor.location.city, [
        ...(groups.get(visitor.location.city) ?? []),
        visitor,
      ]),
    );
    return visitors.map((visitor) => {
      const p = position(
        visitor.location.latitude,
        visitor.location.longitude,
        2.026,
      );
      const siblings = groups.get(visitor.location.city)!;
      if (siblings.length > 1) {
        const slot = siblings.findIndex((v) => v.id === visitor.id);
        const tangent = new Vector3()
          .crossVectors(p, new Vector3(0, 1, 0))
          .normalize();
        const second = new Vector3().crossVectors(p, tangent).normalize();
        p.addScaledVector(
          tangent,
          Math.cos(slot * 2.399) * 0.028 * Math.sqrt(slot + 1),
        );
        p.addScaledVector(
          second,
          Math.sin(slot * 2.399) * 0.028 * Math.sqrt(slot + 1),
        );
        p.normalize().multiplyScalar(2.026);
      }
      return p;
    });
  }, [visitors]);
  const { camera } = useThree();
  const previousPlacement = useRef<Vector3[] | null>(null);
  const cursor = useRef(false);
  const temp = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const outward = useMemo(() => new Vector3(), []);

  useFrame(() => {
    if (!points.current || !rings.current || !targets.current) return;
    const now = useRadarStore.getState().now;
    const palette = themePalettes[useRadarStore.getState().themeColor];
    let ringCount = 0;
    visitors.forEach((visitor, i) => {
      const p = placements[i];
      const isSelected = selected?.id === visitor.id;
      const fade =
        visitor.status === "offline"
          ? Math.max(0, 1 - (now - visitor.lastSeen) / 10000)
          : 1;
      temp.position.copy(p);
      temp.scale.setScalar(visitor.status === "offline" ? 0.001 : 0.055);
      temp.updateMatrix();
      targets.current!.setMatrixAt(i, temp.matrix);
      temp.scale.setScalar((isSelected ? 0.027 : 0.02) * Math.max(0.001, fade));
      temp.updateMatrix();
      points.current!.setMatrixAt(i, temp.matrix);
      color.set(
        isSelected
          ? palette.selected
          : visitor.status === "idle"
            ? palette.dim
            : visitor.status === "offline"
              ? "#485a57"
              : palette.live,
      );
      color.multiplyScalar(fade);
      points.current!.setColorAt(i, color);
      const age = (now - visitor.sessionStartedAt) / 1000;
      if (
        ringCount < 12 &&
        fade > 0 &&
        (isSelected || (!reducedMotion && age >= 0 && age < 6))
      ) {
        temp.position.copy(p);
        temp.lookAt(outward.copy(p).multiplyScalar(2));
        const scale = isSelected ? 0.045 : 0.025 + (age % 2) * 0.055;
        temp.scale.setScalar(scale);
        temp.updateMatrix();
        rings.current!.setMatrixAt(ringCount, temp.matrix);
        color
          .set(isSelected ? palette.selected : palette.live)
          .multiplyScalar(isSelected ? 0.8 : Math.max(0, 1 - (age % 2) / 2));
        rings.current!.setColorAt(ringCount++, color);
      }
    });
    points.current.count = visitors.length;
    targets.current.count = visitors.length;
    targets.current.instanceMatrix.needsUpdate = true;
    if (previousPlacement.current !== placements) {
      targets.current.computeBoundingSphere();
      previousPlacement.current = placements;
    }
    points.current.instanceMatrix.needsUpdate = true;
    if (points.current.instanceColor)
      points.current.instanceColor.needsUpdate = true;
    rings.current.count = ringCount;
    rings.current.instanceMatrix.needsUpdate = true;
    if (rings.current.instanceColor)
      rings.current.instanceColor.needsUpdate = true;
  });

  function choose(event: ThreeEvent<MouseEvent>) {
    if (event.instanceId === undefined) return;
    const visitor = visitors[event.instanceId];
    if (!visitor || visitor.status === "offline") return;
    const p = position(visitor.location.latitude, visitor.location.longitude);
    if (p.dot(camera.position.clone().sub(p)) < 0) return;
    event.stopPropagation();
    useRadarStore.getState().select(visitor);
  }
  useEffect(
    () => () => {
      if (cursor.current) document.body.style.cursor = "";
    },
    [],
  );
  return (
    <>
      <instancedMesh
        ref={targets}
        args={[undefined, undefined, 200]}
        frustumCulled={false}
        onClick={choose}
        onPointerOver={(event) => {
          event.stopPropagation();
          cursor.current = true;
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          cursor.current = false;
          document.body.style.cursor = "";
        }}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={points}
        args={[undefined, undefined, 200]}
        frustumCulled={false}
        raycast={() => null}
      >
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={rings}
        args={[undefined, undefined, 12]}
        frustumCulled={false}
        raycast={() => null}
      >
        <ringGeometry args={[0.88, 1, 32]} />
        <meshBasicMaterial
          transparent
          opacity={0.8}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}

function LabelProjection({
  visitors,
  elements,
}: {
  visitors: Visitor[];
  elements: RefObject<Map<string, HTMLSpanElement>>;
}) {
  const positions = useMemo(
    () =>
      visitors.map((visitor) => ({
        id: visitor.id,
        p: position(
          visitor.location.latitude,
          visitor.location.longitude,
          2.06,
        ),
      })),
    [visitors],
  );
  const projected = useMemo(() => new Vector3(), []);
  const direction = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const occupied: { x: number; y: number }[] = [];
    positions.forEach(({ id, p }) => {
      const element = elements.current.get(id);
      if (!element) return;
      projected.copy(p).project(camera);
      const x = ((projected.x + 1) * size.width) / 2;
      const y = ((-projected.y + 1) * size.height) / 2;
      const visible =
        p.dot(direction.copy(camera.position).sub(p)) > 0.45 &&
        Math.abs(projected.x) < 1 &&
        Math.abs(projected.y) < 1 &&
        !occupied.some(
          (other) => Math.abs(other.x - x) < 100 && Math.abs(other.y - y) < 20,
        );
      if (visible) occupied.push({ x, y });
      element.style.opacity = visible ? "1" : "0";
      element.style.transform = `translate(${x}px, ${y}px)`;
    });
  });
  return null;
}

function Camera({
  reducedMotion,
  resetKey,
  zoom,
}: {
  reducedMotion: boolean;
  resetKey: number;
  zoom: number;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const selected = useRadarStore((state) => state.selectedVisitor);
  const target = useRef<Vector3 | null>(null);
  const interrupted = useRef(0);
  const rotation = useMemo(() => new Quaternion(), []);
  const stepRotation = useMemo(() => new Quaternion(), []);
  const from = useMemo(() => new Vector3(), []);
  const to = useMemo(() => new Vector3(), []);
  const { camera, size } = useThree();
  const distance = size.width < 550 ? 6.8 : size.height < 500 ? 6.1 : 6.5;
  const lastSelectedId = selected?.id;
  useEffect(() => {
    const state = useRadarStore.getState();
    if (state.selectedVisitor)
      target.current = position(
        state.selectedVisitor.location.latitude,
        state.selectedVisitor.location.longitude,
        camera.position.length(),
      );
  }, [lastSelectedId, camera]);
  useEffect(() => {
    if (!useRadarStore.getState().selectedVisitor)
      target.current = position(18, 105, distance);
  }, [resetKey, distance]);
  useEffect(() => {
    if (zoom !== 0)
      target.current = camera.position
        .clone()
        .normalize()
        .multiplyScalar(
          Math.max(4.5, Math.min(11, camera.position.length() + zoom)),
        );
  }, [zoom, camera]);
  useFrame((_, delta) => {
    if (target.current) {
      const factor = reducedMotion ? 1 : 1 - Math.exp(-delta * 3);
      const radius =
        camera.position.length() +
        (target.current.length() - camera.position.length()) * factor;
      rotation.setFromUnitVectors(
        from.copy(camera.position).normalize(),
        to.copy(target.current).normalize(),
      );
      stepRotation.identity().slerp(rotation, factor);
      camera.position
        .applyQuaternion(stepRotation)
        .normalize()
        .multiplyScalar(radius);
      controls.current?.update();
      if (camera.position.distanceTo(target.current) < 0.005)
        target.current = null;
    }
    if (controls.current)
      controls.current.autoRotate =
        !reducedMotion &&
        !selected &&
        !useRadarStore.getState().paused &&
        !target.current &&
        performance.now() > interrupted.current;
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.06}
      minDistance={4.5}
      maxDistance={11}
      autoRotateSpeed={0.1}
      onStart={() => {
        target.current = null;
        interrupted.current = performance.now() + 12000;
      }}
    />
  );
}

class GlobeBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <GlobeFallback /> : this.props.children;
  }
}
function GlobeFallback() {
  return (
    <div className="globe-fallback">
      <span>3D VIEW UNAVAILABLE</span>
      <p>
        Enable WebGL to explore the globe.
        <br />
        Visitors and events are still live.
      </p>
    </div>
  );
}

export default function Globe({
  reducedMotion,
  resetKey,
  zoom,
}: {
  reducedMotion: boolean;
  resetKey: number;
  zoom: number;
}) {
  const [visible, setVisible] = useState(true);
  const visitorRecord = useRadarStore((state) => state.visitors);
  const selected = useRadarStore((state) => state.selectedVisitor);
  const labelVisitors = useMemo(() => (selected ? [selected] : []), [selected]);
  const labelElements = useRef(new Map<string, HTMLSpanElement>());
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return (
    <GlobeBoundary>
      <Canvas
        camera={{
          position: position(18, 105, 6.5).toArray(),
          fov: 42,
          near: 0.1,
          far: 50,
        }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        frameloop={visible ? "always" : "never"}
        fallback={<GlobeFallback />}
      >
        <ambientLight intensity={0.85} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={1.5}
          color="#e7ecef"
        />
        <Earth />
        <VisitorLayer reducedMotion={reducedMotion} />
        <Camera reducedMotion={reducedMotion} resetKey={resetKey} zoom={zoom} />
        <LabelProjection visitors={labelVisitors} elements={labelElements} />
        <RenderDiagnostics />
      </Canvas>
      <div className="globe-label-layer" aria-hidden="true">
        {labelVisitors.map((visitor) => (
          <span
            key={visitor.id}
            ref={(element) => {
              if (element) labelElements.current.set(visitor.id, element);
              else labelElements.current.delete(visitor.id);
            }}
            className={`globe-city ${selected ? "selected" : ""}`}
            style={{ opacity: 0 }}
          >
            {visitor.location.city}
            <small>
              {selected ? visitor.id.slice(0, 6) : visitor.location.countryCode}
            </small>
          </span>
        ))}
      </div>
    </GlobeBoundary>
  );
}
