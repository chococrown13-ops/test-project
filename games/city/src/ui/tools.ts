import { KINDS, Level, LEVEL_COST, Road, ROAD_COST, Zone, type BuildingKind } from '../sim/defs';
import { BUS_TYPES, type BusType, TRANSIT_COST } from '../sim/transit';

export type ToolId =
  | 'select' | 'street' | 'avenue' | 'elevated' | 'underpass' | 'tunnel' | 'zoneR' | 'zoneC' | 'zoneI' | 'dezone' | 'bulldoze' | 'bus' | 'metro'
  | 'busVillage' | 'busTrunk' | 'busExpress'
  | `build:${BuildingKind}`;

export interface ToolDef {
  id: ToolId;
  name: string;
  price: string;
  /** A swatch for tools that paint the map in a colour of their own (zones). */
  swatch?: string;
  road?: Road;
  /** A road on the second layer: flyover, underpass or tunnel. */
  level?: Level;
  zone?: Zone;
  kind?: BuildingKind;
  line?: 'bus' | 'metro';
  /** For bus lines: which kind. */
  bus?: BusType;
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}만`;
const fac = (kind: BuildingKind): ToolDef => ({ id: `build:${kind}`, name: KINDS[kind].name, price: won(KINDS[kind].cost ?? 0), kind });

export interface Category { id: string; name: string; key: string; tools: ToolDef[] }

/** The dock, left to right, in the order a new city needs them. The key is its keyboard shortcut. */
export const CATEGORIES: Category[] = [
  { id: 'road', name: '도로', key: 'Z', tools: [
    { id: 'street', name: '일반 도로', price: `칸당 ${won(ROAD_COST[Road.Street])}`, road: Road.Street },
    { id: 'avenue', name: '4차선 대로', price: `칸당 ${won(ROAD_COST[Road.Avenue])}`, road: Road.Avenue },
    { id: 'elevated', name: '고가도로', price: `칸당 ${won(ROAD_COST[Road.Avenue] * LEVEL_COST[Level.Elevated])}`, level: Level.Elevated },
    { id: 'underpass', name: '지하차도', price: `칸당 ${won(ROAD_COST[Road.Avenue] * LEVEL_COST[Level.Underpass])}`, level: Level.Underpass },
    { id: 'tunnel', name: '터널', price: `칸당 ${won(ROAD_COST[Road.Avenue] * LEVEL_COST[Level.Tunnel])}`, level: Level.Tunnel },
    fac('parking'), fac('parktower'),
  ] },
  { id: 'zone', name: '구역', key: 'X', tools: [
    { id: 'zoneR', name: '주거', price: '무료', zone: Zone.R, swatch: 'var(--color-zone-r)' },
    { id: 'zoneC', name: '상업', price: '무료', zone: Zone.C, swatch: 'var(--color-zone-c)' },
    { id: 'zoneI', name: '산업', price: '무료', zone: Zone.I, swatch: 'var(--color-zone-i)' },
    { id: 'dezone', name: '구역 해제', price: '무료', zone: Zone.None },
  ] },
  { id: 'power', name: '전기', key: 'C', tools: [fac('coal'), fac('solar')] },
  { id: 'water', name: '상하수도', key: 'V', tools: [fac('water'), fac('sewage')] },
  { id: 'service', name: '공공', key: 'B', tools: [fac('school'), fac('police'), fac('fire'), fac('clinic')] },
  { id: 'transit', name: '대중교통', key: 'N', tools: [
    { id: 'busVillage', name: BUS_TYPES.village.name, price: `정류장당 ${won(BUS_TYPES.village.cost.stop)}`, line: 'bus', bus: 'village', swatch: BUS_TYPES.village.color },
    { id: 'bus', name: BUS_TYPES.branch.name, price: `정류장당 ${won(BUS_TYPES.branch.cost.stop)}`, line: 'bus', bus: 'branch', swatch: BUS_TYPES.branch.color },
    { id: 'busTrunk', name: BUS_TYPES.trunk.name, price: `정류장당 ${won(BUS_TYPES.trunk.cost.stop)}`, line: 'bus', bus: 'trunk', swatch: BUS_TYPES.trunk.color },
    { id: 'busExpress', name: BUS_TYPES.express.name, price: `정류장당 ${won(BUS_TYPES.express.cost.stop)}`, line: 'bus', bus: 'express', swatch: BUS_TYPES.express.color },
    { id: 'metro', name: '지하철 노선', price: `역당 ${won(TRANSIT_COST.station)}`, line: 'metro' },
  ] },
  { id: 'park', name: '공원', key: 'M', tools: [fac('park'), fac('riverpark')] },
  { id: 'landmark', name: '명소', key: 'L', tools: [fac('market'), fac('palace'), fac('tower')] },
  { id: 'bulldoze', name: '철거', key: 'Delete', tools: [{ id: 'bulldoze', name: '철거', price: '' }] },
];

export const TOOLS: Record<string, ToolDef> = Object.fromEntries(CATEGORIES.flatMap((c) => c.tools).map((t) => [t.id, t]));
