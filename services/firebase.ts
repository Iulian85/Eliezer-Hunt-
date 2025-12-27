
import { initializeApp, getApps, getApp } from "@firebase/app";
import { 
    getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, orderBy, limit, getDocs,
    serverTimestamp, increment, deleteDoc, arrayUnion, addDoc
} from "@firebase/firestore";
import { getFunctions, httpsCallable } from "@firebase/functions";
import { UserState, HotspotCategory } from "../types";

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

export const syncUserWithFirebase = async (userData: any, localState: UserState, fingerprint: string): Promise<UserState> => {
    if (!userData.id) return localState;
    const userIdStr = String(userData.id);
    const userDocRef = doc(db, "users", userIdStr);
    
    try {
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            await updateDoc(userDocRef, { 
                deviceFingerprint: fingerprint, 
                lastActive: serverTimestamp(),
                photoUrl: userData.photoUrl || ''
            });
            return sanitizeUserData(userDoc.data(), localState);
        } else {
            const newUser: any = { 
                telegramId: Number(userData.id), 
                username: userData.username || `Hunter_${userIdStr.slice(-4)}`, 
                photoUrl: userData.photoUrl || '', 
                deviceFingerprint: fingerprint, 
                joinedAt: serverTimestamp(), 
                lastActive: serverTimestamp(),
                balance: 0, tonBalance: 0, gameplayBalance: 0, rareBalance: 0, eventBalance: 0, dailySupplyBalance: 0, merchantBalance: 0, referralBalance: 0,
                collectedIds: [], biometricEnabled: true
            };
            await setDoc(userDocRef, newUser, { merge: true });
            return newUser;
        }
    } catch (e) { return localState; }
};

/**
 * RECOMPENSĂ INSTANTĂ (Sistem Securizat)
 * Am eliminat addDoc-ul care bloca punctele în "pending".
 */
export const saveCollectionToFirebase = async (tgId: number, spawnId: string, value: number, category?: HotspotCategory, tonReward: number = 0) => {
    if (!tgId) return;
    try {
        const secureClaimFunc = httpsCallable(functions, 'secureClaim');
        // Trimitem totul la server. Serverul va face update-ul atomic.
        await secureClaimFunc({ 
            userId: tgId, 
            spawnId, 
            category, 
            claimedValue: value, 
            tonReward 
        });
    } catch (e) {
        console.error("Cloud Function Claim Failed:", e);
        // Dacă eșuează funcția, nu mai scriem nimic în Firestore de pe client
        // pentru a evita documentele "pending" orfane.
    }
};

export const processReferralReward = async (referrerId: string, userId: number, userName: string) => {
    try {
        const referralFunc = httpsCallable(functions, 'secureReferral');
        await referralFunc({ referrerId, userId, userName });
    } catch (e) { console.error("Referral Error:", e); }
};

export const askGeminiProxy = async (messages: any[]) => {
    try {
        const chatFunc = httpsCallable(functions, 'chatWithELZR');
        const res: any = await chatFunc({ messages });
        return res.data;
    } catch (e) { return { text: "Proxy offline." }; }
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

export const resetUserInFirebase = async (targetUserId: number) => {
    const userRef = doc(db, "users", String(targetUserId));
    await updateDoc(userRef, { balance: 0, tonBalance: 0, gameplayBalance: 0, rareBalance: 0, eventBalance: 0, dailySupplyBalance: 0, merchantBalance: 0, referralBalance: 0, collectedIds: [] });
    return { success: true };
};

export const subscribeToCampaigns = (cb: any) => onSnapshot(collection(db, "campaigns"), snap => cb(snap.docs.map(d => ({id: d.id, ...d.data()}))));
export const subscribeToHotspots = (cb: any) => onSnapshot(collection(db, "hotspots"), snap => cb(snap.docs.map(d => d.data())));
export const subscribeToWithdrawalRequests = (cb: (reqs: any[]) => void) => onSnapshot(query(collection(db, "withdrawal_requests"), orderBy("timestamp", "desc")), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
export const updateWithdrawalStatus = async (id: string, status: string) => updateDoc(doc(db, "withdrawal_requests", id), { status, processedAt: serverTimestamp() });
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
export const markUserAirdropped = async (id: string, allocation: number) => {
    await updateDoc(doc(db, "users", String(id)), { isAirdropped: true, airdropAllocation: allocation, airdropTimestamp: serverTimestamp() });
    return true;
};
