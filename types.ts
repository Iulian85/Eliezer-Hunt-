
export interface Coordinate {
    lat: number;
    lng: number;
}

export enum AdStatus {
    PENDING_REVIEW = 'pending_review',
    PAYMENT_REQUIRED = 'payment_required',
    ACTIVE = 'active',
    REJECTED = 'rejected'
}

export interface ContactInfo {
    street: string;
    city: string;
    zip: string;
    country: string;
    phone: string;
    email: string;
    website: string;
}

export interface SponsorData {
    id: string;
    brandName: string;
    logoUrl: string;
    videoUrl: string;
    videoFileName?: string;
    multiplier: number;
    durationDays: number;
    contact: ContactInfo;
    status: AdStatus;
}

export interface Campaign {
    id: string;
    ownerWallet: string;
    targetCoords: Coordinate;
    count: number;
    multiplier: number;
    durationDays: number;
    expiryDate?: number;
    totalPrice: number;
    data: SponsorData;
    timestamp: number;
}

export type HotspotCategory = 'MALL' | 'LANDMARK' | 'URBAN' | 'EVENT' | 'AD_REWARD' | 'MERCHANT' | 'GIFTBOX';

export interface HotspotDefinition {
    id: string;
    name: string;
    coords: Coordinate;
    radius: number;
    density: number;
    category: HotspotCategory;
    baseValue: number;
    logoUrl?: string;     
    customText?: string;
    prizes?: number[]; // For GIFTBOX
    videoUrl?: string; // For GIFTBOX
}

export interface SpawnPoint {
    id: string;
    name: string;
    coords: Coordinate;
    collected: boolean;
    value: number;
    density?: number;
    description?: string;
    isLandmark?: boolean;
    category?: HotspotCategory;
    sponsorData?: SponsorData;
    velocity?: { lat: number, lng: number };
    logoUrl?: string;     
    customText?: string;
    prizes?: number[]; // For GIFTBOX
    videoUrl?: string; // For GIFTBOX
}

export interface UserState {
    balance: number; 
    tonBalance: number; 
    gameplayBalance: number; 
    rareBalance: number; 
    eventBalance: number; 
    dailySupplyBalance: number; 
    merchantBalance: number; 
    referralBalance: number; 
    collectedIds: string[];
    location: Coordinate | null;
    lastAdWatch: number; 
    lastDailyClaim: number; 
    adsWatched: number;
    sponsoredAdsWatched: number;
    rareItemsCollected: number; 
    eventItemsCollected: number; 
    referrals: number;
    referralNames?: string[]; 
    hasClaimedReferral?: boolean;
    telegramId?: number;
    username?: string;
    walletAddress?: string;
    joinedAt?: number;
    lastActive?: number;
    photoUrl?: string;
    isBanned?: boolean;
    deviceFingerprint?: string;
    biometricEnabled?: boolean; 
    lastInitData?: string; // SECURITY: Hash verification storage
    screenshotLock?: boolean;
}

export enum Tab {
    MAP = 'map',
    HUNT = 'hunt',
    LEADERBOARD = 'leaderboard',
    ADS = 'ads',
    FRENS = 'frens',
    WALLET = 'wallet',
    ADMIN = 'admin'
}

export interface AdminUser {
    id: string;
    telegramUsername: string;
    walletAddress: string;
    balance: number;
    countryCode: string;
    ipAddress: string;
    isBanned: boolean;
    joinedAt: number;
    lastActive: number;
}

export interface LeaderboardEntry {
    rank: number;
    username: string;
    score: number;
}

declare global {
    interface Window {
        // FIX: Added optionality to grecaptcha to resolve "All declarations of 'grecaptcha' must have identical modifiers" error
        grecaptcha?: any;
        Telegram?: {
            WebApp: {
                ready: () => void;
                expand: () => void;
                openTelegramLink: (url: string) => void;
                initData: string;
                initDataUnsafe: any;
                disableVerticalSwipes?: () => void;
                enableClosingConfirmation?: () => void;
                HapticFeedback: {
                    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
                    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
                    selectionChanged: () => void;
                };
                BiometricManager: {
                    isInited: boolean;
                    available: boolean;
                    biometricType: 'finger' | 'face' | 'unknown';
                    accessRequested: boolean;
                    accessGranted: boolean;
                    deviceId: string;
                    init: (callback?: () => void) => void;
                    requestAccess: (params: { reason?: string }, callback?: (success: boolean) => void) => void;
                    authenticate: (params: { reason?: string }, callback?: (success: boolean, token?: string) => void) => void;
                    openSettings: () => void;
                };
                CloudStorage: {
                    setItem: (key: string, value: string, callback?: (error: string | null, success: boolean) => void) => void;
                    getItem: (key: string, callback: (error: string | null, value: string | null) => void) => void;
                };
            }
        }
    }
}
