
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
 * RESET USER - IMPLEMENTARE V2 ROBUSTĂ
 */
export const resetUserProtocol = onCall(async (request) => {
    const data = request.data;
    const targetUserId = data?.targetUserId;

    if (!targetUserId) {
        console.error("[RESET] Missing targetUserId");
        throw new HttpsError('invalid-argument', 'ID utilizator lipsă.');
    }

    const idStr = targetUserId.toString();
    console.log(`[RESET START] Hunter ID: ${idStr}`);

    try {
        const userRef = db.collection('users').doc(idStr);
        
        const resetPayload = {
            balance: 0,
            tonBalance: 0,
            gameplayBalance: 0,
            rareBalance: 0,
            eventBalance: 0,
            dailySupplyBalance: 0,
            merchantBalance: 0,
            referralBalance: 0,
            adsWatched: 0,
            sponsoredAdsWatched: 0,
            rareItemsCollected: 0,
            eventItemsCollected: 0,
            collectedIds: [], 
            lastDailyClaim: 0,
            hasClaimedReferral: false,
            referrals: 0,
            referralNames: [],
            lastActive: FieldValue.serverTimestamp()
        };

        // Folosim SET cu merge:false pentru a șterge orice câmp vechi care nu e în payload
        await userRef.set(resetPayload);

        console.log(`[RESET SUCCESS] Data cleared for ${idStr}`);
        return { success: true, message: "Protocol Reset Complete" };

    } catch (e: any) {
        console.error("[RESET CRITICAL ERROR]", e);
        throw new HttpsError('internal', `Eroare sistem: ${e.message}`);
    }
});

/**
 * TRIGGER COLECTARE - PROCESARE INSTANTANEE
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) {
        console.error("[TRIGGER] No data snapshot");
        return;
    }
    
    const claim = snap.data();
    const claimId = event.params.claimId;
    
    if (!claim.userId) {
        console.error(`[TRIGGER] Claim ${claimId} misses userId`);
        return;
    }

    const userIdStr = claim.userId.toString();
    const userRef = db.collection('users').doc(userIdStr);
    
    console.log(`[CLAIM START] Processing ${claim.category} for user ${userIdStr}`);

    try {
        const value = Number(claim.claimedValue || 0);
        const tonValue = Number(claim.tonReward || 0);
        
        // Obiect de update cu incrementare atomică
        const updates: any = {
            balance: FieldValue.increment(value),
            tonBalance: FieldValue.increment(tonValue),
            lastActive: FieldValue.serverTimestamp()
        };

        // Adăugare ID în istoric dacă nu e reclamă
        if (claim.spawnId && !claim.spawnId.startsWith('ad-')) {
            updates.collectedIds = FieldValue.arrayUnion(claim.spawnId);
        }

        // Distribuție pe categorii
        const cat = claim.category;
        if (cat === 'URBAN' || cat === 'MALL' || cat === 'GIFTBOX') {
            updates.gameplayBalance = FieldValue.increment(value);
        } else if (cat === 'LANDMARK') {
            updates.rareBalance = FieldValue.increment(value);
        } else if (cat === 'EVENT') {
            updates.eventBalance = FieldValue.increment(value);
        } else if (cat === 'MERCHANT') {
            updates.merchantBalance = FieldValue.increment(value);
        } else if (cat === 'AD_REWARD') {
            updates.dailySupplyBalance = FieldValue.increment(value);
            updates.adsWatched = FieldValue.increment(1);
            updates.lastDailyClaim = Date.now();
        }

        // EXECUTĂM ACTUALIZAREA UTILIZATORULUI
        // Merge: true este vital aici dacă documentul utilizatorului a fost șters anterior
        await userRef.set(updates, { merge: true });

        // MARCĂM CEREREA CA VERIFICATĂ
        await snap.ref.update({ status: 'verified', processedAt: FieldValue.serverTimestamp() });
        
        console.log(`[CLAIM SUCCESS] User ${userIdStr} updated (+${value} Pts)`);

    } catch (err: any) { 
        console.error(`[CLAIM ERROR] Failed to process ${claimId}:`, err);
        await snap.ref.update({ status: 'error', errorMessage: err.message });
    }
});

/**
 * TRIGGER REFERALI
 */
export const onReferralClaimCreated = onDocumentCreated('referral_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    const claimId = event.params.claimId;
    
    try {
        const referrerId = claim.referrerId.toString();
        const referredId = claim.referredId.toString();
        const referredName = claim.referredName || "Hunter";

        const batch = db.batch();
        
        // Update Referrer
        batch.set(db.collection('users').doc(referrerId), {
            balance: FieldValue.increment(50),
            referralBalance: FieldValue.increment(50),
            referrals: FieldValue.increment(1),
            referralNames: FieldValue.arrayUnion(referredName)
        }, { merge: true });

        // Update Referred
        batch.set(db.collection('users').doc(referredId), {
            balance: FieldValue.increment(25),
            gameplayBalance: FieldValue.increment(25),
            hasClaimedReferral: true
        }, { merge: true });

        await batch.commit();
        await snap.ref.update({ status: 'processed' });
        console.log(`[REF SUCCESS] Claim ${claimId} processed.`);

    } catch (err) { 
        console.error(`[REF ERROR] ${claimId}:`, err); 
    }
});

/**
 * AI PROXY
 */
export const chatWithELZR = onCall(async (request) => {
    const data = request.data;
    if (!process.env.API_KEY) throw new HttpsError('failed-precondition', 'AI Node Disconnected');
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: data.messages.map((m: any) => ({ 
                role: m.role, 
                parts: [{ text: m.text.substring(0, 500) }] 
            })),
            config: { systemInstruction: "You are ELZR System Scout.", temperature: 0.7 }
        });
        return { text: response.text };
    } catch (e: any) {
        throw new HttpsError('internal', 'AI Terminal Error');
    }
});
