using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using static NaeDosi.Defs;

namespace NaeDosi.Render
{
    /// <summary>Bus shelters, route maps, 역세권 rings, the line being drawn, buses and the map's trains (render/transit.ts).</summary>
    public sealed class TransitView
    {
        const double TRAIN_SPEED = 7;
        readonly GameObject stops, routes, draftGo;
        readonly Material glow, ghost, shelterMat, glassMat;
        readonly Shader ghostShader;
        readonly Instances buses, trains;
        string ver = "", draftKey = "";
        public bool showRoutes;

        sealed class Model
        {
            public readonly List<Vector3> v = new List<Vector3>(); public readonly List<Color> c = new List<Color>(); public readonly List<Vector4> g = new List<Vector4>();
            public Model Part(float sx, float sy, float sz, float x, float y, float z, float k, float glow = 0)
            {
                var s = new MeshKit.Shape().Box(new Vector3(x, y + sy / 2, -z), new Vector3(sx, sy, sz), new Color(k, k, k));
                v.AddRange(s.v); c.AddRange(s.c); for (int i = 0; i < s.v.Count; i++) g.Add(new Vector4(glow, 0, 0, 0));
                return this;
            }
            public Mesh Mesh(string n) { var m = MeshKit.Build(n, v, c, null); m.SetUVs(1, g); return m; }
        }

        public TransitView(Transform parent, Shader shader, Shader ghostShader)
        {
            this.ghostShader = ghostShader;
            stops = new GameObject("Stops"); stops.transform.SetParent(parent, false);
            routes = new GameObject("Routes"); routes.transform.SetParent(parent, false);
            draftGo = new GameObject("Draft"); draftGo.transform.SetParent(parent, false);
            glow = new Material(shader) { enableInstancing = true, name = "transit" };
            glow.SetFloat("_Mode", 6); glow.SetFloat("_Smooth", 0.5f); glow.SetFloat("_Metal", 0.1f);
            shelterMat = new Material(shader); shelterMat.SetFloat("_Mode", 1); shelterMat.SetFloat("_Smooth", 0.6f); shelterMat.SetFloat("_Metal", 0.2f);
            glassMat = new Material(ghostShader); glassMat.SetColor("_Color", new Color(0.35f, 0.55f, 0.69f, 0.55f));
            ghost = new Material(ghostShader);
            var bus = new Model().Part(10.5f, 2.3f, 2.45f, 0, 0.35f, 0, 1).Part(10.55f, 0.85f, 2.5f, 0, 1.35f, 0, 0.16f, 0.6f).Part(0.1f, 0.35f, 1.8f, 5.3f, 2.25f, 0, 1.6f, 1.5f).Part(9.6f, 0.25f, 2.1f, 0, 2.65f, 0, 0.9f).Mesh("citybus");
            var train = new Model(); for (int k = 0; k < 4; k++) train.Part(4.6f, 2.2f, 2.6f, -k * 5, 0, 0, 1, 0.4f);
            buses = new Instances(bus, glow);
            trains = new Instances(train.Mesh("train"), glow);
        }

        static Color C(string hex) { ColorUtility.TryParseHtmlString(hex, out var c); return c.linear; }
        static V centre(int i) => new V(i % N * CELL + CELL / 2.0, i / N * CELL + CELL / 2.0);

        void Clear(GameObject g) { foreach (Transform t in g.transform) UnityEngine.Object.Destroy(t.gameObject); }

        GameObject Flat(GameObject parent, Tris t, string color, double alpha, int queue)
        {
            var m = new Material(ghostShader);
            var k = C(color); k.a = (float)alpha; m.SetColor("_Color", k); m.renderQueue = 3000 + queue;
            var go = new GameObject("flat"); go.transform.SetParent(parent.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = MeshKit.FromTris("flat", t);
            var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = m; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        static void Ribbon(Tris t, IList<V> pts, double width, double y)
        {
            for (int k = 1; k < pts.Count; k++)
            {
                V a = pts[k - 1], b = pts[k];
                double len = Math.Sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
                if (len == 0) continue;
                double nx = -(b.z - a.z) / len * width / 2, nz = (b.x - a.x) / len * width / 2;
                t.quad(new V(a.x + nx, a.z + nz), new V(b.x + nx, b.z + nz), new V(b.x - nx, b.z - nz), new V(a.x - nx, a.z - nz), y, new Rgb(1, 1, 1));
            }
        }
        static void Disc(Tris t, V c, double r, double y)
        {
            for (int k = 0; k < 20; k++)
            {
                double a0 = k * Math.PI * 2 / 20, a1 = (k + 1) * Math.PI * 2 / 20;
                t.tri(c, new V(c.x + Math.Cos(a0) * r, c.z + Math.Sin(a0) * r), new V(c.x + Math.Cos(a1) * r, c.z + Math.Sin(a1) * r), y, new Rgb(1, 1, 1));
            }
        }
        void Marker(GameObject parent, V c, string color, double r, double y)
        {
            var t = new Tris(); Disc(t, c, r, y); Flat(parent, t, color, 1, 5);
            var t2 = new Tris(); Disc(t2, c, r * 0.55, y + 0.02); Flat(parent, t2, "#f7f3e6", 1, 6);
        }

        void Rebuild(World w)
        {
            Clear(stops); Clear(routes);
            var done = new HashSet<int>(); var areaDone = new HashSet<int>();
            foreach (var l in w.lines)
            {
                if (l.kind == "bus")
                {
                    foreach (int s in l.stops) if (done.Add(s)) Shelter(w, s, l.color);
                    var p = Transit.busRoute(w, l.stops, l.id);
                    if (p != null) { var t = new Tris(); Ribbon(t, p.Select(n => CityRoads.nodeCentre(n, w)).ToList(), 1.6, 0.7); Flat(routes, t, l.color, 0.85, 4); }
                }
                else
                {
                    var t = new Tris(); Ribbon(t, l.stops.Select(centre).ToList(), 3.2, 0.9); Flat(routes, t, l.color, 0.85, 4);
                    foreach (int s in l.stops) Marker(routes, centre(s), l.color, 4.2, 1.0);
                    foreach (int s in l.stops) if (areaDone.Add(s))
                    {
                        double R = Transit.STATION_AREA * CELL; var c = centre(s);
                        var f = new Tris(); Disc(f, c, R, 0.6); Flat(routes, f, l.color, 0.08, 3);
                        var rim = new Tris();
                        for (int k = 0; k < 48; k += 2) { double a0 = k / 48.0 * Math.PI * 2, a1 = (k + 1) / 48.0 * Math.PI * 2; Ribbon(rim, new[] { new V(c.x + Math.Cos(a0) * R, c.z + Math.Sin(a0) * R), new V(c.x + Math.Cos(a1) * R, c.z + Math.Sin(a1) * R) }, 1.6, 0.7); }
                        Flat(routes, rim, l.color, 0.85, 4);
                    }
                }
            }
        }

        /// <summary>A bus shelter on the kerb: roof, glass back panel, posts and a pole sign in the line colour.</summary>
        void Shelter(World w, int i, string color)
        {
            var k = Transit.stopKerb(w, i);
            var c = centre(k.cell);
            double off = w.road[k.cell] == Road.Avenue ? 5.75 : 4.25;
            var g = new GameObject("shelter"); g.transform.SetParent(stops.transform, false);
            // A diagonal road's kerb lies along (±1, ±1): scale it to unit length so the shelter stands on the pavement, not the road.
            double sl = Math.Sqrt(k.side.x * k.side.x + k.side.y * k.side.y);
            g.transform.localPosition = MeshKit.P(c.x + k.side.x / sl * off, 0.3, c.z + k.side.y / sl * off);
            // three.js turns by atan2(side x, side z) about +y; mirrored, the other way.
            g.transform.localRotation = Quaternion.Euler(0, -(float)(Math.Atan2(k.side.x, k.side.y) * Mathf.Rad2Deg), 0);
            void add(Vector3 size, Material m, float px, float py, float pz, Color col)
            {
                var o = new GameObject("p"); o.transform.SetParent(g.transform, false);
                o.AddComponent<MeshFilter>().sharedMesh = new MeshKit.Shape().Box(new Vector3(px, py, -pz), size, col).ToMesh("sh");
                o.AddComponent<MeshRenderer>().sharedMaterial = m;
            }
            var grey = MeshKit.Lin("#d8dde2");
            add(new Vector3(3.2f, 0.14f, 1.3f), shelterMat, 0, 2.5f, 0, grey);
            add(new Vector3(3.0f, 2.3f, 0.08f), glassMat, 0, 1.2f, 0.55f, Color.white);
            add(new Vector3(0.12f, 2.5f, 0.12f), shelterMat, -1.5f, 1.25f, 0, grey);
            add(new Vector3(0.12f, 2.5f, 0.12f), shelterMat, 1.5f, 1.25f, 0, grey);
            add(new Vector3(0.1f, 3.2f, 0.1f), shelterMat, 2.1f, 1.6f, -0.2f, grey);
            add(new Vector3(0.75f, 0.75f, 0.12f), shelterMat, 2.1f, 3.1f, -0.2f, C(color));
        }

        void DrawDraft(World w, (string kind, List<int> stops, string bus)? draft)
        {
            Clear(draftGo);
            if (draft == null || draft.Value.stops.Count == 0) return;
            var d = draft.Value;
            string color = d.kind == "bus" ? Transit.BUS_TYPES[d.bus ?? "branch"].color : "#263c96";
            foreach (int s in d.stops) Marker(draftGo, centre(s), color, d.kind == "bus" ? 3 : 4.5, 1.2);
            if (d.stops.Count < 2) return;
            var pts = d.kind == "bus" ? (Transit.busRoute(w, d.stops) ?? new int[0]).Select(n => CityRoads.nodeCentre(n, w)).ToList() : d.stops.Select(centre).ToList();
            if (pts.Count > 1) { var t = new Tris(); Ribbon(t, pts, d.kind == "bus" ? 1.6 : 3.2, 1.1); Flat(draftGo, t, color, 0.85, 4); }
        }

        public void Update(World w, double time, (string kind, List<int> stops, string bus)? draft, List<(int line, Matrix4x4 m)> busPoses)
        {
            string v = $"{w.ver.transit}:{w.ver.roads}:{w.lines.Count}";
            if (v != ver) { ver = v; Rebuild(w); }
            string dk = draft != null ? $"{draft.Value.kind}:{string.Join(",", draft.Value.stops)}:{w.ver.roads}" : "";
            if (dk != draftKey) { draftKey = dk; DrawDraft(w, draft); }
            routes.SetActive(showRoutes || draft != null);
            var tm = new List<Matrix4x4>(); var tc = new List<Color>();
            if (showRoutes)
                foreach (var l in w.lines)
                {
                    if (l.kind == "bus") continue;
                    var pts = l.stops.Select(centre).ToList();
                    var lens = new List<double>(); for (int k = 1; k < pts.Count; k++) lens.Add(Math.Sqrt(Math.Pow(pts[k].x - pts[k - 1].x, 2) + Math.Pow(pts[k].z - pts[k - 1].z, 2)));
                    double total = lens.Sum();
                    if (total == 0) continue;
                    for (int k = 0; k < 2; k++)
                    {
                        double d = (time * TRAIN_SPEED * CELL + k * total) % (2 * total);
                        bool back = d > total;
                        if (back) d = 2 * total - d;
                        int seg = 0;
                        while (seg < lens.Count - 1 && d > lens[seg]) { d -= lens[seg]; seg++; }
                        V A = pts[seg], B = pts[seg + 1]; double f = Math.Min(1, d / lens[seg]);
                        var dir = new Vector3((float)(B.x - A.x), 0, (float)-(B.z - A.z)) * (back ? -1 : 1);
                        tm.Add(Matrix4x4.TRS(MeshKit.P(A.x + (B.x - A.x) * f, 1.2, A.z + (B.z - A.z) * f), Quaternion.LookRotation(dir, Vector3.up) * Quaternion.Euler(0, -90, 0), Vector3.one));
                        tc.Add(C(l.color));
                    }
                }
            trains.Set(tm, tc);
            var bm = new List<Matrix4x4>(); var bc = new List<Color>();
            foreach (var (lineId, m) in busPoses)
            {
                var l = w.lines.Find(x => x.id == lineId);
                if (l == null || bm.Count >= 400) continue;
                string bt = Transit.busTypeOf(l);
                var sc = bt == "village" ? new Vector3(0.62f, 0.85f, 0.85f) : bt == "express" ? new Vector3(1.05f, 1.15f, 1) : Vector3.one;
                bm.Add(m * Matrix4x4.Scale(sc)); bc.Add(C(l.color));
            }
            buses.Set(bm, bc);
        }

        public void Draw() { buses.Draw(); trains.Draw(); }
    }
}
