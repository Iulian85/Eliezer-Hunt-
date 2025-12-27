
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();
const BOT_TOKEN = process.env.BOT_TOKEN || "";

function verifyTelegramData(initData: string): boolean {
    if (!BOT_TOKEN || !initData) return false;
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
 * SECURE CLAIM HANDLER (V5.7)
 * Fixes: Ad points, GPS Jitter in RO, and multi-category tracking.
 */
export const secureClaim = onCall({
    maxInstances: 20,
    memory: "256MiB"
}, async (request) => {
    const { userId, spawnId, category, initData, coords, tonReward } = request.data || {};
    
    if (!verifyTelegramData(initData)) {
        throw new HttpsError('unauthenticated', 'Integrity check failed.');
    }

    const userRef = db.collection('users').doc(String(userId));
    const userSnap = await userRef.get();
    const userData = userSnap.data();

    // EXCEPȚIE TOTALĂ PENTRU RECLAME (Daily Reward)
    const isAd = category === 'AD_REWARD';
    
    if (!isAd && userData && userData.lastActiveLocation && userData.lastActiveAt && coords) {
        // Verificăm viteza doar pentru colectări de pe hartă
        const lastCoords = userData.lastActiveLocation;
        const lastTime = userData.lastActiveAt.toMillis ? userData.lastActiveAt.toMillis() : userData.lastActiveAt;
        
        const R = 6371; 
        const dLat = (coords.lat - lastCoords.lat) * Math.PI / 180;
        const dLon = (coords.lng - lastCoords.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lastCoords.lat * Math.PI/180) * Math.cos(coords.lat * Math.PI/180) * 
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const timeDiffHours = (Date.now() - lastTime) / (1000 * 60 * 60);
        const speed = d / (timeDiffHours || 0.0001);

        if (speed > 15 && d > 0.3) { 
             throw new HttpsError('permission-denied', 'Mersul pe jos este obligatoriu pentru colectare.');
        }
    }

    // Definirea valorilor pe server (Userul nu poate modifica valoarea punctelor)
    let finalValue = 100; 
    if (category === 'LANDMARK' || category === 'EVENT') finalValue = 1000;
    if (category === 'AD_REWARD') finalValue = 500;
    if (category === 'GIFTBOX') finalValue = Math.floor(Math.random() * 500) + 100;
    
    if (category === 'MERCHANT') {
        const campId = spawnId.split('-coin-')[0];
        const campSnap = await db.collection('campaigns').doc(campId).get();
        if (campSnap.exists) {
            const cData = campSnap.data();
            finalValue = 100 * ((cData?.multiplier || 5) / 5);
        }
    }

    try {
        const claimRef = db.collection('claims').doc();
        await claimRef.set({
            userId: Number(userId),
            spawnId: String(spawnId),
            claimedValue: finalValue,
            tonReward: Number(tonReward || 0),
            category: category || "URBAN",
            timestamp: FieldValue.serverTimestamp(),
            status: "pending"
        });

        // Actualizăm locația doar dacă nu este reclamă
        if (!isAd && coords && coords.lat !== 0) {
            await userRef.set({
                lastActiveLocation: coords,
                lastActiveAt: FieldValue.serverTimestamp()
            }, { merge: true });
        }

        return { success: true, points: finalValue };
    } catch (e: any) {
        throw new HttpsError('internal', 'Sistem offline.');
    }
});

/**
 * SECURE REFERRAL HANDLER
 * Fixes: Welcome bonus (25) for invited user + Referrer reward (50).
 */
export const secureReferral = onCall(async (request) => {
    const { referrerId, userId, userName, initData } = request.data || {};

    if (!verifyTelegramData(initData)) {
        throw new HttpsError('unauthenticated', 'Invalid hash.');
    }

    const newUserRef = db.collection('users').doc(String(userId));
    const referrerRef = db.collection('users').doc(String(referrerId));
    
    const userSnap = await newUserRef.get();
    if (userSnap.exists && userSnap.data()?.hasClaimedReferral) {
        return { success: false };
    }

    const batch = db.batch();

    // 1. Bonus Referer (Cel care a trimis link-ul)
    batch.set(referrerRef, {
        balance: FieldValue.increment(50),
        referralBalance: FieldValue.increment(50),
        referrals: FieldValue.increment(1),
        referralNames: FieldValue.arrayUnion(userName || "Hunter")
    }, { merge: true });

    // 2. Bonus Bun Venit (Cel care a dat click pe link)
    batch.set(newUserRef, {
        balance: FieldValue.increment(25),
        gameplayBalance: FieldValue.increment(25),
        hasClaimedReferral: true
    }, { merge: true });

    await batch.commit();
    return { success: true };
});

/**
 * LEDGER TRIGGER
 * Acesta este "motorul" care pune punctele în Wallet-ul corect pe server.
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const userRef = db.collection('users').doc(String(claim.userId));

    try {
        if (claim.status === 'verified') return;
        
        const value = Number(claim.claimedValue || 0);
        const tonValue = Number(claim.tonReward || 0);
        const category = claim.category;
        const spawnId = claim.spawnId;

        const update: any = {
            balance: FieldValue.increment(value),
            tonBalance: FieldValue.increment(tonValue),
            lastActive: FieldValue.serverTimestamp()
        };

        if (spawnId && !spawnId.startsWith('ad-')) {
            update.collectedIds = FieldValue.arrayUnion(spawnId);
        }

        // Distribuție precisă pe balanțele de Airdrop Estimation
        if (category === 'AD_REWARD') {
            update.dailySupplyBalance = FieldValue.increment(value);
            update.adsWatched = FieldValue.increment(1);
            update.lastDailyClaim = Date.now();
        } else if (category === 'MERCHANT') {
            update.merchantBalance = FieldValue.increment(value);
        } else if (category === 'LANDMARK') {
            update.rareBalance = FieldValue.increment(value);
            update.rareItemsCollected = FieldValue.increment(1);
        } else if (category === 'EVENT') {
            update.eventBalance = FieldValue.increment(value);
            update.eventItemsCollected = FieldValue.increment(1);
        } else if (category === 'GIFTBOX') {
            // Cutiile cadou merg în gameplay balance dar pot da și TON
            update.gameplayBalance = FieldValue.increment(value);
        } else {
            update.gameplayBalance = FieldValue.increment(value);
        }

        await userRef.set(update, { merge: true });
        await snap.ref.update({ status: 'verified', processedAt: FieldValue.serverTimestamp() });
    } catch (err: any) {
        await snap.ref.update({ status: 'error', errorMsg: err.message });
    }
});

export const chatWithELZR = onCall(async (request) => {
    const { messages } = request.data || {};
    if (!process.env.API_KEY) throw new HttpsError('failed-precondition', 'AI Offline.');
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: messages.slice(-5).map((m: any) => ({
                role: m.role === 'model' ? 'model' : 'user', 
                parts: [{ text: m.text }] 
            })),
            config: { systemInstruction: "You are ELZR Scout. Brief and tactical.", temperature: 0.7 }
        });
        return { text: response.text };
    } catch (e: any) {
        throw new HttpsError('internal', 'AI sync error.');
    }
});
