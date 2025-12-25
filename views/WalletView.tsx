
import React, { useState, useEffect } from 'react';
import { TonConnectButton } from '@tonconnect/ui-react';
import { Gift, Loader2, ShieldCheck, Coins, TrendingUp, Megaphone, Star, Sparkles, Clock, Users, Wallet, ArrowUpRight, MapPin, Target, ShoppingBag, Crown } from 'lucide-react';
import { showRewardedAd } from '../services/adsgram';
import { processWithdrawTON, requestAdRewardFirebase } from '../services/firebase';
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

    const rawMultiplier = 1 + (Math.log10(referrals + 1) / 4);
    const refMultiplier = Math.min(2.5, rawMultiplier);
    const estimatedAllocation = (balance * refMultiplier) / 1000000000000;

    useEffect(() => {
        const checkCooldown = () => {
            const now = Date.now();
            const cooldownMs = 24 * 60 * 60 * 1000; 
            const timeSinceLast = now - (lastDailyClaim || 0);
            if (timeSinceLast < cooldownMs) {
                const diff = cooldownMs - timeSinceLast;
                const h = Math.floor(diff / (1000 * 60 * 60));
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeRemaining(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            } else { setTimeRemaining(null); }
        };
        checkCooldown();
        const interval = setInterval(checkCooldown, 1000);
        return () => clearInterval(interval);
    }, [lastDailyClaim]);

    const handleWatchAd = async () => {
        if (timeRemaining || !userState.telegramId) return;
        setLoadingAd(true);
        const success = await showRewardedAd(ADSGRAM_BLOCK_ID);
        if (success) {
            // SECURITY 6.0: Nu mai credităm în client. Trimitem request de claim la server.
            await requestAdRewardFirebase(userState.telegramId, REWARD_AD_VALUE);
        }
        setLoadingAd(false);
    };

    const handleWithdraw = async () => {
        if (tonBalance < 10) return;
        setWithdrawing(true);
        const success = await processWithdrawTON(userState.telegramId!, tonBalance);
        setWithdrawing(false);
        if (success) { setWithdrawSuccess(true); setTimeout(() => setWithdrawSuccess(false), 5000); }
    };

    return (
        <div className="h-full w-full p-6 overflow-y-auto pb-40 no-scrollbar bg-slate-950">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white font-[Rajdhani] tracking-wide uppercase">Wallet</h1>
                <div className="scale-90 origin-right"><TonConnectButton /></div>
            </div>

            <div className="glass-panel p-8 rounded-3xl mb-8 relative overflow-hidden border border-white/10 shadow-2xl">
                <div className="absolute -right-4 -top-4 bg-amber-500/10 w-48 h-48 rounded-full blur-3xl"></div>
                <div className="flex flex-col items-center text-center relative z-10">
                    <div className="p-4 bg-amber-500/10 rounded-full border border-amber-500/20 mb-4"><Coins className="text-amber-400" size={32} /></div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-[0.3em] font-black mb-2">Total Points</span>
                    <span className="text-6xl font-black text-white font-[Rajdhani]">{balance.toLocaleString()}</span>
                </div>
            </div>

            <div className="glass-panel p-5 rounded-3xl flex items-center justify-between mb-8 border border-white/5">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${timeRemaining ? 'bg-slate-800 text-slate-500' : 'bg-green-900/40 text-green-400 animate-pulse'}`}><Gift size={24} /></div>
                    <div>
                        <h3 className="font-bold text-white text-sm">Daily Reward</h3>
                        <p className="text-[10px] text-slate-400">+500 Pts {timeRemaining && <span className="text-amber-500 font-bold ml-1">• {timeRemaining}</span>}</p>
                    </div>
                </div>
                <button onClick={handleWatchAd} disabled={loadingAd || !!timeRemaining} className={`px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg active:scale-95 ${timeRemaining ? "bg-slate-800 text-slate-600 cursor-not-allowed" : "bg-white text-black"}`}>
                    {loadingAd ? <Loader2 className="animate-spin" size={14}/> : (timeRemaining ? "CLAIMED" : "CLAIM")}
                </button>
            </div>

            <div className="glass-panel p-8 rounded-3xl mb-8 relative overflow-hidden border border-blue-500/20 shadow-xl">
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-6">
                        <Wallet className="text-blue-400" size={18} />
                        <span className="text-[10px] text-blue-200 font-black uppercase tracking-widest">TON Reserve</span>
                    </div>
                    <div className="mb-8 text-center">
                        <div className="text-5xl font-black text-white font-mono tracking-tighter">{tonBalance.toFixed(2)} <span className="text-lg text-blue-400">TON</span></div>
                    </div>
                    <button onClick={handleWithdraw} disabled={tonBalance < 10 || withdrawing} className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 ${tonBalance >= 10 ? 'bg-white text-blue-900' : 'bg-slate-800 text-slate-500'}`}>
                        {withdrawing ? <Loader2 className="animate-spin" size={16}/> : (withdrawSuccess ? "Success!" : (tonBalance >= 10 ? "Withdraw Assets" : "Min 10 TON"))}
                    </button>
                </div>
            </div>
        </div>
    );
}
