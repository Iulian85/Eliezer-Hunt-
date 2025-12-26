
import React, { useState, useEffect } from 'react';
import { TonConnectButton } from '@tonconnect/ui-react';
import { Gift, Loader2, ShieldCheck, Coins, TrendingUp, Megaphone, Star, Sparkles, Clock, Users, Wallet, ArrowUpRight, Target, Crown, Info } from 'lucide-react';
import { showRewardedAd } from '../services/adsgram';
import { processWithdrawTON } from '../services/firebase';
import { REWARD_AD_VALUE, ADSGRAM_BLOCK_ID } from '../constants';
import { UserState } from '../types';

interface WalletViewProps {
    userState: UserState;
    onAdReward: (amount: number) => void;
    onInvite: () => void;
}

export const WalletView: React.FC<WalletViewProps> = ({ 
    userState, onAdReward, onInvite
}) => {
    const [loadingAd, setLoadingAd] = useState(false);
    const [withdrawing, setWithdrawing] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
    const [withdrawSuccess, setWithdrawSuccess] = useState(false);

    const { 
        balance, 
        tonBalance = 0,
        gameplayBalance = 0, 
        rareBalance = 0, 
        eventBalance = 0, 
        dailySupplyBalance = 0,
        merchantBalance = 0, 
        referralBalance = 0,
        referrals = 0,
        lastDailyClaim = 0
    } = userState;

    const MAX_MULTIPLIER = 2.5; 
    const refMultiplier = Math.min(MAX_MULTIPLIER, 1 + (Math.log10(referrals + 1) / 4));
    const estimatedAllocation = (balance * refMultiplier) / 100000000;

    useEffect(() => {
        const interval = setInterval(() => {
            const diff = (24 * 60 * 60 * 1000) - (Date.now() - lastDailyClaim);
            if (diff > 0) {
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setTimeRemaining(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            } else setTimeRemaining(null);
        }, 1000);
        return () => clearInterval(interval);
    }, [lastDailyClaim]);

    const handleWithdraw = async () => {
        if (tonBalance < 10) return;
        setWithdrawing(true);
        const success = await processWithdrawTON(userState.telegramId!, tonBalance);
        setWithdrawing(false);
        if (success) {
            setWithdrawSuccess(true);
            setTimeout(() => setWithdrawSuccess(false), 5000);
        }
    };

    return (
        <div className="h-full w-full p-6 overflow-y-auto pb-40 no-scrollbar bg-[#020617] font-[Rajdhani]">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Assets</h1>
                    <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-[0.3em]">Extraction Node v1</p>
                </div>
                <div className="scale-90 origin-right brightness-110"><TonConnectButton /></div>
            </div>

            <div className="relative p-8 rounded-[2.5rem] bg-slate-900 border border-white/5 shadow-2xl mb-8 overflow-hidden group">
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-[100px] group-hover:bg-cyan-500/20 transition-all duration-1000"></div>
                <div className="relative z-10 flex flex-col items-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-[0_10px_30px_rgba(6,182,212,0.3)]">
                        <Coins className="text-white" size={32} />
                    </div>
                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.5em] mb-2">Total Score</span>
                    <span className="text-6xl font-black text-white tracking-tighter leading-none">{balance.toLocaleString()}</span>
                    <div className="mt-4 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                        <span className="text-[9px] text-cyan-400 font-black uppercase tracking-widest">x{refMultiplier.toFixed(2)} Squad Bonus</span>
                    </div>
                </div>
            </div>

            <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="text-cyan-400" size={18} />
                    <h2 className="text-sm font-black text-white uppercase tracking-widest">Airdrop Readiness</h2>
                </div>
                <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest block mb-1">Estimated $ELZR</span>
                            <div className="text-3xl font-black text-white font-mono tracking-tighter">
                                {estimatedAllocation.toFixed(6)}
                            </div>
                        </div>
                        <div className="text-right">
                             <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest block mb-1">Status</span>
                             <span className="text-[10px] text-green-400 font-black uppercase bg-green-400/10 px-2 py-0.5 rounded border border-green-400/20">Active</span>
                        </div>
                    </div>
                    <div className="space-y-4 pt-4 border-t border-white/5">
                        <div className="flex justify-between items-center">
                             <div className="flex items-center gap-3"><Target size={14} className="text-slate-500" /><span className="text-[11px] text-slate-300 font-bold uppercase">Urban Yield</span></div>
                             <span className="text-xs font-mono font-bold text-white">{gameplayBalance.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                             <div className="flex items-center gap-3"><Crown size={14} className="text-amber-500" /><span className="text-[11px] text-slate-300 font-bold uppercase">Rare Extraction</span></div>
                             <span className="text-xs font-mono font-bold text-amber-500">{rareBalance.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                             <div className="flex items-center gap-3"><Megaphone size={14} className="text-red-500" /><span className="text-[11px] text-slate-300 font-bold uppercase">Intel Rewards</span></div>
                             <span className="text-xs font-mono font-bold text-red-500">{merchantBalance.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 mb-8 flex items-center justify-between shadow-xl">
                <div className="flex items-center gap-4">
                    <div className={`p-4 rounded-2xl ${timeRemaining ? 'bg-slate-800 text-slate-600' : 'bg-cyan-500 text-white animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.4)]'}`}>
                        <Gift size={24} />
                    </div>
                    <div>
                        <h3 className="font-black text-white text-xs uppercase tracking-widest">Daily Supply</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                            {timeRemaining ? `Next drop in ${timeRemaining}` : '+500 Points Available'}
                        </p>
                    </div>
                </div>
                <button 
                    onClick={() => !timeRemaining && onAdReward(REWARD_AD_VALUE)} 
                    disabled={loadingAd || !!timeRemaining}
                    className={`px-6 py-2.5 rounded-xl font-black text-[10px] transition-all uppercase tracking-widest ${timeRemaining ? 'bg-slate-800 text-slate-600' : 'bg-white text-black active:scale-95 shadow-lg'}`}
                >
                    {loadingAd ? <Loader2 className="animate-spin" size={14}/> : (timeRemaining ? "SECURED" : "EXTRACT")}
                </button>
            </div>

            <div className="bg-gradient-to-br from-blue-600 to-indigo-900 p-8 rounded-[2.5rem] mb-12 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-20"><ShieldCheck size={48} /></div>
                <div className="relative z-10">
                    <span className="text-[10px] text-blue-200 font-black uppercase tracking-[0.3em] mb-2 block">TON Mainnet Reserve</span>
                    <div className="text-5xl font-black text-white font-mono tracking-tighter mb-8 leading-none">
                        {tonBalance.toFixed(2)} <span className="text-xl text-blue-300">TON</span>
                    </div>
                    <button 
                        onClick={handleWithdraw}
                        disabled={tonBalance < 10 || withdrawing}
                        className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl
                            ${tonBalance >= 10 ? 'bg-white text-blue-900' : 'bg-blue-800/40 text-blue-300/50 cursor-not-allowed border border-blue-400/10'}
                        `}
                    >
                        {withdrawing ? <Loader2 className="animate-spin" size={16}/> : (withdrawSuccess ? "Transfer Initiated" : (tonBalance >= 10 ? "Withdraw Assets" : "Min 10 TON Reserve"))}
                        {!withdrawing && !withdrawSuccess && tonBalance >= 10 && <ArrowUpRight size={18}/>}
                    </button>
                </div>
            </div>
            
            <div className="flex items-center justify-center gap-2 mb-12 text-slate-700">
                <Info size={12}/>
                <p className="text-[9px] font-black uppercase tracking-[0.2em]">All extractions are verified on-chain</p>
            </div>
        </div>
    );
}
