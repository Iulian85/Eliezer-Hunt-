
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();

/**
 * FUNCȚIA SUPREMĂ DE ALOCARE (Execuție atomică)
 */
export const secureClaim = onCall({ cors: true }, async (request) => {
    const { userId, spawnId, category, claimedValue, tonReward } = request.data || {};
    
    if (!userId) {
        throw new HttpsError('invalid-argument', 'User ID invalid.');
    }

    const val = Number(claimedValue || 0);
    const ton = Number(tonReward || 0);
    const cat = String(category || 'URBAN');
    const uId = String(userId);

    try {
        const batch = db.batch();
        const userRef = db.collection('users').doc(uId);
        
        // Obținem datele actuale pentru siguranță (opțional, dar bun pentru log-uri)
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            // Dacă userul nu există, îl creăm acum cu balanța de start
            batch.set(userRef, {
                telegramId: Number(userId),
                balance: val,
                tonBalance: ton,
                gameplayBalance: cat === 'URBAN' || cat === 'MALL' ? val : 0,
                rareBalance: cat === 'LANDMARK' ? val : 0,
                eventBalance: cat === 'EVENT' ? val : 0,
                dailySupplyBalance: cat === 'AD_REWARD' ? val : 0,
                merchantBalance: cat === 'MERCHANT' ? val : 0,
                collectedIds: spawnId && !spawnId.startsWith('ad-') ? [spawnId] : [],
                lastActive: FieldValue.serverTimestamp()
            });
        } else {
            // Update balanțe existente
            const updateData: any = {
                balance: FieldValue.increment(val),
                tonBalance: FieldValue.increment(ton),
                lastActive: FieldValue.serverTimestamp()
            };

            if (spawnId && !spawnId.startsWith('ad-')) {
                updateData.collectedIds = FieldValue.arrayUnion(spawnId);
            }

            // Repartizare pe sub-balanțe pentru Wallet (Airdrop Estimation)
            if (cat === 'AD_REWARD') {
                updateData.dailySupplyBalance = FieldValue.increment(val);
                updateData.lastDailyClaim = Date.now();
            } else if (cat === 'LANDMARK') {
                updateData.rareBalance = FieldValue.increment(val);
            } else if (cat === 'EVENT') {
                updateData.eventBalance = FieldValue.increment(val);
            } else if (cat === 'MERCHANT') {
                updateData.merchantBalance = FieldValue.increment(val);
            } else {
                updateData.gameplayBalance = FieldValue.increment(val);
            }

            batch.update(userRef, updateData);
        }

        // Scriem log-ul în claims DIRECT cu status 'verified' (Nu mai lăsăm nimic în pending)
        const logRef = db.collection('claims').doc();
        batch.set(logRef, {
            userId: Number(userId),
            spawnId: String(spawnId || 'system'),
            category: cat,
            claimedValue: val,
            tonReward: ton,
            status: 'verified',
            timestamp: FieldValue.serverTimestamp()
        });

        await batch.commit();
        console.log(`Successfully allocated ${val} points to ${uId}`);
        return { success: true, newBalance: (userSnap.data()?.balance || 0) + val };

    } catch (e: any) {
        console.error("Critical Claim Error:", e);
        throw new HttpsError('internal', 'Server error during allocation.');
    }
});

/**
 * REFERRAL SYSTEM
 */
export const secureReferral = onCall(async (request) => {
    const { referrerId, userId, userName } = request.data || {};
    if (!referrerId || !userId) return { success: false };

    try {
        const batch = db.batch();
        const refOwnerRef = db.collection('users').doc(String(referrerId));
        const newUserRef = db.collection('users').doc(String(userId));

        batch.set(refOwnerRef, {
            balance: FieldValue.increment(50),
            referralBalance: FieldValue.increment(50),
            referrals: FieldValue.increment(1),
            referralNames: FieldValue.arrayUnion(userName || "Hunter")
        }, { merge: true });

        batch.set(newUserRef, {
            balance: FieldValue.increment(25),
            gameplayBalance: FieldValue.increment(25),
            hasClaimedReferral: true
        }, { merge: true });

        await batch.commit();
        return { success: true };
    } catch (e) {
        return { success: false };
    }
});

export const chatWithELZR = onCall(async (request) => {
    const { messages } = request.data || {};
    if (!process.env.API_KEY) return { text: "Terminal offline." };
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: messages.slice(-5).map((m: any) => ({ role: m.role, parts: [{ text: m.text }] })),
        config: { systemInstruction: "Be a brief crypto scout.", thinkingConfig: { thinkingBudget: 0 } }
    });
    return { text: response.text };
});
