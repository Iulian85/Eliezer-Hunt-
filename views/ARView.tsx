
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

const DriftingCoin = ({ coinRef, onDistanceChange, onEscape, isPaused }: { coinRef: React.MutableRefObject<THREE.Group | null>, onDistanceChange: (d: number) => void, onEscape: () => void, isPaused: boolean }) => {
    const { camera } = useThree();
    const velocity = useMemo(() => {
        const angle = Math.random() * Math.PI * 2; 
        const speed = 0.4 + Math.random() * 0.3; 
        return new THREE.Vector3(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
    }, []);

    useFrame((state, delta) => {
        if (!coinRef.current || isPaused) return;
        coinRef.current.position.x += velocity.x * delta;
        coinRef.current.position.z += velocity.z * delta;
        coinRef.current.position.y = 0 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
        const dist = camera.position.distanceTo(coinRef.current.position);
        onDistanceChange(dist);
        if (dist > 10.0) onEscape();
    });
    return null;
};

export const ARView: React.FC<ARViewProps> = ({ target, userId, onClose, onCollect }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const coinGroupRef = useRef<THREE.Group>(null);
    const spawnTimeRef = useRef<number>(Date.now());
    
    const [permissionError, setPermissionError] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    
    // Spawnează moneda mai aproape (4 metri) direct în față
    const [coinPos] = useState(() => new THREE.Vector3(0, 0, -4));
    const [distanceToCoin, setDistanceToCoin] = useState(4.0);
    const [hasEscaped, setHasEscaped] = useState(false);
    const [isRespawning, setIsRespawning] = useState(false);
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
        const challenge = { reactionTimeMs: Date.now() - spawnTimeRef.current, entropy: Math.random().toString(36).substring(7) };
        setCollecting(true); setGbRevealed(false);
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        onCollect(points, tonAmount, challenge);
    };

    const handleCoinTap = async () => {
        if (!target || collecting || loadingAd || playingSponsorAd || hasEscaped || isRespawning) return;
        if (distanceToCoin > 6.0) return;
        
        const cat = target.spawn.category;
        if (Date.now() - spawnTimeRef.current < 300) return;

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
        <div className="fixed inset-0 z-[10010] bg-black overflow-hidden flex flex-col">
            <div className="absolute inset-0 z-0">
                {!permissionError ? <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted /> : <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white uppercase text-xs font-black">Camera Error</div>}
                {!cameraActive && !permissionError && <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-50"><Loader2 className="text-cyan-500 animate-spin" size={48} /></div>}
            </div>
            <div className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-500 ${cameraActive ? 'opacity-100' : 'opacity-0'}`}>
                <Canvas gl={{ alpha: true, antialias: true }} style={{ pointerEvents: 'auto' }}>
                    <Suspense fallback={null}>
                        <AmbientLight intensity={2.5} />
                        <PointLight position={[0, 5, 5]} intensity={3} />
                        <DeviceOrientationControls makeDefault />
                        <PerspectiveCamera makeDefault position={[0, 0, 0]} fov={75} />
                        {!isRespawning && target && (
                            <Group ref={coinGroupRef} position={coinPos}>
                                <DriftingCoin coinRef={coinGroupRef} onDistanceChange={setDistanceToCoin} onEscape={() => setHasEscaped(true)} isPaused={collecting || playingSponsorAd || hasEscaped || gbRevealed} />
                                {!hasEscaped && (
                                    <Coin3D 
                                        scale={target.spawn.category === 'GIFTBOX' ? 0.45 : 0.35} 
                                        interactive={distanceToCoin <= 6 && !collecting && !loadingAd} 
                                        onClick={handleCoinTap} 
                                        ghost={distanceToCoin > 6} 
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
                    <div className="bg-black/60 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10"><p className="text-[8px] text-slate-400 uppercase tracking-widest font-black">Scanning</p><p className="text-white text-xs font-black flex items-center gap-2">{target?.spawn.name}</p></div>
                    <button onClick={onClose} className="bg-red-600 p-3 rounded-full text-white shadow-xl"><X size={24} /></button>
                </div>
                <div className="flex justify-center mb-12"><div className="bg-black/60 backdrop-blur-xl px-8 py-3 rounded-full border border-white/10 pointer-events-auto"><span className="text-xs font-mono font-black text-white">{distanceToCoin.toFixed(1)}m</span><span className={`ml-4 text-[9px] font-black uppercase ${distanceToCoin < 6 ? 'text-green-400' : 'text-slate-500'}`}>{distanceToCoin < 6 ? "READY" : "TOO FAR"}</span></div></div>
            </div>
            {gbRevealed && (
                <div className="fixed inset-0 z-[10030] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm pointer-events-auto">
                    <div className="bg-slate-950 border-2 border-amber-400 p-8 rounded-[2.5rem] flex flex-col items-center gap-5 shadow-2xl">
                        <PackageOpen className="text-amber-400 animate-bounce" size={48} />
                        <div className="text-center"><h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Found</h2><span className="text-4xl font-black text-white">{wonTon || wonPoints} {wonTon ? 'TON' : 'ELZR'}</span></div>
                    </div>
                </div>
            )}
            {playingSponsorAd && target?.spawn.sponsorData && <div className="fixed inset-0 z-[10020] bg-black flex flex-col pointer-events-auto"><UniversalVideoPlayer url={target!.spawn.sponsorData!.videoUrl} autoPlay={true} className="flex-1" /><button onClick={() => { setPlayingSponsorAd(false); triggerCollectionSuccess(Math.floor(target.spawn.value), 0); }} className="m-6 bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs">Claim Reward</button></div>}
            {loadingAd && <div className="fixed inset-0 z-[10025] bg-black/80 backdrop-blur flex flex-col items-center justify-center gap-4"><Loader2 className="text-cyan-400 animate-spin" size={48} /></div>}
        </div>
    );
}
