
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Campaign, AdStatus, HotspotDefinition, HotspotCategory, Coordinate } from '../types';
import { ShieldCheck, Check, X, Play, Clock, AlertTriangle, Users, Ban, Wallet, Globe, Search, Lock, Unlock, LayoutDashboard, Megaphone, BarChart3, Settings, Trash2, UserX, FlaskConical, MapPin, Plus, Edit2, Coins, Map as MapIcon, Upload, Image as ImageIcon, Loader2, Gift, Calendar, Activity, History, RotateCcw, AlertCircle, Fingerprint, RefreshCw } from 'lucide-react';
import { UniversalVideoPlayer } from '../components/UniversalVideoPlayer';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { getAllUsersAdmin, deleteUserFirebase, toggleUserBan, resetUserInFirebase, toggleUserBiometricSetting } from '../services/firebase';
import { getCurrentFingerprint, getCloudStorageId } from '../services/firebase';

interface AdminViewProps {
    allCampaigns: Campaign[];
    customHotspots: HotspotDefinition[];
    onSaveHotspots: (hotspots: HotspotDefinition[]) => void;
    onDeleteHotspot: (id: string) => void;
    onDeleteCampaign: (id: string) => void;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onResetMyAccount: () => void;
    isTestMode: boolean;
    onToggleTestMode: () => void;
}

const LocationPicker = ({ coords, onPick }: { coords: Coordinate, onPick: (c: Coordinate) => void }) => {
    useMapEvents({
        click(e) {
            onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
        },
    });
    return <Marker position={[coords.lat, coords.lng]} icon={L.divIcon({ html: '<div class="w-6 h-6 bg-red-600 border-2 border-white rounded-full shadow-lg"></div>', iconSize: [24,24], iconAnchor: [12,12] })} />;
};

export const AdminView: React.FC<AdminViewProps> = ({
    allCampaigns, customHotspots, onSaveHotspots, onDeleteHotspot, onDeleteCampaign, onApprove, onReject, onResetMyAccount, isTestMode, onToggleTestMode
}) => {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'ads' | 'hotspots' | 'giftboxes' | 'system'>('dashboard');
    const [users, setUsers] = useState<any[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [previewVideo, setPreviewVideo] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [showResetBiometric, setShowResetBiometric] = useState(false);
    const [isAuthenticatingReset, setIsAuthenticatingReset] = useState(false);

    useEffect(() => {
        if (activeTab === 'users' || activeTab === 'dashboard') {
            loadUsers();
        }
    }, [activeTab]);

    const loadUsers = async () => {
        setIsLoadingUsers(true);
        const data = await getAllUsersAdmin();
        setUsers(data);
        setIsLoadingUsers(false);
    };

    const formatDate = (ts?: any) => {
        if (!ts) return 'N/A';
        const d = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
        return new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
    };

    const handleAdminResetTrigger = () => {
        const tg = window.Telegram?.WebApp;
        if (!tg) return alert("Telegram Environment Missing");
        
        setShowResetBiometric(true);
    };

    const performAdminReset = async () => {
        const tg = window.Telegram?.WebApp;
        if (!tg) return;

        setIsAuthenticatingReset(true);
        const bm = tg.BiometricManager;

        const executeReset = async () => {
            setIsResetting(true);
            try {
                // Obținem datele proaspete de identitate pentru backend
                const fp = await getCurrentFingerprint();
                const uuid = await getCloudStorageId();
                const myId = (tg.initDataUnsafe as any)?.user?.id;

                const res = await resetUserInFirebase(myId);
                if (res.success) {
                    alert("IDENTITY RESET COMPLETE. RELOADING PROTOCOL.");
                    window.location.reload();
                } else {
                    alert("RESET REJECTED: " + res.error);
                }
            } catch (e: any) {
                alert("SYSTEM ERROR: " + e.message);
            } finally {
                setIsResetting(false);
                setShowResetBiometric(false);
                setIsAuthenticatingReset(false);
            }
        };

        if (bm && bm.available) {
            bm.authenticate({ reason: "Confirm Nuclear Reset of Admin Node" }, (success) => {
                if (success) {
                    executeReset();
                } else {
                    alert("BIOMETRIC FAILED. ABORTING.");
                    setIsAuthenticatingReset(false);
                    setShowResetBiometric(false);
                }
            });
        } else {
            // Fallback dacă biometria e bugged dar ești admin confirmat pe ID
            if (window.confirm("Biometrics unavailable. Force reset via ID 7319782429?")) {
                executeReset();
            } else {
                setIsAuthenticatingReset(false);
                setShowResetBiometric(false);
            }
        }
    };

    // ... (restul metodelor neschimbate pentru hotspots/ads)

    if (showResetBiometric) {
        return (
            <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-8 relative overflow-hidden z-[10000]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.15),transparent)] pointer-events-none"></div>
                <div className="relative z-10 flex flex-col items-center max-w-xs w-full">
                    <div className="mb-12 text-center">
                        <h2 className="text-[10px] text-red-500 font-black uppercase tracking-[0.4em] mb-2">Admin Protocol</h2>
                        <h1 className="text-4xl font-black text-white uppercase tracking-tighter font-[Rajdhani]">NUCLEAR RESET</h1>
                    </div>
                    <div className="relative mb-12">
                        <div className={`w-32 h-32 rounded-[2.5rem] bg-slate-900 border-2 flex items-center justify-center transition-all duration-700 shadow-2xl ${isAuthenticatingReset ? 'border-red-500 shadow-red-500/20' : 'border-slate-800'}`}>
                            <Fingerprint size={56} className={isAuthenticatingReset ? "text-red-400 animate-pulse" : "text-slate-600"} />
                        </div>
                        {isAuthenticatingReset && <div className="absolute top-0 left-0 w-full h-1 bg-red-500/50 animate-scan"></div>}
                    </div>
                    <button
                        onClick={performAdminReset}
                        disabled={isAuthenticatingReset}
                        className="w-full py-5 bg-white text-black font-black text-sm uppercase tracking-[0.2em] rounded-[1.5rem] flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all"
                    >
                        {isAuthenticatingReset ? <Loader2 className="animate-spin" /> : <Lock size={20} />}
                        CONFIRM RESET
                    </button>
                    <button onClick={() => setShowResetBiometric(false)} className="mt-6 text-slate-500 text-[10px] font-black uppercase tracking-widest">Abort Mission</button>
                </div>
                <style>{`@keyframes scan { 0% { transform: translateY(0); opacity: 0; } 50% { opacity: 1; } 100% { transform: translateY(128px); opacity: 0; } } .animate-scan { animation: scan 1.5s ease-in-out infinite; }`}</style>
            </div>
        );
    }

    const filteredUsers = useMemo(() => {
        return users.filter(u =>
            (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (u.id || '').toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [users, searchQuery]);

    const activeGiftBoxes = useMemo(() => {
        return customHotspots.filter(h => h.category === 'GIFTBOX');
    }, [customHotspots]);

    const stats = {
        totalUsers: users.length,
        pendingAds: allCampaigns.filter(c => c.data.status === AdStatus.PENDING_REVIEW).length,
        totalBalance: users.reduce((acc, u) => acc + (u.balance || 0), 0),
        totalHotspots: customHotspots.length
    };

    return (
        <div className="h-full w-full bg-slate-950 flex flex-col">
            <div className="bg-slate-900 border-b border-slate-800 p-4 pb-0">
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="text-cyan-400" size={24} />
                    <h1 className="text-xl font-black text-white uppercase tracking-tighter">Admin Console</h1>
                </div>
                <div className="flex gap-4 overflow-x-auto no-scrollbar">
                    <button onClick={() => setActiveTab('dashboard')} className={`pb-3 text-sm font-bold border-b-2 whitespace-nowrap ${activeTab === 'dashboard' ? 'border-cyan-400 text-white' : 'border-transparent text-slate-500'}`}>Dashboard</button>
                    <button onClick={() => setActiveTab('users')} className={`pb-3 text-sm font-bold border-b-2 whitespace-nowrap ${activeTab === 'users' ? 'border-cyan-400 text-white' : 'border-transparent text-slate-500'}`}>Users</button>
                    <button onClick={() => setActiveTab('ads')} className={`pb-3 text-sm font-bold border-b-2 whitespace-nowrap ${activeTab === 'ads' ? 'border-cyan-400 text-white' : 'border-transparent text-slate-500'}`}>Ads</button>
                    <button onClick={() => setActiveTab('hotspots')} className={`pb-3 text-sm font-bold border-b-2 whitespace-nowrap ${activeTab === 'hotspots' ? 'border-cyan-400 text-white' : 'border-transparent text-slate-500'}`}>Hotspots</button>
                    <button onClick={() => setActiveTab('giftboxes')} className={`pb-3 text-sm font-bold border-b-2 whitespace-nowrap ${activeTab === 'giftboxes' ? 'border-amber-400 text-amber-400' : 'border-transparent text-slate-500'}`}>Gift Boxes</button>
                    <button onClick={() => setActiveTab('system')} className={`pb-3 text-sm font-bold border-b-2 whitespace-nowrap ${activeTab === 'system' ? 'border-red-400 text-red-400' : 'border-transparent text-slate-500'}`}>System</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-32 no-scrollbar">
                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Users className="text-cyan-400 mb-3" size={28} /><span className="text-3xl font-black text-white leading-none">{stats.totalUsers}</span><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Hunters</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Coins className="text-amber-400 mb-3" size={28} /><span className="text-3xl font-black text-white leading-none">{stats.totalHotspots}</span><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Points</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Megaphone className="text-red-400 mb-3" size={28} /><span className="text-3xl font-black text-white leading-none">{stats.pendingAds}</span><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Ads</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Wallet className="text-green-400 mb-3" size={28} /><span className="text-2xl font-black text-white leading-none">{(stats.totalBalance / 1000).toFixed(1)}k</span><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Total ELZR</span></div>
                    </div>
                )}
                
                {/* ... (restul tab-urilor neschimbate) */}

                {activeTab === 'system' && (
                    <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-2xl">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><AlertTriangle className="text-red-500" /> DANGER ZONE</h2>
                        <div className="space-y-4">
                            <button onClick={onToggleTestMode} className={`w-full py-3 rounded-xl font-bold text-xs ${isTestMode ? 'bg-green-500 text-black' : 'bg-slate-800 text-slate-500'}`}>TEST MODE: {isTestMode ? 'ON' : 'OFF'}</button>
                            <button 
                                onClick={handleAdminResetTrigger}
                                className="w-full py-4 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-red-900/20"
                            >
                                <Fingerprint size={18} />
                                RESET MY ACCOUNT (7319782429)
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
