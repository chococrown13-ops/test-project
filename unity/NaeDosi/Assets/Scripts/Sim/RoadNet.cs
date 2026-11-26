using System;
using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Geom;

namespace NaeDosi
{
    /// <summary>
    /// A road network as a planar graph, and the geometry to draw it (port of games/shared/roads/network.ts):
    /// widen each road, trim it back from every junction to where its kerbs clear the neighbours', and fill
    /// the junction with one polygon whose corners are rounded kerb curves.
    /// </summary>
    public sealed class RoadType { public double half, kerb; public int lanes; }

    public sealed class RNode { public int id; public V p; }
    public sealed class REdge { public int id, a, b; public List<Seg> path; public string kind; public string tag; }

    public sealed class RoadNetwork
    {
        public readonly Dictionary<string, RoadType> types;
        // Ids only grow and the web game iterates Maps in insertion order, which is id order here.
        public SortedDictionary<int, RNode> nodes = new SortedDictionary<int, RNode>();
        public SortedDictionary<int, REdge> edges = new SortedDictionary<int, REdge>();
        int nid = 1, eid = 1;
        public int version;

        public RoadNetwork(Dictionary<string, RoadType> types) { this.types = types; }

        public RNode node(V p)
        {
            var n = new RNode { id = nid++, p = p };
            nodes[n.id] = n;
            version++;
            return n;
        }

        Dictionary<int, List<REdge>> adj; int adjVer = -1;

        public List<REdge> at(int n)
        {
            if (adj == null || adjVer != version)
            {
                adj = new Dictionary<int, List<REdge>>();
                foreach (var e in edges.Values)
                    foreach (int k in e.a == e.b ? new[] { e.a } : new[] { e.a, e.b })
                    {
                        if (!adj.TryGetValue(k, out var l)) adj[k] = l = new List<REdge>();
                        l.Add(e);
                    }
                adjVer = version;
            }
            return adj.TryGetValue(n, out var r) ? r : new List<REdge>();
        }

        public REdge addEdge(int a, int b, List<Seg> path, string kind, string tag = null)
        {
            var e = new REdge { id = eid++, a = a, b = b, path = path, kind = kind, tag = tag };
            edges[e.id] = e;
            version++;
            return e;
        }

        public V leave(REdge e, int n)
        {
            double L = pathLength(e.path);
            if (e.a == n) return pathAt(e.path, 0).d;
            var d = pathAt(e.path, L).d;
            return v(-d.x, -d.z);
        }

        public List<Seg> pathFrom(REdge e, int n) => e.a == n ? e.path : reversePath(e.path);

        public void simplify()
        {
            bool changed = true;
            while (changed)
            {
                changed = false;
                foreach (var n in nodes.Values.ToList())
                {
                    if (!nodes.ContainsKey(n.id)) continue;
                    var es = at(n.id);
                    if (es.Count != 2 || es[0] == es[1] || es[0].kind != es[1].kind || es[0].tag != es[1].tag) continue;
                    var e1 = es[0]; var e2 = es[1];
                    int o1 = e1.a == n.id ? e1.b : e1.a, o2 = e2.a == n.id ? e2.b : e2.a;
                    if (o1 == o2 || o1 == n.id || o2 == n.id) continue;
                    if (dot(leave(e1, n.id), leave(e2, n.id)) > -0.995) continue;
                    var path = new List<Seg>(reversePath(pathFrom(e1, n.id)));
                    path.AddRange(pathFrom(e2, n.id));
                    edges.Remove(e1.id); edges.Remove(e2.id);
                    nodes.Remove(n.id);
                    edges[eid] = new REdge { id = eid++, a = o1, b = o2, path = path, kind = e1.kind, tag = e1.tag };
                    version++;
                    changed = true;
                }
            }
        }
    }

    public sealed class Ribbon { public int edge; public string kind; public double t0, t1; }
    public sealed class JunctionGeo { public int node; public List<V> ring; public List<List<V>> kerb; }
    public sealed class RoadGeometry { public List<Ribbon> ribbons; public List<JunctionGeo> junctions; public Dictionary<int, double[]> trims; }

    public static class RoadGeom
    {
        struct TP { public double t; public V p; }

        static List<TP> boundary(RoadNetwork net, REdge e, int n, double o, double far)
        {
            var p = net.pathFrom(e, n);
            double L = Math.Min(pathLength(p), far);
            return samplePath(p, 0, L, 1).Select(q => new TP { t = q.t, p = offsetPoint(q, o) }).ToList();
        }

        static bool polyCross(List<TP> a, List<TP> b, out double ta, out double tb)
        {
            ta = tb = 0;
            for (int i = 1; i < a.Count; i++) for (int j = 1; j < b.Count; j++)
                    if (segCross(a[i - 1].p, a[i].p, b[j - 1].p, b[j].p, out var s, out var u, out _))
                    {
                        ta = a[i - 1].t + (a[i].t - a[i - 1].t) * s; tb = b[j - 1].t + (b[j].t - b[j - 1].t) * u;
                        return true;
                    }
            return false;
        }

        public static RoadGeometry buildGeometry(RoadNetwork net)
        {
            var trims = new Dictionary<int, double[]>();
            foreach (var e in net.edges.Values) trims[e.id] = new double[2];
            void setTrim(REdge e, int n, double t) { var tr = trims[e.id]; if (e.a == n) tr[0] = Math.Max(tr[0], t); else tr[1] = Math.Max(tr[1], t); }
            double trimOf(REdge e, int n) => e.a == n ? trims[e.id][0] : trims[e.id][1];
            var junctions = new List<JunctionGeo>();
            var order = new List<(int nid, List<REdge> es)>();
            foreach (var n in net.nodes.Values)
            {
                var es0 = net.at(n.id);
                if (es0.Count < 2) continue;
                // Stable sort by leaving angle, as Array.prototype.sort does.
                var es = es0.Select((e, k) => (e, k, a: Math.Atan2(net.leave(e, n.id).z, net.leave(e, n.id).x))).OrderBy(x => x.a).ThenBy(x => x.k).Select(x => x.e).ToList();
                bool straight = es.Count == 2 && es[0].kind == es[1].kind && dot(net.leave(es[0], n.id), net.leave(es[1], n.id)) < -0.995;
                if (straight) continue;
                order.Add((n.id, es));
                const double far = 60;
                for (int i = 0; i < es.Count; i++)
                {
                    var e1 = es[i]; var e2 = es[(i + 1) % es.Count];
                    if (e1 == e2) continue;
                    var T1 = net.types[e1.kind]; var T2 = net.types[e2.kind];
                    foreach (var (o1, o2) in new[] { (T1.half, T2.half), (T1.half + T1.kerb, T2.half + T2.kerb) })
                    {
                        var b1 = boundary(net, e1, n.id, -o1, far); var b2 = boundary(net, e2, n.id, o2, far);
                        if (polyCross(b1, b2, out var ta, out var tb)) { setTrim(e1, n.id, ta); setTrim(e2, n.id, tb); }
                    }
                }
                bool bend = es.Count == 2;
                foreach (var e in es) setTrim(e, n.id, bend ? 0.5 : net.types[e.kind].half * 0.6 + 1);
            }
            foreach (var e in net.edges.Values)
            {
                double L = pathLength(e.path); var tr = trims[e.id];
                tr[0] = Math.Min(tr[0], L * 0.45); tr[1] = Math.Min(tr[1], L * 0.45);
            }
            foreach (var (nid, es) in order)
            {
                var ring = new List<V>(); var kerb = new List<List<V>>();
                var node = net.nodes[nid];
                for (int i = 0; i < es.Count; i++)
                {
                    var e1 = es[i]; var e2 = es[(i + 1) % es.Count];
                    double h1 = net.types[e1.kind].half, h2 = net.types[e2.kind].half;
                    var p1 = net.pathFrom(e1, nid); var p2 = net.pathFrom(e2, nid);
                    var q1 = pathAt(p1, trimOf(e1, nid)); var q2 = pathAt(p2, trimOf(e2, nid));
                    V l1 = offsetPoint(q1, h1), r1 = offsetPoint(q1, -h1), l2 = offsetPoint(q2, h2);
                    if (i == 0) ring.Add(l1);
                    ring.Add(r1);
                    V ctrl = cornerControl(q1, q2, r1, l2, node.p);
                    var curve = new List<V>();
                    for (int k = 1; k < 8; k++)
                    {
                        double u = k / 8.0, w = 1 - u;
                        curve.Add(v(w * w * r1.x + 2 * w * u * ctrl.x + u * u * l2.x, w * w * r1.z + 2 * w * u * ctrl.z + u * u * l2.z));
                    }
                    var kc = new List<V> { r1 }; kc.AddRange(curve); kc.Add(l2);
                    kerb.Add(kc);
                    ring.AddRange(curve);
                    if (i < es.Count - 1) ring.Add(l2);
                }
                junctions.Add(new JunctionGeo { node = nid, ring = ring, kerb = kerb });
            }
            var ribbons = new List<Ribbon>();
            foreach (var e in net.edges.Values)
            {
                double L = pathLength(e.path); var tr = trims[e.id];
                if (L - tr[0] - tr[1] > 0.05) ribbons.Add(new Ribbon { edge = e.id, kind = e.kind, t0 = tr[0], t1 = L - tr[1] });
            }
            return new RoadGeometry { ribbons = ribbons, junctions = junctions, trims = trims };
        }

        static V cornerControl(PD q1, PD q2, V a, V b, V node)
        {
            V d1 = v(-q1.d.x, -q1.d.z), d2 = v(-q2.d.x, -q2.d.z);
            double den = d1.x * d2.z - d1.z * d2.x;
            if (Math.Abs(den) > 1e-6)
            {
                V w = sub(b, a);
                double s = (w.x * d2.z - w.z * d2.x) / den;
                V p = add(a, mul(d1, s));
                if (s > -0.5 && dist(p, node) < dist(a, node) + dist(b, node)) return p;
            }
            return mul(add(a, b), 0.5);
        }
    }

    /// <summary>Triangulation of a simple polygon by ear clipping (stands in for three.js ShapeUtils.triangulateShape).</summary>
    public static class Earcut
    {
        public static List<int[]> Triangulate(List<V> pts)
        {
            var o = new List<int[]>();
            int n = pts.Count;
            if (n < 3) return o;
            double area = 0;
            for (int i = 0, j = n - 1; i < n; j = i++) area += (pts[j].x - pts[i].x) * (pts[j].z + pts[i].z);
            var idx = new List<int>();
            if (area > 0) for (int i = 0; i < n; i++) idx.Add(i); else for (int i = n - 1; i >= 0; i--) idx.Add(i);
            int guard = 0;
            while (idx.Count > 3 && guard++ < n * n)
            {
                bool cut = false;
                for (int k = 0; k < idx.Count; k++)
                {
                    int a = idx[(k + idx.Count - 1) % idx.Count], b = idx[k], c = idx[(k + 1) % idx.Count];
                    V A = pts[a], B = pts[b], C = pts[c];
                    double cr = (B.x - A.x) * (C.z - A.z) - (B.z - A.z) * (C.x - A.x);
                    if (cr >= -1e-12) continue; // reflex or flat for this winding
                    bool inside = false;
                    foreach (int p in idx)
                    {
                        if (p == a || p == b || p == c) continue;
                        if (PointIn(pts[p], A, B, C)) { inside = true; break; }
                    }
                    if (inside) continue;
                    o.Add(new[] { a, b, c });
                    idx.RemoveAt(k);
                    cut = true;
                    break;
                }
                if (!cut)
                {
                    // Degenerate: fan out what is left.
                    for (int k = 1; k + 1 < idx.Count; k++) o.Add(new[] { idx[0], idx[k], idx[k + 1] });
                    return o;
                }
            }
            if (idx.Count == 3) o.Add(new[] { idx[0], idx[1], idx[2] });
            return o;
        }

        static bool PointIn(V p, V a, V b, V c)
        {
            double d1 = (p.x - b.x) * (a.z - b.z) - (a.x - b.x) * (p.z - b.z);
            double d2 = (p.x - c.x) * (b.z - c.z) - (b.x - c.x) * (p.z - c.z);
            double d3 = (p.x - a.x) * (c.z - a.z) - (c.x - a.x) * (p.z - a.z);
            bool neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
            return !(neg && pos);
        }
    }
}
