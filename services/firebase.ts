
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
    } catch (e) { return "unknown_fp"; }
}

export const getCloudStorageId = (): Promise<string> => {
    return new Promise((resolve) => {
        const tg = window.Telegram?.WebApp;
        if (!tg?.CloudStorage) { resolve("no_cloud_storage"); return; }
        tg.CloudStorage.getItem('elzr_uuid', (err, value) => {
            if (value) resolve(value);
            else { const newUuid = crypto.randomUUID(); tg.CloudStorage.setItem('elzr_uuid', newUuid, () => resolve(newUuid)); }
        });
    });
};

export const clearCloudStorageId = (): Promise<void> => {
    return new Promise((resolve) => {
        const tg = window.Telegram?.WebApp;
        if (!tg?.CloudStorage) { resolve(); return; }
        tg.CloudStorage.setItem('elzr_uuid', '', () => resolve());
    });
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
    if (!tgId) return () => {};
    const docRef = doc(db, "users", String(tgId));
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            callback(sanitizeUserData(docSnap.data(), defaults));
        } else {
            callback(defaults);
        }
    }, (error) => {
        console.error("Profile Subscription Error:", error);
    });
};

export const syncUserWithFirebase = async (userData: any, localState: UserState, fingerprint: string, cloudId: string, initDataRaw?: string): Promise<UserState> => {
    if (!userData.id) return localState;
    const userIdStr = String(userData.id);
    const userDocRef = doc(db, "users", userIdStr);
    
    try {
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            const data = userDoc.data();
            await updateDoc(userDocRef, { 
                cloudStorageId: cloudId, 
                deviceFingerprint: fingerprint, 
                lastActive: serverTimestamp(),
                photoUrl: userData.photoUrl || ''
            });
            return sanitizeUserData(data, localState);
        } else {
            const newUser: any = { 
                telegramId: Number(userData.id), 
                username: userData.username || `Hunter_${userIdStr.slice(-4)}`, 
                photoUrl: userData.photoUrl || '', 
                deviceFingerprint: fingerprint, 
                cloudStorageId: cloudId, 
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
            await setDoc(userDocRef, newUser);
            return newUser;
        }
    } catch (e) { return localState; }
};

export const saveCollectionToFirebase = async (tgId: number, spawnId: string, value: number, category?: HotspotCategory, tonReward: number = 0) => {
    if (!tgId) return;
    try {
        // Trimitem userId exact așa cum apare în screenshot (ca Number)
        // Backend trigger-ul actualizat va face conversia necesară.
        await addDoc(collection(db, "claims"), { 
            userId: Number(tgId), 
            spawnId: String(spawnId), 
            claimedValue: Number(value), 
            tonReward: Number(tonReward), 
            category: category || "URBAN", 
            timestamp: serverTimestamp(), 
            status: "pending" 
        });
    } catch (e) { console.error("Save Error:", e); }
};

export const processReferralReward = async (referrerId: string, userId: number, userName: string) => {
    try {
        const referrerRef = doc(db, "users", String(referrerId));
        const referrerDoc = await getDoc(referrerRef);
        if (referrerDoc.exists()) {
            await updateDoc(referrerRef, {
                balance: increment(50),
                referralBalance: increment(50),
                referrals: increment(1),
                referralNames: arrayUnion(userName)
            });
            await updateDoc(doc(db, "users", String(userId)), { hasClaimedReferral: true });
        }
    } catch (e) { console.error("Referral Error:", e); }
};

export const askGeminiProxy = async (messages: any[]) => {
    const chatFunc = httpsCallable(functions, 'chatWithELZR');
    const res: any = await chatFunc({ messages });
    return res.data;
};

export const resetUserInFirebase = async (targetUserId: number): Promise<{success: boolean, error?: string}> => {
    try {
        const resetFunc = httpsCallable(functions, 'resetUserProtocol');
        const res: any = await resetFunc({ targetUserId: Number(targetUserId) });
        return { success: res.data?.success };
    } catch (e: any) { return { success: false, error: e.message }; }
};

export const getLeaderboard = async () => {
    const q = query(collection(db, "users"), orderBy("balance", "desc"), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap, index) => ({ 
        rank: index + 1, 
        username: (docSnap.data() as any).username || "Hunter", 
        score: Number((docSnap.data() as any).balance || 0) 
    }));
};

export const subscribeToCampaigns = (cb: any) => onSnapshot(collection(db, "campaigns"), snap => cb(snap.docs.map(d => d.data())));
export const subscribeToHotspots = (cb: any) => onSnapshot(collection(db, "hotspots"), snap => cb(snap.docs.map(d => d.data())));
export const saveHotspotFirebase = async (h: any) => setDoc(doc(db, "hotspots", h.id), h);
export const deleteHotspotFirebase = async (id: string) => deleteDoc(doc(db, "hotspots", id));
export const deleteUserFirebase = async (id: string) => deleteDoc(doc(db, "users", id));
export const toggleUserBan = async (id: string, b: boolean) => updateDoc(doc(db, "users", String(id)), { isBanned: b });
export const toggleUserBiometricSetting = async (id: string, b: boolean) => updateDoc(doc(db, "users", String(id)), { biometricEnabled: b });
export const createCampaignFirebase = async (c: any) => setDoc(doc(db, "campaigns", c.id), c);
export const updateCampaignStatusFirebase = async (id: string, s: string) => updateDoc(doc(db, "campaigns", id), { "data.status": s });
export const deleteCampaignFirebase = async (id: string) => deleteDoc(doc(db, "campaigns", id));
export const updateUserWalletInFirebase = async (id: number, w: string) => updateDoc(doc(db, "users", String(id)), { walletAddress: w });
export const getAllUsersAdmin = async () => (await getDocs(collection(db, "users"))).docs.map(d => ({id: d.id, ...d.data()}));
export const processWithdrawTON = async (tgId: number, amount: number) => {
    await addDoc(collection(db, "withdrawal_requests"), { userId: Number(tgId), amount: Number(amount), status: "pending", timestamp: serverTimestamp() });
    return true;
};
