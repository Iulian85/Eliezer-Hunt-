
import React, { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { DeviceOrientationControls, PerspectiveCamera, Text, Billboard, Float } from '@react-three/drei';
import { X, Loader2, CheckCircle, Gift, PackageOpen, Coins, Wallet, Camera, Zap, AlertTriangle } from 'lucide-react';
import * as THREE from 'three';
import { Coin3D } from '../components/Coin3D';
import { SpawnPoint } from '../types';
import { showRewardedAd } from '../services/adsgram';
import { UniversalVideoPlayer } from '../components/UniversalVideoPlayer';
import { ADSGRAM_BLOCK_ID } from '../constants';

const AmbientLight = 'ambientLight' as any;
const DirectionalLight = 'directionalLight' as any;
const Group = 'group' as any;

interface ARViewProps {
    target: { spawn: SpawnPoint, dist: number } | null;
    onClose: () => void;
    onCollect: (points: number, tonReward?: number) => void;
}

const GyroCamera = () => <DeviceOrientationControls makeDefault alphaOffset={0} />;

const DriftingCoin = ({ coinRef, initialPos, onDistanceChange, onEscape, isPaused }: { coinRef: React.MutableRefObject<THREE.Group | null>, initialPos: THREE.Vector3, onDistanceChange: (d: number) => void, onEscape: () => void, isPaused: boolean }) => {
    const { camera } = useThree();
    const velocity = useMemo(() => {
        const angle = Math.random() * Math.PI * 2; 
        const speed = 0.8 + Math.random() * 0.4; 
        return new THREE.Vector3(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
    }, [initialPos]);

    useFrame((state, delta) => {
        if (!coinRef.current || isPaused) return;
        coinRef.current.position.x += velocity.x * delta;
        coinRef.current.position.z += velocity.z * delta;
        coinRef.current.position.y = -0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
        const dist = camera.position.distanceTo(coinRef.current.position);
        onDistanceChange(dist);
        if (dist > 10.0) onEscape();
    });
    return null;
};

export const ARView: React.FC<ARViewProps> = ({ target, onClose, onCollect }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const coinGroupRef = useRef<THREE.Group>(null);
    const [permissionError, setPermissionError] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    
    const [coinPos, setCoinPos] = useState(() => new THREE.Vector3((Math.random() - 0.5) * 4, 1.5, -6));
    const [distanceToCoin, setDistanceToCoin] = useState(6.0);
    const [hasEscaped, setHasEscaped] = useState(false);
    const [isRespawning, setIsRespawning] = useState(false);
    const [collecting, setCollecting] = useState(false);
    const [loadingAd, setLoadingAd] = useState(false);
    const [playingSponsorAd, setPlayingSponsorAd] = useState(false);
    const [gbRevealed, setGbRevealed] = useState(false);
    
    const [wonTon, setWonTon] = useState<number | null>(null);
    const [wonPoints, setWonPoints] = useState<number | null>(null);

    useEffect(() => {
        if (target) {
            setCollecting(false);
            setHasEscaped(false);
            setGbRevealed(false);
            setIsRespawning(true);
            setCoinPos(new THREE.Vector3((Math.random() - 0.5) * 6, 1.2, -8));
            setTimeout(() => setIsRespawning(false), 1000);
        }
    }, [target?.spawn.id]);

    useEffect(() => {
        let mounted = true;
        let stream: MediaStream | null = null;

        const startCamera = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment', width: { ideal: 1280 } }, 
                    audio: false 
                });
                if (mounted && videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play().then(() => setCameraActive(true));
                    };
                }
            } catch (err) { 
                if (mounted) setPermissionError(true); 
            }
        };

        startCamera();
        return () => {
            mounted = false;
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, []);

    const playSound = (type: 'success' | 'error' | 'prize') => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            if (type === 'success') {
                osc.frequency.setValueAtTime(800, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
            } else if (type === 'error') {
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, ctx.currentTime);
            } else {
                osc.frequency.setValueAtTime(400, ctx.currentTime);
                osc.frequency.linearRampToValueAtTime(2000, ctx.currentTime + 0.4);
            }
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        } catch (e) {}
    };

    const handleCoinTap = async () => {
        if (collecting || loadingAd || playingSponsorAd || hasEscaped || isRespawning || distanceToCoin > 6.0) return;
        
        const cat = target?.spawn.category;
        if (cat === 'URBAN' || cat === 'MALL') {
             onCollect(Math.floor(target!.spawn.value), 0);
             setCollecting(true);
             playSound('success');
             return;
        }

        if (cat === 'GIFTBOX' || cat === 'EVENT' || cat === 'LANDMARK') {
            setLoadingAd(true);
            const success = await showRewardedAd(ADSGRAM_BLOCK_ID);
            setLoadingAd(false);
            if (success) {
                if (cat === 'GIFTBOX') {
                    const ton = Math.random() < 0.1 ? 0.5 : 0;
                    const pts = ton ? 0 : 500;
                    setWonTon(ton || null); setWonPoints(pts || null);
                    setGbRevealed(true); playSound('prize');
                    setTimeout(() => onCollect(pts, ton), 4000);
                } else {
                    onCollect(Math.floor(target!.spawn.value), 0);
                    setCollecting(true);
                    playSound('success');
                }
            }
            return;
        }

        if (target?.spawn.sponsorData) { 
            setPlayingSponsorAd(true); 
            return; 
        }

        onCollect(Math.floor(target!.spawn.value), 0);
        setCollecting(true);
    };

    return (
        <div className="fixed inset-0 z-[10010] bg-black overflow-hidden font-[Rajdhani]">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover z-0" autoPlay playsInline muted />
            
            <div className="absolute inset-0 z-10">
                <Canvas gl={{ alpha: true }}>
                    <Suspense fallback={null}>
                        <AmbientLight intensity={1.5} />
                        <DirectionalLight position={[5, 10, 5]} intensity={2} />
                        <GyroCamera />
                        <PerspectiveCamera makeDefault position={[0, 1.6, 0]} />
                        {!isRespawning && target && (
                            <Group>
                                <DriftingCoin 
                                    coinRef={coinGroupRef} 
                                    initialPos={coinPos} 
                                    onDistanceChange={setDistanceToCoin} 
                                    onEscape={() => setHasEscaped(true)} 
                                    isPaused={collecting || playingSponsorAd || gbRevealed} 
                                />
                                <Group ref={coinGroupRef} position={coinPos}>
                                    {!hasEscaped && (
                                        <Float speed={5} rotationIntensity={1} floatIntensity={1}>
                                            <Billboard position={[0, 1.5, 0]}>
                                                <Text fontSize={0.2} color={distanceToCoin < 6 ? "#22d3ee" : "#ffffff"} outlineWidth={0.02} outlineColor="#000000">
                                                    {distanceToCoin < 6 ? "EXTRACT" : `${distanceToCoin.toFixed(1)}m`}
                                                </Text>
                                            </Billboard>
                                            <Coin3D 
                                                scale={target.spawn.category === 'GIFTBOX' ? 0.5 : 0.35} 
                                                interactive={distanceToCoin < 6 && !collecting} 
                                                onClick={handleCoinTap} 
                                                collected={collecting} 
                                                isGiftBox={target.spawn.category === 'GIFTBOX'}
                                                customText={target.spawn.customText}
                                                logoUrl={target.spawn.logoUrl} 
                                            />
                                        </Float>
                                    )}
                                </Group>
                            </Group>
                        )}
                    </Suspense>
                </Canvas>
            </div>

            <div className="absolute inset-x-0 top-0 p-6 z-20 flex justify-between items-start">
                <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-2xl">
                    <p className="text-[10px] text-cyan-400 font-black uppercase tracking-widest mb-1">Target Identified</p>
                    <p className="text-white font-bold flex items-center gap-2">
                        {target?.spawn.category === 'GIFTBOX' ? <Gift size={16}/> : <Zap size={16}/>}
                        {target?.spawn.name || "SCANNING..."}
                    </p>
                </div>
                <button onClick={onClose} className="w-12 h-12 bg-red-600/20 border border-red-500/50 rounded-2xl flex items-center justify-center text-white active:scale-90 transition-transform"><X size={24} /></button>
            </div>

            {hasEscaped && !collecting && (
                <div className="absolute inset-0 z-30 bg-black/40 flex flex-col items-center justify-center p-10 text-center animate-in fade-in">
                    <AlertTriangle className="text-amber-500 mb-4 animate-bounce" size={64} />
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Target Lost</h2>
                    <p className="text-slate-300 text-xs mt-2 font-bold uppercase tracking-widest">operative failed to stabilize proximity</p>
                    <button onClick={() => setHasEscaped(false)} className="mt-8 px-10 py-4 bg-white text-black font-black rounded-2xl uppercase tracking-widest text-xs">Re-init Scan</button>
                </div>
            )}

            {gbRevealed && (
                <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-lg flex flex-col items-center justify-center animate-in zoom-in">
                    <PackageOpen className="text-amber-400 mb-6 animate-pulse" size={80} />
                    <div className="text-center">
                        <h2 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.4em] mb-2">Extraction Complete</h2>
                        <span className="text-5xl font-black text-white flex items-center gap-3">
                            {wonTon || wonPoints} {wonTon ? <Wallet size={32}/> : <Coins size={32}/>}
                        </span>
                    </div>
                </div>
            )}

            {loadingAd && (
                <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
                    <Loader2 className="text-cyan-500 animate-spin mb-4" size={48} />
                    <p className="text-cyan-400 text-[10px] font-black uppercase tracking-[0.5em]">Synchronizing Rewards...</p>
                </div>
            )}

            {playingSponsorAd && (
                <div className="absolute inset-0 z-[60] bg-black flex flex-col">
                    <UniversalVideoPlayer url={target!.spawn.sponsorData!.videoUrl} autoPlay className="flex-1" />
                    <div className="p-6 bg-slate-900 border-t border-white/10">
                        <button onClick={() => { setPlayingSponsorAd(false); onCollect(Math.floor(target!.spawn.value), 0); setCollecting(true); }} className="w-full py-5 bg-white text-black font-black uppercase rounded-2xl tracking-widest text-sm">Claim Verification Reward</button>
                    </div>
                </div>
            )}

            <div className="absolute inset-x-0 bottom-12 flex justify-center z-20">
                <div className={`px-10 py-4 rounded-full border backdrop-blur-2xl transition-all duration-500 ${distanceToCoin < 6 ? 'bg-cyan-500/20 border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.3)]' : 'bg-black/60 border-white/10'}`}>
                    <span className="text-white font-mono font-black text-sm tracking-widest">{distanceToCoin.toFixed(1)}m</span>
                </div>
            </div>

            {permissionError && (
                <div className="absolute inset-0 z-[100] bg-[#020617] flex flex-col items-center justify-center p-12 text-center">
                    <Camera className="text-red-500 mb-6" size={64} />
                    <h2 className="text-2xl font-black text-white uppercase mb-4">Vision Blocked</h2>
                    <p className="text-slate-400 text-xs font-bold leading-relaxed uppercase tracking-widest">Camera permissions are mandatory for tactical extraction. Update settings to proceed.</p>
                </div>
            )}
        </div>
    );
};
