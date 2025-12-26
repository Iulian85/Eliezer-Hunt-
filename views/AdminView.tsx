
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

    const handleResetUserAccount = async (id: string) => {
        if (window.confirm(`ACCOUNT RESET: Clear all extraction progress for user ${id}?`)) {
            const success = await resetUserInFirebase(parseInt(id));
            if (success) {
                alert("Account progress has been reset on server.");
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
        if (window.confirm(newStatus ? `ENABLE SECURITY: Mandatory biometric lock for user ${id}?` : `DISABLE SECURITY: Allow bypass for user ${id}?`)) {
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
                let width = img.width; let height = img.height;
                if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
                else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                setHForm(prev => ({ ...prev, logoUrl: canvas.toDataURL('image/png', 0.7) }));
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleSaveHotspot = () => {
        if (!hForm.name || !hForm.id) return alert("ID and Name required.");
        const newHotspot = { ...hForm, id: hForm.id } as HotspotDefinition;
        if (isEditingHotspot) onSaveHotspots(customHotspots.map(h => h.id === isEditingHotspot ? newHotspot : h));
        else onSaveHotspots([...customHotspots, newHotspot]);
        setIsEditingHotspot(null);
        setHForm({ id: '', name: '', coords: { lat: 52.5200, lng: 13.4050 }, radius: 200, density: 1000, category: 'URBAN', baseValue: 100, logoUrl: '', customText: '' });
    };

    const handleSaveGiftBox = () => {
        if (!gbForm.id || !gbForm.name) return alert("Missing ID or Name for Gift Box.");
        const newGB = { ...gbForm, category: 'GIFTBOX' as HotspotCategory, baseValue: 0 } as HotspotDefinition;
        if (isEditingGB) onSaveHotspots(customHotspots.map(h => h.id === isEditingGB ? newGB : h));
        else onSaveHotspots([...customHotspots, newGB]);
        setIsEditingGB(null);
        setGbForm({ id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, category: 'GIFTBOX', prizes: [0.05, 0.5] });
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
                <div className="flex items-center gap-2 mb-4"><ShieldCheck className="text-cyan-400" size={24} /><h1 className="text-xl font-black text-white uppercase tracking-tighter">Admin Terminal</h1></div>
                <div className="flex gap-4 overflow-x-auto no-scrollbar">
                    {['dashboard', 'users', 'ads', 'hotspots', 'giftboxes', 'system'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`pb-3 text-sm font-bold border-b-2 whitespace-nowrap transition-all ${activeTab === tab ? 'border-cyan-400 text-white' : 'border-transparent text-slate-500'}`}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-32 no-scrollbar">
                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Users className="text-cyan-400 mb-3" size={28} /><span className="text-3xl font-black text-white">{stats.totalUsers}</span><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Hunters</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Coins className="text-amber-400 mb-3" size={28} /><span className="text-3xl font-black text-white">{stats.totalHotspots}</span><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Spots</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Megaphone className="text-red-400 mb-3" size={28} /><span className="text-3xl font-black text-white">{stats.pendingAds}</span><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Ads</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Wallet className="text-green-400 mb-3" size={28} /><span className="text-2xl font-black text-white">{(stats.totalBalance / 1000).toFixed(1)}k</span><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Total ELZR</span></div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="space-y-4">
                        <div className="relative mb-6"><Search className="absolute left-4 top-3.5 text-slate-500" size={20} /><input type="text" placeholder="Search Hunter..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:border-cyan-500 transition-all" /></div>
                        {isLoadingUsers ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-cyan-400" size={40} /></div> : filteredUsers.map(user => (
                            <div key={user.id} className={`bg-slate-900 border-2 rounded-[2.5rem] p-6 space-y-4 shadow-2xl relative ${user.isBanned ? 'border-red-600/40 bg-red-950/10' : 'border-slate-800'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-2xl bg-slate-800 border-2 border-slate-700 overflow-hidden">{user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <Users className="text-cyan-400" size={28} />}</div>
                                        <div><h3 className="font-black text-white text-base uppercase leading-none">{user.username || 'Hunter'}</h3><p className="text-[9px] text-slate-500 font-mono mt-1">ID: {user.id}</p></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleToggleBan(user.id, !!user.isBanned)} className={`p-2.5 rounded-xl border-2 ${user.isBanned ? 'bg-green-600/20 text-green-500 border-green-600/30' : 'bg-amber-600/20 text-amber-500 border-amber-600/30'}`}>{user.isBanned ? <Unlock size={20}/> : <Lock size={20}/>}</button>
                                        <button onClick={() => handleDeleteUser(user.id)} className="p-2.5 bg-red-600/20 text-red-500 rounded-xl border-2 border-red-600/30"><Trash2 size={20}/></button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest">
                                    <div className="bg-black/30 p-3 rounded-2xl border border-white/5 text-center"><span className="text-slate-500 block mb-1">Joined</span><span className="text-white">{formatDate(user.joinedAt)}</span></div>
                                    <div className="bg-black/30 p-3 rounded-2xl border border-white/5 text-center"><span className="text-slate-500 block mb-1">Balance</span><span className="text-cyan-400">{(user.balance || 0).toLocaleString()} ELZR</span></div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleResetUserAccount(user.id)} className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-black text-[9px] uppercase border border-slate-700 flex items-center justify-center gap-2"><RotateCcw size={14}/> Wipe Progress</button>
                                    <button onClick={() => handleToggleBiometric(user.id, user.biometricEnabled !== false)} className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase border flex items-center justify-center gap-2 ${user.biometricEnabled !== false ? 'bg-cyan-900/20 text-cyan-400 border-cyan-800/40' : 'bg-red-900/20 text-red-500 border-red-800/40'}`}><Fingerprint size={14}/> {user.biometricEnabled !== false ? 'Biometrics On' : 'Bypassed'}</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'system' && (
                    <div className="space-y-6">
                        <div className="bg-red-950/20 border-2 border-red-900/40 p-8 rounded-[3rem] text-center shadow-2xl relative overflow-hidden">
                            <AlertTriangle className="mx-auto text-red-500 mb-6" size={64} />
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Danger Zone</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-8">Acest protocol va șterge definitiv baza ta de date de pe server.</p>
                            <button onClick={onResetMyAccount} className="w-full py-5 bg-red-600 text-white rounded-2xl font-black uppercase text-sm tracking-widest flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all"><RefreshCw size={24}/> EXECUTE WIPE</button>
                        </div>
                        <button onClick={onToggleTestMode} className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase border transition-all ${isTestMode ? 'bg-green-600 border-green-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>Simulator Mode: {isTestMode ? 'ACTIVE' : 'OFF'}</button>
                    </div>
                )}
            </div>
        </div>
    );
};
