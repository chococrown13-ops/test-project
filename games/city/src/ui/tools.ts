import { KINDS, Road, ROAD_COST, Zone, type BuildingKind } from '../sim/defs';

export type ToolId =
  | 'select' | 'street' | 'avenue' | 'zoneR' | 'zoneC' | 'zoneI' | 'dezone' | 'bulldoze'
  | `build:${BuildingKind}`;

export interface ToolDef {
  id: ToolId;
  icon: string;
  name: string;
  price: string;
  road?: Road;
  zone?: Zone;
  kind?: BuildingKind;
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}만`;
const fac = (kind: BuildingKind, icon: string): ToolDef => ({ id: `build:${kind}`, icon, name: KINDS[kind].name, price: won(KINDS[kind].cost ?? 0), kind });

export interface Category { id: string; icon: string; name: string; tools: ToolDef[] }

export const CATEGORIES: Category[] = [
  { id: 'road', icon: '🛣️', name: '도로', tools: [
    { id: 'street', icon: '🛣️', name: '일반 도로', price: `${won(ROAD_COST[Road.Street])}/칸`, road: Road.Street },
    { id: 'avenue', icon: '🚦', name: '4차선 대로', price: `${won(ROAD_COST[Road.Avenue])}/칸`, road: Road.Avenue },
  ] },
  { id: 'zone', icon: '🏘️', name: '구역', tools: [
    { id: 'zoneR', icon: '🏠', name: '주거', price: '무료', zone: Zone.R },
    { id: 'zoneC', icon: '🏪', name: '상업', price: '무료', zone: Zone.C },
    { id: 'zoneI', icon: '🏭', name: '산업', price: '무료', zone: Zone.I },
    { id: 'dezone', icon: '⬜', name: '구역 해제', price: '무료', zone: Zone.None },
  ] },
  { id: 'power', icon: '⚡', name: '전기', tools: [fac('coal', '🏭'), fac('solar', '🔆')] },
  { id: 'water', icon: '💧', name: '상하수도', tools: [fac('water', '🚰'), fac('sewage', '♻️')] },
  { id: 'service', icon: '🏫', name: '공공', tools: [fac('school', '🏫'), fac('police', '🚓'), fac('fire', '🚒'), fac('clinic', '🏥')] },
  { id: 'park', icon: '🌳', name: '공원', tools: [fac('park', '🌳')] },
  { id: 'bulldoze', icon: '🧹', name: '철거', tools: [{ id: 'bulldoze', icon: '🧹', name: '철거', price: '' }] },
];

export const TOOLS: Record<string, ToolDef> = Object.fromEntries(CATEGORIES.flatMap((c) => c.tools).map((t) => [t.id, t]));
