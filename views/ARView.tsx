
import React, { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { DeviceOrientationControls, PerspectiveCamera } from '@react-three/drei';
import { X, Loader2, PackageOpen, Wallet, Camera, Zap, Gift, Target } from 'lucide-react';
import * as THREE from 'three';
import { Coin3D } from '../components/Coin3D';
import { SpawnPoint, Coordinate } from '../types';
import { showRewardedAd } from '../services/adsgram';
import { logAdStartFirebase } from '../services/firebase';
import { UniversalVideoPlayer } from '../components/UniversalVideoPlayer';
import { ADSGRAM_BLOCK_ID } from '../constants';
import { getDistance } from '../utils';

const AmbientLight = 'ambientLight' as any;
const PointLight = 'pointLight' as any;
const Group = 'group' as any;

interface ARViewProps {
    targets: SpawnPoint[];
    userLoc: Coordinate;
    userId?: number;
    onClose: () => void;
    onCollect: (id: string, points: number, category: any, tonReward?: number) => void;
}

// Calculează unghiul (bearing) între două puncte GPS
function getBearing(p1: Coordinate, p2: Coordinate): number {
    const lat1 = (p1.lat * Math.PI) / 180;
    const lon1 = (p1.lng * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const lon2 = (p2.lng * Math.PI) / 180;
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    return Math.atan2(y, x);
}

const CameraLight = () => {
    const { camera } = useThree();
    const lightRef = useRef<THREE.PointLight>(null);
    useFrame(() => { if (lightRef.current) lightRef.current.position.copy(camera.position); });
    return <PointLight ref={lightRef} intensity={10} distance={20} color="#ffffff" />;
};

export const ARView: React.FC<ARViewProps> = ({ targets, userLoc, userId, onClose, onCollect }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [collectingId, setCollectingId] = useState<string | null>(null);
    const [loadingAd, setLoadingAd] = useState(false);
    const [playingSponsorAd, setPlayingSponsorAd] = useState<SpawnPoint | null>(null);
    const [gbRevealed, setGbRevealed] = useState<{points: number, ton: number} | null>(null);

    // Calculăm pozițiile 3D relative pentru toate monedele
    const coinsIn3D = useMemo(() => {
        return targets.map(t => {
            const dist = getDistance(userLoc, t.coords);
            const bearing = getBearing(userLoc, t.coords);
            // Limităm distanța vizuală în AR la max 15 metri pentru vizibilitate, chiar dacă e la 80m în realitate
            const visualDist = Math.min(dist, 15); 
            const x = Math.sin(bearing) * visualDist;
            const z = -Math.cos(bearing) * visualDist;
            return { spawn: t, pos: new THREE.Vector3(x, 0, z), realDist: dist };
        });
    }, [targets, userLoc]);

    useEffect(() => {
        let stream: MediaStream | null = null;
        const startCamera = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => videoRef.current?.play().then(() => setCameraActive(true));
                }
            } catch (err) { console.error("Camera error", err); }
        };
        startCamera();
        return () => { stream?.getTracks().forEach(t => t.stop()); };
    }, []);

    const handleCoinTap = async (target: SpawnPoint) => {
        if (collectingId || loadingAd || playingSponsorAd || gbRevealed) return;
        const cat = target.category;

        if (cat === 'GIFTBOX' || cat === 'EVENT' || cat === 'LANDMARK') {
            setLoadingAd(true);
            if (userId) await logAdStartFirebase(userId);
            const success = await showRewardedAd(ADSGRAM_BLOCK_ID);
            setLoadingAd(false);
            if (success) {
                if (cat === 'GIFTBOX') {
                    const isTonWin = Math.random() < 0.15;
                    let p = 0, t = 0;
                    if (isTonWin) t = target.prizes![Math.floor(Math.random() * target.prizes!.length)];
                    else p = [100, 250, 500][Math.floor(Math.random() * 3)];
                    setGbRevealed({ points: p, ton: t });
                    setTimeout(() => {
                        setGbRevealed(null);
                        executeCollection(target, p, t);
                    }, 4000);
                } else executeCollection(target, Math.floor(target.value), 0);
            }
            return;
        }

        if (cat === 'MERCHANT' && target.sponsorData?.videoUrl) {
            setPlayingSponsorAd(target);
            return;
        }

        executeCollection(target, Math.floor(target.value), 0);
    };

    const executeCollection = (target: SpawnPoint, p: number, t: number) => {
        setCollectingId(target.id);
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        onCollect(target.id, p, target.category, t);
        // Resetăm starea de colectare după ce animația 3D (lerp la scale 0) a terminat
        setTimeout(() => setCollectingId(null), 2000);
    };

    return (
        <div className="fixed inset-0 z-[10010] bg-black">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover z-0" autoPlay playsInline muted />
            
            <div className={`absolute inset-0 z-10 transition-opacity duration-500 ${cameraActive ? 'opacity-100' : 'opacity-0'}`}>
                <Canvas gl={{ alpha: true, antialias: true }} style={{ pointerEvents: 'auto' }}>
                    <Suspense fallback={null}>
                        <AmbientLight intensity={1.5} />
                        <CameraLight />
                        <DeviceOrientationControls />
                        <PerspectiveCamera makeDefault position={[0, 0, 0]} fov={75} />
                        
                        {coinsIn3D.map(coin => (
                            <Group key={coin.spawn.id} position={coin.pos}>
                                <Coin3D 
                                    scale={coin.spawn.category === 'GIFTBOX' ? 0.6 : 0.5} 
                                    interactive={coin.realDist <= 80 && collectingId !== coin.spawn.id} 
                                    onClick={() => handleCoinTap(coin.spawn)} 
                                    collected={collectingId === coin.spawn.id} 
                                    isGiftBox={coin.spawn.category === 'GIFTBOX'} 
                                    isSponsored={coin.spawn.category === 'MERCHANT'}
                                    customText={coin.spawn.customText}
                                    logoUrl={coin.spawn.logoUrl} 
                                />
                            </Group>
                        ))}
                    </Suspense>
                </Canvas>
            </div>

            <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-6">
                <div className="flex justify-between items-start pointer-events-auto">
                    <div className="bg-black/60 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10 flex items-center gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <div><p className="text-[8px] text-slate-400 uppercase font-black">Scanner Active</p><p className="text-white text-xs font-black">{targets.length} Nodes Found</p></div>
                    </div>
                    <button onClick={onClose} className="bg-red-600 p-3 rounded-full text-white shadow-xl active:scale-75 transition-transform pointer-events-auto"><X size={24} /></button>
                </div>
                
                <div className="flex justify-center mb-16">
                    <div className="bg-black/80 backdrop-blur-2xl px-8 py-3 rounded-full border border-white/10 pointer-events-auto flex items-center gap-4 shadow-2xl">
                        <Target className="text-cyan-400 animate-spin-slow" size={18} />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Move device to scan horizon</span>
                    </div>
                </div>
            </div>

            {gbRevealed && (
                <div className="fixed inset-0 z-[10030] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
                    <div className="bg-slate-950 border-2 border-amber-400 p-10 rounded-[3rem] flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(251,191,36,0.3)] animate-in zoom-in">
                        <PackageOpen className="text-amber-400 animate-bounce" size={64} />
                        <div className="text-center"><h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Unboxed</h2><span className="text-5xl font-black text-white">{gbRevealed.ton || gbRevealed.points} {gbRevealed.ton ? 'TON' : 'ELZR'}</span></div>
                    </div>
                </div>
            )}

            {playingSponsorAd && (
                <div className="fixed inset-0 z-[10020] bg-black flex flex-col">
                    <UniversalVideoPlayer url={playingSponsorAd.sponsorData!.videoUrl} autoPlay={true} className="flex-1" />
                    <button onClick={() => { const s = playingSponsorAd; setPlayingSponsorAd(null); executeCollection(s, Math.floor(s.value), 0); }} className="m-8 bg-white text-black py-5 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-transform">Collect Reward</button>
                </div>
            )}
            
            {loadingAd && <div className="fixed inset-0 z-[10025] bg-black/90 backdrop-blur flex items-center justify-center"><Loader2 className="text-cyan-400 animate-spin" size={64} /></div>}
        </div>
    );
}
