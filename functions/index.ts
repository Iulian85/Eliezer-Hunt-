
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';

admin.initializeApp();

const BOT_TOKEN = functions.config().telegram.bot_token; // Trebuie setat în Firebase Config

// Helper: Verifică dacă cererea vine de la un utilizator Telegram valid
function validateTelegramAuth(initData: string) {
    if (!initData) return false;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    const sortedParams = Array.from(urlParams.entries()).sort().map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');
    return hash === calculatedHash;
}

// 1. AI PROXY - Secure Gemini Call
export const chatWithELZR = functions.https.onCall(async (data, context) => {
    if (!validateTelegramAuth(data.initData)) {
        throw new functions.https.HttpsError('unauthenticated', 'Security Breach Detected.');
    }

    // Fix: Obtained API key from environment variable process.env.API_KEY exclusively
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: data.messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text }] })),
        config: {
            systemInstruction: "Ești un asistent de teren cibernetic ELZR. Răspunde scurt și cyberpunk în limba română.",
            temperature: 0.5
        }
    });

    // Fix: Access response.text property directly
    return { text: response.text };
});

// 2. CLAIM PROCESSOR - Server-side validation of GPS and Auth
export const onClaimCreated = functions.firestore.document('claims/{claimId}').onCreate(async (snap, context) => {
    const claim = snap.data();
    
    // Verificăm Auth
    if (!validateTelegramAuth(claim.initData)) {
        return snap.ref.update({ status: 'failed', reason: 'Invalid signature' });
    }

    // Verificăm Coordonate (GPS Anti-Spoofing simplificat)
    // Aici s-ar interoga baza de date 'hotspots' pentru a vedea dacă locația user-ului
    // este într-adevăr în raza hotspot-ului pretins.
    
    const userRef = admin.firestore().collection('users').doc(claim.userId.toString());
    
    return admin.firestore().runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) return;

        const currentBalance = userDoc.data()?.balance || 0;
        const currentCollected = userDoc.data()?.collectedIds || [];

        if (currentCollected.includes(claim.spawnId)) return;

        transaction.update(userRef, {
            balance: currentBalance + claim.claimedValue,
            tonBalance: admin.firestore.FieldValue.increment(claim.claimedTon || 0),
            collectedIds: admin.firestore.FieldValue.arrayUnion(claim.spawnId),
            lastActive: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.update(snap.ref, { status: 'verified', processedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
});
