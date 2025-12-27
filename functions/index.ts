
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
 * RESET TOTAL USER - RECREEAZĂ DOCUMENTUL CU ZERO
 */
export const resetUserProtocol = onCall(async (request) => {
    const targetUserId = request.data?.targetUserId;
    if (!targetUserId) throw new HttpsError('invalid-argument', 'ID utilizator lipsă.');

    const idStr = targetUserId.toString();
    console.log(`[FORȚARE RESET] Utilizator: ${idStr}`);

    try {
        const userRef = db.collection('users').doc(idStr);
        
        // Folosim SET (nu update) pentru a suprascrie totul sau a crea dacă nu există
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
        }, { merge: false }); // Merge false = șterge tot ce era înainte și pune aceste valori

        return { success: true };
    } catch (e: any) {
        console.error("CRITICAL RESET ERROR:", e);
        throw new HttpsError('internal', e.message);
    }
});

/**
 * TRIGGER COLECTARE - BULLETPROOF
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    // Convertim userId în string indiferent dacă vine ca număr sau string
    const userIdStr = claim.userId ? claim.userId.toString() : null;
    if (!userIdStr) {
        console.error("Missing userId in claim document");
        return;
    }

    const userRef = db.collection('users').doc(userIdStr);
    
    try {
        const value = Number(claim.claimedValue || 0);
        const tonValue = Number(claim.tonReward || 0);
        const cat = claim.category || "URBAN";
        
        // Pregătim obiectul de update/creare
        const updates: any = {
            balance: FieldValue.increment(value),
            tonBalance: FieldValue.increment(tonValue),
            lastActive: FieldValue.serverTimestamp()
        };

        // Adăugăm în istoric dacă e monedă de joc
        if (claim.spawnId && !claim.spawnId.startsWith('ad-')) {
            updates.collectedIds = FieldValue.arrayUnion(claim.spawnId);
        }

        // Logică pe categorii
        if (cat === 'URBAN' || cat === 'MALL' || cat === 'GIFTBOX') {
            updates.gameplayBalance = FieldValue.increment(value);
        } else if (cat === 'LANDMARK') {
            updates.rareBalance = FieldValue.increment(value);
            updates.rareItemsCollected = FieldValue.increment(1);
        } else if (cat === 'EVENT') {
            updates.eventBalance = FieldValue.increment(value);
            updates.eventItemsCollected = FieldValue.increment(1);
        } else if (cat === 'MERCHANT') {
            updates.merchantBalance = FieldValue.increment(value);
        } else if (cat === 'AD_REWARD') {
            updates.dailySupplyBalance = FieldValue.increment(value);
            updates.adsWatched = FieldValue.increment(1);
            updates.lastDailyClaim = Date.now();
        }

        /**
         * CRITICAL FIX: Folosim SET cu {merge: true}
         * Dacă documentul utilizatorului a fost șters manual, SET îl va recrea instantaneu.
         * Dacă documentul există, SET va face update doar la câmpurile din updates.
         */
        await userRef.set(updates, { merge: true });

        // Marcăm claim-ul ca fiind procesat cu succes
        await snap.ref.update({ 
            status: 'verified', 
            processedAt: FieldValue.serverTimestamp() 
        });

        console.log(`[SUCCESS] Claim processed for user ${userIdStr}. Added ${value} points.`);

    } catch (err: any) { 
        console.error("Trigger Processing Error:", err);
        // Marcăm eroarea în claim pentru debugging
        await snap.ref.update({ status: 'error', errorMsg: err.message });
    }
});

/**
 * TRIGGER REFERALI
 */
export const onReferralClaimCreated = onDocumentCreated('referral_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    try {
        const referrerId = claim.referrerId.toString();
        const referredId = claim.referredId.toString();
        const referredName = claim.referredName || "Hunter";

        const batch = db.batch();
        
        // Referrer
        batch.set(db.collection('users').doc(referrerId), {
            balance: FieldValue.increment(50),
            referralBalance: FieldValue.increment(50),
            referrals: FieldValue.increment(1),
            referralNames: FieldValue.arrayUnion(referredName)
        }, { merge: true });

        // Referred
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
    const data = request.data;
    if (!process.env.API_KEY) throw new HttpsError('failed-precondition', 'AI Node Disconnected');
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: data.messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text.substring(0, 500) }] })),
        config: { systemInstruction: "You are ELZR System Scout.", temperature: 0.7 }
    });
    return { text: response.text };
});
