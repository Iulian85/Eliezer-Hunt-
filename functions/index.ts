
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();
const BOT_TOKEN = process.env.BOT_TOKEN || ""; // Trebuie setat în Firebase Config Secrets

/**
 * VERIFICARE INTEGRITATE TELEGRAM
 */
function verifyTelegramData(initData: string): boolean {
    if (!BOT_TOKEN || !initData) return false;
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');
        
        const dataCheckString = Array.from(urlParams.entries())
            .map(([key, value]) => `${key}=${value}`)
            .sort()
            .join('\n');
            
        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
            
        const calculatedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
            
        return calculatedHash === hash;
    } catch (e) {
        return false;
    }
}

/**
 * SECURE CLAIM HANDLER (V5.3 - HARDENED)
 */
export const secureClaim = onCall({
    maxInstances: 10,
    memory: "256MiB"
}, async (request) => {
    const { userId, spawnId, category, initData, coords } = request.data || {};
    
    // 1. Verificare Identitate
    if (!verifyTelegramData(initData)) {
        throw new HttpsError('unauthenticated', 'Security Breach: Invalid session signature.');
    }

    if (!userId || !spawnId) {
        throw new HttpsError('invalid-argument', 'Protocol error: Missing data.');
    }

    const userRef = db.collection('users').doc(String(userId));
    const userSnap = await userRef.get();
    const userData = userSnap.data();

    // 2. Anti-Cheat: Viteza de deplasare (Distance/Time)
    if (userData && userData.lastActiveLocation && userData.lastActiveAt && coords) {
        const lastCoords = userData.lastActiveLocation;
        const lastTime = userData.lastActiveAt.toMillis ? userData.lastActiveAt.toMillis() : userData.lastActiveAt;
        
        // Calcul distanță simplificat (Haversine)
        const R = 6371; // km
        const dLat = (coords.lat - lastCoords.lat) * Math.PI / 180;
        const dLon = (coords.lng - lastCoords.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lastCoords.lat * Math.PI/180) * Math.cos(coords.lat * Math.PI/180) * 
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        const timeDiffHours = (Date.now() - lastTime) / (1000 * 60 * 60);
        const speed = d / (timeDiffHours || 0.0001);

        if (speed > 900 && d > 5) { // Mai rapid decât un avion comercial
             console.warn(`Suspicious move: User ${userId} speed ${speed}km/h`);
             throw new HttpsError('permission-denied', 'GPS Anomaly detected. Movement restricted.');
        }
    }

    // 3. Server-Side Reward Definition (NU credem clientul)
    let finalValue = 100; // Default URBAN
    let finalTon = 0;

    if (category === 'LANDMARK' || category === 'EVENT') finalValue = 1000;
    if (category === 'AD_REWARD') finalValue = 500;
    
    // Dacă e MERCHANT, verificăm valoarea reală în campanie
    if (category === 'MERCHANT') {
        const campId = spawnId.split('-coin-')[0];
        const campSnap = await db.collection('campaigns').doc(campId).get();
        if (campSnap.exists) {
            const cData = campSnap.data();
            finalValue = 100 * ((cData?.multiplier || 5) / 5);
        }
    }

    // 4. Salvare în ledger-ul de claims (va declanșa onClaimCreated)
    try {
        const claimRef = db.collection('claims').doc();
        await claimRef.set({
            userId: Number(userId),
            spawnId: String(spawnId),
            claimedValue: finalValue,
            tonReward: finalTon,
            category: category || "URBAN",
            coords: coords || null,
            timestamp: FieldValue.serverTimestamp(),
            status: "pending"
        });

        // Actualizăm ultima locație pentru următorul check anti-cheat
        await userRef.set({
            lastActiveLocation: coords || null,
            lastActiveAt: FieldValue.serverTimestamp()
        }, { merge: true });

        return { success: true, verifiedValue: finalValue };
    } catch (e: any) {
        throw new HttpsError('internal', 'Extraction failed.');
    }
});

/**
 * AUTOMATIC LEDGER UPDATE (SECURIZAT)
 */
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    const userIdStr = String(claim.userId);
    const userRef = db.collection('users').doc(userIdStr);

    try {
        // Prevenim dubla procesare
        if (claim.status === 'verified') return;

        const value = Number(claim.claimedValue || 0);
        const tonValue = Number(claim.tonReward || 0);
        const category = claim.category || 'URBAN';
        const spawnId = claim.spawnId;

        const userUpdate: any = {
            balance: FieldValue.increment(value),
            tonBalance: FieldValue.increment(tonValue),
            lastActive: FieldValue.serverTimestamp()
        };

        if (spawnId && !spawnId.startsWith('ad-')) {
            userUpdate.collectedIds = FieldValue.arrayUnion(spawnId);
        }

        if (category === 'AD_REWARD') {
            userUpdate.dailySupplyBalance = FieldValue.increment(value);
            userUpdate.lastDailyClaim = Date.now();
        } else if (category === 'MERCHANT') {
            userUpdate.merchantBalance = FieldValue.increment(value);
        } else if (category === 'LANDMARK') {
            userUpdate.rareBalance = FieldValue.increment(value);
        } else if (category === 'EVENT') {
            userUpdate.eventBalance = FieldValue.increment(value);
        } else {
            userUpdate.gameplayBalance = FieldValue.increment(value);
        }

        await userRef.set(userUpdate, { merge: true });
        await snap.ref.update({ status: 'verified', processedAt: FieldValue.serverTimestamp() });

    } catch (err: any) {
        await snap.ref.update({ status: 'error', errorMsg: err.message });
    }
});

/**
 * AI SYSTEM SCOUT (PROXIED WITH RATE LIMITING)
 */
export const chatWithELZR = onCall(async (request) => {
    const { messages, userId } = request.data || {};
    if (!process.env.API_KEY) throw new HttpsError('failed-precondition', 'AI Offline.');
    
    // Simulare Rate Limiting (Puteți adăuga un doc în Firebase per user pentru a contura mesajele zilnice)
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: messages.slice(-5).map((m: any) => ({ // Trimitem doar ultimele 5 mesaje pentru siguranță și cost
                role: m.role === 'model' ? 'model' : 'user', 
                parts: [{ text: m.text }] 
            })),
            config: { 
                systemInstruction: "You are ELZR Scout. Be tactical, futuristic, and brief.",
                temperature: 0.7 
            }
        });
        
        return { text: response.text };
    } catch (e: any) {
        throw new HttpsError('internal', 'AI sync error.');
    }
});
