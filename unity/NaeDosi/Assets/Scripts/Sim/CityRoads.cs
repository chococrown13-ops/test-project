using System;
using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Defs;
using static NaeDosi.Geom;

namespace NaeDosi
{
    /// <summary>
    /// The city's roads as one planar road graph (port of render/roadnet.ts and render/roadheight.ts), and
    /// everything the road layer draws from it (render/roads.ts): asphalt, pavements, paint, bridges,
    /// flyover decks, tunnel mouths, roundabout islands, street lamps and 가로수 spots.
    /// </summary>
    public static class CityRoads
    {
        const int NN = N * N;
        public static readonly Dictionary<string, RoadType> CITY_TYPES = new Dictionary<string, RoadType>
        {
            ["street"] = new RoadType { half = Curves.HALF_WIDTH(Road.Street), kerb = Curves.KERB_W(Road.Street), lanes = 1 },
            ["avenue"] = new RoadType { half = Curves.HALF_WIDTH(Road.Avenue), kerb = Curves.KERB_W(Road.Avenue), lanes = 2 },
            ["highway"] = new RoadType { half = Curves.HALF_WIDTH(Road.Highway), kerb = Curves.KERB_W(Road.Highway), lanes = 2 },
        };
        static string KIND(int t) => t == Road.Street ? "street" : t == Road.Avenue ? "avenue" : t == Road.Highway ? "highway" : null;
        public const string ONEWAY_TAG = "ow:";
        public const string RING = "ring";

        static V centre(int i) => v((i % N) * CELL + CELL / 2.0, (i / N) * CELL + CELL / 2.0);

        static List<Seg> snapEnds(List<Seg> p, V a, V b)
        {
            var o = new List<Seg>(p);
            Seg fix(Seg s, bool atA, V q) => s.IsLine ? (atA ? Seg.Line(q, s.b) : Seg.Line(s.a, q)) : null;
            V s0 = pathAt(o, 0).p, s1 = pathAt(o, pathLength(o)).p;
            if (Hypot(s0.x - a.x, s0.z - a.z) > 0.05)
            {
                var f = fix(o[0], true, a);
                if (f != null && pathLength(new List<Seg> { f }) > 1) o[0] = f; else o.Insert(0, Seg.Line(a, s0));
            }
            if (Hypot(s1.x - b.x, s1.z - b.z) > 0.05)
            {
                var f = fix(o[o.Count - 1], false, b);
                if (f != null && pathLength(new List<Seg> { f }) > 1) o[o.Count - 1] = f; else o.Add(Seg.Line(s1, b));
            }
            return o;
        }

        sealed class Tap { public double t; public int cell; public V p; }

        public static RoadNetwork buildCityNetwork(World w)
        {
            var net = new RoadNetwork(CITY_TYPES);
            var info = Curves.curveInfo(w);
            var own = info.owned;
            var rawCache = new Dictionary<int, List<int>>();
            List<int> raw(int i)
            {
                if (rawCache.TryGetValue(i, out var r)) return r;
                var o = new List<int>();
                Graph.forEachNeighbour(w, i, (n, _) => { if (n < NN) o.Add(n); });
                rawCache[i] = o;
                return o;
            }
            bool isDiag(int a, int b) => a % N != b % N && a / N != b / N;
            bool straight(int i, int n) => raw(i).Contains(2 * i - n) || raw(n).Contains(2 * n - i);
            bool through(int i, int n) { int d = n - i, p = Math.Abs(d) == 1 ? N : 1; return raw(i).Contains(i + p) && raw(i).Contains(i - p); }
            bool rung(int i, int n) => !isDiag(i, n) && through(i, n) && through(n, i) && !straight(i, n);
            List<int> links(int i) => raw(i).Where(n => !rung(i, n) && (isDiag(i, n) || straight(i, n) || !raw(n).Any(m => m != i && raw(i).Contains(m) && (isDiag(i, m) || isDiag(n, m))))).ToList();
            var chain = new HashSet<long>();
            long key(int a, int b) => a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a;
            foreach (var c in w.curves) for (int k = 1; k < c.cells.Count; k++) if (own[c.cells[k - 1]] != 0 || own[c.cells[k]] != 0) chain.Add(key(c.cells[k - 1], c.cells[k]));
            var glCache = new Dictionary<int, List<int>>();
            List<int> gridLinks(int i) { if (!glCache.TryGetValue(i, out var l)) glCache[i] = l = links(i).Where(n => !chain.Contains(key(i, n))).ToList(); return l; }

            var pos = new Dictionary<int, V>();
            var nodeOf = new Dictionary<int, int>();
            var alias = new Dictionary<int, int>();
            int R(int cell) { int c = cell; for (int g = 0; g < 8 && alias.ContainsKey(c); g++) c = alias[c]; return c; }
            int node(int cell0)
            {
                int cell = R(cell0);
                if (!nodeOf.TryGetValue(cell, out int id)) { id = net.node(pos.TryGetValue(cell, out var pp) ? pp : centre(cell)).id; nodeOf[cell] = id; }
                return id;
            }
            int cellOfP(V p) => Math.Max(0, Math.Min(N - 1, (int)Math.Floor(p.z / CELL))) * N + Math.Max(0, Math.Min(N - 1, (int)Math.Floor(p.x / CELL)));

            var paths = w.curves.Select(c => Curves.curvePath(c).path).ToList();
            var lens = paths.Select(pathLength).ToList();
            var extra = w.curves.Select(_ => new List<Tap>()).ToList();
            var shared = new HashSet<int>();
            for (int i = 0; i < w.curves.Count; i++) for (int j = i + 1; j < w.curves.Count; j++)
                    foreach (var x in pathCrossings(paths[i], paths[j]))
                    {
                        if (x.ta < 1 || x.ta > lens[i] - 1 || x.tb < 1 || x.tb > lens[j] - 1) continue;
                        int cell = cellOfP(x.p);
                        shared.Add(cell); pos[cell] = x.p;
                        extra[i].Add(new Tap { t = x.ta, cell = cell, p = x.p });
                        extra[j].Add(new Tap { t = x.tb, cell = cell, p = x.p });
                    }
            for (int i = 0; i < w.curves.Count; i++)
            {
                var c = w.curves[i];
                foreach (var (cell, E, tEnd) in new[] { (c.cells[0], v(c.ax, c.az), 0.0), (c.cells[c.cells.Count - 1], v(c.bx, c.bz), lens[i]) })
                {
                    if (extra[i].Any(x => Math.Abs(x.t - tEnd) < 12)) continue;
                    for (int j = 0; j < w.curves.Count; j++)
                    {
                        var d = w.curves[j];
                        if (j == i || shared.Contains(cell)) continue;
                        var q = nearestOnPath(paths[j], E);
                        if (q.d > Curves.HALF_WIDTH(d.t) + Curves.KERB_W(d.t) + 4 || q.t < 1 || q.t > lens[j] - 1) continue;
                        shared.Add(cell); pos[cell] = q.p;
                        extra[j].Add(new Tap { t = q.t, cell = cell, p = q.p });
                    }
                }
            }

            for (int ci = 0; ci < w.curves.Count; ci++)
            {
                var c = w.curves[ci];
                var path = paths[ci];
                double L = lens[ci];
                var inChain = new HashSet<int>(c.cells);
                var taps = new List<Tap>(extra[ci]);
                for (int k = 1; k < c.cells.Count - 1; k++)
                {
                    int cell = c.cells[k];
                    if (shared.Contains(cell)) continue;
                    var outside = gridLinks(cell).Where(n => !inChain.Contains(n) || (own[cell] == 0 && own[n] == 0)).ToList();
                    if (own[cell] != 0 && outside.Count == 0) continue;
                    (double t, V p)? hit = null;
                    foreach (int n in outside)
                    {
                        var before = own[n] != 0 ? new List<int>() : gridLinks(n).Where(m => m != cell && !inChain.Contains(m)).ToList();
                        V from = before.Count == 1 ? centre(before[0]) : centre(n);
                        V a = centre(n), b = before.Count == 1 ? v(a.x * 2 - from.x, a.z * 2 - from.z) : centre(cell);
                        V d = v(b.x - a.x, b.z - a.z);
                        V far = v(a.x + d.x * 4, a.z + d.z * 4), back = v(a.x - d.x * 2, a.z - d.z * 2);
                        var xs = pathCrossings(path, new List<Seg> { Seg.Line(back, far) });
                        foreach (var x in xs) if (hit == null || Hypot(x.p.x - b.x, x.p.z - b.z) < Hypot(hit.Value.p.x - b.x, hit.Value.p.z - b.z)) hit = (x.ta, x.p);
                        if (hit != null) break;
                    }
                    if (hit == null) { var q = nearestOnPath(path, centre(cell)); hit = (q.t, pathAt(path, q.t).p); }
                    if (hit.Value.t > 1 && hit.Value.t < L - 1) taps.Add(new Tap { t = hit.Value.t, cell = cell, p = hit.Value.p });
                }
                taps = taps.Select((t, k) => (t, k)).OrderBy(x => x.t.t).ThenBy(x => x.k).Select(x => x.t).ToList();
                int first = c.cells[0], last = c.cells[c.cells.Count - 1];
                var stops = new List<Tap> { new Tap { t = 0, cell = first, p = v(c.ax, c.az) } };
                stops.AddRange(taps);
                stops.Add(new Tap { t = L, cell = last, p = v(c.bx, c.bz) });
                var ends = new HashSet<int> { R(first), R(last) };
                int rank(int kk) => shared.Contains(kk) ? 2 : ends.Contains(kk) ? 1 : 0;
                for (int k = 1; k < stops.Count; k++)
                {
                    var a = stops[k - 1]; var b = stops[k];
                    if (b.t - a.t >= 12) continue;
                    int ka = R(a.cell), kb = R(b.cell);
                    if (ka == kb) { if (k < stops.Count - 1) { b.t = a.t; b.p = a.p; } continue; }
                    int ra = rank(ka), rb = rank(kb);
                    if (ra != 0 && rb != 0) continue;
                    if (rb > ra) { alias[ka] = kb; a.p = b.p; a.t = b.t; } else { alias[kb] = ka; b.t = a.t; b.p = a.p; }
                }
                foreach (var tp in taps) if (!shared.Contains(R(tp.cell)) && !ends.Contains(R(tp.cell))) pos[R(tp.cell)] = tp.p;
                foreach (var (cell, p) in new[] { (first, v(c.ax, c.az)), (last, v(c.bx, c.bz)) }) if (!shared.Contains(R(cell))) pos[R(cell)] = p;
                string kind = KIND(c.t) ?? "street";
                var rest = path; double done = 0; int fromK = 0;
                for (int k = 1; k < stops.Count; k++)
                {
                    if (R(stops[k].cell) == R(stops[fromK].cell)) continue;
                    var (piece, after) = splitPath(rest, stops[k].t - done);
                    rest = after; done = stops[k].t;
                    int a = node(stops[fromK].cell), b = node(stops[k].cell);
                    fromK = k;
                    if (pathLength(piece) < 0.5) continue;
                    net.addEdge(a, b, snapEnds(piece, net.nodes[a].p, net.nodes[b].p), kind);
                }
            }

            bool isNode(int i)
            {
                if (own[i] != 0) return pos.ContainsKey(i);
                if (pos.ContainsKey(i)) return true;
                if (i % N == 0) return true;
                var l = gridLinks(i);
                if (l.Count != 2) return true;
                int dx1 = (l[0] % N) - (i % N), dy1 = (l[0] / N) - (i / N);
                int dx2 = (l[1] % N) - (i % N), dy2 = (l[1] / N) - (i / N);
                if (dx1 != -dx2 || dy1 != -dy2) return true;
                bool curveish(int cc) => own[cc] == 1 || pos.ContainsKey(cc);
                if ((w.road[l[0]] != w.road[i] && !curveish(l[0])) || (w.road[l[1]] != w.road[i] && !curveish(l[1]))) return true;
                if (w.oneway[l[0]] != w.oneway[i] || w.oneway[l[1]] != w.oneway[i]) return true;
                bool wet(int cc) => w.ground[cc] == Ground.Water;
                return wet(l[0]) != wet(i) || wet(l[1]) != wet(i);
            }
            var seen = new HashSet<long>();
            for (int i = 0; i < N * N; i++)
            {
                if (w.road[i] == 0 || !isNode(i)) continue;
                foreach (int first in gridLinks(i))
                {
                    if (seen.Contains(key(i, first))) continue;
                    int prev = i, cur = first;
                    seen.Add(key(prev, cur));
                    for (int guard = 0; guard < N * 2 && !isNode(cur); guard++)
                    {
                        int pv = prev;
                        var nx = gridLinks(cur).Where(n => n != pv).ToList();
                        if (nx.Count == 0) break;
                        prev = cur; cur = nx[0];
                        seen.Add(key(prev, cur));
                    }
                    int a = node(i), b = node(cur);
                    if (a == b) continue;
                    string kind = KIND(Math.Min(w.road[i], w.road[first])) ?? "street";
                    int ow = w.oneway[first] != 0 && (w.oneway[i] == w.oneway[first] || isNode(i)) && (w.oneway[cur] == w.oneway[first] || isNode(cur)) ? w.oneway[first] : 0;
                    net.addEdge(a, b, new List<Seg> { Seg.Line(net.nodes[a].p, net.nodes[b].p) }, kind, ow != 0 ? ONEWAY_TAG + ow : null);
                }
                if (i % N == 0 && own[i] == 0)
                {
                    V p = centre(i); var off = net.node(v(-CELL * 1.5, p.z));
                    int ni = node(i);
                    net.addEdge(ni, off.id, new List<Seg> { Seg.Line(net.nodes[ni].p, off.p) }, KIND(w.road[i]) ?? "street");
                }
            }
            for (int r = 0; r < N * N; r++)
            {
                if (w.roadAlt[r] == 0) continue;
                int e = Graph.rampExit(w, r);
                if (e < 0 || w.road[e] == 0 || own[e] != 0) continue;
                V p = centre(e), q = centre(r);
                V foot = v(p.x + (q.x - p.x) * 0.499, p.z + (q.z - p.z) * 0.499);
                var end = net.node(foot);
                int ne = node(e);
                net.addEdge(ne, end.id, new List<Seg> { Seg.Line(net.nodes[ne].p, end.p) }, "avenue");
            }
            net.simplify();
            if (w.roundabouts.Count > 0) { addRoundabouts(net, w); net.simplify(); }
            return net;
        }

        sealed class Entry { public double a; public int node; }

        static void addRoundabouts(RoadNetwork net, World w)
        {
            foreach (var rb in w.roundabouts)
            {
                var g = Roundabouts.ringOf(rb); V C = v(g.x, g.z); double Rr = g.rc;
                string ringKind = rb.t == Road.Avenue ? "avenue" : "street";
                double off(V p) => Hypot(p.x - C.x, p.z - C.z) - Rr;
                var entries = new List<Entry>();
                int entry(V p)
                {
                    double a = Math.Atan2(p.z - C.z, p.x - C.x);
                    var n = net.node(v(C.x + Math.Cos(a) * Rr, C.z + Math.Sin(a) * Rr));
                    entries.Add(new Entry { a = a, node = n.id });
                    return n.id;
                }
                foreach (var e in net.edges.Values.ToList())
                {
                    double L = pathLength(e.path);
                    var s = samplePath(e.path, 0, L, 0.5, true);
                    if (!s.Any(q => off(q.p) < 0)) continue;
                    var cuts = new List<double> { 0 };
                    for (int i = 1; i < s.Count; i++)
                    {
                        double d0 = off(s[i - 1].p), d1 = off(s[i].p);
                        if ((d0 < 0) != (d1 < 0)) cuts.Add(s[i - 1].t + (s[i].t - s[i - 1].t) * (d0 / (d0 - d1)));
                    }
                    cuts.Add(L);
                    net.edges.Remove(e.id);
                    net.version++;
                    for (int k = 1; k < cuts.Count; k++)
                    {
                        double t0 = cuts[k - 1], t1 = cuts[k];
                        if (t1 - t0 < 0.3 || off(pathAt(e.path, (t0 + t1) / 2).p) < 0) continue;
                        var piece = splitPath(splitPath(e.path, t0).Item2, t1 - t0).Item1;
                        int a = k == 1 ? e.a : entry(pathAt(e.path, t0).p);
                        int b = k == cuts.Count - 1 ? e.b : entry(pathAt(e.path, t1).p);
                        net.addEdge(a, b, snapEnds(piece, net.nodes[a].p, net.nodes[b].p), e.kind, e.tag);
                    }
                }
                foreach (var n in net.nodes.Values.ToList()) if (off(n.p) < -0.5 && net.at(n.id).Count == 0) net.nodes.Remove(n.id);
                entries = entries.Select((en, k) => (en, k)).OrderBy(x => x.en.a).ThenBy(x => x.k).Select(x => x.en).ToList();
                double gap = (net.types[ringKind].half + net.types[ringKind].kerb) * 2 + 4;
                var groups = new List<List<Entry>>();
                foreach (var en in entries)
                {
                    var lastG = groups.Count > 0 ? groups[groups.Count - 1] : null;
                    if (lastG != null && (en.a - lastG[lastG.Count - 1].a) * Rr < gap) lastG.Add(en); else groups.Add(new List<Entry> { en });
                }
                if (groups.Count > 1)
                {
                    var firstG = groups[0]; var lastG = groups[groups.Count - 1];
                    if ((firstG[0].a + Math.PI * 2 - lastG[lastG.Count - 1].a) * Rr < gap)
                    {
                        groups.RemoveAt(groups.Count - 1);
                        var merged = lastG.Select(x => new Entry { a = x.a - Math.PI * 2, node = x.node }).ToList();
                        merged.AddRange(firstG);
                        groups[0] = merged;
                    }
                }
                var mouths = new List<Entry>();
                foreach (var gr in groups)
                {
                    if (gr.Count == 1) { mouths.Add(gr[0]); continue; }
                    double a = gr.Sum(x => x.a) / gr.Count;
                    var m = net.node(v(C.x + Math.Cos(a) * Rr, C.z + Math.Sin(a) * Rr));
                    foreach (var x in gr)
                    {
                        foreach (var e in net.at(x.node).ToList())
                        {
                            if (e.a == x.node) e.a = m.id;
                            if (e.b == x.node) e.b = m.id;
                            e.path = snapEnds(e.path, net.nodes[e.a].p, net.nodes[e.b].p);
                        }
                        net.nodes.Remove(x.node);
                    }
                    net.version++;
                    mouths.Add(new Entry { a = a, node = m.id });
                }
                if (mouths.Count < 2)
                {
                    double a = mouths.Count > 0 ? mouths[0].a + Math.PI : 0;
                    var angs = new List<double> { a }; if (mouths.Count == 0) angs.Add(a + Math.PI);
                    foreach (double x in angs) mouths.Add(new Entry { a = x, node = net.node(v(C.x + Math.Cos(x) * Rr, C.z + Math.Sin(x) * Rr)).id });
                }
                mouths = mouths.Select((m, k) => (m, k)).OrderBy(x => x.m.a).ThenBy(x => x.k).Select(x => x.m).ToList();
                for (int i = 0; i < mouths.Count; i++)
                {
                    var p = mouths[i]; var q = mouths[(i + 1) % mouths.Count];
                    double sweep = q.a - p.a;
                    while (sweep <= 0) sweep += Math.PI * 2;
                    net.addEdge(p.node, q.node, new List<Seg> { Seg.Arc(C, Rr, p.a, sweep) }, ringKind, RING);
                }
            }
        }

        public static (RoadNetwork net, Func<double, double, double> heightAt) buildElevatedNetwork(World w)
        {
            var net = new RoadNetwork(CITY_TYPES);
            bool elev(int c) => c >= 0 && c < N * N && w.roadAlt[c] != 0 && w.altLevel[c] == Level.Elevated;
            List<int> nbs(int c) => Graph.altNeighbours(w, c).Where(elev).ToList();
            (int x, int z)? rampDir(int c) { var n = nbs(c); if (n.Count != 1) return null; return ((n[0] % N) - (c % N), (n[0] / N) - (c / N)); }
            V nodePos(int c) { V p = centre(c); var d = rampDir(c); return d != null ? v(p.x - d.Value.x * CELL / 2.0, p.z - d.Value.z * CELL / 2.0) : p; }
            bool isNode(int c)
            {
                var n = nbs(c);
                if (n.Count != 2) return true;
                int dx1 = (n[0] % N) - (c % N), dy1 = (n[0] / N) - (c / N), dx2 = (n[1] % N) - (c % N), dy2 = (n[1] / N) - (c / N);
                return dx1 != -dx2 || dy1 != -dy2 || w.roadAlt[n[0]] != w.roadAlt[c] || w.roadAlt[n[1]] != w.roadAlt[c];
            }
            var nodeOf = new Dictionary<int, int>();
            int node(int c) { if (!nodeOf.TryGetValue(c, out int id)) { id = net.node(nodePos(c)).id; nodeOf[c] = id; } return id; }
            long key(int a, int b) => a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a;
            var seen = new HashSet<long>();
            for (int c = 0; c < N * N; c++)
            {
                if (!elev(c) || !isNode(c)) continue;
                foreach (int first in nbs(c))
                {
                    if (seen.Contains(key(c, first))) continue;
                    int prev = c, cur = first;
                    seen.Add(key(prev, cur));
                    for (int g = 0; g < N * 2 && !isNode(cur); g++)
                    {
                        int pv = prev;
                        var nx = nbs(cur).Where(n => n != pv).ToList();
                        if (nx.Count == 0) break;
                        prev = cur; cur = nx[0];
                        seen.Add(key(prev, cur));
                    }
                    int a = node(c), b = node(cur);
                    if (a == b) continue;
                    net.addEdge(a, b, new List<Seg> { Seg.Line(net.nodes[a].p, net.nodes[b].p) }, KIND(Math.Min(w.roadAlt[c], w.roadAlt[first])) ?? "avenue");
                }
            }
            net.simplify();
            return (net, (x, z) => deckHeightAt(w, x, z));
        }

        public static double deckHeightAt(World w, double x, double z)
        {
            bool elev(int c) => c >= 0 && c < NN && w.roadAlt[c] != 0 && w.altLevel[c] == Level.Elevated;
            List<int> nbs(int c) => Graph.altNeighbours(w, c).Where(elev).ToList();
            double at(int c)
            {
                var nb = nbs(c);
                int step, from;
                if (nb.Count == 1) { step = 0; from = nb[0]; }
                else
                {
                    int end = -1; foreach (int n in nb) if (nbs(n).Count == 1) { end = n; break; }
                    if (end < 0 || nb.Count != 2) return ELEVATED_Y;
                    step = 1; from = nb.First(n => n != end);
                }
                int dx = (from % N) - (c % N), dz = (from / N) - (c / N);
                double ox = (c % N) * CELL + CELL / 2.0 - dx * CELL / 2.0, oz = (c / N) * CELL + CELL / 2.0 - dz * CELL / 2.0;
                double s = Math.Max(0, Math.Min(1, ((x - ox) * dx + (z - oz) * dz) / CELL));
                return 0.02 + Math.Min(1, (step + s) / 2) * (ELEVATED_Y - 0.02);
            }
            int cx = (int)Math.Floor(x / CELL), cz = (int)Math.Floor(z / CELL);
            if (cx >= 0 && cz >= 0 && cx < N && cz < N && elev(cz * N + cx)) return at(cz * N + cx);
            int best = -1; double bd = double.PositiveInfinity;
            foreach (var (dx, dz) in new[] { (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1) })
            {
                int nx = cx + dx, nz = cz + dz;
                if (nx < 0 || nz < 0 || nx >= N || nz >= N || !elev(nz * N + nx)) continue;
                double px = nx * CELL + CELL / 2.0, pz = nz * CELL + CELL / 2.0, d = (px - x) * (px - x) + (pz - z) * (pz - z);
                if (d < bd) { bd = d; best = nz * N + nx; }
            }
            return best >= 0 ? at(best) : ELEVATED_Y;
        }

        // --------------------------------------------------------------- vehicle heights

        static int rampVer = -1; static byte[] ramps = new byte[NN];
        static bool rampAt(World w, int c)
        {
            if (rampVer != w.ver.roads)
            {
                rampVer = w.ver.roads; ramps = new byte[NN];
                for (int i = 0; i < NN; i++) if (w.roadAlt[i] != 0 && Graph.isRamp(w, i)) ramps[i] = 1;
            }
            return ramps[c] == 1;
        }

        public static double nodeY(World w, int node)
        {
            if (node < NN) return 0.12;
            int c = node - NN;
            bool ramp = rampAt(w, c);
            if (w.altLevel[c] == Level.Elevated) return ramp ? ELEVATED_Y / 2 : ELEVATED_Y + 0.12;
            return ramp ? 0.12 : UNDER_Y;
        }

        public static V nodeCentre(int node, World w)
        {
            int c = node >= NN ? node - NN : node;
            if (w != null && node < NN && w.curves.Count > 0)
            {
                var ci = Curves.curveInfo(w);
                if (ci.owned[c] != 0) return v(ci.px[c], ci.pz[c]);
            }
            return v((c % N) * CELL + CELL / 2.0, (c / N) * CELL + CELL / 2.0);
        }

        static bool isElevatedNode(World w, int node) => node >= NN && w.altLevel[node - NN] == Level.Elevated;

        public static double roadY(World w, int n0, int n1, double f, double x, double z)
        {
            if (isElevatedNode(w, n0) || isElevatedNode(w, n1)) return deckHeightAt(w, x, z) + 0.12;
            return nodeY(w, n0) + (nodeY(w, n1) - nodeY(w, n0)) * f;
        }
    }
}
