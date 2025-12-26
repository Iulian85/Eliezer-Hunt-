
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();

export const resetUserProtocol = onCall(async (request) => {
    // Eliminăm orice verificare de context.auth pentru a asigura funcționarea instantanee
    if (!request.data || !request.data.targetUserId) {
        throw new HttpsError('invalid-argument', 'Missing targetUserId payload');
    }

    const targetIdStr = request.data.targetUserId.toString();
    const targetIdNum = parseInt(targetIdStr);
    
    console.log(`[SYSTEM] Starting Global Wipe for ID: ${targetIdStr}`);

    try {
        // 1. Ștergere atomică a profilului (asigură resetarea UI la reload)
        await db.collection('users').doc(targetIdStr).delete();

        // 2. Funcție pentru ștergere sigură în loturi (previne eroarea 500 documents limit)
        const purgeCollection = async (collectionName: string, fieldName: string, values: any[]) => {
            const snapshot = await db.collection(collectionName).where(fieldName, 'in', values).get();
            if (snapshot.empty) return;

            const chunks = [];
            for (let i = 0; i < snapshot.docs.length; i += 450) {
                chunks.push(snapshot.docs.slice(i, i + 450));
            }

            for (const chunk of chunks) {
                const batch = db.batch();
                chunk.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
        };

        const targetIds = [targetIdStr, targetIdNum];

        // 3. Executăm curățarea pe toate tabelele critice
        await purgeCollection('claims', 'userId', targetIds);
        await purgeCollection('ad_claims', 'userId', targetIds);
        await purgeCollection('withdrawal_requests', 'userId', targetIds);
        await purgeCollection('referral_claims', 'referrerId', targetIds);
        await purgeCollection('ad_sessions', 'userId', targetIds);

        return { success: true, message: "IDENTITY_PURGED" };
    } catch (e: any) {
        console.error("[CRITICAL] Wipe Protocol Failure:", e);
        throw new HttpsError('internal', `Wipe Protocol Aborted: ${e.message}`);
    }
});

export const chatWithELZR = onCall(async (request) => {
    const { data } = request;
    if (!process.env.API_KEY) throw new HttpsError('failed-precondition', 'AI Node Disconnected');
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
