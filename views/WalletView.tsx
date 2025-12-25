
import React, { useState, useEffect } from 'react';
import { TonConnectButton } from '@tonconnect/ui-react';
import { Gift, Loader2, Coins, Wallet, Zap, Star, Trophy, Package, Megaphone, Users, Info, ChevronRight, TrendingUp } from 'lucide-react';
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
    userState,
    onInvite
}) => {
    const [loadingAd, setLoadingAd] = useState(false);
    const [withdrawing, setWithdrawing] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
    const [withdrawSuccess, setWithdrawSuccess] = useState(false);

    const { 
        balance, 
        tonBalance = 0,
        lastDailyClaim = 0,
        gameplayBalance = 0,
        rareBalance = 0,
        eventBalance = 0,
        dailySupplyBalance = 0,
        merchantBalance = 0,
        referralBalance = 0
    } = userState;

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

    const estimationItems = [
        { label: 'Gameplay Extraction', val: gameplayBalance, icon: Zap, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
        { label: 'Rare Items Found', val: rareBalance, icon: Star, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        { label: 'Event Rewards', val: eventBalance, icon: Trophy, color: 'text-green-400', bg: 'bg-green-500/10' },
        { label: 'Daily Supplies', val: dailySupplyBalance, icon: Package, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        { label: 'Merchant Tasks', val: merchantBalance, icon: Megaphone, color: 'text-red-400', bg: 'bg-red-500/10' },
        { label: 'Network Referral', val: referralBalance, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    ];

    return (
        <div className="h-full w-full p-6 overflow-y-auto pb-40 no-scrollbar bg-slate-950">
            <div className="flex justify-between items-center mb-8 mt-2">
                <h1 className="text-3xl font-black text-white font-[Rajdhani] tracking-tighter uppercase leading-none">Terminal <span className="text-cyan-500">Wallet</span></h1>
                <div className="scale-90 origin-right"><TonConnectButton /></div>
            </div>

            {/* TOTAL POINTS CARD */}
            <div className="bg-slate-900/80 border-2 border-slate-800 rounded-[2.5rem] p-8 mb-8 relative overflow-hidden shadow-2xl">
                <div className="absolute -right-6 -top-6 bg-cyan-500/10 w-48 h-48 rounded-full blur-3xl"></div>
                <div className="flex flex-col items-center text-center relative z-10">
                    <div className="p-4 bg-cyan-500/10 rounded-full border border-cyan-500/20 mb-4 shadow-[0_0_20px_rgba(6,182,212,0.2)]"><Coins className="text-cyan-400" size={32} /></div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-[0.4em] font-black mb-1">Current Extraction Yield</span>
                    <span className="text-6xl font-black text-white font-[Rajdhani] tracking-tighter">{balance.toLocaleString()}</span>
                    <div className="mt-4 flex items-center gap-2 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
                        <TrendingUp size={12} className="text-green-400" />
                        <span className="text-[10px] text-green-400 font-black uppercase tracking-widest">Active Node Sync</span>
                    </div>
                </div>
            </div>

            {/* AIRDROP ESTIMATION SECTION (Restaurată) */}
            <div className="mb-10">
                <div className="flex items-center justify-between mb-6 px-2">
                    <h2 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                        <Info size={16} className="text-cyan-400" /> Airdrop Estimation
                    </h2>
                    <div className="h-px flex-1 bg-slate-800 ml-4"></div>
                </div>

                <div className="space-y-3">
                    {estimationItems.map((item, idx) => (
                        <div key={idx} className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4 flex items-center justify-between group transition-all hover:bg-slate-800/40">
                            <div className="flex items-center gap-4">
                                <div className={`p-2.5 rounded-xl ${item.bg} ${item.color}`}>
                                    <item.icon size={18} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-tight group-hover:text-white transition-colors">{item.label}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-black text-white font-mono">{item.val.toLocaleString()}</span>
                                <span className="text-[7px] text-slate-600 font-black uppercase tracking-tighter">Verified</span>
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="mt-4 p-4 bg-cyan-900/20 border border-cyan-500/20 rounded-2xl flex items-center justify-between shadow-lg">
                    <span className="text-[10px] text-cyan-200 font-black uppercase tracking-widest">Global Protocol Multiplier</span>
                    <span className="text-lg font-black text-cyan-400 font-mono">x1.00</span>
                </div>
            </div>

            {/* DAILY REWARD BLOCK */}
            <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-[2rem] flex items-center justify-between mb-8 shadow-xl">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${timeRemaining ? 'bg-slate-800 text-slate-600' : 'bg-green-600/20 text-green-400 animate-pulse'}`}>
                        <Gift size={24} />
                    </div>
                    <div>
                        <h3 className="font-black text-white text-xs uppercase tracking-widest leading-none mb-1">Daily Supply</h3>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                            {timeRemaining ? `Next in: ${timeRemaining}` : '+500 ELZR Ready'}
                        </p>
                    </div>
                </div>
                <button 
                    onClick={handleWatchAd} 
                    disabled={loadingAd || !!timeRemaining} 
                    className={`px-6 py-3 rounded-xl font-black text-[10px] shadow-lg active:scale-95 transition-all uppercase tracking-[0.2em] border
                        ${timeRemaining ? "bg-slate-800 text-slate-700 border-slate-700" : "bg-white text-black border-white hover:bg-slate-200"}
                    `}
                >
                    {loadingAd ? <Loader2 className="animate-spin" size={14}/> : (timeRemaining ? "Claimed" : "Claim")}
                </button>
            </div>

            {/* TON WITHDRAWAL CARD */}
            <div className="bg-slate-900/60 p-8 rounded-[2.5rem] mb-12 relative overflow-hidden border-2 border-blue-500/20 shadow-2xl">
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-6">
                        <Wallet className="text-blue-400" size={18} />
                        <span className="text-[10px] text-blue-200 font-black uppercase tracking-widest">TON Assets (Network A)</span>
                    </div>
                    <div className="mb-8 text-center">
                        <div className="text-5xl font-black text-white font-mono tracking-tighter flex items-baseline justify-center gap-2">
                            {tonBalance.toFixed(2)} <span className="text-lg text-blue-500 font-black">TON</span>
                        </div>
                    </div>
                    <button 
                        onClick={handleWithdraw} 
                        disabled={tonBalance < 10 || withdrawing} 
                        className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl border
                            ${tonBalance >= 10 ? 'bg-white text-blue-900 border-white hover:bg-slate-200' : 'bg-slate-800/50 text-slate-600 border-slate-800'}
                        `}
                    >
                        {withdrawing ? <Loader2 className="animate-spin" size={18}/> : (withdrawSuccess ? "Protocol Complete" : (tonBalance >= 10 ? "Initiate Withdrawal" : "Min 10 TON Required"))}
                    </button>
                    <p className="text-center text-[8px] text-slate-600 mt-4 font-bold uppercase tracking-widest">Safe-Withdrawal Protocol v2.1</p>
                </div>
            </div>
        </div>
    );
}
