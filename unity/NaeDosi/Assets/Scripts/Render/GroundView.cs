using System;
using System.Collections.Generic;
using UnityEngine;
using static NaeDosi.Defs;

namespace NaeDosi.Render
{
    /// <summary>
    /// The land: heightfield, painted ground texture, land beyond the map edge, water, forests
    /// (port of render/ground.ts; overlays come later with the tool UI).
    /// </summary>
    public sealed class GroundView
    {
        public const int TX = 4;
        public static readonly float SIZE = N * CELL;
        public readonly GameObject root;
        public readonly Texture2D tex;
        readonly Color32[] px;
        readonly Mesh land;
        readonly float[] field;
        readonly float[] vh = new float[(N + 1) * (N + 1)];
        int shapeVer = -1;
        string treeVer = "";
        public int month = 3;
        readonly Material landMat, farMat, waterMat;
        public readonly Instances pines, rounds;

        public GroundView(World w, Transform parent, Shader shader)
        {
            root = new GameObject("Ground");
            root.transform.SetParent(parent, false);
            int R = N * TX;
            tex = new Texture2D(R, R, TextureFormat.RGBA32, false, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, name = "ground" };
            px = new Color32[R * R];
            field = WorldOps.terrainField(w);

            landMat = new Material(shader) { name = "land" };
            landMat.SetFloat("_Mode", 0); landMat.SetFloat("_Smooth", 0.0f);
            landMat.SetTexture("_BaseMap", tex);
            farMat = new Material(shader) { name = "far" };
            farMat.SetFloat("_Mode", 1); farMat.SetFloat("_Smooth", 0);
            waterMat = new Material(shader) { name = "water" };
            waterMat.SetFloat("_Mode", 3); waterMat.SetFloat("_Smooth", 0.92f); waterMat.SetFloat("_Metal", 0.15f);

            // Terrain: a vertex per cell corner, uv across the map.
            var v = new List<Vector3>((N + 1) * (N + 1));
            var uv = new List<Vector2>((N + 1) * (N + 1));
            for (int z = 0; z <= N; z++) for (int x = 0; x <= N; x++) { v.Add(new Vector3(x * CELL, 0, -z * CELL)); uv.Add(new Vector2((float)x / N, 1f - (float)z / N)); }
            var idx = new List<int>(N * N * 6);
            int S1 = N + 1;
            for (int z = 0; z < N; z++) for (int x = 0; x < N; x++)
            {
                int a = z * S1 + x, b = a + 1, c = a + S1, d = c + 1;
                // Web (right-handed) a,c,b + b,c,d; mirrored and rewound.
                idx.Add(a); idx.Add(b); idx.Add(c);
                idx.Add(b); idx.Add(d); idx.Add(c);
            }
            land = MeshKit.Build("land", v, null, idx, uv);
            land.MarkDynamic();
            Add("land", land, landMat, true);
            Shape(w);

            // Land beyond the edge, and open water where the map's water runs off it.
            var far = new MeshKit.Shape();
            var farC = MeshKit.Lin("#6f8f5a");
            float F = SIZE * 2.5f;
            void rect(float x0, float z0, float x1, float z1)
            {
                if (x1 <= x0 || z1 <= z0) return;
                var a = MeshKit.P(x0, -0.3, z0); var b = MeshKit.P(x1, -0.3, z0); var c = MeshKit.P(x1, -0.3, z1); var d = MeshKit.P(x0, -0.3, z1);
                far.Tri(a, b, c, farC); far.Tri(a, c, d, farC);
            }
            (float z0, float z1)? edgeWater(int x)
            {
                int lo = N, hi = -1;
                for (int y = 0; y < N; y++) if (w.ground[WorldOps.idx(x, y)] == Ground.Water) { lo = Math.Min(lo, y); hi = Math.Max(hi, y); }
                return hi < 0 ? ((float, float)?)null : (lo * CELL, (hi + 1) * CELL);
            }
            void side(float x0, float x1, (float z0, float z1)? gap)
            {
                if (gap == null) { rect(x0, 0, x1, SIZE); return; }
                rect(x0, 0, x1, gap.Value.z0); rect(x0, gap.Value.z1, x1, SIZE);
            }
            if (w.map == "island") { }
            else if (w.map == "coast")
            {
                rect(-F, -F, SIZE + F, 0);
                rect(-F, 0, 0, edgeWater(0)?.z0 ?? SIZE);
                rect(SIZE, 0, SIZE + F, edgeWater(N - 1)?.z0 ?? SIZE);
            }
            else
            {
                rect(-F, -F, SIZE + F, 0);
                rect(-F, SIZE, SIZE + F, SIZE + F);
                (float, float)? big(int x) { var g = edgeWater(x); return g != null && g.Value.z1 - g.Value.z0 > CELL * 3 ? g : null; }
                bool r = w.map == "river" || w.real != null;
                side(-F, 0, r ? big(0) : null);
                side(SIZE, SIZE + F, r ? big(N - 1) : null);
            }
            if (far.v.Count > 0) Add("far", far.ToMesh("far"), farMat, false);

            var water = new MeshKit.Shape();
            var wc = MeshKit.Lin("#2f7fb8");
            float W0 = SIZE / 2 - SIZE * 3, W1 = SIZE / 2 + SIZE * 3;
            water.Tri(MeshKit.P(W0, -1.1, W0), MeshKit.P(W1, -1.1, W0), MeshKit.P(W1, -1.1, W1), wc);
            water.Tri(MeshKit.P(W0, -1.1, W0), MeshKit.P(W1, -1.1, W1), MeshKit.P(W0, -1.1, W1), wc);
            Add("water", water.ToMesh("water"), waterMat, false);

            // Trees: a pine (trunk, two cones) and a broadleaf (trunk, three blobs); white parts take the season's colour.
            var trunkC = MeshKit.Lin("#6b4a33");
            var pine = new MeshKit.Shape().Cylinder(0.25f, 0.32f, 0, 2, 5, trunkC).Cylinder(0, 2.1f, 1.6f, 5.2f, 6, Color.white).Cylinder(0, 1.5f, 3.6f, 6.4f, 6, Color.white);
            var round = new MeshKit.Shape().Cylinder(0.28f, 0.36f, 0, 2.6f, 5, trunkC)
                .Ico(2.2f, new Vector3(0, 3.9f, 0), Color.white, Vector3.one)
                .Ico(1.55f, new Vector3(1.1f, 4.9f, -0.5f), MeshKit.Lin("#f2f2f2"), Vector3.one)
                .Ico(1.4f, new Vector3(-0.9f, 4.6f, 0.7f), MeshKit.Lin("#e6e6e6"), Vector3.one);
            var treeMat = new Material(shader) { name = "trees", enableInstancing = true };
            treeMat.SetFloat("_Mode", 1); treeMat.SetFloat("_Smooth", 0.1f);
            pines = new Instances(pine.ToMesh("pine"), treeMat);
            rounds = new Instances(round.ToMesh("round"), treeMat);
        }

        GameObject Add(string name, Mesh m, Material mat, bool shadows)
        {
            var g = new GameObject(name);
            g.transform.SetParent(root.transform, false);
            g.AddComponent<MeshFilter>().sharedMesh = m;
            var r = g.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = shadows ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = true;
            return g;
        }

        public void Draw() { pines.Draw(); rounds.Draw(); }

        /// <summary>River bed below, hills from the seeded field, notches where roads and tunnel mouths cut in.</summary>
        public void Shape(World w)
        {
            if (shapeVer == w.ver.roads) return;
            shapeVer = w.ver.roads;
            int S1 = N + 1;
            bool mouth(int i) => w.roadAlt[i] != 0 && w.altLevel[i] == Level.Tunnel && Graph.isRamp(w, i);
            int[,] D = { { -1, -1 }, { 0, -1 }, { -1, 0 }, { 0, 0 } };
            for (int vz = 0; vz <= N; vz++) for (int vx = 0; vx <= N; vx++)
            {
                int water = 0, cells = 0; double hsum = 0; bool cut = false, allHill = true;
                for (int k = 0; k < 4; k++)
                {
                    int cx = vx + D[k, 0], cz = vz + D[k, 1];
                    if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
                    cells++;
                    int i = WorldOps.idx(cx, cz);
                    if (w.ground[i] == Ground.Water) water++;
                    if (w.ground[i] == Ground.Mountain) hsum += field[i]; else allHill = false;
                    if (mouth(i) || w.road[i] != 0) cut = true;
                }
                allHill &= cells > 0;
                vh[vz * S1 + vx] = cells > 0 && water == cells ? -4.5f : allHill && !cut ? (float)(hsum / cells) : 0;
            }
            var v = new Vector3[S1 * S1];
            for (int z = 0; z <= N; z++) for (int x = 0; x <= N; x++) v[z * S1 + x] = new Vector3(x * CELL, vh[z * S1 + x], -z * CELL);
            land.vertices = v;
            land.RecalculateNormals();
            land.RecalculateBounds();
        }

        /// <summary>Terrain height at a web-space point (x east, z south).</summary>
        public float HeightAt(double wx, double wz)
        {
            int S1 = N + 1;
            double fx = Math.Max(0, Math.Min(N - 0.001, wx / CELL)), fz = Math.Max(0, Math.Min(N - 0.001, wz / CELL));
            int x = (int)Math.Floor(fx), z = (int)Math.Floor(fz);
            double u = fx - x, q = fz - z;
            double a = vh[z * S1 + x], b = vh[z * S1 + x + 1], c = vh[(z + 1) * S1 + x], d = vh[(z + 1) * S1 + x + 1];
            return (float)(a * (1 - u) * (1 - q) + b * u * (1 - q) + c * (1 - u) * q + d * u * q);
        }

        static double Hash(double x, double y) { double s = Math.Sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.Floor(s); }
        static double Noise(double x, double y)
        {
            double xi = Math.Floor(x), yi = Math.Floor(y), xf = x - xi, yf = y - yi;
            double u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            double a = Hash(xi, yi), b = Hash(xi + 1, yi), c = Hash(xi, yi + 1), d = Hash(xi + 1, yi + 1);
            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        }
        static readonly Dictionary<int, double[]> ZONE_RGB = new Dictionary<int, double[]> { { Zone.R, new double[] { 76, 196, 124 } }, { Zone.C, new double[] { 63, 127, 214 } }, { Zone.I, new double[] { 227, 176, 75 } } };

        static bool Bank(World w, int x, int y)
        {
            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++)
            {
                int nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < N && ny < N && w.ground[WorldOps.idx(nx, ny)] == Ground.Water) return true;
            }
            return false;
        }

        /// <summary>Repaint the ground texture (texture row 0 is the map's south edge).</summary>
        public void Paint(World w)
        {
            int R = N * TX;
            var cover = Curves.curveInfo(w).cover;
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++)
            {
                int i = WorldOps.idx(x, y);
                double r, g, b;
                int id = w.bld[i];
                Building bd = id >= 0 && w.buildings.TryGetValue(id, out var bb) ? bb : null;
                double h = Hash(x, y);
                double gr = 106 + h * 7, gg = 145 + h * 8, gb = 76 + h * 4;
                bool line = false;
                if (w.ground[i] == Ground.Water) { r = 70; g = 92; b = 84; }
                else if (w.ground[i] == Ground.Mountain)
                {
                    double rock = Math.Max(0, Math.Min(1, (field[i] - 55) / 30.0));
                    r = 74 + h * 10 + rock * 70; g = 108 + h * 12 + rock * 22; b = 64 + h * 6 + rock * 48;
                }
                else if (bd != null && (bd.kind == "park" || bd.kind == "r3" || bd.kind == "riverpark")) { r = 92 + h * 10; g = 160 + h * 12; b = 82; }
                else if (bd != null && bd.kind == "palace") { r = 214; g = 198; b = 160; }
                else if (bd != null && bd.kind == "school") { r = 196; g = 160; b = 118; }
                else if (bd != null && (bd.kind.StartsWith("c") || bd.kind.StartsWith("i"))) { if (bd.kind.StartsWith("i")) { r = 128; g = 128; b = 124; } else { r = 170; g = 166; b = 158; } }
                else if (bd != null) { r = 150 + h * 10; g = 150 + h * 10; b = 140; }
                else if (w.zone[i] != 0)
                {
                    var zc = ZONE_RGB[w.zone[i]];
                    r = gr * 0.6 + zc[0] * 0.4; g = gg * 0.6 + zc[1] * 0.4; b = gb * 0.6 + zc[2] * 0.4;
                    line = true;
                }
                else if (Bank(w, x, y)) { r = 196; g = 184; b = 140; }
                else { r = gr; g = gg; b = gb; }
                for (int ty = 0; ty < TX; ty++) for (int tx = 0; tx < TX; tx++)
                {
                    bool edge = line && (tx == 0 || ty == 0);
                    double k = edge ? 0.78 : 1;
                    int row = R - 1 - (y * TX + ty);
                    // Uint8Array stores truncate.
                    px[row * R + x * TX + tx] = new Color32((byte)(r * k), (byte)(g * k), (byte)(b * k), 255);
                }
            }
            tex.SetPixels32(px);
            tex.Apply(false);
        }

        static string SeasonOf(int m) => m == 4 ? "blossom" : m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 9 ? "summer" : m >= 10 && m <= 11 ? "autumn" : "winter";
        static readonly Dictionary<string, string[]> PALETTE = new Dictionary<string, string[]>
        {
            { "spring", new[] { "#6aa84f", "#7cbf5a", "#5d9643", "#8bc34a" } },
            { "blossom", new[] { "#6aa84f", "#7cbf5a", "#5d9643" } },
            { "summer", new[] { "#3f7a35", "#4f8a3c", "#356b30", "#2f6b3a" } },
            { "autumn", new[] { "#e0a526", "#d9822b", "#c0392b", "#b5651d", "#e8c13a", "#4f7a35" } },
            { "winter", new[] { "#2f4f3a", "#3b5a40", "#7a6450", "#6d5a48" } },
        };
        static double Frac(double v) => v - Math.Floor(v);
        static string TreeColour(string season, double seed, double cherry)
        {
            if (season == "blossom" && Frac(seed * 7.31) < cherry) return Frac(seed * 13.7) < 0.5 ? "#f4b6c8" : "#f9d3de";
            var pal = PALETTE[season];
            return pal[(int)Math.Floor(seed * 97) % pal.Length];
        }
        const int MAX_TREES = 16000;

        public void PlantTrees(World w)
        {
            string season = SeasonOf(month);
            string ver = $"{w.ver.roads}:{w.ver.zones}:{w.ver.buildings}:{season}";
            if (ver == treeVer) return;
            treeVer = ver;
            Shape(w);
            var cover = Curves.curveInfo(w).cover;
            var want = new List<(double x, double z, double k, double seed, double cherry)>();
            void put(double wx, double wz, double k, double seed, double cherry = 0) => want.Add((wx, wz, k, seed, cherry));
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++)
            {
                int i = WorldOps.idx(x, y);
                if (w.road[i] != 0 || w.ground[i] == Ground.Water || (w.roadAlt[i] != 0 && Graph.isRamp(w, i)) || cover[i] != 0) continue;
                int id = w.bld[i];
                double h = Hash(x, y), h2 = Hash(y + 3.1, x + 7.7);
                if (w.ground[i] == Ground.Mountain)
                {
                    if (id >= 0) continue;
                    int count = field[i] > 70 ? 1 : field[i] > 50 ? 2 : 3;
                    for (int k = 0; k < count; k++) put(x * CELL + 1.5 + Hash(x + k * 13, y) * 7, y * CELL + 1.5 + Hash(y + k * 7, x) * 7, 0.9 + Hash(k, x + y) * 0.7, Hash(x * 3 + k, y), 0.12);
                    continue;
                }
                if (id >= 0)
                {
                    var b = w.buildings[id];
                    if (b.kind == "park") for (int k = 0; k < 4; k++) put(x * CELL + 2 + Hash(k, x) * 6, y * CELL + 2 + Hash(y, k) * 6, 0.8 + Hash(k, y) * 0.5, Hash(x + k, y), 0.4);
                    else if (b.kind == "riverpark") for (int k = 0; k < 3; k++) put(x * CELL + 1 + Hash(k, x) * 8, y * CELL + 1 + Hash(y, k) * 8, 0.8 + Hash(k, y) * 0.4, Hash(x + k, y), 0.9);
                    else if (b.kind == "palace") { if (Hash(x, y) < 0.5) put(x * CELL + 2 + h * 6, y * CELL + 2 + h2 * 6, 1.1, h, 0.3); }
                    else if (b.kind == "r3" && b.x == x && b.y == y)
                        foreach (var (ox, oz) in new[] { (1.4, 1.4), (18.6, 1.4), (1.4, 18.6), (18.6, 18.6), (10.0, 1.2), (10.0, 18.8) }) put(x * CELL + ox, y * CELL + oz, 0.7 + h * 0.3, h2 + ox, 0.35);
                    continue;
                }
                bool altBlocks = w.roadAlt[i] != 0 && (w.altLevel[i] == Level.Elevated || Graph.isRamp(w, i));
                if (w.zone[i] != 0 || altBlocks) continue;
                int real = w.real != null ? w.real.cells[i] : -1;
                double f = real == 1 ? 0.6 + Noise(x / 3.5 + 40, y / 3.5) * 0.12 : real == 0 ? Noise(x / 3.5 + 40, y / 3.5) * 0.6 : Noise(x / 9.0, y / 9.0) * 0.75 + Noise(x / 3.5 + 40, y / 3.5) * 0.25;
                if (f < 0.52) continue;
                int cnt = f > 0.66 ? 3 : f > 0.58 ? 2 : 1;
                double cherry = Bank(w, x, y) ? 0.8 : 0.15;
                for (int k = 0; k < cnt; k++) put(x * CELL + 1.5 + Hash(x + k * 13, y) * 7, y * CELL + 1.5 + Hash(y + k * 7, x) * 7, 0.75 + Hash(k, x + y) * 0.6, Hash(x * 3 + k, y), cherry);
            }
            double keep = Math.Min(1, MAX_TREES / (double)Math.Max(1, want.Count));
            var pm = new List<Matrix4x4>(); var pc = new List<Color>();
            var rm = new List<Matrix4x4>(); var rc = new List<Color>();
            foreach (var t in want)
            {
                if (keep < 1 && Hash(t.x * 0.37, t.z * 0.53) >= keep) continue;
                if (pm.Count >= MAX_TREES || rm.Count >= MAX_TREES) break;
                float y = HeightAt(t.x, t.z);
                // three.js turns about +y by seed·2π; mirrored, the turn runs the other way.
                var m = Matrix4x4.TRS(MeshKit.P(t.x, y - 0.2, t.z), Quaternion.Euler(0, (float)(t.seed * 6.28 * Mathf.Rad2Deg), 0), Vector3.one * (float)t.k);
                var c = MeshKit.Lin(TreeColour(season, t.seed, t.cherry));
                bool broad = y < 2 ? Frac(t.seed * 5.37) < 0.65 || t.cherry > 0.5 : Frac(t.seed * 5.37) < 0.15;
                if (broad) { rm.Add(m); rc.Add(c); } else { pm.Add(m); pc.Add(c); }
            }
            pines.Set(pm, pc);
            rounds.Set(rm, rc);
        }
    }
}
