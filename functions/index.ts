import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();

const ADMIN_TELEGRAM_ID = 7319782429;

/**
 * PROTOCOL NUCLEAR RESET - ADMIN ONLY
 */
export const resetUserProtocol = onCall(async (request) => {
    const { targetUserId, fingerprint, cloudUuid } = request.data || {};
    if (!targetUserId) throw new HttpsError('invalid-argument', 'Missing targetUserId');

    const idStr = targetUserId.toString();
    if (parseInt(idStr) !== ADMIN_TELEGRAM_ID) {
        throw new HttpsError('permission-denied', 'Restricted to System Administrator');
    }

    try {
        const resetPayload = {
            balance: 0,
            tonBalance: 0,
            gameplayBalance: 0,
            rareBalance: 0,
            eventBalance: 0,
            dailySupplyBalance: 0,
            merchantBalance: 0,
            referralBalance: 0,
            collectedIds: [],
            referralNames: [],
            hasClaimedReferral: false,
            lastAdWatch: 0,
            lastDailyClaim: 0,
            adsWatched: 0,
            sponsoredAdsWatched: 0,
            rareItemsCollected: 0,
            eventItemsCollected: 0,
            referrals: 0,
            deviceFingerprint: fingerprint || FieldValue.delete(), 
            cloudStorageId: cloudUuid || FieldValue.delete(),
            lastActive: FieldValue.serverTimestamp()
        };

        await db.collection('users').doc(idStr).set(resetPayload, { merge: true });

        const purgeHistory = async (col: string, field: string) => {
            const snap = await db.collection(col).where(field, 'in', [idStr, parseInt(idStr)]).get();
            if (snap.empty) return;
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        };

        await purgeHistory('claims', 'userId');
        await purgeHistory('ad_claims', 'userId');
        await purgeHistory('referral_claims', 'referrerId');

        return { success: true, message: "ADMIN_IDENTITY_PURGED" };
    } catch (e: any) {
        throw new HttpsError('internal', e.message);
    }
});

/**
 * TRIGGER: Procesare monede colectate (MAP/HUNT/GIFTBOX/ADS)
 * REZOLVARE: Alocă punctele și actualizează balanța automat.
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    const userIdStr = claim.userId.toString();
    const userRef = db.collection('users').doc(userIdStr);
    
    const value = Number(claim.claimedValue || 0);
    const tonValue = Number(claim.tonReward || 0);

    const updates: any = {
        telegramId: Number(claim.userId),
        balance: FieldValue.increment(value),
        tonBalance: FieldValue.increment(tonValue),
        lastActive: FieldValue.serverTimestamp()
    };

    if (claim.spawnId && !claim.spawnId.startsWith('ad-')) {
        updates.collectedIds = FieldValue.arrayUnion(claim.spawnId);
    }

    switch (claim.category) {
        case 'URBAN': 
        case 'MALL': 
            updates.gameplayBalance = FieldValue.increment(value); 
            break;
        case 'LANDMARK': 
            updates.rareBalance = FieldValue.increment(value); 
            updates.rareItemsCollected = FieldValue.increment(1);
            break;
        case 'EVENT': 
            updates.eventBalance = FieldValue.increment(value); 
            updates.eventItemsCollected = FieldValue.increment(1);
            break;
        case 'MERCHANT': 
            updates.merchantBalance = FieldValue.increment(value); 
            updates.sponsoredAdsWatched = FieldValue.increment(1);
            break;
        case 'GIFTBOX':
            updates.gameplayBalance = FieldValue.increment(value);
            break;
        case 'AD_REWARD':
            updates.dailySupplyBalance = FieldValue.increment(value);
            updates.adsWatched = FieldValue.increment(1);
            updates.lastDailyClaim = Date.now();
            break;
    }

    try {
        await userRef.set(updates, { merge: true });
        await snap.ref.update({ 
            status: 'verified', 
            processedAt: FieldValue.serverTimestamp() 
        });
    } catch (err) {
        console.error("Critical Trigger Failure:", err);
    }
});

/**
 * TRIGGER: Procesare recompense RECLAME dedicate
 */
export const onAdClaimCreated = onDocumentCreated('ad_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const userIdStr = claim.userId.toString();
    const userRef = db.collection('users').doc(userIdStr);
    
    const value = Number(claim.rewardValue || 0);

    await userRef.set({
        telegramId: Number(claim.userId),
        balance: FieldValue.increment(value),
        dailySupplyBalance: FieldValue.increment(value),
        adsWatched: FieldValue.increment(1),
        lastDailyClaim: Date.now(),
        lastActive: FieldValue.serverTimestamp()
    }, { merge: true });
    
    await snap.ref.update({ status: 'processed' });
});

export const chatWithELZR = onCall(async (request) => {
    const { data } = request;
    if (!process.env.API_KEY) throw new HttpsError('failed-precondition', 'AI Node Disconnected');
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: data.messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text.substring(0, 500) }] })),
        config: { systemInstruction: "You are ELZR System Scout.", temperature: 0.7 }
    });
    return { text: response.text };
});