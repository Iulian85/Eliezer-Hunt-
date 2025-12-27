
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Campaign, AdStatus, HotspotDefinition, HotspotCategory, Coordinate } from '../types';
// Added CheckCircle2 to the import list from lucide-react
import { ShieldCheck, Check, X, Play, Clock, AlertTriangle, Users, Ban, Wallet, Globe, Search, Lock, Unlock, LayoutDashboard, Megaphone, BarChart3, Settings, Trash2, UserX, FlaskConical, MapPin, Plus, Edit2, Coins, Map as MapIcon, Upload, Image as ImageIcon, Loader2, Gift, Calendar, Activity, History, RotateCcw, AlertCircle, Fingerprint, RefreshCw, Send, Target, Crown, Sparkles, UserCheck, CreditCard, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { UniversalVideoPlayer } from '../components/UniversalVideoPlayer';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { getAllUsersAdmin, deleteUserFirebase, toggleUserBan, resetUserInFirebase, toggleUserBiometricSetting, markUserAirdropped, subscribeToWithdrawalRequests, updateWithdrawalStatus } from '../services/firebase';

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
    const [tonConnectUI] = useTonConnectUI();
    const adminAddress = useTonAddress();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'ads' | 'hotspots' | 'giftboxes' | 'airdrop' | 'payments' | 'system'>('dashboard');
    const [users, setUsers] = useState<any[]>([]);
    const [withdrawals, setWithdrawals] = useState<any[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [previewVideo, setPreviewVideo] = useState<string | null>(null);
    const [isProcessingAirdrop, setIsProcessingAirdrop] = useState<string | null>(null);
    const [isExecutingPayment, setIsExecutingPayment] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Hotspot State
    const [hForm, setHForm] = useState<Partial<HotspotDefinition>>({
        id: '', name: '', coords: { lat: 52.5200, lng: 13.4050 }, radius: 200, density: 1000, category: 'URBAN', baseValue: 100, logoUrl: '', customText: ''
    });
    const [isEditingHotspot, setIsEditingHotspot] = useState<string | null>(null);

    // Gift Box State
    const [gbForm, setGbForm] = useState<Partial<HotspotDefinition>>({
        id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, category: 'GIFTBOX', prizes: [0.05, 0.5]
    });
    const [isEditingGB, setIsEditingGB] = useState<string | null>(null);
    const prizeOptions = [0.05, 0.5, 1, 10, 100];

    useEffect(() => {
        if (activeTab === 'users' || activeTab === 'dashboard' || activeTab === 'airdrop' || activeTab === 'payments') {
            loadUsers();
        }
        if (activeTab === 'payments') {
            const unsub = subscribeToWithdrawalRequests(setWithdrawals);
            return () => unsub();
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
        const date = ts.toDate ? ts.toDate() : new Date(ts);
        return new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
    };

    const handleProcessPayment = async (req: any) => {
        const user = users.find(u => u.id === String(req.userId));
        if (!user || !user.walletAddress) return alert("User wallet missing.");
        if (!adminAddress) return alert("Please connect Admin Wallet first.");

        if (window.confirm(`PAYMENT PROTOCOL: Send ${req.amount} TON to ${user.username || user.id}? This will open Tonkeeper.`)) {
            setIsExecutingPayment(req.id);
            try {
                const transaction = {
                    validUntil: Math.floor(Date.now() / 1000) + 360,
                    messages: [
                        {
                            address: user.walletAddress,
                            amount: (Number(req.amount) * 1000000000).toString(),
                        }
                    ]
                };

                const result = await tonConnectUI.sendTransaction(transaction);
                if (result) {
                    await updateWithdrawalStatus(req.id, 'completed');
                    alert("Payment Verified on Ledger.");
                }
            } catch (e) {
                console.error("Payment error", e);
                alert("Transaction canceled or failed.");
            } finally {
                setIsExecutingPayment(null);
            }
        }
    };

    const handleDeleteUser = async (id: string) => {
        if (window.confirm(`CRITICAL WARNING: Permanently delete user ${id}? This action IS IRREVERSIBLE.`)) {
            await deleteUserFirebase(id);
            setUsers(prev => prev.filter(u => u.id !== id));
        }
    };

    const handleResetUserAccount = async (id: string) => {
        if (window.confirm(`ACCOUNT RESET: Clear all extraction progress for user ${id}?`)) {
            await resetUserInFirebase(parseInt(id));
            alert("Account progress has been reset.");
            loadUsers();
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
        const msg = newStatus
            ? `ENABLE SECURITY: Mandatory biometric lock for user ${id}?`
            : `DISABLE SECURITY: Allow user ${id} to bypass biometric login (Use for Desktop/Testing)?`;
       
        if (window.confirm(msg)) {
            await toggleUserBiometricSetting(id, newStatus);
            setUsers(prev => prev.map(u => u.id === id ? { ...u, biometricEnabled: newStatus } : u));
        }
    };

    const handleExecuteAirdrop = async (user: any, allocation: number) => {
        if (!user.walletAddress) return alert("User has no wallet connected.");
        if (window.confirm(`EXECUTE AIRDROP: Send ${allocation.toFixed(8)} $ELZR directly to address ${user.walletAddress}?`)) {
            setIsProcessingAirdrop(user.id);
            const success = await markUserAirdropped(user.id, allocation);
            setIsProcessingAirdrop(null);
            if (success) {
                alert("Airdrop Protocol Successful. TON Minter transaction initiated.");
                loadUsers();
            } else {
                alert("System error. Airdrop Node timeout.");
            }
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
        setHForm({ id: '', name: '', coords: { lat: 52.5200, lng: 13.4050 }, radius: 200, density: 1000, category: 'URBAN', baseValue: 100, logoUrl: '', customText: '' });
    };

    const handleSaveGiftBox = () => {
        if (!gbForm.id || !gbForm.name) return alert("Missing ID or Name for Gift Box.");
        if (!gbForm.prizes || gbForm.prizes.length === 0) return alert("Select at least one prize amount.");
       
        const newGB = {
            ...gbForm,
            category: 'GIFTBOX' as HotspotCategory,
            baseValue: 0
        } as HotspotDefinition;
        if (isEditingGB) {
            onSaveHotspots(customHotspots.map(h => h.id === isEditingGB ? newGB : h));
        } else {
            if (customHotspots.some(h => h.id === newGB.id)) return alert("ID already exists.");
            onSaveHotspots([...customHotspots, newGB]);
        }
       
        setIsEditingGB(null);
        setGbForm({ id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, category: 'GIFTBOX', prizes: [0.05, 0.5] });
        alert(isEditingGB ? "Gift Box Updated!" : "Gift Box Launched!");
    };

    const togglePrize = (val: number) => {
        const current = gbForm.prizes || [];
        if (current.includes(val)) setGbForm({...gbForm, prizes: current.filter(v => v !== val)});
        else setGbForm({...gbForm, prizes: [...current, val]});
    };

    const handleDeleteHotspot = (id: string) => {
        if (window.confirm(`Sunteți sigur că doriți să ȘTERGEȚI DEFINITIV hotspot-ul "${id}"?`)) {
            onDeleteHotspot(id);
        }
    };

    const handleEditHotspot = (h: HotspotDefinition) => {
        setHForm(h);
        setIsEditingHotspot(h.id);
        setActiveTab('hotspots');
    };

    const handleEditGiftBox = (h: HotspotDefinition) => {
        setGbForm(h);
        setIsEditingGB(h.id);
        setActiveTab('giftboxes');
    };

    const filteredUsers = useMemo(() => {
        return users.filter(u =>
            (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (u.id || '').toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [users, searchQuery]);

    const qualifiedHunters = useMemo(() => {
        return users.filter(u => {
            if (u.isAirdropped) return false;
            const hasGameplay = (u.gameplayBalance > 0);
            const hasRare = (u.rareBalance > 0);
            const hasEvent = (u.eventBalance > 0);
            const hasMerchant = (u.merchantBalance > 0);
            const hasDailySupply = (u.adsWatched >= 365);
            const hasReferrals = (u.referrals >= 10);
            const hasWallet = !!u.walletAddress;
            return hasGameplay && hasRare && hasEvent && hasMerchant && hasDailySupply && hasReferrals && hasWallet;
        });
    }, [users]);

    const activeGiftBoxes = useMemo(() => {
        return customHotspots.filter(h => h.category === 'GIFTBOX');
    }, [customHotspots]);

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
            {allCampaigns.length === 0 ? (
                <div className="text-center py-20 text-slate-600">No campaigns found.</div>
            ) : (
                allCampaigns.map(campaign => (
                    <div key={campaign.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg mb-4">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                {campaign.data.logoUrl && (
                                    <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-700">
                                        <img src={campaign.data.logoUrl} className="w-full h-full object-cover" />
                                    </div>
                                )}
                                <div>
                                    <h4 className="text-white font-bold text-sm leading-tight">{campaign.data.brandName}</h4>
                                    <span className="text-[9px] text-slate-500 font-mono">{campaign.id}</span>
                                </div>
                            </div>
                            <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border
                                ${campaign.data.status === AdStatus.PENDING_REVIEW ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                  campaign.data.status === AdStatus.ACTIVE ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                  'bg-red-500/10 text-red-400 border-red-500/20'}
                            `}>
                                {campaign.data.status.replace('_', ' ')}
                            </div>
                        </div>
                        <div className="p-4">
                            <div className="h-36 bg-black rounded-xl mb-4 overflow-hidden relative border border-slate-800">
                                {previewVideo === campaign.id ? (
                                    <UniversalVideoPlayer url={campaign.data.videoUrl} autoPlay className="w-full h-full object-contain" />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full gap-2">
                                        <button onClick={() => setPreviewVideo(campaign.id)} className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all">
                                            <Play size={20} fill="currentColor" />
                                        </button>
                                        <span className="text-[10px] text-slate-500 font-bold uppercase">Preview Campaign Video</span>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                                    <span className="text-[9px] text-slate-600 font-black uppercase block mb-1">Configuration</span>
                                    <p className="text-[10px] text-white font-bold">{campaign.count} Coins • {campaign.multiplier}x Boost</p>
                                </div>
                                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                                    <span className="text-[9px] text-slate-600 font-black uppercase block mb-1">Total Fee</span>
                                    <p className="text-[10px] text-amber-500 font-bold">{campaign.totalPrice} TON</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {campaign.data.status === AdStatus.PENDING_REVIEW && (
                                    <>
                                        <button onClick={() => onApprove(campaign.id)} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2">
                                            <Check size={14} /> APPROVE
                                        </button>
                                        <button onClick={() => onReject(campaign.id)} className="flex-1 bg-red-600/20 border border-red-600/30 text-red-500 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2">
                                            <X size={14} /> REJECT
                                        </button>
                                    </>
                                )}
                                <button onClick={() => { if(window.confirm('Stergi campania definitiv?')) onDeleteCampaign(campaign.id); }} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl hover:text-red-500 transition-colors">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );

    const renderHotspotsTab = () => (
        <div className="space-y-6 pb-32">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Plus className="text-cyan-400" size={20} />
                    {isEditingHotspot ? 'EDIT HOTSPOT' : 'ADD NEW COIN SPOT'}
                </h2>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">ID (Unique Key) *</label>
                            <input disabled={!!isEditingHotspot} type="text" value={hForm.id} onChange={e => setHForm({...hForm, id: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500" placeholder="e.g. ny-park" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Display Name *</label>
                            <input type="text" value={hForm.name} onChange={e => setHForm({...hForm, name: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500" placeholder="Central Park" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Category</label>
                            <select value={hForm.category} onChange={e => setHForm({...hForm, category: e.target.value as HotspotCategory})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none">
                                <option value="URBAN">URBAN</option>
                                <option value="LANDMARK">LANDMARK</option>
                                <option value="MALL">MALL</option>
                                <option value="EVENT">EVENT</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Base Value (ELZR)</label>
                            <input type="number" value={hForm.baseValue} onChange={e => setHForm({...hForm, baseValue: parseInt(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                             <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block">Upload Coin Logo</label>
                             <div className="flex items-center gap-3">
                                 <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 rounded-xl bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center text-slate-400 hover:text-white hover:border-cyan-500 transition-all overflow-hidden">
                                    {hForm.logoUrl ? <img src={hForm.logoUrl} className="w-full h-full object-cover" /> : <Upload size={20} />}
                                 </button>
                                 <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                                 <div className="flex flex-col">
                                     <span className="text-[10px] text-white font-bold">{hForm.logoUrl ? "Loaded" : "No Logo"}</span>
                                     <span className="text-[9px] text-slate-500 uppercase">Auto-Resize</span>
                                 </div>
                             </div>
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Coin Text (Max 5)</label>
                            <input type="text" maxLength={5} value={hForm.customText} onChange={e => setHForm({...hForm, customText: e.target.value.toUpperCase()})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none font-mono" placeholder="ELZR" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block flex items-center gap-1"><MapPin size={10}/> PIN ON MAP</label>
                        <div className="h-48 w-full rounded-xl overflow-hidden border border-slate-700">
                            <MapContainer center={[hForm.coords?.lat || 52.5200, hForm.coords?.lng || 13.4050]} zoom={15} className="h-full w-full">
                                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                                <LocationPicker coords={hForm.coords as Coordinate} onPick={c => setHForm({...hForm, coords: c})} />
                            </MapContainer>
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        {isEditingHotspot && <button onClick={() => { setIsEditingHotspot(null); setHForm({ id: '', name: '', coords: { lat: 52.5200, lng: 13.4050 }, radius: 200, density: 1000, category: 'URBAN', baseValue: 100, logoUrl: '', customText: '' }); }} className="flex-1 bg-slate-800 text-white font-bold py-3 rounded-xl border border-slate-700">CANCEL</button>}
                        <button onClick={handleSaveHotspot} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl shadow-lg">
                            {isEditingHotspot ? 'UPDATE' : 'CREATE'}
                        </button>
                    </div>
                </div>
            </div>
            <div className="space-y-3">
                <h3 className="text-white font-bold flex items-center gap-2 px-1">
                    <MapIcon size={18} className="text-slate-400" /> ACTIVE HOTSPOTS ({customHotspots.filter(h => h.category !== 'GIFTBOX').length})
                </h3>
                {customHotspots.filter(h => h.category !== 'GIFTBOX').map(h => (
                    <div key={h.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-between items-center group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700 overflow-hidden">
                                {h.logoUrl ? <img src={h.logoUrl} className="w-full h-full object-cover" /> : <span className="text-xl">🏙️</span>}
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm">{h.name}</h4>
                                <div className="text-[10px] text-slate-500 font-mono">{h.id} • <span className="text-cyan-400">{h.baseValue} ELZR</span></div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleEditHotspot(h)} className="p-2 bg-slate-800 text-slate-300 rounded-lg"><Edit2 size={16}/></button>
                            <button onClick={() => handleDeleteHotspot(h.id)} className="p-2 bg-red-900/30 text-red-400 rounded-lg"><Trash2 size={16}/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderGiftBoxesTab = () => (
        <div className="space-y-6 pb-32">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <h2 className="text-lg font-bold text-amber-400 mb-4 flex items-center gap-2">
                    <Plus className="text-amber-400" size={20} />
                    {isEditingGB ? 'EDIT GIFT BOX' : 'LAUNCH GIFT BOX'}
                </h2>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <input disabled={!!isEditingGB} type="text" value={gbForm.id} onChange={e => setGbForm({...gbForm, id: e.target.value})} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="Box ID" />
                        <input type="text" value={gbForm.name} onChange={e => setGbForm({...gbForm, name: e.target.value})} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="Box Name" />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block tracking-widest">Prize Pool (TON)</label>
                        <div className="flex flex-wrap gap-2">
                            {prizeOptions.map(opt => (
                                <button key={opt} onClick={() => togglePrize(opt)} className={`px-3 py-2 rounded-lg text-xs font-black border transition-all ${gbForm.prizes?.includes(opt) ? "bg-amber-500 border-amber-400 text-black" : "bg-slate-800 border-slate-700 text-slate-400"}`}>
                                    {opt} TON
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase mb-2 block flex items-center gap-1"><MapPin size={10}/> PIN ON MAP</label>
                        <div className="h-48 w-full rounded-xl overflow-hidden border border-slate-700">
                            <MapContainer center={[gbForm.coords?.lat || 44.4268, gbForm.coords?.lng || 26.1025]} zoom={14} className="h-full w-full">
                                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                                <LocationPicker coords={gbForm.coords as Coordinate} onPick={c => setGbForm({...gbForm, coords: c})} />
                            </MapContainer>
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        {isEditingGB && <button onClick={() => { setIsEditingGB(null); setGbForm({ id: '', name: '', coords: { lat: 44.4268, lng: 26.1025 }, radius: 200, category: 'GIFTBOX', prizes: [0.05, 0.5] }); }} className="flex-1 bg-slate-800 text-white font-bold py-3 rounded-xl border border-slate-700">CANCEL</button>}
                        <button onClick={handleSaveGiftBox} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-black py-3 rounded-xl shadow-lg shadow-amber-900/20 uppercase text-xs tracking-widest">
                            {isEditingGB ? 'Update Box' : 'Launch Gift Box'}
                        </button>
                    </div>
                </div>
            </div>
            <div className="space-y-3">
                <h3 className="text-white font-bold flex items-center gap-2 px-1">
                    <Gift size={18} className="text-amber-400" /> ACTIVE GIFT BOXES ({activeGiftBoxes.length})
                </h3>
                {activeGiftBoxes.map(h => (
                    <div key={h.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-between items-center group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 overflow-hidden">
                                <Gift className="text-amber-500" size={20} />
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm">{h.name}</h4>
                                <div className="text-[10px] text-slate-500 font-mono">{h.id} • <span className="text-amber-400">{h.prizes?.length || 0} Prize Options</span></div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleEditGiftBox(h)} className="p-2 bg-slate-800 text-slate-300 rounded-lg"><Edit2 size={16}/></button>
                            <button onClick={() => handleDeleteHotspot(h.id)} className="p-2 bg-red-900/30 text-red-400 rounded-lg"><Trash2 size={16}/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderAirdropTab = () => (
        <div className="space-y-6 pb-32">
            <div className="flex flex-col gap-2 px-1">
                <h3 className="text-white font-black flex items-center gap-2 uppercase tracking-tighter text-lg">
                    <Send size={22} className="text-cyan-400" /> Airdrop Execution Node
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Qualified Hunters ({qualifiedHunters.length})</p>
            </div>

            {qualifiedHunters.length === 0 ? (
                <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-[2.5rem] py-20 flex flex-col items-center text-center px-10">
                    <UserCheck size={48} className="text-slate-700 mb-4" />
                    <h4 className="text-white font-bold uppercase mb-2">No qualified hunters</h4>
                    <p className="text-[10px] text-slate-500 uppercase font-black leading-relaxed">System monitoring active. Hunters must meet ALL criteria (Gameplay, Rare, Event, Merchant, 365+ Ads, 10+ Frens) to qualify.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {qualifiedHunters.map(u => {
                        const refMultiplier = Math.min(2.5, 1 + (Math.log10((u.referrals || 0) + 1) / 4));
                        const totalWeightedScore = Math.floor((u.balance || 0) * refMultiplier);
                        const allocation = totalWeightedScore / 1000000000000;

                        return (
                            <div key={u.id} className="bg-slate-900 border-2 border-slate-800 rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden group">
                                <div className="absolute -right-12 -top-12 bg-cyan-500/5 w-40 h-40 rounded-full blur-3xl"></div>
                                <div className="flex justify-between items-start mb-6 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-[1.2rem] bg-slate-800 border-2 border-slate-700 flex items-center justify-center overflow-hidden shadow-xl">
                                            {u.photoUrl ? <img src={u.photoUrl} className="w-full h-full object-cover" /> : <Users className="text-cyan-400" size={24} />}
                                        </div>
                                        <div>
                                            <h4 className="text-white font-black text-sm uppercase tracking-tighter leading-none mb-1">{u.username || 'Anon Hunter'}</h4>
                                            <div className="flex items-center gap-1.5">
                                                <Wallet size={10} className="text-slate-500" />
                                                <span className="text-[9px] text-slate-500 font-mono font-bold">{u.walletAddress?.slice(0, 6)}...{u.walletAddress?.slice(-4)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest block mb-1">Allocation</span>
                                        <div className="text-xl font-black text-cyan-400 font-mono">{allocation.toFixed(8)}</div>
                                        <span className="text-[8px] text-slate-600 font-black uppercase">ELZR</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleExecuteAirdrop(u, allocation)}
                                    disabled={isProcessingAirdrop === u.id}
                                    className="w-full py-4 bg-white text-black font-black rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl disabled:opacity-50 uppercase tracking-widest text-[10px]"
                                >
                                    {isProcessingAirdrop === u.id ? <Loader2 className="animate-spin" size={16}/> : <Send size={16} />}
                                    Initiate ELZR Payout
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    const renderPaymentsTab = () => (
        <div className="space-y-6 pb-32">
            <div className="flex flex-col gap-2 px-1">
                <h3 className="text-white font-black flex items-center gap-2 uppercase tracking-tighter text-lg">
                    <Wallet size={22} className="text-blue-400" /> TON Payout Control
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Pending Withdrawals ({withdrawals.filter(w => w.status === 'pending').length})</p>
            </div>

            {withdrawals.length === 0 ? (
                <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-[2.5rem] py-20 flex flex-col items-center text-center px-10">
                    <Clock size={48} className="text-slate-700 mb-4" />
                    <h4 className="text-white font-bold uppercase mb-2">Queue is clear</h4>
                    <p className="text-[10px] text-slate-500 uppercase font-black leading-relaxed">No active TON withdrawal requests found in the sector.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {withdrawals.map(req => {
                        const user = users.find(u => u.id === String(req.userId));
                        const isPending = req.status === 'pending';
                        
                        return (
                            <div key={req.id} className={`bg-slate-900 border-2 rounded-[2.5rem] p-6 flex flex-col transition-all shadow-2xl relative overflow-hidden ${isPending ? 'border-blue-500/30' : 'border-slate-800'}`}>
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center overflow-hidden">
                                            {user?.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <Users className="text-slate-500" size={24} />}
                                        </div>
                                        <div>
                                            <h4 className="text-white font-black text-sm uppercase tracking-tighter leading-none mb-1">{user?.username || `ID: ${req.userId}`}</h4>
                                            <div className="flex items-center gap-1.5">
                                                <Calendar size={10} className="text-slate-500" />
                                                <span className="text-[9px] text-slate-500 font-bold">{formatDate(req.timestamp)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-black text-blue-400 font-mono">{Number(req.amount).toFixed(2)}</div>
                                        <span className="text-[8px] text-slate-600 font-black uppercase">TON</span>
                                    </div>
                                </div>

                                <div className="bg-black/30 p-3 rounded-2xl border border-white/5 mb-6">
                                    <div className="flex items-center gap-2 mb-1">
                                        <CreditCard size={12} className="text-slate-500" />
                                        <span className="text-[8px] text-slate-500 font-black uppercase">Destination Wallet</span>
                                    </div>
                                    <span className="text-[10px] text-white font-mono break-all leading-relaxed">{user?.walletAddress || 'NOT CONNECTED'}</span>
                                </div>

                                {isPending ? (
                                    <button 
                                        onClick={() => handleProcessPayment(req)}
                                        disabled={isExecutingPayment === req.id || !user?.walletAddress}
                                        className="w-full py-4 bg-white text-blue-900 font-black rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl disabled:opacity-50 uppercase tracking-widest text-[10px]"
                                    >
                                        {isExecutingPayment === req.id ? <Loader2 className="animate-spin" size={16}/> : <ArrowUpRight size={16} />}
                                        Execute Transfer via Tonkeeper
                                    </button>
                                ) : (
                                    <div className="w-full py-4 bg-slate-800/50 text-slate-400 font-black rounded-2xl flex items-center justify-center gap-3 border border-slate-700 uppercase tracking-widest text-[10px]">
                                        <CheckCircle2 size={16} className="text-green-500" />
                                        Payment Completed
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

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
                    <button onClick={() => setActiveTab('airdrop')} className={`pb-3 text-sm font-bold border-b-2 whitespace-nowrap ${activeTab === 'airdrop' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-500'}`}>Airdrop</button>
                    <button onClick={() => setActiveTab('payments')} className={`pb-3 text-sm font-bold border-b-2 whitespace-nowrap ${activeTab === 'payments' ? 'border-blue-400 text-blue-400' : 'border-transparent text-slate-500'}`}>Payments</button>
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
                {activeTab === 'users' && (
                    <div className="space-y-4">
                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-3.5 text-slate-500" size={20} />
                            <input
                                type="text"
                                placeholder="Search by Username or Telegram ID..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:border-cyan-500 transition-all"
                            />
                        </div>
                       
                        {isLoadingUsers ? (
                            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-cyan-400" size={40} /></div>
                        ) : (
                            <div className="space-y-8">
                                {filteredUsers.map(user => {
                                    const lastSeen = user.lastActive || user.joinedAt || Date.now();
                                    const daysInactive = Math.floor((Date.now() - lastSeen) / (1000 * 60 * 60 * 24));
                                    const isInactive = daysInactive >= 30;
                                    const isBiometricActive = user.biometricEnabled !== false;
                                   
                                    return (
                                        <div key={user.id} className={`bg-slate-900 border-2 rounded-[2.5rem] p-6 flex flex-col transition-all shadow-2xl relative overflow-hidden ${user.isBanned ? 'border-red-600/40 bg-red-950/10' : 'border-slate-800'}`}>
                                           
                                            <div className="flex justify-between items-start mb-6 relative z-10">
                                                <div className="flex items-center gap-4">
                                                    <div className="relative">
                                                        <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center border-2 transition-all shadow-xl overflow-hidden ${user.isBanned ? 'bg-red-500/20 border-red-500/40' : 'bg-slate-800 border-slate-700'}`}>
                                                            {user.photoUrl ? (
                                                                <img src={user.photoUrl} alt="P" className="w-full h-full object-cover" />
                                                            ) : (
                                                                user.isBanned ? <UserX className="text-red-500" size={32} /> : <Users className="text-cyan-400" size={32} />
                                                            )}
                                                        </div>
                                                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-slate-950 shadow-lg ${user.isBanned ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></div>
                                                    </div>
                                                   
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-black text-white text-base uppercase tracking-tighter leading-none">{user.username || 'Anonymous Hunter'}</h3>
                                                            <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-lg border border-white/5 shadow-inner">
                                                                <Globe size={11} className="text-cyan-400" />
                                                                <span className="text-[10px] text-white font-black">{user.countryCode ? user.countryCode.toUpperCase() : '??'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-[10px] text-slate-500 font-mono font-bold">ID: {user.id}</p>
                                                            <div className="w-1.5 h-1.5 bg-slate-700 rounded-full"></div>
                                                            <p className={`text-[9px] font-black uppercase tracking-widest ${user.isBanned ? 'text-red-500' : 'text-green-500'}`}>
                                                                {user.isBanned ? 'PROTOCOL: LOCKED' : 'PROTOCOL: ACTIVE'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleToggleBan(user.id, !!user.isBanned)}
                                                        className={`p-3 rounded-2xl transition-all border-2 active:scale-90 ${user.isBanned ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}
                                                        title={user.isBanned ? "Unlock User" : "Ban User"}
                                                    >
                                                        {user.isBanned ? <Unlock size={22} /> : <Lock size={22} />}
                                                    </button>
                                                   
                                                    <button
                                                        onClick={() => handleDeleteUser(user.id)}
                                                        className="p-3 bg-red-600/10 text-red-500 rounded-2xl border-2 border-red-600/30 active:scale-90 hover:bg-red-600/20 shadow-lg"
                                                        title="Delete Account Permanently"
                                                    >
                                                        <Trash2 size={22} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 xs:grid-cols-4 gap-3 relative z-10">
                                                <div className="bg-black/30 p-4 rounded-[1.8rem] border border-white/5 shadow-inner">
                                                    <div className="flex items-center gap-1.5 mb-2 text-slate-500">
                                                        <Calendar size={12} />
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-center block w-full">Joined</span>
                                                    </div>
                                                    <span className="text-[10px] text-white font-bold block text-center">{formatDate(user.joinedAt)}</span>
                                                </div>
                                                <div className="bg-black/30 p-4 rounded-[1.8rem] border border-white/5 shadow-inner">
                                                    <div className="flex items-center gap-1.5 mb-2 text-slate-500">
                                                        <Activity size={12} />
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-center block w-full">Last Seen</span>
                                                    </div>
                                                    <span className="text-[10px] text-white font-bold block text-center">{formatDate(user.lastActive)}</span>
                                                </div>
                                                <div className="bg-cyan-500/5 p-4 rounded-[1.8rem] border border-cyan-500/20 shadow-inner">
                                                    <div className="flex items-center justify-center gap-1.5 mb-2 text-cyan-500/60">
                                                        <Wallet size={12} />
                                                        <span className="text-[9px] font-black uppercase tracking-widest">Balance</span>
                                                    </div>
                                                    <div className="flex items-baseline justify-center gap-1">
                                                        <span className="text-base text-cyan-400 font-black font-mono">{(user.balance || 0).toLocaleString()}</span>
                                                        <span className="text-[7px] text-cyan-700 font-black uppercase">ELZR</span>
                                                    </div>
                                                </div>
                                                <div className={`p-4 rounded-[1.8rem] border shadow-inner ${user.isBanned ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                                                    <div className="flex items-center justify-center gap-1.5 mb-2 text-slate-500">
                                                        <History size={12} />
                                                        <span className="text-[9px] font-black uppercase tracking-widest">Ban History</span>
                                                    </div>
                                                    <span className={`text-[10px] font-black block text-center ${user.isBanned ? 'text-red-400' : 'text-slate-400'}`}>
                                                        {user.banCount || (user.isBanned ? 1 : 0)} TIMES
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="mt-6 pt-5 border-t border-slate-800/50 space-y-4 relative z-10">
                                                <div className="flex justify-between items-center">
                                                    <div className={`flex items-center gap-2.5 px-5 py-2.5 rounded-2xl border transition-all ${isInactive ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse' : 'bg-slate-800/20 border-slate-800/40 text-slate-600'}`}>
                                                        <AlertCircle size={18} />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">
                                                            {daysInactive} {daysInactive === 1 ? 'DAY' : 'DAYS'} INACTIVE
                                                        </span>
                                                    </div>
                                                    <button
                                                        disabled={!isInactive}
                                                        onClick={() => handleResetUserAccount(user.id)}
                                                        className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl border-2 transition-all active:scale-95 ${isInactive ? 'bg-cyan-600/10 border-cyan-500/40 text-cyan-400 hover:bg-cyan-600/20' : 'opacity-20 grayscale cursor-not-allowed border-slate-800 text-slate-500'}`}
                                                    >
                                                        <RotateCcw size={18} className={isInactive ? "animate-spin-slow" : ""} />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">RESET ACCOUNT</span>
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => handleToggleBiometric(user.id, isBiometricActive)}
                                                    className={`w-full py-4 rounded-2xl border-2 flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg ${isBiometricActive ? 'bg-slate-800/80 border-slate-700 text-cyan-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-500'}`}
                                                >
                                                    <Fingerprint size={22} className={isBiometricActive ? "text-cyan-500" : "text-amber-500 animate-pulse"} />
                                                    <div className="text-left">
                                                        <p className="text-[11px] font-black uppercase tracking-widest">
                                                            {isBiometricActive ? 'Biometric Protocol: ENFORCED' : 'Biometric Protocol: BYPASSED'}
                                                        </p>
                                                        <p className="text-[8px] font-bold opacity-60 uppercase tracking-tighter">
                                                            {isBiometricActive ? 'Mandatory Fingerprint/FaceID check active' : 'Security bypass enabled (Allowing Desktop/Tester Access)'}
                                                        </p>
                                                    </div>
                                                </button>
                                            </div>
                                            {user.isBanned && <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-l from-red-600/5 to-transparent pointer-events-none"></div>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'ads' && renderAdsTab()}
                {activeTab === 'hotspots' && renderHotspotsTab()}
                {activeTab === 'giftboxes' && renderGiftBoxesTab()}
                {activeTab === 'airdrop' && renderAirdropTab()}
                {activeTab === 'payments' && renderPaymentsTab()}
                {activeTab === 'system' && (
                    <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-2xl">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><AlertTriangle className="text-red-500" /> DANGER ZONE</h2>
                        <div className="space-y-4">
                            <button onClick={onToggleTestMode} className={`w-full py-3 rounded-xl font-bold text-xs ${isTestMode ? 'bg-green-500 text-black' : 'bg-slate-800 text-slate-500'}`}>TEST MODE: {isTestMode ? 'ON' : 'OFF'}</button>
                            <button onClick={onResetMyAccount} className="w-full py-3 bg-red-600 rounded-xl font-bold text-xs">RESET MY ACCOUNT</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
