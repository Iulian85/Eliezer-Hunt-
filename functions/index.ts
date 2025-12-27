
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
 * LOGICA CENTRALĂ DE PROCESARE (Shared)
 */
async function processUserPoints(userId: string, spawnId: string, category: string, value: number, tonReward: number) {
    const userRef = db.collection('users').doc(userId);
    const update: any = {
        balance: FieldValue.increment(value),
        tonBalance: FieldValue.increment(tonReward),
        lastActive: FieldValue.serverTimestamp()
    };

    if (spawnId && !spawnId.startsWith('ad-')) {
        update.collectedIds = FieldValue.arrayUnion(spawnId);
    }

    // Mapare categorii Airdrop
    if (category === 'AD_REWARD') {
        update.dailySupplyBalance = FieldValue.increment(value);
        update.adsWatched = FieldValue.increment(1);
        update.lastDailyClaim = Date.now();
    } else if (category === 'LANDMARK') {
        update.rareBalance = FieldValue.increment(value);
    } else if (category === 'EVENT') {
        update.eventBalance = FieldValue.increment(value);
    } else if (category === 'MERCHANT') {
        update.merchantBalance = FieldValue.increment(value);
    } else {
        update.gameplayBalance = FieldValue.increment(value);
    }

    await userRef.set(update, { merge: true });
}

/**
 * FIX PENTRU PUNCTELE BLOCATE (Trigger)
 * Această funcție se declanșează când vede documentele "pending" pe care le-ai menționat.
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    if (claim.status !== 'pending') return;

    try {
        await processUserPoints(
            String(claim.userId),
            claim.spawnId,
            claim.category || 'URBAN',
            Number(claim.claimedValue || 100),
            Number(claim.tonReward || 0)
        );
        await snap.ref.update({ status: 'verified', processedAt: FieldValue.serverTimestamp() });
    } catch (e) {
        console.error("Trigger Error:", e);
    }
});

/**
 * ALOCARE INSTANTANEE (Direct Call)
 */
export const secureClaim = onCall(async (request) => {
    const { userId, spawnId, category, claimedValue, tonReward } = request.data || {};
    if (!userId) throw new HttpsError('invalid-argument', 'Missing UI');

    try {
        const value = Number(claimedValue || 100);
        const ton = Number(tonReward || 0);
        const cat = category || 'URBAN';

        await processUserPoints(String(userId), spawnId, cat, value, ton);

        // Salvăm și log-ul cu status verified direct
        await db.collection('claims').add({
            userId: Number(userId),
            spawnId,
            category: cat,
            claimedValue: value,
            tonReward: ton,
            status: 'verified',
            timestamp: FieldValue.serverTimestamp()
        });

        return { success: true };
    } catch (e) {
        throw new HttpsError('internal', 'Sync failed');
    }
});

/**
 * REFERRAL SYSTEM (Fix)
 */
export const secureReferral = onCall(async (request) => {
    const { referrerId, userId, userName } = request.data || {};
    if (!referrerId || !userId) return { success: false };

    const userRef = db.collection('users').doc(String(userId));
    const snap = await userRef.get();
    if (snap.exists && snap.data()?.hasClaimedReferral) return { success: false };

    const batch = db.batch();
    const refOwner = db.collection('users').doc(String(referrerId));

    batch.set(refOwner, {
        balance: FieldValue.increment(50),
        referralBalance: FieldValue.increment(50),
        referrals: FieldValue.increment(1),
        referralNames: FieldValue.arrayUnion(userName || "Hunter")
    }, { merge: true });

    batch.set(userRef, {
        balance: FieldValue.increment(25),
        gameplayBalance: FieldValue.increment(25),
        hasClaimedReferral: true,
        telegramId: Number(userId)
    }, { merge: true });

    await batch.commit();
    return { success: true };
});

export const chatWithELZR = onCall(async (request) => {
    const { messages } = request.data || {};
    if (!process.env.API_KEY) return { text: "AI Offline." };
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: messages.slice(-5).map((m: any) => ({ role: m.role, parts: [{ text: m.text }] })),
        config: { systemInstruction: "Be a brief crypto scout.", thinkingConfig: { thinkingBudget: 0 } }
    });
    return { text: response.text };
});
