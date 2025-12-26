
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
    try {
        const data = request.data;
        if (!data || !data.targetUserId) {
            throw new HttpsError('invalid-argument', 'Missing targetUserId');
        }

        const targetIdStr = data.targetUserId.toString();
        const targetIdNum = parseInt(targetIdStr);
        
        console.log(`Executing Wipe Protocol for ID: ${targetIdStr}`);

        const batch = db.batch();

        // 1. Ștergere Profil Utilizator
        batch.delete(db.collection('users').doc(targetIdStr));

        // 2. Curățare Claims (Balanță) - Verificăm și String și Number pentru siguranță
        const claimsStr = await db.collection('claims').where('userId', '==', targetIdStr).get();
        claimsStr.forEach(doc => batch.delete(doc.ref));
        
        const claimsNum = await db.collection('claims').where('userId', '==', targetIdNum).get();
        claimsNum.forEach(doc => batch.delete(doc.ref));

        // 3. Curățare Ads
        const adClaimsStr = await db.collection('ad_claims').where('userId', '==', targetIdStr).get();
        adClaimsStr.forEach(doc => batch.delete(doc.ref));
        
        const adClaimsNum = await db.collection('ad_claims').where('userId', '==', targetIdNum).get();
        adClaimsNum.forEach(doc => batch.delete(doc.ref));

        // 4. Curățare Referals (unde el a invitat pe alții)
        const refs = await db.collection('referral_claims').where('referrerId', '==', targetIdStr).get();
        refs.forEach(doc => batch.delete(doc.ref));

        const refsNum = await db.collection('referral_claims').where('referrerId', '==', targetIdNum).get();
        refsNum.forEach(doc => batch.delete(doc.ref));

        // 5. Curățare Retrageri
        const withdrawals = await db.collection('withdrawal_requests').where('userId', '==', targetIdNum).get();
        withdrawals.forEach(doc => batch.delete(doc.ref));

        await batch.commit();

        return { success: true, message: "Server Wipe Complete" };
    } catch (e: any) {
        console.error("Critical Reset Error:", e);
        throw new HttpsError('internal', e.message || 'Unknown error');
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
