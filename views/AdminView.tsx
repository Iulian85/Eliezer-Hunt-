
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
    useMapEvents({ click(e) { onPick({ lat: e.latlng.lat, lng: e.latlng.lng }); } });
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

    const [hForm, setHForm] = useState<Partial<HotspotDefinition>>({ id: '', name: '', coords: { lat: 52.5200, lng: 13.4050 }, radius: 200, density: 1000, category: 'URBAN', baseValue: 100, logoUrl: '', customText: '' });
    const [isEditingHotspot, setIsEditingHotspot] = useState<string | null>(null);
    const [gbForm, setGbForm] = useState<Partial<HotspotDefinition>>({ id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, category: 'GIFTBOX', prizes: [0.05, 0.5] });
    const [isEditingGB, setIsEditingGB] = useState<string | null>(null);
    const prizeOptions = [0.05, 0.5, 1, 10, 100];

    useEffect(() => { if (activeTab === 'users' || activeTab === 'dashboard') loadUsers(); }, [activeTab]);

    const loadUsers = async () => {
        setIsLoadingUsers(true);
        const data = await getAllUsersAdmin();
        setUsers(data);
        setIsLoadingUsers(false);
    };

    const formatDate = (ts?: number) => ts ? new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ts) : 'N/A';

    const handleDeleteUser = async (id: string) => {
        if (window.confirm(`PERMANENT DELETE: Remove user ${id}? This cannot be undone.`)) {
            await deleteUserFirebase(id);
            setUsers(prev => prev.filter(u => u.id !== id));
        }
    };

    const handleResetUserAccount = async (id: string) => {
        if (window.confirm(`RESET PROGRESS: Wipe all data for user ${id}?`)) {
            await resetUserInFirebase(parseInt(id));
            loadUsers();
        }
    };

    const handleToggleBan = async (id: string, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        if (window.confirm(newStatus ? `BAN USER: Block ${id}?` : `UNBAN USER: Restore ${id}?`)) {
            await toggleUserBan(id, newStatus);
            setUsers(prev => prev.map(u => u.id === id ? { ...u, isBanned: newStatus } : u));
        }
    };

    const handleToggleBiometric = async (id: string, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        if (window.confirm(newStatus ? `ENFORCE SECURITY: Require biometric for user ${id}?` : `RELAX SECURITY: Allow user ${id} to bypass biometric?`)) {
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
                let width = img.width, height = img.height;
                if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
                setHForm(prev => ({ ...prev, logoUrl: canvas.toDataURL('image/png', 0.7) }));
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleSaveHotspot = () => {
        if (!hForm.name || !hForm.id) return alert("ID and Name required.");
        const newHotspot = { ...hForm, id: hForm.id } as HotspotDefinition;
        onSaveHotspots(isEditingHotspot ? customHotspots.map(h => h.id === isEditingHotspot ? newHotspot : h) : [...customHotspots, newHotspot]);
        setIsEditingHotspot(null);
        setHForm({ id: '', name: '', coords: { lat: 52.5200, lng: 13.4050 }, radius: 200, density: 1000, category: 'URBAN', baseValue: 100, logoUrl: '', customText: '' });
    };

    const filteredUsers = useMemo(() => users.filter(u => (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) || (u.id || '').toLowerCase().includes(searchQuery.toLowerCase())), [users, searchQuery]);
    const stats = { totalUsers: users.length, pendingAds: allCampaigns.filter(c => c.data.status === AdStatus.PENDING_REVIEW).length, totalBalance: users.reduce((acc, u) => acc + (u.balance || 0), 0), totalHotspots: customHotspots.length };

    return (
        <div className="h-full w-full bg-slate-950 flex flex-col">
            <div className="bg-slate-900 border-b border-slate-800 p-4 pb-0">
                <div className="flex items-center gap-2 mb-4"><ShieldCheck className="text-cyan-400" size={24} /><h1 className="text-xl font-black text-white uppercase tracking-tighter">Admin Terminal</h1></div>
                <div className="flex gap-4 overflow-x-auto no-scrollbar">
                    {['dashboard', 'users', 'ads', 'hotspots', 'giftboxes', 'system'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`pb-3 text-sm font-bold border-b-2 whitespace-nowrap uppercase tracking-widest ${activeTab === tab ? 'border-cyan-400 text-white' : 'border-transparent text-slate-500'}`}>{tab}</button>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-32 no-scrollbar">
                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Users className="text-cyan-400 mb-3" size={28} /><span className="text-3xl font-black text-white leading-none">{stats.totalUsers}</span><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Hunters</span></div>
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col items-center"><Coins className="text-amber-400 mb-3" size={28} /><span className="text-3xl font-black text-white leading-none">{stats.totalHotspots}</span><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-2">Active Points</span></div>
                    </div>
                )}
                {activeTab === 'users' && (
                    <div className="space-y-4">
                        <div className="relative mb-6"><Search className="absolute left-4 top-3.5 text-slate-500" size={20} /><input type="text" placeholder="Search by ID or Username..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:border-cyan-500 transition-all" /></div>
                        {isLoadingUsers ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-cyan-400" size={40} /></div> : (
                            <div className="space-y-6">
                                {filteredUsers.map(user => (
                                    <div key={user.id} className={`bg-slate-900 border-2 rounded-[2.5rem] p-6 flex flex-col transition-all shadow-2xl ${user.isBanned ? 'border-red-600/40 bg-red-950/10' : 'border-slate-800'}`}>
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-16 h-16 rounded-[1.5rem] bg-slate-800 border-2 border-slate-700 overflow-hidden">{user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <Users className="text-cyan-400" size={32} />}</div>
                                                <div>
                                                    <h3 className="font-black text-white text-base uppercase tracking-tighter">{user.username || 'Anon'}</h3>
                                                    <p className="text-[10px] text-slate-500 font-mono">UID: {user.id}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleToggleBan(user.id, !!user.isBanned)} className={`p-3 rounded-2xl border-2 ${user.isBanned ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>{user.isBanned ? <Unlock size={22} /> : <Lock size={22} />}</button>
                                                <button onClick={() => handleToggleBiometric(user.id, user.biometricEnabled !== false)} className={`p-3 rounded-2xl border-2 ${user.biometricEnabled !== false ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}><Fingerprint size={22} /></button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-black/30 p-4 rounded-[1.8rem] border border-white/5"><span className="text-[9px] text-slate-500 font-black uppercase block mb-1">Yield</span><span className="text-sm font-black text-cyan-400">{(user.balance || 0).toLocaleString()} ELZR</span></div>
                                            <button onClick={() => handleResetUserAccount(user.id)} className="bg-slate-800 p-4 rounded-[1.8rem] border border-white/5 flex items-center justify-center gap-2"><RotateCcw size={16}/><span className="text-[9px] font-black uppercase">Reset All</span></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
