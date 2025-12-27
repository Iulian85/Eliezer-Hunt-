
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
    serverTimestamp,
    increment,
    deleteDoc,
    arrayUnion
} from "@firebase/firestore";
import { getFunctions, httpsCallable } from "@firebase/functions";
import FingerprintJS from '@fingerprintjs/fingerprintjs';

import { UserState, HotspotCategory, Coordinate } from "../types";

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
            else { 
                const newUuid = crypto.randomUUID(); 
                tg.CloudStorage.setItem('elzr_uuid', newUuid, () => resolve(newUuid)); 
            }
        });
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
    });
};

// Fix: Updated syncUserWithFirebase signature to accept 5 arguments to match the call in App.tsx
export const syncUserWithFirebase = async (userData: any, localState: UserState, fingerprint: string, cloudId: string, initData?: string): Promise<UserState> => {
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
                photoUrl: userData.photoUrl || '',
                // Security: Store lastInitData for server-side verification if needed
                lastInitData: initData || ''
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
                lastActive: serverTimestamp(),
                lastInitData: initData || ''
            };
            await setDoc(userDocRef, newUser);
            return newUser;
        }
    } catch (e) { return localState; }
};

export const saveCollectionToFirebase = async (tgId: number, spawnId: string, value: number, category?: HotspotCategory, tonReward: number = 0) => {
    if (!tgId) return;
    try {
        const secureClaimFunc = httpsCallable(functions, 'secureClaim');
        await secureClaimFunc({ 
            userId: Number(tgId), 
            spawnId: String(spawnId), 
            claimedValue: Number(value), 
            tonReward: Number(ton