import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, Matrix4, Vector3 } from 'three';
import { createNoise3D } from 'simplex-noise';

const NUM_DRONES = 700;
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const DRONE_COLOR = '#FFE6B3';

// Helper to get points from canvas
function getPointsFromDigit(digit: string): Vector3[] {
  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 80px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(digit, size / 2, size / 2);

  const imageData = ctx.getImageData(0, 0, size, size).data;
  const points: Vector3[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const red = imageData[(y * size + x) * 4];
      if (red > 128) {
        points.push(new Vector3(
          (x / size - 0.5) * 12.8,
          -(y / size - 0.5) * 12.8 - 0.5, 
          (Math.random() - 0.5) * 0.6
        ));
      }
    }
  }

  const sampledPoints: Vector3[] = [];
  if (points.length === 0) return Array(NUM_DRONES).fill(0).map(() => new Vector3());

  for (let i = 0; i < NUM_DRONES; i++) {
    const idx = Math.floor((i / NUM_DRONES) * points.length);
    sampledPoints.push(points[idx].clone());
  }
  return sampledPoints;
}

export function DroneSwarm({ digitIdx }: { digitIdx: number }) {
  const meshRef = useRef<InstancedMesh>(null);
  const noise3D = useMemo(() => createNoise3D(), []);

  // Pre-calculate target positions for all digits
  const digitPoints = useMemo(() => {
    return DIGITS.map(d => getPointsFromDigit(d));
  }, []);

  // Physics state
  const drones = useMemo(() => {
    return Array(NUM_DRONES).fill(0).map(() => ({
      position: new Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      ),
      velocity: new Vector3(),
      target: new Vector3(),
      noiseOffset: Math.random() * 1000
    }));
  }, []);

  useEffect(() => {
    const targetSet = digitPoints[digitIdx];
    drones.forEach((drone, i) => {
      drone.target.copy(targetSet[i]);
    });
  }, [digitIdx, digitPoints, drones]);

  const tempMatrix = useMemo(() => new Matrix4(), []);
  const tempColor = useMemo(() => new Color(DRONE_COLOR), []);

  const lastChangeTime = useRef(0);
  const prevDigitIdx = useRef(digitIdx);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    if (!meshRef.current) return;

    if (prevDigitIdx.current !== digitIdx) {
      lastChangeTime.current = time;
      prevDigitIdx.current = digitIdx;
    }
    const timeSinceChange = time - lastChangeTime.current;
    
    let jitterMultiplier = 1.0;
    if (timeSinceChange > 1.0) {
      jitterMultiplier = Math.max(0.15, 1.0 - (timeSinceChange - 1.0) * 0.85);
    }

    const stiffness = 9.34;
    const damping = 0.92;
    const jitterMag = 0.02 * jitterMultiplier;

    drones.forEach((drone, i) => {
      // Spring force
      const displacement = new Vector3().subVectors(drone.target, drone.position);
      const force = displacement.multiplyScalar(stiffness);

      // Noise jitter
      const nx = noise3D(drone.noiseOffset, 0, time * 0.5) * jitterMag;
      const ny = noise3D(0, drone.noiseOffset, time * 0.5) * jitterMag;
      const nz = noise3D(drone.noiseOffset, drone.noiseOffset, time * 0.5) * jitterMag;
      
      drone.velocity.add(force.multiplyScalar(delta));
      drone.velocity.multiplyScalar(damping);
      drone.position.add(new Vector3().copy(drone.velocity).multiplyScalar(delta));
      
      // Apply jitter to view position (don't accumulate in physics for stability)
      const renderPos = drone.position.clone().add(new Vector3(nx, ny, nz));

      tempMatrix.setPosition(renderPos);
      meshRef.current?.setMatrixAt(i, tempMatrix);
      meshRef.current?.setColorAt(i, tempColor);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, NUM_DRONES]} renderOrder={2}>
        <sphereGeometry args={[0.022, 12, 12]} />
        <meshStandardMaterial emissive={DRONE_COLOR} emissiveIntensity={3} toneMapped={false} />
      </instancedMesh>
    </>
  );
}
