
import React, { useState, useEffect, useMemo } from 'react';
import { Coordinate, SpawnPoint, HotspotDefinition } from '../types';
import { getDistance } from '../utils';
import { NEARBY_SEARCH_RADIUS } from '../constants';
import { LocateFixed, Navigation, Rocket, ShieldAlert } from 'lucide-react';
import { ARView } from './ARView';

interface HuntViewProps {
    location: Coordinate;
    spawns: SpawnPoint[];
    collectedIds: string[];
    onCollect: (id: string, value: number, category?: any, tonReward?: number, challenge?: any) => void;
    hotspots: HotspotDefinition[];
    userId?: number;
}

export const HuntView: React.FC<HuntViewProps> = ({ location, spawns, collectedIds, onCollect, hotspots, userId }) => {
    const [arMode, setArMode] = useState(false);

    const allAvailableTargets = useMemo(() => {
        const hotspotSpawns: SpawnPoint[] = hotspots
            .filter(h => !collectedIds.includes(h.id))
            .map(h => ({
                id: h.id,
                name: h.name,
                coords: h.coords,
                collected: false,
                value: h.baseValue,
                category: h.category,
                description: h.category === 'EVENT' ? 'SPECIAL GIFT' : (h.category === 'MERCHANT' ? 'PROMOTIONAL DROP' : h.category === 'LANDMARK' ? 'GLOBAL LANDMARK' : 'HOTSPOT COIN'),
                isLandmark: h.category === 'EVENT' || h.category === 'LANDMARK',
                logoUrl: h.logoUrl,
                customText: h.customText,
                sponsorData: (h as any).sponsorData,
                prizes: h.prizes
            }));

        const localSpawns = spawns.filter(s => !collectedIds.includes(s.id));
        const merged = [...localSpawns, ...hotspotSpawns];
        
        // Returnăm doar monedele aflate în raza de scanare
        return merged.filter(t => getDistance(location, t.coords) < NEARBY_SEARCH_RADIUS);
    }, [spawns, hotspots, collectedIds, location]);

    const nearestTarget = useMemo(() => {
        if (allAvailableTargets.length === 0) return null;
        let minD = Infinity;
        let target = null;
        allAvailableTargets.forEach(t => {
            const d = getDistance(location, t.coords);
            if (d < minD) { minD = d; target = { spawn: t, dist: d }; }
        });
        return target;
    }, [allAvailableTargets, location]);

    const handleARCollect = (id: string, points: number, category: any, tonReward: number = 0) => {
        onCollect(id, points, category, tonReward);
    };

    if (arMode) {
        return (
            <ARView 
                userId={userId} 
                targets={allAvailableTargets} 
                userLoc={location} 
                onClose={() => setArMode(false)} 
                onCollect={handleARCollect} 
            />
        );
    }

    return (
        <div className="h-full w-full bg-slate-950 px-6 pt-10 pb-40 flex flex-col items-center relative overflow-y-auto no-scrollbar">
            <h1 className="text-2xl font-bold mb-8 text-cyan-400 tracking-[0.2em] font-[Rajdhani] uppercase text-center">Extraction Radar</h1>
            
            <div className="w-64 h-64 rounded-full border-2 border-slate-700/30 relative flex items-center justify-center mb-4 shadow-[0_0_50px_rgba(6,182,212,0.05)] shrink-0">
                <div className="absolute inset-0 rounded-full border border-cyan-500/10 animate-ping opacity-20"></div>
                <LocateFixed className="text-cyan-500 animate-pulse" size={32} />
                {allAvailableTargets.length > 0 && (
                    <div className="absolute -top-2 -right-2 bg-cyan-500 text-black text-[10px] font-black px-2 py-1 rounded-lg shadow-lg">
                        {allAvailableTargets.length} ACTIVE NODES
                    </div>
                )}
            </div>

            {nearestTarget ? (
                <div className={`w-full max-w-md bg-slate-900 border-2 ${nearestTarget.spawn.category === 'EVENT' ? 'border-green-500/50 shadow-green-900/20' : (nearestTarget.spawn.category === 'MERCHANT' ? 'border-red-500/50 shadow-red-900/20' : nearestTarget.spawn.isLandmark ? 'border-amber-400/50 shadow-amber-900/20' : 'border-slate-800')} rounded-[2.5rem] p-6 shadow-2xl relative z-10 transition-all mt-4`}>
                    <div className="flex justify-between items-start mb-5">
                        <div className="flex items-center gap-3">
                            {nearestTarget.spawn.logoUrl ? <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-700 bg-slate-800"><img src={nearestTarget.spawn.logoUrl} className="w-full h-full object-cover" /></div> : <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl">{nearestTarget.spawn.category === 'EVENT' ? '🎄' : (nearestTarget.spawn.category === 'MERCHANT' ? '📣' : '💰')}</div>}
                            <div><h3 className="text-xl font-bold text-white leading-tight font-[Rajdhani] uppercase">{nearestTarget.spawn.name}</h3><p className="text-slate-500 text-[9px] uppercase font-black tracking-widest">{nearestTarget.spawn.description}</p></div>
                        </div>
                        <div className="bg-amber-500/10 text-amber-400 px-3 py-1.5 rounded-xl text-[10px] font-black border border-amber-500/20 font-mono">+{Math.floor(nearestTarget.spawn.value)} ELZR</div>
                    </div>
                    
                    <div className="flex items-center gap-4 mb-6 bg-black/40 p-4 rounded-[1.5rem] border border-white/5">
                        <div className="p-3 bg-slate-800/80 rounded-xl shadow-inner border border-white/5"><Navigation className="text-cyan-400" size={24} /></div>
                        <div>
                            <div className="text-3xl font-mono font-black text-white tracking-tighter">{nearestTarget.dist < 1000 ? `${Math.round(nearestTarget.dist)}m` : `${(nearestTarget.dist / 1000).toFixed(1)}km`}</div>
                            <div className="text-[9px] text-slate-500 uppercase font-black tracking-[0.2em]">Nearest Target</div>
                        </div>
                    </div>

                    <button onClick={() => setArMode(true)} className={`w-full py-4 mb-3 font-black rounded-2xl shadow-xl transform active:scale-95 transition-all flex items-center justify-center gap-3 text-xs uppercase tracking-[0.2em] ${nearestTarget.dist < 120 ? "bg-white text-black" : "bg-slate-800 text-slate-500 border border-slate-700 cursor-default"}`}>
                        <Rocket size={18} /> {nearestTarget.dist < 120 ? "Access AR Core" : "Out of Extraction Range"}
                    </button>
                    
                    <div className="flex items-center justify-center gap-2 mt-2 py-2 px-4 bg-slate-800/20 rounded-xl border border-slate-800/40">
                        <ShieldAlert size={12} className="text-slate-500" />
                        <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest">Multi-Node Hunt Enabled</span>
                    </div>
                </div>
            ) : (
                <div className="text-center text-slate-500 mt-10">
                    <div className="bg-slate-900/50 p-8 rounded-full mb-6 inline-block border border-slate-800 shadow-inner">
                        <LocateFixed size={48} className="opacity-10" />
                    </div>
                    <p className="text-lg mb-2 font-bold text-slate-400 uppercase tracking-widest font-[Rajdhani]">Scanning Sector...</p>
                    <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">No extraction nodes in immediate range</p>
                </div>
            )}
        </div>
    );
};
