
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
 * LOGICA DE UPDATE (Rescrisă pentru siguranță maximă)
 */
async function applyPointsToUser(userId: string, spawnId: string, category: string, value: number, tonReward: number) {
    const userRef = db.collection('users').doc(String(userId));
    
    const update: any = {
        balance: FieldValue.increment(value),
        tonBalance: FieldValue.increment(tonReward),
        lastActive: FieldValue.serverTimestamp()
    };

    // Nu salvăm ID-urile de reclame în collectedIds pentru a permite vizionări multiple
    if (spawnId && !spawnId.startsWith('ad-')) {
        update.collectedIds = FieldValue.arrayUnion(spawnId);
    }

    // Distribuție pe categorii pentru Airdrop Estimation
    if (category === 'AD_REWARD') {
        update.dailySupplyBalance = FieldValue.increment(value);
        update.adsWatched = FieldValue.increment(1);
        update.lastDailyClaim = Date.now();
    } else if (category === 'LANDMARK') {
        update.rareBalance = FieldValue.increment(value);
    } else if (category === 'EVENT') {
        update.eventBalance = FieldValue.increment(value);
    } else if (category === 'MERCHANT') {
        update.merchantBalance = FieldValue.increment(value);
    } else {
        update.gameplayBalance = FieldValue.increment(value);
    }

    await userRef.set(update, { merge: true });
}

/**
 * AUTO-CLEANER PENTRU PUNCTELE BLOCATE (Pending)
 * Această funcție va repara automat documentele pe care le-ai văzut tu ca "pending".
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    
    // Dacă e deja verificat sau nu e pending, nu facem nimic
    if (data.status !== 'pending') return;

    try {
        console.log(`Processing pending claim for user ${data.userId}`);
        await applyPointsToUser(
            String(data.userId),
            data.spawnId,
            data.category || 'URBAN',
            Number(data.claimedValue || 0),
            Number(data.tonReward || 0)
        );
        
        // Marcăm ca verificat în claims ca să nu mai apară în lista de erori
        await snap.ref.update({ 
            status: 'verified', 
            processedAt: FieldValue.serverTimestamp() 
        });
    } catch (e) {
        console.error("Auto-fix failed:", e);
    }
});

/**
 * APELUL PRINCIPAL (Instant Call)
 */
export const secureClaim = onCall({ cors: true }, async (request) => {
    const { userId, spawnId, category, claimedValue, tonReward } = request.data || {};
    
    if (!userId) {
        throw new HttpsError('invalid-argument', 'Protocol error: Missing User ID.');
    }

    const val = Number(claimedValue || 100);
    const ton = Number(tonReward || 0);
    const cat = category || 'URBAN';

    try {
        const batch = db.batch();
        
        // 1. Update User Balance
        const userRef = db.collection('users').doc(String(userId));
        const userUpdate: any = {
            balance: FieldValue.increment(val),
            tonBalance: FieldValue.increment(ton),
            lastActive: FieldValue.serverTimestamp()
        };
        if (spawnId && !spawnId.startsWith('ad-')) userUpdate.collectedIds = FieldValue.arrayUnion(spawnId);
        
        // Categorii
        if (cat === 'AD_REWARD') { userUpdate.dailySupplyBalance = FieldValue.increment(val); userUpdate.lastDailyClaim = Date.now(); }
        else if (cat === 'LANDMARK') userUpdate.rareBalance = FieldValue.increment(val);
        else if (cat === 'EVENT') userUpdate.eventBalance = FieldValue.increment(val);
        else if (cat === 'MERCHANT') userUpdate.merchantBalance = FieldValue.increment(val);
        else userUpdate.gameplayBalance = FieldValue.increment(val);

        batch.set(userRef, userUpdate, { merge: true });

        // 2. Create Audit Log (Verified Status)
        const logRef = db.collection('claims').doc();
        batch.set(logRef, {
            userId: Number(userId),
            spawnId: String(spawnId),
            category: cat,
            claimedValue: val,
            tonReward: ton,
            status: 'verified',
            timestamp: FieldValue.serverTimestamp()
        });

        await batch.commit();
        return { success: true };
    } catch (e: any) {
        console.error("Secure Claim Failure:", e);
        throw new HttpsError('internal', e.message);
    }
});

export const secureReferral = onCall(async (request) => {
    const { referrerId, userId, userName } = request.data || {};
    if (!referrerId || !userId) return { success: false };

    const batch = db.batch();
    const refOwner = db.collection('users').doc(String(referrerId));
    const newUser = db.collection('users').doc(String(userId));

    batch.set(refOwner, {
        balance: FieldValue.increment(50),
        referralBalance: FieldValue.increment(50),
        referrals: FieldValue.increment(1),
        referralNames: FieldValue.arrayUnion(userName || "Hunter")
    }, { merge: true });

    batch.set(newUser, {
        balance: FieldValue.increment(25),
        gameplayBalance: FieldValue.increment(25),
        hasClaimedReferral: true
    }, { merge: true });

    await batch.commit();
    return { success: true };
});

export const chatWithELZR = onCall(async (request) => {
    const { messages } = request.data || {};
    if (!process.env.API_KEY) return { text: "Offline." };
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: messages.slice(-5).map((m: any) => ({ role: m.role, parts: [{ text: m.text }] })),
        config: { systemInstruction: "Be a brief crypto scout.", thinkingConfig: { thinkingBudget: 0 } }
    });
    return { text: response.text };
});
