
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ADMIN_WALLET = process.env.VITE_ADMIN_WALLET_ADDRESS || "";

async function validateAndCheckReplay(initData: string): Promise<boolean> {
    if (!initData || !BOT_TOKEN) return false;
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        const authDate = parseInt(urlParams.get('auth_date') || '0');
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 300) return false; 

        urlParams.delete('hash');
        const sortedParams = Array.from(urlParams.entries()).sort().map(([k, v]) => `${k}=${v}`).join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');
        if (hash !== calculatedHash) return false;

        const nonceHash = crypto.createHash('md5').update(initData).digest('hex');
        const nonceRef = db.collection('used_nonces').doc(nonceHash);
        const nonceDoc = await nonceRef.get();
        if (nonceDoc.exists) return false;

        await nonceRef.set({ usedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 3600000) });
        return true;
    } catch (e) { return false; }
}

async function verifyDeviceBinding(userId: string, incomingFingerprint: string, incomingCloudId: string): Promise<boolean> {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return true;
    const data = userDoc.data()!;
    if (data.deviceFingerprint && data.deviceFingerprint !== incomingFingerprint) return false;
    if (data.cloudStorageId && data.cloudStorageId !== incomingCloudId) return false;
    return true;
}

// Resetare securizată de pe Server
export const resetUserProtocol = onCall(async (request) => {
    const { data } = request;
    if (!(await validateAndCheckReplay(data.initData))) {
        throw new HttpsError('unauthenticated', 'Session Expired');
    }

    // Verificăm dacă cel care cere resetarea este autorizat
    const adminTgId = data.adminTgId.toString();
    const adminRef = db.collection('users').doc(adminTgId);
    const adminDoc = await adminRef.get();
    
    // Verificăm wallet-ul de admin (string comparison robust)
    const userWallet = (adminDoc.data()?.walletAddress || "").toLowerCase();
    const targetAdminWallet = ADMIN_WALLET.toLowerCase();

    if (!adminDoc.exists || userWallet !== targetAdminWallet || targetAdminWallet === "") {
        throw new HttpsError('permission-denied', `Unauthorized. Admin wallet mismatch. [${userWallet}] vs [${targetAdminWallet}]`);
    }

    const targetUserId = data.targetUserId.toString();
    const userRef = db.collection('users').doc(targetUserId);

    // Folosim set cu merge: false pentru a face WIPE total la balanțe, nu doar update
    await userRef.set({
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
        lastActive: FieldValue.serverTimestamp()
    }, { merge: true }); // Merge true dar forțăm valorile la 0

    return { success: true };
});

export const chatWithELZR = onCall(async (request) => {
    const { data } = request;
    if (!(await validateAndCheckReplay(data.initData))) {
        throw new HttpsError('unauthenticated', 'Session Expired');
    }
    const userData = JSON.parse(new URLSearchParams(data.initData).get('user') || '{}');
    const userId = userData.id?.toString();
    if (!userId) throw new HttpsError('internal', 'Invalid Identity');
    if (!(await verifyDeviceBinding(userId, data.fingerprint, data.cloudId))) {
        throw new HttpsError('permission-denied', 'SECURITY ALERT: Identity Mismatch.');
    }
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const lastChatReset = userDoc.data()?.lastChatReset || 0;
    const currentChatCount = userDoc.data()?.chatCount || 0;
    const isNewHour = (Date.now() - lastChatReset) > 3600000;
    if (!isNewHour && currentChatCount >= 20) {
        throw new HttpsError('resource-exhausted', 'Protocol overload.');
    }
    await userRef.update({
        chatCount: isNewHour ? 1 : FieldValue.increment(1),
        lastChatReset: isNewHour ? Date.now() : lastChatReset,
        lastActive: FieldValue.serverTimestamp()
    });
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: data.messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text.substring(0, 500) }] })),
        config: { systemInstruction: "You are ELZR System Scout. Be tactical.", temperature: 0.7 }
    });
    return { text: response.text };
});

export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    if (!(await validateAndCheckReplay(claim.initData))) {
        await snap.ref.update({ status: 'rejected', reason: 'Auth Failure' });
        return;
    }
    const userId = claim.userId.toString();
    if (!(await verifyDeviceBinding(userId, claim.fingerprint, claim.cloudId))) {
        await snap.ref.update({ status: 'rejected', reason: 'Identity Fraud' });
        return;
    }
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists || userDoc.data()?.isBanned) return;
    const hotspotId = claim.spawnId.split('-')[0];
    const hotspotSnap = await db.collection('hotspots').doc(hotspotId).get();
    let elzrReward = claim.claimedValue || 100;
    let tonReward = 0;
    let category = claim.category || 'URBAN';
    if (hotspotSnap.exists) {
        const hData = hotspotSnap.data()!;
        category = hData.category;
        if (category === 'GIFTBOX') {
            elzrReward = Math.min(elzrReward, 1000);
            if (claim.tonReward > 0) {
                const validPrizes = hData.prizes || [0.05, 0.5];
                if (validPrizes.includes(claim.tonReward)) {
                    tonReward = claim.tonReward;
                    elzrReward = 0;
                }
            }
        } else {
            elzrReward = hData.baseValue || elzrReward;
        }
    }
    await db.runTransaction(async (tx) => {
        const freshUser = await tx.get(userRef);
        const collected = freshUser.data()?.collectedIds || [];
        if (collected.includes(claim.spawnId)) {
            tx.update(snap.ref, { status: 'rejected', reason: 'Already collected' });
            return;
        }
        const updatePayload: any = {
            balance: FieldValue.increment(elzrReward),
            tonBalance: FieldValue.increment(tonReward),
            collectedIds: FieldValue.arrayUnion(claim.spawnId),
            lastActive: FieldValue.serverTimestamp()
        };
        if (category === 'LANDMARK') {
            updatePayload.rareBalance = FieldValue.increment(elzrReward);
            updatePayload.rareItemsCollected = FieldValue.increment(1);
        } else if (category === 'EVENT') {
            updatePayload.eventBalance = FieldValue.increment(elzrReward);
            updatePayload.eventItemsCollected = FieldValue.increment(1);
        } else if (category === 'MERCHANT') {
            updatePayload.merchantBalance = FieldValue.increment(elzrReward);
            updatePayload.sponsoredAdsWatched = FieldValue.increment(1);
        } else if (category === 'AD_REWARD') {
            updatePayload.dailySupplyBalance = FieldValue.increment(elzrReward);
        } else {
            updatePayload.gameplayBalance = FieldValue.increment(elzrReward);
        }
        tx.update(userRef, updatePayload);
        tx.update(snap.ref, { status: 'verified', finalElzr: elzrReward, finalTon: tonReward, verifiedAt: FieldValue.serverTimestamp() });
    });
});

export const onAdClaimCreated = onDocumentCreated('ad_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    if (!(await validateAndCheckReplay(claim.initData))) {
        await snap.ref.delete();
        return;
    }
    const userId = claim.userId.toString();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists || userDoc.data()?.isBanned) return;
    const reward = claim.rewardValue || 500;
    await userRef.update({
        balance: FieldValue.increment(reward),
        dailySupplyBalance: FieldValue.increment(reward),
        lastDailyClaim: Date.now(),
        lastActive: FieldValue.serverTimestamp()
    });
    await snap.ref.update({ status: 'processed' });
});
