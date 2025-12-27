
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { Navigation } from './components/Navigation';
import { Tab, UserState, SpawnPoint, Coordinate, Campaign, AdStatus, HotspotDefinition, HotspotCategory } from './types';
import { GLOBAL_SPAWNS, GLOBAL_HOTSPOTS, ADMIN_WALLET_ADDRESS } from './constants';
import { generateRandomSpawns } from './utils';
import { Sparkles, ShieldAlert, ExternalLink, UserX, AlertTriangle, Fingerprint, Lock, ShieldCheck, Loader2, SmartphoneNfc, RefreshCw, Settings, ShieldQuestion, Send } from 'lucide-react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

import { 
    syncUserWithFirebase, 
    saveCollectionToFirebase,
    processReferralReward, 
    subscribeToCampaigns, 
    subscribeToHotspots,
    subscribeToUserProfile,
    createCampaignFirebase,
    updateCampaignStatusFirebase,
    deleteCampaignFirebase,
    saveHotspotFirebase,
    deleteHotspotFirebase,
    updateUserWalletInFirebase,
    resetUserInFirebase
} from './services/firebase';

import { MapView } from './views/MapView';
import { HuntView } from './views/HuntView';
import { WalletView } from './views/WalletView';
import { FrensView } from './views/FrensView';
import { AdsView } from './views/AdsView';
import { AdminView } from './views/AdminView';
import { LeaderboardView } from './views/LeaderboardView';
import { AIChat } from './components/AIChat';

const DEFAULT_LOCATION: Coordinate = { lat: 20.0, lng: 0.0 }; 

const defaultUserState: UserState = {
    balance: 0,
    tonBalance: 0,
    gameplayBalance: 0,
    rareBalance: 0,
    eventBalance: 0,
    dailySupplyBalance: 0,
    merchantBalance: 0,
    referralBalance: 0,
    collectedIds: [],
    location: null,
    lastAdWatch: 0,
    lastDailyClaim: 0,
    adsWatched: 0,
    sponsoredAdsWatched: 0,
    rareItemsCollected: 0,
    eventItemsCollected: 0,
    referrals: 0,
    referralNames: [],
    hasClaimedReferral: false,
    photoUrl: ''
};

function App() {
    const userWalletAddress = useTonAddress();
    const [activeTab, setActiveTab] = useState<Tab>(Tab.MAP);
    const [userState, setUserState] = useState<UserState>(defaultUserState);
    const [spawns, setSpawns] = useState<SpawnPoint[]>(GLOBAL_SPAWNS);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [customHotspots, setCustomHotspots] = useState<HotspotDefinition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTelegram, setIsTelegram] = useState(false);
    const [isTestMode, setIsTestMode] = useState(false);
    const [showAIChat, setShowAIChat] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    
    // Security states
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [isNewUser, setIsNewUser] = useState(false);
    const [biometricSupported, setBiometricSupported] = useState<boolean | null>(null);
    const [currentFingerprint, setCurrentFingerprint] = useState<string | null>(null);

    const isAdmin = useMemo(() => {
        return userWalletAddress && userWalletAddress === ADMIN_WALLET_ADDRESS;
    }, [userWalletAddress]);

    const allHotspots = useMemo(() => {
        const activeAdsAsHotspots: HotspotDefinition[] = campaigns
            .filter(c => c.data.status === AdStatus.ACTIVE)
            .map(c => ({
                id: c.id,
                name: c.data.brandName,
                coords: c.targetCoords,
                radius: 400,
                density: c.count,
                category: 'MERCHANT' as HotspotCategory,
                baseValue: 100 * (c.multiplier / 5),
                logoUrl: c.data.logoUrl,
                customText: c.multiplier >= 20 ? 'RARE' : 'AD',
                sponsorData: c.data 
            }));

        return [...GLOBAL_HOTSPOTS, ...customHotspots, ...activeAdsAsHotspots];
    }, [campaigns, customHotspots]);

    const initialSpawnDone = useRef(false);

    useEffect(() => {
        const unsubCampaigns = subscribeToCampaigns(setCampaigns);
        const unsubHotspots = subscribeToHotspots(setCustomHotspots);

        const initUser = async () => {
            const tg = window.Telegram?.WebApp;
            
            if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) {
                setIsTelegram(false);
                setIsLoading(false);
                return;
            }

            tg.ready();
            tg.expand();
            setIsTelegram(true);

            if (tg.BiometricManager) {
                tg.BiometricManager.init(() => {
                    setBiometricSupported(tg.BiometricManager.available);
                });
            }

            const tgUser = tg.initDataUnsafe.user;
            const userId = tgUser.id.toString();

            const userData = { 
                id: parseInt(userId), 
                username: tgUser.username,
                firstName: tgUser.first_name,
                lastName: tgUser.last_name,
                photoUrl: tgUser.photo_url
            };

            try {
                let fingerprint = "unknown_device";
                try {
                    const fpPromise = FingerprintJS.load().then(fp => fp.get());
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));
                    const result = await Promise.race([fpPromise, timeoutPromise]) as any;
                    fingerprint = result.visitorId;
                    setCurrentFingerprint(fingerprint);
                } catch (e) {
                    console.warn("Fingerprint detection timeout");
                }

                // FIX: Sincronizam folosind argumentele acceptate de serviciu
                const synced = await syncUserWithFirebase(userData, defaultUserState, fingerprint);
                setUserState(prev => ({ ...prev, ...synced }));

                if (!synced.deviceFingerprint || synced.joinedAt === synced.lastActive) {
                    setIsNewUser(true);
                }

                if (synced.isBanned) {
                    setIsBlocked(true);
                }

                const startParam = tg.initDataUnsafe.start_param || "";
                if (startParam.startsWith('ref_') && !synced.hasClaimedReferral) {
                    const referrerId = startParam.replace('ref_', '');
                    if (referrerId !== userId) {
                        const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
                        const currentDisplayName = fullName || tgUser.username || `Hunter_${userId}`;
                        await processReferralReward(referrerId, parseInt(userId), currentDisplayName);
                    }
                }

                // FIX: Adaugat defaultUserState ca al doilea argument conform serviciului
                subscribeToUserProfile(parseInt(userId), defaultUserState, (updatedData) => {
                    setUserState(prev => ({ ...prev, ...updatedData }));
                    if (updatedData.isBanned) setIsBlocked(true);
                });

            } catch (err) {
                console.error("Initialization Error:", err);
            } finally {
                setIsLoading(false);
            }
        };

        initUser();
        return () => { unsubCampaigns(); unsubHotspots(); };
    }, []);

    const handleUnlock = async () => {
        if (userState.biometricEnabled === false) {
            setIsUnlocked(true);
            return;
        }

        const tg = window.Telegram?.WebApp;
        const bm = tg?.BiometricManager;

        if (!bm) {
            alert("This device environment does not support biometrics. Access denied.");
            return;
        }

        setIsAuthenticating(true);
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

        const triggerAuth = () => {
            bm.authenticate({ reason: "Biometric entry to Eliezer Hunt" }, (success) => {
                setIsAuthenticating(false);
                if (success) {
                    setIsUnlocked(true);
                    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
                } else {
                    alert("Authentication Failed. Fingerprint mismatch.");
                }
            });
        };

        if (!bm.accessGranted) {
            bm.requestAccess({ reason: "Access secure hunting network" }, (granted) => {
                if (granted) {
                    triggerAuth();
                } else {
                    setIsAuthenticating(false);
                    alert("Biometric access is mandatory to play. Enable it in settings.");
                }
            });
        } else {
            triggerAuth();
        }
    };

    useEffect(() => {
        if (userWalletAddress && userState.telegramId) {
            updateUserWalletInFirebase(userState.telegramId, userWalletAddress);
            setUserState(prev => ({ ...prev, walletAddress: userWalletAddress }));
        }
    }, [userWalletAddress, userState.telegramId]);

    useEffect(() => {
        if (!navigator.geolocation || !isUnlocked) return;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const newCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserState(prev => ({ ...prev, location: newCoords }));
                if (!initialSpawnDone.current) {
                    setSpawns(prev => [...prev, ...generateRandomSpawns(newCoords, 8)]);
                    initialSpawnDone.current = true;
                }
            },
            (err) => {},
            { enableHighAccuracy: true }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [isUnlocked]);

    const handleCollect = useCallback(async (spawnId: string, value: number, category?: HotspotCategory, tonReward: number = 0) => {
        if (isBlocked && !isAdmin) return;
        const isAd = spawnId.startsWith('ad-');
        if (!isAd && userState.collectedIds.includes(spawnId)) return;
        
        if (userState.telegramId) {
            await saveCollectionToFirebase(userState.telegramId, spawnId, value, category, tonReward);
        }

        setSpawns(prev => prev.filter(s => s.id !== spawnId));
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }, [userState.telegramId, userState.collectedIds, isBlocked, isAdmin]);

    const handleInvite = useCallback(async () => {
        const tg = window.Telegram?.WebApp;
        if (!tg) return;
        const userId = tg.initDataUnsafe?.user?.id?.toString();
        if (!userId) return;

        const inviteLink = `https://t.me/Obadiah_Bot/eliezer?startapp=ref_${userId}`;
        const shareText = "Hunt crypto in the real world with Eliezer Hunt! 🚀 Join my extraction squad!";
        const fullUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;
        
        tg.openTelegramLink(fullUrl);
    }, []);

    const handleResetAccount = async () => {
        if (window.confirm("RESET ACCOUNT: Are you sure you want to permanently delete all progress?")) {
            if (userState.telegramId) {
                await resetUserInFirebase(userState.telegramId);
                window.location.reload();
            }
        }
    };

    if (isLoading) {
        return (
            <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white font-mono">
                <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="animate-pulse tracking-tighter uppercase text-xs">ELZR Syncing...</p>
            </div>
        );
    }

    if (!isTelegram) {
        return (
            <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1),transparent)] pointer-events-none"></div>
                
                <div className="relative z-10 max-w-xs flex flex-col items-center">
                    <div className="w-24 h-24 bg-cyan-600/10 rounded-[2.5rem] flex items-center justify-center border-2 border-cyan-600/30 mb-10 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
                        <SmartphoneNfc className="text-cyan-400" size={48} />
                    </div>
                    
                    <h1 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter font-[Rajdhani]">Access Restricted</h1>
                    <p className="text-slate-400 text-xs font-medium leading-relaxed mb-10 uppercase tracking-widest">
                        Eliezer Hunt is a specialized Telegram Mini App protocol. Please launch via the official Telegram bot to synchronize your extraction node.
                    </p>
                    
                    <a 
                        href="https://t.me/Obadiah_Bot/eliezer"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-5 bg-white text-black font-black text-sm uppercase tracking-[0.2em] rounded-[1.5rem] flex items-center justify-center gap-3 shadow-xl hover:bg-slate-200 transition-all active:scale-95"
                    >
                        <Send size={20} />
                        Open in Telegram
                    </a>
                    
                    <p className="mt-8 text-[9px] text-slate-600 font-black uppercase tracking-[0.3em]">
                        Mobile Protocol v5.2 • Secure Connection Only
                    </p>
                </div>
            </div>
        );
    }

    if (isBlocked && !isAdmin) {
        return (
            <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-24 h-24 bg-red-600/10 rounded-[2.5rem] flex items-center justify-center border-2 border-red-600/30 mb-8 animate-pulse shadow-[0_0_50px_rgba(220,38,38,0.2)]">
                    <Fingerprint className="text-red-500" size={48} />
                </div>
                <h1 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter font-[Rajdhani]">Security Alert</h1>
                <div className="bg-red-600/5 border border-red-600/20 rounded-2xl p-6 space-y-4 max-w-xs">
                    <div className="flex items-center gap-3 text-red-400">
                        <AlertTriangle size={18} />
                        <p className="text-[11px] font-black uppercase tracking-widest text-left">Device Mismatch</p>
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed text-left font-medium">
                        This account is locked to a specific device signature. Multi-device access is restricted for security. Contact admin for manual clearance.
                    </p>
                </div>
            </div>
        );
    }

    if (!isUnlocked && (!isBlocked || !isAdmin)) {
        return (
            <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-8 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1),transparent)] pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col items-center max-w-xs w-full">
                    <div className="mb-12 text-center">
                        <h2 className="text-[10px] text-cyan-500 font-black uppercase tracking-[0.4em] mb-2">Secure Gateway</h2>
                        <h1 className="text-4xl font-black text-white uppercase tracking-tighter font-[Rajdhani]">ELIEZER</h1>
                    </div>

                    <div className="relative mb-12">
                        <div className={`w-32 h-32 rounded-[2.5rem] bg-slate-900 border-2 flex items-center justify-center transition-all duration-700 shadow-2xl ${isAuthenticating ? 'border-cyan-500 shadow-cyan-500/20' : 'border-slate-800 shadow-black'}`}>
                            <Fingerprint size={56} className={isAuthenticating ? "text-cyan-400 animate-pulse" : "text-slate-600"} />
                        </div>
                        {isAuthenticating && (
                            <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500/50 animate-scan"></div>
                        )}
                        {biometricSupported === false && !isAuthenticating && (
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 whitespace-nowrap bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
                                <ShieldQuestion size={10} className="text-amber-500" />
                                <span className="text-[8px] font-black text-amber-500 uppercase">Detection Uncertainty</span>
                            </div>
                        )}
                    </div>

                    <div className="text-center mb-10 space-y-2">
                        <p className="text-sm font-bold text-white uppercase tracking-widest">
                            {isNewUser ? "Device Registration" : "Authentication Required"}
                        </p>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-relaxed">
                            {isNewUser 
                                ? "Register your native biometric identity to secure this extraction node." 
                                : "Scanning device signature for biometric match..."}
                        </p>
                    </div>

                    <button 
                        onClick={handleUnlock}
                        disabled={isAuthenticating}
                        className={`w-full py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl ${isAuthenticating ? 'bg-slate-800 text-slate-500' : 'bg-white text-black hover:bg-slate-200 shadow-white/10'}`}
                    >
                        {isAuthenticating ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                SCANNING...
                            </>
                        ) : (
                            <>
                                <Lock size={20} />
                                UNLOCK ENTRY
                            </>
                        )}
                    </button>
                    
                    <p className="mt-8 text-[8px] text-slate-700 font-black uppercase tracking-widest">
                        Telegram Native Protocol v5.2 • Global Biometric Enabled
                    </p>
                </div>

                <style>{`
                    @keyframes scan {
                        0% { transform: translateY(0); opacity: 0; }
                        50% { opacity: 1; }
                        100% { transform: translateY(128px); opacity: 0; }
                    }
                    .animate-scan {
                        animation: scan 1.5s ease-in-out infinite;
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-slate-950 text-white flex flex-col relative overflow-hidden">
            <div className="flex-1 relative overflow-hidden">
                {activeTab === Tab.MAP && <MapView location={userState.location || DEFAULT_LOCATION} spawns={spawns} collectedIds={userState.collectedIds} hotspots={allHotspots} />}
                {activeTab === Tab.HUNT && <HuntView location={userState.location || DEFAULT_LOCATION} spawns={spawns} collectedIds={userState.collectedIds} onCollect={handleCollect} hotspots={allHotspots} />}
                {activeTab === Tab.LEADERBOARD && <LeaderboardView />}
                {activeTab === Tab.WALLET && (
                    <WalletView 
                        userState={userState}
                        onAdReward={(amt) => handleCollect('ad-' + Date.now(), amt, 'AD_REWARD')} 
                        onInvite={handleInvite} 
                    />
                )}
                {activeTab === Tab.FRENS && <FrensView referralCount={userState.referrals} referralNames={userState.referralNames} onInvite={handleInvite} />}
                {activeTab === Tab.ADS && (
                    <AdsView 
                        userLocation={userState.location} 
                        collectedIds={userState.collectedIds}
                        myCampaigns={campaigns.filter(c => c.ownerWallet === userWalletAddress)} 
                        onSubmitApplication={async (coords, count, mult, price, data) => {
                            const camp: Campaign = { 
                                id: `camp-${Date.now()}`, 
                                ownerWallet: userWalletAddress || 'anon', 
                                targetCoords: coords, 
                                count, 
                                multiplier: mult, 
                                durationDays: data.durationDays, 
                                totalPrice: price, 
                                data: { ...data, status: AdStatus.PENDING_REVIEW }, 
                                timestamp: Date.now() 
                            };
                            await createCampaignFirebase(camp);
                        }} 
                        onPayCampaign={(id) => updateCampaignStatusFirebase(id, AdStatus.ACTIVE)} 
                        isTestMode={isTestMode} 
                    />
                )}
                {activeTab === Tab.ADMIN && (
                    <AdminView 
                        allCampaigns={campaigns} 
                        customHotspots={customHotspots} 
                        onSaveHotspots={async (newHotspots) => {
                            for (const h of newHotspots) await saveHotspotFirebase(h);
                        }} 
                        onDeleteHotspot={async (id) => {
                            await deleteHotspotFirebase(id);
                        }}
                        onDeleteCampaign={async (id) => {
                            await deleteCampaignFirebase(id);
                        }}
                        onApprove={(id) => updateCampaignStatusFirebase(id, AdStatus.ACTIVE)} 
                        onReject={(id) => updateCampaignStatusFirebase(id, AdStatus.REJECTED)} 
                        onResetMyAccount={handleResetAccount} 
                        isTestMode={isTestMode} 
                        onToggleTestMode={() => setIsTestMode(!isTestMode)} 
                    />
                )}
            </div>

            {(activeTab === Tab.MAP || activeTab === Tab.HUNT) && (
                <button 
                    onClick={() => setShowAIChat(true)}
                    className="fixed right-6 bottom-24 z-[999] w-12 h-12 bg-cyan-600 rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.6)] border border-cyan-400 animate-bounce transition-transform active:scale-90"
                >
                    <Sparkles className="text-white" size={20} />
                </button>
            )}

            {showAIChat && <AIChat onClose={() => setShowAIChat(false)} />}

            <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 mb-2 pointer-events-none">
                <div className="pointer-events-auto">
                    <Navigation currentTab={activeTab} onTabChange={setActiveTab} userWalletAddress={userWalletAddress} />
                </div>
            </div>
        </div>
    );
}

export default App;
