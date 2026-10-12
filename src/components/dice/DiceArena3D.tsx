import { useEffect, useRef } from 'react';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { diceDefinitions } from '../../features/dice/definitions';
import type { DiceArenaStatus, DiceResult, DieDefinition } from '../../features/dice/types';

interface DiceArena3DProps {
  dice: DieDefinition[];
  rollRequest: number;
  onResults: (results: DiceResult[]) => void;
  onStatusChange: (status: DiceArenaStatus) => void;
}

interface DieRuntime {
  body: RAPIER.RigidBody;
  mesh: THREE.Mesh;
  definition: DieDefinition;
}

interface ArenaRuntime {
  world: RAPIER.World;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  dice: DieRuntime[];
  rafId: number | null;
  resizeObserver: ResizeObserver;
  disposed: boolean;
  rolling: boolean;
  lastTime: number;
  accumulator: number;
  settledFrames: number;
  rollStartedAt: number;
  dieGeometry: THREE.BoxGeometry;
  dieMaterials: Map<string, THREE.MeshStandardMaterial[]>;
  minimumFrameInterval: number;
  lastRenderedAt: number;
}

const FIXED_STEP = 1 / 60;
const FACE_NORMALS = [
  { index: 0, normal: new THREE.Vector3(1, 0, 0) },
  { index: 1, normal: new THREE.Vector3(-1, 0, 0) },
  { index: 2, normal: new THREE.Vector3(0, 1, 0) },
  { index: 3, normal: new THREE.Vector3(0, -1, 0) },
  { index: 4, normal: new THREE.Vector3(0, 0, 1) },
  { index: 5, normal: new THREE.Vector3(0, 0, -1) },
] as const;

function makeFaceMaterial(definition: DieDefinition, label: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.MeshStandardMaterial({ color: definition.colorDark });

  const gradient = context.createRadialGradient(96, 80, 8, 128, 128, 180);
  gradient.addColorStop(0, definition.colorLight);
  gradient.addColorStop(1, definition.colorDark);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  context.strokeStyle = definition.inkColor;
  context.lineWidth = 11;
  context.strokeRect(10, 10, 236, 236);
  context.fillStyle = definition.inkColor;
  context.font = label.length > 1 ? '700 104px serif' : '700 126px Georgia';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (label) context.fillText(label, 128, 136);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.58, metalness: 0.08 });
}

function disposeMaterial(material: THREE.Material) {
  if (material instanceof THREE.MeshStandardMaterial) material.map?.dispose();
  material.dispose();
}

function readTopFace(die: DieRuntime): DiceResult {
  const rotation = die.mesh.quaternion;
  let best: { index: number; normal: THREE.Vector3 } = FACE_NORMALS[0];
  let bestY = -Infinity;

  for (const face of FACE_NORMALS) {
    const y = face.normal.clone().applyQuaternion(rotation).y;
    if (y > bestY) {
      bestY = y;
      best = face;
    }
  }

  const face = die.definition.faces[best.index];
  return {
    dieId: `${die.definition.id}-${die.body.handle}`,
    dieType: die.definition.id,
    dieName: die.definition.name,
    faceId: face.id,
    label: face.label || '空白',
    value: face.value,
  };
}

function clearDice(runtime: ArenaRuntime) {
  for (const die of runtime.dice) {
    runtime.world.removeRigidBody(die.body);
    runtime.scene.remove(die.mesh);
  }
  runtime.dice = [];
}

function showReadyDice(runtime: ArenaRuntime, definitions: DieDefinition[]) {
  clearDice(runtime);
  const columnCount = Math.min(definitions.length, 4);
  const rowCount = Math.ceil(definitions.length / columnCount);

  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    const materials = runtime.dieMaterials.get(definition.id);
    if (!materials) continue;

    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const columnsInRow = Math.min(columnCount, definitions.length - row * columnCount);
    const mesh = new THREE.Mesh(runtime.dieGeometry, materials);
    mesh.position.set(
      (column - (columnsInRow - 1) / 2) * 1.05,
      0.54,
      (row - (rowCount - 1) / 2) * 1.1,
    );
    mesh.rotation.set(-0.32 + row * 0.08, 0.48 + index * 0.22, index % 2 ? -0.12 : 0.16);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    runtime.scene.add(mesh);

    const quaternion = mesh.quaternion;
    const body = runtime.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
        .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }),
    );
    runtime.dice.push({ body, mesh, definition });
  }
}

function spawnDice(runtime: ArenaRuntime, definitions: DieDefinition[]) {
  clearDice(runtime);
  const geometrySize = 0.8;
  const columnCount = Math.min(definitions.length, 4);
  const rowCount = Math.ceil(definitions.length / columnCount);

  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    const materials = runtime.dieMaterials.get(definition.id);
    if (!materials) continue;
    const mesh = new THREE.Mesh(runtime.dieGeometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    runtime.scene.add(mesh);

    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const columnsInRow = Math.min(columnCount, definitions.length - row * columnCount);
    const spawnX = (column - (columnsInRow - 1) / 2) * 0.95;
    const spawnZ = (row - (rowCount - 1) / 2) * 1.15;
    const body = runtime.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnX, 3.2 + index * 0.12, spawnZ)
        .setRotation({
          x: Math.random() * 0.8,
          y: Math.random() * 0.8,
          z: Math.random() * 0.8,
          w: 1,
        })
        .setLinearDamping(0.14)
        .setAngularDamping(0.12)
        .setCcdEnabled(true)
        .setCanSleep(true),
    );
    runtime.world.createCollider(
      RAPIER.ColliderDesc.cuboid(geometrySize / 2, geometrySize / 2, geometrySize / 2)
        .setRestitution(0.42)
        .setFriction(0.72),
      body,
    );
    body.setLinvel({
      x: (Math.random() - 0.5) * 0.65,
      y: 1.2 + Math.random() * 1.4,
      z: (Math.random() - 0.5) * 0.65,
    }, true);
    body.setAngvel({
      x: (Math.random() - 0.5) * 14,
      y: (Math.random() - 0.5) * 14,
      z: (Math.random() - 0.5) * 14,
    }, true);
    runtime.dice.push({ body, mesh, definition });
  }
}

export function DiceArena3D({ dice, rollRequest, onResults, onStatusChange }: DiceArena3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ArenaRuntime | null>(null);
  const diceRef = useRef(dice);
  const callbacksRef = useRef({ onResults, onStatusChange });
  diceRef.current = dice;
  callbacksRef.current = { onResults, onStatusChange };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    async function initialize() {
      try {
        callbacksRef.current.onStatusChange('loading');
        await RAPIER.init();
        const host = containerRef.current;
        if (cancelled || !host) return;

        const scene = new THREE.Scene();
        scene.background = null;
        scene.fog = new THREE.Fog('#071013', 8, 18);

        const mobileRendering = window.matchMedia('(max-width: 620px)').matches;
        const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 100);
        camera.position.set(0, mobileRendering ? 11 : 8, mobileRendering ? 5.8 : 8.4);
        camera.lookAt(0, 0.2, 0);

        const renderer = new THREE.WebGLRenderer({
          antialias: false,
          powerPreference: 'high-performance',
          alpha: true,
        });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(mobileRendering ? 1 : Math.min(window.devicePixelRatio, 1.25));
        renderer.shadowMap.enabled = false;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.appendChild(renderer.domElement);

        scene.add(new THREE.HemisphereLight('#b9d1d8', '#15100a', 1.5));
        const keyLight = new THREE.DirectionalLight('#ffd994', 2.8);
        keyLight.position.set(2, 7, 4);
        keyLight.castShadow = renderer.shadowMap.enabled;
        keyLight.shadow.mapSize.set(512, 512);
        scene.add(keyLight);

        const arenaHalfWidth = mobileRendering ? 2.8 : 5;
        const arenaHalfDepth = mobileRendering ? 3.2 : 4;
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(arenaHalfWidth * 2, arenaHalfDepth * 2),
          new THREE.ShadowMaterial({ color: '#020506', opacity: mobileRendering ? 0 : 0.18, transparent: true }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
        world.createCollider(RAPIER.ColliderDesc.cuboid(arenaHalfWidth, 0.15, arenaHalfDepth).setTranslation(0, -0.15, 0).setFriction(0.82));
        const wallHalfHeight = 6;
        const wallCenterY = wallHalfHeight - 0.15;
        const wallThickness = 0.3;
        world.createCollider(RAPIER.ColliderDesc.cuboid(arenaHalfWidth, wallHalfHeight, wallThickness).setTranslation(0, wallCenterY, -arenaHalfDepth));
        world.createCollider(RAPIER.ColliderDesc.cuboid(arenaHalfWidth, wallHalfHeight, wallThickness).setTranslation(0, wallCenterY, arenaHalfDepth));
        world.createCollider(RAPIER.ColliderDesc.cuboid(wallThickness, wallHalfHeight, arenaHalfDepth).setTranslation(-arenaHalfWidth, wallCenterY, 0));
        world.createCollider(RAPIER.ColliderDesc.cuboid(wallThickness, wallHalfHeight, arenaHalfDepth).setTranslation(arenaHalfWidth, wallCenterY, 0));

        const resizeObserver = new ResizeObserver(() => {
          const host = containerRef.current;
          if (!host) return;
          const width = Math.max(host.clientWidth, 1);
          const height = Math.max(host.clientHeight, 1);
          renderer.setSize(width, height, false);
          const aspect = width / height;
          const viewHeight = mobileRendering ? 6.4 : 8;
          camera.left = -(viewHeight * aspect) / 2;
          camera.right = (viewHeight * aspect) / 2;
          camera.top = viewHeight / 2;
          camera.bottom = -viewHeight / 2;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
        });

        const runtime: ArenaRuntime = {
          world, renderer, scene, camera, dice: [], rafId: null, resizeObserver,
          disposed: false, rolling: false, lastTime: performance.now(),
          accumulator: 0, settledFrames: 0, rollStartedAt: 0,
          dieGeometry: new THREE.BoxGeometry(0.8, 0.8, 0.8, 1, 1, 1),
          dieMaterials: new Map(diceDefinitions.map(definition => [definition.id, definition.faces.map(face => makeFaceMaterial(definition, face.label))])),
          minimumFrameInterval: mobileRendering ? 1000 / 30 : 1000 / 45,
          lastRenderedAt: 0,
        };
        runtimeRef.current = runtime;
        resizeObserver.observe(host);
        showReadyDice(runtime, diceRef.current);
        callbacksRef.current.onStatusChange('ready');
        renderer.render(scene, camera);
      } catch {
        callbacksRef.current.onStatusChange('error');
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.disposed = true;
      if (runtime.rafId !== null) cancelAnimationFrame(runtime.rafId);
      runtime.resizeObserver.disconnect();
      clearDice(runtime);
      runtime.dieGeometry.dispose();
      runtime.dieMaterials.forEach(materials => materials.forEach(disposeMaterial));
      runtime.scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(disposeMaterial);
        }
      });
      runtime.renderer.dispose();
      runtime.renderer.forceContextLoss();
      runtime.renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.disposed || runtime.rolling) return;
    showReadyDice(runtime, dice);
    runtime.renderer.render(runtime.scene, runtime.camera);
    callbacksRef.current.onStatusChange('ready');
  }, [dice]);

  useEffect(() => {
    if (rollRequest === 0) return;
    const runtime = runtimeRef.current;
    if (!runtime || runtime.disposed) return;

    spawnDice(runtime, diceRef.current);
    runtime.rolling = true;
    runtime.settledFrames = 0;
    runtime.accumulator = 0;
    runtime.lastTime = performance.now();
    runtime.rollStartedAt = runtime.lastTime;
    runtime.lastRenderedAt = 0;
    callbacksRef.current.onStatusChange('rolling');

    const frame = (time: number) => {
      if (runtime.disposed || !runtime.rolling) {
        runtime.rafId = null;
        return;
      }
      if (document.visibilityState !== 'visible') {
        runtime.lastTime = time;
        runtime.rafId = requestAnimationFrame(frame);
        return;
      }

      if (runtime.lastRenderedAt && time - runtime.lastRenderedAt < runtime.minimumFrameInterval) {
        runtime.rafId = requestAnimationFrame(frame);
        return;
      }
      runtime.lastRenderedAt = time;
      runtime.accumulator += Math.min((time - runtime.lastTime) / 1000, 0.05);
      runtime.lastTime = time;
      let steps = 0;
      while (runtime.accumulator >= FIXED_STEP && steps < 3) {
        runtime.world.step();
        runtime.accumulator -= FIXED_STEP;
        steps += 1;
      }

      let allSettled = runtime.dice.length > 0;
      for (const die of runtime.dice) {
        const position = die.body.translation();
        const rotation = die.body.rotation();
        die.mesh.position.set(position.x, position.y, position.z);
        die.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        const linear = die.body.linvel();
        const angular = die.body.angvel();
        const moving = Math.hypot(linear.x, linear.y, linear.z) > 0.06
          || Math.hypot(angular.x, angular.y, angular.z) > 0.08;
        if (moving && !die.body.isSleeping()) allSettled = false;
      }

      runtime.renderer.render(runtime.scene, runtime.camera);
      runtime.settledFrames = allSettled ? runtime.settledFrames + 1 : 0;
      if (runtime.settledFrames >= 18 || time - runtime.rollStartedAt >= 10_000) {
        runtime.rolling = false;
        callbacksRef.current.onResults(runtime.dice.map(readTopFace));
        callbacksRef.current.onStatusChange('settled');
        runtime.rafId = null;
        return;
      }
      runtime.rafId = requestAnimationFrame(frame);
    };

    if (runtime.rafId !== null) cancelAnimationFrame(runtime.rafId);
    runtime.rafId = requestAnimationFrame(frame);
  }, [rollRequest]);

  return <div ref={containerRef} className="dice-arena-canvas" data-preview-count={dice.length} aria-hidden="true" />;
}
