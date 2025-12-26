
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Campaign, AdStatus, HotspotDefinition, HotspotCategory, Coordinate } from '../types';
import { ShieldCheck, Check, X, Play, Clock, AlertTriangle, Users, Ban, Wallet, Globe, Search, Lock, Unlock, LayoutDashboard, Megaphone, BarChart3, Settings, Trash2, UserX, FlaskConical, MapPin, Plus, Edit2, Coins, Map as MapIcon, Upload, Image as ImageIcon, Loader2, Gift, Calendar, Activity, History, RotateCcw, AlertCircle, Fingerprint, RefreshCw } from 'lucide-react';
import { UniversalVideoPlayer } from '../components/UniversalVideoPlayer';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { getAllUsersAdmin, deleteUserFirebase, toggleUserBan, resetUserInFirebase, toggleUserBiometricSetting } from '../services/firebase';

interface AdminViewProps {
    allCampaigns: Campaign[];
    customHotspots: HotspotDefinition[];
    onSaveHotspots: (hotspots: HotspotDefinition[]) => void;
    onDeleteHotspot: (id: string) => void;
    onDeleteCampaign: (id: string) => void;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onResetMyAccount: () => Promise<void>;
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
    const [isResetting, setIsResetting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [previewVideo, setPreviewVideo] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [hForm, setHForm] = useState<Partial<HotspotDefinition>>({
        id: '', name: '', coords: { lat: 52.5200, lng: 13.4050 }, radius: 200, density: 1000, category: 'URBAN', baseValue: 100, logoUrl: '', customText: ''
    });
    const [isEditingHotspot, setIsEditingHotspot] = useState<string | null>(null);

    const [gbForm, setGbForm] = useState<Partial<HotspotDefinition>>({
        id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, category: 'GIFTBOX', prizes: [0.05, 0.5]
    });
    const [isEditingGB, setIsEditingGB] = useState<string | null>(null);
    const prizeOptions = [0.05, 0.5, 1, 10, 100];

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

    const handleResetAction = async () => {
        if (isResetting) return;
        if (window.confirm("ATENȚIE: Aceasta este o ștergere DEFINITIVĂ din server (Firestore Wipe). Contul va fi resetat la zero. Continuați?")) {
            setIsResetting(true);
            try {
                await onResetMyAccount();
            } catch (e: any) {
                console.error("Reset component error", e);
            } finally {
                setIsResetting(false);
            }
        }
    };

    const handleResetUserAccount = async (id: string) => {
        if (window.confirm(`WIPE USER: Ștergeți definitiv datele pentru utilizatorul ${id}?`)) {
            const success = await resetUserInFirebase(parseInt(id));
            if (success) {
                alert("Utilizatorul a fost șters din baza de date.");
                loadUsers();
            }
        }
    };

    const handleToggleBan = async (id: string, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        if (window.confirm(newStatus ? `LOCK: Blocare utilizator?` : `UNLOCK: Deblocare utilizator?`)) {
            await toggleUserBan(id, newStatus);
            setUsers(prev => prev.map(u => u.id === id ? { ...u, isBanned: newStatus } : u));
        }
    };

    const handleSaveHotspot = () => {
        if (!hForm.name || !hForm.id) return alert("ID and Name required.");
        const newHotspot = { ...hForm, id: hForm.id } as HotspotDefinition;
        if (isEditingHotspot) {
            onSaveHotspots(customHotspots.map(h => h.id === isEditingHotspot ? newHotspot : h));
        } else {
            onSaveHotspots([...customHotspots, newHotspot]);
        }
        setIsEditingHotspot(null);
    };

    const filteredUsers = useMemo(() => {
        return users.filter(u =>
            (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (u.id || '').toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [users, searchQuery]);

    return (
        <div className="h-full w-full bg-slate-950 flex flex-col">
            <div className="bg-slate-900 border-b border-slate-800 p-4 pb-0">
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="text-cyan-400" size={24} />
                    <h1 className="text-xl font-black text-white uppercase tracking-tighter">Admin Protocol</h1>
                </div>
                <div className="flex gap-4 overflow-x-auto no-scrollbar">
                    <button onClick={() => setActiveTab('dashboard')} className={`pb-3 text-sm font-bold border-b-2 ${activeTab === 'dashboard' ? 'border-cyan-400 text-white' : 'border-transparent text-slate-500'}`}>Stats</button>
                    <button onClick={() => setActiveTab('users')} className={`pb-3 text-sm font-bold border-b-2 ${activeTab === 'users' ? 'border-cyan-400 text-white' : 'border-transparent text-slate-500'}`}>Users</button>
                    <button onClick={() => setActiveTab('hotspots')} className={`pb-3 text-sm font-bold border-b-2 ${activeTab === 'hotspots' ? 'border-cyan-400 text-white' : 'border-transparent text-slate-500'}`}>Spots</button>
                    <button onClick={() => setActiveTab('system')} className={`pb-3 text-sm font-bold border-b-2 ${activeTab === 'system' ? 'border-red-400 text-red-400' : 'border-transparent text-slate-500'}`}>System</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-32 no-scrollbar">
                {activeTab === 'users' && (
                    <div className="space-y-4">
                        <input type="text" placeholder="Căutare Hunter..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-500" />
                        {users.map(user => (
                            <div key={user.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-white font-bold">{user.username || 'Anon'}</h3>
                                        <p className="text-[10px] text-slate-500 font-mono">{user.id}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleToggleBan(user.id, user.isBanned)} className={`p-2 rounded-lg ${user.isBanned ? 'bg-green-600' : 'bg-amber-600'}`}>
                                            {user.isBanned ? <Unlock size={16}/> : <Lock size={16}/>}
                                        </button>
                                        <button onClick={() => handleResetUserAccount(user.id)} className="p-2 bg-red-600 rounded-lg text-white"><RotateCcw size={16}/></button>
                                    </div>
                                </div>
                                <div className="flex justify-between text-[10px] font-bold text-slate-400 border-t border-slate-800 pt-2">
                                    <span>Puncte: {user.balance || 0}</span>
                                    <span>Wallet: {user.walletAddress ? 'DA' : 'NU'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {activeTab === 'system' && (
                    <div className="space-y-6">
                        <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-3xl">
                            <h2 className="text-lg font-black text-white mb-2 flex items-center gap-2 uppercase tracking-tighter"><AlertTriangle className="text-red-500" /> Zone Periculoasă</h2>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-6 leading-relaxed">Această acțiune va șterge DEFINITIV documentul tău din Firestore. Toate progresele, monedele colectate și balanța vor fi eliminate de pe server.</p>
                            <button 
                                onClick={handleResetAction} 
                                disabled={isResetting}
                                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-red-950/40"
                            >
                                {isResetting ? <Loader2 className="animate-spin" /> : <RefreshCw size={18} />}
                                {isResetting ? "SE COMUNICĂ CU SERVERUL..." : "WIPE SERVER DATA"}
                            </button>
                        </div>
                        <button onClick={onToggleTestMode} className={`w-full py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest ${isTestMode ? 'bg-green-500 text-black' : 'bg-slate-800 text-slate-500'}`}>Mod Simulare: {isTestMode ? 'ACTIV' : 'INACTIV'}</button>
                    </div>
                )}
            </div>
        </div>
    );
};
