import React, { useState, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Coordinate, SpawnPoint, HotspotDefinition } from '../types';
import { getDistance } from '../utils';
import { MAX_INTERACTION_DISTANCE, NEARBY_SEARCH_RADIUS } from '../constants';
import { Coin3D } from '../components/Coin3D';
import { LocateFixed, Navigation, Rocket, Crown, Gift, Megaphone, Zap, Radio, Target as TargetIcon } from 'lucide-react';
import { ARView } from './ARView';

const AmbientLight = 'ambientLight' as any;

interface HuntViewProps {
    location: Coordinate;
    spawns: SpawnPoint[];
    collectedIds: string[];
    onCollect: (id: string, value: number, category?: any, tonReward?: number) => void;
    hotspots: HotspotDefinition[];
}

export const HuntView: React.FC<HuntViewProps> = ({ location, spawns, collectedIds, onCollect, hotspots }) => {
    const [nearestSpawn, setNearestSpawn] = useState<{ spawn: SpawnPoint, dist: number } | null>(null);
    const [arMode, setArMode] = useState(false);

    const allAvailableTargets = useMemo(() => {
        const hotspotSpawns: SpawnPoint[] = hotspots.map(h => ({
            id: h.id,
            name: h.name,
            coords: h.coords,
            collected: false,
            value: h.baseValue,
            category: h.category,
            description: h.category === 'EVENT' ? 'XMAS MARKET' : (h.category === 'MERCHANT' ? 'PROMOTIONAL DROP' : 'ELITE COIN'),
            isLandmark: h.category === 'EVENT' || h.category === 'LANDMARK',
            logoUrl: h.logoUrl,
            customText: h.customText,
            sponsorData: (h as any).sponsorData,
            prizes: h.prizes
        }));

        return [...spawns, ...hotspotSpawns];
    }, [spawns, hotspots]);

    useEffect(() => {
        let closest: SpawnPoint | null = null;
        let minDesc = Infinity;

        allAvailableTargets.forEach(target => {
            if (collectedIds.includes(target.id)) return;
            const d = getDistance(location, target.coords);
            
            if (d < minDesc && d < NEARBY_SEARCH_RADIUS) {
                minDesc = d;
                closest = target;
            }
        });

        if (closest) {
            setNearestSpawn({ spawn: closest, dist: minDesc });
        } else {
            if (!arMode) setNearestSpawn(null);
        }
    }, [location, allAvailableTargets, collectedIds, arMode]);

    const handleARCollect = (points: number, tonReward: number = 0) => {
        if (nearestSpawn) {
            onCollect(nearestSpawn.spawn.id, points, nearestSpawn.spawn.category, tonReward);
        }
    };

    const handleStandardCollect = () => {
         if (nearestSpawn) {
            onCollect(nearestSpawn.spawn.id, Math.floor(nearestSpawn.spawn.value), nearestSpawn.spawn.category, 0);
            setNearestSpawn(null);
        }
    };

    if (arMode) {
        return <ARView target={nearestSpawn} onClose={() => setArMode(false)} onCollect={handleARCollect} />;
    }

    return (
        <div className="h-full w-full bg-[#020617] px-6 pt-12 pb-40 flex flex-col items-center relative overflow-y-auto no-scrollbar overflow-hidden">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
            
            <header className="w-full flex justify-between items-center mb-10 z-10">
                <div className="flex flex-col">
                    <span className="text-[10px] text-cyan-500 font-black uppercase tracking-[0.4em] mb-1">Sector 7G</span>
                    <h1 className="text-3xl font-black text-white tracking-tighter font-[Rajdhani] uppercase">Tactical <span className="text-cyan-500">Radar</span></h1>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-white/5 shadow-xl">
                    <Radio className="text-cyan-400 animate-pulse" size={20} />
                </div>
            </header>
            
            {/* RADAR UI */}
            <div className="relative w-72 h-72 mb-10 shrink-0 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-slate-800/40"></div>
                <div className="absolute inset-[15%] rounded-full border border-slate-800/40"></div>
                <div className="absolute inset-[30%] rounded-full border border-slate-800/40"></div>
                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-slate-800/40"></div>
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-slate-800/40"></div>
                
                {/* SCANNER LINE */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-500/0 via-cyan-500/0 to-cyan-500/20 animate-spin-slow"></div>
                
                <div className={`relative z-10 w-20 h-20 rounded-full bg-slate-900 border-2 flex items-center justify-center transition-all duration-500 shadow-[0_0_30px_rgba(6,182,212,0.1)] ${nearestSpawn ? 'border-cyan-500' : 'border-slate-800'}`}>
                    <TargetIcon className={nearestSpawn ? "text-cyan-400 animate-pulse" : "text-slate-700"} size={40} />
                </div>

                {/* RANDOM BLIPS */}
                {!nearestSpawn && (
                    <>
                        <div className="absolute top-10 right-20 w-1.5 h-1.5 bg-cyan-500/40 rounded-full animate-ping"></div>
                        <div className="absolute bottom-20 left-10 w-1 h-1 bg-cyan-500/40 rounded-full animate-ping [animation-delay:1s]"></div>
                    </>
                )}
            </div>

            {nearestSpawn ? (
                <div className={`w-full max-w-sm bg-slate-900/70 backdrop-blur-2xl border-2 rounded-[2.5rem] p-6 shadow-2xl relative z-10 animate-in slide-in-from-bottom-8 duration-700 ${nearestSpawn.spawn.category === 'EVENT' ? 'border-green-500/40 shadow-green-900/20' : (nearestSpawn.spawn.category === 'MERCHANT' ? 'border-red-500/40 shadow-red-900/20' : nearestSpawn.spawn.isLandmark ? 'border-amber-400/40' : 'border-slate-700/50')}`}>
                    
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-800 shadow-xl flex items-center justify-center">
                                    {nearestSpawn.spawn.logoUrl ? (
                                        <img src={nearestSpawn.spawn.logoUrl} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-3xl">{nearestSpawn.spawn.category === 'EVENT' ? '🎄' : (nearestSpawn.spawn.category === 'MERCHANT' ? '📣' : '💰')}</span>
                                    )}
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-cyan-500 rounded-full border-2 border-slate-900 flex items-center justify-center">
                                    <Zap size={10} className="text-white fill-current" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white leading-none uppercase tracking-tighter mb-1">{nearestSpawn.spawn.name}</h3>
                                <p className="text-slate-500 text-[9px] uppercase font-black tracking-widest">{nearestSpawn.spawn.description}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-black/50 p-4 rounded-3xl border border-white/5 flex flex-col items-center">
                            <Navigation className="text-cyan-400 mb-2" size={18} />
                            <div className="text-xl font-black text-white font-mono leading-none tracking-tighter">
                                {nearestSpawn.dist < 1000 ? `${Math.round(nearestSpawn.dist)}m` : `${(nearestSpawn.dist / 1000).toFixed(1)}km`}
                            </div>
                            <span className="text-[8px] text-slate-500 font-black uppercase mt-1">Distance</span>
                        </div>
                        <div className="bg-amber-500/5 p-4 rounded-3xl border border-amber-500/10 flex flex-col items-center">
                            <Crown className="text-amber-500 mb-2" size={18} />
                            <div className="text-xl font-black text-amber-400 font-mono leading-none tracking-tighter">
                                {Math.floor(nearestSpawn.spawn.value)}
                            </div>
                            <span className="text-[8px] text-slate-500 font-black uppercase mt-1">Extraction</span>
                        </div>
                    </div>

                    <button 
                        onClick={() => setArMode(true)} 
                        className={`w-full py-4 mb-4 font-black rounded-2xl shadow-xl transform active:scale-95 transition-all flex items-center justify-center gap-3 text-xs uppercase tracking-[0.2em]
                            ${nearestSpawn.dist < 200 
                                ? "bg-white text-black hover:bg-slate-200" 
                                : "bg-slate-800 text-slate-500 border border-slate-700 cursor-default"
                            }
                        `}
                    >
                        <Rocket size={18} className={nearestSpawn.dist < 200 ? "animate-bounce" : ""} /> 
                        {nearestSpawn.dist < 200 ? "Initiate Extraction" : "Signal Too Weak"}
                    </button>
                    
                    {nearestSpawn.dist <= MAX_INTERACTION_DISTANCE && (
                        <button onClick={handleStandardCollect} className="w-full py-2.5 bg-slate-800/30 text-slate-500 text-[9px] font-black uppercase rounded-xl hover:bg-slate-800 transition-colors tracking-[0.3em] border border-white/5">
                            Standard Uplink
                        </button>
                    )}
                </div>
            ) : (
                <div className="text-center z-10 animate-in fade-in duration-1000">
                    <div className="w-24 h-24 bg-slate-900/50 rounded-[2rem] border border-slate-800 flex items-center justify-center mb-6 mx-auto">
                        <Radio size={40} className="text-slate-700 opacity-20" />
                    </div>
                    <p className="text-lg font-black text-slate-500 uppercase tracking-widest font-[Rajdhani] mb-2">No Active Signals</p>
                    <p className="text-[9px] max-w-[180px] mx-auto text-slate-600 font-black uppercase leading-relaxed tracking-widest">
                        MOVE TO A DENSE URBAN SECTOR TO DETECT $ELZR PROTOCOLS
                    </p>
                </div>
            )}
            
            <style>{`
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin-slow {
                    animation: spin-slow 8s linear infinite;
                }
            `}</style>
        </div>
    );
};