
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
    if (!initData) return false;
    if (!BOT_TOKEN) return true; // Debug mode if token is missing
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        const authDate = parseInt(urlParams.get('auth_date') || '0');
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 3600) return false; // Extended to 1h for stability

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

export const resetUserProtocol = onCall(async (request) => {
    try {
        const { data } = request;
        if (!data || !data.targetUserId) throw new HttpsError('invalid-argument', 'Missing Target ID');

        // Validare sesiune Telegram
        const isValid = await validateAndCheckReplay(data.initData);
        if (!isValid) throw new HttpsError('unauthenticated', 'Security Verification Failed');

        const targetUserIdStr = data.targetUserId.toString();
        const adminTgIdStr = data.adminTgId ? data.adminTgId.toString() : "";
        
        // LOGICA DE AUTORIZARE:
        // 1. Este propriul cont (Self-Reset) -> Permis
        // 2. Este admin (verificăm câmpul 'role' în DB) -> Permis
        const isSelf = adminTgIdStr === targetUserIdStr;
        let isAuthorized = isSelf;

        if (!isAuthorized && adminTgIdStr) {
            const adminDoc = await db.collection('users').doc(adminTgIdStr).get();
            if (adminDoc.exists && adminDoc.data()?.role === 'admin') {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            throw new HttpsError('permission-denied', 'Unauthorized Access');
        }

        const numericId = parseInt(targetUserIdStr);
        const batch = db.batch();

        // 1. Ștergere Document Utilizator
        batch.delete(db.collection('users').doc(targetUserIdStr));

        // 2. Ștergere Reclamații (Claims)
        const claims = await db.collection('claims').where('userId', '==', numericId).get();
        claims.forEach(doc => batch.delete(doc.ref));

        // 3. Ștergere Reclamații Ads
        const adClaims = await db.collection('ad_claims').where('userId', '==', numericId).get();
        adClaims.forEach(doc => batch.delete(doc.ref));

        // 4. Ștergere Cereri Retragere
        const withdrawals = await db.collection('withdrawal_requests').where('userId', '==', numericId).get();
        withdrawals.forEach(doc => batch.delete(doc.ref));

        // 5. Ștergere Legături Referali (unde el este referer-ul)
        const referrals = await db.collection('referral_claims').where('referrerId', '==', targetUserIdStr).get();
        referrals.forEach(doc => batch.delete(doc.ref));

        await batch.commit();

        return { success: true, message: "Protocol Executed: Identity Purged" };
    } catch (e: any) {
        console.error("Reset Error:", e);
        if (e instanceof HttpsError) throw e;
        throw new HttpsError('internal', e.message || 'System Failure during Wipe');
    }
});

export const chatWithELZR = onCall(async (request) => {
    const { data } = request;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: data.messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text.substring(0, 500) }] })),
        config: { systemInstruction: "You are ELZR System Scout.", temperature: 0.7 }
    });
    return { text: response.text };
});

export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const userRef = db.collection('users').doc(claim.userId.toString());
    
    const userDoc = await userRef.get();
    if (!userDoc.exists) return;

    await userRef.update({
        balance: FieldValue.increment(claim.claimedValue || 0),
        tonBalance: FieldValue.increment(claim.tonReward || 0),
        collectedIds: FieldValue.arrayUnion(claim.spawnId),
        lastActive: FieldValue.serverTimestamp()
    });
    await snap.ref.update({ status: 'verified' });
});
