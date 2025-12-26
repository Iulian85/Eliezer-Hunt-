
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

const GiftBoxModel = ({ collected }: { collected: boolean }) => {
    const boxColor = "#fbbf24"; 
    const ribbonColor = "#ef4444"; 
    return (
        <Group>
            <Box args={[2, 2, 2]}><MeshStandardMaterial color={boxColor} metalness={0.1} roughness={0.4} /></Box>
            <Box args={[2.2, 0.6, 2.2]} position={[0, 0.9, 0]}><MeshStandardMaterial color={boxColor} metalness={0.1} roughness={0.4} /></Box>
            <Box args={[2.22, 0.5, 0.5]} position={[0, 0, 0]}><MeshStandardMaterial color={ribbonColor} metalness={0.5} roughness={0.2} /></Box>
            <Box args={[0.5, 2.22, 0.5]} position={[0, 0, 0]}><MeshStandardMaterial color={ribbonColor} metalness={0.5} roughness={0.2} /></Box>
        </Group>
    );
};

export const Coin3D: React.FC<Coin3DProps> = ({
    onClick, interactive = false, scale = 1, ghost = false, collected = false,
    isSponsored = false, isMoving = true, isEvent = false, customText, logoUrl, isGiftBox = false
}) => {
    const groupRef = useRef<THREE.Group>(null);
    
    const texture = useMemo(() => {
        if (!logoUrl) return null;
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous'); 
        const tex = loader.load(logoUrl);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }, [logoUrl]);

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        if (collected) {
            groupRef.current.rotation.y += 0.8;
            groupRef.current.position.y += 2 * delta;
            groupRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), 0.1);
        } else {
            const targetScaleVector = new THREE.Vector3(scale, scale, scale);
            groupRef.current.scale.lerp(targetScaleVector, delta * 5);
            groupRef.current.rotation.y += 0.04;
            if (isMoving && !isGiftBox) groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 2) * 0.1;
        }
    });

    const primaryColor = isEvent ? "#166534" : (isSponsored ? "#EF4444" : "#FFD700");
    const secondaryColor = isEvent ? "#991B1B" : (isSponsored ? "#7F1D1D" : "#F59E0B");
    const displayText = customText || (isSponsored ? "AD" : (isEvent ? "XMAS" : "ELZR"));

    return (
        <Group ref={groupRef} onClick={(e: any) => { e.stopPropagation(); if (interactive && !collected && !ghost && onClick) onClick(); }}>
            {!collected && !ghost && <Sparkles count={isGiftBox ? 100 : 40} scale={isGiftBox ? 5 : 3} size={20} speed={2} color={primaryColor} />}
            
            <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5} enabled={!collected}>
                {isGiftBox ? (
                    <GiftBoxModel collected={collected} />
                ) : (
                    <>
                        {/* Corpul monedei */}
                        <Cylinder args={[2, 2, 0.25, 32]} rotation={[Math.PI / 2, 0, 0]}>
                            <MeshStandardMaterial color={primaryColor} metalness={0.9} roughness={0.1} emissive={secondaryColor} emissiveIntensity={0.4} />
                        </Cylinder>
                        
                        {/* Textul FATA (lipit) */}
                        <Text 
                            position={[0, 0, 0.13]} 
                            fontSize={displayText.length > 4 ? 0.6 : 0.8} 
                            anchorX="center" anchorY="middle" 
                            outlineWidth={0.04} outlineColor="#000000"
                            font="https://fonts.gstatic.com/s/rajdhani/v15/L7rgdfpPBq9hS5p9p76p.woff"
                        >
                            {displayText}
                            <MeshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
                        </Text>

                        {/* Textul SPATE (lipit) */}
                        <Text 
                            position={[0, 0, -0.13]} 
                            rotation={[0, Math.PI, 0]}
                            fontSize={displayText.length > 4 ? 0.6 : 0.8} 
                            anchorX="center" anchorY="middle" 
                            outlineWidth={0.04} outlineColor="#000000"
                            font="https://fonts.gstatic.com/s/rajdhani/v15/L7rgdfpPBq9hS5p9p76p.woff"
                        >
                            {displayText}
                            <MeshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
                        </Text>

                        {texture && (
                            <Mesh position={[0, 0, 0.135]}>
                                <Circle args={[1.2, 32]}><MeshStandardMaterial map={texture} transparent={true} /></Circle>
                            </Mesh>
                        )}
                    </>
                )}
            </Float>
        </Group>
    );
};
