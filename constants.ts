
import { SpawnPoint, Coordinate, HotspotDefinition } from './types';

// =================CONFIG=================
const getEnv = (key: string) => {
    try {
        // @ts-ignore
        return (import.meta.env && import.meta.env[key]) ? import.meta.env[key] : '';
    } catch {
        return '';
    }
};

export const ADMIN_WALLET_ADDRESS = getEnv('VITE_ADMIN_WALLET_ADDRESS');
export const ADSGRAM_BLOCK_ID = getEnv('VITE_ADSGRAM_BLOCK_ID');

// ========================================
// GLOBAL HOTSPOT REGISTRY
// ========================================

export const GLOBAL_HOTSPOTS: HotspotDefinition[] = [
    // --- NORTH AMERICA ---
    { id: 'nyc-times-sq', name: 'Times Square', coords: { lat: 40.7580, lng: -73.9855 }, radius: 600, density: 5000, category: 'URBAN', baseValue: 100 },
    { id: 'nyc-central-park', name: 'Central Park', coords: { lat: 40.7851, lng: -73.9683 }, radius: 2000, density: 3000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'us-moa', name: 'Mall of America', coords: { lat: 44.8549, lng: -93.2422 }, radius: 800, density: 6000, category: 'MALL', baseValue: 100 },
    { id: 'la-grove', name: 'The Grove', coords: { lat: 34.0722, lng: -118.3581 }, radius: 400, density: 4000, category: 'MALL', baseValue: 100 },
    { id: 'la-hollywood', name: 'Hollywood Walk of Fame', coords: { lat: 34.1016, lng: -118.3267 }, radius: 1200, density: 3500, category: 'LANDMARK', baseValue: 1000 },
    { id: 'la-santa-monica', name: 'Santa Monica Pier', coords: { lat: 34.0104, lng: -118.4961 }, radius: 500, density: 3000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'lv-strip', name: 'Las Vegas Strip', coords: { lat: 36.1147, lng: -115.1728 }, radius: 3000, density: 8000, category: 'URBAN', baseValue: 100 },
    { id: 'chi-mag-mile', name: 'Magnificent Mile', coords: { lat: 41.8953, lng: -87.6247 }, radius: 1500, density: 4000, category: 'URBAN', baseValue: 100 },
    { id: 'chi-navy-pier', name: 'Navy Pier', coords: { lat: 41.8917, lng: -87.6043 }, radius: 800, density: 3000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'sf-gate', name: 'Golden Gate Bridge', coords: { lat: 37.8199, lng: -122.4783 }, radius: 1000, density: 2000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'sf-fishermans', name: 'Fisherman\'s Wharf', coords: { lat: 37.8080, lng: -122.4177 }, radius: 600, density: 3500, category: 'LANDMARK', baseValue: 1000 },
    { id: 'ca-tor-cn', name: 'CN Tower', coords: { lat: 43.6426, lng: -79.3871 }, radius: 500, density: 3000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'ca-tor-eaton', name: 'Toronto Eaton Centre', coords: { lat: 43.6544, lng: -79.3807 }, radius: 400, density: 5000, category: 'MALL', baseValue: 100 },
    { id: 'ca-van-stanley', name: 'Stanley Park', coords: { lat: 49.3043, lng: -123.1443 }, radius: 2000, density: 2500, category: 'LANDMARK', baseValue: 1000 },
    { id: 'ca-mtl-old', name: 'Old Montreal', coords: { lat: 45.5076, lng: -73.5547 }, radius: 800, density: 3000, category: 'URBAN', baseValue: 100 },
    { id: 'mx-zocalo', name: 'Zócalo', coords: { lat: 19.4326, lng: -99.1332 }, radius: 600, density: 4000, category: 'URBAN', baseValue: 100 },
    { id: 'mx-cancun-isla', name: 'La Isla Shopping Village', coords: { lat: 21.1108, lng: -86.7628 }, radius: 500, density: 5000, category: 'MALL', baseValue: 100 },

    // --- SOUTH AMERICA ---
    { id: 'br-rio-christ', name: 'Christ the Redeemer', coords: { lat: -22.9519, lng: -43.2105 }, radius: 400, density: 3000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'br-rio-copa', name: 'Copacabana Beach', coords: { lat: -22.9694, lng: -43.1868 }, radius: 2000, density: 4000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'br-rio-sul', name: 'Shopping Rio Sul', coords: { lat: -22.9563, lng: -43.1768 }, radius: 300, density: 4500, category: 'MALL', baseValue: 100 },
    { id: 'br-sp-paulista', name: 'Avenida Paulista', coords: { lat: -23.5614, lng: -46.6560 }, radius: 2000, density: 5000, category: 'URBAN', baseValue: 100 },
    { id: 'ar-ba-obelisco', name: 'Obelisco de Buenos Aires', coords: { lat: -34.6037, lng: -58.3816 }, radius: 500, density: 4000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'ar-ba-pacifico', name: 'Galerías Pacífico', coords: { lat: -34.5991, lng: -58.3747 }, radius: 300, density: 5000, category: 'MALL', baseValue: 100 },
    { id: 'cl-costanera', name: 'Costanera Center', coords: { lat: -33.4173, lng: -70.6065 }, radius: 400, density: 6000, category: 'MALL', baseValue: 100 },
    { id: 'pe-larcomar', name: 'Larcomar', coords: { lat: -12.1322, lng: -77.0305 }, radius: 300, density: 4500, category: 'MALL', baseValue: 100 },
    { id: 'co-andino', name: 'Centro Comercial Andino', coords: { lat: 4.6664, lng: -74.0538 }, radius: 300, density: 4500, category: 'MALL', baseValue: 100 },

    // --- EUROPE ---
    { id: 'fr-eiffel', name: 'Eiffel Tower', coords: { lat: 48.8584, lng: 2.2945 }, radius: 600, density: 5000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'fr-louvre', name: 'Louvre Museum', coords: { lat: 48.8606, lng: 2.3376 }, radius: 600, density: 4500, category: 'LANDMARK', baseValue: 1000 },
    { id: 'fr-lafayette', name: 'Galeries Lafayette', coords: { lat: 48.8737, lng: 2.3320 }, radius: 300, density: 6000, category: 'MALL', baseValue: 100 },
    { id: 'uk-bigben', name: 'Big Ben & Parliament', coords: { lat: 51.5007, lng: -0.1246 }, radius: 500, density: 4000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'uk-oxford', name: 'Oxford Street', coords: { lat: 51.5147, lng: -0.1444 }, radius: 1500, density: 5500, category: 'URBAN', baseValue: 100 },
    { id: 'uk-westfield', name: 'Westfield London', coords: { lat: 51.5074, lng: -0.2212 }, radius: 600, density: 7000, category: 'MALL', baseValue: 100 },
    { id: 'de-brandenburg', name: 'Brandenburg Gate', coords: { lat: 52.5163, lng: 13.3777 }, radius: 500, density: 4000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'de-kadewe', name: 'KaDeWe', coords: { lat: 52.5015, lng: 13.3411 }, radius: 300, density: 6000, category: 'MALL', baseValue: 100 },
    { id: 'de-mun-marien', name: 'Marienplatz', coords: { lat: 48.1372, lng: 11.5755 }, radius: 600, density: 4500, category: 'URBAN', baseValue: 100 },
    { id: 'de-mun-oez', name: 'Olympia Einkaufszentrum', coords: { lat: 48.1837, lng: 11.5317 }, radius: 500, density: 5500, category: 'MALL', baseValue: 100 },
    { id: 'it-colosseum', name: 'Colosseum', coords: { lat: 41.8902, lng: 12.4922 }, radius: 500, density: 5000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'it-milan-galleria', name: 'Galleria Vittorio Emanuele II', coords: { lat: 45.4657, lng: 9.1900 }, radius: 300, density: 6000, category: 'MALL', baseValue: 100 },
    { id: 'es-sagrada', name: 'Sagrada Familia', coords: { lat: 41.4036, lng: 2.1744 }, radius: 500, density: 5000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'es-maquinista', name: 'La Maquinista', coords: { lat: 41.4402, lng: 2.1989 }, radius: 400, density: 5500, category: 'MALL', baseValue: 100 },
    { id: 'es-madrid-sol', name: 'Puerta del Sol', coords: { lat: 40.4168, lng: -3.7038 }, radius: 600, density: 5000, category: 'URBAN', baseValue: 100 },
    { id: 'ru-red-sq', name: 'Red Square', coords: { lat: 55.7539, lng: 37.6208 }, radius: 600, density: 4000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'ru-gum', name: 'GUM', coords: { lat: 55.7547, lng: 37.6214 }, radius: 200, density: 6000, category: 'MALL', baseValue: 100 },

    // --- ASIA ---
    { id: 'cn-sh-bund', name: 'The Bund', coords: { lat: 31.2429, lng: 121.4882 }, radius: 1000, density: 5000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'cn-sh-ifc', name: 'Shanghai IFC', coords: { lat: 31.2372, lng: 121.5015 }, radius: 400, density: 6000, category: 'MALL', baseValue: 100 },
    { id: 'cn-bj-forbidden', name: 'Forbidden City', coords: { lat: 39.9163, lng: 116.3972 }, radius: 1000, density: 4000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'jp-shibuya', name: 'Shibuya Crossing', coords: { lat: 35.6595, lng: 139.7004 }, radius: 600, density: 8000, category: 'URBAN', baseValue: 100 },
    { id: 'jp-ginza', name: 'Ginza Six', coords: { lat: 35.6696, lng: 139.7640 }, radius: 300, density: 7000, category: 'MALL', baseValue: 100 },
    { id: 'in-gateway', name: 'Gateway of India', coords: { lat: 18.9220, lng: 72.8347 }, radius: 500, density: 4000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'in-phoenix', name: 'Phoenix Marketcity Mumbai', coords: { lat: 19.0863, lng: 72.8889 }, radius: 500, density: 5500, category: 'MALL', baseValue: 100 },
    { id: 'ae-burj', name: 'Burj Khalifa', coords: { lat: 25.1972, lng: 55.2744 }, radius: 400, density: 5000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'ae-dubai-mall', name: 'The Dubai Mall', coords: { lat: 25.1988, lng: 55.2796 }, radius: 800, density: 9000, category: 'MALL', baseValue: 100 },
    { id: 'sg-mbs', name: 'Marina Bay Sands', coords: { lat: 1.2834, lng: 103.8607 }, radius: 600, density: 6000, category: 'MALL', baseValue: 100 },
    { id: 'kr-lotte', name: 'Lotte World Tower', coords: { lat: 37.5126, lng: 127.1026 }, radius: 500, density: 6000, category: 'MALL', baseValue: 100 },

    // --- AUSTRALIA ---
    { id: 'au-opera', name: 'Sydney Opera House', coords: { lat: -33.8568, lng: 151.2153 }, radius: 600, density: 4000, category: 'LANDMARK', baseValue: 1000 },
    { id: 'au-westfield-syd', name: 'Westfield Sydney', coords: { lat: -33.8702, lng: 151.2088 }, radius: 400, density: 6000, category: 'MALL', baseValue: 100 },
    { id: 'au-chadstone', name: 'Chadstone Shopping Centre', coords: { lat: -37.8860, lng: 145.0827 }, radius: 800, density: 6000, category: 'MALL', baseValue: 100 },

    // --- SEASONAL XMAS EVENTS ---
    { id: 'xmas-sibiu', name: 'Sibiu Christmas Market', coords: { lat: 45.7972, lng: 24.1520 }, radius: 100, density: 1, category: 'EVENT', baseValue: 1000 },
    { id: 'xmas-buc-const', name: 'Bucharest Xmas Market', coords: { lat: 44.4270, lng: 26.0870 }, radius: 100, density: 1, category: 'EVENT', baseValue: 1000 },
    { id: 'xmas-vienna', name: 'Vienna Rathausplatz', coords: { lat: 48.2107, lng: 16.3592 }, radius: 100, density: 1, category: 'EVENT', baseValue: 1000 },
    { id: 'xmas-strasbourg', name: 'Strasbourg Capital of Noel', coords: { lat: 48.5839, lng: 7.7485 }, radius: 100, density: 1, category: 'EVENT', baseValue: 1000 },
    { id: 'xmas-cologne', name: 'Cologne Cathedral Market', coords: { lat: 50.9413, lng: 6.9583 }, radius: 100, density: 1, category: 'EVENT', baseValue: 1000 },
    { id: 'xmas-nyc-bryant', name: 'Bryant Park Winter Village', coords: { lat: 40.7536, lng: -73.9832 }, radius: 100, density: 1, category: 'EVENT', baseValue: 1000 },
    { id: 'xmas-london-winter', name: 'Hyde Park Winter Wonderland', coords: { lat: 51.5074, lng: -0.1657 }, radius: 100, density: 1, category: 'EVENT', baseValue: 1000 },
    { id: 'xmas-chicago-christ', name: 'Chicago Christkindlmarket', coords: { lat: 41.8832, lng: -87.6302 }, radius: 100, density: 1, category: 'EVENT', baseValue: 1000 },
    { id: 'xmas-prague', name: 'Prague Old Town Square Market', coords: { lat: 50.0875, lng: 14.4212 }, radius: 100, density: 1, category: 'EVENT', baseValue: 1000 }
];

export const GLOBAL_SPAWNS: SpawnPoint[] = [];

export const MAX_INTERACTION_DISTANCE = 80;
export const REWARD_AD_VALUE = 500;
export const NEARBY_SEARCH_RADIUS = 20000;
