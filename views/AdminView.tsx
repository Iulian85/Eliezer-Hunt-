
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Campaign, AdStatus, HotspotDefinition, HotspotCategory, Coordinate } from '../types';
import { ShieldCheck, Check, X, Play, Clock, AlertTriangle, Users, Ban, Wallet, Globe, Search, Lock, Unlock, LayoutDashboard, Megaphone, Trash2, UserX, MapPin, Plus, Edit2, Coins, Map as MapIcon, Upload, Loader2, Gift, Calendar, Activity, RefreshCw } from 'lucide-react';
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
    return <Marker position={[coords.lat, coords.lng]} icon={L.divIcon({ html: '<div class="w-6 h-6 bg-red-600 border-2 border-white rounded-full"></div>', iconSize: [24,24] })} />;
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

    // Hotspot State
    const [hForm, setHForm] = useState<Partial<HotspotDefinition>>({ id: '', name: '', coords: { lat: 52.52, lng: 13.4 }, radius: 200, category: 'URBAN', baseValue: 100 });
    const [isEditingHotspot, setIsEditingHotspot] = useState<string | null>(null);

    // Gift Box State
    const [gbForm, setGbForm] = useState<Partial<HotspotDefinition>>({ id: '', name: '', coords: { lat: 44.42, lng: 26.1 }, category: 'GIFTBOX', prizes: [0.05, 0.5] });
    const [isEditingGB, setIsEditingGB] = useState<string | null>(null);

    useEffect(() => { if (activeTab === 'users' || activeTab === 'dashboard') loadUsers(); }, [activeTab]);

    const loadUsers = async () => {
        setIsLoadingUsers(true);
        const data = await getAllUsersAdmin();
        setUsers(data);
        setIsLoadingUsers(false);
    };

    const handleDeleteUser = async (id: string) => {
        if (window.confirm(`Ștergi definitiv utilizatorul ${id}?`)) {
            await deleteUserFirebase(id);
            setUsers(prev => prev.filter(u => u.id !== id));
        }
    };

    const handleToggleBan = async (id: string, b: boolean) => {
        await toggleUserBan(id, !b);
        setUsers(prev => prev.map(u => u.id === id ? { ...u, isBanned: !b } : u));
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            setHForm(prev => ({ ...prev, logoUrl: event.target?.result as string }));
        };
        reader.readAsDataURL(file);
    };

    const handleSaveHotspot = () => {
        if (!hForm.id) return;
        const newH = { ...hForm } as HotspotDefinition;
        if (isEditingHotspot) onSaveHotspots(customHotspots.map(h => h.id === isEditingHotspot ? newH : h));
        else onSaveHotspots([...customHotspots, newH]);
        setIsEditingHotspot(null);
    };

    const filteredUsers = useMemo(() => {
        return users.filter(u => (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) || (u.id || '').includes(searchQuery));
    }, [users, searchQuery]);

    return (
        <div className="h-full w-full bg-slate-950 flex flex-col">
            <div className="bg-slate-900 border-b border-slate-800 p-4">
                <div className="flex gap-4 overflow-x-auto no-scrollbar">
                    {['dashboard', 'users', 'ads', 'hotspots', 'giftboxes', 'system'].map(t => (
                        <button key={t} onClick={() => setActiveTab(t as any)} className={`pb-2 text-xs font-bold uppercase ${activeTab === t ? 'border-b-2 border-cyan-400 text-white' : 'text-slate-500'}`}>{t}</button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-32">
                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-center"><Users className="mx-auto mb-2 text-cyan-400" /><div className="text-2xl font-black">{users.length}</div><div className="text-[10px] text-slate-500 uppercase">Hunters</div></div>
                        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-center"><Megaphone className="mx-auto mb-2 text-red-400" /><div className="text-2xl font-black">{allCampaigns.filter(c => c.data.status === 'pending_review').length}</div><div className="text-[10px] text-slate-500 uppercase">New Ads</div></div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="space-y-4">
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                            <input type="text" placeholder="Search user..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white" />
                        </div>
                        {isLoadingUsers ? <Loader2 className="animate-spin mx-auto mt-10 text-cyan-400" /> : (
                            filteredUsers.map(u => (
                                <div key={u.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex justify-between items-center">
                                    <div>
                                        <div className="font-bold text-white text-sm">{u.username || 'Anon'}</div>
                                        <div className="text-[10px] text-slate-500 font-mono">ID: {u.id} | Bal: {u.balance || 0}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleToggleBan(u.id, !!u.isBanned)} className={`p-2 rounded-lg ${u.isBanned ? 'bg-green-600/20 text-green-500' : 'bg-amber-600/20 text-amber-500'}`}>{u.isBanned ? <Unlock size={16}/> : <Lock size={16}/>}</button>
                                        <button onClick={() => handleDeleteUser(u.id)} className="p-2 bg-red-600/20 text-red-500 rounded-lg"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'ads' && (
                    <div className="space-y-4">
                        {allCampaigns.map(c => (
                            <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="text-sm font-bold text-white">{c.data.brandName}</div>
                                    <div className="text-[9px] font-black uppercase px-2 py-0.5 bg-slate-800 rounded text-cyan-400 border border-cyan-950">{c.data.status}</div>
                                </div>
                                <div className="flex gap-2">
                                    {c.data.status === 'pending_review' && (
                                        <>
                                            <button onClick={() => onApprove(c.id)} className="flex-1 bg-green-600 text-white py-2 rounded-xl text-xs font-bold">APPROVE</button>
                                            <button onClick={() => onReject(c.id)} className="flex-1 bg-red-600/20 text-red-500 py-2 rounded-xl text-xs font-bold">REJECT</button>
                                        </>
                                    )}
                                    <button onClick={() => onDeleteCampaign(c.id)} className="p-2 bg-slate-800 text-slate-400 rounded-xl"><Trash2 size={16}/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'hotspots' && (
                    <div className="space-y-4">
                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                            <input type="text" placeholder="ID" value={hForm.id} onChange={e=>setHForm({...hForm, id:e.target.value})} className="w-full bg-slate-950 mb-2 p-2 rounded text-sm" />
                            <input type="text" placeholder="Name" value={hForm.name} onChange={e=>setHForm({...hForm, name:e.target.value})} className="w-full bg-slate-950 mb-2 p-2 rounded text-sm" />
                            <button onClick={handleSaveHotspot} className="w-full bg-cyan-600 py-2 rounded-xl font-bold text-sm">SAVE HOTSPOT</button>
                        </div>
                        {customHotspots.map(h => (
                            <div key={h.id} className="bg-slate-900 p-3 rounded-xl flex justify-between items-center">
                                <div className="text-sm text-white font-bold">{h.name}</div>
                                <button onClick={() => onDeleteHotspot(h.id)} className="text-red-500"><Trash2 size={16}/></button>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'system' && (
                    <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-2xl">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><AlertTriangle className="text-red-500" /> DANGER ZONE</h2>
                        <div className="space-y-4">
                            <button onClick={onToggleTestMode} className={`w-full py-3 rounded-xl font-bold text-xs ${isTestMode ? 'bg-green-500 text-black' : 'bg-slate-800 text-slate-500'}`}>TEST MODE: {isTestMode ? 'ON' : 'OFF'}</button>
                            <button onClick={onResetMyAccount} className="w-full py-4 bg-red-600 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all">RESET MY ACCOUNT (Nuclear)</button>
                            <p className="text-[10px] text-red-400 text-center font-bold uppercase opacity-60">Caution: This will purge your identity and all extraction history.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
