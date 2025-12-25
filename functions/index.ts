
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

function sanitizeAiInput(messages: any[]) {
    const forbiddenPatterns = [/ignore/i, /system/i, /instruction/i, /database/i, /coordinates/i, /secret/i];
    return messages.map(m => ({
        ...m,
        text: forbiddenPatterns.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED]"), m.text)
    }));
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

function validateTelegramAuth(initData: string) {
    if (!initData || !BOT_TOKEN) return false;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    const authDate = parseInt(urlParams.get('auth_date') || '0');
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 900) return false;
    urlParams.delete('hash');
    const sortedParams = Array.from(urlParams.entries()).sort().map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');
    return hash === calculatedHash;
}

// AI PROXY
export const chatWithELZR = onCall(async (request) => {
    const data = request.data;
    if (!validateTelegramAuth(data.initData)) {
        throw new HttpsError('unauthenticated', 'Security Breach.');
    }
    const sanitizedMessages = sanitizeAiInput(data.messages);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: sanitizedMessages.map((m: any) => ({ role: m.role, parts: [{ text: m.text }] })),
        config: { systemInstruction: "Cyberpunk ELZR Scout. Stay in character. No dev info.", temperature: 0.7 }
    });
    return { text: response.text };
});

// CLAIM PROCESSOR (Hardened)
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    if (!validateTelegramAuth(claim.initData)) {
        await snap.ref.update({ status: 'failed', reason: 'Invalid session' });
        return;
    }

    const userRef = db.collection('users').doc(claim.userId.toString());
    const userDoc = await userRef.get();
    if (!userDoc.exists) return;
    const userData = userDoc.data()!;

    if (userData.isBanned) return;

    // SECURITY: Verificare server-side a protocolului biometric
    // Dacă utilizatorul are biometria activată (default), dar challenge-ul lipsește, blocăm colectarea.
    if (userData.biometricEnabled !== false && !claim.challenge) {
        await snap.ref.update({ status: 'flagged', reason: 'Biometric bypass attempt' });
        return;
    }

    // Challenge Verification (Anti-AR Botting)
    if (claim.challenge) {
        if (claim.challenge.reactionTimeMs < 500) {
            await snap.ref.update({ status: 'flagged', reason: 'Impossible reaction time' });
            return;
        }
        if (claim.challenge.finalDistance > 7) {
            await snap.ref.update({ status: 'failed', reason: 'Out of AR range' });
            return;
        }
    }

    // Velocity Check (REDUȘ de la 250 la 50 conform auditului)
    if (userData.lastLocation && userData.lastActive) {
        const distTraveled = getDistance(userData.lastLocation.lat, userData.lastLocation.lng, claim.location.lat, claim.location.lng);
        const timeDiff = (Timestamp.now().toMillis() - userData.lastActive.toMillis()) / 1000;
        if (timeDiff > 2 && (distTraveled / timeDiff) > 50) { // Max 180 km/h
            await snap.ref.update({ status: 'flagged', reason: 'Anomalous velocity detected' });
            return;
        }
    }

    const hotspotId = claim.spawnId.includes('-') ? claim.spawnId.split('-')[0] : claim.spawnId;
    const hotspotSnap = await db.collection('hotspots').doc(hotspotId).get();
    if (!hotspotSnap.exists) return;
    const realValue = hotspotSnap.data()!.baseValue || 100;

    await db.runTransaction(async (transaction) => {
        const freshUserDoc = await transaction.get(userRef);
        if (freshUserDoc.data()?.collectedIds?.includes(claim.spawnId)) return;
        
        transaction.update(userRef, {
            balance: FieldValue.increment(realValue),
            collectedIds: FieldValue.arrayUnion(claim.spawnId),
            lastActive: FieldValue.serverTimestamp(),
            lastLocation: claim.location
        });
        transaction.update(snap.ref, { status: 'verified', processedAt: FieldValue.serverTimestamp() });
    });
});

export const onAdClaimCreated = onDocumentCreated('ad_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    if (!validateTelegramAuth(claim.initData)) return;

    const userRef = db.collection('users').doc(claim.userId.toString());
    await userRef.update({
        balance: FieldValue.increment(claim.rewardValue),
        lastDailyClaim: Date.now(),
        lastActive: FieldValue.serverTimestamp()
    });
    await snap.ref.update({ status: 'processed' });
});
