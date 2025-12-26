
import React, { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { DeviceOrientationControls, PerspectiveCamera, Text, Billboard } from '@react-three/drei';
import { X, Loader2, CheckCircle, Wind, Gift, RefreshCw, PackageOpen, Coins, Wallet, Camera, Zap } from 'lucide-react';
import * as THREE from 'three';
import { Coin3D } from '../components/Coin3D';
import { SpawnPoint } from '../types';
import { showRewardedAd } from '../services/adsgram';
import { logAdStartFirebase } from '../services/firebase';
import { UniversalVideoPlayer } from '../components/UniversalVideoPlayer';
import { ADSGRAM_BLOCK_ID } from '../constants';

const AmbientLight = 'ambientLight' as any;
const DirectionalLight = 'directionalLight' as any;
const Group = 'group' as any;

interface ARViewProps {
    target: { spawn: SpawnPoint, dist: number } | null;
    userId?: number; // Adăugat pentru logging
    onClose: () => void;
    onCollect: (points: number, tonReward?: number, challenge?: any) => void;
}

const GyroCamera = () => <DeviceOrientationControls makeDefault alphaOffset={0} />;

const DriftingCoin = ({ coinRef, initialPos, onDistanceChange, onEscape, isPaused }: { coinRef: React.MutableRefObject<THREE.Group | null>, initialPos: THREE.Vector3, onDistanceChange: (d: number) => void, onEscape: () => void, isPaused: boolean }) => {
    const { camera } = useThree();
    const velocity = useMemo(() => {
        const angle = Math.random() * Math.PI * 2; 
        const speed = 0.6 + Math.random() * 0.5; 
        return new THREE.Vector3(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
    }, [initialPos]);

    useFrame((state, delta) => {
        if (!coinRef.current || isPaused) return;
        coinRef.current.position.x += velocity.x * delta;
        coinRef.current.position.z += velocity.z * delta;
        coinRef.current.position.y = -0.5 + Math.sin(state.clock.elapsedTime * 2.5) * 0.15;
        const dist = camera.position.distanceTo(coinRef.current.position);
        onDistanceChange(dist);
        if (dist > 9.0) onEscape();
    });
    return null;
};

export const ARView: React.FC<ARViewProps> = ({ target, userId, onClose, onCollect }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const coinGroupRef = useRef<THREE.Group>(null);
    const spawnTimeRef = useRef<number>(Date.now());
    
    const [permissionError, setPermissionError] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    
    const [coinPos, setCoinPos] = useState(() => new THREE.Vector3((Math.random() - 0.5) * 4, 1.5, -6));
    const [distanceToCoin, setDistanceToCoin] = useState(3.0);
    const [hasEscaped, setHasEscaped] = useState(false);
    const [isRespawning, setIsRespawning] = useState(false);
    const [collecting, setCollecting] = useState(false);
    const [loadingAd, setLoadingAd] = useState(false);
    const [playingSponsorAd, setPlayingSponsorAd] = useState(false);
    const [gbRevealed, setGbRevealed] = useState(false);
    
    const [wonTon, setWonTon] = useState<number | null>(null);
    const [wonPoints, setWonPoints] = useState<number | null>(null);

    useEffect(() => {
        if (target?.spawn.id) {
            setCollecting(false);
            setHasEscaped(false);
            setGbRevealed(false);
            setIsRespawning(true);
            spawnTimeRef.current = Date.now();
            setCoinPos(new THREE.Vector3((Math.random() - 0.5) * 5, 1.2, -7));
            setTimeout(() => setIsRespawning(false), 800);
        }
    }, [target?.spawn.id]);

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

    const playSound = (type: 'success' | 'error') => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            if (type === 'success') {
                osc.frequency.setValueAtTime(800, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
            } else {
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime);
            }
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        } catch (e) {}
    };

    const triggerCollectionSuccess = (points: number, tonAmount: number) => {
        const challenge = { reactionTimeMs: Date.now() - spawnTimeRef.current, entropy: Math.random().toString(36).substring(7) };
        setCollecting(true); setGbRevealed(false); playSound('success');
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        onCollect(points, tonAmount, challenge);
    };

    const handleCoinTap = async () => {
        if (!target || collecting || loadingAd || playingSponsorAd || hasEscaped || isRespawning) return;
        if (distanceToCoin > 5.0) return;
        
        const cat = target.spawn.category;
        const reactionTime = Date.now() - spawnTimeRef.current;
        if (reactionTime < 500) return; // Anti-Bot

        if (cat === 'GIFTBOX' || cat === 'EVENT' || cat === 'LANDMARK') {
            setLoadingAd(true);
            if (userId) await logAdStartFirebase(userId); // Log session real
            const success = await showRewardedAd(ADSGRAM_BLOCK_ID);
            setLoadingAd(false);
            if (success) {
                if (cat === 'GIFTBOX') finishGiftBox();
                else triggerCollectionSuccess(Math.floor(target.spawn.value), 0);
            } else playSound('error');
            return;
        }

        if (target.spawn.sponsorData) { setPlayingSponsorAd(true); return; }
        triggerCollectionSuccess(Math.floor(target.spawn.value), 0);
    };

    const finishGiftBox = () => {
        const isTonWin = Math.random() < 0.15; 
        let finalPoints = 0; let finalTon = 0;
        if (isTonWin) { finalTon = target!.spawn.prizes![Math.floor(Math.random() * target!.spawn.prizes!.length)]; setWonTon(finalTon); }
        else { finalPoints = [100, 250, 500][Math.floor(Math.random() * 3)]; setWonPoints(finalPoints); }
        setGbRevealed(true);
        setTimeout(() => triggerCollectionSuccess(finalPoints, finalTon), 4000);
    };

    const handleEscape = () => { if (!hasEscaped && !collecting && !isRespawning && !gbRevealed) { setHasEscaped(true); playSound('error'); setTimeout(() => { setIsRespawning(true); setCoinPos(new THREE.Vector3((Math.random() - 0.5) * 4, 1.2, -6)); spawnTimeRef.current = Date.now(); setHasEscaped(false); setIsRespawning(false); }, 2000); } };

    return (
        <div className="fixed inset-0 z-[10010] bg-black overflow-hidden flex flex-col font-sans">
            <div className="absolute inset-0 z-0">
                {!permissionError ? <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted /> : <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-10 text-center text-white"><Camera size={40} className="text-red-500 mb-4" /><p className="text-sm font-black uppercase">Camera Error</p></div>}
                {!cameraActive && !permissionError && <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-50"><Loader2 className="text-cyan-500 animate-spin" size={48} /><p className="text-white text-[10px] uppercase font-black tracking-widest mt-4">Initializing Lens...</p></div>}
            </div>
            <div className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-700 ${cameraActive ? 'opacity-100' : 'opacity-0'}`}>
                <Canvas gl={{ alpha: true, antialias: true }} style={{ pointerEvents: 'auto' }}>
                    <Suspense fallback={null}>
                        <AmbientLight intensity={1.5} />
                        <DirectionalLight position={[5, 10, 5]} intensity={2} />
                        <GyroCamera />
                        <PerspectiveCamera makeDefault position={[0, 1.6, 0]} />
                        {!isRespawning && target && (
                            <Group ref={coinGroupRef} position={coinPos}>
                                <DriftingCoin coinRef={coinGroupRef} initialPos={coinPos} onDistanceChange={setDistanceToCoin} onEscape={handleEscape} isPaused={collecting || playingSponsorAd || hasEscaped || gbRevealed} />
                                {!hasEscaped && (
                                    <>
                                        <Billboard position={[0, 1.4, 0]}><Text fontSize={0.2} color={distanceToCoin <= 5 ? "#4ade80" : "#ffffff"} outlineWidth={0.03} outlineColor="#000000">{distanceToCoin <= 5 ? (target.spawn.category === 'GIFTBOX' ? "OPEN" : "TAP") : `${distanceToCoin.toFixed(1)}m`}</Text></Billboard>
                                        <Coin3D scale={target.spawn.category === 'GIFTBOX' ? 0.45 : 0.3} interactive={distanceToCoin <= 5 && !collecting && !loadingAd} onClick={handleCoinTap} ghost={distanceToCoin > 5} collected={collecting} isGiftBox={target.spawn.category === 'GIFTBOX'} logoUrl={target.spawn.logoUrl} />
                                    </>
                                )}
                            </Group>
                        )}
                    </Suspense>
                </Canvas>
            </div>
            <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-6">
                <div className="flex justify-between items-start pointer-events-auto">
                    <div className="bg-black/40 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10"><p className="text-[8px] text-slate-400 uppercase tracking-widest font-black">Scanning Sector</p><p className="text-white text-xs font-black flex items-center gap-2">{target?.spawn.category === 'GIFTBOX' ? <Gift size={14}/> : <Zap size={14}/>} {target?.spawn.name || "Searching..."}</p></div>
                    <button onClick={onClose} className="bg-red-600/80 p-3 rounded-full text-white pointer-events-auto active:scale-90 shadow-xl"><X size={24} /></button>
                </div>
                {gbRevealed && (wonTon || wonPoints) && (
                    <div className="fixed inset-0 z-[10030] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm pointer-events-auto">
                        <div className="bg-slate-950 border-2 border-amber-400 p-8 rounded-[2.5rem] flex flex-col items-center gap-5 animate-in zoom-in shadow-2xl">
                            <PackageOpen className="text-amber-400 animate-bounce" size={48} />
                            <div className="text-center"><h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mystery Found</h2><span className="text-4xl font-black text-white flex items-center gap-2">{wonTon || wonPoints} {wonTon ? <Wallet size={24}/> : <Coins size={24}/>}</span></div>
                        </div>
                    </div>
                )}
                <div className="flex justify-center mb-12"><div className="bg-black/60 backdrop-blur-xl px-10 py-3 rounded-full border border-white/10 pointer-events-auto"><span className="text-xs font-mono font-black text-white">{target ? distanceToCoin.toFixed(1) : "--.-"}m</span><span className={`ml-4 text-[9px] font-black uppercase ${distanceToCoin < 6 ? 'text-green-400' : 'text-slate-500'}`}>{distanceToCoin < 6 ? "READY" : "LOCKED"}</span></div></div>
            </div>
            {playingSponsorAd && target?.spawn.sponsorData && <div className="fixed inset-0 z-[10020] bg-black flex flex-col pointer-events-auto"><UniversalVideoPlayer url={target!.spawn.sponsorData!.videoUrl} autoPlay={true} className="flex-1" /><button onClick={() => { setPlayingSponsorAd(false); triggerCollectionSuccess(Math.floor(target.spawn.value), 0); }} className="m-6 bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs">Claim Reward</button></div>}
            {loadingAd && <div className="fixed inset-0 z-[10025] bg-black/80 backdrop-blur flex flex-col items-center justify-center gap-4 pointer-events-auto"><Loader2 className="text-cyan-400 animate-spin" size={48} /><p className="text-white font-black uppercase tracking-widest text-[10px] animate-pulse">Syncing Protocol...</p></div>}
        </div>
    );
}
