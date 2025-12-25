
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { Navigation } from './components/Navigation';
import { Tab, UserState, SpawnPoint, Coordinate, Campaign, AdStatus, HotspotDefinition, HotspotCategory } from './types';
import { GLOBAL_SPAWNS, GLOBAL_HOTSPOTS, ADMIN_WALLET_ADDRESS } from './constants';
import { generateRandomSpawns } from './utils';
import { Sparkles, ShieldAlert, ExternalLink, UserX, AlertTriangle, Fingerprint, Lock, ShieldCheck, Loader2, SmartphoneNfc, RefreshCw, Settings, ShieldQuestion, Send, Shield } from 'lucide-react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

import { 
    syncUserWithFirebase, 
    saveCollectionToFirebase,
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
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [currentFingerprint, setCurrentFingerprint] = useState<string | null>(null);

    const isAdmin = useMemo(() => userWalletAddress === ADMIN_WALLET_ADDRESS, [userWalletAddress]);
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
            setIsUnlocked(true); 
            return; 
        }

        setAuthError(null);
        setIsAuthenticating(true);

        // Pasul 1: Inițializare BiometricManager
        bm.init(() => {
            if (!bm.available) {
                setIsAuthenticating(false);
                setIsUnlocked(true); // Fallback dacă nu e disponibil pe device
                return;
            }

            // Pasul 2: Autentificare
            bm.authenticate({ reason: "Sincronizare nod ELZR" }, (success) => {
                setIsAuthenticating(false);
                if (success) {
                    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
                    setIsUnlocked(true);
                } else {
                    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
                    setAuthError("Eroare Biometrică. Încearcă din nou.");
                }
            });
        });
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

    if (isLoading) return <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center"><Loader2 className="text-cyan-500 animate-spin" /></div>;

    // SECURITY BLOCK SCREEN (Restored UI)
    if (!isUnlocked && isTelegram && !isBlocked) {
        return (
            <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-8 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 via-slate-950 to-slate-950"></div>
                
                <div className="relative z-10 flex flex-col items-center text-center max-w-xs">
                    <div className="w-24 h-24 bg-slate-900 rounded-[2rem] border-2 border-slate-800 flex items-center justify-center mb-8 shadow-2xl relative">
                        <div className="absolute inset-0 bg-cyan-500/10 rounded-[2rem] blur-xl animate-pulse"></div>
                        <Shield className="text-cyan-500 relative z-10" size={40} />
                    </div>

                    <h1 className="text-2xl font-black text-white uppercase tracking-tighter mb-2 font-[Rajdhani]">Interfață Securizată</h1>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] leading-relaxed mb-10">
                        Deblocați terminalul pentru a începe scanarea sectorului GPS.
                    </p>

                    <button 
                        onClick={handleUnlock} 
                        disabled={isAuthenticating}
                        className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl border
                            ${isAuthenticating ? 'bg-slate-800 text-slate-500 border-slate-700' : 'bg-white text-black border-white hover:shadow-white/10'}
                        `}
                    >
                        {isAuthenticating ? <Loader2 className="animate-spin" size={18} /> : <Fingerprint size={18} />}
                        {isAuthenticating ? "Verificare..." : "Deblocare Sistem"}
                    </button>

                    {authError && (
                        <div className="mt-6 flex items-center gap-2 text-red-500 animate-bounce">
                            <ShieldAlert size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">{authError}</span>
                        </div>
                    )}
                </div>

                <div className="absolute bottom-10 text-[8px] text-slate-700 font-black uppercase tracking-[0.4em]">
                    End-to-End Encryption Active
                </div>
            </div>
        );
    }

    // BANNED SCREEN
    if (isBlocked) {
        return (
            <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 bg-red-900/20 rounded-3xl border-2 border-red-900/50 flex items-center justify-center mb-6">
                    <UserX className="text-red-500" size={40} />
                </div>
                <h1 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Protocol Terminat</h1>
                <p className="text-xs text-slate-500 font-bold uppercase leading-relaxed max-w-xs">
                    Contul tău a fost suspendat pentru încălcarea regulilor de securitate (GPS Spoofing detectat).
                </p>
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
            {(activeTab === Tab.MAP || activeTab === Tab.HUNT) && <button onClick={() => setShowAIChat(true)} className="fixed right-6 bottom-24 z-[999] w-12 h-12 bg-cyan-600 rounded-full flex items-center justify-center border border-cyan-400 animate-bounce"><Sparkles className="text-white" size={20} /></button>}
            {showAIChat && <AIChat onClose={() => setShowAIChat(false)} />}
            <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 mb-2"><Navigation currentTab={activeTab} onTabChange={setActiveTab} userWalletAddress={userWalletAddress} /></div>
        </div>
    );
}

export default App;
