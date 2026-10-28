import { KINDS, Road, ROAD_COST, Zone, type BuildingKind } from '../sim/defs';
import { TRANSIT_COST } from '../sim/transit';

export type ToolId =
  | 'select' | 'street' | 'avenue' | 'zoneR' | 'zoneC' | 'zoneI' | 'dezone' | 'bulldoze' | 'bus' | 'metro'
  | `build:${BuildingKind}`;

export interface ToolDef {
  id: ToolId;
  name: string;
  price: string;
  /** A swatch for tools that paint the map in a colour of their own (zones). */
  swatch?: string;
  road?: Road;
  zone?: Zone;
  kind?: BuildingKind;
  line?: 'bus' | 'metro';
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}만`;
const fac = (kind: BuildingKind): ToolDef => ({ id: `build:${kind}`, name: KINDS[kind].name, price: won(KINDS[kind].cost ?? 0), kind });

export interface Category { id: string; name: string; key: string; tools: ToolDef[] }

/** The dock, left to right, in the order a new city needs them. The key is its keyboard shortcut. */
export const CATEGORIES: Category[] = [
  { id: 'road', name: '도로', key: 'Z', tools: [
    { id: 'street', name: '일반 도로', price: `칸당 ${won(ROAD_COST[Road.Street])}`, road: Road.Street },
    { id: 'avenue', name: '4차선 대로', price: `칸당 ${won(ROAD_COST[Road.Avenue])}`, road: Road.Avenue },
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
    { id: 'bus', name: '버스 노선', price: `정류장당 ${won(TRANSIT_COST.busStop)}`, line: 'bus' },
    { id: 'metro', name: '지하철 노선', price: `역당 ${won(TRANSIT_COST.station)}`, line: 'metro' },
  ] },
  { id: 'park', name: '공원', key: 'M', tools: [fac('park')] },
  { id: 'bulldoze', name: '철거', key: 'Delete', tools: [{ id: 'bulldoze', name: '철거', price: '' }] },
];

export const TOOLS: Record<string, ToolDef> = Object.fromEntries(CATEGORIES.flatMap((c) => c.tools).map((t) => [t.id, t]));
