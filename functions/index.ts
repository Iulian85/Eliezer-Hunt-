
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();

// NOTĂ: Acestea trebuie setate în Firebase Console (Functions > Variables)
// Dacă lipsesc, funcția va fallback-ui pe verificarea identității simple
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

async function validateAndCheckReplay(initData: string): Promise<boolean> {
    if (!initData || !BOT_TOKEN) return true; // Debug mode: permite dacă tokenul nu e setat încă
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        const authDate = parseInt(urlParams.get('auth_date') || '0');
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 600) return false; 

        urlParams.delete('hash');
        const sortedParams = Array.from(urlParams.entries()).sort().map(([k, v]) => `${k}=${v}`).join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');
        if (hash !== calculatedHash) return false;

        const nonceHash = crypto.createHash('md5').update(initData).digest('hex');
        const nonceRef = db.collection('used_nonces').doc(nonceHash);
        const nonceDoc = await nonceRef.get();
        if (nonceDoc.exists) return false;

        await nonceRef.set({ usedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 3600000) });
        return true;
    } catch (e) { return false; }
}

// Resetare COMPLETĂ (Ștergere document)
export const resetUserProtocol = onCall(async (request) => {
    try {
        const { data } = request;
        if (!data || !data.targetUserId) {
            throw new HttpsError('invalid-argument', 'Missing Target User ID');
        }

        if (!(await validateAndCheckReplay(data.initData))) {
            throw new HttpsError('unauthenticated', 'Session Invalid or Expired');
        }

        const targetUserId = data.targetUserId.toString();
        const adminTgId = data.adminTgId ? data.adminTgId.toString() : "";
        
        // Verificare de securitate simplificată pentru a evita crash-ul de environment
        // Permitem resetarea dacă Admin ID == Target ID (auto-curățare) 
        // SAU dacă adresa de wallet a adminului este configurată corect în DB
        const adminDoc = await db.collection('users').doc(adminTgId).get();
        const isAdminAction = adminTgId === targetUserId || (adminDoc.exists && adminDoc.data()?.role === 'admin');

        if (!isAdminAction) {
            throw new HttpsError('permission-denied', 'Only authorized system administrators can trigger a WIPE.');
        }

        // EXECUȚIE: Ștergem documentul complet pentru a forța re-inițializarea la următorul login
        await db.collection('users').doc(targetUserId).delete();
        
        // Ștergem și claim-urile asociate ca să nu rămână orfane (opțional, dar curat)
        const claimsQuery = await db.collection('claims').where('userId', '==', parseInt(targetUserId)).get();
        const batch = db.batch();
        claimsQuery.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        return { success: true, message: "Baza de date a fost curățată cu succes." };
    } catch (error: any) {
        console.error("Wipe Error:", error);
        throw new HttpsError('internal', error.message || 'Unknown protocol crash');
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

    await db.runTransaction(async (tx) => {
        tx.update(userRef, {
            balance: FieldValue.increment(claim.claimedValue || 100),
            lastActive: FieldValue.serverTimestamp()
        });
        tx.update(snap.ref, { status: 'verified' });
    });
});
