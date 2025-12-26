
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Cylinder, Sparkles, Float, Circle, Box } from '@react-three/drei';
import * as THREE from 'three';

const Group = 'group' as any;
const Mesh = 'mesh' as any;

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
            <Box args={[2, 2, 2]}><MeshStandardMaterial color={boxColor} metalness={0.5} roughness={0.2} emissive={boxColor} emissiveIntensity={0.2} /></Box>
            <Box args={[2.2, 0.6, 2.2]} position={[0, 0.9, 0]}><MeshStandardMaterial color={boxColor} metalness={0.5} roughness={0.2} /></Box>
            <Box args={[2.22, 0.5, 0.5]} position={[0, 0, 0]}><MeshStandardMaterial color={ribbonColor} metalness={0.8} roughness={0.1} emissive={ribbonColor} emissiveIntensity={0.5} /></Box>
            <Box args={[0.5, 2.22, 0.5]} position={[0, 0, 0]}><MeshStandardMaterial color={ribbonColor} metalness={0.8} roughness={0.1} /></Box>
        </Group>
    );
};

const MeshStandardMaterial = 'meshStandardMaterial' as any;

export const Coin3D: React.FC<Coin3DProps> = ({
    onClick, interactive = false, scale = 1, collected = false,
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
            groupRef.current.rotation.y += 1.2;
            groupRef.current.position.y += 3 * delta;
            groupRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), 0.15);
        } else {
            const targetScaleVector = new THREE.Vector3(scale, scale, scale);
            groupRef.current.scale.lerp(targetScaleVector, delta * 6);
            groupRef.current.rotation.y += 0.05;
            if (isMoving && !isGiftBox) groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 2.5) * 0.15;
        }
    });

    const primaryColor = isEvent ? "#16a34a" : (isSponsored ? "#dc2626" : "#fbbf24");
    const secondaryColor = isEvent ? "#14532d" : (isSponsored ? "#7f1d1d" : "#b45309");
    const displayText = customText || (isSponsored ? "AD" : (isEvent ? "XMAS" : "ELZR"));

    return (
        <Group ref={groupRef} onClick={(e: any) => { e.stopPropagation(); if (interactive && !collected && onClick) onClick(); }}>
            {!collected && <Sparkles count={isGiftBox ? 120 : 60} scale={isGiftBox ? 6 : 4} size={25} speed={3} color={primaryColor} />}
            
            <Float speed={3} rotationIntensity={0.8} floatIntensity={0.8} enabled={!collected}>
                {isGiftBox ? (
                    <GiftBoxModel collected={collected} />
                ) : (
                    <>
                        <Cylinder args={[2, 2, 0.3, 32]} rotation={[Math.PI / 2, 0, 0]}>
                            <MeshStandardMaterial color={primaryColor} metalness={0.9} roughness={0.1} emissive={primaryColor} emissiveIntensity={0.6} />
                        </Cylinder>
                        
                        <Text 
                            position={[0, 0, 0.16]} 
                            fontSize={displayText.length > 4 ? 0.7 : 0.9} 
                            anchorX="center" anchorY="middle" 
                            outlineWidth={0.06} outlineColor="#000000"
                            font="https://fonts.gstatic.com/s/rajdhani/v15/L7rgdfpPBq9hS5p9p76p.woff"
                        >
                            {displayText}
                            <MeshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.2} />
                        </Text>

                        <Text 
                            position={[0, 0, -0.16]} 
                            rotation={[0, Math.PI, 0]}
                            fontSize={displayText.length > 4 ? 0.7 : 0.9} 
                            anchorX="center" anchorY="middle" 
                            outlineWidth={0.06} outlineColor="#000000"
                            font="https://fonts.gstatic.com/s/rajdhani/v15/L7rgdfpPBq9hS5p9p76p.woff"
                        >
                            {displayText}
                            <MeshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.2} />
                        </Text>

                        {texture && (
                            <Mesh position={[0, 0, 0.17]}>
                                <Circle args={[1.3, 32]}><MeshStandardMaterial map={texture} transparent={true} emissive="#ffffff" emissiveIntensity={0.5} /></Circle>
                            </Mesh>
                        )}
                    </>
                )}
            </Float>
        </Group>
    );
};
