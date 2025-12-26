
import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Coordinate, SpawnPoint, HotspotCategory, HotspotDefinition } from '../types';
import { generateProceduralSpawns } from '../utils';

// Added interface for MapView props
interface MapViewProps {
    location: Coordinate;
    spawns: SpawnPoint[];
    collectedIds: string[];
    hotspots: HotspotDefinition[];
}

const createStyledIcon = (category: HotspotCategory | undefined, densityValue: number, logoUrl?: string) => {
    let ringColor = "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)]";
    let bgColor = "bg-amber-500/20";
    let iconContent = "💰";
    let badgeText = "1";

    if (category === 'EVENT') {
        ringColor = "border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.8)]";
        bgColor = "bg-green-500/20";
        iconContent = "🎄";
    } else if (category === 'LANDMARK') {
        ringColor = "border-purple-600 shadow-[0_0_20px_rgba(147,51,234,0.8)]";
        bgColor = "bg-purple-600/20";
        iconContent = "⭐";
    } else if (category === 'MALL') {
        ringColor = "border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.6)]";
        bgColor = "bg-orange-500/20";
        iconContent = "🛍️";
        badgeText = densityValue >= 1000 ? `${(densityValue / 1000).toFixed(0)}k` : `${densityValue}`;
    } else if (category === 'URBAN') {
        ringColor = "border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.6)]";
        bgColor = "bg-cyan-500/20";
        iconContent = "🏙️";
        badgeText = densityValue >= 1000 ? `${(densityValue / 1000).toFixed(0)}k` : `${densityValue}`;
    } else if (category === 'MERCHANT') {
        ringColor = "border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.7)]";
        bgColor = "bg-red-600/20";
        iconContent = "📣";
        badgeText = "AD";
    }

    const innerHtml = logoUrl 
        ? `<img src="${logoUrl}" class="w-8 h-8 object-contain rounded-full" onerror="this.style.display='none'" />` 
        : `<span class="text-2xl">${iconContent}</span>`;

    return L.divIcon({
        className: 'custom-map-marker',
        html: `
            <div class="relative flex items-center justify-center">
                <div class="absolute -top-3 -right-3 bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-md border border-white shadow-lg z-50">
                    ${badgeText}
                </div>
                <div class="w-12 h-12 rounded-full border-4 ${ringColor} ${bgColor} flex items-center justify-center backdrop-blur-sm overflow-hidden">
                    ${innerHtml}
                </div>
            </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24]
    });
};

const createIndividualCoinIcon = (value: number) => L.divIcon({
    className: 'normal-coin-marker',
    html: `
        <div class="w-6 h-6 bg-amber-500 border-2 border-white rounded-full flex items-center justify-center shadow-lg">
            <span class="text-[10px] font-bold text-amber-950">$</span>
        </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

const MapEventsHandler = ({ onBoundsChange }: { onBoundsChange: (bounds: any, zoom: number) => void }) => {
    const map = useMapEvents({
        moveend: () => onBoundsChange(map.getBounds(), map.getZoom()),
        zoomend: () => onBoundsChange(map.getBounds(), map.getZoom())
    });
    return null;
};

export const MapView: React.FC<MapViewProps> = ({ location, spawns, collectedIds, hotspots }) => {
    const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
    const [zoom, setZoom] = useState(15);

    const handleBoundsChange = (b: L.LatLngBounds, z: number) => {
        setBounds(b);
        setZoom(z);
    };

    const visibleSpawns = useMemo(() => {
        if (!bounds) return [];
        const mapBounds = { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() };
        const procedural = generateProceduralSpawns(mapBounds, zoom, hotspots);
        return procedural.filter(s => !collectedIds.includes(s.id));
    }, [bounds, zoom, collectedIds, hotspots]);

    return (
        <div className="h-full w-full relative">
            <MapContainer center={[location.lat, location.lng]} zoom={18} className="h-full w-full bg-slate-950" zoomControl={false}>
                <MapEventsHandler onBoundsChange={handleBoundsChange} />
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                
                <Marker position={[location.lat, location.lng]} icon={L.divIcon({ className: 'u', html: `<div class="w-5 h-5 bg-cyan-400 rounded-full border-2 border-white shadow-[0_0_15px_rgba(34,211,238,0.8)]"></div>`, iconSize: [20,20] })} />

                {visibleSpawns.map(s => {
                    const isMainHotspot = s.id.includes('main');
                    const isSpecial = s.category === 'EVENT' || s.category === 'LANDMARK' || s.category === 'MERCHANT';
                    
                    return (
                        <Marker 
                            key={s.id} 
                            position={[s.coords.lat, s.coords.lng]} 
                            icon={isMainHotspot || isSpecial ? createStyledIcon(s.category, s.density || 0, s.logoUrl) : createIndividualCoinIcon(s.value)}
                            zIndexOffset={isSpecial ? 1000 : 0}
                        >
                            <Popup>
                                <div className="p-2 text-center">
                                    <h3 className="font-black text-slate-800 uppercase text-xs">{s.name}</h3>
                                    <p className="text-[10px] text-slate-500 mb-1">{s.description || 'Rare Area'}</p>
                                    <div className="bg-amber-100 px-2 py-1 rounded border border-amber-200">
                                        <span className="text-lg font-black text-amber-600">VALUE: {s.value}</span>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
};
