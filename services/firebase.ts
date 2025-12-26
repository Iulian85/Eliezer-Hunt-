
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

// Helper intern pentru a obține amprenta curentă fără a depinde de starea React
async function getCurrentFingerprint() {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result.visitorId;
}

export const askGeminiProxy = async (messages: any[]) => {
    const fingerprint = await getCurrentFingerprint();
    const chatFunc = httpsCallable(functions, 'chatWithELZR');
    const result = await chatFunc({ 
        messages, 
        initData: window.Telegram.WebApp.initData,
        fingerprint: fingerprint // Trimitem amprenta pentru validare backend
    });
    return result.data as { text: string };
};

export const subscribeToUserProfile = (tgId: number, callback: (userData: Partial<UserState>) => void) => {
    return onSnapshot(doc(db, "users", tgId.toString()), (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data() as UserState);
        }
    });
};

export const syncUserWithFirebase = async (
    userData: { id: number, username?: string, firstName?: string, lastName?: string, photoUrl?: string }, 
    localState: UserState, 
    fingerprint: string,
    initDataRaw?: string,
    currentLocation?: Coordinate
): Promise<UserState> => {
    if (!userData.id) return localState;
    const userDocRef = doc(db, "users", userData.id.toString());
    
    try {
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            // OBS: Regulile firestore.rules vor permite update la lastActive DOAR prin Functions, 
            // dar lăsăm asta aici ca fallback. Dacă update-ul e blocat de reguli, vom folosi o funcție.
            return { ...localState, ...userDoc.data() as any, telegramId: userData.id };
        } else {
            const newUserProfile: any = {
                telegramId: userData.id,
                username: userData.username || `Hunter_${userData.id.toString().slice(-4)}`,
                photoUrl: userData.photoUrl || '',
                deviceFingerprint: fingerprint, // SALVARE AMPRENTĂ INITIALĂ
                lastInitData: initDataRaw,
                lastLocation: currentLocation || null,
                isBanned: false,
                balance: 0,
                collectedIds: [],
                joinedAt: serverTimestamp(),
                lastActive: serverTimestamp()
            };
            await setDoc(userDocRef, newUserProfile);
            return newUserProfile;
        }
    } catch (e) { return localState; }
};

export const saveCollectionToFirebase = async (tgId: number, spawnId: string, value: number, category?: HotspotCategory, tonReward: number = 0, captureLocation?: Coordinate, challenge?: any) => {
    if (!tgId) return;
    const fingerprint = await getCurrentFingerprint();
    try {
        await addDoc(collection(db, "claims"), {
            userId: tgId,
            spawnId,
            claimedValue: value,
            timestamp: serverTimestamp(),
            location: captureLocation || null,
            challenge: challenge || null,
            status: "pending_verification",
            initData: window.Telegram.WebApp.initData,
            fingerprint: fingerprint // Validare hardware
        });
    } catch (e) {}
};

export const requestAdRewardFirebase = async (tgId: number, rewardValue: number) => {
    const fingerprint = await getCurrentFingerprint();
    await addDoc(collection(db, "ad_claims"), {
        userId: tgId,
        rewardValue,
        timestamp: serverTimestamp(),
        initData: window.Telegram.WebApp.initData,
        fingerprint: fingerprint // Validare hardware
    });
};

// Added missing processReferralReward function required by App.tsx
export const processReferralReward = async (referrerId: string, newUserId: number, newUserName: string) => {
    try {
        await addDoc(collection(db, "referrals"), {
            referrerId,
            referredId: newUserId,
            referredName: newUserName,
            timestamp: serverTimestamp(),
            status: "pending_validation"
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
export const resetUserInFirebase = async (id: number) => updateDoc(doc(db, "users", id.toString()), { balance: 0, collectedIds: [] });
export const processWithdrawTON = async (tgId: number, amount: number) => {
    const fingerprint = await getCurrentFingerprint();
    await addDoc(collection(db, "withdrawal_requests"), { 
        userId: tgId, 
        amount, 
        status: "pending", 
        timestamp: serverTimestamp(), 
        initData: window.Telegram.WebApp.initData,
        fingerprint: fingerprint 
    });
    return true;
};
export const getAllUsersAdmin = async () => (await getDocs(collection(db, "users"))).docs.map(d => ({id: d.id, ...d.data()}));
