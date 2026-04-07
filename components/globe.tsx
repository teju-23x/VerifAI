"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { Sphere, MeshDistortMaterial, Float, Stars, Html } from "@react-three/drei"
import { useRef, useState, useMemo, useEffect } from "react"
import * as THREE from "three"

function GlobeMesh({ isProcessing }: { isProcessing: boolean }) {
  const globeRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const targetRotationSpeed = hovered ? 0.05 : 0.005
  const currentRotationSpeed = useRef(0.005)

  useFrame((state, delta) => {
    if (globeRef.current) {
      // Smoothly interpolate rotation speed
      currentRotationSpeed.current = THREE.MathUtils.lerp(
        currentRotationSpeed.current,
        targetRotationSpeed,
        0.1
      )

      const speedMultiplier = isProcessing ? 3 : 1
      globeRef.current.rotation.y += currentRotationSpeed.current * speedMultiplier * 60 * delta
    }
  })

  // Grid lines geometry
  const gridLines = useMemo(() => {
    const lines = []
    const segments = 32
    const radius = 1.01

    // Latitudes
    for (let i = 1; i < 6; i++) {
      const phi = (i * Math.PI) / 6
      const points = []
      for (let j = 0; j <= segments; j++) {
        const theta = (j / segments) * Math.PI * 2
        points.push(new THREE.Vector3(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        ))
      }
      lines.push(points)
    }

    // Longitudes
    for (let i = 0; i < 12; i++) {
      const theta = (i * Math.PI) / 6
      const points = []
      for (let j = 0; j <= segments; j++) {
        const phi = (j / segments) * Math.PI
        points.push(new THREE.Vector3(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        ))
      }
      lines.push(points)
    }

    return lines
  }, [])

  return (
    <group
      ref={globeRef}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Dark Core Sphere */}
      <Sphere args={[1, 64, 64]}>
        <meshStandardMaterial
          color="#051518"
          metalness={0.9}
          roughness={0.1}
          emissive="#00d4aa"
          emissiveIntensity={0.05}
        />
      </Sphere>

      {/* Grid Lines */}
      {gridLines.map((points, i) => (
        <line key={i}>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              count={points.length}
              array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial attach="material" color="#00d4aa" opacity={0.4} transparent />
        </line>
      ))}

      {/* Inner Glow */}
      <Sphere args={[0.95, 32, 32]}>
        <meshBasicMaterial color="#00fff0" transparent opacity={0.1} side={THREE.BackSide} />
      </Sphere>
    </group>
  )
}

function OrbitingParticles({ count = 20 }: { count?: number }) {
  const particles = useMemo(() => {
    const temp = []
    for (let i = 0; i < count; i++) {
      temp.push({
        radius: 1.5 + Math.random() * 0.5,
        speed: 0.2 + Math.random() * 0.5,
        angle: Math.random() * Math.PI * 2,
        offset: Math.random() * Math.PI * 2,
        size: 0.01 + Math.random() * 0.02
      })
    }
    return temp
  }, [count])

  const groupRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        const p = particles[i]
        const time = state.clock.elapsedTime * p.speed
        child.position.x = Math.cos(time + p.offset) * p.radius
        child.position.y = Math.sin(time * 0.5) * 0.5
        child.position.z = Math.sin(time + p.offset) * p.radius
      })
    }
  })

  return (
    <group ref={groupRef}>
      {particles.map((p, i) => (
        <mesh key={i}>
          <sphereGeometry args={[p.size, 8, 8]} />
          <meshBasicMaterial color="#00d4aa" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function OuterShield() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.z -= 0.005
    }
  })
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[2.2, 2.22, 64]} />
      <meshBasicMaterial color="#00d4aa" transparent opacity={0.2} transparent side={THREE.DoubleSide} />
    </mesh>
  )
}

export default function Globe({ isProcessing = false }: { isProcessing?: boolean }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* CSS Halo Glow */}
      <div
        className={`absolute w-32 h-32 rounded-full transition-all duration-1000 ${isProcessing ? "scale-125 opacity-40 shadow-[0_0_80px_#00d4aa]" : "scale-100 opacity-20 shadow-[0_0_60px_#00d4aa40]"
          }`}
        style={{
          background: "radial-gradient(circle, rgba(0,212,170,0.3) 0%, transparent 70%)"
        }}
      />

      <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#00d4aa" />

        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
          <GlobeMesh isProcessing={isProcessing} />
          <OrbitingParticles />
          <OuterShield />
        </Float>

        {/* Pulsing Dash Ring (CSS or 3D) */}
        <mesh rotation={[Math.PI / 2.2, 0, 0]}>
          <torusGeometry args={[1.8, 0.005, 16, 100]} />
          <meshBasicMaterial color="#00d4aa" transparent opacity={0.15} />
        </mesh>
      </Canvas>
    </div>
  )
}
