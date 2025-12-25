
import React, { useEffect, useState } from 'react';
import { LeaderboardEntry } from '../types';
import { Trophy, Loader2, Award } from 'lucide-react';
import { clsx } from 'clsx';
import { getLeaderboard } from '../services/firebase';

export const LeaderboardView: React.FC = () => {
    const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchLeaders = async () => {
            try {
                const data = await getLeaderboard();
                setLeaders(data);
            } catch (e) {
                console.error("Failed to load leaderboard", e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchLeaders();
    }, []);

    if (isLoading) {
        return (
            <div className="h-full w-full bg-slate-950 flex flex-col items-center justify-center p-6">
                <Loader2 className="text-cyan-400 animate-spin mb-4" size={32} />
                <p className="text-slate-500 text-sm animate-pulse font-mono">RETRIEVING WORLD RANKINGS...</p>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-slate-950 p-6 overflow-y-auto pb-32 no-scrollbar">
            <div className="flex flex-col items-center mb-8 mt-4">
                <div className="p-4 bg-amber-500/10 rounded-full border border-amber-500/20 mb-3 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                    <Trophy className="text-amber-400" size={32} />
                </div>
                <h1 className="text-3xl font-black text-white tracking-tighter font-[Rajdhani] uppercase">
                    World <span className="text-cyan-400">Elite</span>
                </h1>
                <p className="text-slate-500 text-[10px] uppercase tracking-[0.2em] font-bold mt-1">Global Leaderboard</p>
            </div>

            <div className="space-y-2">
                {leaders.map((entry, index) => {
                    const isTop3 = index < 3;
                    return (
                        <div 
                            key={index} 
                            className={clsx(
                                "flex items-center justify-between p-4 rounded-2xl border transition-all",
                                index === 0 ? "bg-amber-500/10 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]" :
                                index === 1 ? "bg-slate-300/10 border-slate-300/30" :
                                index === 2 ? "bg-amber-700/10 border-amber-700/30" :
                                "bg-slate-900/50 border-slate-800 hover:border-slate-700"
                            )}
                        >
                            <div className="flex items-center gap-4">
                                <div className={clsx(
                                    "w-8 h-8 flex items-center justify-center rounded-lg font-black text-sm",
                                    index === 0 ? "bg-amber-400 text-amber-950 shadow-[0_0_10px_rgba(251,191,36,0.5)]" :
                                    index === 1 ? "bg-slate-300 text-slate-900" :
                                    index === 2 ? "bg-amber-700 text-amber-100" :
                                    "bg-slate-800 text-slate-500"
                                )}>
                                    {index + 1}
                                </div>
                                <div className="flex flex-col">
                                    <span className={clsx(
                                        "font-bold text-sm tracking-tight",
                                        isTop3 ? "text-white" : "text-slate-300"
                                    )}>
                                        {entry.username}
                                    </span>
                                    {index === 0 && <span className="text-[9px] text-amber-400 font-bold uppercase flex items-center gap-1"><Award size={10} /> Grand Hunter</span>}
                                </div>
                            </div>
                            <div className="text-right">
                                <span className={clsx(
                                    "block font-mono font-black text-sm",
                                    isTop3 ? "text-cyan-400" : "text-slate-400"
                                )}>
                                    {entry.score.toLocaleString()}
                                </span>
                                <span className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">ELZR</span>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <div className="mt-8 p-6 bg-slate-900/30 border border-dashed border-slate-800 rounded-3xl text-center">
                <p className="text-xs text-slate-500 leading-relaxed italic">
                    "The rankings are updated in real-time. Only the top 50 global hunters are displayed."
                </p>
            </div>
        </div>
    );
};
