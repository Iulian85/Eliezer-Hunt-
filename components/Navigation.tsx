
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
        { id: Tab.MAP, icon: Map, label: 'Map' },
        { id: Tab.HUNT, icon: Crosshair, label: 'Hunt' },
        { id: Tab.LEADERBOARD, icon: Trophy, label: 'Top' },
        { id: Tab.ADS, icon: Megaphone, label: 'Ads' },
        { id: Tab.FRENS, icon: Users, label: 'Frens' },
        { id: Tab.WALLET, icon: Wallet, label: 'Wallet' },
        { id: Tab.ADMIN, icon: ShieldCheck, label: 'Admin' }, 
    ];

    const visibleItems = navItems.filter(item => {
        if (item.id === Tab.ADMIN) {
            return userWalletAddress && userWalletAddress === ADMIN_WALLET_ADDRESS;
        }
        return true;
    });

    const handleTabClick = (id: Tab) => {
        if (id !== currentTab) {
            // Vibrație scurtă la schimbarea tab-ului (Native feel)
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
            }
            onTabChange(id);
        }
    };

    return (
        <div className="glass-panel rounded-2xl px-2 py-2 flex justify-between items-center w-full max-w-md mx-auto shadow-[0_0_30px_rgba(0,0,0,0.8)] border-slate-700">
            {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                    <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className="flex-1 flex flex-col items-center gap-1 group relative py-1"
                    >
                        {isActive && (
                            <div className="absolute top-0 w-8 h-8 bg-cyan-500/20 rounded-full blur-md" />
                        )}
                        <div className={clsx(
                            "p-1.5 rounded-xl transition-all duration-300 transform",
                            isActive 
                                ? "text-cyan-400 bg-cyan-900/60 border border-cyan-500/40 shadow-inner" 
                                : "text-slate-400"
                        )}>
                            <Icon size={16} strokeWidth={isActive ? 2.5 : 1.5} />
                        </div>
                        <span className={clsx(
                            "text-[8px] font-bold tracking-tight",
                            isActive ? "text-cyan-400 opacity-100" : "text-slate-500"
                        )}>
                            {item.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
