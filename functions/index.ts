
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function validateTelegramAuth(initData: string) {
    if (!initData || !BOT_TOKEN) return false;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    const authDate = parseInt(urlParams.get('auth_date') || '0');
    
    // SECURITY 5.0: Window de sesiune redus la 15 minute pentru tranzacții critice
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 900) return false;

    urlParams.delete('hash');
    const sortedParams = Array.from(urlParams.entries()).sort().map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');
    return hash === calculatedHash;
}

// 1. AI PROXY
export const chatWithELZR = onCall(async (request) => {
    const data = request.data;
    if (!validateTelegramAuth(data.initData)) {
        throw new HttpsError('unauthenticated', 'Security Breach.');
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: data.messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text }] })),
        config: { systemInstruction: "Cyberpunk ELZR Scout.", temperature: 0.7 }
    });
    return { text: response.text };
});

// 2. CLAIM PROCESSOR (Hardened with Velocity Check)
export const onClaimCreated = onDocumentCreated('claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const claim = snap.data();
    
    if (!validateTelegramAuth(claim.initData)) {
        await snap.ref.update({ status: 'failed', reason: 'Invalid session window' });
        return;
    }

    const hotspotId = claim.spawnId.includes('-') ? claim.spawnId.split('-')[0] : claim.spawnId;
    const hotspotSnap = await db.collection('hotspots').doc(hotspotId).get();
    
    if (!hotspotSnap.exists) {
        await snap.ref.update({ status: 'failed', reason: 'Invalid target' });
        return;
    }

    const realHotspot = hotspotSnap.data()!;
    const realValue = realHotspot.baseValue || 100;
    const realCoords = realHotspot.coords;

    const userRef = db.collection('users').doc(claim.userId.toString());
    const userDoc = await userRef.get();
    if (!userDoc.exists) return;

    const userData = userDoc.data()!;
    
    // SECURITY 5.0: Velocity Check (Anti-Teleportation)
    if (userData.lastActive && userData.lastLocation) {
        const distTraveled = getDistance(
            userData.lastLocation.lat, userData.lastLocation.lng, 
            claim.location.lat, claim.location.lng
        );
        const timeDiff = (Timestamp.now().toMillis() - userData.lastActive.toMillis()) / 1000;
        
        // Dacă viteza > 250 m/s (peste 900 km/h), probabil e spoofing JSON
        if (timeDiff > 0 && (distTraveled / timeDiff) > 250) {
            await snap.ref.update({ status: 'flagged', reason: 'Abnormal velocity detected', speed: distTraveled / timeDiff });
            return;
        }
    }

    // GPS Proximity Check
    const distToHotspot = getDistance(claim.location.lat, claim.location.lng, realCoords.lat, realCoords.lng);
    if (distToHotspot > 150) {
        await snap.ref.update({ status: 'failed', reason: 'Out of range', distance: distToHotspot });
        return;
    }

    await db.runTransaction(async (transaction) => {
        const currentCollected = userData.collectedIds || [];
        if (currentCollected.includes(claim.spawnId)) return;

        transaction.update(userRef, {
            balance: FieldValue.increment(realValue),
            collectedIds: FieldValue.arrayUnion(claim.spawnId),
            lastActive: FieldValue.serverTimestamp(),
            lastLocation: claim.location
        });

        transaction.update(snap.ref, { 
            status: 'verified', 
            actualValue: realValue,
            processedAt: FieldValue.serverTimestamp() 
        });
    });
});

// 3. REFERRAL PROOF-OF-PLAY TRIGGER
// Recompensa se acordă doar când invitatul atinge 5 colectări.
export const onUserActivityProof = onDocumentUpdated('users/{userId}', async (event) => {
    const newData = event.data?.after.data();
    const oldData = event.data?.before.data();
    
    if (!newData || !oldData) return;

    // Verificăm dacă utilizatorul tocmai a atins pragul de 5 colectări
    if (newData.collectedIds?.length >= 5 && (oldData.collectedIds?.length || 0) < 5) {
        // Căutăm dacă acest user a fost invitat de cineva
        const referralSnap = await db.collection('referral_claims')
            .where('inviteeId', '==', parseInt(event.params.userId))
            .where('status', '==', 'pending_proof_of_play')
            .limit(1)
            .get();

        if (!referralSnap.empty) {
            const claimDoc = referralSnap.docs[0];
            const claimData = claimDoc.data();
            const referrerRef = db.collection('users').doc(claimData.referrerId);

            await db.runTransaction(async (transaction) => {
                transaction.update(referrerRef, {
                    balance: FieldValue.increment(50),
                    referrals: FieldValue.increment(1),
                    referralNames: FieldValue.arrayUnion(claimData.inviteeName)
                });
                transaction.update(claimDoc.ref, { status: 'completed', verifiedAt: FieldValue.serverTimestamp() });
            });
        }
    }
});

// 4. REFERRAL INITIALIZATION (No immediate reward)
export const onReferralCreated = onDocumentCreated('referral_claims/{claimId}', async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    
    if (!validateTelegramAuth(data.initData)) {
        await snap.ref.update({ status: 'rejected', reason: 'Auth failed' });
        return;
    }

    const inviteeDoc = await db.collection('users').doc(data.inviteeId.toString()).get();
    if (inviteeDoc.exists && inviteeDoc.data()?.hasBeenReferral) {
        await snap.ref.update({ status: 'rejected', reason: 'Already referred' });
        return;
    }

    await snap.ref.update({ status: 'pending_proof_of_play' });
});
