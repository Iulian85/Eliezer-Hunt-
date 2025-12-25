
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
    serverTimestamp,
    increment
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
            const cloudData = userDoc.data() as any;
            
            // SECURITY: Detectare activitate suspectă (Multi-dispozitiv)
            if (cloudData.biometricEnabled !== false && cloudData.deviceFingerprint && cloudData.deviceFingerprint !== fingerprint) {
                await updateDoc(userDocRef, { 
                    suspiciousActivityCount: increment(1),
                    lastSuspiciousAccess: serverTimestamp(),
                    lastInitData: initDataRaw
                });
                
                // Dacă sunt prea multe tentative, auto-ban
                if ((cloudData.suspiciousActivityCount || 0) >= 3) {
                    await updateDoc(userDocRef, { isBanned: true, banReason: "Security Threshold Exceeded" });
                    return { ...cloudData, isBanned: true } as UserState;
                }
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
                suspiciousActivityCount: 0,
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

// Fix: Implemented missing processReferralReward function for App.tsx consumption
export const processReferralReward = async (referrerId: string, inviteeId: number, inviteeName: string) => {
    if (!referrerId || !inviteeId) return;
    try {
        const referrerRef = doc(db, "users", referrerId);
        const inviteeRef = doc(db, "users", inviteeId.toString());

        // Credit referrer with points and update stats
        await updateDoc(referrerRef, {
            referrals: increment(1),
            referralBalance: increment(50),
            balance: increment(50),
            referralNames: arrayUnion(inviteeName),
            lastActive: serverTimestamp()
        });

        // Mark the invitee as reward-claimed to prevent duplicate processing
        await updateDoc(inviteeRef, {
            hasClaimedReferral: true,
            lastActive: serverTimestamp()
        });
    } catch (e) {
        console.error("Firebase Referral processing failed:", e);
    }
};

export const saveCollectionToFirebase = async (
    tgId: number, 
    spawnId: string, 
    value: number, 
    category?: HotspotCategory, 
    tonReward: number = 0,
    captureLocation?: Coordinate,
    verificationChallenge?: any // New: challenge metadata
) => {
    if (!tgId) return;
    try {
        // SECURITY: Trimitem challenge-ul pentru verificare server-side (Anti-Bot)
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
            initDataSnapshot: window.Telegram.WebApp.initData
        });

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
                // SECURITY: Returnăm doar datele necesare pentru leaderboard
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
