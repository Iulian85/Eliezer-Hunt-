
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
    if (!initData || !BOT_TOKEN) return true; // Permitem în debug dacă lipsește tokenul
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        const authDate = parseInt(urlParams.get('auth_date') || '0');
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 1200) return false; // Sesiune validă 20 min

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

// FUNCȚIE SERVER: Ștergere DEFINITIVĂ
export const resetUserProtocol = onCall(async (request) => {
    try {
        const { data } = request;
        if (!data || !data.targetUserId) throw new HttpsError('invalid-argument', 'Missing Target ID');

        if (!(await validateAndCheckReplay(data.initData))) {
            throw new HttpsError('unauthenticated', 'Session Expired');
        }

        const targetUserId = data.targetUserId.toString();
        const adminTgId = data.adminTgId ? data.adminTgId.toString() : "";
        
        // Verificăm dacă cel care cere e Admin sau e auto-resetare
        const adminDoc = await db.collection('users').doc(adminTgId).get();
        const isSelf = adminTgId === targetUserId;
        const isAdmin = adminDoc.exists && adminDoc.data()?.role === 'admin';

        if (!isSelf && !isAdmin) {
            throw new HttpsError('permission-denied', 'Not Authorized');
        }

        // 1. Ștergem documentul User
        await db.collection('users').doc(targetUserId).delete();
        
        // 2. Ștergem toate colectările (claim-urile) acestui user
        const claimsQuery = await db.collection('claims').where('userId', '==', parseInt(targetUserId)).get();
        const batch = db.batch();
        claimsQuery.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        return { success: true };
    } catch (e: any) {
        throw new HttpsError('internal', e.message || 'Protocol Crash');
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
    await userRef.update({
        balance: FieldValue.increment(claim.claimedValue || 100),
        tonBalance: FieldValue.increment(claim.tonReward || 0),
        collectedIds: FieldValue.arrayUnion(claim.spawnId),
        lastActive: FieldValue.serverTimestamp()
    });
    await snap.ref.update({ status: 'verified' });
});
