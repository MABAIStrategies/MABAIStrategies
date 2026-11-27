// The eight realms. Each drives the 3D landscape, lighting, particles and UI accent.
export type Terrain = 'hills' | 'mountains' | 'harbor' | 'dunes' | 'canyon' | 'islands' | 'volcanic' | 'peaks';
export type Trees = 'blossom' | 'bamboo' | 'pine' | 'cactus' | 'snowpine' | 'maple' | 'obsidian' | 'crystal';
export type Particles = 'petals' | 'fireflies' | 'dust' | 'snow' | 'leaves' | 'embers' | 'stars';
export type Landmark = 'pagoda' | 'gate' | 'lighthouse' | 'obelisk' | 'monastery' | 'arch' | 'forge' | 'spire';

export interface Biome {
  id: number; key: string; name: string; subtitle: string;
  skyTop: string; skyHorizon: string; skyBottom: string;
  fog: string; fogDensity: number;
  sun: string; sunIntensity: number; sunDir: [number, number, number];
  hemiSky: string; hemiGround: string; hemiIntensity: number;
  ground: [string, string, string, string];
  terrain: Terrain; amp: number;
  water: string | null; waterLevel: number;
  trees: Trees; treeColors: string[]; treeCount: number;
  particles: Particles; particleColor: string; particleCount: number;
  night: boolean; landmark: Landmark;
  daisTop: string; daisRim: string;
  accent: string; accent2: string;
}

export const BIOMES: Biome[] = [
  {
    id: 0, key: 'blossom', name: 'Blossom Valley', subtitle: 'Where the first winds wake',
    skyTop: '#7fb6ea', skyHorizon: '#ffe0ec', skyBottom: '#f6d5e0', fog: '#f4d9e4', fogDensity: 0.0048,
    sun: '#fff1df', sunIntensity: 2.6, sunDir: [30, 50, 20], hemiSky: '#cfe6ff', hemiGround: '#7a9a5a', hemiIntensity: 0.9,
    ground: ['#6fa55a', '#89b864', '#a3a07a', '#e8e2d8'], terrain: 'hills', amp: 14,
    water: '#6cb6d6', waterLevel: -1.2, trees: 'blossom', treeColors: ['#f7a8c4', '#f48fb1', '#fcc5d8', '#ffffff'], treeCount: 170,
    particles: 'petals', particleColor: '#ffb3cf', particleCount: 320, night: false, landmark: 'pagoda',
    daisTop: '#5b3a29', daisRim: '#b23a3a', accent: '#e86a92', accent2: '#ffd6e4',
  },
  {
    id: 1, key: 'bamboo', name: 'Bamboo Highlands', subtitle: 'Green whispers in the mist',
    skyTop: '#5f8f86', skyHorizon: '#cfe3d2', skyBottom: '#b8d4c0', fog: '#c4dccb', fogDensity: 0.012,
    sun: '#f4ffe8', sunIntensity: 2.1, sunDir: [-25, 45, 25], hemiSky: '#d8f0e0', hemiGround: '#3f6b3a', hemiIntensity: 1.0,
    ground: ['#3f7a3c', '#5c9447', '#7d8f63', '#c9d3c0'], terrain: 'mountains', amp: 22,
    water: '#4f9a8a', waterLevel: -1.5, trees: 'bamboo', treeColors: ['#7fbf4d', '#5fa83a', '#9ad35e'], treeCount: 420,
    particles: 'fireflies', particleColor: '#e8ff9a', particleCount: 160, night: false, landmark: 'gate',
    daisTop: '#4a3a24', daisRim: '#2f6b3f', accent: '#4caf6e', accent2: '#d6f5df',
  },
  {
    id: 2, key: 'harbor', name: 'Lantern Harbor', subtitle: 'A thousand lights upon the tide',
    skyTop: '#0b1638', skyHorizon: '#3a2a5c', skyBottom: '#1a1030', fog: '#1d1838', fogDensity: 0.011,
    sun: '#a9b8ff', sunIntensity: 0.9, sunDir: [-30, 40, -20], hemiSky: '#3b4a8a', hemiGround: '#1a1426', hemiIntensity: 0.7,
    ground: ['#2b3a3a', '#3e4f45', '#4f5560', '#8a8aa0'], terrain: 'harbor', amp: 9,
    water: '#13305a', waterLevel: -0.6, trees: 'pine', treeColors: ['#1f4a3a', '#24523f'], treeCount: 120,
    particles: 'fireflies', particleColor: '#ffcf6b', particleCount: 200, night: true, landmark: 'lighthouse',
    daisTop: '#3a2418', daisRim: '#c2452d', accent: '#ffb347', accent2: '#ffe6c2',
  },
  {
    id: 3, key: 'desert', name: 'Desert of Echoes', subtitle: 'Sand remembers every footstep',
    skyTop: '#4a7fc0', skyHorizon: '#ffd39a', skyBottom: '#f3c07c', fog: '#f0c690', fogDensity: 0.0075,
    sun: '#ffe3b0', sunIntensity: 3.0, sunDir: [40, 35, -10], hemiSky: '#ffe8c8', hemiGround: '#b07a40', hemiIntensity: 0.8,
    ground: ['#e0b070', '#d9a35c', '#c48348', '#a8673a'], terrain: 'dunes', amp: 10,
    water: null, waterLevel: -5, trees: 'cactus', treeColors: ['#6f9a4a', '#5d8a3e'], treeCount: 70,
    particles: 'dust', particleColor: '#f3d29b', particleCount: 260, night: false, landmark: 'obelisk',
    daisTop: '#7a5230', daisRim: '#d9893a', accent: '#f0a14a', accent2: '#ffeacc',
  },
  {
    id: 4, key: 'frost', name: 'Frostpeak Monastery', subtitle: 'Silence carved in ice',
    skyTop: '#8fb3d9', skyHorizon: '#eef4fb', skyBottom: '#dde8f2', fog: '#e4edf6', fogDensity: 0.011,
    sun: '#ffffff', sunIntensity: 2.4, sunDir: [20, 30, 30], hemiSky: '#eaf3ff', hemiGround: '#8aa0b8', hemiIntensity: 1.1,
    ground: ['#d9e4ee', '#e9f0f7', '#b8c6d4', '#ffffff'], terrain: 'peaks', amp: 30,
    water: '#9cc6e0', waterLevel: -1.4, trees: 'snowpine', treeColors: ['#2f5a4a', '#3a6656'], treeCount: 220,
    particles: 'snow', particleColor: '#ffffff', particleCount: 420, night: false, landmark: 'monastery',
    daisTop: '#5a4a44', daisRim: '#4f7bb0', accent: '#6fa8dc', accent2: '#e6f1fb',
  },
  {
    id: 5, key: 'autumn', name: 'Autumn Canyons', subtitle: 'Leaves of copper and flame',
    skyTop: '#6a8fc4', skyHorizon: '#ffc58a', skyBottom: '#e8a46a', fog: '#e9b48a', fogDensity: 0.008,
    sun: '#ffd09a', sunIntensity: 2.6, sunDir: [-35, 28, 15], hemiSky: '#ffe0c0', hemiGround: '#8a4a2a', hemiIntensity: 0.9,
    ground: ['#a86a3a', '#c07d45', '#9b5a3a', '#7a4630'], terrain: 'canyon', amp: 20,
    water: '#4f8fa0', waterLevel: -1.6, trees: 'maple', treeColors: ['#e0552b', '#f08a24', '#c93a2a', '#f2b33d'], treeCount: 200,
    particles: 'leaves', particleColor: '#e8742b', particleCount: 260, night: false, landmark: 'arch',
    daisTop: '#4a2a1e', daisRim: '#c0612b', accent: '#e8742b', accent2: '#ffe2cc',
  },
  {
    id: 6, key: 'forge', name: 'Volcanic Forge', subtitle: 'Where the earth still burns',
    skyTop: '#140a0a', skyHorizon: '#5c1a10', skyBottom: '#2a0c08', fog: '#2a0f0a', fogDensity: 0.013,
    sun: '#ff8a50', sunIntensity: 1.2, sunDir: [10, 30, -30], hemiSky: '#ff6a3a', hemiGround: '#1a0a06', hemiIntensity: 0.6,
    ground: ['#2a2020', '#3a2a26', '#4a3430', '#1a1414'], terrain: 'volcanic', amp: 18,
    water: '#ff5a1a', waterLevel: -1.3, trees: 'obsidian', treeColors: ['#1a1416', '#2a1c1e'], treeCount: 120,
    particles: 'embers', particleColor: '#ff7a2a', particleCount: 360, night: true, landmark: 'forge',
    daisTop: '#1e1616', daisRim: '#d43a1a', accent: '#ff5a2a', accent2: '#ffd8c8',
  },
  {
    id: 7, key: 'celestial', name: 'Celestial Isles', subtitle: 'Stone adrift among the stars',
    skyTop: '#0a0526', skyHorizon: '#5a2f8a', skyBottom: '#1a0f40', fog: '#2a1a50', fogDensity: 0.0065,
    sun: '#d8c8ff', sunIntensity: 1.3, sunDir: [-20, 40, 20], hemiSky: '#8a6aff', hemiGround: '#20103a', hemiIntensity: 0.8,
    ground: ['#4a5a8a', '#6a6aa0', '#8a7ab8', '#d8d0ff'], terrain: 'islands', amp: 10,
    water: null, waterLevel: -50, trees: 'crystal', treeColors: ['#8ae0ff', '#c48aff', '#ff9ae0'], treeCount: 140,
    particles: 'stars', particleColor: '#ffffff', particleCount: 420, night: true, landmark: 'spire',
    daisTop: '#2a2050', daisRim: '#b89aff', accent: '#b89aff', accent2: '#efe6ff',
  },
];
