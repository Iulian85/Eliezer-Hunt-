
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();

/**
 * FUNCȚIE AJUTĂTOARE PENTRU ȘTERGERE MASIVĂ (SAFE BATCH)
 */
async function deleteQueryBatch(query: any) {
    const snapshot = await query.get();
    if (snapshot.empty) return;

    const batchSize = 400; // Limita Firebase e 500, folosim 400 pt siguranță
    const docs = snapshot.docs;
    
    for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach((doc: any) => batch.delete(doc.ref));
        await batch.commit();
    }
}

/**
 * PROTOCOL RESET BALANȚĂ (SAFE FOR ADMIN)
 */
export const resetUserProtocol = onCall(async (request) => {
    const targetUserId = request.data?.targetUserId;
    if (!targetUserId) throw new HttpsError('invalid-argument', 'ID utilizator lipsă.');

    const idStr = targetUserId.toString();
    const idNum = parseInt(idStr);

    try {
        console.log(`[RESET] Hunter vizat: ${idStr}`);
        const userRef = db.collection('users').doc(idStr);
        
        // 1. Resetăm PROFILUL (Balanța la zero) - Operațiune atomică
        await userRef.set({
            balance: 0,
            tonBalance: 0,
            gameplayBalance: 0,
            rareBalance: 0,
            eventBalance: 0,
            dailySupplyBalance: 0,
            merchantBalance: 0,
            referralBalance: 0,
            adsWatched: 0,
            sponsoredAdsWatched: 0,
            rareItemsCollected: 0,
            eventItemsCollected: 0,
            collectedIds: [],
            referrals: 0,
            referralNames: [],
            hasClaimedReferral: false,
            lastDailyClaim: 0,
            lastActive: FieldValue.serverTimestamp()
        }, { merge: true });

        // 2. CURĂȚĂM ISTORICUL (Ștergere în calupuri sigure)
        
        // Claims simple (unde ești tu userId)
        await deleteQueryBatch(db.collection('claims').where('userId', '==', idStr));
        await deleteQueryBatch(db.collection('claims').where('userId', '==', idNum));
        
        // Ad Claims
        await deleteQueryBatch(db.collection('ad_claims').where('userId', '==', idStr));
        await deleteQueryBatch(db.collection('ad_claims').where('userId', '==', idNum));

        // Referali (Trebuie șterse ambele direcții: cine te-a adus și pe cine ai adus)
        await deleteQueryBatch(db.collection('referral_claims').where('referrerId', '==', idStr));
        await deleteQueryBatch(db.collection('referral_claims').where('referredId', '==', idStr));
        
        // Cereri de retragere
        await deleteQueryBatch(db.collection('withdrawal_requests').where('userId', '==', idStr));

        console.log(`[RESET COMPLETE] Hunter ${idStr} a fost adus la zero.`);
        return { success: true };

    } catch (e: any) {
        console.error("CRITICAL RESET ERROR:", e);
        throw new HttpsError('internal', `Eroare server: ${e.message}`);
    }
});

/**
 * TRIGGER: Procesare referali (FRENS)
 */
export const onReferralClaimCreated = onDocumentCreated('referral_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    const referrerId = claim.referrerId.toString();
    const referredId = claim.referredId.toString();
    const referredName = claim.referredName || "New Hunter";

    try {
        const batch = db.batch();
        const referrerRef = db.collection('users').doc(referrerId);
        batch.set(referrerRef, {
            balance: FieldValue.increment(50),
            referralBalance: FieldValue.increment(50),
            referrals: FieldValue.increment(1),
            referralNames: FieldValue.arrayUnion(referredName),
            lastActive: FieldValue.serverTimestamp()
        }, { merge: true });

        const referredRef = db.collection('users').doc(referredId);
        batch.set(referredRef, {
            balance: FieldValue.increment(25),
            gameplayBalance: FieldValue.increment(25),
            hasClaimedReferral: true,
            lastActive: FieldValue.serverTimestamp()
        }, { merge: true });

        await batch.commit();
        await snap.ref.update({ status: 'processed', processedAt: FieldValue.serverTimestamp() });
    } catch (err) {
        console.error("[Frens Engine] Error:", err);
    }
});

/**
 * TRIGGER: Procesare monede colectate
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const userIdStr = claim.userId.toString();
    const userRef = db.collection('users').doc(userIdStr);
    
    try {
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

        const cat = claim.category;
        if (cat === 'URBAN' || cat === 'MALL' || cat === 'GIFTBOX') updates.gameplayBalance = FieldValue.increment(value);
        else if (cat === 'LANDMARK') updates.rareBalance = FieldValue.increment(value);
        else if (cat === 'EVENT') updates.eventBalance = FieldValue.increment(value);
        else if (cat === 'MERCHANT') updates.merchantBalance = FieldValue.increment(value);
        else if (cat === 'AD_REWARD') {
            updates.dailySupplyBalance = FieldValue.increment(value);
            updates.adsWatched = FieldValue.increment(1);
            updates.lastDailyClaim = Date.now();
        }

        await userRef.set(updates, { merge: true });
        await snap.ref.update({ status: 'verified', processedAt: FieldValue.serverTimestamp() });
    } catch (err) { console.error("Trigger Error:", err); }
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
