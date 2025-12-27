
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
 * PROTOCOL NUCLEAR RESET
 */
export const resetUserProtocol = onCall(async (request) => {
    const targetUserId = request.data?.targetUserId;
    if (!targetUserId) throw new HttpsError('invalid-argument', 'Missing targetUserId');

    const idStr = targetUserId.toString();
    try {
        const userRef = db.collection('users').doc(idStr);
        
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
            lastDailyClaim: 0,
            adsWatched: 0,
            sponsoredAdsWatched: 0,
            lastActive: FieldValue.serverTimestamp()
        };

        // Folosim SET cu merge: true pentru a asigura crearea dacă nu există
        await userRef.set(resetPayload, { merge: true });

        return { success: true };
    } catch (e: any) {
        throw new HttpsError('internal', e.message);
    }
});

/**
 * TRIGGER: Procesare colectări (MAP/HUNT/ADS)
 * Această funcție transformă statusul din 'pending' în 'verified' și adaugă punctele în balanță.
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    if (!claim.userId) {
        console.error("Trigger error: claim missing userId");
        return;
    }

    const userIdStr = claim.userId.toString();
    const spawnId = claim.spawnId;
    const category = claim.category || 'URBAN';
    const userRef = db.collection('users').doc(userIdStr);

    try {
        const value = Number(claim.claimedValue || 0);
        const tonValue = Number(claim.tonReward || 0);

        // Pregătim obiectul de update
        const updates: any = {
            telegramId: Number(claim.userId),
            balance: FieldValue.increment(value),
            tonBalance: FieldValue.increment(tonValue),
            lastActive: FieldValue.serverTimestamp()
        };

        // Adăugăm ID-ul în istoricul de colectate (dacă nu e reclamă zilnică generică)
        if (spawnId && !spawnId.startsWith('ad-')) {
            updates.collectedIds = FieldValue.arrayUnion(spawnId);
        }

        // Logică specifică pe categorii
        switch (category) {
            case 'URBAN':
            case 'MALL':
            case 'GIFTBOX':
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
            case 'AD_REWARD':
                updates.dailySupplyBalance = FieldValue.increment(value);
                updates.adsWatched = FieldValue.increment(1);
                updates.lastDailyClaim = Date.now();
                break;
        }

        /**
         * CRITICAL FIX: Folosim .set(updates, { merge: true })
         * În loc de .update(), asta asigură că dacă documentul userului lipsește 
         * (pentru că a fost șters manual), acesta va fi creat pe loc cu noile valori.
         */
        await userRef.set(updates, { merge: true });

        // Marcăm claim-ul ca fiind procesat cu succes
        await snap.ref.update({ 
            status: 'verified', 
            processedAt: FieldValue.serverTimestamp() 
        });

        console.log(`Successfully processed claim ${event.params.claimId} for user ${userIdStr}`);
        
    } catch (err: any) {
        console.error("FATAL TRIGGER ERROR:", err);
        // Notăm eroarea în documentul claim pentru debug
        await snap.ref.update({ status: 'error', errorMessage: err.message });
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

        const batch = db.batch();
        
        // Referrer primește bonus
        batch.set(db.collection('users').doc(referrerId), {
            balance: FieldValue.increment(50),
            referralBalance: FieldValue.increment(50),
            referrals: FieldValue.increment(1),
            referralNames: FieldValue.arrayUnion(claim.referredName || "Hunter")
        }, { merge: true });

        // Referred este marcat ca activat
        batch.set(db.collection('users').doc(referredId), {
            hasClaimedReferral: true
        }, { merge: true });

        await batch.commit();
        await snap.ref.update({ status: 'verified', processedAt: FieldValue.serverTimestamp() });

    } catch (err) {
        console.error("Referral processing failed:", err);
    }
});

export const chatWithELZR = onCall(async (request) => {
    const { messages } = request.data || {};
    if (!process.env.API_KEY) throw new HttpsError('failed-precondition', 'AI Node Disconnected');
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text.substring(0, 500) }] })),
            config: { systemInstruction: "You are ELZR System Scout.", temperature: 0.7 }
        });
        return { text: response.text };
    } catch (e: any) {
        throw new HttpsError('internal', 'AI Core Error');
    }
});
