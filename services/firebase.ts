
import { initializeApp, getApps, getApp } from "@firebase/app";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    collection, 
    deleteDoc, 
    arrayUnion, 
    onSnapshot, 
    query, 
    orderBy, 
    limit, 
    getDocs,
    addDoc,
    serverTimestamp
} from "@firebase/firestore";

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
    if (!bestName) bestName = userData.username;
    if (!bestName) bestName = `Hunter_${userData.id.toString().slice(-4)}`;

    try {
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const cloudData = userDoc.data() as UserState;
            
            if (cloudData.biometricEnabled !== false && cloudData.deviceFingerprint && cloudData.deviceFingerprint !== fingerprint) {
                await updateDoc(userDocRef, { isBanned: true, lastActive: serverTimestamp(), banReason: "Device Signature Mismatch" });
                return { ...cloudData, isBanned: true } as UserState;
            }

            const updates: any = { 
                lastActive: serverTimestamp(),
                lastInitData: initDataRaw
            };
            if (cloudData.username !== bestName) updates.username = bestName;
            if (userData.photoUrl && cloudData.photoUrl !== userData.photoUrl) updates.photoUrl = userData.photoUrl;
            if (!cloudData.deviceFingerprint) updates.deviceFingerprint = fingerprint;

            await updateDoc(userDocRef, updates);
            
            return { 
                ...localState, 
                ...cloudData, 
                telegramId: userData.id, 
                username: bestName,
                photoUrl: userData.photoUrl || cloudData.photoUrl,
                deviceFingerprint: fingerprint || cloudData.deviceFingerprint
            } as UserState;
        } else {
            const newUserProfile: any = {
                telegramId: userData.id,
                username: bestName,
                photoUrl: userData.photoUrl || '',
                deviceFingerprint: fingerprint,
                lastInitData: initDataRaw,
                isBanned: false,
                biometricEnabled: true,
                balance: 0,
                tonBalance: 0,
                gameplayBalance: 0,
                rareBalance: 0,
                eventBalance: 0,
                dailySupplyBalance: 0,
                merchantBalance: 0,
                referralBalance: 0,
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
        console.error("Firebase Sync Error:", e);
        return { ...localState, telegramId: userData.id, username: bestName };
    }
};

export const processReferralReward = async (referrerId: string, newUserTelegramId: number, newUserName: string) => {
    // SECURITY: Referalii sunt acum cereri de tip 'referral_claim' care vor fi procesate de server
    // Nu mai incrementăm direct balanța pentru a preveni "sybil attacks" din client
    try {
        await addDoc(collection(db, "referral_claims"), {
            referrerId,
            newUserId: newUserTelegramId,
            newUserName,
            timestamp: serverTimestamp(),
            status: "pending"
        });
    } catch (e) {
        console.error("Referral log error:", e);
    }
};

export const saveCollectionToFirebase = async (
    tgId: number, 
    spawnId: string, 
    value: number, 
    category?: HotspotCategory, 
    tonReward: number = 0,
    captureLocation?: Coordinate
) => {
    if (!tgId) return;
    try {
        // SECURITY: ACUM TRIMITEM DOAR CEREREA (CLAIM)
        // Balanța se va actualiza DOAR când o Cloud Function verifică acest document.
        await addDoc(collection(db, "claims"), {
            userId: tgId,
            spawnId,
            claimedValue: value,
            claimedTon: tonReward,
            category,
            timestamp: serverTimestamp(),
            location: captureLocation || null,
            status: "pending_verification",
            deviceTime: Date.now() // Doar pentru debug comparativ
        });

        // Marcam moneda ca fiind colectată local în documentul user-ului
        // (Regulile permit actualizarea array-ului de ID-uri, dar nu și balanța)
        const userDocRef = doc(db, "users", tgId.toString());
        if (spawnId && !spawnId.startsWith('ad-')) {
            await updateDoc(userDocRef, {
                collectedIds: arrayUnion(spawnId),
                lastActive: serverTimestamp()
            });
        }
    } catch (e) {
        console.error("Firebase Claim Submission Failed:", e);
    }
};

export const processWithdrawTON = async (tgId: number, amount: number) => {
    if (!tgId || amount < 10) return false;
    try {
        await addDoc(collection(db, "withdrawal_requests"), {
            userId: tgId,
            amount,
            timestamp: serverTimestamp(),
            status: "pending_review",
            initDataSnapshot: window.Telegram.WebApp.initData
        });
        return true;
    } catch (e) {
        console.error("Withdrawal error:", e);
        return false;
    }
};

export const getLeaderboard = async () => {
    try {
        const q = query(collection(db, "users"), orderBy("balance", "desc"), limit(50));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((docSnap, index) => {
            const data = docSnap.data();
            return {
                rank: index + 1,
                username: data.username || `Hunter_${docSnap.id.slice(-4)}`,
                score: data.balance || 0
            };
        });
    } catch (e) {
        return [];
    }
};

export const updateUserWalletInFirebase = async (tgId: number, walletAddress: string) => {
    if (!tgId || !walletAddress) return;
    await updateDoc(doc(db, "users", tgId.toString()), { walletAddress, lastActive: serverTimestamp() });
};

export const resetUserInFirebase = async (tgId: number) => {
    if (!tgId) return;
    await deleteDoc(doc(db, "users", tgId.toString()));
};

export const getAllUsersAdmin = async () => {
    const snapshot = await getDocs(collection(db, "users"));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
};

export const deleteUserFirebase = async (id: string) => {
    await deleteDoc(doc(db, "users", id));
};

export const toggleUserBan = async (id: string, isBanned: boolean) => {
    await updateDoc(doc(db, "users", id), { isBanned, lastActive: serverTimestamp() });
};

export const toggleUserBiometricSetting = async (id: string, biometricEnabled: boolean) => {
    await updateDoc(doc(db, "users", id), { biometricEnabled, lastActive: serverTimestamp() });
};

export const subscribeToCampaigns = (callback: (campaigns: Campaign[]) => void) => {
    return onSnapshot(collection(db, "campaigns"), (snapshot) => {
        const campaigns = snapshot.docs.map(doc => doc.data() as Campaign);
        callback(campaigns);
    });
};

export const createCampaignFirebase = async (campaign: Campaign) => {
    await setDoc(doc(db, "campaigns", campaign.id), campaign);
};

export const updateCampaignStatusFirebase = async (id: string, status: string) => {
    await updateDoc(doc(db, "campaigns", id), { "data.status": status });
};

export const deleteCampaignFirebase = async (id: string) => {
    await deleteDoc(doc(db, "campaigns", id));
};

export const subscribeToHotspots = (callback: (hotspots: HotspotDefinition[]) => void) => {
    return onSnapshot(collection(db, "hotspots"), (snapshot) => {
        const hotspots = snapshot.docs.map(doc => doc.data() as HotspotDefinition);
        callback(hotspots);
    });
};

export const saveHotspotFirebase = async (hotspot: HotspotDefinition) => {
    await setDoc(doc(db, "hotspots", hotspot.id), hotspot);
};

export const deleteHotspotFirebase = async (id: string) => {
    await deleteDoc(doc(db, "hotspots", id));
};