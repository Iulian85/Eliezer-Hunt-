
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

async function verifyDeviceBinding(userId: string, incomingFingerprint: string, incomingCloudId: string): Promise<boolean> {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return true;
    
    const data = userDoc.data()!;
    if (data.deviceFingerprint && data.deviceFingerprint !== incomingFingerprint) return false;
    if (data.cloudStorageId && data.cloudStorageId !== incomingCloudId) return false;
    
    return true;
}

export const chatWithELZR = onCall(async (request) => {
    const { data, rawRequest } = request;
    if (!(await validateAndCheckReplay(data.initData))) {
        throw new HttpsError('unauthenticated', 'Session Expired');
    }

    const userData = JSON.parse(new URLSearchParams(data.initData).get('user') || '{}');
    const userId = userData.id?.toString();
    if (!userId) throw new HttpsError('internal', 'Invalid Identity');

    if (!(await verifyDeviceBinding(userId, data.fingerprint, data.cloudId))) {
        throw new HttpsError('permission-denied', 'SECURITY ALERT: Device Identity Mismatch.');
    }

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

    // Logică Recompense & Mapare Categorii (Vulnerabilitate REZOLVATĂ)
    const hotspotId = claim.spawnId.split('-')[0];
    const hotspotSnap = await db.collection('hotspots').doc(hotspotId).get();
    
    let elzrReward = claim.claimedValue || 100;
    let tonReward = 0;
    let category = claim.category || 'URBAN';

    if (hotspotSnap.exists) {
        const hData = hotspotSnap.data()!;
        category = hData.category;
        elzrReward = hData.baseValue || elzrReward;
        if (category === 'GIFTBOX') {
            const roll = Math.random();
            if (roll < 0.15) tonReward = hData.prizes[Math.floor(Math.random() * hData.prizes.length)];
            else elzrReward = 400;
        }
    }

    await db.runTransaction(async (tx) => {
        const freshUser = await tx.get(userRef);
        if (freshUser.data()?.collectedIds?.includes(claim.spawnId)) return;
        
        // Creăm obiectul de update pentru balanțe
        const updatePayload: any = {
            balance: FieldValue.increment(elzrReward),
            tonBalance: FieldValue.increment(tonReward),
            collectedIds: FieldValue.arrayUnion(claim.spawnId),
            lastActive: FieldValue.serverTimestamp()
        };

        // MAPARE PUNCTE PE CATEGORII SPECIFICE (Pentru sectiunea Airdrop Estimation)
        if (category === 'LANDMARK') {
            updatePayload.rareBalance = FieldValue.increment(elzrReward);
        } else if (category === 'EVENT') {
            updatePayload.eventBalance = FieldValue.increment(elzrReward);
        } else if (category === 'MALL' || category === 'URBAN') {
            updatePayload.gameplayBalance = FieldValue.increment(elzrReward);
        } else if (category === 'MERCHANT') {
            updatePayload.merchantBalance = FieldValue.increment(elzrReward);
        } else if (category === 'AD_REWARD') {
            updatePayload.dailySupplyBalance = FieldValue.increment(elzrReward);
        }

        tx.update(userRef, updatePayload);
        tx.update(snap.ref, { status: 'verified', finalElzr: elzrReward, finalTon: tonReward, processedCategory: category });
    });
});

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

    if (!(await verifyDeviceBinding(userId, claim.fingerprint, claim.cloudId))) {
        await snap.ref.update({ status: 'rejected', reason: 'Identity Mismatch' });
        return;
    }

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

    const reward = claim.rewardValue || 500;

    await userRef.update({
        balance: FieldValue.increment(reward),
        dailySupplyBalance: FieldValue.increment(reward), // PUNCTELE DE AD DIN WALLET MERG AICI
        dailyAdsCount: isNewDay ? 1 : FieldValue.increment(1),
        lastAdsReset: isNewDay ? Date.now() : lastDailyReset,
        lastActive: FieldValue.serverTimestamp(),
        lastDailyClaim: Date.now()
    });

    await sessionDoc.ref.update({ status: 'completed', completedAt: FieldValue.serverTimestamp() });
    await snap.ref.update({ status: 'processed' });
});
