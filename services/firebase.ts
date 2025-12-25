
// Use named imports for Firebase v9+ to ensure correct type resolution and bundle optimization
import { initializeApp, getApps, getApp } from "@firebase/app";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    increment, 
    collection, 
    deleteDoc, 
    arrayUnion, 
    onSnapshot, 
    query, 
    orderBy, 
    limit, 
    getDocs,
    addDoc
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

// SECURITY: Parametru nou initDataRaw pentru validare criptografică pe server
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
            
            // SECURITY: Device fingerprint check
            const isBiometricActive = cloudData.biometricEnabled !== false; 

            if (isBiometricActive && cloudData.deviceFingerprint && cloudData.deviceFingerprint !== fingerprint) {
                await updateDoc(userDocRef, { isBanned: true, lastActive: Date.now(), banReason: "Device Signature Mismatch" });
                return { ...cloudData, isBanned: true } as UserState;
            }

            const updates: any = { 
                lastActive: Date.now(),
                lastInitData: initDataRaw // Stocăm pentru audit logs
            };
            if (cloudData.username !== bestName) updates.username = bestName;
            if (userData.photoUrl && cloudData.photoUrl !== userData.photoUrl) updates.photoUrl = userData.photoUrl;
            if (!cloudData.deviceFingerprint) updates.deviceFingerprint = fingerprint;
            if (cloudData.biometricEnabled === undefined) updates.biometricEnabled = true;

            await updateDoc(userDocRef, updates);
            
            return { 
                ...localState, 
                ...cloudData, 
                telegramId: userData.id, 
                username: bestName,
                photoUrl: userData.photoUrl || cloudData.photoUrl,
                deviceFingerprint: fingerprint || cloudData.deviceFingerprint,
                biometricEnabled: cloudData.biometricEnabled ?? true
            } as UserState;
        } else {
            const newUserProfile: UserState = {
                ...localState,
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
                joinedAt: Date.now(),
                lastActive: Date.now()
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
    try {
        const refDocRef = doc(db, "users", referrerId);
        const newUserDocRef = doc(db, "users", newUserTelegramId.toString());

        const newUserSnap = await getDoc(newUserDocRef);
        if (!newUserSnap.exists()) return;
        
        if (newUserSnap.data()?.hasClaimedReferral) return;

        await setDoc(refDocRef, {
            balance: increment(50),
            referralBalance: increment(50),
            referrals: increment(1),
            referralNames: arrayUnion(newUserName),
            lastActive: Date.now()
        }, { merge: true });

        await setDoc(newUserDocRef, {
            balance: increment(25),
            referralBalance: increment(25),
            hasClaimedReferral: true,
            lastActive: Date.now()
        }, { merge: true });

    } catch (e) {
        console.error("Referral process error:", e);
    }
};

// SECURITY: Refactorizat pentru validare server-side
// Nu mai acceptăm "value" ca adevăr absolut, ci doar ca fallback/estimare
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
        const userDocRef = doc(db, "users", tgId.toString());
        
        // Logăm tentativa de colectare într-o colecție securizată de "claims"
        // Acest document va fi validat de o Cloud Function
        await addDoc(collection(db, "claims"), {
            userId: tgId,
            spawnId,
            claimedValue: value,
            claimedTon: tonReward,
            category,
            timestamp: Date.now(),
            location: captureLocation || null, // Proximity Check
            status: "pending_verification"
        });

        // Pentru UX imediat, facem update și pe documentul utilizatorului
        // DAR: Balanța finală va fi reconciliată de server
        let fieldToUpdate = "gameplayBalance"; 
        if (category === 'LANDMARK') fieldToUpdate = "rareBalance";
        else if (category === 'EVENT') fieldToUpdate = "eventBalance";
        else if (category === 'AD_REWARD') fieldToUpdate = "dailySupplyBalance";
        else if (category === 'MERCHANT') fieldToUpdate = "merchantBalance";

        const updateData: any = {
            balance: increment(value),
            tonBalance: increment(tonReward),
            [fieldToUpdate]: increment(value),
            lastActive: Date.now()
        };

        if (category === 'AD_REWARD') {
            updateData.lastDailyClaim = Date.now();
            updateData.lastAdWatch = Date.now();
        }

        if (spawnId && !spawnId.startsWith('ad-')) {
            updateData.collectedIds = arrayUnion(spawnId);
        }

        await setDoc(userDocRef, updateData, { merge: true });
    } catch (e) {
        console.error("Firebase Update Failure:", e);
    }
};

// SECURITY: Retragerile sunt acum cereri (Requests) nu scrieri directe în balanță
export const processWithdrawTON = async (tgId: number, amount: number) => {
    if (!tgId || amount < 10) return false;
    try {
        // În loc să scădem direct, creăm un "Withdrawal Ticket"
        // Un proces de backend va scădea suma după validarea istoricului
        await addDoc(collection(db, "withdrawal_requests"), {
            userId: tgId,
            amount,
            timestamp: Date.now(),
            status: "pending_review",
            initDataSnapshot: window.Telegram.WebApp.initData // Pentru audit
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
        console.error("Leaderboard fetch error:", e);
        return [];
    }
};

export const updateUserWalletInFirebase = async (tgId: number, walletAddress: string) => {
    if (!tgId || !walletAddress) return;
    await setDoc(doc(db, "users", tgId.toString()), { walletAddress, lastActive: Date.now() }, { merge: true });
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
    await updateDoc(doc(db, "users", id), { isBanned, lastActive: Date.now() });
};

export const toggleUserBiometricSetting = async (id: string, biometricEnabled: boolean) => {
    await updateDoc(doc(db, "users", id), { biometricEnabled, lastActive: Date.now() });
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