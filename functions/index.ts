
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
 * PROTOCOL NUCLEAR RESET - ADMIN ONLY (7319782429)
 * Resetează balanțele la zero fără a șterge profilul.
 */
export const resetUserProtocol = onCall(async (request) => {
    const { targetUserId, fingerprint, cloudUuid } = request.data || {};

    if (!targetUserId) {
        throw new HttpsError('invalid-argument', 'Missing targetUserId');
    }

    const idStr = targetUserId.toString();
    const idNum = parseInt(idStr);

    // Securitate Hardcoded pentru Admin ID
    if (idNum !== ADMIN_TELEGRAM_ID) {
        throw new HttpsError('permission-denied', 'Protocol Restricted to System Administrator');
    }

    try {
        console.log(`[SYSTEM] Initiating Reset for Admin: ${idStr}`);

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
            // Înregistrăm noile date de identitate furnizate la reset
            deviceFingerprint: fingerprint || FieldValue.delete(), 
            cloudStorageId: cloudUuid || FieldValue.delete(),
            lastActive: FieldValue.serverTimestamp()
        };

        // Folosim SET MERGE pentru a evita eroarea "NOT_FOUND" sau "INTERNAL"
        await db.collection('users').doc(idStr).set(resetPayload, { merge: true });

        // Ștergere istoric Claims (Batch)
        const purgeHistory = async (col: string, field: string) => {
            const snap = await db.collection(col).where(field, 'in', [idStr, idNum]).get();
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
        console.error("FATAL RESET ERROR:", e);
        throw new HttpsError('internal', e.message);
    }
});

/**
 * TRIGGER: Procesare monede colectate (MAP/HUNT)
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const userRef = db.collection('users').doc(claim.userId.toString());
    
    const userDoc = await userRef.get();
    if (!userDoc.exists) return;

    const updates: any = {
        balance: FieldValue.increment(claim.claimedValue || 0),
        tonBalance: FieldValue.increment(claim.tonReward || 0),
        collectedIds: FieldValue.arrayUnion(claim.spawnId),
        lastActive: FieldValue.serverTimestamp()
    };

    switch (claim.category) {
        case 'URBAN': case 'MALL': updates.gameplayBalance = FieldValue.increment(claim.claimedValue || 0); break;
        case 'LANDMARK': updates.rareBalance = FieldValue.increment(claim.claimedValue || 0); break;
        case 'EVENT': updates.eventBalance = FieldValue.increment(claim.claimedValue || 0); break;
        case 'MERCHANT': updates.merchantBalance = FieldValue.increment(claim.claimedValue || 0); break;
    }

    await userRef.update(updates);
    await snap.ref.update({ status: 'verified' });
});

/**
 * TRIGGER: Procesare recompense RECLAME (Daily / Adsgram)
 * Rezolvă problema punctelor care nu apăreau după vizualizarea reclamelor.
 */
export const onAdClaimCreated = onDocumentCreated('ad_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const userRef = db.collection('users').doc(claim.userId.toString());
    
    const userDoc = await userRef.get();
    if (!userDoc.exists) return;

    await userRef.update({
        balance: FieldValue.increment(claim.rewardValue || 0),
        dailySupplyBalance: FieldValue.increment(claim.rewardValue || 0),
        lastDailyClaim: Date.now(),
        lastActive: FieldValue.serverTimestamp()
    });
    
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
