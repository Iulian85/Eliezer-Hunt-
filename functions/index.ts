
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/functions/firestore'; // Fix import path for onDocumentCreated
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();

/**
 * REZOLVARE RESET ADMIN:
 * Această funcție nu mai șterge documentul (deleteDoc), ci face un reset la zero pe toate balanțele.
 */
export const resetUserProtocol = onCall(async (request) => {
    // 1. Validăm ID-ul trimis de pe Frontend
    const targetUserId = request.data?.targetUserId;
    if (!targetUserId) {
        throw new HttpsError('invalid-argument', 'Missing targetUserId');
    }

    const idStr = targetUserId.toString();
    const idNum = parseInt(idStr);

    try {
        console.log(`[SYSTEM] Starting Soft Reset for Admin: ${idStr}`);

        // 2. Definirea obiectului de reset conform cerințelor exacte
        const resetPayload = {
            balance: 0,
            tonBalance: 0,
            gameplayBalance: 0,
            rareBalance: 0,
            eventBalance: 0,
            dailySupplyBalance: 0,
            merchantBalance: 0,
            referralBalance: 0,
            collectedIds: [],
            referralNames: [],
            hasClaimedReferral: false,
            lastAdWatch: 0,
            lastDailyClaim: 0,
            adsWatched: 0,
            sponsoredAdsWatched: 0,
            rareItemsCollected: 0,
            eventItemsCollected: 0,
            referrals: 0,
            lastActive: FieldValue.serverTimestamp() // Păstrăm tot restul: username, joinedAt, etc.
        };

        // 3. Update profil utilizator - Folosim set merge:true ca să nu crape niciodată (internal error fix)
        await db.collection('users').doc(idStr).set(resetPayload, { merge: true });

        // 4. Curățare Claims & Referrals (Batch Delete)
        const deleteHistory = async (col: string, field: string) => {
            const snap = await db.collection(col).where(field, 'in', [idStr, idNum]).get();
            if (snap.empty) return;
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        };

        // Ștergem doar claims făcute de admin și referrali unde el este referrer
        await deleteHistory('claims', 'userId');
        await deleteHistory('ad_claims', 'userId');
        await deleteHistory('referral_claims', 'referrerId');

        return { success: true, message: "ADMIN_ACCOUNT_RESET_COMPLETE" };

    } catch (e: any) {
        console.error("FATAL RESET ERROR:", e);
        throw new HttpsError('internal', `Backend error: ${e.message}`);
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
