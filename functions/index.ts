
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
    if (!request.data || !request.data.targetUserId) {
        throw new HttpsError('invalid-argument', 'Missing targetUserId');
    }

    const targetIdStr = request.data.targetUserId.toString();
    const targetIdNum = parseInt(targetIdStr);
    
    console.log(`[ADMIN-ACTION] Initializing Soft Reset for ID: ${targetIdStr}`);

    try {
        // 1. Definim setul de date pentru RESET (Zero Out)
        const resetData = {
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
            // Păstrăm: username, photoUrl, joinedAt, deviceFingerprint, biometricEnabled, walletAddress
            lastActive: FieldValue.serverTimestamp()
        };

        // 2. Executăm UPDATE pe profil (nu delete!)
        await db.collection('users').doc(targetIdStr).update(resetData);

        // 3. Helper pentru curățare loturi de documente asociate
        const purgeUserHistory = async (collectionName: string, fieldName: string, values: any[]) => {
            const snapshot = await db.collection(collectionName).where(fieldName, 'in', values).get();
            if (snapshot.empty) return;

            const chunks = [];
            const docs = snapshot.docs;
            for (let i = 0; i < docs.length; i += 450) {
                chunks.push(docs.slice(i, i + 450));
            }

            for (const chunk of chunks) {
                const batch = db.batch();
                chunk.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
        };

        const ids = [targetIdStr, targetIdNum];

        // 4. Curățăm istoricul de tranzacții care ar putea declanșa recalculări de balanță
        await purgeUserHistory('claims', 'userId', ids);
        await purgeUserHistory('ad_claims', 'userId', ids);
        await purgeUserHistory('withdrawal_requests', 'userId', ids);
        await purgeUserHistory('ad_sessions', 'userId', ids);
        
        // 5. Ștergem referral-urile trimise de acest admin (unde el este referrer)
        await purgeUserHistory('referral_claims', 'referrerId', ids);

        console.log(`[SUCCESS] Account ${targetIdStr} reset to zero.`);
        return { success: true, message: "ACCOUNT_REINITIALIZED" };

    } catch (e: any) {
        console.error("[CRITICAL] Reset Protocol Failed:", e);
        // Dacă eroarea este că documentul nu există (deși n-ar trebui), e tot un fel de succes pentru reset
        if (e.message.includes('NOT_FOUND')) {
             return { success: true, message: "ALREADY_CLEAN" };
        }
        throw new HttpsError('internal', `Reset failed: ${e.message}`);
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
