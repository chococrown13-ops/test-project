using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using static NaeDosi.Defs;

namespace NaeDosi.Render
{
    /// <summary>
    /// Draws every building's parts (BuildingParts) as a few merged meshes: walls through the facade shader,
    /// roofs and tanks flat-shaded, the cooling tower smooth, neon crosses glowing (drawing half of render/buildings.ts).
    /// New buildings rise out of the ground over 1.4 s in a small mesh of their own.
    /// </summary>
    public sealed class BuildingView
    {
        public readonly GameObject root;
        public Func<double, double, float> heightAt = (x, z) => 0;
        readonly Material boxMat, plainMat, coneMat, vaultMat, neonMat;
        readonly Layer still, rising;
        readonly Dictionary<int, double> born = new Dictionary<int, double>();
        readonly Dictionary<int, (string key, List<Part> parts)> cache = new Dictionary<int, (string, List<Part>)>();
        bool first = true;
        string ver = "", pocketKey = "", infoKey = "";
        List<Part> pocketParts = new List<Part>();
        bool animating;
        public Action<Building> onBorn;

        sealed class Layer
        {
            public readonly Dictionary<string, Batch> batches = new Dictionary<string, Batch>();
        }
        sealed class Batch
        {
            public GameObject go; public Mesh mesh;
            public readonly List<Vector3> v = new List<Vector3>(), n = new List<Vector3>();
            public readonly List<Color> c = new List<Color>();
            public readonly List<Vector4> u1 = new List<Vector4>(), u2 = new List<Vector4>(), u3 = new List<Vector4>();
            public void Clear() { v.Clear(); n.Clear(); c.Clear(); u1.Clear(); u2.Clear(); u3.Clear(); }
        }

        public BuildingView(Transform parent, Shader shader)
        {
            root = new GameObject("Buildings");
            root.transform.SetParent(parent, false);
            Material M(string name, int mode, float smooth, float metal = 0, int cull = 2)
            {
                var m = new Material(shader) { name = name };
                m.SetFloat("_Mode", mode); m.SetFloat("_Smooth", smooth); m.SetFloat("_Metal", metal); m.SetFloat("_Cull", cull);
                return m;
            }
            boxMat = M("walls", 2, 0.15f);
            plainMat = M("plain", 1, 0.2f);
            coneMat = M("cone", 1, 0.1f, 0, 0);
            vaultMat = M("vault", 1, 0.8f, 0.1f, 0);
            neonMat = M("neon", 1, 0.3f);
            still = new Layer(); rising = new Layer();
        }

        string MatKey(string shape) => shape == "box" ? "box" : shape == "cone" ? "cone" : shape == "vault" ? "vault" : shape == "neon" ? "neon" : "plain";
        Material MatOf(string key) => key == "box" ? boxMat : key == "cone" ? coneMat : key == "vault" ? vaultMat : key == "neon" ? neonMat : plainMat;

        static double Now => Time.realtimeSinceStartupAsDouble;

        /// <summary>Rebuild the meshes when buildings change, and the rising ones every frame.</summary>
        /// <summary>실사 swaps the lot trees for lumpier crowns (rebuilds the batches when it changes).</summary>
        public static bool Real;

        public void Update(World w, float night)
        {
            neonMat.SetColor("_Emit", MeshKit.Lin("#ff2a1f") * (0.25f + night * 3f));
            double now = Now;
            string v = $"{w.ver.buildings}:{w.ver.roads}:{w.ver.zones}:{Real}";
            // Power and abandonment light or darken windows without a version change.
            long ik = 17;
            foreach (var b in w.buildings.Values) ik = ik * 31 + (b.powered ? 1 : 0) * 2 + (b.abandoned ? 1 : 0) + b.id * 7;
            string info = ik.ToString();
            bool changed = v != ver || info != infoKey;
            if (!changed && !animating) return;
            ver = v; infoKey = info;

            var all = new List<(Building b, List<Part> ps)>();
            var live = new HashSet<int>();
            foreach (var b in w.buildings.Values)
            {
                live.Add(b.id);
                if (!born.ContainsKey(b.id)) { born[b.id] = first ? -99 : now; if (!first) onBorn?.Invoke(b); }
                string key = $"{b.kind}:{b.floors}:{w.ver.roads}";
                if (!cache.TryGetValue(b.id, out var e) || e.key != key) { e = (key, BuildingParts.parts(b, w)); cache[b.id] = e; }
                all.Add((b, e.parts));
            }
            var gone = new List<int>();
            foreach (var id in born.Keys) if (!live.Contains(id)) gone.Add(id);
            foreach (var id in gone) { born.Remove(id); cache.Remove(id); }
            string pk = $"{w.ver.roads}:{w.ver.zones}:{w.ver.buildings}";
            if (pk != pocketKey)
            {
                pocketKey = pk;
                pocketParts = new List<Part>();
                foreach (int i in Pockets.pockets(w)) pocketParts.AddRange(BuildingParts.pocketParts(i));
            }
            first = false;

            bool wasAnimating = animating;
            animating = false;
            bool anySettled = false;
            foreach (var (b, _) in all) { double age = now - born[b.id]; if (age < 1.4) animating = true; else if (age < 1.4 + 0.5 && wasAnimating) anySettled = true; }
            // The still layer changes with the city, and whenever a building finishes rising.
            if (changed || anySettled || (wasAnimating && !animating))
            {
                foreach (var bt in still.batches.Values) bt.Clear();
                foreach (var (b, ps) in all) if (now - born[b.id] >= 1.4) Emit(still, b, ps, 1, w);
                var pocket = new Building { id = -1, kind = "park", size = 1, powered = true, watered = true };
                Emit(still, pocket, pocketParts, 1, w);
                Flush(still, "still");
            }
            foreach (var bt in rising.batches.Values) bt.Clear();
            foreach (var (b, ps) in all)
            {
                double age = now - born[b.id];
                if (age >= 1.4) continue;
                double g = Math.Max(0.02, 1 - Math.Pow(1 - age / 1.4, 3));
                Emit(rising, b, ps, g, w);
            }
            Flush(rising, "rising");
        }

        void Emit(Layer L, Building b, List<Part> ps, double g, World w)
        {
            double bas = b.kind == "tower" ? heightAt(b.x * CELL + CELL / 2.0, b.y * CELL + CELL / 2.0) : 0;
            if (b.id >= 0) ps = ClampRoof(ps);
            if (Real && b.id >= 0) ps = WithLedges(WithRoofKit(b, ps));
            foreach (var p in ps)
            {
                string mk = MatKey(p.shape);
                if (!L.batches.TryGetValue(mk, out var bt)) { bt = new Batch(); L.batches[mk] = bt; }
                Geo.Add(bt, p, b, g, bas);
            }
        }

        static Part Copy(Part p) => new Part { shape = p.shape, x = p.x, y = p.y, z = p.z, sx = p.sx, sy = p.sy, sz = p.sz, rot = p.rot, color = p.color, style = p.style, sign = p.sign };

        /// <summary>The tallest flat roof (the widest box with nothing pitched on it), or null.</summary>
        static Part FlatTop(List<Part> ps)
        {
            Part top = null;
            foreach (var p in ps) if (p.shape == "box" && p.sx >= 4 && p.sz >= 4 && (top == null || p.y + p.sy > top.y + top.sy)) top = p;
            if (top == null) return null;
            foreach (var p in ps) if (p != top && (p.shape == "gable" || p.shape == "hip" || p.shape == "hanok" || p.shape == "prism" || p.shape == "vault") && p.y + p.sy > top.y + top.sy - 0.1) return null;
            return top;
        }

        /// <summary>
        /// Things standing on a flat roof (tanks, jars, stair huts) are pulled back inside its edge, so none hangs over the side.
        /// Done on copies: the parts list is cached per building.
        /// </summary>
        static List<Part> ClampRoof(List<Part> ps)
        {
            var top = FlatTop(ps);
            if (top == null) return ps;
            double cs = Math.Cos(top.rot), ss = Math.Sin(top.rot), ry = top.y + top.sy, hx = top.sx / 2 - 0.3, hz = top.sz / 2 - 0.3;
            List<Part> o = null;
            for (int k = 0; k < ps.Count; k++)
            {
                var p = ps[k];
                if (p == top || p.shape == "tree" || p.shape == "neon" || p.y < ry - 0.15 || p.y > ry + 3) continue;
                double dx = p.x - top.x, dz = p.z - top.z, lx = dx * cs - dz * ss, lz = dx * ss + dz * cs;
                double ex = Math.Max(p.sx, p.sz) / 2, ez = ex;
                if (Math.Abs(Math.Sin(p.rot - top.rot)) < 0.01) { ex = p.sx / 2; ez = p.sz / 2; }
                double nx = ex >= hx ? 0 : Math.Max(-hx + ex, Math.Min(hx - ex, lx)), nz = ez >= hz ? 0 : Math.Max(-hz + ez, Math.Min(hz - ez, lz));
                if (Math.Abs(nx - lx) < 1e-3 && Math.Abs(nz - lz) < 1e-3) continue;
                o ??= new List<Part>(ps);
                var c = Copy(p); c.x = top.x + nx * cs + nz * ss; c.z = top.z - nx * ss + nz * cs;
                o[k] = c;
            }
            return o ?? ps;
        }

        /// <summary>
        /// 실사: the tallest flat roof gets what real roofs carry: a low parapet round the edge, air-conditioner units, a stair hut
        /// and a water tank on taller blocks unless it already has them. Nothing new goes where something already stands, nor
        /// over the edge. Placed the same way every time from the building's id.
        /// </summary>
        static List<Part> WithRoofKit(Building b, List<Part> ps)
        {
            var top = FlatTop(ps);
            if (top == null) return ps;
            var o = new List<Part>(ps);
            double cs = Math.Cos(top.rot), ss = Math.Sin(top.rot), y = top.y + top.sy;
            double hx = top.sx / 2, hz = top.sz / 2, t = 0.18;
            var rng = new System.Random(b.id * 7919 + 1);
            // What already stands on the roof, as rectangles in the roof's own frame.
            var taken = new List<(double x, double z, double ex, double ez)>();
            bool hasTank = false, hasHut = false;
            foreach (var p in ps)
            {
                if (p == top || p.shape == "tree" || p.y < y - 0.15 || p.y > y + 3) continue;
                double dx = p.x - top.x, dz = p.z - top.z;
                double e = Math.Max(p.sx, p.sz) / 2;
                taken.Add((dx * cs - dz * ss, dx * ss + dz * cs, e, e));
                if (p.shape == "cyl") hasTank = true;
                if (p.shape == "box" && p.sx * p.sz >= 2.5) hasHut = true;
            }
            bool Free(double lx, double lz, double ex, double ez)
            {
                if (Math.Abs(lx) + ex > hx - t - 0.25 || Math.Abs(lz) + ez > hz - t - 0.25) return false;
                foreach (var r in taken) if (Math.Abs(lx - r.x) < ex + r.ex + 0.25 && Math.Abs(lz - r.z) < ez + r.ez + 0.25) return false;
                return true;
            }
            void put(string shape, double lx, double lz, double sx, double sy, double sz, string colour)
            {
                o.Add(new Part { shape = shape, x = top.x + lx * cs + lz * ss, y = y, z = top.z - lx * ss + lz * cs, sx = sx, sy = sy, sz = sz, rot = top.rot, color = colour, style = 5 });
                taken.Add((lx, lz, sx / 2, sz / 2));
            }
            // Parapet (it runs along the edge, so it isn't checked against the rest).
            o.Add(new Part { shape = "box", x = top.x + (hz - t / 2) * ss, y = y, z = top.z + (hz - t / 2) * cs, sx = top.sx, sy = 0.5, sz = t, rot = top.rot, color = top.color, style = 5 });
            o.Add(new Part { shape = "box", x = top.x - (hz - t / 2) * ss, y = y, z = top.z - (hz - t / 2) * cs, sx = top.sx, sy = 0.5, sz = t, rot = top.rot, color = top.color, style = 5 });
            o.Add(new Part { shape = "box", x = top.x + (hx - t / 2) * cs, y = y, z = top.z - (hx - t / 2) * ss, sx = t, sy = 0.5, sz = top.sz - 2 * t, rot = top.rot, color = top.color, style = 5 });
            o.Add(new Part { shape = "box", x = top.x - (hx - t / 2) * cs, y = y, z = top.z + (hx - t / 2) * ss, sx = t, sy = 0.5, sz = top.sz - 2 * t, rot = top.rot, color = top.color, style = 5 });
            if (top.sy > 7 && !hasHut && Free(hx - 1.6, -hz + 1.5, 1.1, 1.0)) put("box", hx - 1.6, -hz + 1.5, 2.2, 2.4, 2.0, top.color);
            if (top.sy > 12 && !hasTank && Free(-hx + 1.6, hz - 1.6, 0.9, 0.9)) put("cyl", -hx + 1.6, hz - 1.6, 1.8, 1.6, 1.8, rng.NextDouble() < 0.5 ? "#4f86c6" : "#d4d7da"); // FRP tanks, often blue
            int units = Math.Min(6, 1 + (int)(top.sx * top.sz / 40));
            for (int i = 0, tries = 0; i < units && tries < 40; tries++)
            {
                double lx = (rng.NextDouble() - 0.5) * (top.sx - 2.4), lz = (rng.NextDouble() - 0.5) * (top.sz - 2.4);
                if (!Free(lx, lz, 0.5, 0.4)) continue;
                put("box", lx, lz, 1.0, 0.7, 0.75, "#b9bdc1");
                i++;
            }
            return o;
        }

        /// <summary>실사: apartment blocks get a real slab at every floor on their long faces, so balconies stand out in 3D.</summary>
        static List<Part> WithLedges(List<Part> ps)
        {
            List<Part> o = null;
            foreach (var p in ps)
            {
                if (p.shape != "box" || (p.style != BuildingParts.S_APT && p.style != BuildingParts.S_SLAB) || p.sy < 6 || p.sx < 4) continue;
                o ??= new List<Part>(ps);
                double cs = Math.Cos(p.rot), ss = Math.Sin(p.rot), d = p.style == BuildingParts.S_SLAB ? 0.55 : 0.35;
                foreach (int side in new[] { -1, 1 })
                {
                    double lz = side * (p.sz / 2 + d / 2);
                    for (double y = p.y + 3; y < p.y + p.sy - 1; y += 3)
                        o.Add(new Part { shape = "box", x = p.x + lz * ss, y = y - 0.12, z = p.z + lz * cs, sx = p.sx - 0.4, sy = 0.14, sz = d, rot = p.rot, color = "#d9d6cf", style = BuildingParts.S_PLAIN });
                }
            }
            return o ?? ps;
        }

        void Flush(Layer L, string name)
        {
            foreach (var kv in L.batches)
            {
                var bt = kv.Value;
                if (bt.mesh == null)
                {
                    bt.mesh = new Mesh { name = name + "-" + kv.Key, indexFormat = IndexFormat.UInt32 };
                    bt.mesh.MarkDynamic();
                    bt.go = new GameObject(name + "-" + kv.Key);
                    bt.go.transform.SetParent(root.transform, false);
                    bt.go.AddComponent<MeshFilter>().sharedMesh = bt.mesh;
                    var r = bt.go.AddComponent<MeshRenderer>();
                    r.sharedMaterial = MatOf(kv.Key);
                    r.shadowCastingMode = kv.Key == "neon" ? ShadowCastingMode.Off : ShadowCastingMode.On;
                }
                var m = bt.mesh;
                m.Clear();
                m.SetVertices(bt.v); m.SetNormals(bt.n); m.SetColors(bt.c);
                if (kv.Key == "box") { m.SetUVs(1, bt.u1); m.SetUVs(2, bt.u2); m.SetUVs(3, bt.u3); }
                var idx = new int[bt.v.Count];
                for (int i = 0; i < idx.Length; i++) idx[i] = i;
                m.SetIndices(idx, MeshTopology.Triangles, 0);
                m.RecalculateBounds();
                bt.go.SetActive(bt.v.Count > 0);
            }
        }

        /// <summary>Unit shapes in the web's frame (three.js geometry), placed per part and mirrored into Unity.</summary>
        static class Geo
        {
            // Each shape: triangles as (a, b, c) web-space points on a unit footprint, base at y 0, counter-clockwise from outside.
            static readonly Dictionary<string, Vector3[]> SH = new Dictionary<string, Vector3[]>();
            static readonly Dictionary<string, Vector3[]> SN = new Dictionary<string, Vector3[]>(); // smooth normals, when the shape has them

            static Geo()
            {
                SH["box"] = Box(); SH["neon"] = SH["box"];
                SH["prism"] = Flat(new float[] {
                    -0.5f, 0, 0.5f, 0.5f, 0, 0.5f, 0.5f, 1, 0.5f, -0.5f, 0, 0.5f, 0.5f, 1, 0.5f, -0.5f, 1, 0.5f,
                    -0.5f, 0, -0.5f, -0.5f, 1, 0.5f, 0.5f, 1, 0.5f, -0.5f, 0, -0.5f, 0.5f, 1, 0.5f, 0.5f, 0, -0.5f,
                    0.5f, 0, -0.5f, 0.5f, 1, 0.5f, 0.5f, 0, 0.5f,
                    -0.5f, 0, -0.5f, -0.5f, 0, 0.5f, -0.5f, 1, 0.5f });
                SH["gable"] = Flat(new float[] {
                    -0.5f, 0, 0.5f, 0.5f, 0, 0.5f, 0.5f, 1, 0, -0.5f, 0, 0.5f, 0.5f, 1, 0, -0.5f, 1, 0,
                    0.5f, 0, -0.5f, -0.5f, 0, -0.5f, -0.5f, 1, 0, 0.5f, 0, -0.5f, -0.5f, 1, 0, 0.5f, 1, 0,
                    0.5f, 0, 0.5f, 0.5f, 0, -0.5f, 0.5f, 1, 0,
                    -0.5f, 0, -0.5f, -0.5f, 0, 0.5f, -0.5f, 1, 0 });
                SH["cyl"] = Cyl(0.5f, 0.5f, 12, true, 0, Mathf.PI * 2, out _);
                SH["cone"] = Cyl(0.32f, 0.5f, 14, false, 0, Mathf.PI * 2, out var cn);
                SN["cone"] = cn;
                // Half a cylinder lying along x, flat side down, twice as tall: rotateZ(π/2) then scale y 2.
                var vault = Cyl(0.5f, 0.5f, 14, true, 0, Mathf.PI, out _, -0.5f);
                for (int i = 0; i < vault.Length; i++) { var p = vault[i]; vault[i] = new Vector3(-p.y, p.x * 2, p.z); }
                SH["vault"] = vault;
                SH["hip"] = Hip();
                SH["tree"] = Ico();
                SH["treeR"] = LumpyTree();
                SH["hanok"] = Hanok();
            }

            static Vector3[] Flat(float[] a)
            {
                var o = new Vector3[a.Length / 3];
                for (int i = 0; i < o.Length; i++) o[i] = new Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
                return o;
            }

            static Vector3[] Box()
            {
                var t = new List<Vector3>();
                void q(Vector3 a, Vector3 b, Vector3 c, Vector3 d) { t.Add(a); t.Add(b); t.Add(c); t.Add(a); t.Add(c); t.Add(d); }
                Vector3 P(float x, float y, float z) => new Vector3(x * 0.5f, y, z * 0.5f);
                q(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1));     // top (+y)
                q(P(-1, 0, -1), P(1, 0, -1), P(1, 0, 1), P(-1, 0, 1));     // bottom
                q(P(-1, 0, 1), P(1, 0, 1), P(1, 1, 1), P(-1, 1, 1));       // +z
                q(P(1, 0, -1), P(-1, 0, -1), P(-1, 1, -1), P(1, 1, -1));   // -z
                q(P(1, 0, 1), P(1, 0, -1), P(1, 1, -1), P(1, 1, 1));       // +x
                q(P(-1, 0, -1), P(-1, 0, 1), P(-1, 1, 1), P(-1, 1, -1));   // -x
                return Orient(t.ToArray(), new Vector3(0, 0.5f, 0));
            }

            /// <summary>three.js CylinderGeometry(rt, rb, 1, seg, 1, !caps, θ0, θlen), moved up half a unit (y0 = 0) or centred (y0 = -0.5).</summary>
            static Vector3[] Cyl(float rt, float rb, int seg, bool caps, float th0, float thl, out Vector3[] normals, float y0 = 0)
            {
                var t = new List<Vector3>(); var n = new List<Vector3>();
                float slope = rb - rt;
                Vector3 at(float r, float y, int i) { float a = th0 + i * thl / seg; return new Vector3(r * Mathf.Sin(a), y, r * Mathf.Cos(a)); }
                Vector3 nm(int i) { float a = th0 + i * thl / seg; return new Vector3(Mathf.Sin(a), slope, Mathf.Cos(a)).normalized; }
                float yt = y0 + 1, yb = y0;
                for (int i = 0; i < seg; i++)
                {
                    Vector3 a = at(rt, yt, i), b = at(rb, yb, i), c = at(rb, yb, i + 1), d = at(rt, yt, i + 1);
                    t.Add(a); t.Add(b); t.Add(d); n.Add(nm(i)); n.Add(nm(i)); n.Add(nm(i + 1));
                    t.Add(b); t.Add(c); t.Add(d); n.Add(nm(i)); n.Add(nm(i + 1)); n.Add(nm(i + 1));
                    if (caps)
                    {
                        t.Add(new Vector3(0, yt, 0)); t.Add(at(rt, yt, i)); t.Add(at(rt, yt, i + 1)); n.Add(Vector3.up); n.Add(Vector3.up); n.Add(Vector3.up);
                        t.Add(new Vector3(0, yb, 0)); t.Add(at(rb, yb, i + 1)); t.Add(at(rb, yb, i)); n.Add(Vector3.down); n.Add(Vector3.down); n.Add(Vector3.down);
                    }
                }
                normals = n.ToArray();
                return Orient(t.ToArray(), new Vector3(0, y0 + 0.5f, 0), normals);
            }

            static Vector3[] Hip()
            {
                // ConeGeometry(√½, 1, 4) turned 45°: a square pyramid on the unit footprint, with its base.
                float r = Mathf.Sqrt(0.5f);
                var t = new List<Vector3>();
                for (int i = 0; i < 4; i++)
                {
                    float a0 = Mathf.PI / 4 + i * Mathf.PI / 2, a1 = a0 + Mathf.PI / 2;
                    var p0 = new Vector3(r * Mathf.Sin(a0), 0, r * Mathf.Cos(a0)); var p1 = new Vector3(r * Mathf.Sin(a1), 0, r * Mathf.Cos(a1));
                    t.Add(new Vector3(0, 1, 0)); t.Add(p0); t.Add(p1);
                    t.Add(Vector3.zero); t.Add(p1); t.Add(p0);
                }
                return Orient(t.ToArray(), new Vector3(0, 0.3f, 0));
            }

            /// <summary>실사: a crown of several lumps in the same unit box as the plain ball.</summary>
            static Vector3[] LumpyTree()
            {
                var all = new List<Vector3>();
                var rng = new System.Random(11);
                for (int i = 0; i < 7; i++)
                {
                    float a = i * 2.4f, rad = i == 0 ? 0 : 0.2f;
                    var c = new Vector3(Mathf.Cos(a) * rad, i == 0 ? 0.52f : 0.42f + 0.22f * (float)rng.NextDouble(), Mathf.Sin(a) * rad);
                    var sh = new MeshKit.Shape().Blob(i == 0 ? 0.36f : 0.24f, c, Color.white, Vector3.one, i, 0.3f);
                    all.AddRange(Orient(sh.v.ToArray(), c));
                }
                return all.ToArray();
            }

            static Vector3[] Ico()
            {
                float s = (1 + Mathf.Sqrt(5)) / 2;
                var p = new[] { new Vector3(-1, s, 0), new Vector3(1, s, 0), new Vector3(-1, -s, 0), new Vector3(1, -s, 0), new Vector3(0, -1, s), new Vector3(0, 1, s), new Vector3(0, -1, -s), new Vector3(0, 1, -s), new Vector3(s, 0, -1), new Vector3(s, 0, 1), new Vector3(-s, 0, -1), new Vector3(-s, 0, 1) };
                int[] f = { 0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1 };
                var t = new Vector3[f.Length];
                for (int i = 0; i < f.Length; i++) t[i] = p[f[i]].normalized * 0.5f + new Vector3(0, 0.5f, 0);
                return Orient(t, new Vector3(0, 0.5f, 0));
            }

            /// <summary>팔작지붕, simplified: sagging slopes, a ridge rising to its ends, eaves sweeping up at the corners.</summary>
            static Vector3[] Hanok()
            {
                const float RL = 0.34f;
                float lift(float u) => 0.22f * Mathf.Pow(Mathf.Min(1, Mathf.Abs(u) * 2), 3);
                Vector3 ridge(float x) => new Vector3(x, 1 + 0.07f * Mathf.Pow(Mathf.Abs(x) / RL, 2), 0);
                Vector3 slope(Vector3 a, Vector3 b, float t) { var p = Vector3.Lerp(a, b, t); p.y = a.y + (b.y - a.y) * Mathf.Pow(t, 1.5f); return p; }
                var tris = new List<Vector3>();
                void quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d) { tris.Add(a); tris.Add(b); tris.Add(c); tris.Add(a); tris.Add(c); tris.Add(d); }
                const int NS = 4, NT = 2, NE = 2;
                foreach (int sz in new[] { -1, 1 }) for (int i = 0; i < NS; i++) for (int j = 0; j < NT; j++)
                {
                    Vector3 P(int ii, int jj) { float u = -0.5f + (float)ii / NS; return slope(new Vector3(u, lift(u), sz * 0.5f), ridge(u * RL / 0.5f), (float)jj / NT); }
                    quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
                }
                foreach (int sx in new[] { -1, 1 }) for (int i = 0; i < NE; i++) for (int j = 0; j < NT; j++)
                {
                    Vector3 P(int ii, int jj) { float wv = -0.5f + (float)ii / NE; return slope(new Vector3(sx * 0.5f, lift(wv), wv), ridge(sx * RL), (float)jj / NT); }
                    quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
                }
                var o = new List<Vector3>();
                for (int k = 0; k < tris.Count; k += 3)
                {
                    Vector3 a = tris[k], b = tris[k + 1], c = tris[k + 2];
                    var nn = Vector3.Cross(b - a, c - a); // right-handed cross of web points
                    if (nn.sqrMagnitude < 1e-12f) continue;
                    if (nn.y < 0) { var tmp = b; b = c; c = tmp; }
                    o.Add(a); o.Add(b); o.Add(c);
                }
                return o.ToArray();
            }

            /// <summary>Turn each triangle so it winds counter-clockwise seen from outside (from the centre point).</summary>
            static Vector3[] Orient(Vector3[] t, Vector3 centre, Vector3[] normals = null)
            {
                for (int k = 0; k + 2 < t.Length; k += 3)
                {
                    var nn = Vector3.Cross(t[k + 1] - t[k], t[k + 2] - t[k]);
                    var mid = (t[k] + t[k + 1] + t[k + 2]) / 3 - centre;
                    if (Vector3.Dot(nn, mid) < 0)
                    {
                        var tmp = t[k + 1]; t[k + 1] = t[k + 2]; t[k + 2] = tmp;
                        if (normals != null) { var tn = normals[k + 1]; normals[k + 1] = normals[k + 2]; normals[k + 2] = tn; }
                    }
                }
                return t;
            }

            static readonly Dictionary<string, Color> colours = new Dictionary<string, Color>();
            static Color C(string hex) { if (!colours.TryGetValue(hex, out var c)) { c = MeshKit.Lin(hex); colours[hex] = c; } return c; }

            public static void Add(Batch bt, Part p, Building b, double g, double bas)
            {
                var tri = SH[p.shape == "tree" && Real ? "treeR" : p.shape];
                SN.TryGetValue(p.shape, out var sn);
                float cs = (float)Math.Cos(p.rot), ss = (float)Math.Sin(p.rot);
                float sx = (float)p.sx, sy = (float)(p.sy * g), sz = (float)p.sz;
                float px = (float)p.x, py = (float)(p.y * g + bas), pz = (float)p.z;
                // three.js: rotation about +y, x' = x cos + z sin, z' = -x sin + z cos; then mirror z for Unity.
                Vector3 W(Vector3 q) { float x = q.x * sx, y = q.y * sy, z = q.z * sz; return new Vector3(px + x * cs + z * ss, py + y, -(pz - x * ss + z * cs)); }
                Vector3 WN(Vector3 q) { float x = q.x / sx, y = q.y / Mathf.Max(1e-4f, sy), z = q.z / sz; return new Vector3(x * cs + z * ss, y, -(-x * ss + z * cs)).normalized; }
                Color col = C(p.color);
                if (p.shape == "neon") col *= C("#c0392b");
                bool box = p.shape == "box";
                Vector4 u1 = default, u2 = default;
                if (box)
                {
                    u1 = new Vector4(p.style, (float)b.look, b.powered ? 1 : 0, b.abandoned ? 1 : 0);
                    var sc = C(p.sign ?? "#888888");
                    u2 = new Vector4(sc.r, sc.g, sc.b, 0);
                }
                float top = py + sy;
                for (int k = 0; k + 2 < tri.Length; k += 3)
                {
                    // Mirroring flips the winding: emit a, c, b.
                    Vector3 a = W(tri[k]), c2 = W(tri[k + 1]), d = W(tri[k + 2]);
                    Vector3 fn = Vector3.Cross(d - a, c2 - a).normalized;
                    int[] order = { k, k + 2, k + 1 };
                    Vector3[] pts = { a, d, c2 };
                    for (int j = 0; j < 3; j++)
                    {
                        bt.v.Add(pts[j]);
                        bt.n.Add(sn != null ? WN(sn[order[j]]) : fn);
                        bt.c.Add(col);
                        if (box)
                        {
                            var lq = tri[order[j]];
                            // The local face normal's x: ±1 on the end walls.
                            Vector3 ln = Vector3.Cross(tri[k + 1] - tri[k], tri[k + 2] - tri[k]).normalized;
                            bt.u1.Add(u1); bt.u2.Add(new Vector4(u2.x, u2.y, u2.z, Mathf.Abs(ln.x) > 0.5f ? -Mathf.Sign(ln.x) * lq.z * sz : Mathf.Sign(ln.z) * lq.x * sx)); // w: metres across the wall from its middle
                            bt.u3.Add(new Vector4(lq.y, sy, ln.x, top));
                        }
                    }
                }
            }
        }
    }
}
