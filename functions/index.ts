
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();
const BOT_TOKEN = process.env.BOT_TOKEN || "";

/**
 * VERIFICARE INTEGRITATE TELEGRAM
 */
function verifyTelegramData(initData: string): boolean {
    if (!BOT_TOKEN || !initData) return true; // Fallback pt development dacă lipsește tokenul
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');
        const dataCheckString = Array.from(urlParams.entries())
            .map(([key, value]) => `${key}=${value}`)
            .sort()
            .join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        return calculatedHash === hash;
    } catch (e) {
        return false;
    }
}

/**
 * SECURE CLAIM HANDLER (V7.0 - INSTANT ALLOCATION)
 * Această funcție alocă punctele DIRECT în contul userului fără a mai aștepta trigger-e.
 */
export const secureClaim = onCall({
    maxInstances: 20,
    memory: "256MiB"
}, async (request) => {
    const { userId, spawnId, category, initData, tonReward } = request.data || {};
    
    if (!verifyTelegramData(initData)) {
        throw new HttpsError('unauthenticated', 'Integrity check failed.');
    }

    if (!userId || !spawnId) {
        throw new HttpsError('invalid-argument', 'Missing protocol data.');
    }

    const userRef = db.collection('users').doc(String(userId));
    
    // DEFINIRE VALORI PE SERVER (Securitate)
    let finalValue = 100; 
    if (category === 'LANDMARK') finalValue = 1000;
    if (category === 'EVENT') finalValue = 1000;
    if (category === 'AD_REWARD') finalValue = 500;
    if (category === 'GIFTBOX') finalValue = Math.floor(Math.random() * 500) + 100;
    
    // Logica pentru Merchants (campanii plătite)
    if (category === 'MERCHANT') {
        const campId = spawnId.split('-coin-')[0];
        const campSnap = await db.collection('campaigns').doc(campId).get();
        if (campSnap.exists) {
            const cData = campSnap.data();
            finalValue = 100 * ((cData?.multiplier || 5) / 5);
        }
    }

    try {
        const batch = db.batch();
        
        // 1. Log-ul cererii (Audit)
        const claimRef = db.collection('claims').doc();
        batch.set(claimRef, {
            userId: Number(userId),
            spawnId: String(spawnId),
            claimedValue: finalValue,
            tonReward: Number(tonReward || 0),
            category: category || "URBAN",
            timestamp: FieldValue.serverTimestamp(),
            status: "verified"
        });

        // 2. ACTUALIZARE INSTANTANEE A BALANȚEI USERULUI
        const userUpdate: any = {
            balance: FieldValue.increment(finalValue),
            tonBalance: FieldValue.increment(Number(tonReward || 0)),
            lastActive: FieldValue.serverTimestamp()
        };

        if (spawnId && !spawnId.startsWith('ad-')) {
            userUpdate.collectedIds = FieldValue.arrayUnion(spawnId);
        }

        // Distribuție pe categorii Airdrop Estimation
        if (category === 'AD_REWARD') {
            userUpdate.dailySupplyBalance = FieldValue.increment(finalValue);
            userUpdate.adsWatched = FieldValue.increment(1);
            userUpdate.lastDailyClaim = Date.now();
        } else if (category === 'LANDMARK') {
            userUpdate.rareBalance = FieldValue.increment(finalValue);
            userUpdate.rareItemsCollected = FieldValue.increment(1);
        } else if (category === 'EVENT') {
            userUpdate.eventBalance = FieldValue.increment(finalValue);
            userUpdate.eventItemsCollected = FieldValue.increment(1);
        } else if (category === 'MERCHANT') {
            userUpdate.merchantBalance = FieldValue.increment(finalValue);
        } else {
            userUpdate.gameplayBalance = FieldValue.increment(finalValue);
        }

        batch.set(userRef, userUpdate, { merge: true });
        
        await batch.commit();
        return { success: true, points: finalValue };

    } catch (e: any) {
        console.error("Instant Claim Error:", e);
        throw new HttpsError('internal', 'Execution node failure.');
    }
});

/**
 * SECURE REFERRAL HANDLER (V7.0 - INSTANT ALLOCATION)
 */
export const secureReferral = onCall(async (request) => {
    const { referrerId, userId, userName, initData } = request.data || {};

    if (!verifyTelegramData(initData)) {
        throw new HttpsError('unauthenticated', 'Invalid integrity check.');
    }

    const newUserRef = db.collection('users').doc(String(userId));
    const userSnap = await newUserRef.get();
    
    if (userSnap.exists && userSnap.data()?.hasClaimedReferral) {
        return { success: false, message: "Already processed." };
    }

    try {
        const batch = db.batch();
        const referrerRef = db.collection('users').doc(String(referrerId));

        // Recompensă Referer (50)
        batch.set(referrerRef, {
            balance: FieldValue.increment(50),
            referralBalance: FieldValue.increment(50),
            referrals: FieldValue.increment(1),
            referralNames: FieldValue.arrayUnion(userName || "Hunter")
        }, { merge: true });

        // Recompensă Bun Venit (25)
        batch.set(newUserRef, {
            balance: FieldValue.increment(25),
            gameplayBalance: FieldValue.increment(25),
            hasClaimedReferral: true,
            telegramId: Number(userId),
            joinedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        await batch.commit();
        return { success: true };
    } catch (e) {
        throw new HttpsError('internal', 'Referral link broken.');
    }
});

/**
 * AI SCOUT PROXY
 */
export const chatWithELZR = onCall(async (request) => {
    const { messages } = request.data || {};
    if (!process.env.API_KEY) return { text: "AI Offline." };
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: messages.slice(-5).map((m: any) => ({
                role: m.role === 'model' ? 'model' : 'user', 
                parts: [{ text: m.text }] 
            })),
            config: { systemInstruction: "You are ELZR Scout. Be brief.", temperature: 0.7 }
        });
        return { text: response.text };
    } catch (e) {
        return { text: "Protocol error." };
    }
});
