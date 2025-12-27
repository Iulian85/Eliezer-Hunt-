
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
 * Se declanșează când un nou document apare în 'claims'
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const claimId = event.params.claimId;
    
    console.log(`[START] Procesare Claim ID: ${claimId} pentru User: ${claim.userId}`);

    // 1. Validare UserId - îl forțăm să fie string pentru a găsi documentul
    const rawUserId = claim.userId;
    if (!rawUserId) {
        console.error("EROARE: userId lipsește din claim!");
        return;
    }
    const userIdStr = rawUserId.toString();
    const userRef = db.collection('users').doc(userIdStr);

    try {
        const value = Number(claim.claimedValue || 0);
        const tonValue = Number(claim.tonReward || 0);
        const category = claim.category || 'URBAN';
        const spawnId = claim.spawnId;

        // 2. Pregătim obiectul de actualizare/creare pentru utilizator
        const userUpdate: any = {
            telegramId: Number(rawUserId), // Păstrăm și forma numerică în interior
            balance: FieldValue.increment(value),
            tonBalance: FieldValue.increment(tonValue),
            lastActive: FieldValue.serverTimestamp()
        };

        // Adăugăm în istoricul de colectate (dacă nu e reclamă generică)
        if (spawnId && !spawnId.startsWith('ad-')) {
            userUpdate.collectedIds = FieldValue.arrayUnion(spawnId);
        }

        // Alocăm punctele pe categorii specifice pentru a se vedea în Wallet
        if (category === 'URBAN' || category === 'MALL' || category === 'GIFTBOX') {
            userUpdate.gameplayBalance = FieldValue.increment(value);
        } else if (category === 'LANDMARK') {
            userUpdate.rareBalance = FieldValue.increment(value);
            userUpdate.rareItemsCollected = FieldValue.increment(1);
        } else if (category === 'EVENT') {
            userUpdate.eventBalance = FieldValue.increment(value);
            userUpdate.eventItemsCollected = FieldValue.increment(1);
        } else if (category === 'MERCHANT') {
            userUpdate.merchantBalance = FieldValue.increment(value);
            userUpdate.sponsoredAdsWatched = FieldValue.increment(1);
        } else if (category === 'AD_REWARD') {
            userUpdate.dailySupplyBalance = FieldValue.increment(value);
            userUpdate.adsWatched = FieldValue.increment(1);
            userUpdate.lastDailyClaim = Date.now();
        }

        // 3. EXECUTĂM ACTUALIZAREA
        // Folosim SET cu merge: true pentru a re-crea userul dacă a fost șters din baza de date
        await userRef.set(userUpdate, { merge: true });

        // 4. Marcăm claim-ul ca fiind VERIFICAT
        await snap.ref.update({ 
            status: 'verified', 
            processedAt: FieldValue.serverTimestamp(),
            debug_info: "Successfully allocated by trigger"
        });

        console.log(`[SUCCESS] Claim ${claimId} procesat. Balanță actualizată pentru ${userIdStr}`);

    } catch (err: any) {
        console.error(`[CRITICAL ERROR] Eșec la procesarea claim-ului ${claimId}:`, err);
        // Dacă crapă, scriem eroarea în documentul de claim ca să o poți vedea în consola Firebase
        await snap.ref.update({ 
            status: 'error', 
            error_message: err.message,
            error_stack: err.stack ? "Stack available in logs" : "No stack"
        });
    }
});

/**
 * NUCLEAR RESET - Curăță complet un user
 */
export const resetUserProtocol = onCall(async (request) => {
    const targetUserId = request.data?.targetUserId;
    if (!targetUserId) throw new HttpsError('invalid-argument', 'Missing targetUserId');

    const idStr = targetUserId.toString();
    try {
        const userRef = db.collection('users').doc(idStr);
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
            adsWatched: 0,
            sponsoredAdsWatched: 0,
            lastActive: FieldValue.serverTimestamp()
        }, { merge: false }); // merge false = șterge tot restul documentului
        return { success: true };
    } catch (e: any) {
        throw new HttpsError('internal', e.message);
    }
});

/**
 * AI PROXY
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
