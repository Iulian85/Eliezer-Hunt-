
import { initializeApp, getApps, getApp } from "@firebase/app";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    collection, 
    onSnapshot, 
    query, 
    orderBy, 
    limit, 
    getDocs,
    addDoc,
    serverTimestamp,
    increment,
    deleteDoc,
    arrayUnion
} from "@firebase/firestore";
import { getFunctions, httpsCallable } from "@firebase/functions";
import FingerprintJS from '@fingerprintjs/fingerprintjs';

import { UserState, Campaign, HotspotDefinition, HotspotCategory, Coordinate } from "../types";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const functions = getFunctions(app);

export async function getCurrentFingerprint() {
    try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        return result.visitorId;
    } catch (e) {
        return "unknown_fp";
    }
}

export const getCloudStorageId = (): Promise<string> => {
    return new Promise((resolve) => {
        const tg = window.Telegram?.WebApp;
        if (!tg?.CloudStorage) {
            resolve("no_cloud_storage");
            return;
        }
        tg.CloudStorage.getItem('elzr_uuid', (err, value) => {
            if (value) {
                resolve(value);
            } else {
                const newUuid = crypto.randomUUID();
                tg.CloudStorage.setItem('elzr_uuid', newUuid, () => resolve(newUuid));
            }
        });
    });
};

export const askGeminiProxy = async (messages: any[]) => {
    const fingerprint = await getCurrentFingerprint();
    const cloudId = await getCloudStorageId();
    const chatFunc = httpsCallable(functions, 'chatWithELZR');
    const result = await chatFunc({ 
        messages, 
        initData: window.Telegram.WebApp.initData,
        fingerprint: fingerprint,
        cloudId: cloudId
    });
    return result.data as { text: string };
};

const sanitizeUserData = (data: any, defaults: UserState): UserState => {
    return {
        ...defaults,
        ...data,
        balance: Number(data.balance || 0),
        tonBalance: Number(data.tonBalance || 0),
        gameplayBalance: Number(data.gameplayBalance || 0),
        rareBalance: Number(data.rareBalance || 0),
        eventBalance: Number(data.eventBalance || 0),
        dailySupplyBalance: Number(data.dailySupplyBalance || 0),
        merchantBalance: Number(data.merchantBalance || 0),
        referralBalance: Number(data.referralBalance || 0),
        referralNames: data.referralNames || [],
        hasClaimedReferral: !!data.hasClaimedReferral,
        collectedIds: data.collectedIds || []
    };
};

export const subscribeToUserProfile = (tgId: number, defaults: UserState, callback: (userData: UserState) => void) => {
    if (!tgId) return () => {};
    const docId = tgId.toString();
    return onSnapshot(doc(db, "users", docId), (docSnap) => {
        if (docSnap.exists()) {
            const data = sanitizeUserData(docSnap.data(), defaults);
            callback(data);
        }
    }, (err) => {
        console.error("Firestore Subscription Error:", err);
    });
};

export const syncUserWithFirebase = async (
    userData: { id: number, username?: string, firstName?: string, lastName?: string, photoUrl?: string }, 
    localState: UserState, 
    fingerprint: string,
    cloudId: string,
    initDataRaw?: string,
    currentLocation?: Coordinate
): Promise<UserState> => {
    if (!userData.id) return localState;
    const userDocRef = doc(db, "users", userData.id.toString());
    
    const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ');
    const displayName = fullName || userData.username || `Hunter_${userData.id.toString().slice(-4)}`;

    try {
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            const existingData = userDoc.data();
            if (existingData.username !== displayName || existingData.cloudStorageId !== cloudId) {
                await updateDoc(userDocRef, { 
                    username: displayName,
                    cloudStorageId: cloudId, 
                    deviceFingerprint: fingerprint,
                    lastActive: serverTimestamp()
                });
            }
            return sanitizeUserData({ ...existingData, username: displayName, cloudStorageId: cloudId }, localState);
        } else {
            const newUserProfile: any = {
                telegramId: userData.id,
                username: displayName,
                photoUrl: userData.photoUrl || '',
                deviceFingerprint: fingerprint,
                cloudStorageId: cloudId,
                lastInitData: initDataRaw,
                lastLocation: currentLocation || null,
                isBanned: false,
                balance: 0,
                tonBalance: 0,
                gameplayBalance: 0,
                rareBalance: 0,
                eventBalance: 0,
                dailySupplyBalance: 0,
                merchantBalance: 0,
                referralBalance: 0,
                collectedIds: [],
                joinedAt: serverTimestamp(),
                lastActive: serverTimestamp(),
                biometricEnabled: true,
                referralNames: [],
                hasClaimedReferral: false
            };
            await setDoc(userDocRef, newUserProfile);
            return newUserProfile;
        }
    } catch (e) { 
        console.error("Sync Error:", e);
        return localState; 
    }
};

export const saveCollectionToFirebase = async (tgId: number, spawnId: string, value: number, category?: HotspotCategory, tonReward: number = 0, captureLocation?: Coordinate) => {
    if (!tgId) return;
    const fingerprint = await getCurrentFingerprint();
    const cloudId = await getCloudStorageId();
    const userRef = doc(db, "users", tgId.toString());

    try {
        await addDoc(collection(db, "claims"), {
            userId: Number(tgId),
            spawnId,
            claimedValue: Number(value),
            tonReward: Number(tonReward),
            category: category || "URBAN", 
            timestamp: serverTimestamp(),
            status: "pending", 
            fingerprint: fingerprint,
            cloudId: cloudId
        });

        const updates: any = {
            lastActive: serverTimestamp()
        };

        if (spawnId && !spawnId.startsWith('ad-')) {
            updates.collectedIds = arrayUnion(spawnId);
        }

        updates.balance = increment(value);
        updates.tonBalance = increment(tonReward);

        switch (category) {
            case 'URBAN': 
            case 'MALL': 
            case 'GIFTBOX': 
                updates.gameplayBalance = increment(value); 
                break;
            case 'LANDMARK': 
                updates.rareBalance = increment(value); 
                updates.rareItemsCollected = increment(1); 
                break;
            case 'EVENT': 
                updates.eventBalance = increment(value); 
                updates.eventItemsCollected = increment(1); 
                break;
            case 'MERCHANT': 
                updates.merchantBalance = increment(value); 
                updates.sponsoredAdsWatched = increment(1); 
                break;
            case 'AD_REWARD': 
                updates.dailySupplyBalance = increment(value); 
                updates.adsWatched = increment(1); 
                updates.lastDailyClaim = Date.now();
                break;
        }

        await updateDoc(userRef, updates);

    } catch (e) {
        console.error("Critical Save Error:", e);
    }
};

export const processReferralReward = async (referrerId: string, newUserId: number, newUserName: string) => {
    if (!referrerId || !newUserId) return;
    
    try {
        // 1. Creăm cererea de referal în colecția dedicată
        const claimRef = doc(collection(db, "referral_claims"));
        await setDoc(claimRef, {
            referrerId: referrerId.toString(),
            referredId: newUserId.toString(),
            referredName: newUserName,
            timestamp: serverTimestamp(),
            status: "pending"
        });
        
        // 2. Marcăm local utilizatorul că a folosit deja un cod (pentru a preveni buclele)
        await updateDoc(doc(db, "users", newUserId.toString()), {
            hasClaimedReferral: true
        });

        console.log(`[Referral System] Node Linked: ${referrerId} -> ${newUserId}`);
    } catch (e) {
        console.error("[Referral System] Critical Error:", e);
    }
};

export const getLeaderboard = async () => {
    const q = query(collection(db, "users"), orderBy("balance", "desc"), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap, index) => ({
        rank: index + 1,
        username: docSnap.data().username || "Anonymous Hunter",
        score: Number(docSnap.data().balance || 0)
    }));
};

export const subscribeToCampaigns = (cb: any) => onSnapshot(collection(db, "campaigns"), snap => cb(snap.docs.map(d => d.data())));
export const subscribeToHotspots = (cb: any) => onSnapshot(collection(db, "hotspots"), snap => cb(snap.docs.map(d => d.data())));
export const saveHotspotFirebase = async (h: any) => setDoc(doc(db, "hotspots", h.id), h);
export const deleteHotspotFirebase = async (id: string) => deleteDoc(doc(db, "hotspots", id));
export const deleteUserFirebase = async (id: string) => deleteDoc(doc(db, "users", id));
export const toggleUserBan = async (id: string, b: boolean) => updateDoc(doc(db, "users", id), { isBanned: b });
export const toggleUserBiometricSetting = async (id: string, b: boolean) => updateDoc(doc(db, "users", id), { biometricEnabled: b });
export const createCampaignFirebase = async (c: any) => setDoc(doc(db, "campaigns", c.id), c);
export const updateCampaignStatusFirebase = async (id: string, s: string) => updateDoc(doc(db, "campaigns", id), { "data.status": s });
export const deleteCampaignFirebase = async (id: string) => deleteDoc(doc(db, "campaigns", id));

export const updateUserWalletInFirebase = async (id: number, w: string) => {
    if (!id || !w) return;
    try {
        await updateDoc(doc(db, "users", id.toString()), { walletAddress: w });
    } catch (error) {
        console.error("Eroare salvare wallet:", error);
    }
};

export const resetUserInFirebase = async (targetUserId: number): Promise<{success: boolean, error?: string}> => {
    try {
        const userRef = doc(db, "users", targetUserId.toString());
        await updateDoc(userRef, {
            balance: 0,
            tonBalance: 0,
            gameplayBalance: 0,
            rareBalance: 0,
            eventBalance: 0,
            dailySupplyBalance: 0,
            merchantBalance: 0,
            referralBalance: 0,
            collectedIds: [],
            lastDailyClaim: 0,
            referrals: 0,
            referralNames: []
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const processWithdrawTON = async (tgId: number, amount: number) => {
    const fingerprint = await getCurrentFingerprint();
    const cloudId = await getCloudStorageId();
    await addDoc(collection(db, "withdrawal_requests"), { 
        userId: Number(tgId), 
        amount: Number(amount), 
        status: "pending_review", 
        timestamp: serverTimestamp(),
        fingerprint,
        cloudId
    });
    return true;
};

export const getAllUsersAdmin = async () => (await getDocs(collection(db, "users"))).docs.map(d => ({id: d.id, ...d.data()}));
