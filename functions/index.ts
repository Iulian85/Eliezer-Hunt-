import { onDocumentCreated } from 'firebase-functions/v2/firestore';
// Added missing import for onCall from v2 https
import { onCall } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();

/**
 * LEDGER ENGINE (V6.0)
 * Procesează orice "cerere" de puncte de pe hartă sau reclame.
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const userIdStr = String(claim.userId);
    const userRef = db.collection('users').doc(userIdStr);

    try {
        if (claim.status === 'verified') return;
        
        const value = Number(claim.claimedValue || 0);
        const tonValue = Number(claim.tonReward || 0);
        const category = claim.category || 'URBAN';
        const spawnId = claim.spawnId;

        // Obiectul de update pentru user
        const update: any = {
            balance: FieldValue.increment(value),
            tonBalance: FieldValue.increment(tonValue),
            lastActive: FieldValue.serverTimestamp()
        };

        // Nu salvăm ID-uri de reclame pentru a permite re-vizionarea
        if (spawnId && !spawnId.startsWith('ad-')) {
            update.collectedIds = FieldValue.arrayUnion(spawnId);
        }

        // DISTRIBUȚIE PE CATEGORII AIRDROP
        if (category === 'AD_REWARD') {
            update.dailySupplyBalance = FieldValue.increment(value);
            update.adsWatched = FieldValue.increment(1);
            update.lastDailyClaim = Date.now();
        } else if (category === 'LANDMARK') {
            update.rareBalance = FieldValue.increment(value);
            update.rareItemsCollected = FieldValue.increment(1);
        } else if (category === 'EVENT') {
            update.eventBalance = FieldValue.increment(value);
            update.eventItemsCollected = FieldValue.increment(1);
        } else if (category === 'MERCHANT') {
            update.merchantBalance = FieldValue.increment(value);
            update.sponsoredAdsWatched = FieldValue.increment(1);
        } else {
            // URBAN, MALL și GIFTBOX merg la Gameplay
            update.gameplayBalance = FieldValue.increment(value);
        }

        await userRef.set(update, { merge: true });
        await snap.ref.update({ status: 'verified', processedAt: FieldValue.serverTimestamp() });

    } catch (err: any) {
        console.error("Ledger Error:", err);
        await snap.ref.update({ status: 'error', errorMsg: err.message });
    }
});

/**
 * REFERRAL ENGINE (V6.0)
 * Procesează bonusul de invitație (50) și cel de bun venit (25).
 */
export const onReferralClaimCreated = onDocumentCreated('referral_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { referrerId, userId, userName } = snap.data();

    try {
        const newUserRef = db.collection('users').doc(String(userId));
        const userSnap = await newUserRef.get();
        
        // Verificăm dacă a mai primit bonusul
        if (userSnap.exists && userSnap.data()?.hasClaimedReferral) return;

        const batch = db.batch();
        const referrerRef = db.collection('users').doc(String(referrerId));

        // 1. Recompensă Cel care a invitat (50 Pct)
        batch.set(referrerRef, {
            balance: FieldValue.increment(50),
            referralBalance: FieldValue.increment(50),
            referrals: FieldValue.increment(1),
            referralNames: FieldValue.arrayUnion(userName || "Hunter")
        }, { merge: true });

        // 2. Recompensă Cel nou (25 Pct Bun Venit)
        batch.set(newUserRef, {
            balance: FieldValue.increment(25),
            gameplayBalance: FieldValue.increment(25),
            hasClaimedReferral: true
        }, { merge: true });

        await batch.commit();
        await snap.ref.update({ status: 'verified' });

    } catch (e) {
        console.error("Referral Engine Error:", e);
    }
});

/**
 * AI SCOUT PROXY
 */
// Fixed: onCall is now imported correctly above
export const chatWithELZR = onCall({
    maxInstances: 10,
    memory: "256MiB"
}, async (request) => {
    const { messages } = request.data || {};
    if (!process.env.API_KEY) return { text: "AI Offline." };
    try {
        // Correct initialization with process.env.API_KEY
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: messages.slice(-5).map((m: any) => ({
                role: m.role === 'model' ? 'model' : 'user', 
                parts: [{ text: m.text }] 
            })),
            config: { systemInstruction: "You are ELZR Scout. Brief.", temperature: 0.7 }
        });
        // .text is a property on the response object
        return { text: response.text };
    } catch (e) {
        return { text: "Protocol error." };
    }
});