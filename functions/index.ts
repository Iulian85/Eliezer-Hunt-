
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
 * Verifică dacă amprenta trimisă corespunde celei înregistrate (Device Binding)
 */
async function verifyDeviceBinding(userId: string, incomingFingerprint: string): Promise<boolean> {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return true; // Prima înregistrare
    
    const storedFingerprint = userDoc.data()?.deviceFingerprint;
    // Dacă utilizatorul are deja o amprentă și ea nu coincide cu cea primită -> Blocat
    if (storedFingerprint && storedFingerprint !== incomingFingerprint) {
        return false;
    }
    return true;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// AI PROXY - Acum verifică și amprenta dispozitivului
export const chatWithELZR = onCall(async (request) => {
    const { data, rawRequest } = request;
    if (!(await validateAndCheckReplay(data.initData))) {
        throw new HttpsError('unauthenticated', 'Session Expired');
    }

    const userData = JSON.parse(new URLSearchParams(data.initData).get('user') || '{}');
    const userId = userData.id?.toString();
    if (!userId) throw new HttpsError('internal', 'Invalid Identity');

    // Verificare Hardware Lock
    if (!(await verifyDeviceBinding(userId, data.fingerprint))) {
        throw new HttpsError('permission-denied', 'SECURITY ALERT: Device Mismatch detected.');
    }

    const anyRequest = rawRequest as any;
    const ip = anyRequest.headers?.['x-forwarded-for'] || anyRequest.socket?.remoteAddress;
    const country = anyRequest.headers?.['x-appengine-country'] || "Unknown";

    await db.collection('users').doc(userId).set({
        lastIp: ip,
        lastIpCountry: country,
        lastSecurityCheck: FieldValue.serverTimestamp()
    }, { merge: true });

    // Initializing Gemini API according to guidelines: Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: data.messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text.substring(0, 500) }] })),
        config: { systemInstruction: "You are ELZR System Scout. Be tactical.", temperature: 0.7 }
    });

    return { text: response.text };
});

// CLAIM PROCESSOR - Validare hardware pentru fiecare colectare
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    // Verificări de Securitate de bază
    if (!(await validateAndCheckReplay(claim.initData))) {
        await snap.ref.update({ status: 'rejected', reason: 'Auth Failure' });
        return;
    }

    const userRef = db.collection('users').doc(claim.userId.toString());
    const userDoc = await userRef.get();
    if (!userDoc.exists || userDoc.data()?.isBanned) return;
    const userData = userDoc.data()!;

    // Verificare Hardware Lock (Fingerprint match)
    if (userData.deviceFingerprint && userData.deviceFingerprint !== claim.fingerprint) {
        await snap.ref.update({ status: 'rejected', reason: 'Hardware Mismatch (Multi-Device Attempt)' });
        await userRef.update({ isBanned: true, banReason: 'Unauthorized multi-device extraction' });
        return;
    }

    // Corelare GPS vs IP
    if (userData.lastIpCountry && userData.lastIpCountry !== "Unknown" && claim.location.countryCode) {
        if (userData.lastIpCountry !== claim.location.countryCode) {
            await snap.ref.update({ status: 'flagged', reason: 'IP/GPS Country Mismatch' });
            await userRef.update({ riskScore: FieldValue.increment(20) });
        }
    }

    // Detecție Mișcare Sintetică
    if (userData.lastLocation && userData.lastActive) {
        const dist = getDistance(userData.lastLocation.lat, userData.lastLocation.lng, claim.location.lat, claim.location.lng);
        const timeDiff = (Timestamp.now().toMillis() - userData.lastActive.toMillis()) / 1000;
        
        if (timeDiff > 0 && dist > 0) {
            const velocity = dist / timeDiff;
            const lastVelocity = userData.lastVelocity || 0;
            if (Math.abs(velocity - lastVelocity) < 0.000001 && velocity > 0.5) {
                await userRef.update({ syntheticMoveCount: FieldValue.increment(1) });
            }
            await userRef.update({ lastVelocity: velocity });
        }
    }

    // Logică Recompense
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
            lastActive: FieldValue.serverTimestamp(),
            lastLocation: claim.location
        });
        tx.update(snap.ref, { status: 'verified', finalElzr: elzrReward, finalTon: tonReward });
    });
});

// AD REWARD - Verificări hardware și limite temporale
export const onAdClaimCreated = onDocumentCreated('ad_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();

    if (!(await validateAndCheckReplay(claim.initData))) {
        await snap.ref.delete();
        return;
    }

    const userRef = db.collection('users').doc(claim.userId.toString());
    const userDoc = await userRef.get();
    if (!userDoc.exists || userDoc.data()?.isBanned) return;

    // Verificare Hardware Lock
    if (userDoc.data()?.deviceFingerprint && userDoc.data()?.deviceFingerprint !== claim.fingerprint) {
        await snap.ref.delete();
        return;
    }

    const authDate = parseInt(new URLSearchParams(claim.initData).get('auth_date') || '0');
    const nowSec = Math.floor(Date.now() / 1000);
    const duration = nowSec - authDate;

    if (duration < 15 || duration > 120) {
        await snap.ref.update({ status: 'rejected', reason: 'Invalid Watch Duration' });
        return;
    }

    const dailyAds = userDoc.data()?.dailyAdsCount || 0;
    const lastDailyReset = userDoc.data()?.lastAdsReset || 0;
    const isNewDay = (Date.now() - lastDailyReset) > 86400000;

    if (!isNewDay && dailyAds >= 10) {
        await snap.ref.update({ status: 'rejected', reason: 'Daily Ad Limit Reached' });
        return;
    }

    await userRef.update({
        balance: FieldValue.increment(claim.rewardValue || 500),
        dailyAdsCount: isNewDay ? 1 : FieldValue.increment(1),
        lastAdsReset: isNewDay ? Date.now() : lastDailyReset,
        lastActive: FieldValue.serverTimestamp()
    });

    await snap.ref.update({ status: 'processed' });
});
