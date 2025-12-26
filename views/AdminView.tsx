
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
        id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, density: 1000, category: 'URBAN', baseValue: 100, logoUrl: '', customText: ''
    });
    const [isEditingHotspot, setIsEditingHotspot] = useState<string | null>(null);

    const [gbForm, setGbForm] = useState<Partial<HotspotDefinition>>({
        id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, category: 'GIFTBOX', prizes: [0.05, 0.5]
    });
    const [isEditingGB, setIsEditingGB] = useState<string | null>(null);
    const prizeOptions = [0.05, 0.5, 1, 10, 100];

    useEffect(() => {
        if (activeTab === 'users' || activeTab === 'dashboard') loadUsers();
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
        return d.toLocaleDateString();
    };

    const handleResetAction = async () => {
        if (isResetting) return;
        if (window.confirm("RESET PROTOCOL: Ștergeți DEFINITIV documentul din server? Toate punctele vor deveni zero.")) {
            setIsResetting(true);
            try {
                await onResetMyAccount();
            } catch (e: any) {
                alert("Reset Failed: " + e.message);
            } finally {
                setIsResetting(false);
            }
        }
    };

    const handleToggleBan = async (id: string, b: boolean) => {
        await toggleUserBan(id, !b);
        loadUsers();
    };

    const handleToggleBiometric = async (id: string, b: boolean) => {
        await toggleUserBiometricSetting(id, !b);
        loadUsers();
    };

    const handleSaveHotspot = () => {
        if (!hForm.name || !hForm.id) return alert("ID and Name required.");
        const newHotspot = { ...hForm, id: hForm.id } as HotspotDefinition;
        if (isEditingHotspot) onSaveHotspots(customHotspots.map(h => h.id === isEditingHotspot ? newHotspot : h));
        else onSaveHotspots([...customHotspots, newHotspot]);
        setIsEditingHotspot(null);
        setHForm({ id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, density: 1000, category: 'URBAN', baseValue: 100, logoUrl: '', customText: '' });
    };

    const handleSaveGiftBox = () => {
        const newGB = { ...gbForm, category: 'GIFTBOX' as HotspotCategory, baseValue: 0 } as HotspotDefinition;
        if (isEditingGB) onSaveHotspots(customHotspots.map(h => h.id === isEditingGB ? newGB : h));
        else onSaveHotspots([...customHotspots, newGB]);
        setIsEditingGB(null);
    };

    const filteredUsers = useMemo(() => {
        return users.filter(u => (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) || (u.id || '').toLowerCase().includes(searchQuery.toLowerCase()));
    }, [users, searchQuery]);

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
                    <h1 className="text-xl font-black text-white uppercase tracking-tighter leading-none">Admin Terminal</h1>
                </div>
                <div className="flex gap-4 overflow-x-auto no-scrollbar">
                    {['dashboard', 'users', 'ads', 'hotspots', 'giftboxes', 'system'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`pb-3 text-[10px] font-black uppercase tracking-widest border-b-2 whitespace-nowrap transition-all ${activeTab === tab ? 'border-cyan-400 text-white' : 'border-transparent text-slate-500'}`}>{tab}</button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-40 no-scrollbar">
                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Users className="text-cyan-400 mb-3" size={28} /><span className="text-3xl font-black text-white">{stats.totalUsers}</span><span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mt-2">Hunters</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Coins className="text-amber-400 mb-3" size={28} /><span className="text-3xl font-black text-white">{stats.totalHotspots}</span><span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mt-2">Points</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Megaphone className="text-red-400 mb-3" size={28} /><span className="text-3xl font-black text-white">{stats.pendingAds}</span><span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mt-2">Ads</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Wallet className="text-green-400 mb-3" size={28} /><span className="text-2xl font-black text-white">{(stats.totalBalance/1000).toFixed(1)}k</span><span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mt-2">Total ELZR</span></div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="space-y-4">
                        <div className="relative"><Search className="absolute left-4 top-3 text-slate-500" size={18}/><input type="text" placeholder="Search Hunter..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:border-cyan-500" /></div>
                        {isLoadingUsers ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-cyan-400" /></div> : filteredUsers.map(user => (
                            <div key={user.id} className="bg-slate-900 border border-slate-800 rounded-[2rem] p-5 space-y-4">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">{user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <Users className="text-cyan-400" size={24}/>}</div>
                                        <div><h3 className="text-white font-bold text-sm uppercase">{user.username || 'Anon'}</h3><p className="text-[9px] text-slate-500 font-mono tracking-tighter">{user.id}</p></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleToggleBan(user.id, user.isBanned)} className={`p-2.5 rounded-xl border ${user.isBanned ? 'bg-green-600 border-green-500 text-white' : 'bg-red-900/20 border-red-900/40 text-red-500'}`}>{user.isBanned ? <Unlock size={18}/> : <Lock size={18}/>}</button>
                                        <button onClick={async () => { if(confirm("Wipe this user?")) { await resetUserInFirebase(parseInt(user.id)); loadUsers(); } }} className="p-2.5 bg-slate-800 border border-slate-700 text-slate-400 rounded-xl"><RotateCcw size={18}/></button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[9px] font-black text-slate-500 uppercase tracking-widest border-t border-slate-800/50 pt-3">
                                    <div className="bg-black/30 p-2 rounded-lg"><p className="mb-0.5">Joined</p><p className="text-white">{formatDate(user.joinedAt)}</p></div>
                                    <div className="bg-black/30 p-2 rounded-lg"><p className="mb-0.5">Balance</p><p className="text-cyan-400">{user.balance?.toLocaleString() || 0} ELZR</p></div>
                                </div>
                                <button onClick={() => handleToggleBiometric(user.id, user.biometricEnabled !== false)} className={`w-full py-3 rounded-xl border flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all ${user.biometricEnabled !== false ? 'bg-slate-800 border-slate-700 text-cyan-400' : 'bg-amber-900/10 border-amber-900/30 text-amber-500'}`}><Fingerprint size={14}/> {user.biometricEnabled !== false ? 'Biometrics On' : 'Biometrics Bypassed'}</button>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'hotspots' && (
                    <div className="space-y-6">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                            <h2 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-widest"><Plus size={18} className="text-cyan-400" /> New Coin Spot</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="ID" value={hForm.id} onChange={e => setHForm({...hForm, id: e.target.value})} className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white" />
                                <input type="text" placeholder="Name" value={hForm.name} onChange={e => setHForm({...hForm, name: e.target.value})} className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white" />
                            </div>
                            <div className="h-40 rounded-xl border border-slate-800 overflow-hidden relative">
                                <MapContainer center={[hForm.coords?.lat || 44.4268, hForm.coords?.lng || 26.1025]} zoom={15} className="h-full w-full">
                                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                                    <LocationPicker coords={hForm.coords as Coordinate} onPick={c => setHForm({...hForm, coords: c})} />
                                </MapContainer>
                            </div>
                            <button onClick={handleSaveHotspot} className="w-full py-3 bg-cyan-600 text-white font-black rounded-xl uppercase text-[10px] tracking-widest shadow-lg">Activate Spot</button>
                        </div>
                        {customHotspots.map(h => (
                            <div key={h.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex justify-between items-center"><div className="flex items-center gap-3"><div className="text-xl">🏙️</div><div><p className="text-white font-bold text-xs uppercase leading-none">{h.name}</p><p className="text-[9px] text-slate-500 font-mono mt-1">{h.id} • {h.baseValue} ELZR</p></div></div><button onClick={() => onDeleteHotspot(h.id)} className="p-2 bg-red-900/20 text-red-500 rounded-xl"><Trash2 size={16}/></button></div>
                        ))}
                    </div>
                )}

                {activeTab === 'system' && (
                    <div className="space-y-6">
                        <div className="bg-red-950/20 border-2 border-red-900/40 p-8 rounded-[3rem] text-center shadow-2xl">
                            <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
                            <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Protocol Danger Zone</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed mb-8 px-4">Resetting your account will PERMANENTLY erase your Firestore document and all extracted assets from the database.</p>
                            <button onClick={handleResetAction} disabled={isResetting} className="w-full py-5 bg-red-600 hover:bg-red-500 text-white rounded-[1.5rem] font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(220,38,38,0.3)] active:scale-95 transition-all">
                                {isResetting ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                                {isResetting ? "WIPING SERVER..." : "WIPE SERVER DATA"}
                            </button>
                        </div>
                        <button onClick={onToggleTestMode} className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl transition-all ${isTestMode ? 'bg-green-600 border border-green-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-500'}`}>Simulator: {isTestMode ? 'ACTIVE' : 'OFF'}</button>
                    </div>
                )}
            </div>
        </div>
    );
};
