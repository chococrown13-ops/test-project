using System;
using System.Collections.Generic;
using UnityEngine;

namespace NaeDosi.Render
{
    /// <summary>
    /// 자유 도로 (experimental): roads off the grid, at any angle and along free curves, the way Cities: Skylines draws them.
    /// Each road is a quadratic Bézier between two nodes; a new road that crosses an old one splits both and makes a junction there.
    /// Two-lane roads with kerbs, centre and edge lines, crossings at junctions, and cars that drive on the right and turn at random.
    /// Not yet tied into the city simulation: buildings don't use these roads. Positions are the web map's metres (x east, z south).
    /// </summary>
    public sealed class FreeRoads
    {
        sealed class Node { public Vector2 p; public readonly List<int> segs = new List<int>(); }
        sealed class Seg { public int a, b; public Vector2 c; public bool alive = true; public float len; }

        const float HALF = 3.6f, WALK = 2.2f, LANE = 1.8f, SNAP = 6f, MINLEN = 8f;
        readonly List<Node> nodes = new List<Node>();
        readonly List<Seg> segs = new List<Seg>();
        readonly Func<double, double, float> height;
        readonly Material mat;
        readonly GameObject go;
        readonly MeshFilter filter;
        Mesh mesh, previewMesh;
        readonly Instances cars;

        public bool curve;
        int stage; Vector2 p0, pc, hover; bool hasHover;
        public bool Empty => nodes.Count == 0;

        public FreeRoads(Shader shader, Func<double, double, float> heightAt, Mesh carMesh, Material carMat)
        {
            height = heightAt;
            mat = new Material(shader) { name = "freeroads" };
            mat.SetFloat("_Mode", 1); mat.SetFloat("_Smooth", 0.1f);
            go = new GameObject("FreeRoads");
            filter = go.AddComponent<MeshFilter>();
            var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = mat; r.receiveShadows = true;
            cars = new Instances(carMesh, carMat);
        }

        // ---------------------------------------------------------------- geometry helpers

        static Vector2 Bez(Vector2 a, Vector2 c, Vector2 b, float t) { float u = 1 - t; return u * u * a + 2 * u * t * c + t * t * b; }
        static Vector2 BezD(Vector2 a, Vector2 c, Vector2 b, float t) => 2 * (1 - t) * (c - a) + 2 * t * (b - c);
        Vector2 P(Seg s, float t) => Bez(nodes[s.a].p, s.c, nodes[s.b].p, t);
        Vector2 D(Seg s, float t) { var d = BezD(nodes[s.a].p, s.c, nodes[s.b].p, t); return d.sqrMagnitude < 1e-6f ? Vector2.right : d.normalized; }
        static Vector2 Right(Vector2 d) => new Vector2(-d.y, d.x);
        Vector3 W(Vector2 p, float lift) => MeshKit.P(p.x, height(p.x, p.y) + lift, p.y);

        static float Length(Vector2 a, Vector2 c, Vector2 b)
        {
            float l = 0; var q = a;
            for (int i = 1; i <= 16; i++) { var n = Bez(a, c, b, i / 16f); l += (n - q).magnitude; q = n; }
            return l;
        }

        /// <summary>Junction radius at a node: roads stop short of it so the crossing area can be filled in.</summary>
        float Radius(int n) => nodes[n].segs.Count >= 3 ? HALF + WALK + 1.5f : 0;

        /// <summary>The t at which the road is `dist` metres from its start (or, from the end, 1 - that).</summary>
        float TAt(Seg s, float dist, bool fromEnd)
        {
            if (dist <= 0) return fromEnd ? 1 : 0;
            float acc = 0; Vector2 q = fromEnd ? P(s, 1) : P(s, 0);
            for (int i = 1; i <= 64; i++)
            {
                float t = fromEnd ? 1 - i / 64f : i / 64f;
                var n = P(s, t); acc += (n - q).magnitude; q = n;
                if (acc >= dist) return t;
            }
            return fromEnd ? 0 : 1;
        }

        // ---------------------------------------------------------------- editing

        public void Hover(double x, double z) { var h = Snapped(new Vector2((float)x, (float)z)); bool moved = (h - hover).sqrMagnitude > 0.04f; hover = h; hasHover = true; if (moved && stage > 0) Preview(); }
        public void Cancel() { stage = 0; Preview(); }

        Vector2 Snapped(Vector2 p)
        {
            foreach (var n in nodes) if (n.segs.Count > 0 && (n.p - p).magnitude < SNAP) return n.p;
            var (si, t, d) = Nearest(p);
            return si >= 0 && d < SNAP * 0.7f ? P(segs[si], t) : p;
        }

        (int seg, float t, float dist) Nearest(Vector2 p)
        {
            int best = -1; float bt = 0, bd = float.MaxValue;
            for (int i = 0; i < segs.Count; i++)
            {
                if (!segs[i].alive) continue;
                for (int k = 0; k <= 40; k++)
                {
                    float t = k / 40f, d = (P(segs[i], t) - p).magnitude;
                    if (d < bd) { bd = d; bt = t; best = i; }
                }
            }
            return (best, bt, bd);
        }

        public void Click(double x, double z)
        {
            var p = Snapped(new Vector2((float)x, (float)z));
            if (stage == 0) { p0 = p; stage = 1; }
            else if (stage == 1 && curve) { pc = p; stage = 2; }
            else
            {
                var c = stage == 2 ? pc : (p0 + p) / 2;
                if ((p - p0).magnitude >= MINLEN) { Add(p0, c, p); p0 = p; }
                stage = 1;
            }
            Preview();
        }

        public void Clear() { nodes.Clear(); segs.Clear(); carsList.Clear(); stage = 0; Rebuild(); Preview(); }

        int NodeAt(Vector2 p)
        {
            for (int i = 0; i < nodes.Count; i++) if (nodes[i].segs.Count > 0 && (nodes[i].p - p).magnitude < 0.5f) return i;
            var (si, t, d) = Nearest(p);
            if (si >= 0 && d < 1f && t > 0.02f && t < 0.98f) return Split(si, t);
            nodes.Add(new Node { p = p });
            return nodes.Count - 1;
        }

        int Split(int si, float t)
        {
            var s = segs[si];
            Vector2 a = nodes[s.a].p, b = nodes[s.b].p, m = P(s, t);
            nodes.Add(new Node { p = m }); int mi = nodes.Count - 1;
            Kill(si);
            Link(s.a, mi, Vector2.Lerp(a, s.c, t));
            Link(mi, s.b, Vector2.Lerp(s.c, b, t));
            return mi;
        }

        void Kill(int si) { var s = segs[si]; s.alive = false; nodes[s.a].segs.Remove(si); nodes[s.b].segs.Remove(si); }

        void Link(int a, int b, Vector2 c)
        {
            if (a == b) return;
            var s = new Seg { a = a, b = b, c = c };
            s.len = Length(nodes[a].p, c, nodes[b].p);
            segs.Add(s);
            nodes[a].segs.Add(segs.Count - 1); nodes[b].segs.Add(segs.Count - 1);
        }

        /// <summary>A new road from a to b bending toward c: crossings with existing roads become junctions.</summary>
        void Add(Vector2 a, Vector2 c, Vector2 b)
        {
            // Where does the new curve cross the old roads? (both sampled as polylines)
            var cuts = new List<(float tNew, int seg, float tOld)>();
            const int K = 32;
            for (int si = 0; si < segs.Count; si++)
            {
                if (!segs[si].alive) continue;
                for (int i = 0; i < K; i++)
                {
                    Vector2 n0 = Bez(a, c, b, i / (float)K), n1 = Bez(a, c, b, (i + 1) / (float)K);
                    for (int j = 0; j < K; j++)
                    {
                        Vector2 o0 = P(segs[si], j / (float)K), o1 = P(segs[si], (j + 1) / (float)K);
                        if (Cross(n0, n1, o0, o1, out float u, out float v))
                        {
                            float tn = (i + u) / K, to = (j + v) / K;
                            var hit = Bez(a, c, b, tn);
                            if ((hit - a).magnitude < 4 || (hit - b).magnitude < 4) continue;
                            cuts.Add((tn, si, to));
                        }
                    }
                }
            }
            cuts.Sort((x, y) => x.tNew.CompareTo(y.tNew));
            int start = NodeAt(a);
            float tPrev = 0; Vector2 ca = a, cc = c;
            foreach (var cut in cuts)
            {
                if (!segs[cut.seg].alive) continue;
                int mid = Split(cut.seg, cut.tOld);
                // Split the remaining new curve at the crossing (de Casteljau, re-parameterised).
                float t = (cut.tNew - tPrev) / (1 - tPrev);
                Link(start, mid, Vector2.Lerp(ca, cc, t));
                ca = nodes[mid].p; cc = Vector2.Lerp(cc, b, t);
                start = mid; tPrev = cut.tNew;
            }
            int end = NodeAt(b);
            Link(start, end, cc);
            Rebuild();
            SpawnCars();
        }

        static bool Cross(Vector2 p, Vector2 p2, Vector2 q, Vector2 q2, out float t, out float u)
        {
            Vector2 r = p2 - p, s = q2 - q;
            float den = r.x * s.y - r.y * s.x;
            t = u = 0;
            if (Mathf.Abs(den) < 1e-6f) return false;
            Vector2 qp = q - p;
            t = (qp.x * s.y - qp.y * s.x) / den;
            u = (qp.x * r.y - qp.y * r.x) / den;
            return t >= 0 && t < 1 && u >= 0 && u < 1;
        }

        // ---------------------------------------------------------------- meshes

        readonly List<Vector3> v = new List<Vector3>();
        readonly List<Color> col = new List<Color>();
        static readonly Color ASPHALT = new Color(0.045f, 0.048f, 0.052f), KERB = new Color(0.52f, 0.5f, 0.47f), WALKC = new Color(0.6f, 0.58f, 0.55f),
            YELLOW = new Color(0.85f, 0.6f, 0.05f), WHITE = new Color(0.86f, 0.86f, 0.84f);

        void Tri(Vector3 a, Vector3 b, Vector3 c, Color k)
        {
            if (Vector3.Cross(b - a, c - a).y < 0) { var t = b; b = c; c = t; }
            v.Add(a); v.Add(b); v.Add(c); col.Add(k); col.Add(k); col.Add(k);
        }
        void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Color k) { Tri(a, b, c, k); Tri(a, c, d, k); }
        /// <summary>A vertical face (kerb side): no flipping to face up.</summary>
        void Wall(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Color k) { v.Add(a); v.Add(b); v.Add(c); v.Add(a); v.Add(c); v.Add(d); for (int i = 0; i < 6; i++) col.Add(k); }

        /// <summary>A strip running beside the road's centre line from offset o0 to o1, between t0 and t1.</summary>
        void Strip(Seg s, float t0, float t1, float o0, float o1, float lift, Color k, float dash = 0)
        {
            int n = Mathf.Max(2, Mathf.CeilToInt(s.len * (t1 - t0) / 2f));
            for (int i = 0; i < n; i++)
            {
                float ta = Mathf.Lerp(t0, t1, i / (float)n), tb = Mathf.Lerp(t0, t1, (i + 1) / (float)n);
                if (dash > 0 && (i % 2) == 1) continue;
                Vector2 pa = P(s, ta), pb = P(s, tb), ra = Right(D(s, ta)), rb = Right(D(s, tb));
                Quad(W(pa + ra * o0, lift), W(pb + rb * o0, lift), W(pb + rb * o1, lift), W(pa + ra * o1, lift), k);
            }
        }

        void Rebuild()
        {
            v.Clear(); col.Clear();
            foreach (var s in segs)
            {
                if (!s.alive) continue;
                float t0 = TAt(s, Radius(s.a), false), t1 = TAt(s, Radius(s.b), true);
                if (t1 <= t0) continue;
                Strip(s, t0, t1, -HALF, HALF, 0.2f, ASPHALT);
                // Kerbs and pavements, raised a little.
                Strip(s, t0, t1, HALF, HALF + WALK, 0.35f, WALKC); Strip(s, t0, t1, -HALF - WALK, -HALF, 0.35f, WALKC);
                Strip(s, t0, t1, HALF, HALF + 0.25f, 0.36f, KERB); Strip(s, t0, t1, -HALF - 0.25f, -HALF, 0.36f, KERB);
                // Double yellow centre line, white edge lines.
                Strip(s, t0, t1, -0.22f, -0.1f, 0.22f, YELLOW); Strip(s, t0, t1, 0.1f, 0.22f, 0.22f, YELLOW);
                Strip(s, t0, t1, HALF - 0.45f, HALF - 0.3f, 0.22f, WHITE); Strip(s, t0, t1, -HALF + 0.3f, -HALF + 0.45f, 0.22f, WHITE);
                // Crossings at junction ends.
                foreach (var (node, atEnd) in new[] { (s.a, false), (s.b, true) })
                {
                    if (Radius(node) <= 0) continue;
                    float tc = atEnd ? t1 : t0, dir = atEnd ? -1 : 1;
                    float tz = TAt(s, Radius(node) + 3.2f, atEnd);
                    for (float o = -HALF + 0.4f; o < HALF - 0.3f; o += 0.9f)
                        Strip(s, Mathf.Min(tc, tz), Mathf.Max(tc, tz), o, o + 0.45f, 0.22f, WHITE);
                    _ = dir;
                }
            }
            // Junctions: an asphalt fan through the road ends, ordered round the node; degree-2 bends and dead ends get a round patch.
            for (int ni = 0; ni < nodes.Count; ni++)
            {
                var nd = nodes[ni];
                if (nd.segs.Count == 0) continue;
                var ring = new List<Vector2>();
                if (nd.segs.Count >= 3)
                {
                    foreach (int si in nd.segs)
                    {
                        var s = segs[si]; bool atA = s.a == ni;
                        float t = atA ? TAt(s, Radius(ni), false) : TAt(s, Radius(ni), true);
                        Vector2 p = P(s, t), r = Right(D(s, t));
                        ring.Add(p + r * (HALF + WALK)); ring.Add(p - r * (HALF + WALK));
                    }
                }
                else for (int k = 0; k < 16; k++) { float a = k * Mathf.PI * 2 / 16; ring.Add(nd.p + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * HALF); }
                ring.Sort((x, y) => Mathf.Atan2(x.y - nd.p.y, x.x - nd.p.x).CompareTo(Mathf.Atan2(y.y - nd.p.y, y.x - nd.p.x)));
                for (int k = 0; k < ring.Count; k++) Tri(W(nd.p, 0.19f), W(ring[k], 0.19f), W(ring[(k + 1) % ring.Count], 0.19f), ASPHALT);
            }
            if (mesh == null) { mesh = new Mesh { name = "freeroads", indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 }; mesh.MarkDynamic(); }
            mesh.Clear();
            if (v.Count > 0)
            {
                mesh.SetVertices(v); mesh.SetColors(col);
                var idx = new int[v.Count]; for (int i = 0; i < idx.Length; i++) idx[i] = i;
                mesh.SetTriangles(idx, 0); mesh.RecalculateNormals(); mesh.RecalculateBounds();
            }
            filter.sharedMesh = mesh;
            lanesDirty = true;
        }

        void Preview()
        {
            if (previewMesh == null) previewMesh = new Mesh { name = "freeroad-preview" };
            previewMesh.Clear();
            if (stage == 0 || !hasHover) return;
            v.Clear(); col.Clear();
            Vector2 a = p0, b = hover, c = stage == 2 ? pc : curve ? hover : (a + b) / 2;
            var tmp = new Seg { c = c };
            nodes.Add(new Node { p = a }); nodes.Add(new Node { p = b });
            tmp.a = nodes.Count - 2; tmp.b = nodes.Count - 1; tmp.len = Length(a, c, b);
            if (tmp.len > 1) { Strip(tmp, 0, 1, -HALF - WALK, HALF + WALK, 0.6f, new Color(1, 1, 1)); }
            nodes.RemoveRange(nodes.Count - 2, 2);
            if (v.Count > 0)
            {
                previewMesh.SetVertices(v); previewMesh.SetColors(col);
                var idx = new int[v.Count]; for (int i = 0; i < idx.Length; i++) idx[i] = i;
                previewMesh.SetTriangles(idx, 0); previewMesh.RecalculateNormals();
            }
        }

        // ---------------------------------------------------------------- cars

        sealed class Car { public List<Vector2> path = new List<Vector2>(); public float d, speed; public int seg; public bool fwd; public Color c; public Vector2 pos, dir; }
        readonly List<Car> carsList = new List<Car>();
        readonly System.Random rng = new System.Random(5);
        bool lanesDirty;
        static readonly Color[] CAR_C = { new Color(0.9f, 0.9f, 0.88f), new Color(0.02f, 0.02f, 0.025f), new Color(0.45f, 0.47f, 0.5f), new Color(0.2f, 0.21f, 0.23f), new Color(0.03f, 0.08f, 0.3f), new Color(0.35f, 0.02f, 0.02f) };

        /// <summary>The right-hand lane of a road, start to end in the direction of travel, trimmed clear of junctions.</summary>
        List<Vector2> Lane(int si, bool fwd)
        {
            var s = segs[si];
            float t0 = TAt(s, Radius(s.a), false), t1 = TAt(s, Radius(s.b), true);
            var o = new List<Vector2>();
            int n = Mathf.Max(2, Mathf.CeilToInt(s.len / 3f));
            for (int i = 0; i <= n; i++)
            {
                float t = fwd ? Mathf.Lerp(t0, t1, i / (float)n) : Mathf.Lerp(t1, t0, i / (float)n);
                var d = D(s, t) * (fwd ? 1 : -1);
                o.Add(P(s, t) + Right(d) * LANE);
            }
            return o;
        }

        void SpawnCars()
        {
            float total = 0; foreach (var s in segs) if (s.alive) total += s.len;
            int want = Mathf.Min(160, (int)(total / 30));
            var live = new List<int>(); for (int i = 0; i < segs.Count; i++) if (segs[i].alive) live.Add(i);
            if (live.Count == 0) return;
            while (carsList.Count < want)
            {
                int si = live[rng.Next(live.Count)]; bool fwd = rng.Next(2) == 0;
                var car = new Car { seg = si, fwd = fwd, speed = 8, c = CAR_C[rng.Next(CAR_C.Length)] };
                car.path.AddRange(Lane(si, fwd));
                car.d = (float)rng.NextDouble() * PathLen(car.path) * 0.8f;
                carsList.Add(car);
            }
        }

        static float PathLen(List<Vector2> p) { float l = 0; for (int i = 1; i < p.Count; i++) l += (p[i] - p[i - 1]).magnitude; return l; }

        static bool At(List<Vector2> p, float d, out Vector2 pos, out Vector2 dir)
        {
            for (int i = 1; i < p.Count; i++)
            {
                float l = (p[i] - p[i - 1]).magnitude;
                if (d <= l || i == p.Count - 1) { float f = l > 1e-4f ? Mathf.Clamp01(d / l) : 0; pos = Vector2.Lerp(p[i - 1], p[i], f); dir = l > 1e-4f ? (p[i] - p[i - 1]) / l : Vector2.right; return d <= l; }
                d -= l;
            }
            pos = p.Count > 0 ? p[p.Count - 1] : Vector2.zero; dir = Vector2.right; return false;
        }

        /// <summary>At the end of its lane a car picks a road out of the junction (not straight back, unless it's a dead end) and turns onto it.</summary>
        void NextRoad(Car car)
        {
            var s = segs[car.seg];
            int node = car.fwd ? s.b : s.a;
            var outs = new List<(int si, bool fwd)>();
            foreach (int si in nodes[node].segs) if (si != car.seg) outs.Add((si, segs[si].a == node));
            if (outs.Count == 0) outs.Add((car.seg, !car.fwd));
            var pick = outs[rng.Next(outs.Count)];
            var next = Lane(pick.si, pick.fwd);
            Vector2 from = car.path[car.path.Count - 1], to = next[0], ctl = nodes[node].p;
            if (outs.Count == 1 && pick.si == car.seg) ctl = nodes[node].p + (from - nodes[node].p) * 0.2f + D(s, car.fwd ? 1 : 0) * (car.fwd ? 6 : -6);
            car.path.Clear();
            for (int i = 0; i <= 8; i++) car.path.Add(Bez(from, ctl, to, i / 8f));
            car.path.AddRange(next);
            car.seg = pick.si; car.fwd = pick.fwd; car.d = 0;
        }

        public void Update(float dt)
        {
            if (lanesDirty)
            {
                lanesDirty = false;
                // Roads changed: put every car back on a live lane.
                foreach (var car in carsList)
                {
                    if (car.seg < segs.Count && segs[car.seg].alive) { float keep = car.d; var lane = Lane(car.seg, car.fwd); car.path.Clear(); car.path.AddRange(lane); car.d = Mathf.Min(keep, PathLen(lane) * 0.5f); }
                    else
                    {
                        var live = new List<int>(); for (int i = 0; i < segs.Count; i++) if (segs[i].alive) live.Add(i);
                        if (live.Count == 0) continue;
                        car.seg = live[rng.Next(live.Count)]; car.fwd = rng.Next(2) == 0; car.path.Clear(); car.path.AddRange(Lane(car.seg, car.fwd)); car.d = 0;
                    }
                }
            }
            dt = Mathf.Min(dt, 0.1f);
            foreach (var car in carsList) At(car.path, car.d, out car.pos, out car.dir);
            foreach (var car in carsList)
            {
                // Keep a gap to whoever is just ahead on much the same heading.
                float gap = 99;
                foreach (var o in carsList)
                {
                    if (o == car) continue;
                    var rel = o.pos - car.pos; float ahead = Vector2.Dot(rel, car.dir);
                    if (ahead <= 0 || ahead > 25) continue;
                    if (Mathf.Abs(Vector2.Dot(rel, Right(car.dir))) > 1.6f) continue;
                    gap = Mathf.Min(gap, ahead);
                }
                float want = gap < 7 ? 0 : gap < 18 ? 13.9f * (gap - 7) / 11 : 13.9f;
                car.speed = Mathf.MoveTowards(car.speed, want, (want < car.speed ? 9f : 3f) * dt);
                car.d += car.speed * dt;
                if (car.d >= PathLen(car.path)) NextRoad(car);
            }
            var m = new List<Matrix4x4>(); var cs = new List<Color>();
            foreach (var car in carsList)
            {
                At(car.path, car.d, out var p, out var d);
                var dir = new Vector3(d.x, 0, -d.y);
                if (dir.sqrMagnitude < 1e-6f) dir = Vector3.right;
                m.Add(Matrix4x4.TRS(W(p, 0.2f), Quaternion.LookRotation(dir, Vector3.up) * Quaternion.Euler(0, -90, 0), Vector3.one));
                cs.Add(car.c);
            }
            cars.Set(m, cs);
        }

        public void Draw()
        {
            cars.Draw();
            if (previewMesh != null && previewMesh.vertexCount > 0)
                Graphics.RenderMesh(new RenderParams(mat) { worldBounds = new Bounds(Vector3.zero, Vector3.one * 100000) }, previewMesh, 0, Matrix4x4.identity);
        }

        public void Destroy() { UnityEngine.Object.Destroy(go); }
    }
}
