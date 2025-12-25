
import React, { useState } from 'react';
import { Users, Share2, Sparkles, UserPlus, Check, UserCircle } from 'lucide-react';

interface FrensViewProps {
    referralCount: number;
    referralNames?: string[];
    onInvite: () => void;
}

export const FrensView: React.FC<FrensViewProps> = ({ referralCount, referralNames = [], onInvite }) => {
    const [justCopied, setJustCopied] = useState(false);

    const rawMultiplier = 1 + (Math.log10(referralCount + 1) / 4);
    const MAX_MULTIPLIER = 2.5;
    const multiplier = Math.min(MAX_MULTIPLIER, rawMultiplier);

    const handleInviteClick = () => {
        onInvite();
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 2000);
    };

    return (
        <div className="h-full w-full bg-slate-950 p-6 overflow-y-auto pb-40 no-scrollbar">
            
            <div className="flex flex-col items-center mb-6 mt-4 text-center">
                <h1 className="text-3xl font-bold text-white font-[Rajdhani] tracking-wide mb-2 uppercase">
                    Elite <span className="text-cyan-400">Network</span>
                </h1>
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                    Build your extraction squad
                </p>
            </div>

            <div className="mb-10 px-2">
                <button 
                    onClick={handleInviteClick} 
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-black rounded-2xl shadow-[0_0_30px_rgba(37,99,235,0.4)] flex items-center justify-center gap-3 active:scale-95 transition-all text-sm uppercase tracking-widest border border-white/10"
                >
                    {justCopied ? <Check size={20} /> : <Share2 size={20} />}
                    {justCopied ? "LINK SHARED" : "INVITE FRIENDS"}
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-3xl text-center">
                    <Users className="text-cyan-400 mx-auto mb-2" size={24} />
                    <div className="text-2xl font-black text-white font-mono">{referralCount}</div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold">Network</div>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-3xl text-center">
                    <Sparkles className="text-amber-400 mx-auto mb-2" size={24} />
                    <div className="text-2xl font-black text-white font-mono">+{multiplier.toFixed(2)}x</div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold">Bonus</div>
                </div>
            </div>

            <div className="space-y-4 mb-10">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                        <Users size={14} className="text-cyan-400" /> Elite Network ({referralCount})
                    </h3>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Reward: +50/Friend</span>
                </div>

                {referralNames && referralNames.length > 0 ? (
                    <div className="space-y-2">
                        {referralNames.map((name, i) => (
                            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 border border-slate-700">
                                        <UserCircle size={22} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white font-mono">{name}</div>
                                        <div className="text-[9px] text-green-400 font-bold uppercase tracking-widest">Active Hunter</div>
                                    </div>
                                </div>
                                <div className="bg-green-500/10 text-green-500 px-2 py-1 rounded text-[9px] font-black border border-green-500/20">VERIFIED</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-slate-900/30 rounded-[2.5rem] p-10 border border-dashed border-slate-800 text-center">
                        <UserPlus size={40} className="mx-auto text-slate-700 mb-4" />
                        <h3 className="text-white font-bold text-sm mb-2 uppercase tracking-wide">Network is Empty</h3>
                        <p className="text-slate-600 text-[10px] leading-relaxed max-w-[180px] mx-auto uppercase font-bold">
                            Friends joining through your portal contribute to your extraction speed.
                        </p>
                    </div>
                )}
            </div>

            <div className="bg-slate-900/50 rounded-3xl p-5 border border-slate-800">
                <h4 className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-4">Network Benefits</h4>
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-[10px] font-bold uppercase">Friend Invite Bonus</span>
                        <span className="text-green-400 text-xs font-black">+50 ELZR</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-[10px] font-bold uppercase">Extraction Boost</span>
                        <span className="text-cyan-400 text-xs font-black">+Log(N) Yield</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
