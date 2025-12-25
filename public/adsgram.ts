import { ADSGRAM_BLOCK_ID } from '../constants';

declare global {
    interface Window {
        Adsgram?: {
            init: (params: { blockId: string }) => {
                show: () => Promise<void>;
            };
        };
    }
}

// Helper to dynamically load the script if missing
const loadAdsgramScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (window.Adsgram) {
            console.log("[Adsgram Service] Script already present on window.");
            resolve();
            return;
        }

        console.log("[Adsgram Service] Loading sad.adsgram.ai script...");
        const script = document.createElement('script');
        // Updated to use the requested sad.min.js URL
        script.src = "https://sad.adsgram.ai/js/sad.min.js";
        script.async = true;
        script.onload = () => {
            console.log("[Adsgram Service] Script loaded successfully.");
            resolve();
        };
        script.onerror = (e) => {
            console.error("[Adsgram Service] Script failed to load.", e);
            reject(new Error("AdsgramScriptError"));
        };
        document.body.appendChild(script);
    });
};

// Uses the centralized constant by default
export const showRewardedAd = async (blockId: string = ADSGRAM_BLOCK_ID): Promise<boolean> => {
    console.log(`[Adsgram Service] Requesting Ad with BlockID: ${blockId}`);
    try {
        // 0. Validation to prevent SDK crash
        if (!blockId || blockId.trim() === '') {
            console.warn("[Adsgram Service] Skipped: Block ID is missing. Please set VITE_ADSGRAM_BLOCK_ID in .env");
            return false;
        }

        // 1. Ensure script is loaded
        await loadAdsgramScript();

        // Debug: Check if window.Adsgram exists
        if (!window.Adsgram) {
            console.error("[Adsgram Service] CRITICAL: window.Adsgram is undefined even after script load.");
            return false;
        } else {
            console.log("[Adsgram Service] window.Adsgram is available.");
        }

        // 2. Initialize Controller WITHOUT debug mode
        // Adsgram decides everything now.
        console.log("[Adsgram Service] Initializing AdController...");
        const AdController = window.Adsgram.init({ 
            blockId 
        });

        // 3. Show Ad
        console.log("[Adsgram Service] Calling AdController.show()...");
        await AdController.show();
        
        console.log("[Adsgram Service] Ad finished successfully.");
        return true;

    } catch (error) {
        // Silently fail. No UI alerts here, let the component handle the false return.
        console.error("[Adsgram Service] Ad interaction failed/closed/error:", error);
        return false;
    }
};