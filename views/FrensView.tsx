
import React, { useState } from 'react';
import { Users, Share2, Sparkles, UserPlus, Check, UserCircle } from 'lucide-react';

interface FrensViewProps {
    referralCount: number;
    referralNames?: string[];
    onInvite: () => void;
}

export const FrensView: React.FC<FrensViewProps> = ({ referralCount, referralNames = [], onInvite }) => {
    const [justCopied, setJustCopied] = useState(false);

    const handleInviteClick = () => {
        onInvite();
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 2000);
    };

    return (
        <div className="h-full w-full bg-slate-950 p-6 overflow-y-auto pb-20 no-scrollbar">
            
            <div className="flex flex-col items-center mb-6 text-center">
                <h1 className="text-3xl font-bold text-white font-[Rajdhani] tracking-wide mb-2 uppercase">
                    Elite <span className="text-cyan-400">Squad</span>
                </h1>
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                    Grow your network for extraction bonuses
                </p>
            </div>

            <div className="mb-10 px-2">
                <button 
                    onClick={handleInviteClick} 
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-black rounded-2xl shadow-[0_0_30px_rgba(37,99,235,0.4)] flex items-center justify-center gap-3 active:scale-95 transition-all text-sm uppercase tracking-widest border border-white/10"
                >
                    {justCopied ? <Check size={20} /> : <Share2 size={20} />}
                    {justCopied ? "INVITE LINK SHARED" : "INVITE FRIENDS"}
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl text-center">
                    <Users className="text-cyan-400 mx-auto mb-2" size={24} />
                    <div className="text-2xl font-black text-white font-mono">{referralCount}</div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold">Agents</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl text-center">
                    <Sparkles className="text-amber-400 mx-auto mb-2" size={24} />
                    <div className="text-2xl font-black text-white font-mono">+{referralCount * 50}</div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold">Bonus ELZR</div>
                </div>
            </div>

            <div className="space-y-4 mb-10">
                <h3 className="text-white font-bold text-xs uppercase tracking-widest px-2">Network Status</h3>

                {referralNames && referralNames.length > 0 ? (
                    <div className="space-y-2">
                        {referralNames.map((name, i) => (
                            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 border border-slate-700">
                                        <UserCircle size={22} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white font-mono">{name}</div>
                                        <div className="text-[9px] text-green-400 font-bold uppercase tracking-widest">Active Node</div>
                                    </div>
                                </div>
                                <div className="bg-green-500/10 text-green-500 px-2 py-1 rounded text-[9px] font-black border border-green-500/20">SYNCED</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-slate-900/30 rounded-[2.5rem] p-10 border border-dashed border-slate-800 text-center">
                        <UserPlus size={40} className="mx-auto text-slate-700 mb-4" />
                        <h3 className="text-white font-bold text-sm mb-2 uppercase tracking-wide">No Agents Recruited</h3>
                        <p className="text-slate-600 text-[10px] leading-relaxed max-w-[180px] mx-auto uppercase font-bold">
                            Friends joining your squad increase your extraction yield.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
