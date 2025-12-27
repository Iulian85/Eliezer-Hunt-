
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
 * RESET TOTAL LA ZERO - FORCE SET
 */
export const resetUserProtocol = onCall(async (request) => {
    const targetUserId = request.data?.targetUserId;
    if (!targetUserId) throw new HttpsError('invalid-argument', 'ID utilizator lipsă.');

    const idStr = targetUserId.toString();

    try {
        console.log(`[FORȚARE ZERO] Utilizator: ${idStr}`);
        
        const userRef = db.collection('users').doc(idStr);

        // Folosim SET cu merge:true pentru a fi siguri că funcționează chiar dacă ai șters documentul manual
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
            lastDailyClaim: 0,
            hasClaimedReferral: false,
            referrals: 0,
            referralNames: [],
            lastActive: FieldValue.serverTimestamp()
        }, { merge: true });

        return { success: true };
    } catch (e: any) {
        console.error("CRITICAL RESET ERROR:", e);
        throw new HttpsError('internal', 'Eroare la scrierea în baza de date.');
    }
});

/**
 * TRIGGER COLECTARE - Robust pentru documente noi
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

        // Folosim SET cu merge:true în trigger pentru a recrea documentul dacă lipsește
        await userRef.set(updates, { merge: true });
        await snap.ref.update({ status: 'verified' });
    } catch (err) { 
        console.error("Trigger Error:", err); 
    }
});

export const onReferralClaimCreated = onDocumentCreated('referral_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const referrerId = claim.referrerId.toString();
    const referredId = claim.referredId.toString();
    try {
        const batch = db.batch();
        batch.set(db.collection('users').doc(referrerId), {
            balance: FieldValue.increment(50),
            referralBalance: FieldValue.increment(50),
            referrals: FieldValue.increment(1),
            referralNames: FieldValue.arrayUnion(claim.referredName || "Hunter")
        }, { merge: true });
        batch.set(db.collection('users').doc(referredId), {
            balance: FieldValue.increment(25),
            gameplayBalance: FieldValue.increment(25),
            hasClaimedReferral: true
        }, { merge: true });
        await batch.commit();
        await snap.ref.update({ status: 'processed' });
    } catch (err) { console.error("Referral Error:", err); }
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
