
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { Navigation } from './components/Navigation';
import { Tab, UserState, SpawnPoint, Coordinate, Campaign, AdStatus, HotspotDefinition, HotspotCategory } from './types';
import { GLOBAL_SPAWNS, GLOBAL_HOTSPOTS, ADMIN_WALLET_ADDRESS } from './constants';
import { generateRandomSpawns } from './utils';
import { Sparkles, ShieldAlert, UserX, AlertTriangle, Fingerprint, Lock, Loader2, SmartphoneNfc, Send, Shield, ShieldQuestion } from 'lucide-react';
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

    const initialSpawnDone = useRef(false);

    useEffect(() => {
        if (!navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const newCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserState(prev => ({ ...prev, location: newCoords }));
                if (!initialSpawnDone.current) {
                    setSpawns(prev => [...prev, ...generateRandomSpawns(newCoords, 8)]);
                    initialSpawnDone.current = true;
                }
            },
            () => {},
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    useEffect(() => {
        const unsubCampaigns = subscribeToCampaigns(setCampaigns);
        const unsubHotspots = subscribeToHotspots(setCustomHotspots);

        const initUser = async () => {
            const tg = window.Telegram?.WebApp;
            if (!tg || !tg.initDataUnsafe?.user) {
                setIsTelegram(false);
                setIsLoading(false);
                return;
            }

            tg.ready();
            tg.expand();
            if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
            setIsTelegram(true);

            if (tg.BiometricManager) {
                tg.BiometricManager.init(() => {
                    setBiometricSupported(tg.BiometricManager.available);
                });
            }

            const tgUser = tg.initDataUnsafe.user;
            const initDataRaw = window.Telegram.WebApp.initData;

            try {
                let fingerprint = "unknown_device";
                const fp = await FingerprintJS.load();
                const result = await fp.get();
                fingerprint = result.visitorId;
                setCurrentFingerprint(fingerprint);

                const currentLoc = await new Promise<Coordinate | undefined>((resolve) => {
                    navigator.geolocation.getCurrentPosition(
                        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
                        () => resolve(undefined),
                        { timeout: 5000 }
                    );
                });

                const synced = await syncUserWithFirebase({ 
                    id: tgUser.id, 
                    username: tgUser.username,
                    firstName: tgUser.first_name,
                    lastName: tgUser.last_name,
                    photoUrl: tgUser.photo_url
                }, defaultUserState, fingerprint, initDataRaw, currentLoc);

                setUserState(prev => ({ ...prev, ...synced }));
                if (synced.isBanned) setIsBlocked(true);

                const startParam = tg.initDataUnsafe.start_param || "";
                if (startParam.startsWith('ref_') && !synced.hasClaimedReferral) {
                    const referrerId = startParam.replace('ref_', '');
                    if (referrerId !== tgUser.id.toString()) {
                        const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
                        const currentDisplayName = fullName || tgUser.username || `Hunter_${tgUser.id}`;
                        await processReferralReward(referrerId, tgUser.id, currentDisplayName);
                    }
                }

                subscribeToUserProfile(tgUser.id, (updated) => {
                    setUserState(prev => ({ ...prev, ...updated }));
                    if (updated.isBanned) setIsBlocked(true);
                });

            } catch (err) {
                console.error("Init error", err);
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
            alert("Acest terminal nu suportă protocolul biometric native.");
            return;
        }

        setIsAuthenticating(true);
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

        const triggerAuth = () => {
            bm.authenticate({ reason: "Sincronizare terminal ELZR" }, (success) => {
                setIsAuthenticating(false);
                if (success) {
                    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
                    setIsUnlocked(true);
                } else {
                    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
                    alert("Eroare Biometrică. Autentificare eșuată.");
                }
            });
        };

        if (!bm.accessGranted) {
            bm.requestAccess({ reason: "Acces securizat la rețeaua de extracție" }, (granted) => {
                if (granted) triggerAuth();
                else setIsAuthenticating(false);
            });
        } else {
            triggerAuth();
        }
    };

    const handleCollect = useCallback(async (spawnId: string, value: number, category?: HotspotCategory, tonReward: number = 0, challenge?: any) => {
        if (!isUnlocked && !isAdmin) return;
        if (userState.telegramId) {
            await saveCollectionToFirebase(
                userState.telegramId, spawnId, value, category, tonReward,
                userState.location || undefined, challenge
            );
        }
        setSpawns(prev => prev.filter(s => s.id !== spawnId));
    }, [userState.telegramId, userState.location, isUnlocked, isAdmin]);

    const allHotspots = useMemo(() => {
        const activeAds: HotspotDefinition[] = campaigns
            .filter(c => c.data.status === AdStatus.ACTIVE)
            .map(c => ({
                id: c.id, name: c.data.brandName, coords: c.targetCoords, radius: 400, density: c.count,
                category: 'MERCHANT' as HotspotCategory, baseValue: 100 * (c.multiplier / 5),
                logoUrl: c.data.logoUrl, customText: 'AD', sponsorData: c.data 
            }));
        return [...GLOBAL_HOTSPOTS, ...customHotspots, ...activeAds];
    }, [campaigns, customHotspots]);

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
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1),transparent)]"></div>
                <div className="relative z-10 max-w-xs flex flex-col items-center">
                    <div className="w-24 h-24 bg-cyan-600/10 rounded-[2.5rem] flex items-center justify-center border-2 border-cyan-600/30 mb-10 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
                        <SmartphoneNfc className="text-cyan-400" size={48} />
                    </div>
                    <h1 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter font-[Rajdhani]">Acces Restricționat</h1>
                    <p className="text-slate-400 text-xs font-medium leading-relaxed mb-10 uppercase tracking-widest">Protocolul Eliezer Hunt necesită sincronizare via Telegram Bot.</p>
                    <a href="https://t.me/Obadiah_Bot/eliezer" className="w-full py-5 bg-white text-black font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3">
                        <Send size={20} /> Open in Telegram
                    </a>
                </div>
            </div>
        );
    }

    if (isBlocked && !isAdmin) {
        return (
            <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-24 h-24 bg-red-600/10 rounded-[2.5rem] flex items-center justify-center border-2 border-red-600/30 mb-8 shadow-[0_0_50px_rgba(220,38,38,0.2)]">
                    <Fingerprint className="text-red-500" size={48} />
                </div>
                <h1 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter font-[Rajdhani]">Alertă Securitate</h1>
                <p className="text-slate-400 text-xs leading-relaxed max-w-xs uppercase font-bold">Cont blocat pentru activități suspecte. Contactați departamentul admin.</p>
            </div>
        );
    }

    if (!isUnlocked && (!isBlocked || !isAdmin)) {
        return (
            <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-8 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1),transparent)]"></div>
                <div className="relative z-10 flex flex-col items-center max-w-xs w-full">
                    <div className="mb-12 text-center">
                        <h2 className="text-[10px] text-cyan-500 font-black uppercase tracking-[0.4em] mb-2">Secure Gateway</h2>
                        <h1 className="text-4xl font-black text-white uppercase tracking-tighter font-[Rajdhani]">ELIEZER</h1>
                    </div>
                    <div className="relative mb-12">
                        <div className={`w-32 h-32 rounded-[2.5rem] bg-slate-900 border-2 flex items-center justify-center transition-all duration-700 shadow-2xl ${isAuthenticating ? 'border-cyan-500 shadow-cyan-500/20' : 'border-slate-800'}`}>
                            <Fingerprint size={56} className={isAuthenticating ? "text-cyan-400 animate-pulse" : "text-slate-600"} />
                        </div>
                        {isAuthenticating && <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500/50 animate-scan"></div>}
                    </div>
                    <button onClick={handleUnlock} disabled={isAuthenticating} className="w-full py-5 rounded-[1.5rem] bg-white text-black font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 active:scale-95 transition-all">
                        {isAuthenticating ? <Loader2 className="animate-spin" /> : <Lock />} DEBLOCARE INTERFAȚĂ
                    </button>
                    <p className="mt-8 text-[8px] text-slate-700 font-black uppercase tracking-widest">Protocol v7.0 • Native Biometric Gateway</p>
                </div>
                <style>{`@keyframes scan { 0% { transform: translateY(0); opacity: 0; } 50% { opacity: 1; } 100% { transform: translateY(128px); opacity: 0; } } .animate-scan { animation: scan 1.5s ease-in-out infinite; }`}</style>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-slate-950 text-white flex flex-col relative overflow-hidden">
            <div className="flex-1 relative">
                {activeTab === Tab.MAP && <MapView location={userState.location || DEFAULT_LOCATION} spawns={spawns} collectedIds={userState.collectedIds} hotspots={allHotspots} />}
                {activeTab === Tab.HUNT && <HuntView location={userState.location || DEFAULT_LOCATION} spawns={spawns} collectedIds={userState.collectedIds} onCollect={handleCollect} hotspots={allHotspots} />}
                {activeTab === Tab.WALLET && <WalletView userState={userState} onAdReward={() => {}} onInvite={() => {}} />}
                {activeTab === Tab.LEADERBOARD && <LeaderboardView />}
                {activeTab === Tab.FRENS && <FrensView referralCount={userState.referrals} referralNames={userState.referralNames} onInvite={() => {}} />}
                {activeTab === Tab.ADS && <AdsView userLocation={userState.location} collectedIds={userState.collectedIds} myCampaigns={campaigns.filter(c => c.ownerWallet === userWalletAddress)} onSubmitApplication={async (coords, count, mult, price, data) => {
                    await createCampaignFirebase({ id: `camp-${Date.now()}`, ownerWallet: userWalletAddress || 'anon', targetCoords: coords, count, multiplier: mult, durationDays: data.durationDays, totalPrice: price, data: { ...data, status: AdStatus.PENDING_REVIEW }, timestamp: Date.now() });
                }} onPayCampaign={(id) => updateCampaignStatusFirebase(id, AdStatus.ACTIVE)} isTestMode={isTestMode} />}
                {activeTab === Tab.ADMIN && <AdminView allCampaigns={campaigns} customHotspots={customHotspots} onSaveHotspots={async (h) => { for (const item of h) await saveHotspotFirebase(item); }} onDeleteHotspot={deleteHotspotFirebase} onDeleteCampaign={deleteCampaignFirebase} onApprove={(id) => updateCampaignStatusFirebase(id, AdStatus.ACTIVE)} onReject={(id) => updateCampaignStatusFirebase(id, AdStatus.REJECTED)} onResetMyAccount={() => resetUserInFirebase(userState.telegramId!)} isTestMode={isTestMode} onToggleTestMode={() => setIsTestMode(!isTestMode)} />}
            </div>
            {(activeTab === Tab.MAP || activeTab === Tab.HUNT) && <button onClick={() => setShowAIChat(true)} className="fixed right-6 bottom-24 z-[999] w-12 h-12 bg-cyan-600 rounded-full flex items-center justify-center shadow-lg animate-bounce"><Sparkles className="text-white" size={20} /></button>}
            {showAIChat && <AIChat onClose={() => setShowAIChat(false)} />}
            <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 mb-2"><Navigation currentTab={activeTab} onTabChange={setActiveTab} userWalletAddress={userWalletAddress} /></div>
        </div>
    );
}

export default App;
