
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

    // Hotspot State
    const [hForm, setHForm] = useState<Partial<HotspotDefinition>>({
        id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, density: 1000, category: 'URBAN', baseValue: 100, logoUrl: '', customText: ''
    });
    const [isEditingHotspot, setIsEditingHotspot] = useState<string | null>(null);

    // Gift Box State
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

    const formatDate = (ts?: any) => {
        if (!ts) return 'N/A';
        const date = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
        return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
    };

    const handleDeleteUser = async (id: string) => {
        if (window.confirm(`CRITICAL WARNING: Permanently delete user ${id}? This action IS IRREVERSIBLE.`)) {
            await deleteUserFirebase(id);
            setUsers(prev => prev.filter(u => u.id !== id));
        }
    };

    const handleResetAction = async () => {
        if (isResetting) return;
        if (window.confirm("RESET PROTOCOL: Aceasta va șterge DEFINITIV documentul tău din Firestore. Continuați?")) {
            setIsResetting(true);
            try {
                await onResetMyAccount();
            } catch (e: any) {
                alert("Reset Failed: " + (e.message || "Unknown error"));
            } finally {
                setIsResetting(false);
            }
        }
    };

    const handleResetUserAccount = async (id: string) => {
        if (window.confirm(`ACCOUNT RESET: Clear all extraction progress for user ${id}?`)) {
            const success = await resetUserInFirebase(parseInt(id));
            if (success) {
                alert("User progress has been wiped from server.");
                loadUsers();
            }
        }
    };

    const handleToggleBan = async (id: string, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        if (window.confirm(newStatus ? `LOCK ACCOUNT: Block user ${id}?` : `UNLOCK ACCOUNT: Restore access for user ${id}?`)) {
            await toggleUserBan(id, newStatus);
            setUsers(prev => prev.map(u => u.id === id ? { ...u, isBanned: newStatus } : u));
        }
    };

    const handleToggleBiometric = async (id: string, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        if (window.confirm(newStatus ? `ENABLE BIOMETRICS: Mandatory lock for ${id}?` : `DISABLE BIOMETRICS: Bypass security for ${id}?`)) {
            await toggleUserBiometricSetting(id, newStatus);
            setUsers(prev => prev.map(u => u.id === id ? { ...u, biometricEnabled: newStatus } : u));
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 128;
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                } else {
                    if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                const base64 = canvas.toDataURL('image/png', 0.7);
                setHForm(prev => ({ ...prev, logoUrl: base64 }));
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleSaveHotspot = () => {
        if (!hForm.name || !hForm.id) return alert("ID and Name required.");
        const newHotspot = { ...hForm, id: hForm.id } as HotspotDefinition;
        if (isEditingHotspot) {
            onSaveHotspots(customHotspots.map(h => h.id === isEditingHotspot ? newHotspot : h));
        } else {
            if (customHotspots.some(h => h.id === newHotspot.id)) return alert("ID already exists.");
            onSaveHotspots([...customHotspots, newHotspot]);
        }
        setIsEditingHotspot(null);
        setHForm({ id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, density: 1000, category: 'URBAN', baseValue: 100, logoUrl: '', customText: '' });
    };

    const handleSaveGiftBox = () => {
        if (!gbForm.id || !gbForm.name) return alert("Missing ID or Name for Gift Box.");
        const newGB = { ...gbForm, category: 'GIFTBOX' as HotspotCategory, baseValue: 0 } as HotspotDefinition;
        if (isEditingGB) onSaveHotspots(customHotspots.map(h => h.id === isEditingGB ? newGB : h));
        else onSaveHotspots([...customHotspots, newGB]);
        setIsEditingGB(null);
        setGbForm({ id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, category: 'GIFTBOX', prizes: [0.05, 0.5] });
    };

    const togglePrize = (val: number) => {
        const current = gbForm.prizes || [];
        if (current.includes(val)) setGbForm({...gbForm, prizes: current.filter(v => v !== val)});
        else setGbForm({...gbForm, prizes: [...current, val]});
    };

    const filteredUsers = useMemo(() => {
        return users.filter(u =>
            (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (u.id || '').toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [users, searchQuery]);

    const stats = {
        totalUsers: users.length,
        pendingAds: allCampaigns.filter(c => c.data.status === AdStatus.PENDING_REVIEW).length,
        totalBalance: users.reduce((acc, u) => acc + (u.balance || 0), 0),
        totalHotspots: customHotspots.length
    };

    const renderAdsTab = () => (
        <div className="space-y-4 pb-32">
            <h3 className="text-white font-bold flex items-center gap-2 px-1 mb-4">
                <Megaphone size={18} className="text-cyan-400" /> CAMPAIGN MANAGEMENT ({allCampaigns.length})
            </h3>
            {allCampaigns.map(campaign => (
                <div key={campaign.id} className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-lg mb-4">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-700 bg-black">
                                <img src={campaign.data.logoUrl} className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm uppercase tracking-tighter">{campaign.data.brandName}</h4>
                                <span className="text-[9px] text-slate-500 font-mono">{campaign.id.slice(-8)}</span>
                            </div>
                        </div>
                        <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border
                            ${campaign.data.status === AdStatus.PENDING_REVIEW ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                              campaign.data.status === AdStatus.ACTIVE ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'text-slate-500 border-slate-800'}
                        `}>{campaign.data.status}</div>
                    </div>
                    <div className="p-4">
                        <div className="h-40 bg-black rounded-2xl mb-4 overflow-hidden relative group">
                            {previewVideo === campaign.id ? (
                                <UniversalVideoPlayer url={campaign.data.videoUrl} autoPlay className="w-full h-full object-contain" />
                            ) : (
                                <button onClick={() => setPreviewVideo(campaign.id)} className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/40 hover:text-white transition-all">
                                    <Play size={32} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Preview Video</span>
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {campaign.data.status === AdStatus.PENDING_REVIEW && (
                                <button onClick={() => onApprove(campaign.id)} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest">Approve</button>
                            )}
                            <button onClick={() => onDeleteCampaign(campaign.id)} className="p-3 bg-red-900/20 text-red-500 rounded-xl"><Trash2 size={18}/></button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div className="h-full w-full bg-slate-950 flex flex-col">
            <div className="bg-slate-900 border-b border-slate-800 p-4 pb-0">
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="text-cyan-400" size={24} />
                    <h1 className="text-xl font-black text-white uppercase tracking-tighter">Admin Terminal</h1>
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
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] flex flex-col items-center"><Users className="text-cyan-400 mb-3" size={28} /><span className="text-3xl font-black text-white">{stats.totalUsers}</span><span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mt-2">Hunters</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] flex flex-col items-center"><Coins className="text-amber-400 mb-3" size={28} /><span className="text-3xl font-black text-white">{stats.totalHotspots}</span><span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mt-2">Spots</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] flex flex-col items-center"><Megaphone className="text-red-400 mb-3" size={28} /><span className="text-3xl font-black text-white">{stats.pendingAds}</span><span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mt-2">Ads</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] flex flex-col items-center"><Wallet className="text-green-400 mb-3" size={28} /><span className="text-2xl font-black text-white">{(stats.totalBalance / 1000).toFixed(1)}k</span><span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mt-2">Total ELZR</span></div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="space-y-6">
                        <div className="relative"><Search className="absolute left-4 top-3.5 text-slate-500" size={20}/><input type="text" placeholder="Search by Username or ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:border-cyan-500 transition-all" /></div>
                        {isLoadingUsers ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-cyan-400" size={32} /></div> : filteredUsers.map(user => (
                            <div key={user.id} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-[1.2rem] bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">{user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <Users className="text-cyan-400" size={28}/>}</div>
                                        <div><h3 className="text-white font-black text-base uppercase leading-tight">{user.username || 'Anon Hunter'}</h3><p className="text-[10px] text-slate-500 font-mono tracking-tighter">ID: {user.id}</p></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleToggleBan(user.id, user.isBanned)} className={`p-3 rounded-2xl border transition-all ${user.isBanned ? 'bg-green-600 border-green-500 text-white' : 'bg-amber-900/20 border-amber-900/40 text-amber-500'}`}>{user.isBanned ? <Unlock size={20}/> : <Lock size={20}/>}</button>
                                        <button onClick={() => handleDeleteUser(user.id)} className="p-3 bg-red-900/20 border border-red-900/40 text-red-500 rounded-2xl"><Trash2 size={20}/></button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-[10px] font-black uppercase tracking-widest">
                                    <div className="bg-black/30 p-3 rounded-2xl border border-white/5"><span className="text-slate-500 block mb-1">Joined</span><span className="text-white">{formatDate(user.joinedAt)}</span></div>
                                    <div className="bg-black/30 p-3 rounded-2xl border border-white/5"><span className="text-slate-500 block mb-1">Balance</span><span className="text-cyan-400">{user.balance?.toLocaleString() || 0} ELZR</span></div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleResetUserAccount(user.id)} className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-2xl border border-slate-700 font-black text-[10px] uppercase flex items-center justify-center gap-2"><RotateCcw size={14}/> Wipe Progress</button>
                                    <button onClick={() => handleToggleBiometric(user.id, user.biometricEnabled !== false)} className={`flex-1 py-3 rounded-2xl border font-black text-[10px] uppercase flex items-center justify-center gap-2 ${user.biometricEnabled !== false ? 'bg-cyan-900/20 border-cyan-900/40 text-cyan-400' : 'bg-red-900/20 border-red-900/40 text-red-500'}`}><Fingerprint size={14}/> {user.biometricEnabled !== false ? 'Biometrics Active' : 'Security Bypass'}</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'hotspots' && (
                    <div className="space-y-6">
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                            <h2 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-widest"><Plus size={20} className="text-cyan-400" /> {isEditingHotspot ? 'Edit Spot' : 'New Coin Spot'}</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="ID (ex: ny-park)" value={hForm.id} disabled={!!isEditingHotspot} onChange={e => setHForm({...hForm, id: e.target.value})} className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-cyan-500" />
                                <input type="text" placeholder="Display Name" value={hForm.name} onChange={e => setHForm({...hForm, name: e.target.value})} className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-cyan-500" />
                            </div>
                            <div className="h-48 rounded-2xl border border-slate-800 overflow-hidden relative z-0">
                                <MapContainer center={[hForm.coords?.lat || 44.4268, hForm.coords?.lng || 26.1025]} zoom={15} className="h-full w-full">
                                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                                    <LocationPicker coords={hForm.coords as Coordinate} onPick={c => setHForm({...hForm, coords: c})} />
                                </MapContainer>
                            </div>
                            <button onClick={handleSaveHotspot} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-lg transition-all active:scale-95">{isEditingHotspot ? 'Update Protocol' : 'Deploy Node'}</button>
                        </div>
                        {customHotspots.filter(h => h.category !== 'GIFTBOX').map(h => (
                            <div key={h.id} className="bg-slate-900 border border-slate-800 p-5 rounded-[2rem] flex justify-between items-center group shadow-xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-2xl border border-slate-700">{h.logoUrl ? <img src={h.logoUrl} className="w-full h-full object-cover rounded-2xl"/> : '🏙️'}</div>
                                    <div><p className="text-white font-black text-xs uppercase leading-none">{h.name}</p><p className="text-[9px] text-slate-500 font-mono mt-1.5">{h.id} • {h.baseValue} ELZR</p></div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { setHForm(h); setIsEditingHotspot(h.id); }} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl"><Edit2 size={16}/></button>
                                    <button onClick={() => onDeleteHotspot(h.id)} className="p-2.5 bg-red-900/20 text-red-500 rounded-xl"><Trash2 size={16}/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'ads' && renderAdsTab()}

                {activeTab === 'giftboxes' && (
                    <div className="space-y-6">
                        <div className="bg-slate-900 border border-amber-500/20 rounded-3xl p-6 space-y-4 shadow-[0_0_30px_rgba(245,158,11,0.05)]">
                            <h2 className="text-sm font-black text-amber-400 flex items-center gap-2 uppercase tracking-widest"><Gift size={20} /> Launch Gift Box</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="Box ID" value={gbForm.id} onChange={e => setGbForm({...gbForm, id: e.target.value})} className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white" />
                                <input type="text" placeholder="Box Name" value={gbForm.name} onChange={e => setGbForm({...gbForm, name: e.target.value})} className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white" />
                            </div>
                            <div className="flex flex-wrap gap-2 py-2">
                                {prizeOptions.map(p => (
                                    <button key={p} onClick={() => togglePrize(p)} className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all ${gbForm.prizes?.includes(p) ? 'bg-amber-500 border-amber-400 text-black shadow-lg shadow-amber-500/20' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>{p} TON</button>
                                ))}
                            </div>
                            <div className="h-48 rounded-2xl border border-slate-800 overflow-hidden relative z-0">
                                <MapContainer center={[gbForm.coords?.lat || 44.4268, gbForm.coords?.lng || 26.1025]} zoom={14} className="h-full w-full">
                                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                                    <LocationPicker coords={gbForm.coords as Coordinate} onPick={c => setGbForm({...gbForm, coords: c})} />
                                </MapContainer>
                            </div>
                            <button onClick={handleSaveGiftBox} className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95">Launch Protocol</button>
                        </div>
                        {customHotspots.filter(h => h.category === 'GIFTBOX').map(h => (
                            <div key={h.id} className="bg-slate-900 border border-amber-500/10 p-5 rounded-[2rem] flex justify-between items-center group shadow-xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 text-amber-500"><Gift size={24}/></div>
                                    <div><p className="text-white font-black text-xs uppercase leading-none">{h.name}</p><p className="text-[9px] text-slate-500 font-mono mt-1.5">{h.prizes?.length} Prize Slots • ID: {h.id}</p></div>
                                </div>
                                <button onClick={() => onDeleteHotspot(h.id)} className="p-2.5 bg-red-900/20 text-red-500 rounded-xl"><Trash2 size={16}/></button>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'system' && (
                    <div className="space-y-6">
                        <div className="bg-red-950/20 border-2 border-red-900/40 p-8 rounded-[3rem] text-center shadow-2xl relative overflow-hidden">
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-red-600/10 rounded-full blur-3xl"></div>
                            <AlertTriangle className="mx-auto text-red-500 mb-6" size={64} />
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-3 leading-none">Danger Zone</h2>
                            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed mb-8 px-4">Executarea acestui protocol va ȘTERGE DEFINITIV documentul tău de pe server. Balanța va fi RESETATĂ instantaneu.</p>
                            <button onClick={handleResetAction} disabled={isResetting} className="w-full py-5 bg-red-600 hover:bg-red-500 text-white rounded-[1.5rem] font-black uppercase text-sm tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_10px_40px_rgba(220,38,38,0.4)] active:scale-95 transition-all disabled:opacity-50">
                                {isResetting ? <Loader2 className="animate-spin" size={24} /> : <RefreshCw size={24} />}
                                {isResetting ? "Communicating..." : "WIPE SERVER DOC"}
                            </button>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2.5rem] space-y-4">
                            <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2"><Settings size={16} className="text-slate-500" /> Platform Switches</h3>
                            <button onClick={onToggleTestMode} className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl transition-all border ${isTestMode ? 'bg-green-600 border-green-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>Simulator Core: {isTestMode ? 'ENABLED' : 'OFF'}</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
