
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
 * SECURE CLAIM HANDLER (V5.6 - COMPLETE FIX)
 */
export const secureClaim = onCall({
    maxInstances: 10,
    memory: "256MiB"
}, async (request) => {
    const { userId, spawnId, category, initData, coords, tonReward } = request.data || {};
    
    if (!verifyTelegramData(initData)) {
        throw new HttpsError('unauthenticated', 'Security Breach: Invalid session signature.');
    }

    if (!userId || !spawnId) {
        throw new HttpsError('invalid-argument', 'Missing protocol data.');
    }

    const userRef = db.collection('users').doc(String(userId));
    const userSnap = await userRef.get();
    const userData = userSnap.data();

    // ANTI-CHEAT: Verificare viteză doar pentru colectări de pe hartă (nu pentru reclame Daily Reward)
    const isStationaryClaim = category === 'AD_REWARD';
    
    if (!isStationaryClaim && userData && userData.lastActiveLocation && userData.lastActiveAt && coords) {
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

        // Dacă locația e invalidă (0,0) sau viteza e prea mare, blocăm extracția fizică
        if ((coords.lat === 0 && coords.lng === 0) || (speed > 15 && d > 0.2)) { 
             throw new HttpsError('permission-denied', 'Walking speed exceeded or invalid GPS.');
        }
    }

    // SERVER-SIDE VALUE DEFINITION
    let finalValue = 100; 
    if (category === 'LANDMARK' || category === 'EVENT') finalValue = 1000;
    if (category === 'AD_REWARD') finalValue = 500;
    if (category === 'GIFTBOX') finalValue = Math.floor(Math.random() * 901) + 100; // 100 - 1000 random bonus
    
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
            coords: coords || null,
            timestamp: FieldValue.serverTimestamp(),
            status: "pending"
        });

        // IMPORTANȚĂ CRITICĂ: Nu actualizăm locația dacă extracția este staționară (reclame)
        // pentru a nu teleporta utilizatorul la (0,0) și a bloca check-ul de viteză următor.
        if (!isStationaryClaim && coords && coords.lat !== 0) {
            await userRef.set({
                lastActiveLocation: coords,
                lastActiveAt: FieldValue.serverTimestamp()
            }, { merge: true });
        }

        return { success: true, verifiedValue: finalValue };
    } catch (e: any) {
        throw new HttpsError('internal', 'Extraction failed.');
    }
});

/**
 * SECURE REFERRAL HANDLER
 */
export const secureReferral = onCall(async (request) => {
    const { referrerId, userId, userName, initData } = request.data || {};

    if (!verifyTelegramData(initData)) {
        throw new HttpsError('unauthenticated', 'Invalid integrity check.');
    }

    const newUserRef = db.collection('users').doc(String(userId));
    const userSnap = await newUserRef.get();
    
    if (userSnap.exists && userSnap.data()?.hasClaimedReferral) {
        return { success: false, message: "Referral already processed." };
    }

    const batch = db.batch();
    const referrerRef = db.collection('users').doc(String(referrerId));

    // 1. Recompensă Referer (50 Pct)
    batch.set(referrerRef, {
        balance: FieldValue.increment(50),
        referralBalance: FieldValue.increment(50),
        referrals: FieldValue.increment(1),
        referralNames: FieldValue.arrayUnion(userName || "Hunter")
    }, { merge: true });

    // 2. Recompensă Bun Venit pentru cel invitat (25 Pct)
    // Folosim merge:true pentru a nu suprascrie doc-ul dacă există deja
    batch.set(newUserRef, {
        balance: FieldValue.increment(25),
        gameplayBalance: FieldValue.increment(25),
        hasClaimedReferral: true
    }, { merge: true });

    await batch.commit();
    return { success: true };
});

export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const userRef = db.collection('users').doc(String(claim.userId));

    try {
        if (claim.status === 'verified') return;
        const value = Number(claim.claimedValue || 0);
        const tonValue = Number(claim.tonReward || 0);
        const category = claim.category || 'URBAN';
        const spawnId = claim.spawnId;

        const userUpdate: any = {
            balance: FieldValue.increment(value),
            tonBalance: FieldValue.increment(tonValue),
            lastActive: FieldValue.serverTimestamp()
        };

        if (spawnId && !spawnId.startsWith('ad-')) {
            userUpdate.collectedIds = FieldValue.arrayUnion(spawnId);
        }

        if (category === 'AD_REWARD') {
            userUpdate.dailySupplyBalance = FieldValue.increment(value);
            userUpdate.lastDailyClaim = Date.now();
        } else if (category === 'MERCHANT') {
            userUpdate.merchantBalance = FieldValue.increment(value);
        } else if (category === 'LANDMARK') {
            userUpdate.rareBalance = FieldValue.increment(value);
        } else if (category === 'EVENT') {
            userUpdate.eventBalance = FieldValue.increment(value);
        } else if (category === 'GIFTBOX') {
            userUpdate.gameplayBalance = FieldValue.increment(value);
        } else {
            userUpdate.gameplayBalance = FieldValue.increment(value);
        }

        await userRef.set(userUpdate, { merge: true });
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
            config: { systemInstruction: "You are ELZR Scout. Be brief.", temperature: 0.7 }
        });
        return { text: response.text };
    } catch (e: any) {
        throw new HttpsError('internal', 'AI sync error.');
    }
});
