
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
 * Validare hash Telegram + Protecție Anti-Replay
 */
async function validateAndCheckReplay(initData: string): Promise<boolean> {
    if (!initData || !BOT_TOKEN) return false;
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        const authDate = parseInt(urlParams.get('auth_date') || '0');
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 900) return false;

        urlParams.delete('hash');
        const sortedParams = Array.from(urlParams.entries()).sort().map(([k, v]) => `${k}=${v}`).join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');
        if (hash !== calculatedHash) return false;

        const nonceHash = crypto.createHash('md5').update(initData).digest('hex');
        const nonceRef = db.collection('used_nonces').doc(nonceHash);
        const nonceDoc = await nonceRef.get();
        if (nonceDoc.exists) return false;

        await nonceRef.set({ usedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 3600000) });
        return true;
    } catch (e) { return false; }
}

/**
 * Verifică Dual Device Binding (Fingerprint + Telegram CloudStorage UUID)
 */
async function verifyDeviceBinding(userId: string, incomingFingerprint: string, incomingCloudId: string): Promise<boolean> {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return true;
    
    const data = userDoc.data()!;
    // Verificăm ambele ID-uri pentru a neutraliza fingerprint spoofing
    if (data.deviceFingerprint && data.deviceFingerprint !== incomingFingerprint) return false;
    if (data.cloudStorageId && data.cloudStorageId !== incomingCloudId) return false;
    
    return true;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// AI PROXY - Acum cu RATE LIMITING (Vulnerabilitate Recomandată)
export const chatWithELZR = onCall(async (request) => {
    const { data, rawRequest } = request;
    if (!(await validateAndCheckReplay(data.initData))) {
        throw new HttpsError('unauthenticated', 'Session Expired');
    }

    const userData = JSON.parse(new URLSearchParams(data.initData).get('user') || '{}');
    const userId = userData.id?.toString();
    if (!userId) throw new HttpsError('internal', 'Invalid Identity');

    // 1. Verificare Dual Hardware Lock
    if (!(await verifyDeviceBinding(userId, data.fingerprint, data.cloudId))) {
        throw new HttpsError('permission-denied', 'SECURITY ALERT: Device Identity Mismatch.');
    }

    // 2. Rate Limiting: Max 20 mesaje pe oră
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const lastChatReset = userDoc.data()?.lastChatReset || 0;
    const currentChatCount = userDoc.data()?.chatCount || 0;
    const isNewHour = (Date.now() - lastChatReset) > 3600000;

    if (!isNewHour && currentChatCount >= 20) {
        throw new HttpsError('resource-exhausted', 'Protocol overload. Try again in 1 hour.');
    }

    await userRef.update({
        chatCount: isNewHour ? 1 : FieldValue.increment(1),
        lastChatReset: isNewHour ? Date.now() : lastChatReset,
        lastActive: FieldValue.serverTimestamp()
    });

    const anyRequest = rawRequest as any;
    const ip = anyRequest.headers?.['x-forwarded-for'] || anyRequest.socket?.remoteAddress;
    const country = anyRequest.headers?.['x-appengine-country'] || "Unknown";

    await userRef.update({ lastIp: ip, lastIpCountry: country });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: data.messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text.substring(0, 500) }] })),
        config: { systemInstruction: "You are ELZR System Scout. Be tactical.", temperature: 0.7 }
    });

    return { text: response.text };
});

// CLAIM PROCESSOR - Validare locație și identitate duală
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    if (!(await validateAndCheckReplay(claim.initData))) {
        await snap.ref.update({ status: 'rejected', reason: 'Auth Failure' });
        return;
    }

    const userId = claim.userId.toString();
    if (!(await verifyDeviceBinding(userId, claim.fingerprint, claim.cloudId))) {
        await snap.ref.update({ status: 'rejected', reason: 'Hardware Identity Fraud detected' });
        await db.collection('users').doc(userId).update({ isBanned: true });
        return;
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists || userDoc.data()?.isBanned) return;
    const userData = userDoc.data()!;

    // Verificari Geospațiale
    if (userData.lastIpCountry && userData.lastIpCountry !== "Unknown" && claim.location.countryCode) {
        if (userData.lastIpCountry !== claim.location.countryCode) {
            await userRef.update({ riskScore: FieldValue.increment(20) });
        }
    }

    const hotspotId = claim.spawnId.split('-')[0];
    const hotspotSnap = await db.collection('hotspots').doc(hotspotId).get();
    let elzrReward = 100;
    let tonReward = 0;

    if (hotspotSnap.exists) {
        const hData = hotspotSnap.data()!;
        elzrReward = hData.baseValue || 100;
        if (hData.category === 'GIFTBOX') {
            const roll = Math.random();
            if (roll < 0.10) tonReward = hData.prizes[Math.floor(Math.random() * hData.prizes.length)];
            else elzrReward = 400;
        }
    }

    await db.runTransaction(async (tx) => {
        const freshUser = await tx.get(userRef);
        if (freshUser.data()?.collectedIds?.includes(claim.spawnId)) return;
        tx.update(userRef, {
            balance: FieldValue.increment(elzrReward),
            tonBalance: FieldValue.increment(tonReward),
            collectedIds: FieldValue.arrayUnion(claim.spawnId),
            lastActive: FieldValue.serverTimestamp()
        });
        tx.update(snap.ref, { status: 'verified', finalElzr: elzrReward, finalTon: tonReward });
    });
});

// AD REWARD - Validare Stateful prin Ad Sessions (Vulnerabilitate Recomandată)
export const onAdClaimCreated = onDocumentCreated('ad_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();

    if (!(await validateAndCheckReplay(claim.initData))) {
        await snap.ref.delete();
        return;
    }

    const userId = claim.userId.toString();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists || userDoc.data()?.isBanned) return;

    // Verificare identitate hibridă
    if (!(await verifyDeviceBinding(userId, claim.fingerprint, claim.cloudId))) {
        await snap.ref.update({ status: 'rejected', reason: 'Identity Mismatch' });
        return;
    }

    // STATEFUL VALIDATION: Verificăm timestamp-ul real de start înregistrat pe server
    const sessionQuery = await db.collection('ad_sessions')
        .where('userId', '==', parseInt(userId))
        .where('status', '==', 'active')
        .orderBy('startTime', 'desc')
        .limit(1)
        .get();

    if (sessionQuery.empty) {
        await snap.ref.update({ status: 'rejected', reason: 'No active ad session recorded' });
        return;
    }

    const sessionDoc = sessionQuery.docs[0];
    const startTime = sessionDoc.data().startTime as Timestamp;
    const elapsedSeconds = (Timestamp.now().toMillis() - startTime.toMillis()) / 1000;

    // Trebuie să fi trecut cel puțin 15 secunde reali de la log-ul de start
    if (elapsedSeconds < 15 || elapsedSeconds > 300) {
        await snap.ref.update({ status: 'rejected', reason: 'Invalid session timing' });
        return;
    }

    const dailyAds = userDoc.data()?.dailyAdsCount || 0;
    const lastDailyReset = userDoc.data()?.lastAdsReset || 0;
    const isNewDay = (Date.now() - lastDailyReset) > 86400000;

    if (!isNewDay && dailyAds >= 10) {
        await snap.ref.update({ status: 'rejected', reason: 'Daily Cap reached' });
        return;
    }

    await userRef.update({
        balance: FieldValue.increment(claim.rewardValue || 500),
        dailyAdsCount: isNewDay ? 1 : FieldValue.increment(1),
        lastAdsReset: isNewDay ? Date.now() : lastDailyReset,
        lastActive: FieldValue.serverTimestamp()
    });

    // Închidem sesiunea
    await sessionDoc.ref.update({ status: 'completed', completedAt: FieldValue.serverTimestamp() });
    await snap.ref.update({ status: 'processed' });
});
