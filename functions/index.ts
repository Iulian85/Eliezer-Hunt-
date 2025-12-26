
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();

/**
 * PROTOCOL RESET ELZR ADMIN (7319782429)
 * Resetează progresul și balanța la zero absolut, păstrând identitatea profilului.
 */
export const resetUserProtocol = onCall(async (request) => {
    const targetUserId = request.data?.targetUserId;
    if (!targetUserId) {
        throw new HttpsError('invalid-argument', 'Missing targetUserId');
    }

    const idStr = targetUserId.toString();
    const idNum = parseInt(idStr);

    try {
        console.log(`[PROTOCOL-ELZR] Initiating Nuclear Reset for ID: ${idStr}`);

        // Lista exactă de 18 câmpuri pentru resetarea totală
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
            lastActive: FieldValue.serverTimestamp()
        };

        // Folosim set cu merge:true pentru a evita eroarea 'internal' în cazul în care documentul e blocat sau corupt
        await db.collection('users').doc(idStr).set(resetPayload, { merge: true });

        // Helper pentru curățare loturi (batch)
        const purgeData = async (col: string, field: string) => {
            const snap = await db.collection(col).where(field, 'in', [idStr, idNum]).get();
            if (snap.empty) return;
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        };

        // Curățăm istoricul de extrageri și referalii unde admin-ul este cel care a invitat
        await purgeData('claims', 'userId');
        await purgeData('ad_claims', 'userId');
        await purgeData('referral_claims', 'referrerId');

        return { success: true, message: "IDENTITY_PURGED_AND_REINITIALIZED" };
    } catch (e: any) {
        console.error("CRITICAL RESET ERROR:", e);
        throw new HttpsError('internal', e.message);
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
