
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

// Proxy pentru Gemini AI (Rulează pe server, cheia este ascunsă)
export const askGeminiProxy = async (messages: any[]) => {
    const chatFunc = httpsCallable(functions, 'chatWithELZR');
    const result = await chatFunc({ 
        messages, 
        initData: window.Telegram.WebApp.initData 
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
    initDataRaw?: string
): Promise<UserState> => {
    if (!userData.id) return localState;

    const userDocRef = doc(db, "users", userData.id.toString());
    let bestName = [userData.firstName, userData.lastName].filter(Boolean).join(' ');
    if (!bestName) bestName = userData.username || `Hunter_${userData.id.toString().slice(-4)}`;

    try {
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            const cloudData = userDoc.data() as any;
            
            // Verificare amprentă dispozitiv
            if (cloudData.biometricEnabled !== false && cloudData.deviceFingerprint && cloudData.deviceFingerprint !== fingerprint) {
                await updateDoc(userDocRef, { 
                    suspiciousActivityCount: increment(1),
                    lastSuspiciousAccess: serverTimestamp()
                });
            }

            await updateDoc(userDocRef, { 
                lastActive: serverTimestamp(),
                lastInitData: initDataRaw
            });
            
            return { ...localState, ...cloudData, telegramId: userData.id };
        } else {
            const newUserProfile: any = {
                telegramId: userData.id,
                username: bestName,
                photoUrl: userData.photoUrl || '',
                deviceFingerprint: fingerprint,
                lastInitData: initDataRaw,
                isBanned: false,
                balance: 0,
                tonBalance: 0,
                referrals: 0,
                referralNames: [],
                collectedIds: [],
                joinedAt: serverTimestamp(),
                lastActive: serverTimestamp()
            };
            await setDoc(userDocRef, newUserProfile);
            return newUserProfile;
        }
    } catch (e) {
        return localState;
    }
};

export const saveCollectionToFirebase = async (
    tgId: number, 
    spawnId: string, 
    value: number, 
    category?: HotspotCategory, 
    tonReward: number = 0,
    captureLocation?: Coordinate,
    verificationChallenge?: any
) => {
    if (!tgId) return;
    try {
        // SECURITY: Trimitem DOAR cererea de claim. 
        // Balanța se va actualiza doar dacă serverul aprobă acest document.
        await addDoc(collection(db, "claims"), {
            userId: tgId,
            spawnId,
            claimedValue: value,
            claimedTon: tonReward,
            category,
            timestamp: serverTimestamp(),
            location: captureLocation || null,
            status: "pending_verification",
            challenge: verificationChallenge || null,
            initData: window.Telegram.WebApp.initData // Semnătura pentru verificare HMAC
        });
    } catch (e) {
        console.error("Claim failed");
    }
};

export const processReferralReward = async (referrerId: string, inviteeId: number, inviteeName: string) => {
    // SECURITY: Adăugăm o cerere de referral. Serverul va verifica dacă inviteeId este un user real nou.
    await addDoc(collection(db, "referral_claims"), {
        referrerId,
        inviteeId,
        inviteeName,
        status: "pending",
        initData: window.Telegram.WebApp.initData,
        timestamp: serverTimestamp()
    });
};

export const getLeaderboard = async () => {
    try {
        const q = query(collection(db, "users"), orderBy("balance", "desc"), limit(50));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((docSnap, index) => ({
            rank: index + 1,
            username: docSnap.data().username || "Hunter",
            score: docSnap.data().balance || 0
        }));
    } catch (e) {
        return [];
    }
};

// Fix: Added missing deleteDoc implementation for hotspot, user and campaign deletion
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
export const getAllUsersAdmin = async () => (await getDocs(collection(db, "users"))).docs.map(d => ({id: d.id, ...d.data()}));

// Fix: Added missing processWithdrawTON export
export const processWithdrawTON = async (tgId: number, amount: number) => {
    if (!tgId) return false;
    try {
        await addDoc(collection(db, "withdrawals"), {
            userId: tgId,
            amount,
            status: "pending",
            timestamp: serverTimestamp(),
            initData: window.Telegram.WebApp.initData
        });
        return true;
    } catch (e) {
        console.error("Withdrawal request failed", e);
        return false;
    }
};
