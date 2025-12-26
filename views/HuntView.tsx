
import React, { useState, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Coordinate, SpawnPoint, HotspotDefinition, UserState } from '../types';
import { getDistance } from '../utils';
import { NEARBY_SEARCH_RADIUS } from '../constants';
import { Coin3D } from '../components/Coin3D';
import { LocateFixed, Navigation, Rocket, Crown, Gift, Megaphone, ShieldAlert } from 'lucide-react';
import { ARView } from './ARView';

const AmbientLight = 'ambientLight' as any;

interface HuntViewProps {
    location: Coordinate;
    spawns: SpawnPoint[];
    collectedIds: string[];
    onCollect: (id: string, value: number, category?: any, tonReward?: number, challenge?: any) => void;
    hotspots: HotspotDefinition[];
    userId?: number;
}

export const HuntView: React.FC<HuntViewProps> = ({ location, spawns, collectedIds, onCollect, hotspots, userId }) => {
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
            description: h.category === 'EVENT' ? 'SPECIAL GIFT' : (h.category === 'MERCHANT' ? 'PROMOTIONAL DROP' : 'HOTSPOT COIN'),
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
            if (d < minDesc && d < NEARBY_SEARCH_RADIUS) { minDesc = d; closest = target; }
        });
        if (closest) setNearestSpawn({ spawn: closest, dist: minDesc });
        else if (!arMode) setNearestSpawn(null);
    }, [location, allAvailableTargets, collectedIds, arMode]);

    const handleARCollect = (points: number, tonReward: number = 0, challenge?: any) => {
        if (nearestSpawn) {
            onCollect(nearestSpawn.spawn.id, points, nearestSpawn.spawn.category, tonReward, challenge);
        }
    };

    if (arMode) {
        return <ARView userId={userId} target={nearestSpawn} onClose={() => setArMode(false)} onCollect={handleARCollect} />;
    }

    return (
        <div className="h-full w-full bg-slate-950 px-6 pt-10 pb-40 flex flex-col items-center relative overflow-y-auto no-scrollbar">
            <h1 className="text-2xl font-bold mb-8 text-cyan-400 tracking-[0.2em] font-[Rajdhani] uppercase">Radar</h1>
            <div className="w-64 h-64 rounded-full border-2 border-slate-700/50 relative flex items-center justify-center mb-4 shadow-[0_0_50px_rgba(6,182,212,0.05)] shrink-0">
                <div className="absolute inset-0 rounded-full border border-cyan-500/10 animate-ping opacity-20"></div>
                <LocateFixed className="text-cyan-500 animate-pulse" size={32} />
            </div>
            {nearestSpawn ? (
                <div className={`w-full max-w-md bg-slate-900/90 backdrop-blur-md border ${nearestSpawn.spawn.category === 'EVENT' ? 'border-green-500/50 shadow-green-900/20' : (nearestSpawn.spawn.category === 'MERCHANT' ? 'border-red-500/50 shadow-red-900/20' : nearestSpawn.spawn.isLandmark ? 'border-amber-400/50' : 'border-slate-700/50')} rounded-[2rem] p-6 shadow-2xl relative z-10 transition-all mt-4 border-t-white/10`}>
                    <div className="flex justify-between items-start mb-5">
                        <div className="flex items-center gap-3">
                            {nearestSpawn.spawn.logoUrl ? <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-700 bg-slate-800 shadow-inner"><img src={nearestSpawn.spawn.logoUrl} className="w-full h-full object-cover" /></div> : <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl">{nearestSpawn.spawn.category === 'EVENT' ? '🎄' : (nearestSpawn.spawn.category === 'MERCHANT' ? '📣' : '💰')}</div>}
                            <div><h3 className="text-xl font-bold text-white leading-tight font-[Rajdhani]">{nearestSpawn.spawn.name}</h3><p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">{nearestSpawn.spawn.description}</p></div>
                        </div>
                        <div className="bg-amber-500/10 text-amber-400 px-3 py-1.5 rounded-xl text-xs font-black border border-amber-500/20 font-mono">{Math.floor(nearestSpawn.spawn.value)} ELZR</div>
                    </div>
                    <div className="flex items-center gap-4 mb-6 bg-black/40 p-4 rounded-2xl border border-white/5"><div className="p-3 bg-slate-800/80 rounded-xl shadow-inner border border-white/5"><Navigation className="text-cyan-400" size={24} /></div><div><div className="text-3xl font-mono font-black text-white tracking-tighter">{nearestSpawn.dist < 1000 ? `${Math.round(nearestSpawn.dist)}m` : `${(nearestSpawn.dist / 1000).toFixed(1)}km`}</div><div className="text-[9px] text-slate-500 uppercase font-black tracking-[0.2em]">Target Proximity</div></div></div>
                    <button onClick={() => setArMode(true)} className={`w-full py-4 mb-3 font-black rounded-2xl shadow-xl transform active:scale-95 transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-widest ${nearestSpawn.dist < 200 ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-blue-900/40" : "bg-slate-800 text-slate-500 border border-slate-700 cursor-default"}`}><Rocket size={18} className={nearestSpawn.dist < 200 ? "animate-bounce" : ""} /> {nearestSpawn.dist < 200 ? "Start AR Hunt" : "Too Far To Hunt"}</button>
                    <div className="flex items-center justify-center gap-2 mt-2 py-2 px-4 bg-slate-800/20 rounded-xl border border-slate-800/40"><ShieldAlert size={12} className="text-slate-500" /><span className="text-[8px] text-slate-600 font-black uppercase tracking-widest">Mandatory AR Extraction Required</span></div>
                </div>
            ) : <div className="text-center text-slate-500 mt-10"><div className="bg-slate-900/50 p-8 rounded-full mb-6 inline-block border border-slate-800 shadow-inner"><LocateFixed size={48} className="opacity-10" /></div><p className="text-lg mb-2 font-bold text-slate-400 uppercase tracking-widest font-[Rajdhani]">Scanning Sector...</p></div>}
        </div>
    );
};
