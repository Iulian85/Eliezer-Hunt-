
import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Cylinder, Sparkles, Float, Circle, Box, Octahedron } from '@react-three/drei';
import * as THREE from 'three';

const Group = 'group' as any;
const Mesh = 'mesh' as any;
const Primitive = 'primitive' as any;
const SphereGeometry = 'sphereGeometry' as any;
const MeshStandardMaterial = 'meshStandardMaterial' as any;

interface Coin3DProps {
    onClick?: () => void;
    interactive?: boolean;
    scale?: number;
    ghost?: boolean;
    collected?: boolean;
    isSponsored?: boolean;
    isMoving?: boolean;
    isEvent?: boolean;
    customText?: string; 
    logoUrl?: string;    
    isGiftBox?: boolean;
}

// Fix: Adding key to the props type to avoid TypeScript error when used in an array map
const FloatingStar = ({ position, color, speed }: { position: [number, number, number], color: string, speed: number, key?: React.Key }) => {
    const starRef = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        if (starRef.current) {
            starRef.current.rotation.y += 0.02;
            starRef.current.rotation.x += 0.01;
            starRef.current.position.y += Math.sin(state.clock.elapsedTime * speed) * 0.005;
        }
    });

    return (
        <Octahedron ref={starRef} args={[0.2, 0]} position={position}>
            <MeshStandardMaterial 
                color={color} 
                emissive={color} 
                emissiveIntensity={1.5} 
                metalness={1} 
                roughness={0} 
            />
        </Octahedron>
    );
};

const GiftBoxModel = ({ collected }: { collected: boolean }) => {
    // Beautiful colors from the reference images: Amber Box + Red Ribbon
    const boxColor = "#fbbf24"; // Vibrant Amber
    const ribbonColor = "#ef4444"; // Bold Red
    const goldColor = "#fcd34d"; // Gold highlights

    const starPositions: { pos: [number, number, number], color: string, speed: number }[] = [
        { pos: [2.5, 1, 1], color: "#22d3ee", speed: 1.2 },  // Cyan
        { pos: [-2.2, 1.5, -1], color: "#f472b6", speed: 1.5 }, // Pink
        { pos: [1.5, 2.5, -2], color: "#fbbf24", speed: 0.8 }, // Yellow
        { pos: [-2.5, -1, 2], color: "#4ade80", speed: 2.0 },  // Green
        { pos: [0, 3, 1], color: "#ffffff", speed: 1.1 },    // White
    ];

    return (
        <Group>
            {/* Main Box Body */}
            <Box args={[2, 2, 2]}>
                <MeshStandardMaterial color={boxColor} metalness={0.1} roughness={0.4} />
            </Box>
            
            {/* The Lid */}
            <Box args={[2.2, 0.6, 2.2]} position={[0, 0.9, 0]}>
                <MeshStandardMaterial color={boxColor} metalness={0.1} roughness={0.4} />
            </Box>

            {/* Ribbons */}
            {/* X-axis Ribbon */}
            <Box args={[2.22, 0.5, 0.5]} position={[0, 0, 0]}>
                <MeshStandardMaterial color={ribbonColor} metalness={0.5} roughness={0.2} />
            </Box>
            {/* Z-axis Ribbon */}
            <Box args={[0.5, 2.22, 0.5]} position={[0, 0, 0]}>
                <MeshStandardMaterial color={ribbonColor} metalness={0.5} roughness={0.2} />
            </Box>
            {/* Lid Ribbon Cross */}
            <Box args={[2.25, 0.1, 0.5]} position={[0, 1.2, 0]}>
                <MeshStandardMaterial color={ribbonColor} metalness={0.5} roughness={0.2} />
            </Box>
            <Box args={[0.5, 0.1, 2.25]} position={[0, 1.2, 0]}>
                <MeshStandardMaterial color={ribbonColor} metalness={0.5} roughness={0.2} />
            </Box>

            {/* Stylized Bow Loops */}
            <Group position={[0, 1.4, 0]} rotation={[0, 0.7, 0]}>
                <Group rotation={[0, 0, 0.5]}>
                    <Cylinder args={[0.4, 0.4, 0.15, 16]} rotation={[Math.PI / 2, 0, 0]} position={[0.4, 0, 0]}>
                        <MeshStandardMaterial color={ribbonColor} metalness={0.3} roughness={0.5} />
                    </Cylinder>
                </Group>
                <Group rotation={[0, 0, -0.5]}>
                    <Cylinder args={[0.4, 0.4, 0.15, 16]} rotation={[Math.PI / 2, 0, 0]} position={[-0.4, 0, 0]}>
                        <MeshStandardMaterial color={ribbonColor} metalness={0.3} roughness={0.5} />
                    </Cylinder>
                </Group>
                {/* Center Knot */}
                <Box args={[0.4, 0.4, 0.4]} position={[0, -0.1, 0]}>
                    <MeshStandardMaterial color={ribbonColor} metalness={0.4} roughness={0.3} />
                </Box>
            </Group>

            {/* Magical Floating Stars */}
            {!collected && starPositions.map((star, idx) => (
                <FloatingStar key={idx} position={star.pos} color={star.color} speed={star.speed} />
            ))}
        </Group>
    );
};

export const Coin3D: React.FC<Coin3DProps> = ({
    onClick,
    interactive = false,
    scale = 1,
    ghost = false,
    collected = false,
    isSponsored = false,
    isMoving = true,
    isEvent = false,
    customText,
    logoUrl,
    isGiftBox = false
}) => {
    const groupRef = useRef<THREE.Group>(null);
    const [hovered, setHovered] = useState(false);

    const texture = useMemo(() => {
        if (!logoUrl) return null;
        try {
            const loader = new THREE.TextureLoader();
            loader.setCrossOrigin('anonymous'); 
            const tex = loader.load(logoUrl);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearFilter;
            return tex;
        } catch (e) {
            console.error("Coin3D: Failed to load texture", e);
            return null;
        }
    }, [logoUrl]);

    const dots = useMemo(() => {
        const items = [];
        const radius = 1.5;
        const count = 16;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            items.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
        }
        return items;
    }, []);

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        if (collected) {
            groupRef.current.rotation.y += 0.8;
            groupRef.current.rotation.z += 0.5;
            groupRef.current.position.y += 2 * delta;
            groupRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), 0.1);
        } else {
            const targetScaleVector = new THREE.Vector3(scale, scale, scale);
            groupRef.current.scale.lerp(targetScaleVector, delta * 5);
            
            if (isGiftBox) {
                // Mysterious wobble
                groupRef.current.rotation.y += 0.4 * delta;
                groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5) * 0.15;
                groupRef.current.rotation.x = Math.cos(state.clock.elapsedTime * 1.2) * 0.15;
            } else {
                groupRef.current.rotation.y += 0.05;
                if (isMoving) groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 3) * 0.2;
            }
        }
    });

    const handleClick = (e: any) => {
        if (interactive && !collected && !ghost) {
            e.stopPropagation();
            if (onClick) onClick();
        }
    };

    const primaryColor = isEvent ? "#166534" : (isSponsored ? "#DC2626" : "#FFD700");
    const secondaryColor = isEvent ? "#991B1B" : (isSponsored ? "#991B1B" : "#F59E0B");
    const sparkleColor = isGiftBox ? "#ffffff" : (isEvent ? "#ffffff" : "#FFF700");

    const mainMaterial = useMemo(() => new THREE.MeshStandardMaterial({
        color: primaryColor, metalness: 0.9, roughness: 0.1, emissive: secondaryColor, emissiveIntensity: 0.6,
    }), [primaryColor, secondaryColor]);

    const faceMaterial = useMemo(() => new THREE.MeshStandardMaterial({
        color: secondaryColor, metalness: 0.8, roughness: 0.3,
    }), [isSponsored, isEvent, secondaryColor]);

    const displayText = isSponsored ? "AD" : (customText || (isEvent ? "XMAS" : "ELZR"));

    return (
        <Group ref={groupRef} onClick={handleClick}
            onPointerOver={() => interactive && !ghost && setHovered(true)}
            onPointerOut={() => interactive && !ghost && setHovered(false)}
        >
            {(isMoving || isGiftBox) && !collected && !ghost && (
                 <Sparkles 
                    count={isGiftBox ? 150 : 50} 
                    scale={isGiftBox ? 6 : 4} 
                    size={isGiftBox ? 30 : 15} 
                    speed={isGiftBox ? 4 : 2} 
                    opacity={1} 
                    color={sparkleColor} 
                    noise={0.5} 
                />
            )}

            <Float 
                speed={isGiftBox ? 6 : 5} 
                rotationIntensity={isGiftBox ? 2 : 0.5} 
                floatIntensity={isGiftBox ? 2 : 0.5} 
                enabled={!collected}
            >
                {isGiftBox ? (
                    <GiftBoxModel collected={collected} />
                ) : (
                    <>
                        <Cylinder args={[2, 2, 0.25, 32]} rotation={[Math.PI / 2, 0, 0]}>
                            <Primitive object={mainMaterial} attach="material" />
                        </Cylinder>
                        <Cylinder args={[1.7, 1.7, 0.26, 32]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                            <Primitive object={faceMaterial} attach="material" />
                        </Cylinder>

                        {!ghost && dots.map((dot, i) => (
                            <Group key={i}>
                                <Mesh position={[dot.x, dot.y, 0.14]}>
                                    <SphereGeometry args={[0.08, 8, 8]} />
                                    <MeshStandardMaterial color={isEvent ? "#ef4444" : "#FFFFE0"} emissive={isEvent ? "#ef4444" : "#FFFFFF"} emissiveIntensity={1} />
                                </Mesh>
                                <Mesh position={[dot.x, dot.y, -0.14]}>
                                    <SphereGeometry args={[0.08, 8, 8]} />
                                    <MeshStandardMaterial color={isEvent ? "#ef4444" : "#FFFFE0"} emissive={isEvent ? "#ef4444" : "#FFFFFF"} emissiveIntensity={1} />
                                </Mesh>
                            </Group>
                        ))}

                        <Text position={[0, 0, 0.15]} fontSize={displayText.length > 5 ? 0.8 : 1.1} anchorX="center" anchorY="middle" outlineWidth={0.04} outlineColor="#2a1a00">
                            {displayText}
                            <MeshStandardMaterial color={isEvent ? "#ffffff" : primaryColor} emissive={primaryColor} emissiveIntensity={isSponsored ? 0.5 : 0} />
                        </Text>

                        {texture ? (
                            <Mesh position={[0, 0, -0.15]} rotation={[0, Math.PI, 0]}>
                                <Circle args={[1.6, 32]}>
                                    <MeshStandardMaterial map={texture} transparent={true} side={THREE.DoubleSide} emissive="#ffffff" emissiveIntensity={0.5} />
                                </Circle>
                            </Mesh>
                        ) : (
                            <Text position={[0, 0, -0.15]} rotation={[0, Math.PI, 0]} fontSize={1.8} anchorX="center" anchorY="middle" outlineWidth={0.04} outlineColor="#2a1a00">
                                {isEvent ? "🎄" : "$"}
                                <MeshStandardMaterial color={primaryColor} />
                            </Text>
                        )}
                    </>
                )}
            </Float>
        </Group>
    );
};