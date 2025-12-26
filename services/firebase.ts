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
    deleteDoc
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

// ACUM E EXPORTATĂ CORECT!
export async function getCurrentFingerprint() {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result.visitorId;
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
        collectedIds: data.collectedIds || []
    };
};

export const subscribeToUserProfile = (tgId: number, defaults: UserState, callback: (userData: UserState) => void) => {
    return onSnapshot(doc(db, "users", tgId.toString()), (docSnap) => {
        if (docSnap.exists()) {
            callback(sanitizeUserData(docSnap.data(), defaults));
        }
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
    
    try {
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            return sanitizeUserData(userDoc.data(), localState);
        } else {
            const newUserProfile: any = {
                telegramId: userData.id,
                username: userData.username || `Hunter_${userData.id.toString().slice(-4)}`,
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
                lastActive: serverTimestamp()
            };
            await setDoc(userDocRef, newUserProfile);
            return newUserProfile;
        }
    } catch (e) { return localState; }
};

export const logAdStartFirebase = async (tgId: number) => {
    if (!tgId) return;
    try {
        await addDoc(collection(db, "ad_sessions"), {
            userId: tgId,
            startTime: serverTimestamp(),
            status: "active"
        });
    } catch (e) {}
};

export const saveCollectionToFirebase = async (tgId: number, spawnId: string, value: number, category?: HotspotCategory, tonReward: number = 0, captureLocation?: Coordinate, challenge?: any) => {
    if (!tgId) return;
    const fingerprint = await getCurrentFingerprint();
    const cloudId = await getCloudStorageId();
    try {
        await addDoc(collection(db, "claims"), {
            userId: tgId,
            spawnId,
            claimedValue: value,
            tonReward: tonReward,
            category: category || "URBAN", 
            timestamp: serverTimestamp(),
            location: captureLocation || null,
            challenge: challenge || null,
            status: "pending_verification",
            initData: window.Telegram.WebApp.initData,
            fingerprint: fingerprint,
            cloudId: cloudId
        });
    } catch (e) {}
};

export const requestAdRewardFirebase = async (tgId: number, rewardValue: number) => {
    const fingerprint = await getCurrentFingerprint();
    const cloudId = await getCloudStorageId();
    await addDoc(collection(db, "ad_claims"), {
        userId: tgId,
        rewardValue,
        timestamp: serverTimestamp(),
        initData: window.Telegram.WebApp.initData,
        fingerprint: fingerprint,
        cloudId: cloudId
    });
};

export const processReferralReward = async (referrerId: string, newUserId: number, newUserName: string) => {
    try {
        await addDoc(collection(db, "referral_claims"), {
            referrerId,
            referredId: newUserId,
            referredName: newUserName,
            timestamp: serverTimestamp(),
            status: "pending_proof_of_play",
            initData: window.Telegram.WebApp.initData
        });
        
        await updateDoc(doc(db, "users", newUserId.toString()), {
            hasClaimedReferral: true
        });
    } catch (e) {
        console.error("Referral processing error", e);
    }
};

export const getLeaderboard = async () => {
    const q = query(collection(db, "users"), orderBy("balance", "desc"), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap, index) => ({
        rank: index + 1,
        username: docSnap.data().username || "Hunter",
        score: docSnap.data().balance || 0
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
export const updateUserWalletInFirebase = async (id: number, w: string) => updateDoc(doc(db, "users", id.toString()), { walletAddress: w });

export const resetUserInFirebase = async (targetUserId: number): Promise<{success: boolean, error?: string}> => {
    try {
        const resetFunc = httpsCallable(functions, 'resetUserProtocol');
        const result: any = await resetFunc({ targetUserId });
        if (result.data && result.data.success) {
            return { success: true };
        }
        return { success: false, error: "Server Wipe Failed" };
    } catch (e: any) {
        console.error("Initialization Error:", e);
        return { success: false, error: e.message };
    }
};

export const processWithdrawTON = async (tgId: number, amount: number) => {
    const fingerprint = await getCurrentFingerprint();
    const cloudId = await getCloudStorageId();
    await addDoc(collection(db, "withdrawal_requests"), { 
        userId: tgId, 
        amount, 
        status: "pending_review", 
        timestamp: serverTimestamp(), 
        initData: window.Telegram.WebApp.initData,
        fingerprint: fingerprint,
        cloudId: cloudId
    });
    return true;
};
export const getAllUsersAdmin = async () => (await getDocs(collection(db, "users"))).docs.map(d => ({id: d.id, ...d.data()}));