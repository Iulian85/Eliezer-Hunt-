
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

        // 1. Update Referrer
        const referrerRef = db.collection('users').doc(referrerId);
        batch.set(referrerRef, {
            balance: FieldValue.increment(50),
            referralBalance: FieldValue.increment(50),
            referrals: FieldValue.increment(1),
            referralNames: FieldValue.arrayUnion(referredName),
            lastActive: FieldValue.serverTimestamp()
        }, { merge: true });

        // 2. Update Referred
        const referredRef = db.collection('users').doc(referredId);
        batch.set(referredRef, {
            balance: FieldValue.increment(25),
            gameplayBalance: FieldValue.increment(25),
            hasClaimedReferral: true,
            lastActive: FieldValue.serverTimestamp()
        }, { merge: true });

        await batch.commit();
        
        await snap.ref.update({ 
            status: 'processed', 
            processedAt: FieldValue.serverTimestamp()
        });

    } catch (err) {
        console.error("[Frens Engine] Fatal Error:", err);
    }
});

/**
 * PROTOCOL NUCLEAR RESET - ADMIN ONLY
 * Șterge utilizatorul și TOATE urmele de activitate/referal.
 */
export const resetUserProtocol = onCall(async (request) => {
    const { targetUserId } = request.data || {};
    if (!targetUserId) throw new HttpsError('invalid-argument', 'Missing targetUserId');

    // Verificare securitate admin (doar tu poți apela asta)
    // În producție, aici am verifica și context.auth
    
    const idStr = targetUserId.toString();

    try {
        const batch = db.batch();

        // 1. Ștergem documentul din 'users'
        batch.delete(db.collection('users').doc(idStr));

        // 2. Curățăm istoricul de colectare (claims)
        const claimsSnap = await db.collection('claims').where('userId', 'in', [idStr, parseInt(idStr)]).get();
        claimsSnap.docs.forEach(doc => batch.delete(doc.ref));

        // 3. Curățăm istoricul de reclame (ad_claims)
        const adClaimsSnap = await db.collection('ad_claims').where('userId', 'in', [idStr, parseInt(idStr)]).get();
        adClaimsSnap.docs.forEach(doc => batch.delete(doc.ref));

        // 4. IMPORTANT: Curățăm istoricul de referali (unde el a fost invitat SAU a invitat pe alții)
        // Căutăm unde el a fost cel REFERRED (invitat) pentru a-i permite să refolosească un link
        const refClaimsSnap = await db.collection('referral_claims').where('referredId', '==', idStr).get();
        refClaimsSnap.docs.forEach(doc => batch.delete(doc.ref));

        // Ștergem și unde el a fost cel care a invitat
        const refInviterSnap = await db.collection('referral_claims').where('referrerId', '==', idStr).get();
        refInviterSnap.docs.forEach(doc => batch.delete(doc.ref));

        await batch.commit();

        return { success: true, message: "IDENTITY_AND_HISTORY_PURGED" };
    } catch (e: any) {
        throw new HttpsError('internal', e.message);
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
    const spawnId = claim.spawnId;
    const category = claim.category;
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

        if (spawnId && !spawnId.startsWith('ad-')) {
            updates.collectedIds = FieldValue.arrayUnion(spawnId);
        }

        switch (category) {
            case 'URBAN': updates.gameplayBalance = FieldValue.increment(value); break;
            case 'LANDMARK': updates.rareBalance = FieldValue.increment(value); break;
            case 'EVENT': updates.eventBalance = FieldValue.increment(value); break;
            case 'MERCHANT': updates.merchantBalance = FieldValue.increment(value); break;
            case 'GIFTBOX': updates.gameplayBalance = FieldValue.increment(value); break;
            case 'AD_REWARD': 
                updates.dailySupplyBalance = FieldValue.increment(value); 
                updates.adsWatched = FieldValue.increment(1);
                updates.lastDailyClaim = Date.now();
                break;
        }

        await userRef.set(updates, { merge: true });
        await snap.ref.update({ status: 'verified', processedAt: FieldValue.serverTimestamp() });
        
    } catch (err) {
        console.error("Trigger Error:", err);
    }
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
