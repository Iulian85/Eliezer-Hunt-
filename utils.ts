
import { Coordinate, SpawnPoint, HotspotDefinition } from './types';

export function getDistance(p1: Coordinate, p2: Coordinate): number {
    const R = 6371e3;
    const phi1 = (p1.lat * Math.PI) / 180;
    const phi2 = (p2.lat * Math.PI) / 180;
    const deltaPhi = ((p2.lat - p1.lat) * Math.PI) / 180;
    const deltaLambda = ((p2.lng - p1.lng) * Math.PI) / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function generateProceduralSpawns(bounds: { north: number, south: number, east: number, west: number }, zoom: number, hotspots: HotspotDefinition[]): SpawnPoint[] {
    const spawns: SpawnPoint[] = [];
    
    hotspots.forEach(hotspot => {
        const isVisible = hotspot.coords.lat <= bounds.north + 0.1 && 
                          hotspot.coords.lat >= bounds.south - 0.1 && 
                          hotspot.coords.lng <= bounds.east + 0.1 && 
                          hotspot.coords.lng >= bounds.west - 0.1;

        if (isVisible) {
            const isSpecial = hotspot.category === 'EVENT' || hotspot.category === 'LANDMARK';
            const isAd = hotspot.category === 'MERCHANT';

            if (isSpecial) {
                spawns.push({
                    id: hotspot.id,
                    name: hotspot.name,
                    coords: hotspot.coords,
                    collected: false,
                    value: hotspot.baseValue || 5000, 
                    description: hotspot.category === 'EVENT' ? 'XMAS MARKET' : 'GLOBAL LANDMARK',
                    category: hotspot.category,
                    isLandmark: true,
                    logoUrl: hotspot.logoUrl,
                    customText: hotspot.customText
                });
            } else if (isAd) {
                // Pentru campanii Ads, generăm mereu roiul de monede dacă suntem destul de aproape (zoom >= 14)
                if (zoom >= 14) {
                    const swarmCount = 25; // Roi vizual pentru Ads
                    for (let i = 0; i < swarmCount; i++) {
                        const angle = (i / swarmCount) * Math.PI * 2;
                        const r = (Math.random() * hotspot.radius) / 111320; 
                        spawns.push({
                            id: `${hotspot.id}-coin-${i}`,
                            name: hotspot.name,
                            coords: { 
                                lat: hotspot.coords.lat + Math.cos(angle) * r, 
                                lng: hotspot.coords.lng + Math.sin(angle) * r / Math.cos(hotspot.coords.lat * Math.PI / 180)
                            },
                            collected: false,
                            value: hotspot.baseValue || 100,
                            category: hotspot.category,
                            description: 'PROMOTIONAL DROP',
                            logoUrl: hotspot.logoUrl,
                            customText: hotspot.customText,
                            sponsorData: (hotspot as any).sponsorData
                        });
                    }
                } else {
                    // La zoom mic afișăm doar pin-ul central al campaniei
                    spawns.push({
                        id: `${hotspot.id}-main`,
                        name: hotspot.name,
                        coords: hotspot.coords,
                        collected: false,
                        value: hotspot.baseValue || 100,
                        density: hotspot.density,
                        category: hotspot.category,
                        logoUrl: hotspot.logoUrl,
                        customText: hotspot.customText
                    });
                }
            } else {
                // Logica standard pentru Mall-uri și Urban
                if (zoom < 16) {
                    spawns.push({
                        id: `${hotspot.id}-main`,
                        name: hotspot.name,
                        coords: hotspot.coords,
                        collected: false,
                        value: hotspot.baseValue || 100,
                        density: hotspot.density,
                        category: hotspot.category,
                        logoUrl: hotspot.logoUrl,
                        customText: hotspot.customText
                    });
                } else {
                    const swarmCount = 20; 
                    for (let i = 0; i < swarmCount; i++) {
                        const angle = (i / swarmCount) * Math.PI * 2;
                        const r = (Math.random() * hotspot.radius) / 111320; 
                        spawns.push({
                            id: `${hotspot.id}-coin-${i}`,
                            name: hotspot.name,
                            coords: { 
                                lat: hotspot.coords.lat + Math.cos(angle) * r, 
                                lng: hotspot.coords.lng + Math.sin(angle) * r / Math.cos(hotspot.coords.lat * Math.PI / 180)
                            },
                            collected: false,
                            value: hotspot.baseValue || 100,
                            category: hotspot.category,
                            description: hotspot.category === 'MALL' ? 'SHOPPING COIN' : 'CITY COIN',
                            logoUrl: hotspot.logoUrl,
                            customText: hotspot.customText
                        });
                    }
                }
            }
        }
    });

    return spawns;
}

export function generateRandomSpawns(center: Coordinate, count: number = 3): SpawnPoint[] {
    const spawns: SpawnPoint[] = [];
    const MIN_DIST = 0.0002;
    const MAX_DIST = 0.0006; 

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = MIN_DIST + Math.random() * (MAX_DIST - MIN_DIST);
        
        spawns.push({
            id: `local-${Date.now()}-${i}`,
            name: `ELZR Coin`,
            coords: { 
                lat: center.lat + Math.cos(angle) * dist, 
                lng: center.lng + Math.sin(angle) * dist 
            },
            collected: false,
            value: 100, 
            category: 'URBAN',
            description: "Gameplay Drop",
            velocity: { lat: (Math.random()-0.5)*0.00001, lng: (Math.random()-0.5)*0.00001 }
        });
    }
    return spawns;
}
