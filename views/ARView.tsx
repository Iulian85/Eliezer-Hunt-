
import React, { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { DeviceOrientationControls, PerspectiveCamera } from '@react-three/drei';
import { X, Loader2, PackageOpen, Wallet, Camera, Zap, Gift } from 'lucide-react';
import * as THREE from 'three';
import { Coin3D } from '../components/Coin3D';
import { SpawnPoint } from '../types';
import { showRewardedAd } from '../services/adsgram';
import { logAdStartFirebase } from '../services/firebase';
import { UniversalVideoPlayer } from '../components/UniversalVideoPlayer';
import { ADSGRAM_BLOCK_ID } from '../constants';

const AmbientLight = 'ambientLight' as any;
const PointLight = 'pointLight' as any;
const Group = 'group' as any;

interface ARViewProps {
    target: { spawn: SpawnPoint, dist: number } | null;
    userId?: number;
    onClose: () => void;
    onCollect: (points: number, tonReward?: number, challenge?: any) => void;
}

// O lumină care urmărește mereu camera pentru a ilumina fața monedei
const CameraLight = () => {
    const { camera } = useThree();
    const lightRef = useRef<THREE.PointLight>(null);
    useFrame(() => {
        if (lightRef.current) {
            lightRef.current.position.copy(camera.position);
        }
    });
    return <PointLight ref={lightRef} intensity={10} distance={20} color="#ffffff" />;
};

const DriftingCoin = ({ coinRef, onDistanceChange, onEscape, isPaused }: { coinRef: React.MutableRefObject<THREE.Group | null>, onDistanceChange: (d: number) => void, onEscape: () => void, isPaused: boolean }) => {
    const { camera } = useThree();
    const velocity = useMemo(() => {
        const angle = Math.random() * Math.PI * 2; 
        const speed = 0.3 + Math.random() * 0.2; 
        return new THREE.Vector3(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
    }, []);

    useFrame((state, delta) => {
        if (!coinRef.current || isPaused) return;
        coinRef.current.position.x += velocity.x * delta;
        coinRef.current.position.z += velocity.z * delta;
        // Plutește ușor sus-jos la nivelul ochilor
        coinRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.15;
        
        const dist = camera.position.distanceTo(coinRef.current.position);
        onDistanceChange(dist);
        if (dist > 12.0) onEscape();
    });
    return null;
};

export const ARView: React.FC<ARViewProps> = ({ target, userId, onClose, onCollect }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const coinGroupRef = useRef<THREE.Group>(null);
    const spawnTimeRef = useRef<number>(Date.now());
    
    const [permissionError, setPermissionError] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    
    // Spawnează moneda la 3.5 metri în față, fix la nivelul camerei (Y=0)
    const [coinPos] = useState(() => new THREE.Vector3(0, 0, -3.5));
    const [distanceToCoin, setDistanceToCoin] = useState(3.5);
    const [hasEscaped, setHasEscaped] = useState(false);
    const [collecting, setCollecting] = useState(false);
    const [loadingAd, setLoadingAd] = useState(false);
    const [playingSponsorAd, setPlayingSponsorAd] = useState(false);
    const [gbRevealed, setGbRevealed] = useState(false);
    
    const [wonTon, setWonTon] = useState<number | null>(null);
    const [wonPoints, setWonPoints] = useState<number | null>(null);

    useEffect(() => {
        let mounted = true;
        let stream: MediaStream | null = null;
        const startCamera = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (mounted && videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => videoRef.current?.play().then(() => setCameraActive(true));
                }
            } catch (err) { if (mounted) setPermissionError(true); }
        };
        startCamera();
        return () => { mounted = false; stream?.getTracks().forEach(t => t.stop()); };
    }, []);

    const triggerCollectionSuccess = (points: number, tonAmount: number) => {
        setCollecting(true); setGbRevealed(false);
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        onCollect(points, tonAmount);
    };

    const handleCoinTap = async () => {
        if (!target || collecting || loadingAd || playingSponsorAd || hasEscaped) return;
        const cat = target.spawn.category;

        if (cat === 'GIFTBOX' || cat === 'EVENT' || cat === 'LANDMARK') {
            setLoadingAd(true);
            if (userId) await logAdStartFirebase(userId); 
            const success = await showRewardedAd(ADSGRAM_BLOCK_ID);
            setLoadingAd(false);
            if (success) {
                if (cat === 'GIFTBOX') {
                    const isTonWin = Math.random() < 0.15; 
                    let finalPoints = 0; let finalTon = 0;
                    if (isTonWin) { finalTon = target!.spawn.prizes![Math.floor(Math.random() * target!.spawn.prizes!.length)]; setWonTon(finalTon); }
                    else { finalPoints = [100, 250, 500][Math.floor(Math.random() * 3)]; setWonPoints(finalPoints); }
                    setGbRevealed(true);
                    setTimeout(() => triggerCollectionSuccess(finalPoints, finalTon), 4000);
                } else triggerCollectionSuccess(Math.floor(target.spawn.value), 0);
            }
            return;
        }

        if (cat === 'MERCHANT') {
            if (target.spawn.sponsorData?.videoUrl) setPlayingSponsorAd(true);
            else triggerCollectionSuccess(Math.floor(target.spawn.value), 0);
            return;
        }
        triggerCollectionSuccess(Math.floor(target.spawn.value), 0);
    };

    return (
        <div className="fixed inset-0 z-[10010] bg-black flex flex-col">
            <div className="absolute inset-0 z-0">
                {!permissionError ? <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted /> : <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white font-black">CAMERA ERROR</div>}
            </div>
            
            <div className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-500 ${cameraActive ? 'opacity-100' : 'opacity-0'}`}>
                <Canvas gl={{ alpha: true, antialias: true }} style={{ pointerEvents: 'auto' }}>
                    <Suspense fallback={null}>
                        <AmbientLight intensity={1.5} />
                        <CameraLight />
                        <DeviceOrientationControls />
                        <PerspectiveCamera makeDefault position={[0, 0, 0]} fov={70} />
                        
                        {target && (
                            <Group ref={coinGroupRef} position={coinPos}>
                                <DriftingCoin coinRef={coinGroupRef} onDistanceChange={setDistanceToCoin} onEscape={() => setHasEscaped(true)} isPaused={collecting || playingSponsorAd || hasEscaped || gbRevealed} />
                                {!hasEscaped && (
                                    <Coin3D 
                                        scale={target.spawn.category === 'GIFTBOX' ? 0.6 : 0.5} 
                                        interactive={distanceToCoin <= 6 && !collecting} 
                                        onClick={handleCoinTap} 
                                        collected={collecting} 
                                        isGiftBox={target.spawn.category === 'GIFTBOX'} 
                                        isSponsored={target.spawn.category === 'MERCHANT'}
                                        customText={target.spawn.customText}
                                        logoUrl={target.spawn.logoUrl} 
                                    />
                                )}
                            </Group>
                        )}
                    </Suspense>
                </Canvas>
            </div>

            <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-6">
                <div className="flex justify-between items-start pointer-events-auto">
                    <div className="bg-black/60 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10"><p className="text-[8px] text-slate-400 uppercase font-black">Radar Active</p><p className="text-white text-xs font-black">{target?.spawn.name}</p></div>
                    <button onClick={onClose} className="bg-red-600 p-3 rounded-full text-white shadow-xl active:scale-75 transition-transform"><X size={24} /></button>
                </div>
                <div className="flex justify-center mb-16"><div className="bg-black/80 backdrop-blur-2xl px-10 py-4 rounded-full border border-white/10 pointer-events-auto shadow-2xl"><span className="text-sm font-mono font-black text-white">{distanceToCoin.toFixed(1)}m</span><span className={`ml-4 text-[10px] font-black uppercase ${distanceToCoin < 6 ? 'text-green-400' : 'text-slate-500'}`}>{distanceToCoin < 6 ? "LOCKED" : "SEARCHING"}</span></div></div>
            </div>

            {gbRevealed && (
                <div className="fixed inset-0 z-[10030] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md pointer-events-auto">
                    <div className="bg-slate-950 border-2 border-amber-400 p-10 rounded-[3rem] flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(251,191,36,0.3)] animate-in zoom-in">
                        <PackageOpen className="text-amber-400 animate-bounce" size={64} />
                        <div className="text-center"><h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Unboxed</h2><span className="text-5xl font-black text-white">{wonTon || wonPoints} {wonTon ? 'TON' : 'ELZR'}</span></div>
                    </div>
                </div>
            )}
            {playingSponsorAd && <div className="fixed inset-0 z-[10020] bg-black flex flex-col pointer-events-auto"><UniversalVideoPlayer url={target!.spawn.sponsorData!.videoUrl} autoPlay={true} className="flex-1" /><button onClick={() => { setPlayingSponsorAd(false); triggerCollectionSuccess(Math.floor(target!.spawn.value), 0); }} className="m-8 bg-white text-black py-5 rounded-2xl font-black uppercase text-sm tracking-widest active:scale-95 transition-transform">Claim Loot</button></div>}
            {loadingAd && <div className="fixed inset-0 z-[10025] bg-black/90 backdrop-blur flex items-center justify-center"><Loader2 className="text-cyan-400 animate-spin" size={64} /></div>}
        </div>
    );
}
