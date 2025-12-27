
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
 * Acesta este "creierul" care mută punctele din 'claims' (pending) în 'users' (balanță reală).
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const claimId = event.params.claimId;
    
    console.log(`[LOG] Procesare începută pentru Claim: ${claimId}`);

    // VALIDARE USER ID - Forțăm convertirea în String (Esențial pentru document path)
    const rawUserId = claim.userId;
    if (!rawUserId) {
        console.error("EROARE CRITICĂ: Documentul claim nu are userId!");
        return;
    }
    
    const userIdStr = String(rawUserId);
    const userRef = db.collection('users').doc(userIdStr);

    try {
        const value = Number(claim.claimedValue || 0);
        const tonValue = Number(claim.tonReward || 0);
        const category = claim.category || 'URBAN';
        const spawnId = claim.spawnId;

        // Obiectul de update pentru utilizator
        // Folosim FieldValue.increment pentru a asigura calcule matematice atomice pe server
        const userUpdate: any = {
            telegramId: Number(rawUserId),
            balance: FieldValue.increment(value),
            tonBalance: FieldValue.increment(tonValue),
            lastActive: FieldValue.serverTimestamp()
        };

        // Istoric colectări
        if (spawnId && !spawnId.startsWith('ad-')) {
            userUpdate.collectedIds = FieldValue.arrayUnion(spawnId);
        }

        // REPARTIZARE PE CATEGORII (Pentru vizualizarea corectă în Wallet)
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
            // Implicit: URBAN / MALL / GIFTBOX
            userUpdate.gameplayBalance = FieldValue.increment(value);
        }

        /**
         * FIX CHEIE: .set(..., { merge: true }) 
         * Spre deosebire de .update(), acesta CREAZĂ documentul dacă lipsește.
         * Dacă ai șters userul manual, acesta va fi recreat cu punctele primite.
         */
        await userRef.set(userUpdate, { merge: true });

        // Marcăm claim-ul ca fiind VERIFICAT (va dispărea din pending logic)
        await snap.ref.update({ 
            status: 'verified', 
            processedAt: FieldValue.serverTimestamp() 
        });

        console.log(`[SUCCESS] User ${userIdStr} a primit ${value} puncte in categoria ${category}`);

    } catch (err: any) {
        console.error(`[FATAL] Eroare la procesarea claim-ului ${claimId}:`, err);
        // Notăm eroarea în document ca să o vezi în consola Firebase
        await snap.ref.update({ status: 'error', errorMessage: err.message });
    }
});

/**
 * RESETARE CONT (NUCLEAR)
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
