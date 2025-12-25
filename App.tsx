
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { Navigation } from './components/Navigation';
import { Tab, UserState, SpawnPoint, Coordinate, Campaign, AdStatus, HotspotDefinition, HotspotCategory } from './types';
import { GLOBAL_SPAWNS, GLOBAL_HOTSPOTS, ADMIN_WALLET_ADDRESS } from './constants';
import { generateRandomSpawns } from './utils';
import { Sparkles, ShieldAlert, ExternalLink, UserX, AlertTriangle, Fingerprint, Lock, ShieldCheck, Loader2, SmartphoneNfc, RefreshCw, Settings, ShieldQuestion, Send, MapPin } from 'lucide-react';
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
    const [gpsLoading, setGpsLoading] = useState(true);
    
    // Security states
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
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

    // GPS Tracker - Fără locație default, așteptăm semnal real
    useEffect(() => {
        if (!navigator.geolocation) {
            setGpsLoading(false);
            return;
        }
        
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const newCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserState(prev => ({ ...prev, location: newCoords }));
                setGpsLoading(false);
                if (!initialSpawnDone.current) {
                    setSpawns(prev => [...prev, ...generateRandomSpawns(newCoords, 8)]);
                    initialSpawnDone.current = true;
                }
            },
            (err) => {
                console.error("GPS Error:", err);
                setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

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
                } catch (e) { console.warn("FP Timeout"); }

                const synced = await syncUserWithFirebase(userData, defaultUserState, fingerprint);
                setUserState(prev => ({ ...prev, ...synced }));

                if (synced.isBanned) setIsBlocked(true);

                const startParam = tg.initDataUnsafe.start_param || "";
                if (startParam.startsWith('ref_') && !synced.hasClaimedReferral) {
                    const referrerId = startParam.replace('ref_', '');
                    if (referrerId !== userId) {
                        const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
                        const currentDisplayName = fullName || tgUser.username || `Hunter_${userId}`;
                        await processReferralReward(referrerId, parseInt(userId), currentDisplayName);
                    }
                }

                subscribeToUserProfile(parseInt(userId), (updatedData) => {
                    setUserState(prev => ({ ...prev, ...updatedData }));
                    if (updatedData.isBanned) setIsBlocked(true);
                });

            } catch (err) {
                console.error("Init Error:", err);
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

        if (!bm || !bm.available) {
            setIsUnlocked(true);
            return;
        }

        setIsAuthenticating(true);
        bm.authenticate({ reason: "Verify extraction node" }, (success) => {
            setIsAuthenticating(false);
            if (success) {
                setIsUnlocked(true);
            } else {
                alert("Auth Failed.");
            }
        });
    };

    useEffect(() => {
        if (userWalletAddress && userState.telegramId) {
            updateUserWalletInFirebase(userState.telegramId, userWalletAddress);
            setUserState(prev => ({ ...prev, walletAddress: userWalletAddress }));
        }
    }, [userWalletAddress, userState.telegramId]);

    const handleCollect = useCallback(async (spawnId: string, value: number, category?: HotspotCategory, tonReward: number = 0) => {
        if (isBlocked && !isAdmin) return;
        const isAd = spawnId.startsWith('ad-');
        if (!isAd && userState.collectedIds.includes(spawnId)) return;
        
        if (userState.telegramId) {
            await saveCollectionToFirebase(userState.telegramId, spawnId, value, category, tonReward);
        }
        setSpawns(prev => prev.filter(s => s.id !== spawnId));
    }, [userState.telegramId, userState.collectedIds, isBlocked, isAdmin]);

    if (isLoading || (gpsLoading && isUnlocked)) {
        return (
            <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center text-white p-10">
                <div className="relative mb-6">
                    <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
                    <MapPin className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-400 animate-pulse" size={24} />
                </div>
                <h2 className="text-xl font-black uppercase tracking-tighter mb-2">Sincronizare GPS</h2>
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-[0.2em] text-center max-w-[200px] leading-relaxed">
                    Localizăm coordonatele tale curente pentru a centra radarul ELZR...
                </p>
            </div>
        );
    }

    if (!isTelegram) {
        return (
            <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-8 text-center">
                 <h1 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter">Access Restricted</h1>
                 <a href="https://t.me/Obadiah_Bot/eliezer" target="_blank" className="px-10 py-4 bg-white text-black font-black rounded-2xl uppercase text-xs tracking-widest">Open Telegram</a>
            </div>
        );
    }

    if (!isUnlocked && !isAdmin) {
        return (
            <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-8">
                <div className="mb-12 text-center">
                    <h2 className="text-[10px] text-cyan-500 font-black uppercase tracking-[0.4em] mb-2">Secure Gateway</h2>
                    <h1 className="text-4xl font-black text-white uppercase tracking-tighter">ELIEZER</h1>
                </div>
                <div className="w-32 h-32 rounded-[2.5rem] bg-slate-900 border-2 border-slate-800 flex items-center justify-center mb-12 shadow-2xl">
                    <Fingerprint size={56} className={isAuthenticating ? "text-cyan-400 animate-pulse" : "text-slate-600"} />
                </div>
                <button onClick={handleUnlock} className="w-full max-w-xs py-5 bg-white text-black font-black rounded-2xl uppercase text-xs tracking-widest active:scale-95 shadow-xl">
                    {isAuthenticating ? "Authenticating..." : "Unlock Entry"}
                </button>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-slate-950 text-white flex flex-col relative overflow-hidden">
            <div className="flex-1 relative overflow-hidden">
                {activeTab === Tab.MAP && userState.location && <MapView location={userState.location} spawns={spawns} collectedIds={userState.collectedIds} hotspots={allHotspots} />}
                {activeTab === Tab.HUNT && userState.location && <HuntView location={userState.location} spawns={spawns} collectedIds={userState.collectedIds} onCollect={handleCollect} hotspots={allHotspots} />}
                {activeTab === Tab.LEADERBOARD && <LeaderboardView />}
                {activeTab === Tab.WALLET && <WalletView userState={userState} onAdReward={(amt) => handleCollect('ad-' + Date.now(), amt, 'AD_REWARD')} onInvite={() => {}} />}
                {activeTab === Tab.FRENS && <FrensView referralCount={userState.referrals} referralNames={userState.referralNames} onInvite={() => {}} />}
                {activeTab === Tab.ADS && <AdsView userLocation={userState.location} collectedIds={userState.collectedIds} myCampaigns={campaigns.filter(c => c.ownerWallet === userWalletAddress)} onSubmitApplication={async (coords, count, mult, price, data) => {
                    const camp: Campaign = { id: `camp-${Date.now()}`, ownerWallet: userWalletAddress || 'anon', targetCoords: coords, count, multiplier: mult, durationDays: data.durationDays, totalPrice: price, data: { ...data, status: AdStatus.PENDING_REVIEW }, timestamp: Date.now() };
                    await createCampaignFirebase(camp);
                }} onPayCampaign={(id) => updateCampaignStatusFirebase(id, AdStatus.ACTIVE)} isTestMode={isTestMode} />}
                {activeTab === Tab.ADMIN && <AdminView allCampaigns={campaigns} customHotspots={customHotspots} onSaveHotspots={async (newHotspots) => { for (const h of newHotspots) await saveHotspotFirebase(h); }} onDeleteHotspot={async (id) => { await deleteHotspotFirebase(id); }} onDeleteCampaign={async (id) => { await deleteCampaignFirebase(id); }} onApprove={(id) => updateCampaignStatusFirebase(id, AdStatus.ACTIVE)} onReject={(id) => updateCampaignStatusFirebase(id, AdStatus.REJECTED)} onResetMyAccount={() => {}} isTestMode={isTestMode} onToggleTestMode={() => setIsTestMode(!isTestMode)} />}
            </div>
            {(activeTab === Tab.MAP || activeTab === Tab.HUNT) && <button onClick={() => setShowAIChat(true)} className="fixed right-6 bottom-24 z-[999] w-12 h-12 bg-cyan-600 rounded-full flex items-center justify-center shadow-lg border border-cyan-400 animate-bounce"><Sparkles className="text-white" size={20} /></button>}
            {showAIChat && <AIChat onClose={() => setShowAIChat(false)} />}
            <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 mb-2"><Navigation currentTab={activeTab} onTabChange={setActiveTab} userWalletAddress={userWalletAddress} /></div>
        </div>
    );
}

export default App;