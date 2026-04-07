"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { Environment, MeshReflectorMaterial, Float } from "@react-three/drei"
import { useState, useRef, useMemo } from "react"
import * as THREE from "three"

function GlowingSphere() {
  const sphereRef = useRef<THREE.Mesh>(null)
  const innerLightRef = useRef<THREE.PointLight>(null)

  useFrame((state) => {
    if (sphereRef.current) {
      sphereRef.current.rotation.y += 0.002
      sphereRef.current.rotation.x += 0.001
    }
    if (innerLightRef.current) {
      // Pulsing inner light
      const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.5 + 1.5
      innerLightRef.current.intensity = pulse * 3
    }
  })

  return (
    <group>
      {/* Inner teal light source */}
      <pointLight
        ref={innerLightRef}
        position={[0, 0, 0]}
        color="#00fff0"
        intensity={3}
        distance={10}
        decay={2}
      />
      
      {/* Core glowing sphere */}
      <mesh position={[0, 0, 0]} scale={0.3}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#00fff0" transparent opacity={0.9} />
      </mesh>

      {/* Main reflective sphere */}
      <mesh ref={sphereRef} position={[0, 0, 0]}>
        <sphereGeometry args={[1.2, 64, 64]} />
        <meshPhysicalMaterial
          color="#003333"
          metalness={0.9}
          roughness={0.1}
          transmission={0.3}
          thickness={0.5}
          envMapIntensity={2}
          clearcoat={1}
          clearcoatRoughness={0.1}
          ior={1.5}
          emissive="#00d4aa"
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* Outer glow shell */}
      <mesh position={[0, 0, 0]} scale={1.35}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color="#00d4aa"
          transparent
          opacity={0.08}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  )
}

function OrbitingRing() {
  const ringRef = useRef<THREE.Group>(null)
  const ringMeshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += 0.008
      ringRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.1 + 0.3
    }
  })

  return (
    <group ref={ringRef} rotation={[0.3, 0, 0]}>
      {/* Main ring */}
      <mesh ref={ringMeshRef}>
        <torusGeometry args={[2, 0.03, 16, 100]} />
        <meshStandardMaterial
          color="#00fff0"
          emissive="#00d4aa"
          emissiveIntensity={2}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      
      {/* Ring glow */}
      <mesh>
        <torusGeometry args={[2, 0.08, 16, 100]} />
        <meshBasicMaterial
          color="#00fff0"
          transparent
          opacity={0.2}
        />
      </mesh>

      {/* Orbiting particle on ring */}
      <Float speed={0} rotationIntensity={0} floatIntensity={0}>
        <OrbitingParticle radius={2} speed={1.5} />
      </Float>
    </group>
  )
}

function OrbitingParticle({ radius, speed }: { radius: number; speed: number }) {
  const particleRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (particleRef.current) {
      const angle = state.clock.elapsedTime * speed
      particleRef.current.position.x = Math.cos(angle) * radius
      particleRef.current.position.y = Math.sin(angle) * radius
    }
  })

  return (
    <mesh ref={particleRef}>
      <sphereGeometry args={[0.08, 16, 16]} />
      <meshBasicMaterial color="#00fff0" />
      <pointLight color="#00fff0" intensity={2} distance={2} />
    </mesh>
  )
}

function FloatingParticles() {
  const particlesRef = useRef<THREE.Points>(null)

  const particles = useMemo(() => {
    const positions = new Float32Array(60 * 3)
    const speeds = new Float32Array(60)
    
    for (let i = 0; i < 60; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 1.5 + Math.random() * 2

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)
      speeds[i] = 0.01 + Math.random() * 0.02
    }

    return { positions, speeds }
  }, [])

  useFrame(() => {
    if (particlesRef.current) {
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array
      for (let i = 0; i < 60; i++) {
        positions[i * 3 + 1] += particles.speeds[i]
        if (positions[i * 3 + 1] > 4) {
          positions[i * 3 + 1] = -2
        }
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={60}
          array={particles.positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#00fff0"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  )
}

function Scene({ isSmall }: { isSmall: boolean }) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.1
    }
  })

  const scale = isSmall ? 0.4 : 1

  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 5]} intensity={0.5} color="#00d4aa" />
      <directionalLight position={[-5, -5, -5]} intensity={0.3} color="#00fff0" />
      
      <group ref={groupRef} scale={scale}>
        <Float
          speed={2}
          rotationIntensity={0.2}
          floatIntensity={0.5}
        >
          <GlowingSphere />
          <OrbitingRing />
        </Float>
        <FloatingParticles />
      </group>

      <Environment preset="night" />
    </>
  )
}

interface ThreeOrbProps {
  isSmall?: boolean
  className?: string
}

export default function ThreeOrb({ isSmall = false, className = "" }: ThreeOrbProps) {
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <div className={`${className} flex items-center justify-center`}>
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-teal-500/20 to-cyan-500/20 animate-pulse" />
      </div>
    )
  }

  return (
    <div className={`${className}`}>
      <Canvas
        camera={{ position: [0, 0, isSmall ? 4 : 6], fov: 45 }}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false 
        }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault()
            console.warn("WebGL Context Lost")
            setHasError(true)
          }, false)
        }}
        style={{ background: "transparent" }}
      >
        <Scene isSmall={isSmall} />
      </Canvas>
    </div>
  )
}
