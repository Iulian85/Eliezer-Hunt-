import React, { useState, useEffect } from 'react';
import { TonConnectButton } from '@tonconnect/ui-react';
import { Gift, Loader2, ShieldCheck, Coins, TrendingUp, Megaphone, Star, Sparkles, Clock, Users, Wallet, ArrowUpRight, Target, ShoppingBag, Crown, Zap, Activity } from 'lucide-react';
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
    const rawMultiplier = 1 + (Math.log10(referrals + 1) / 4);
    const refMultiplier = Math.min(MAX_MULTIPLIER, rawMultiplier);
    const totalWeightedScore = Math.floor(balance * refMultiplier);
    const estimatedAllocation = totalWeightedScore / 1000000;

    useEffect(() => {
        const checkCooldown = () => {
            const now = Date.now();
            const cooldownMs = 24 * 60 * 60 * 1000; 
            const timeSinceLast = now - lastDailyClaim;
            
            if (timeSinceLast < cooldownMs) {
                const diff = cooldownMs - timeSinceLast;
                const h = Math.floor(diff / (1000 * 60 * 60));
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeRemaining(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            } else {
                setTimeRemaining(null);
            }
        };
        checkCooldown();
        const interval = setInterval(checkCooldown, 1000);
        return () => clearInterval(interval);
    }, [lastDailyClaim]);

    const handleWatchAd = async () => {
        if (timeRemaining) return;
        setLoadingAd(true);
        const success = await showRewardedAd(ADSGRAM_BLOCK_ID);
        setLoadingAd(false);
        if (success) onAdReward(REWARD_AD_VALUE);
    };

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
        <div className="h-full w-full p-6 overflow-y-auto pb-40 no-scrollbar bg-[#020617]">
            <header className="flex justify-between items-center mb-8">
                <div className="flex flex-col">
                    <span className="text-[10px] text-cyan-500 font-black uppercase tracking-[0.3em] mb-1">Asset Node</span>
                    <h1 className="text-2xl font-black text-white uppercase tracking-tighter font-[Rajdhani]">Vault</h1>
                </div>
                <div className="scale-90 origin-right"><TonConnectButton /></div>
            </header>

            {/* BALANCE CARD */}
            <div className="bg-slate-900 border-2 border-slate-800 rounded-[2.5rem] p-8 mb-8 relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"></div>
                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 flex items-center justify-center mb-4">
                        <Coins className="text-cyan-400" size={32} />
                    </div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-[0.4em] font-black mb-1">Extraction Points</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-6xl font-black text-white tracking-tighter font-[Rajdhani]">{balance.toLocaleString()}</span>
                        <span className="text-xs text-cyan-500 font-black uppercase">PTS</span>
                    </div>
                </div>
            </div>

            {/* AIRDROP SECTION */}
            <section className="mb-8">
                <div className="flex items-center gap-2 mb-4 px-2">
                    <Activity className="text-cyan-400" size={16} />
                    <h2 className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Protocol Metrics</h2>
                </div>
                
                <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 shadow-xl space-y-6">
                    <div className="bg-black/40 rounded-3xl p-5 border border-white/5 text-center">
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest mb-2 block font-black">Estimated $ELZR Allocation</span>
                        <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-white to-blue-500 font-mono tracking-tighter">
                            {estimatedAllocation.toFixed(6)}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                        <div className="flex justify-between items-center p-3 bg-slate-800/20 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-800 rounded-lg"><Target size={14} className="text-slate-400" /></div>
                                <span className="text-[10px] text-slate-400 font-black uppercase">Gameplay Yield</span>
                            </div>
                            <span className="text-xs font-mono font-black text-white">{gameplayBalance.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-slate-800/20 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-800 rounded-lg"><Crown size={14} className="text-amber-500" /></div>
                                <span className="text-[10px] text-slate-400 font-black uppercase">Landmark Bonus</span>
                            </div>
                            <span className="text-xs font-mono font-black text-amber-400">{rareBalance.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-slate-800/20 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-800 rounded-lg"><Zap size={14} className="text-cyan-400" /></div>
                                <span className="text-[10px] text-slate-400 font-black uppercase">Merchant Drops</span>
                            </div>
                            <span className="text-xs font-mono font-black text-cyan-400">{merchantBalance.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* DAILY REWARD */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex items-center justify-between mb-8 shadow-lg">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${timeRemaining ? 'bg-slate-800 text-slate-600' : 'bg-green-500/10 text-green-400 animate-pulse'}`}>
                        <Gift size={24} />
                    </div>
                    <div>
                        <h3 className="font-black text-white text-xs uppercase tracking-tight">Daily Uplink</h3>
                        <p className="text-[9px] text-slate-500 font-bold uppercase">{timeRemaining ? `Cooldown: ${timeRemaining}` : "+500 Extraction Pts"}</p>
                    </div>
                </div>
                <button 
                    onClick={handleWatchAd} 
                    disabled={loadingAd || !!timeRemaining} 
                    className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl active:scale-95 border-2 ${timeRemaining ? "bg-transparent border-slate-800 text-slate-700 cursor-not-allowed" : "bg-white text-black border-white"}`}
                >
                    {loadingAd ? <Loader2 className="animate-spin" size={14}/> : (timeRemaining ? "LOCKED" : "CLAIM")}
                </button>
            </div>

            {/* TON WITHDRAWAL */}
            <div className="bg-gradient-to-br from-blue-600 to-cyan-700 rounded-[2.5rem] p-8 mb-8 relative overflow-hidden shadow-2xl border-2 border-white/10">
                <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
                <div className="relative z-10 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                            <Wallet className="text-white" size={24} />
                        </div>
                    </div>
                    <span className="text-[10px] text-white/60 font-black uppercase tracking-[0.3em] mb-1 block">Liquid Reserve</span>
                    <div className="text-5xl font-black text-white font-mono tracking-tighter mb-8">
                        {tonBalance.toFixed(2)} <span className="text-lg opacity-60">TON</span>
                    </div>

                    <button 
                        onClick={handleWithdraw} 
                        disabled={tonBalance < 10 || withdrawing}
                        className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-2xl
                            ${tonBalance >= 10 ? 'bg-white text-blue-900' : 'bg-black/20 text-white/40 cursor-not-allowed border border-white/10'}
                        `}
                    >
                        {withdrawing ? <Loader2 className="animate-spin" /> : (withdrawSuccess ? "Uplink Success" : (tonBalance >= 10 ? "Withdraw Assets" : "Min 10 TON Reserve"))}
                        {!withdrawing && !withdrawSuccess && tonBalance >= 10 && <ArrowUpRight size={18}/>}
                    </button>
                </div>
            </div>
            
            <footer className="text-center text-[8px] text-slate-700 font-black uppercase tracking-[0.4em] mt-4">
                Extraction Protocol V1.0.4 • Blockchain Verified
            </footer>
        </div>
    );
}