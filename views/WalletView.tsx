
import React, { useState, useEffect } from 'react';
import { TonConnectButton } from '@tonconnect/ui-react';
import { Gift, Loader2, ShieldCheck, Coins, TrendingUp, Megaphone, Star, Sparkles, Clock, Users, Wallet, ArrowUpRight, MapPin, Target, ShoppingBag, Crown } from 'lucide-react';
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

    // Calcul Multiplicator
    const MAX_MULTIPLIER = 2.5; 
    const rawMultiplier = 1 + (Math.log10(referrals + 1) / 4);
    const refMultiplier = Math.min(MAX_MULTIPLIER, rawMultiplier);

    const totalWeightedScore = Math.floor(balance * refMultiplier);
    const estimatedAllocation = totalWeightedScore / 1000000000000;

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
        <div className="h-full w-full p-6 overflow-y-auto pb-40 no-scrollbar bg-slate-950">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2 font-[Rajdhani] tracking-wide">
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-200 to-amber-500 uppercase">Wallet</span>
                </h1>
                <div className="scale-90 origin-right"><TonConnectButton /></div>
            </div>

            {/* ASSET CARD */}
            <div className="glass-panel p-8 rounded-3xl mb-8 relative overflow-hidden border border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
                <div className="absolute -right-4 -top-4 bg-amber-500/10 w-48 h-48 rounded-full blur-3xl"></div>
                <div className="flex flex-col items-center text-center relative z-10">
                    <div className="p-4 bg-amber-500/10 rounded-full border border-amber-500/20 mb-4"><Coins className="text-amber-400" size={32} /></div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-[0.3em] font-black mb-2">Total ELZR Points</span>
                    <span className="text-6xl font-black text-white tracking-tighter font-[Rajdhani]">{balance.toLocaleString()}</span>
                </div>
            </div>

            {/* AIRDROP ESTIMATION */}
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <ShieldCheck className="text-green-400" size={18} />
                    <h2 className="text-lg font-bold text-white font-[Rajdhani] tracking-wide">Airdrop Estimation</h2>
                </div>
                <div className="glass-panel border border-white/5 rounded-3xl p-6 shadow-xl space-y-4">
                    <div className="text-center mb-6 border-b border-white/5 pb-6">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block font-bold">EST. $ELZR ALLOCATION</span>
                        <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-green-400 to-emerald-500 font-mono tracking-tighter">
                            ~{estimatedAllocation.toFixed(8)}
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Target size={14} className="text-slate-400" />
                                <span className="text-[11px] text-slate-400 font-medium">Gameplay (Urban/Mall)</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-white">{gameplayBalance.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Crown size={14} className="text-purple-400" />
                                <span className="text-[11px] text-purple-400 font-medium">Rare Coins (Landmarks)</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-purple-400">{rareBalance.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Sparkles size={14} className="text-blue-400" />
                                <span className="text-[11px] text-blue-400 font-medium">Event Coins</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-blue-400">{eventBalance.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Clock size={14} className="text-slate-400" />
                                <span className="text-[11px] text-slate-400 font-medium">Daily Supply (Rewards)</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-white">{dailySupplyBalance.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Megaphone size={14} className="text-red-500" />
                                <span className="text-[11px] text-red-500 font-medium">Merchant Drops</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-red-500">{merchantBalance.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Users size={14} className="text-cyan-400" />
                                <span className="text-[11px] text-cyan-400 font-medium">Referral Bonus (Frens)</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-cyan-400">{referralBalance.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* DAILY REWARD CARD */}
            <div className="glass-panel p-5 rounded-3xl flex items-center justify-between mb-8 border border-white/5">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${timeRemaining ? 'bg-slate-800 text-slate-500' : 'bg-green-900/40 text-green-400 animate-pulse'}`}><Gift size={24} /></div>
                    <div>
                        <h3 className="font-bold text-white text-sm">Daily Reward</h3>
                        <p className="text-[10px] text-slate-400">+500 Pts (Daily Supply) {timeRemaining && <span className="text-amber-500 font-bold ml-1">• {timeRemaining}</span>}</p>
                    </div>
                </div>
                <button onClick={handleWatchAd} disabled={loadingAd || !!timeRemaining} className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg active:scale-95 ${timeRemaining ? "bg-slate-800 text-slate-600 cursor-not-allowed" : "bg-white text-black hover:bg-slate-200"}`}>
                    {loadingAd ? <Loader2 className="animate-spin" size={14}/> : (timeRemaining ? "CLAIMED" : "CLAIM")}
                </button>
            </div>

            {/* TON REWARDS SECTION (REDESIGNED) */}
            <div className="glass-panel p-8 rounded-3xl mb-8 relative overflow-hidden border border-blue-500/20 shadow-[0_0_30px_rgba(37,99,235,0.1)]">
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl"></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-6">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Wallet className="text-blue-400" size={18} />
                        </div>
                        <span className="text-[10px] text-blue-200 font-black uppercase tracking-widest">TON Asset Reserve</span>
                    </div>
                    
                    <div className="mb-8 text-center">
                        <div className="text-5xl font-black text-white font-mono tracking-tighter">
                            {tonBalance.toFixed(2)} <span className="text-lg text-blue-400">TON</span>
                        </div>
                        <p className="text-[9px] text-slate-500 uppercase mt-2 font-bold tracking-widest">Verified Multi-Chain Balance</p>
                    </div>

                    <button 
                        onClick={handleWithdraw} 
                        disabled={tonBalance < 10 || withdrawing}
                        className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl
                            ${tonBalance >= 10 ? 'bg-white text-blue-900 shadow-blue-400/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}
                        `}
                    >
                        {withdrawing ? <Loader2 className="animate-spin" size={16}/> : (withdrawSuccess ? "Success! Check Wallet" : (tonBalance >= 10 ? "Withdraw Assets" : "Min 10 TON"))}
                        {!withdrawing && !withdrawSuccess && tonBalance >= 10 && <ArrowUpRight size={16}/>}
                    </button>
                </div>
            </div>
            
            <p className="text-center text-[9px] text-slate-600 mt-2 font-mono uppercase tracking-[0.3em] font-bold">100 PTS = 0.000000001 $ELZR</p>
        </div>
    );
}
