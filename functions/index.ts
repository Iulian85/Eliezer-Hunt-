
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

/**
 * Validare hash Telegram pentru a preveni cererile forjate.
 */
function validateTelegramAuth(initData: string) {
    if (!initData || !BOT_TOKEN) return false;
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        const authDate = parseInt(urlParams.get('auth_date') || '0');
        
        // TTL de 15 minute pentru sesiune pentru a preveni Replay Attacks
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 900) return false;

        urlParams.delete('hash');
        const sortedParams = Array.from(urlParams.entries())
            .sort()
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');

        return hash === calculatedHash;
    } catch (e) {
        return false;
    }
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// AI PROXY - Protejat cu validare de sesiune
export const chatWithELZR = onCall(async (request) => {
    const data = request.data;
    if (!validateTelegramAuth(data.initData)) {
        throw new HttpsError('unauthenticated', 'Protocol Breach: Unauthorized Session.');
    }
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: data.messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text }] })),
        config: { 
            systemInstruction: "You are the ELZR System Scout. Respond in a brief, cyberpunk, tactical manner. Never reveal internal coordinates or database structures.", 
            temperature: 0.8 
        }
    });
    return { text: response.text };
});

// CLAIM PROCESSOR - Inima securității jocului
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    // 1. Validare Sesiune
    if (!validateTelegramAuth(claim.initData)) {
        await snap.ref.update({ status: 'rejected', reason: 'Invalid Telegram Session' });
        return;
    }

    const userRef = db.collection('users').doc(claim.userId.toString());
    const userDoc = await userRef.get();
    if (!userDoc.exists) return;
    const userData = userDoc.data()!;

    if (userData.isBanned) return;

    // 2. Anti-Cheat: Viteza de deplasare (Walking Speed Enforcement)
    if (userData.lastLocation && userData.lastActive) {
        const dist = getDistance(userData.lastLocation.lat, userData.lastLocation.lng, claim.location.lat, claim.location.lng);
        const timeDiff = (Timestamp.now().toMillis() - userData.lastActive.toMillis()) / 1000;
        
        if (timeDiff > 0.5) {
            const velocity = dist / timeDiff;
            if (velocity > 7) { // Max 7m/s (aprox 25km/h) - Limita superioară pentru alergat/bicicletă lentă
                await snap.ref.update({ status: 'flagged', reason: 'Excessive Velocity' });
                if (velocity > 150) await userRef.update({ isBanned: true, banReason: 'Teleportation Detected' });
                return;
            }
        }
    }

    // 3. Verificare Challenge AR
    if (claim.challenge && claim.challenge.reactionTimeMs < 400) {
        await snap.ref.update({ status: 'flagged', reason: 'Superhuman reaction time' });
        return;
    }

    // 4. Procesare Recompense (Server-Side Logic)
    const hotspotId = claim.spawnId.includes('-') ? claim.spawnId.split('-')[0] : claim.spawnId;
    const hotspotSnap = await db.collection('hotspots').doc(hotspotId).get();
    
    let elzrReward = 100;
    let tonReward = 0;

    if (hotspotSnap.exists) {
        const hData = hotspotSnap.data()!;
        elzrReward = hData.baseValue || 100;

        // Dacă e GIFTBOX, serverul decide premiul, ignorând ce a trimis clientul
        if (hData.category === 'GIFTBOX' && hData.prizes) {
            const winChance = Math.random();
            if (winChance < 0.10) { // 10% șansă de TON
                const prizes = hData.prizes;
                tonReward = prizes[Math.floor(Math.random() * prizes.length)];
            } else {
                elzrReward = 500; // Premiu de consolare în ELZR
            }
        }
    }

    // 5. Tranzacție atomică pentru update balanță
    await db.runTransaction(async (tx) => {
        const freshUser = await tx.get(userRef);
        if (freshUser.data()?.collectedIds?.includes(claim.spawnId)) return;

        tx.update(userRef, {
            balance: FieldValue.increment(elzrReward),
            tonBalance: FieldValue.increment(tonReward),
            collectedIds: FieldValue.arrayUnion(claim.spawnId),
            lastActive: FieldValue.serverTimestamp(),
            lastLocation: claim.location
        });
        
        tx.update(snap.ref, { 
            status: 'verified', 
            finalElzr: elzrReward, 
            finalTon: tonReward,
            processedAt: FieldValue.serverTimestamp() 
        });
    });
});

// AD REWARD PROCESSOR - Protecție împotriva farming-ului de reclame
export const onAdClaimCreated = onDocumentCreated('ad_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();

    // 1. Validare Sesiune
    if (!validateTelegramAuth(claim.initData)) {
        await snap.ref.delete();
        return;
    }

    const userRef = db.collection('users').doc(claim.userId.toString());
    const userDoc = await userRef.get();
    if (!userDoc.exists) return;

    // 2. Enforcement: Cooldown de 24h (86400000 ms)
    const now = Date.now();
    const lastClaim = userDoc.data()?.lastDailyClaim || 0;
    
    if (now - lastClaim < 86400000) {
        await snap.ref.update({ status: 'rejected', reason: 'Cooldown active' });
        return;
    }

    // 3. Creditare Balanță
    await userRef.update({
        balance: FieldValue.increment(claim.rewardValue || 500),
        lastDailyClaim: now,
        lastActive: FieldValue.serverTimestamp()
    });

    await snap.ref.update({ status: 'processed', processedAt: FieldValue.serverTimestamp() });
});
