
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
    resetUserInFirebase,
    getCloudStorageId
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
    const [biometricSupported, setBiometricSupported] = useState<boolean | null>(null);

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

        const merged = [...GLOBAL_HOTSPOTS, ...customHotspots, ...activeAdsAsHotspots];
        return merged.filter(h => !userState.collectedIds.includes(h.id));
    }, [campaigns, customHotspots, userState.collectedIds]);

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
            const userData = { id: parseInt(userId), username: tgUser.username, photoUrl: tgUser.photo_url };

            try {
                let fingerprint = "unknown";
                try {
                    const fpPromise = FingerprintJS.load().then(fp => fp.get());
                    const result = await Promise.race([fpPromise, new Promise((_, r) => setTimeout(r, 4000))]) as any;
                    fingerprint = result.visitorId;
                } catch (e) {}

                const cloudId = await getCloudStorageId();
                const synced = await syncUserWithFirebase(userData, defaultUserState, fingerprint, cloudId, window.Telegram.WebApp.initData);
                setUserState(synced);

                if (synced.isBanned) setIsBlocked(true);

                subscribeToUserProfile(parseInt(userId), defaultUserState, (updatedData) => {
                    setUserState(updatedData);
                    if (updatedData.isBanned) setIsBlocked(true);
                });
            } catch (err) {
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
        bm.authenticate({ reason: "Biometric entry" }, (success) => {
            setIsAuthenticating(false);
            if (success) setIsUnlocked(true);
            else alert("Auth Failed");
        });
    };

    useEffect(() => {
        if (userWalletAddress && userState.telegramId) {
            updateUserWalletInFirebase(userState.telegramId, userWalletAddress);
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

    const handleCollect = useCallback(async (spawnId: string, value: number, category?: HotspotCategory, tonReward: number = 0, challenge?: any) => {
        if (isBlocked && !isAdmin) return;
        if (userState.collectedIds.includes(spawnId)) return;
        
        setUserState(prev => {
            const newState = {
                ...prev,
                balance: prev.balance + value,
                tonBalance: prev.tonBalance + tonReward,
                collectedIds: [...prev.collectedIds, spawnId]
            };

            if (category === 'LANDMARK') {
                newState.rareBalance = (newState.rareBalance || 0) + value;
                newState.rareItemsCollected = (newState.rareItemsCollected || 0) + 1;
            } else if (category === 'EVENT') {
                newState.eventBalance = (newState.eventBalance || 0) + value;
                newState.eventItemsCollected = (newState.eventItemsCollected || 0) + 1;
            } else if (category === 'MERCHANT') {
                newState.merchantBalance = (newState.merchantBalance || 0) + value;
                newState.sponsoredAdsWatched = (newState.sponsoredAdsWatched || 0) + 1;
            } else if (category === 'AD_REWARD') {
                newState.dailySupplyBalance = (newState.dailySupplyBalance || 0) + value;
            } else {
                newState.gameplayBalance = (newState.gameplayBalance || 0) + value;
            }

            return newState;
        });

        if (userState.telegramId) {
            await saveCollectionToFirebase(userState.telegramId, spawnId, value, category, tonReward, userState.location || undefined, challenge);
        }

        setSpawns(prev => prev.filter(s => s.id !== spawnId));
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }, [userState.telegramId, userState.collectedIds, isBlocked, isAdmin, userState.location]);

    const handleInvite = useCallback(async () => {
        const tg = window.Telegram?.WebApp;
        if (!tg) return;
        const userId = tg.initDataUnsafe?.user?.id?.toString();
        const inviteLink = `https://t.me/Obadiah_Bot/eliezer?startapp=ref_${userId}`;
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=Hunt crypto!`);
    }, []);

    const handleResetMyAccountApp = async () => {
        if (userState.telegramId) {
            try {
                const success = await resetUserInFirebase(userState.telegramId);
                if (success) {
                    alert("Account Reset Successful on Server.");
                    window.location.reload();
                } else {
                    alert("Server-side reset rejected. Check if you are authorized.");
                }
            } catch (e: any) {
                alert("Error during reset: " + e.message);
                throw e;
            }
        }
    };

    if (isLoading) return <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-white font-mono"><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>;

    if (isBlocked && !isAdmin) return <div className="h-screen w-screen bg-slate-950 flex items-center justify-center p-8 text-center text-white font-black uppercase">Security Alert: Identity Locked</div>;

    if (!isUnlocked && (!isBlocked || !isAdmin)) {
        return (
            <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-8">
                <div className={`w-32 h-32 rounded-[2.5rem] bg-slate-900 border-2 flex items-center justify-center mb-12 ${isAuthenticating ? 'border-cyan-500' : 'border-slate-800'}`}>
                    <Fingerprint size={56} className={isAuthenticating ? "text-cyan-400 animate-pulse" : "text-slate-600"} />
                </div>
                <button onClick={handleUnlock} className="w-full py-5 bg-white text-black font-black rounded-[1.5rem] shadow-xl uppercase tracking-widest text-xs">Unlock entry</button>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-slate-950 text-white flex flex-col relative overflow-hidden">
            <div className="flex-1 relative overflow-hidden">
                {activeTab === Tab.MAP && <MapView location={userState.location || DEFAULT_LOCATION} spawns={spawns} collectedIds={userState.collectedIds} hotspots={allHotspots} />}
                {activeTab === Tab.HUNT && <HuntView userId={userState.telegramId} location={userState.location || DEFAULT_LOCATION} spawns={spawns} collectedIds={userState.collectedIds} onCollect={handleCollect} hotspots={allHotspots} />}
                {activeTab === Tab.LEADERBOARD && <LeaderboardView />}
                {activeTab === Tab.WALLET && <WalletView userState={userState} onAdReward={(amt) => handleCollect('ad-' + Date.now(), amt, 'AD_REWARD')} onInvite={handleInvite} />}
                {activeTab === Tab.FRENS && <FrensView referralCount={userState.referrals} referralNames={userState.referralNames} onInvite={handleInvite} />}
                {activeTab === Tab.ADS && <AdsView userLocation={userState.location} collectedIds={userState.collectedIds} myCampaigns={campaigns.filter(c => c.ownerWallet === userWalletAddress)} onSubmitApplication={async (coords, count, mult, price, data) => { await createCampaignFirebase({ id: `camp-${Date.now()}`, ownerWallet: userWalletAddress || 'anon', targetCoords: coords, count, multiplier: mult, durationDays: data.durationDays, totalPrice: price, data: { ...data, status: AdStatus.PENDING_REVIEW }, timestamp: Date.now() }); }} onPayCampaign={(id) => updateCampaignStatusFirebase(id, AdStatus.ACTIVE)} isTestMode={isTestMode} />}
                {activeTab === Tab.ADMIN && <AdminView allCampaigns={campaigns} customHotspots={customHotspots} onSaveHotspots={async (newH) => { for (const h of newH) await saveHotspotFirebase(h); }} onDeleteHotspot={deleteHotspotFirebase} onDeleteCampaign={deleteCampaignFirebase} onApprove={(id) => updateCampaignStatusFirebase(id, AdStatus.ACTIVE)} onReject={(id) => updateCampaignStatusFirebase(id, AdStatus.REJECTED)} onResetMyAccount={handleResetMyAccountApp} isTestMode={isTestMode} onToggleTestMode={() => setIsTestMode(!isTestMode)} />}
            </div>
            {(activeTab === Tab.MAP || activeTab === Tab.HUNT) && <button onClick={() => setShowAIChat(true)} className="fixed right-6 bottom-24 z-[999] w-12 h-12 bg-cyan-600 rounded-full flex items-center justify-center border border-cyan-400 animate-bounce shadow-xl"><Sparkles className="text-white" size={20} /></button>}
            {showAIChat && <AIChat onClose={() => setShowAIChat(false)} />}
            <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 mb-2 pointer-events-none"><div className="pointer-events-auto"><Navigation currentTab={activeTab} onTabChange={setActiveTab} userWalletAddress={userWalletAddress} /></div></div>
        </div>
    );
}

export default App;
