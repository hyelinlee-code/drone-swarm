import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { DroneSwarm } from './DroneSwarm';
import { useEffect, useState, useMemo, Suspense, useRef } from 'react';
import * as THREE from 'three';

function HanRiverBackdrop() {
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const matARef = useRef<THREE.MeshBasicMaterial | null>(null);
  const matBRef = useRef<THREE.MeshBasicMaterial | null>(null);

  const { texA, texB } = useMemo(() => {
    const makeVideo = () => {
      const v = document.createElement('video');
      v.src = '/han-river-night.mp4';
      v.crossOrigin = 'anonymous';
      v.loop = true;
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      v.play().catch(() => {});
      return v;
    };
    const videoA = makeVideo();
    const videoB = makeVideo();
    videoARef.current = videoA;
    videoBRef.current = videoB;

    // Offset video B by half the duration once metadata is ready
    videoB.addEventListener('loadedmetadata', () => {
      videoB.currentTime = videoB.duration / 2;
    });

    const texA = new THREE.VideoTexture(videoA);
    const texB = new THREE.VideoTexture(videoB);
    texA.colorSpace = THREE.SRGBColorSpace;
    texB.colorSpace = THREE.SRGBColorSpace;
    return { texA, texB };
  }, []);

  const { camera } = useThree();
  
  const { planeWidth, planeHeight, planeY, planeZ } = useMemo(() => {
    const aspect = 2.0; // 768 / 384
    
    // Calculate vertical position so bottom is at bottom of frustum
    const fov = (camera as THREE.PerspectiveCamera).fov || 45;
    const vFOV = (fov * Math.PI) / 180;
    
    const planeZ = -3;
    const distance = Math.abs(10 - planeZ); 
    const visibleHeight = 2 * Math.tan(vFOV / 2) * distance;
    const visibleWidth = visibleHeight * (camera as THREE.PerspectiveCamera).aspect;
    
    // Cover the viewport: scale so plane fills both dimensions, accepting some horizontal crop on narrow viewports.
    const widthFitPlaneWidth = visibleWidth;
    const heightFitPlaneWidth = visibleHeight * aspect;
    const planeWidth = Math.max(widthFitPlaneWidth, heightFitPlaneWidth);
    const planeHeight = planeWidth / aspect;
    
    // Plane's bottom (-planeHeight / 2) should align with frustum bottom (-visibleHeight / 2)
    const planeY = -(visibleHeight / 2) + (planeHeight / 2);
    
    return { planeWidth, planeHeight, planeY, planeZ };
  }, [camera.aspect, (camera as THREE.PerspectiveCamera).fov]);

  useFrame(() => {
    const vA = videoARef.current;
    const vB = videoBRef.current;
    if (!vA || !vB || !vA.duration || !vB.duration) return;

    const D = vA.duration;
    const FADE = 0.5;

    const fadeAlpha = (t: number) => {
      // returns 0 within FADE seconds of the boundary (start or end), 1 in the middle
      if (t < FADE) return t / FADE;
      if (t > D - FADE) return Math.max(0, (D - t) / FADE);
      return 1;
    };

    const alphaA = fadeAlpha(vA.currentTime);
    const alphaB = fadeAlpha(vB.currentTime);

    if (matARef.current) matARef.current.opacity = alphaA;
    if (matBRef.current) matBRef.current.opacity = alphaB;
  });

  return (
    <>
      <mesh position={[0, planeY, -3]} renderOrder={1}>
        <planeGeometry args={[planeWidth, planeHeight]} />
        <meshBasicMaterial
          ref={matARef}
          map={texA}
          color="#ffffff"
          transparent
          alphaTest={0}
          opacity={1}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, planeY, -2.99]} renderOrder={1}>
        <planeGeometry args={[planeWidth, planeHeight]} />
        <meshBasicMaterial
          ref={matBRef}
          map={texB}
          color="#ffffff"
          transparent
          alphaTest={0}
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

function SceneContent({ digitIdx, appState }: { digitIdx: number, appState: 'idle' | 'counting' | 'ended' }) {
  useFrame(() => {
    // Camera intentionally static. The drone swarm itself provides motion.
  });

  return (
    <group>
      {appState === 'counting' && <DroneSwarm digitIdx={digitIdx} />}
    </group>
  );
}

export function Scene() {
  const [appState, setAppState] = useState<'idle' | 'counting' | 'ended'>('idle');
  const [digitIdx, setDigitIdx] = useState(9);

  useEffect(() => {
    if (appState !== 'counting') return;
    if (digitIdx <= 0) {
      // currently holding "1" — after 3.5s, go directly to ended
      const timeout = setTimeout(() => setAppState('ended'), 3500);
      return () => clearTimeout(timeout);
    } else {
      // count down to next digit after 3.5s
      const timeout = setTimeout(() => setDigitIdx((prev) => prev - 1), 3500);
      return () => clearTimeout(timeout);
    }
  }, [appState, digitIdx]);

  const handleStart = () => {
    setDigitIdx(9);
    setAppState('counting');
  };
  
  const handleRestart = handleStart;

  return (
    <div className="w-full h-full relative overflow-hidden" id="scene-container">
      {/* CSS Background Gradient */}
      <div 
        className="absolute inset-0 z-0" 
        style={{ background: 'linear-gradient(to bottom, #0a1228 0%, #131e3e 100%)' }} 
      />
      
      {/* Bloom Layer Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none z-15"
        style={{ background: 'radial-gradient(circle at center, rgba(96,165,250,0.05) 0%, transparent 70%)' }}
      />

      <div className="absolute inset-0 z-10">
        <Canvas
          camera={{ position: [0, 0, 10], fov: 45 }}
          dpr={[1, 2]}
          gl={{ antialias: false, stencil: false, depth: true, alpha: true }}
        >
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          
          <Suspense fallback={null}>
            <HanRiverBackdrop />
          </Suspense>
          <SceneContent digitIdx={digitIdx} appState={appState} />
          
          <EffectComposer>
            <Bloom 
              intensity={0.7} 
              luminanceThreshold={0.85} 
              mipmapBlur 
              radius={0.4}
            />
          </EffectComposer>
        </Canvas>
      </div>

      {appState === 'idle' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25 font-mono">
          <div className="text-center px-6">
            <h1 className="text-white text-5xl md:text-6xl tracking-[0.25em] mb-4">DRONE SWARM</h1>
            <p className="text-white/70 text-xs md:text-sm tracking-[0.3em] mb-10">HAN RIVER NIGHT · SEOUL</p>
            <p className="text-white/55 text-sm max-w-md mx-auto mb-14 leading-relaxed tracking-wide">
              700 drones light up the skyline, counting from 1 to 10 above the river.
            </p>
            <button
              onClick={handleStart}
              className="px-14 py-3 border border-white/40 text-white text-sm tracking-[0.4em] hover:bg-white/10 hover:border-white/70 transition-colors duration-300 cursor-pointer pointer-events-auto"
            >
              START
            </button>
          </div>
        </div>
      )}

      {appState === 'ended' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25 font-mono">
          <div className="text-center px-6">
            <h1 className="text-white text-4xl md:text-5xl tracking-[0.25em] mb-6">GOODNIGHT, SEOUL</h1>
            <p className="text-white/60 text-sm max-w-md mx-auto mb-14 leading-relaxed tracking-wide">
              The countdown is complete. The river still flows.
            </p>
            <button
              onClick={handleRestart}
              className="px-14 py-3 border border-white/40 text-white text-sm tracking-[0.4em] hover:bg-white/10 hover:border-white/70 transition-colors duration-300 cursor-pointer pointer-events-auto"
            >
              RESTART
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
