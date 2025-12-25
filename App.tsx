
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
    const [isNewUser, setIsNewUser] = useState(false);
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
            setIsTelegram(true);

            const tgUser = tg.initDataUnsafe.user;
            const initDataRaw = window.Telegram.WebApp.initData;

            try {
                let fingerprint = "unknown_device";
                const fp = await FingerprintJS.load();
                const result = await fp.get();
                fingerprint = result.visitorId;
                setCurrentFingerprint(fingerprint);

                // SECURITY 6.0: Trimitem locația chiar la pornire pentru ancorare
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
        if (userState.biometricEnabled === false) { setIsUnlocked(true); return; }
        const tg = window.Telegram?.WebApp;
        const bm = tg?.BiometricManager;
        if (!bm) { setIsUnlocked(true); return; }

        setIsAuthenticating(true);
        bm.authenticate({ reason: "Verify operator" }, (success) => {
            setIsAuthenticating(false);
            if (success) setIsUnlocked(true);
            else alert("Mismatch.");
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

    if (!isUnlocked && isTelegram && !isBlocked) {
        return (
            <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-8">
                <Fingerprint size={64} className="text-slate-700 mb-8" />
                <button onClick={handleUnlock} className="w-full py-4 bg-white text-black font-black rounded-2xl uppercase tracking-widest text-sm">Unlock Interface</button>
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
                {/* Fixed: Replaced undefined function names onDeleteHotspot and onDeleteCampaign with their correct imported names */}
                {activeTab === Tab.ADMIN && <AdminView allCampaigns={campaigns} customHotspots={customHotspots} onSaveHotspots={async (h) => { for (const item of h) await saveHotspotFirebase(item); }} onDeleteHotspot={deleteHotspotFirebase} onDeleteCampaign={deleteCampaignFirebase} onApprove={(id) => updateCampaignStatusFirebase(id, AdStatus.ACTIVE)} onReject={(id) => updateCampaignStatusFirebase(id, AdStatus.REJECTED)} onResetMyAccount={() => resetUserInFirebase(userState.telegramId!)} isTestMode={isTestMode} onToggleTestMode={() => setIsTestMode(!isTestMode)} />}
            </div>
            {(activeTab === Tab.MAP || activeTab === Tab.HUNT) && <button onClick={() => setShowAIChat(true)} className="fixed right-6 bottom-24 z-[999] w-12 h-12 bg-cyan-600 rounded-full flex items-center justify-center border border-cyan-400 animate-bounce"><Sparkles className="text-white" size={20} /></button>}
            {showAIChat && <AIChat onClose={() => setShowAIChat(false)} />}
            <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 mb-2"><Navigation currentTab={activeTab} onTabChange={setActiveTab} userWalletAddress={userWalletAddress} /></div>
        </div>
    );
}

export default App;
