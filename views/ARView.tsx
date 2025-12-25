import React, { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { DeviceOrientationControls, PerspectiveCamera, Text, Billboard } from '@react-three/drei';
import { X, Loader2, CheckCircle, Wind, Gift, RefreshCw, PackageOpen, Coins, Wallet, Camera, Zap } from 'lucide-react';
import * as THREE from 'three';
import { Coin3D } from '../components/Coin3D';
import { SpawnPoint } from '../types';
import { showRewardedAd } from '../services/adsgram';
import { UniversalVideoPlayer } from '../components/UniversalVideoPlayer';
import { ADSGRAM_BLOCK_ID } from '../constants';

// Cast components to any to avoid intrinsic element type errors
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

export const ARView: React.FC<ARViewProps> = ({ target, onClose, onCollect }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const coinGroupRef = useRef<THREE.Group>(null);
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

    const targetId = target?.spawn.id;

    useEffect(() => {
        if (targetId) {
            setCollecting(false);
            setHasEscaped(false);
            setGbRevealed(false);
            setWonTon(null);
            setWonPoints(null);
            setIsRespawning(true);
            setCoinPos(new THREE.Vector3((Math.random() - 0.5) * 5, 1.2, -7));
            setTimeout(() => setIsRespawning(false), 800);
        }
    }, [targetId]);

    // Initialize Camera correctly for Telegram
    useEffect(() => {
        let mounted = true;
        let stream: MediaStream | null = null;

        const startCamera = async () => {
            try {
                // Ensure we request permissions as part of the initial mount
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, 
                    audio: false 
                });
                
                if (mounted && videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.setAttribute('playsinline', 'true');
                    videoRef.current.muted = true;
                    
                    videoRef.current.onloadedmetadata = () => {
                        if (videoRef.current) {
                            videoRef.current.play()
                                .then(() => {
                                    if (mounted) setCameraActive(true);
                                })
                                .catch(e => console.warn("Camera auto-play blocked", e));
                        }
                    };
                }
            } catch (err) { 
                console.error("AR: Camera Error", err);
                if (mounted) setPermissionError(true); 
            }
        };

        startCamera();
        return () => {
            mounted = false;
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    const forceCameraPlay = () => {
        if (videoRef.current) {
            videoRef.current.play().then(() => setCameraActive(true)).catch(console.error);
        }
    };

    const playSound = (type: 'success' | 'error' | 'prize') => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContext();
            const t = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            if (type === 'success') {
                osc.frequency.setValueAtTime(800, t); osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
                gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
            } else if (type === 'error') {
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, t); gain.gain.setValueAtTime(0.1, t);
            } else {
                osc.frequency.setValueAtTime(600, t); osc.frequency.linearRampToValueAtTime(1500, t + 0.3);
            }
            osc.start(t); osc.stop(t + 0.5);
            setTimeout(() => ctx.close(), 1000);
        } catch (e) {}
    };

    const triggerCollectionSuccess = (points: number, tonAmount: number) => {
        setCollecting(true);
        setGbRevealed(false); 
        playSound('success');
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        onCollect(points, tonAmount);
    };

    const handleCoinTap = async () => {
        if (!cameraActive) forceCameraPlay();
        if (!target || collecting || loadingAd || playingSponsorAd || hasEscaped || isRespawning) return;
        if (distanceToCoin > 5.0) return;
        
        const cat = target.spawn.category;
        
        // Collect instantly for standard spots
        if (cat === 'URBAN' || cat === 'MALL') {
             triggerCollectionSuccess(Math.floor(target.spawn.value), 0);
             return;
        }

        const isGB = cat === 'GIFTBOX';
        const isEvent = cat === 'EVENT';
        const isLandmark = cat === 'LANDMARK';
        
        if (isGB || isEvent || isLandmark) {
            setLoadingAd(true);
            try {
                const success = await showRewardedAd(ADSGRAM_BLOCK_ID);
                setLoadingAd(false);
                if (success) {
                    if (isGB) finishGiftBox();
                    else triggerCollectionSuccess(Math.floor(target.spawn.value), 0);
                } else {
                    playSound('error');
                }
            } catch (e) {
                setLoadingAd(false);
                playSound('error');
            }
            return;
        }

        if (target.spawn.sponsorData) { 
            setPlayingSponsorAd(true); 
            return; 
        }

        triggerCollectionSuccess(Math.floor(target.spawn.value), 0);
    };

    const finishGiftBox = () => {
        const isTonWin = Math.random() < 0.15 && (target?.spawn.prizes?.length || 0) > 0; 
        let finalPoints = 0; let finalTon = 0;

        if (isTonWin) {
            finalTon = target!.spawn.prizes![Math.floor(Math.random() * target!.spawn.prizes!.length)];
            setWonTon(finalTon); setWonPoints(null);
        } else {
            finalPoints = [100, 250, 500, 1000][Math.floor(Math.random() * 4)];
            setWonPoints(finalPoints); setWonTon(null);
        }

        setGbRevealed(true); playSound('prize');
        setTimeout(() => triggerCollectionSuccess(finalPoints, finalTon), 4500);
    };

    const handleEscape = () => { 
        if (!hasEscaped && !collecting && !isRespawning && !gbRevealed) { 
            setHasEscaped(true); playSound('error'); 
            setTimeout(() => {
                setIsRespawning(true);
                setTimeout(() => {
                    setCoinPos(new THREE.Vector3((Math.random() - 0.5) * 4, 1.2, -6));
                    setHasEscaped(false); setIsRespawning(false);
                }, 1000);
            }, 1200);
        } 
    };

    const cat = target?.spawn.category;
    const canInteract = distanceToCoin <= 5.0;

    return (
        <div className="fixed inset-0 z-[10010] bg-black overflow-hidden flex flex-col font-sans" onClick={forceCameraPlay}>
            {/* 1. Video Layer */}
            <div className="absolute inset-0 z-0">
                {!permissionError ? (
                    <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
                ) : (
                    <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-10 text-center text-white">
                        <Camera size={40} className="text-red-500 mb-4" />
                        <p className="text-sm font-black uppercase">Camera Error</p>
                    </div>
                )}
                {!cameraActive && !permissionError && (
                    <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-50">
                        <Loader2 className="text-cyan-500 animate-spin" size={48} />
                        <p className="text-white text-[10px] uppercase font-black tracking-widest mt-4">Initializing Lens...</p>
                    </div>
                )}
            </div>

            {/* 2. 3D AR Layer - Transparent */}
            <div className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-700 ${cameraActive ? 'opacity-100' : 'opacity-0'}`}>
                <Canvas gl={{ alpha: true, antialias: true }} onCreated={({ gl }) => gl.setClearColor(0x000000, 0)} style={{ pointerEvents: 'auto' }}>
                    <Suspense fallback={null}>
                        <AmbientLight intensity={1.5} />
                        <DirectionalLight position={[5, 10, 5]} intensity={2} />
                        <GyroCamera />
                        <PerspectiveCamera makeDefault position={[0, 1.6, 0]} />
                        
                        {!isRespawning && target && (
                            <>
                                <DriftingCoin 
                                    coinRef={coinGroupRef} 
                                    initialPos={coinPos} 
                                    onDistanceChange={setDistanceToCoin} 
                                    onEscape={handleEscape} 
                                    isPaused={collecting || playingSponsorAd || hasEscaped || gbRevealed} 
                                />
                                <Group ref={coinGroupRef} position={coinPos}>
                                    {!hasEscaped && (
                                        <>
                                            <Billboard position={[0, 1.4, 0]}>
                                                <Text fontSize={0.2} color={canInteract ? "#4ade80" : "#ffffff"} outlineWidth={0.03} outlineColor="#000000">
                                                    {canInteract ? (cat === 'GIFTBOX' ? "OPEN" : "TAP TO COLLECT") : `${distanceToCoin.toFixed(1)}m`}
                                                </Text>
                                            </Billboard>
                                            <Coin3D 
                                                scale={cat === 'GIFTBOX' ? 0.45 : 0.3} 
                                                interactive={canInteract && !collecting && !loadingAd} 
                                                onClick={handleCoinTap} 
                                                ghost={!canInteract} 
                                                collected={collecting} 
                                                isGiftBox={cat === 'GIFTBOX'}
                                                customText={cat === 'GIFTBOX' ? "GIFT" : target.spawn.customText}
                                                logoUrl={target.spawn.logoUrl} 
                                            />
                                        </>
                                    )}
                                </Group>
                            </>
                        )}
                    </Suspense>
                </Canvas>
            </div>

            {/* 3. UI Layer */}
            <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-6">
                <div className="flex justify-between items-start pointer-events-auto">
                    <div className="bg-black/40 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10">
                        <p className="text-[8px] text-slate-400 uppercase tracking-widest font-black">Scanning Sector</p>
                        <p className="text-white text-xs font-black flex items-center gap-2">
                             {cat === 'GIFTBOX' ? <Gift size={14}/> : <Zap size={14}/>} {target?.spawn.name || "Searching..."}
                        </p>
                    </div>
                    <button onClick={onClose} className="bg-red-600/80 p-3 rounded-full text-white pointer-events-auto active:scale-90 shadow-xl"><X size={24} /></button>
                </div>

                {gbRevealed && (wonTon !== null || wonPoints !== null) && (
                    <div className="fixed inset-0 z-[10030] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm pointer-events-auto">
                        <div className="bg-slate-950 border-2 border-amber-400 p-8 rounded-[2.5rem] flex flex-col items-center gap-5 animate-in zoom-in duration-500 shadow-2xl">
                            <PackageOpen className="text-amber-400 animate-bounce" size={48} />
                            <div className="text-center">
                                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Mystery Found</h2>
                                <span className="text-4xl font-black text-white flex items-center gap-2">
                                    {wonTon || wonPoints} {wonTon ? <Wallet size={24}/> : <Coins size={24}/>}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {collecting && !gbRevealed && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-green-500/20 backdrop-blur-xl p-8 rounded-[3rem] border border-green-500/40 flex flex-col items-center gap-4 animate-in zoom-in duration-500">
                        <CheckCircle className="text-green-400" size={64} />
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">SUCCESS</h2>
                    </div>
                )}

                <div className="flex justify-center mb-12">
                    <div className="bg-black/60 backdrop-blur-xl px-10 py-3 rounded-full border border-white/10 pointer-events-auto">
                        <span className="text-xs font-mono font-black text-white">{target ? distanceToCoin.toFixed(1) : "--.-"}m</span>
                        <span className={`ml-4 text-[9px] font-black uppercase ${distanceToCoin < 6 ? 'text-green-400' : 'text-slate-500'}`}>{distanceToCoin < 6 ? "READY" : "LOCKED"}</span>
                    </div>
                </div>
            </div>

            {playingSponsorAd && target?.spawn.sponsorData && (
                <div className="fixed inset-0 z-[10020] bg-black flex flex-col pointer-events-auto">
                    <UniversalVideoPlayer url={target!.spawn.sponsorData!.videoUrl} autoPlay={true} className="flex-1" />
                    <button onClick={() => { setPlayingSponsorAd(false); triggerCollectionSuccess(Math.floor(target.spawn.value), 0); }} className="m-6 bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs">Claim Reward</button>
                </div>
            )}

            {loadingAd && (
                <div className="fixed inset-0 z-[10025] bg-black/80 backdrop-blur flex flex-col items-center justify-center gap-4 pointer-events-auto">
                    <Loader2 className="text-cyan-400 animate-spin" size={48} />
                    <p className="text-white font-black uppercase tracking-widest text-[10px] animate-pulse">Requesting Rewards...</p>
                </div>
            )}
        </div>
    );
}