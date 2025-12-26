import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();

const ADMIN_TELEGRAM_ID = 7319782429; // ID-ul tău fix ca admin

/**
 * ADMIN ONLY RESET – cu verificare biometrică + UUID
 */
export const resetUserProtocol = onCall(async (request) => {
    const { targetUserId, fingerprint, cloudUuid } = request.data || {};

    if (!targetUserId || !fingerprint || !cloudUuid) {
        throw new HttpsError('invalid-argument', 'Missing required data');
    }

    // 1. Verifică că reset-ul e doar pentru admin
    if (parseInt(targetUserId.toString()) !== ADMIN_TELEGRAM_ID) {
        throw new HttpsError('permission-denied', 'Reset allowed only for Admin');
    }

    try {
        const userRef = db.collection('users').doc(targetUserId.toString());
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'Admin profile not found');
        }

        const userData = userDoc.data();

        // 2. Verifică amprenta + UUID salvate în profil
        if (userData.deviceFingerprint !== fingerprint || userData.cloudStorageId !== cloudUuid) {
            throw new HttpsError('permission-denied', 'Biometric verification failed');
        }

        console.log(`[ADMIN RESET] Verified biometric for Admin ${ADMIN_TELEGRAM_ID}`);

        // 3. Reset selectiv – balance la 0, referali șterși
        await userRef.update({
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
        });

        // 4. Șterge referral-urile date de tine (nu cele primite)
        const referralSnap = await db.collection('referral_claims')
            .where('referrerId', '==', targetUserId.toString())
            .get();

        if (!referralSnap.empty) {
            const batch = db.batch();
            referralSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }

        return { success: true, message: "ADMIN ACCOUNT SUCCESSFULLY RESET" };

    } catch (e: any) {
        console.error("[ADMIN RESET ERROR]:", e);
        throw new HttpsError('internal', 'Reset failed: ' + e.message);
    }
});

// Restul funcțiilor tale rămân neschimbate
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