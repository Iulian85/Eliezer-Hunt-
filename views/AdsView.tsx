
import React, { useState, useMemo, useEffect } from 'react';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import L from 'leaflet';
import { Megaphone, MapPin, Video, Loader2, Clock, AlertCircle, Wallet, Image as ImageIcon, Calendar, Info, CheckCircle2, Search, Navigation, Building, ArrowRight, FlaskConical, Globe, Mail, Phone, Settings, BarChart3, TrendingUp, CreditCard, ChevronRight } from 'lucide-react';
import { Coordinate, AdStatus, Campaign, ContactInfo } from '../types';
import { ADMIN_WALLET_ADDRESS } from '../constants';

interface AdsViewProps {
    userLocation: Coordinate | null;
    collectedIds: string[];
    myCampaigns: Campaign[];
    onSubmitApplication: (coords: Coordinate, count: number, multiplier: number, price: number, sponsorData: any) => void;
    onPayCampaign: (campaignId: string) => void;
    isTestMode?: boolean; 
}

const simplePinIcon = L.divIcon({
    className: 'custom-pin-icon',
    html: `<div class="w-8 h-8 bg-red-600 rounded-full border-2 border-white flex items-center justify-center shadow-lg"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
});

export const AdsView: React.FC<AdsViewProps> = ({ userLocation, collectedIds, myCampaigns, onSubmitApplication, onPayCampaign, isTestMode = false }) => {
    const [tonConnectUI] = useTonConnectUI();
    const userAddress = useTonAddress();

    const [brandName, setBrandName] = useState('');
    const [website, setWebsite] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    
    const [street, setStreet] = useState('');
    const [city, setCity] = useState('');
    const [zip, setZip] = useState('');
    const [country, setCountry] = useState('');

    const [logoUrl, setLogoUrl] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    
    const [resolvedLocation, setResolvedLocation] = useState<Coordinate | null>(null);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [geoError, setGeoError] = useState<string | null>(null);

    const [coinCount, setCoinCount] = useState(50);
    const [multiplier, setMultiplier] = useState(5);
    const [duration, setDuration] = useState(1); 
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPaying, setIsPaying] = useState<string | null>(null); 
    const [activeSection, setActiveSection] = useState<'create' | 'manage'>('create');

    const pricing = useMemo(() => {
        const BASE_RATE = 0.05;
        let multiplierFactor = 5;
        if (multiplier === 10) multiplierFactor = 12; 
        if (multiplier === 20) multiplierFactor = 30; 
        if (multiplier === 50) multiplierFactor = 80; 

        let durationFactor = 1;
        if (duration === 7) durationFactor = 6;   
        if (duration === 30) durationFactor = 22; 

        const total = (coinCount * multiplierFactor * durationFactor * BASE_RATE);
        
        return {
            total: parseFloat(total.toFixed(2)),
            multiplierFactor,
            durationFactor
        };
    }, [coinCount, multiplier, duration]);

    const handleVerifyLocation = async () => {
        if (!street || !city || !country) {
            setGeoError("Please complete Street, City, and Country.");
            return;
        }
        const query = `${street}, ${city}, ${zip}, ${country}`;
        setIsGeocoding(true);
        setGeoError(null);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            const data = await response.json();
            if (data && data.length > 0) {
                const bestMatch = data[0];
                const newCoords = { lat: parseFloat(bestMatch.lat), lng: parseFloat(bestMatch.lon) };
                setResolvedLocation(newCoords);
            } else {
                setGeoError("The address was not found. Please check the details.");
            }
        } catch (e) {
            setGeoError("Map service error.");
        } finally {
            setIsGeocoding(false);
        }
    };

    const handleUseMyLocation = () => {
        if (!navigator.geolocation) {
            setGeoError("GPS unavailable.");
            return;
        }
        setIsLocating(true);
        setGeoError(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const myCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setResolvedLocation(myCoords);
                setIsLocating(false);
                if (window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                }
            },
            (err) => {
                setIsLocating(false);
                setGeoError("GPS permission denied.");
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    const handleSubmitApp = async () => {
        if (!userAddress) { alert("Please connect your TON wallet."); return; }
        if (!brandName || !videoUrl || !logoUrl) { alert("Please fill in the required fields."); return; }
        if (!resolvedLocation) { alert("Check the location on the map."); return; }
        
        setIsSubmitting(true);
        const contactData: ContactInfo = { street, city, zip, country, phone, email, website };
        try {
            onSubmitApplication(resolvedLocation, coinCount, multiplier, pricing.total, { 
                brandName, 
                logoUrl, 
                videoUrl, 
                multiplier, 
                durationDays: duration, 
                contact: contactData, 
                status: AdStatus.PENDING_REVIEW 
            });
            // Reset form
            setBrandName(''); setWebsite(''); setEmail(''); setPhone(''); setStreet(''); setCity(''); setZip(''); setCountry(''); setLogoUrl(''); setVideoUrl(''); setResolvedLocation(null);
            setActiveSection('manage');
        } catch (e) {
            alert("Error sending request.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePayment = async (campaign: Campaign) => {
        setIsPaying(campaign.id);
        try {
            if (isTestMode) {
                await new Promise(resolve => setTimeout(resolve, 1500)); 
                onPayCampaign(campaign.id);
                setIsPaying(null);
                return;
            }
            const transaction = { 
                validUntil: Math.floor(Date.now() / 1000) + 600, 
                messages: [{ 
                    address: ADMIN_WALLET_ADDRESS, 
                    amount: (campaign.totalPrice * 1000000000).toString() 
                }] 
            };
            await tonConnectUI.sendTransaction(transaction);
            onPayCampaign(campaign.id);
        } catch (e) {
            alert("The payment was canceled or failed.");
        } finally {
            setIsPaying(null);
        }
    };

    const calculateAnalytics = (campaign: Campaign) => {
        const foundCount = collectedIds.filter(id => id.includes(campaign.id)).length;
        const expiryTime = campaign.timestamp + (campaign.durationDays * 24 * 60 * 60 * 1000);
        const remainingMs = expiryTime - Date.now();
        const days = Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60 * 24)));
        const hours = Math.max(0, Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
        const isExpired = remainingMs <= 0;
        const progress = Math.min((foundCount / campaign.count) * 100, 100);
        return { foundCount, days, hours, isExpired, progress };
    };

    return (
        <div className="h-full w-full bg-slate-950 flex flex-col relative">
            <div className="flex border-b border-slate-800 bg-slate-900 z-20">
                <button onClick={() => setActiveSection('create')} className={`flex-1 py-4 text-xs font-black uppercase tracking-widest ${activeSection === 'create' ? 'text-white border-b-2 border-cyan-500 bg-cyan-500/5' : 'text-slate-500'}`}>New Campaign</button>
                <button onClick={() => setActiveSection('manage')} className={`flex-1 py-4 text-xs font-black uppercase tracking-widest ${activeSection === 'manage' ? 'text-white border-b-2 border-cyan-500 bg-cyan-500/5' : 'text-slate-500'} flex justify-center items-center gap-2`}>
                    Management
                    {myCampaigns.some(c => c.data.status === AdStatus.PAYMENT_REQUIRED) && <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>}
                </button>
            </div>

            {isTestMode && <div className="bg-amber-600/20 text-amber-400 text-[10px] text-center py-1.5 font-black flex items-center justify-center gap-2 border-b border-amber-600/30 uppercase tracking-widest"><FlaskConical size={10} /> Simulator Mode Active</div>}

            <div className="flex-1 overflow-y-auto p-4 pb-32 bg-slate-950 no-scrollbar">
                {activeSection === 'create' && (
                    <div className="space-y-6">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                            <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-800"><h3 className="text-[10px] font-black text-slate-300 flex items-center gap-2 uppercase tracking-widest"><Building size={14} className="text-cyan-400" /> Business Profile</h3></div>
                            <div className="p-4 space-y-4">
                                <div><label className="text-[9px] text-slate-500 font-black uppercase mb-1 block tracking-widest">Brand Name *</label><input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Your Company" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:border-cyan-500 outline-none" /></div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Website</label><input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="site.com" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm outline-none" /></div>
                                    <div><label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@..." className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm outline-none" /></div>
                                </div>
                                <div className="border-t border-slate-800 my-2"></div>
                                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MapPin size={12} className="text-red-500" /> Dropzone Location</h4>
                                <div className="space-y-3">
                                    <input type="text" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street, Nr." className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:border-red-500 outline-none" />
                                    <div className="grid grid-cols-2 gap-3">
                                        <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm outline-none" />
                                        <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm outline-none" />
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <button onClick={handleVerifyLocation} disabled={isGeocoding} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-red-900/20">
                                        {isGeocoding ? <Loader2 className="animate-spin" size={14}/> : <CheckCircle2 size={14}/>} Check Address
                                    </button>
                                    <button onClick={handleUseMyLocation} disabled={isLocating} className={`p-2.5 rounded-xl border border-slate-700 flex items-center justify-center transition-all active:scale-95 ${isLocating ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-cyan-400 shadow-lg shadow-black/40'}`}>
                                        {isLocating ? <Loader2 className="animate-spin" size={20} /> : <Navigation size={20} />}
                                    </button>
                                </div>
                                {geoError && <div className="mt-2 text-red-400 text-[10px] flex items-center gap-1 bg-red-900/10 p-2 rounded-lg border border-red-900/20"><AlertCircle size={12}/> {geoError}</div>}
                                
                                {resolvedLocation && (
                                    <div className="mt-3 rounded-2xl overflow-hidden border border-slate-700 h-44 w-full relative shadow-inner">
                                        <MapContainer key={`${resolvedLocation.lat}-${resolvedLocation.lng}`} center={[resolvedLocation.lat, resolvedLocation.lng]} zoom={16} scrollWheelZoom={false} dragging={false} zoomControl={false} className="h-full w-full">
                                            <TileLayer attribution='&copy; OSM' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                                            <Marker position={[resolvedLocation.lat, resolvedLocation.lng]} icon={simplePinIcon} />
                                            <Circle center={[resolvedLocation.lat, resolvedLocation.lng]} radius={300} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.1, weight: 1.5, dashArray: '5, 5' }} />
                                        </MapContainer>
                                        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div><span className="text-[9px] font-black text-white uppercase tracking-tighter">Verified Location</span></div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
                            <h3 className="text-[10px] font-black text-slate-300 flex items-center gap-2 uppercase tracking-widest border-b border-slate-800 pb-2 mb-2"><Video size={14} className="text-purple-400" /> Active Media Assets</h3>
                            <div><label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Logo Image URL</label><input type="text" placeholder="https://..." value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-purple-500" /></div>
                            <div><label className="text-[9px] text-slate-500 font-black uppercase mb-1 block">Video Campaign URL</label><input type="text" placeholder="https://..." value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-purple-500" /></div>
                        </div>

                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-6">
                            <h3 className="text-[10px] font-black text-slate-300 flex items-center gap-2 uppercase tracking-widest border-b border-slate-800 pb-2 mb-2"><Settings size={14} className="text-amber-400" /> Campaign Configuration</h3>
                            <div>
                                <div className="flex justify-between mb-2"><label className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">Coin Drop Quantity</label><span className="text-xs text-white font-mono font-black bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded border border-amber-500/20">{coinCount} Drops</span></div>
                                <input type="range" min="10" max="2000" step="10" value={coinCount} onChange={(e) => setCoinCount(parseInt(e.target.value))} className="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer" />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-400 font-black uppercase mb-3 block tracking-tighter">Visibility Multiplier</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {[5, 10, 20, 50].map(val => (
                                        <button key={val} onClick={() => setMultiplier(val)} className={`py-2 rounded-xl text-[10px] font-black border transition-all ${multiplier === val ? "bg-amber-500 border-amber-400 text-black shadow-lg shadow-amber-900/20" : "bg-slate-950 border-slate-800 text-slate-500"}`}>{val}X</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-400 font-black uppercase mb-3 block tracking-tighter flex justify-between">
                                    <span>Campaign Duration</span>
                                    <span className="text-cyan-400">{duration} {duration === 1 ? 'DAY' : 'DAYS'}</span>
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { val: 1, label: '24 HOURS', desc: 'Short Blast' }, 
                                        { val: 7, label: '7 DAYS', desc: 'Active Week' }, 
                                        { val: 30, label: '1 MONTH', desc: 'Pro Presence' }
                                    ].map(opt => (
                                        <button key={opt.val} onClick={() => setDuration(opt.val)} className={`py-3 px-1 rounded-xl border flex flex-col items-center justify-center transition-all ${duration === opt.val ? "bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-900/40" : "bg-slate-950 border-slate-800 text-slate-500"}`}>
                                            <span className="text-xs font-black">{opt.label}</span>
                                            <span className={`text-[7px] uppercase font-bold mt-0.5 ${duration === opt.val ? 'text-cyan-100' : 'text-slate-700'}`}>{opt.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 pb-12">
                            <div className="bg-slate-900 p-6 rounded-[2.5rem] border-2 border-slate-700 shadow-2xl relative overflow-hidden">
                                <div className="absolute -right-12 -top-12 bg-cyan-500/10 w-40 h-40 rounded-full blur-3xl"></div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20"><CreditCard className="text-cyan-400" size={24} /></div>
                                            <div>
                                                <h4 className="text-white font-black text-sm uppercase tracking-tighter">Checkout Summary</h4>
                                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Global Drop Protocol</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-3 mb-6">
                                        <div className="flex justify-between text-xs font-bold"><span className="text-slate-500 uppercase">Tokens Allocation</span><span className="text-white">{coinCount} Coins</span></div>
                                        <div className="flex justify-between text-xs font-bold"><span className="text-slate-500 uppercase">Visibility Multiplier</span><span className="text-white">x{multiplier} Boost</span></div>
                                        <div className="flex justify-between text-xs font-bold"><span className="text-slate-500 uppercase">Ad Duration</span><span className="text-white">{duration} Days</span></div>
                                        <div className="border-t border-slate-800 my-4 pt-4 flex justify-between items-end">
                                            <span className="text-4xl font-black text-white font-[Rajdhani]">{pricing.total} <span className="text-lg text-cyan-500 ml-1.5 uppercase">TON</span></span>
                                        </div>
                                    </div>
                                    <button onClick={handleSubmitApp} disabled={isSubmitting || !resolvedLocation} className="w-full py-4.5 bg-white text-black hover:bg-slate-200 disabled:opacity-50 font-black rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-[0_0_30px_rgba(255,255,255,0.15)] uppercase tracking-widest text-sm">
                                        {isSubmitting ? <Loader2 className="animate-spin" /> : <Megaphone size={20} />} Submit Campaign
                                    </button>
                                    <p className="text-center text-[8px] text-slate-600 mt-4 font-bold uppercase tracking-widest">Approved ads appear globally within 12-24 hours</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'manage' && (
                    <div className="space-y-4">
                        {myCampaigns.length === 0 ? (
                            <div className="text-center text-slate-500 mt-20"><Megaphone className="mx-auto mb-4 opacity-10" size={64} /><p className="text-sm font-black uppercase tracking-widest">No campaigns detected</p></div>
                        ) : (
                            myCampaigns.map(camp => {
                                const stats = calculateAnalytics(camp);
                                return (
                                    <div key={camp.id} className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl transition-all hover:border-slate-700">
                                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-black/50 overflow-hidden border border-slate-700 shadow-inner">
                                                    <img src={camp.data.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                                                </div>
                                                <div>
                                                    <h3 className="font-black text-white text-sm uppercase tracking-tighter leading-none">{camp.data.brandName}</h3>
                                                    <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Ref: {camp.id.slice(-6)}</span>
                                                </div>
                                            </div>
                                            <div className={`text-[9px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-widest
                                                ${camp.data.status === AdStatus.PENDING_REVIEW ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                                                  camp.data.status === AdStatus.PAYMENT_REQUIRED ? 'bg-green-500/10 text-green-400 border-green-500/20 animate-pulse' : 
                                                  camp.data.status === AdStatus.ACTIVE ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 
                                                  'bg-red-500/10 text-red-500 border-red-500/20'}
                                            `}>
                                                {camp.data.status.replace('_', ' ')}
                                            </div>
                                        </div>
                                        <div className="p-5">
                                            {camp.data.status === AdStatus.ACTIVE && (
                                                <div className="mb-4">
                                                    <div className="flex justify-between items-end mb-2">
                                                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5"><TrendingUp size={12} className="text-cyan-400"/> Live Tracking</span>
                                                        <span className="text-[10px] font-mono text-white">{stats.foundCount} / {camp.count}</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                                                        <div className="h-full bg-gradient-to-r from-cyan-600 to-blue-500 transition-all duration-1000" style={{ width: `${stats.progress}%` }}></div>
                                                    </div>
                                                    <div className="flex justify-between mt-3">
                                                        <div className="flex flex-col"><span className="text-[8px] text-slate-600 font-black uppercase">Time Remaining</span><span className="text-[10px] text-white font-bold">{stats.isExpired ? 'EXPIRED' : `${stats.days}d ${stats.hours}h`}</span></div>
                                                        <div className="flex flex-col items-end"><span className="text-[8px] text-slate-600 font-black uppercase">Protocol</span><span className="text-[10px] text-cyan-400 font-black uppercase">Tier x{camp.multiplier}</span></div>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-xs mb-5 p-3 bg-black/40 rounded-2xl border border-white/5 items-center">
                                                <div>
                                                    <span className="text-slate-500 font-black uppercase text-[9px] block mb-0.5 tracking-widest">Campaign Fee</span>
                                                    <span className="text-[10px] text-slate-400 font-bold">{camp.durationDays} Days • Global</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-amber-400 font-black text-lg font-[Rajdhani]">{camp.totalPrice}</span>
                                                    <span className="text-[10px] font-black text-amber-500/80 ml-1">TON</span>
                                                </div>
                                            </div>
                                            {camp.data.status === AdStatus.PAYMENT_REQUIRED && (
                                                <button onClick={() => handlePayment(camp)} disabled={isPaying === camp.id} className="w-full py-3.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black rounded-2xl flex items-center justify-center gap-3 hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all active:scale-[0.98] uppercase tracking-widest text-xs">
                                                    {isPaying === camp.id ? <Loader2 className="animate-spin" /> : <Wallet size={18} />} {isTestMode ? "Simulate Payment (Test)" : `Pay ${camp.totalPrice} TON`}
                                                </button>
                                            )}
                                            {camp.data.status === AdStatus.PENDING_REVIEW && (
                                                <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-2xl flex items-center gap-3">
                                                    <Clock className="text-amber-500" size={20} />
                                                    <p className="text-[9px] text-amber-200/70 font-bold uppercase leading-relaxed tracking-wide">Your request is under review. You will receive a payment node immediately after approval.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
