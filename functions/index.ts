
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
 * TRIGGER PROCESARE COLECTĂRI
 * Mută punctele din 'claims' (status pending) în balanța reală a utilizatorului.
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const claimId = event.params.claimId;
    
    // REPARARE ID: În baza de date userId este Number. Documentele au nevoie de String.
    const rawUserId = claim.userId;
    if (!rawUserId) {
        console.error(`[ERROR] Claim ${claimId} nu are userId.`);
        return;
    }
    
    const userIdStr = String(rawUserId);
    const userRef = db.collection('users').doc(userIdStr);

    try {
        const value = Number(claim.claimedValue || 0);
        const tonValue = Number(claim.tonReward || 0);
        const category = claim.category || 'URBAN';
        const spawnId = claim.spawnId;

        const userUpdate: any = {
            telegramId: Number(rawUserId),
            balance: FieldValue.increment(value),
            tonBalance: FieldValue.increment(tonValue),
            lastActive: FieldValue.serverTimestamp()
        };

        if (spawnId && !spawnId.startsWith('ad-')) {
            userUpdate.collectedIds = FieldValue.arrayUnion(spawnId);
        }

        // Alocare pe categorii de balanță
        if (category === 'AD_REWARD') {
            userUpdate.dailySupplyBalance = FieldValue.increment(value);
            userUpdate.adsWatched = FieldValue.increment(1);
            userUpdate.lastDailyClaim = Date.now();
        } else if (category === 'MERCHANT') {
            userUpdate.merchantBalance = FieldValue.increment(value);
            userUpdate.sponsoredAdsWatched = FieldValue.increment(1);
        } else if (category === 'LANDMARK') {
            userUpdate.rareBalance = FieldValue.increment(value);
            userUpdate.rareItemsCollected = FieldValue.increment(1);
        } else if (category === 'EVENT') {
            userUpdate.eventBalance = FieldValue.increment(value);
            userUpdate.eventItemsCollected = FieldValue.increment(1);
        } else {
            userUpdate.gameplayBalance = FieldValue.increment(value);
        }

        // Setam documentul cu merge: true (il creeaza daca nu exista, il updateaza daca exista)
        await userRef.set(userUpdate, { merge: true });

        // Marcam claim-ul ca procesat
        await snap.ref.update({ 
            status: 'verified', 
            processedAt: FieldValue.serverTimestamp()
        });

        console.log(`[SUCCESS] Procesat ${value} ELZR pentru Hunter ${userIdStr}`);

    } catch (err: any) {
        console.error(`[CRITICAL] Eroare la procesarea claim-ului ${claimId}:`, err);
        await snap.ref.update({ status: 'error', errorMsg: err.message });
    }
});

/**
 * RESETARE CONT (NUCLEAR RESET)
 */
export const resetUserProtocol = onCall(async (request) => {
    const targetUserId = request.data?.targetUserId;
    if (!targetUserId) throw new HttpsError('invalid-argument', 'Target ID missing');

    try {
        await db.collection('users').doc(String(targetUserId)).set({
            balance: 0,
            tonBalance: 0,
            gameplayBalance: 0,
            rareBalance: 0,
            eventBalance: 0,
            dailySupplyBalance: 0,
            merchantBalance: 0,
            referralBalance: 0,
            collectedIds: [],
            lastActive: FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (e: any) {
        throw new HttpsError('internal', e.message);
    }
});

/**
 * AI CORE PROXY
 */
export const chatWithELZR = onCall(async (request) => {
    const { messages } = request.data || {};
    if (!process.env.API_KEY) throw new HttpsError('failed-precondition', 'AI Node offline');
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text }] })),
            config: { systemInstruction: "You are ELZR System Scout.", temperature: 0.7 }
        });
        return { text: response.text };
    } catch (e: any) {
        throw new HttpsError('internal', 'AI Core sync error');
    }
});
