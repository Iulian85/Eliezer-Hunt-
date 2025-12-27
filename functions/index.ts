
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

if (getApps().length === 0) {
    initializeApp();
}

const db = getFirestore();

// Eliminat onClaimCreated pentru că acum clientul face update-ul direct pentru viteză.

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

export const secureClaim = onCall(async (request) => {
    // Păstrăm funcția goală pentru compatibilitate, dar nu o mai folosim în mod critic
    return { success: true };
});
