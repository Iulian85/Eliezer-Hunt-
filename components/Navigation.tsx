
import React from 'react';
import { Tab } from '../types';
import { Map, Crosshair, Wallet, Trophy, Megaphone, ShieldCheck, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { ADMIN_WALLET_ADDRESS } from '../constants';

interface NavigationProps {
    currentTab: Tab;
    onTabChange: (tab: Tab) => void;
    userWalletAddress?: string;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onTabChange, userWalletAddress }) => {
    const navItems = [
        { id: Tab.MAP, icon: Map, label: 'MAP' },
        { id: Tab.HUNT, icon: Crosshair, label: 'EXTRACT' },
        { id: Tab.LEADERBOARD, icon: Trophy, label: 'ELITE' },
        { id: Tab.ADS, icon: Megaphone, label: 'INTEL' },
        { id: Tab.FRENS, icon: Users, label: 'SQUAD' },
        { id: Tab.WALLET, icon: Wallet, label: 'ASSETS' },
        { id: Tab.ADMIN, icon: ShieldCheck, label: 'ROOT' }, 
    ];

    const visibleItems = navItems.filter(item => {
        if (item.id === Tab.ADMIN) return userWalletAddress === ADMIN_WALLET_ADDRESS;
        return true;
    });

    const handleTabClick = (id: Tab) => {
        if (id !== currentTab) {
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
            }
            onTabChange(id);
        }
    };

    return (
        <div className="bg-slate-900/80 backdrop-blur-3xl rounded-[2rem] px-2 py-3 flex justify-between items-center w-full border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                    <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className="flex-1 flex flex-col items-center gap-1.5 group relative py-1"
                    >
                        <div className={clsx(
                            "p-2.5 rounded-2xl transition-all duration-300 transform",
                            isActive 
                                ? "text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.2)] scale-110" 
                                : "text-slate-500 hover:text-slate-300"
                        )}>
                            <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                        </div>
                        <span className={clsx(
                            "text-[7px] font-black tracking-[0.15em] transition-opacity uppercase",
                            isActive ? "text-cyan-400 opacity-100" : "text-slate-600 opacity-70"
                        )}>
                            {item.label}
                        </span>
                        {isActive && (
                            <div className="absolute -bottom-1 w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(6,182,212,1)]" />
                        )}
                    </button>
                );
            })}
        </div>
    );
};
