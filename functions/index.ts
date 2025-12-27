
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
    
    console.log(`[START] Procesare Claim: ${claimId} pentru User: ${claim.userId}`);

    // REPARARE ID: În screenshot userId este Number. Documentele au nevoie de String.
    const rawUserId = claim.userId;
    if (!rawUserId) {
        console.error("EROARE: userId lipsește din claim!");
        return;
    }
    
    const userIdStr = String(rawUserId);
    const userRef = db.collection('users').doc(userIdStr);

    try {
        const value = Number(claim.claimedValue || 0);
        const tonValue = Number(claim.tonReward || 0);
        const category = claim.category || 'URBAN';
        const spawnId = claim.spawnId;

        // Pregătim datele pentru incrementare
        const userUpdate: any = {
            telegramId: Number(rawUserId),
            balance: FieldValue.increment(value),
            tonBalance: FieldValue.increment(tonValue),
            lastActive: FieldValue.serverTimestamp()
        };

        // Evităm duplicarea colectărilor pe hartă
        if (spawnId && !spawnId.startsWith('ad-')) {
            userUpdate.collectedIds = FieldValue.arrayUnion(spawnId);
        }

        // ALOCARE PE CATEGORII (Daily Reward -> dailySupplyBalance)
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

        // REPARARE UTILIZATOR: Folosim .set({merge: true}) în loc de .update()
        // Dacă documentul utilizatorului a fost șters manual, acesta este RECREAT automat aici.
        await userRef.set(userUpdate, { merge: true });

        // Marcăm claim-ul ca VERIFICAT
        await snap.ref.update({ 
            status: 'verified', 
            processedAt: FieldValue.serverTimestamp(),
            debug_info: "Allocated via updated trigger"
        });

        console.log(`[SUCCESS] Claim ${claimId} procesat cu succes.`);

    } catch (err: any) {
        console.error(`[ERROR] Eșec la claim ${claimId}:`, err);
        // Scriem eroarea în document ca să o poți vedea în consola Firebase (Dashboard)
        await snap.ref.update({ 
            status: 'error', 
            errorMessage: err.message 
        });
    }
});

/**
 * NUCLEAR RESET - Resetare totală pentru un utilizator
 */
export const resetUserProtocol = onCall(async (request) => {
    const targetUserId = request.data?.targetUserId;
    if (!targetUserId) throw new HttpsError('invalid-argument', 'Missing targetUserId');

    const idStr = String(targetUserId);
    try {
        await db.collection('users').doc(idStr).set({
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
        });
        return { success: true };
    } catch (e: any) {
        throw new HttpsError('internal', e.message);
    }
});

/**
 * PROXY AI
 */
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
