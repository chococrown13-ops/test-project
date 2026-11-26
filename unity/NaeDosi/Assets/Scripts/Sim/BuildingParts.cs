using System;
using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi
{
    /// <summary>
    /// Every building is a handful of parts — boxes, sawtooth prisms, cylinders, cones — in the web map's
    /// coordinates (port of the model half of render/buildings.ts; same parts, same order, same colours).
    /// </summary>
    public sealed class Part
    {
        public string shape;          // box prism cyl cone vault neon gable hanok hip tree
        public double x, y, z;        // base centre
        public double sx, sy, sz;
        public double rot;
        public string color;
        public int style;
        public string sign;
        public Part Clone() => (Part)MemberwiseClone();
    }

    public static class BuildingParts
    {
        public const int S_VILLA = 0, S_APT = 1, S_SHOPS = 2, S_OFFICE = 3, S_FACTORY = 4, S_PLAIN = 5, S_HOUSE = 6, S_HANOK = 7, S_FRAMED = 8, S_SLAB = 9, S_SHOPHOUSE = 10, S_SIGN = 11;
        const double PI = Math.PI;

        static readonly string[] GIWA = { "#5d6773", "#66707b", "#58626d" };
        const string PLASTER = "#f2ece0", TIMBER = "#5b4232", STONE = "#b8b1a5";
        static readonly string[] CEMENT = { "#d9d3c7", "#e4dccb", "#cfc6b5", "#e8e2d4" };
        const string BLOCK = "#c9c2b4";
        static readonly string[] BRICKS = { "#a5523c", "#9a5643", "#b0644a", "#8e4c3a" };
        static readonly string[] TILES = { "#d8cfc0", "#cbbfae", "#e2dbd0", "#d3c9b8" };
        static readonly string[] SHOPWALL = { "#d9cdb5", "#cfc2a8", "#e6e1d6", "#c4a98a", "#ddd6c8" };
        static readonly string[] SIGNS = { "#d9473b", "#2f6db3", "#e2a92b", "#3d9a62", "#c2457e", "#1f2f4a", "#f08a24" };
        static readonly string[] TANK = { "#e07b39", "#3f78b5", "#e9e4d8", "#e07b39" };
        const string ROOFGREEN = "#5f9a6e";
        static readonly string[] GLASSES = { "#7d9bb5", "#6f8ea6", "#8aa5b8", "#5f7f99" };
        static readonly string[] PARKED = { "#f2f2f0", "#f2f2f0", "#1b1c1e", "#a9adb2", "#6f7378", "#2a3d66", "#8c1d1d" };
        static readonly string[] C1_SIGN = { "#2bb24c", "#f2c12e", "#3d6b4f", "#2f6fd6", "#e2559b", "#1f4e9a", "#e8743b" };
        static readonly string[] APT = { "#f1efe9", "#ebe6db", "#e2e6e8", "#eeeae2" };
        static readonly string[] BRAND = { "#2f6db5", "#1c8c6e", "#c0392b", "#7b5aa6", "#d98a1c", "#2c3e50", "#0e7c86" };
        static readonly string[] SIGN = { "#e74c3c", "#f1c40f", "#3498db", "#2ecc71", "#e67e22", "#9b59b6", "#ff6fa1", "#1abc9c" };

        /// <summary>A part placer in the lot's own frame: front (-z) toward the road, offsets in metres from the lot centre.</summary>
        public delegate void Put(string s, double dx, double dy, double dz, double w, double h, double d, string color, int style = S_PLAIN, double dr = 0, string sign = null);

        static T pick<T>(T[] a, double r) => a[(int)Math.Floor(r * a.Length) % a.Length];

        /// <summary>A small deterministic sequence per building.</summary>
        static Func<double> seq(double seed)
        {
            long s = (long)Math.Floor(seed * 2147483648.0);
            if (s == 0) s = 1;
            return () => { s = (s * 16807) % 2147483647; return s / 2147483647.0; };
        }

        static void roofLife(Put P, double h, Func<double> r, double x = 0, double z = 0)
        {
            P("cyl", x + 1.8, h, z + 1.6, 1.5, 1.6, 1.5, pick(TANK, r()));
            if (r() < 0.6) for (int k = 0; k < 3; k++) P("cyl", x - 2 + k * 0.9, h, z - 1.2 + (k % 2) * 0.7, 0.7, 0.8, 0.7, "#5a3b2a");
        }

        static void brickVilla(Put P, double H, Func<double> r, string brick)
        {
            P("box", -0.5, 0, 0.9, 7.8, H, 7.2, brick, S_FRAMED);
            P("box", 4.1, 0, 1.2, 1, H - 2.6, 3, brick);
            P("box", 4.1, H - 2.6, 1.2, 1.1, 0.2, 3.2, "#cfc8ba");
            P("box", -1, 0, -4.7, 7.8, 1.5, 0.4, brick);
            P("box", -1, 1.5, -4.7, 8, 0.14, 0.6, "#cfc8ba");
            P("box", 3.9, 0, -4.7, 1.8, 1.9, 0.18, pick(new[] { "#3d5a4a", "#2f3a40", "#4a5f7a" }, r()));
            P("box", -2.5, 0, -3.6, 3.6, 0.45, 1, "#6f9450");
            if (r() < 0.5) P("tree", -3.4, 0.45, -3.6, 1.6, 2.4, 1.6, "#5e8f45");
            P("box", -0.5, H, 0.9, 8, 0.28, 7.4, ROOFGREEN);
            P("box", 1.4, H, 2.2, 3.2, 2.5, 2.8, r() < 0.5 ? "#e6e1d6" : brick, S_HOUSE);
            P("box", 1.4, H + 2.5, 2.2, 3.5, 0.22, 3.1, "#3f6f9f");
            roofLife(P, H, r, -2.4, -0.6);
        }

        static void lowApartment(Put P, double H, Func<double> r)
        {
            P("box", 0, 0, 0.9, 9, H, 6.6, pick(APT, r()), S_SLAB, 0, pick(BRAND, r()));
            P("box", 0, H, 0.9, 9.2, 0.4, 6.8, "#d8d3c8");
            P("box", 2.4, H, 2, 2.8, 2.4, 2.6, "#e9e5dc", S_HOUSE);
            P("cyl", -2.6, H, 2, 1.5, 1.6, 1.5, pick(TANK, r()));
            P("box", 0, 0, -3.9, 9, 0.06, 2, "#9d978d");
            P("box", -3.6, 0, -4.7, 1.6, 0.5, 0.5, "#6f9450");
            if (r() < 0.6) P("tree", -3.6, 0.5, -4.6, 1.4, 2.2, 1.4, "#5e8f45");
        }

        static void piloti(Put P, double W, double D, double z, Func<double> r, string wall, double lobbyX)
        {
            double front = z - D / 2, back = z + D / 2;
            P("box", 0, 0, z - 0.6, W + 0.4, 0.05, D + 1.6, "#6a6d70");
            int bays = Math.Max(2, (int)Math.Floor((W - 0.6) / 2.6));
            double bwd = (W - 0.6) / bays;
            for (int k = 0; k <= bays; k++) P("box", -W / 2 + 0.3 + k * bwd, 0.05, front + 2.2, 0.1, 0.02, 4.2, "#eeeae0");
            for (int k = 0; k < bays; k++)
            {
                double x = -W / 2 + 0.3 + (k + 0.5) * bwd;
                if (Math.Abs(x - lobbyX) < 1.8 || r() < 0.2) continue;
                P("box", x, 0.1, front + 2.3, 1.7, 0.8, 4, pick(PARKED, r()));
                P("box", x, 0.9, front + 2.5, 1.5, 0.55, 2, "#2c2f33");
            }
            var czs = new List<double> { front + 0.3, back - 0.3 };
            if (D > 7) czs.Add(z + 0.6);
            foreach (double cz in czs)
            {
                int m = Math.Min(bays, 3);
                for (int k = 0; k <= m; k++)
                {
                    double x = -W / 2 + 0.3 + (k * (W - 0.6)) / m;
                    P("box", x, 0, cz, 0.5, 3, 0.5, "#cfc9bd");
                }
            }
            P("box", lobbyX, 0, back - 1.6, 2.6, 3, 3, wall, S_HOUSE);
            P("box", lobbyX, 0, back - 3.15, 1.4, 2.3, 0.12, "#7d9bb5");
            P("box", lobbyX, 2.4, back - 3.4, 2.2, 0.15, 0.7, "#d8d3c8");
            P("box", 0, 2.75, z, W + 0.2, 0.25, D + 0.2, "#d6d0c4");
        }

        static void pilotiVilla(Put P, double H, Func<double> r, string brick)
        {
            double W = 8.6, D = 7.4, z = 0.5;
            piloti(P, W, D, z, r, brick, 2.6);
            P("box", 0, 3, z, W, H - 3, D, brick, S_FRAMED);
            for (double y = 6; y < H; y += 3) P("box", -1.2, y - 0.1, z - D / 2 - 0.35, 4.2, 1, 0.7, "#e6e1d6");
            P("box", W / 2 + 0.3, 3, z + 1.6, 0.6, H - 3, 2.4, "#e6e1d6", S_HOUSE);
            P("box", 0, H, z, W + 0.2, 0.3, D + 0.2, ROOFGREEN);
            P("box", 2, H, z + 1.4, 3, 2.5, 2.8, "#e6e1d6", S_HOUSE);
            roofLife(P, H, r, -2.2, -0.4);
        }

        static void pilotiApartment(Put P, double H, Func<double> r)
        {
            double W = 9, D = 7.4, z = 0.5;
            string col = pick(APT, r());
            piloti(P, W, D, z, r, "#d9d3c6", -2.9);
            P("box", 0, 3, z, W, H - 3, D, col, S_SLAB, 0, pick(BRAND, r()));
            P("box", 0, H, z, W + 0.2, 0.4, D + 0.2, "#d8d3c8");
            P("box", 2.4, H, z + 1, 2.8, 2.4, 2.6, "#e9e5dc", S_HOUSE);
            P("cyl", -2.6, H, z + 1, 1.5, 1.6, 1.5, pick(TANK, r()));
        }

        static void shopHouse(Put P, int floors, Func<double> r, string ground)
        {
            int f = Math.Max(2, floors); double h = f * 3;
            P("box", 0, 0, 0.3, 8.6, h, 8.2, r() < 0.2 ? pick(BRICKS, r()) : pick(SHOPWALL, r()), S_SHOPHOUSE);
            for (int k = 0; k < f; k++)
            {
                double sw = k == 0 ? 8.2 : 3.6 + r() * 3.6, sx = k == 0 ? 0 : (r() - 0.5) * (8.2 - sw);
                P("box", sx, k * 3 + 2.05, -3.95, sw, 0.85, 0.3, k == 0 ? ground : pick(SIGNS, r()), S_SIGN);
                P("box", sx, k * 3 + 2.3, -4.12, sw * 0.6, 0.35, 0.08, "#f6f1e4");
            }
            P("box", 3.9, 3.4, -4.3, 0.3, Math.Min(h - 3.6, 4), 1.2, pick(SIGNS, r()), S_SIGN);
            P("box", 0, h, 0.3, 8.6, 0.25, 8.2, ROOFGREEN);
            roofLife(P, h, r, -1, 0.5);
        }

        static (double x, double z) avenueShift(World w, Building b)
        {
            int W = bw(b), D = bh(b);
            bool av(int x, int y) => x >= 0 && y >= 0 && x < N && y < N && w.road[y * N + x] == Road.Avenue;
            int wW = 0, wE = 0, wN = 0, wS = 0;
            for (int k = 0; k < D; k++) { if (av(b.x - 1, b.y + k)) wW = 1; if (av(b.x + W, b.y + k)) wE = 1; }
            for (int k = 0; k < W; k++) { if (av(b.x + k, b.y - 1)) wN = 1; if (av(b.x + k, b.y + D)) wS = 1; }
            return ((wW - wE) * Curves.AVENUE_SPILL, (wN - wS) * Curves.AVENUE_SPILL);
        }

        static int? accessOf(World w, Building b) => Network.network(w).access.TryGetValue(b.id, out int a) ? a : (int?)null;

        /// <summary>The kind's model on its usual square lot at (bx, by) cells (fractional when stretched).</summary>
        static List<Part> rawParts(Building b, World w, double bx, double by)
        {
            var r = seq(b.look + b.id * 0.0137);
            double S = b.size * CELL;
            double cx = bx * CELL + S / 2, cz = by * CELL + S / 2;
            var output = new List<Part>();
            void box(double x, double y, double z, double sx, double sy, double sz, string color, int style = S_PLAIN, string sign = null, double rt = 0) =>
                output.Add(new Part { shape = "box", x = cx + x, y = y, z = cz + z, sx = sx, sy = sy, sz = sz, rot = rt, color = color, style = style, sign = sign });
            void shape(string s, double x, double y, double z, double sx, double sy, double sz, string color, double rt = 0) =>
                output.Add(new Part { shape = s, x = cx + x, y = y, z = cz + z, sx = sx, sy = sy, sz = sz, rot = rt, color = color, style = S_PLAIN });
            double H = b.floors * 3;
            int? a = accessOf(w, b);
            double along = a == null ? 0 : Math.Abs((a.Value % N) * CELL + 5 - cx) > Math.Abs(Math.Floor(a.Value / (double)N) * CELL + 5 - cz) ? PI / 2 : 0;
            double rot = PI;
            if (a != null)
            {
                double dx = (a.Value % N) * CELL + CELL / 2.0 - cx, dz = Math.Floor(a.Value / (double)N) * CELL + CELL / 2.0 - cz;
                rot = Math.Abs(dx) > Math.Abs(dz) ? (dx > 0 ? -PI / 2 : PI / 2) : dz > 0 ? PI : 0;
            }
            double c0 = Math.Cos(rot), s0 = Math.Sin(rot);
            Put P = (s, dx, dy, dz, ww, h, d, color, style, dr, sign) =>
                output.Add(new Part { shape = s, x = cx + dx * c0 + dz * s0, y = dy, z = cz - dx * s0 + dz * c0, sx = ww, sy = h, sz = d, rot = rot + dr, color = color, style = style, sign = sign });
            switch (b.kind)
            {
                case "r1":
                {
                    int v = variantOf("r1", b.look);
                    if (v == 0)
                    {
                        P("box", 0, 0, 0.6, 7.4, 5.6, 7, pick(new[] { "#efe6d2", "#e8dcc6", "#f1ece2" }, r()), S_HOUSE);
                        P("gable", 0, 5.6, 0.6, 8.2, 3, 7.8, pick(new[] { "#b5503b", "#3f6f9f", "#4d7a52", "#7a4a3a" }, r()));
                        P("box", 0, 0, -4.7, 9.4, 1.4, 0.35, pick(BRICKS, r()));
                    }
                    else if (v == 1)
                    {
                        double h = r() < 0.5 ? 5.8 : 3;
                        P("box", 0, 0, 0.6, 7.8, h, 7.2, r() < 0.3 ? pick(BRICKS, r()) : pick(CEMENT, r()), S_HOUSE);
                        P("box", 0, h, 0.6, 8, 0.45, 7.4, "#bdb6a8");
                        roofLife(P, h, r, 0, 0.6);
                        P("box", -1, 0, -4.7, 7.4, 1.5, 0.35, BLOCK);
                        P("box", 3.5, 0, -4.7, 2, 1.9, 0.22, "#3d7a5a");
                    }
                    else if (v == 2)
                    {
                        string roof = pick(GIWA, r());
                        P("box", 0, 0, 2, 8.8, 0.45, 4, STONE);
                        P("box", 0, 0.45, 2, 7.6, 2.5, 2.8, PLASTER, S_HANOK);
                        P("hanok", 0, 2.95, 2, 9.6, 2, 4.6, roof);
                        double sx = r() < 0.5 ? -1 : 1;
                        P("box", sx * 3, 0, -1.6, 2.8, 0.4, 3.4, STONE);
                        P("box", sx * 3, 0.4, -1.6, 2, 2.2, 3, PLASTER, S_HANOK);
                        P("hanok", sx * 3, 2.6, -1.6, 4.2, 1.5, 3, roof, S_PLAIN, PI / 2);
                        P("box", -sx * 1, 0, -4.6, 7.6, 1.5, 0.35, "#d6cab1");
                        P("box", -sx * 1, 1.5, -4.6, 7.7, 0.25, 0.7, roof);
                        P("box", -sx * 3.9, 0, -4.6, 0.5, 2.2, 0.5, TIMBER);
                    }
                    else brickVilla(P, Math.Max(2, b.floors) * 3, r, pick(BRICKS, r()));
                    break;
                }
                case "r2":
                {
                    int v = variantOf("r2", b.look);
                    if (v == 0) brickVilla(P, H, r, pick(BRICKS, r()));
                    else if (v == 1)
                    {
                        string tile = pick(TILES, r());
                        foreach (var (px, pz) in new[] { (-3.8, -3.4), (3.8, -3.4), (-3.8, 3.8), (3.8, 3.8) }) P("box", px, 0, pz, 0.6, 3, 0.6, "#bdb6a8");
                        P("box", 0, 3, 0.2, 8.6, H - 3, 7.8, tile, S_FRAMED);
                        P("box", 0, 0, 0, 8, 0.06, 8.6, "#9d978d");
                        P("box", -3, 0, -4.6, 3.4, 0.5, 0.6, "#6f9450");
                        P("box", 0, H, 0.2, 8.8, 0.3, 8, ROOFGREEN);
                        P("box", 1.8, H, 1.6, 3.2, 2.5, 2.8, "#e6e1d6", S_HOUSE);
                        P("box", 1.8, H + 2.5, 1.6, 3.5, 0.22, 3.1, "#3f6f9f");
                        roofLife(P, H, r, -2, -1);
                    }
                    else if (v == 4) pilotiVilla(P, Math.Max(12, H), r, pick(BRICKS, r()));
                    else if (v == 5) pilotiApartment(P, Math.Max(15, H), r);
                    else lowApartment(P, H, r);
                    break;
                }
                case "r3":
                    output.AddRange(complex(b));
                    break;
                case "c1":
                {
                    int v = variantOf("c1", b.look);
                    shopHouse(P, b.floors, r, C1_SIGN[v]);
                    if (v == 2) P("prism", 0, 2.5, -4.3, 7, 0.6, 1.2, "#2f5a43");
                    break;
                }
                case "c2":
                {
                    int v = variantOf("c2", b.look);
                    shopHouse(P, b.floors, r, v == 1 ? "#f2c12e" : v == 2 ? "#2fa35a" : pick(SIGNS, r()));
                    if (v == 3)
                    {
                        output.Add(new Part { shape = "neon", x = cx, y = H + 0.3, z = cz, sx = 0.32, sy = 3.4, sz = 0.32, rot = 0, color = "#ff3b30", style = 0 });
                        output.Add(new Part { shape = "neon", x = cx, y = H + 2.5, z = cz, sx = 1.7, sy = 0.32, sz = 0.32, rot = 0, color = "#ff3b30", style = 0 });
                    }
                    break;
                }
                case "c3":
                {
                    if (variantOf("c3", b.look) == 2) { bigMart(b, w, output); break; }
                    P("box", 0, 0, 0, 18.4, 9, 18.4, "#b9b4ab", S_SHOPS, 0, pick(SIGN, r()));
                    double tw = 11 + r() * 3, td = 10 + r() * 3;
                    string glass = pick(new[] { "#7c90a6", "#8aa1a8", "#6d7f94", "#9aa7b4" }, r());
                    P("box", 0, 9, 0, tw, H - 9, td, glass, S_OFFICE);
                    double top = H;
                    if (r() < 0.5) { P("box", 0, H, 0, tw * 0.7, 6, td * 0.7, glass, S_OFFICE); top += 6; }
                    P("box", 0, top, 0, 3, 2.5, 3, "#c9cbcc");
                    for (int k = 0; k < 3; k++) P("box", -tw * 0.3 + k * 1.6, top, td * 0.3, 1.2, 1.1, 1.6, "#b4b8bc");
                    if (r() < 0.35) { P("cyl", tw * 0.15, top, -td * 0.15, 5.2, 0.15, 5.2, "#4a4f55"); P("box", tw * 0.15, top + 0.16, -td * 0.15, 2.4, 0.02, 0.4, "#f2c14a"); }
                    break;
                }
                case "i1":
                {
                    int v = variantOf("i1", b.look);
                    if (v == 0)
                    {
                        P("box", 0, 0, 0, 9.4, 0.08, 9.4, "#8a7a5c");
                        foreach (double dx in new[] { -3.0, 0, 3 }) P("vault", dx, 0.08, 0.3, 8.4, 2.4, 2.6, "#eef4f0", S_PLAIN, PI / 2);
                        P("box", 3.6, 0.08, -4.3, 1.6, 1.4, 0.8, "#3f6f9f");
                    }
                    else if (v == 1)
                    {
                        P("box", 0, 0, 0, 9.4, 0.1, 9.4, "#7a6a4a");
                        string crop = r() < 0.5 ? "#7fae4f" : "#d8b75a";
                        for (int k = 0; k < 5; k++) P("box", -1, 0.1, -3.8 + k * 1.7, 6.6, 0.3, 1, crop);
                        P("box", 3.4, 0.1, 2.8, 2.4, 2.2, 2.2, "#cfc8b8", S_HOUSE);
                        P("gable", 3.4, 2.3, 2.8, 2.8, 0.9, 2.6, "#3f6f9f");
                    }
                    else if (v == 2)
                    {
                        P("box", 0, 0, 0.8, 8.6, 2.6, 5.6, "#e3ddcf", S_FACTORY);
                        P("gable", 0, 2.6, 0.8, 9, 1.5, 6.2, pick(new[] { "#b5503b", "#3f6f9f" }, r()));
                        P("cyl", 3.4, 0, -3.3, 1.8, 6, 1.8, "#cfd3d6");
                        P("cyl", 3.4, 6, -3.3, 1.9, 0.6, 1.9, "#9aa0a6");
                        P("box", -1.5, 0, -4.4, 6, 1.1, 0.15, "#8a6a4a");
                    }
                    else
                    {
                        P("box", 0, 0, 0, 9.4, 0.06, 9.4, "#7d9b4f");
                        string fruit = pick(new[] { "#5e8f45", "#6f9a3f", "#7aa04a" }, r());
                        foreach (double dx in new[] { -3.0, 0, 3 }) foreach (double dz in new[] { -3.0, 0, 3 })
                        {
                            P("box", dx, 0.06, dz, 0.25, 1.2, 0.25, "#6b5440");
                            P("tree", dx, 0.9, dz, 2.2, 2.2, 2.2, fruit);
                        }
                    }
                    break;
                }
                case "i2":
                {
                    int v = variantOf("i2", b.look);
                    double h = 4 + b.floors * 1.6;
                    P("box", 0, 0, 0, 9, h, 8.6, v == 2 ? "#e8e6e0" : pick(new[] { "#cfc8b8", "#c9c2b4", "#d6d0c2" }, r()), S_FACTORY);
                    string roof = pick(new[] { "#4a78a8", "#4a78a8", "#5d86b2", "#3f6f9f" }, r());
                    for (int k = 0; k < 2; k++) P("gable", 0, h, -2.15 + k * 4.3, 9.2, 1.6, 4.4, roof);
                    if (v == 0) P("cyl", 3.4, 0, 3.4, 1.2, h + 9, 1.2, "#b25b44");
                    else if (v == 1) P("cyl", -3.2, 0, 3.4, 2.2, 3.2, 2.2, "#d1d6d9");
                    else foreach (double dx in new[] { -3, -0.6 }) P("cyl", dx, 0, 3.6, 2, h + 3, 2, "#dfe3e6");
                    break;
                }
                case "i3":
                {
                    int v = variantOf("i3", b.look);
                    if (v == 0)
                    {
                        P("box", 0, 0, 2, 18, 6, 15, "#d8d5cc", S_FACTORY);
                        P("box", 0, 6, 3, 16, Math.Max(12, H) - 6, 11, pick(new[] { "#9fb2c2", "#a7b4bd", "#8ea7b9" }, r()), S_OFFICE);
                        P("box", 0, Math.Max(12, H), 3, 6, 2.4, 5, "#c9cbcc");
                        P("prism", -6.5, 0, -7.2, 4, 2.2, 3.4, "#9d978d");
                    }
                    else if (v == 1)
                    {
                        P("box", 0, 0, 1, 18.4, 13, 15.6, "#e8e6e0", S_PLAIN);
                        P("box", 0, 10.6, -6.85, 18.4, 1.4, 0.3, pick(new[] { "#2f6db3", "#d9473b", "#2e9e4f" }, r()), S_SIGN);
                        for (int k = -3; k <= 3; k++) P("box", k * 2.5, 0, -6.95, 1.8, 3.2, 0.2, "#4a4f55");
                        foreach (double dx in new[] { -5.0, 0, 5 }) P("box", dx, 0, -9, 2.3, 3.4, 1.6, "#f2f2f0");
                    }
                    else
                    {
                        P("box", 0, 0, 1.5, 17, 10, 14, "#c9ccd0", S_PLAIN);
                        foreach (double dx in new[] { -5.5, -1.8, 1.8, 5.5 }) foreach (double dz in new[] { -2.5, 2, 6.5 })
                        {
                            P("box", dx, 10, dz, 2.6, 1.2, 2.6, "#9aa0a6");
                            P("cyl", dx, 11.2, dz, 1.8, 0.2, 1.8, "#5d6670");
                        }
                        P("box", -4, 0, -7.2, 7, 4, 3, pick(GLASSES, r()), S_OFFICE);
                        P("box", 0, 0, -9.6, 18.8, 1.8, 0.1, "#8d9399");
                    }
                    break;
                }
                case "office":
                {
                    P("box", 0, 0, 0.8, 8.4, 9, 7.4, "#ece6da", S_APT, 0, "#2f6db3");
                    P("box", 0, 3, -3.2, 4.4, 0.25, 1.6, "#cfc8ba");
                    P("box", 0, 3.6, -3.05, 4.2, 0.9, 0.2, "#2f6db3", S_SIGN);
                    foreach (double fx in new[] { -3.4, -2.6, -1.8 })
                    {
                        P("cyl", fx, 0, -4.3, 0.12, 6.5, 0.12, "#e8e8e8");
                        P("box", fx + 0.45, 5.6, -4.3, 0.9, 0.6, 0.04, fx == -2.6 ? "#f2f2f0" : fx == -3.4 ? "#2f6db3" : "#e8e2d4");
                    }
                    break;
                }
                case "post":
                    P("box", 0, 0, 0.6, 8.4, 6, 7.6, "#e8e2d4", S_SHOPHOUSE);
                    P("box", 0, 4.4, -3.25, 7, 1, 0.3, "#d9473b", S_SIGN);
                    P("box", 3.4, 0, -4.4, 0.6, 1.2, 0.5, "#d9473b");
                    P("box", 3.4, 1.2, -4.4, 0.7, 0.15, 0.6, "#b8362b");
                    P("box", -2.5, 0, -4.2, 2.4, 1.6, 1.4, "#e6e1d6");
                    break;
                case "hospital":
                    P("box", 0, 0, 2.5, 15, 24, 9, "#f2f4f4", S_APT, 0, "#2fa35a");
                    P("box", -3, 0, -4, 9, 8, 5, "#e6ebeb", S_OFFICE);
                    P("box", 0, 24, 2.5, 4.4, 0.6, 1.4, "#2fa35a");
                    P("box", 0, 24, 2.5, 1.4, 0.6, 4.4, "#2fa35a");
                    P("box", -3, 8, -4, 9.6, 0.4, 5.6, "#2fa35a");
                    P("box", 5, 0, -7, 6, 0.1, 4, "#8a8d91");
                    P("box", 5, 0.1, -7, 3.6, 2.2, 1.8, "#ffffff");
                    P("box", 5, 2.3, -7, 1.2, 0.4, 0.6, "#d9473b");
                    P("cyl", 4.5, 24, 5.5, 3.2, 0.3, 3.2, "#c9ced4");
                    break;
                case "medlab":
                    P("box", 0, 0, 2, 16, 12, 10, "#9fc8d8", S_OFFICE);
                    P("cyl", 0, 12, 2, 15, 1.6, 9, "#e7ebee");
                    P("box", -5, 0, -5, 5, 6, 4, "#e8eef2", S_OFFICE);
                    for (int k = 0; k < 6; k++) { double an = k * 1.05; P("box", 4 + Math.Cos(an) * 0.8, k * 1.1, -6 + Math.Sin(an) * 0.8, 0.5, 0.5, 0.5, k % 2 != 0 ? "#4fb3d9" : "#f29bb8"); }
                    P("cyl", 4, 0, -6, 0.15, 6.6, 0.15, "#d8dde2");
                    break;
                case "university":
                    P("box", 0, 0, 8, 26, 9, 8, "#d8cdb8", S_HOUSE);
                    P("gable", 0, 9, 8, 26.6, 3, 8.6, "#7a4a3a");
                    P("box", 0, 0, 7, 5, 22, 5, "#d0c4ac", S_HOUSE);
                    P("box", 0, 17, 4.4, 2.4, 2.4, 0.2, "#f4f1ea");
                    P("gable", 0, 22, 7, 5.4, 4, 5.4, "#7a4a3a");
                    foreach (double sx in new[] { -10.0, 10 }) { P("box", sx, 0, -3, 6, 7, 14, "#ddd3c0", S_HOUSE); P("gable", sx, 7, -3, 6.6, 2.4, 14.6, "#7a4a3a"); }
                    P("box", 0, 0, -6, 12, 0.1, 10, "#7fae55");
                    foreach (double tx in new[] { -4.0, 4 }) { P("box", tx, 0, -9, 0.3, 1.6, 0.3, "#6b5440"); P("tree", tx, 1.3, -9, 3, 3, 3, "#5e8f45"); }
                    break;
                case "techpark":
                    P("box", 0, 0, 0, 18, 5, 16, "#cfd6dc", S_OFFICE);
                    P("box", -4.5, 5, 2.5, 7, 30, 7, "#6fa3c8", S_OFFICE);
                    P("box", 4.5, 5, -2.5, 7, 22, 7, "#8ab8d6", S_OFFICE);
                    P("box", 0, 20, 0, 3, 2, 2, "#e7ebee", S_OFFICE);
                    P("cyl", -4.5, 35, 2.5, 0.25, 7, 0.25, "#d8dde2");
                    P("box", 0, 5.2, -7.6, 8, 1, 0.3, "#2f6db3", S_SIGN);
                    break;
                case "library":
                    P("box", 0, 0, 2.5, 17, 7, 11, "#d9cdb5", S_HOUSE);
                    P("box", -3, 0, -3.4, 9, 6, 1.2, "#8aa5b8", S_OFFICE);
                    P("gable", 0, 7, 2.5, 17.6, 2, 11.6, "#6b7f8f");
                    P("box", 4, 5.2, -3.15, 5, 0.9, 0.3, "#3d9a62", S_SIGN);
                    P("box", 4, 0, -7, 8, 0.08, 4.4, "#7fae55");
                    foreach (double tx in new[] { 1.5, 6.5 }) { P("box", tx, 0, -7, 0.25, 1.4, 0.25, "#6b5440"); P("tree", tx, 1.1, -7, 2.6, 2.6, 2.6, "#5e8f45"); }
                    P("box", 4, 0, -8.6, 2, 0.45, 0.5, "#8a6a4a");
                    break;
                case "terminal":
                    P("box", 0, 0, 9, 26, 9, 9, "#e3ded2", S_SHOPHOUSE);
                    P("box", 0, 6.6, 4.35, 18, 1.6, 0.35, "#2f6db3", S_SIGN);
                    P("box", 0, 0, -1, 28, 0.15, 17, "#5a5d61");
                    for (int k = -4; k <= 4; k++) P("box", k * 3, 0.15, -2, 0.12, 0.02, 9, "#eeeeea");
                    P("box", 0, 5.2, -1, 28, 0.4, 10, "#d8d5cc");
                    foreach (double px in new[] { -12.0, -6, 0, 6, 12 }) foreach (double pz in new[] { -5.0, 3 }) P("box", px, 0, pz, 0.4, 5.2, 0.4, "#9d9a92");
                    for (int k = -4; k <= 3; k++)
                    {
                        if (r() < 0.25) continue;
                        string coach = pick(new[] { "#f2f2f0", "#2f6db3", "#f2f2f0", "#1f4e9a" }, r());
                        P("box", k * 3 + 1.5, 0.15, -2, 2.3, 3.3, 11, coach, S_PLAIN);
                        P("box", k * 3 + 1.5, 1.6, -2, 2.34, 1, 10.6, "#2c3e50");
                    }
                    break;
                case "ktx":
                    P("box", 0, 0, -6, 22, 11, 9, "#8aa5b8", S_OFFICE);
                    P("box", 0, 11, -6, 24, 0.8, 11, "#eef0f2");
                    P("box", 0, 8.6, -10.6, 12, 1.6, 0.3, "#1f4e9a", S_SIGN);
                    P("box", 0, 0, 5.5, 30, 1.2, 12, "#b9b4ab");
                    foreach (double tz in new[] { 3.0, 8 }) foreach (double rx in new[] { -0.7, 0.7 }) P("box", 0, 1.2, tz + rx, 30, 0.2, 0.12, "#6b6f75");
                    P("box", 0, 1.2, 5.5, 28, 0.25, 2.2, "#cfc9bd");
                    P("box", 0, 5.8, 5.5, 28, 0.3, 5, "#eef0f2");
                    foreach (double px in new[] { -12.0, -4, 4, 12 }) P("box", px, 1.2, 5.5, 0.4, 4.6, 0.4, "#9d9a92");
                    P("box", -1, 1.4, 8, 24, 3.6, 3, "#f2f2f0");
                    P("box", -1, 2.2, 8, 24.05, 0.5, 3.05, "#2f6db3");
                    P("box", -1, 3, 8, 24.05, 0.6, 3.05, "#2c3e50");
                    P("prism", 12.5, 1.4, 8, 3, 3.2, 3, "#f2f2f0", S_PLAIN, -PI / 2);
                    break;
                case "bike":
                    P("box", 0, 0, -1, 8, 0.12, 3, "#9d978d");
                    P("box", 0, 0.12, 0, 7.2, 0.6, 0.2, "#6f7378");
                    for (int k = -3; k <= 3; k++)
                    {
                        if (r() < 0.25) continue;
                        P("box", k, 0.3, -0.9, 0.12, 0.7, 1.7, "#3d9a62");
                        P("box", k, 0.12, -0.2, 0.08, 0.6, 0.6, "#2c2f33");
                        P("box", k, 0.12, -1.6, 0.08, 0.6, 0.6, "#2c2f33");
                    }
                    P("box", 3.6, 0, -2.4, 0.8, 1.6, 0.5, "#3d9a62");
                    break;
                case "trailhead":
                    P("box", -3.5, 0, -3.6, 0.35, 3.2, 0.35, TIMBER);
                    P("box", -0.9, 0, -3.6, 0.35, 3.2, 0.35, TIMBER);
                    P("box", -2.2, 2.7, -3.6, 3.3, 0.6, 0.3, "#8a6a4a", S_SIGN);
                    P("box", -2.2, 0, 1, 2.2, 0.06, 9.6, "#b59b72");
                    P("box", 2.6, 0, 1.4, 4.4, 0.4, 5, STONE);
                    P("box", 2.6, 0.4, 1.4, 3.6, 2.4, 4, PLASTER, S_HANOK);
                    P("hanok", 2.6, 2.8, 1.4, 5.2, 1.5, 5.6, pick(GIWA, r()), S_PLAIN, PI / 2);
                    P("box", 2.6, 2, -0.65, 2.4, 0.6, 0.2, "#c0392b", S_SIGN);
                    P("box", 2.4, 0, -2.6, 2.4, 0.5, 1.6, "#8a6a4a");
                    break;
                case "jjim":
                    if (variantOf("jjim", b.look) == 0)
                    {
                        P("box", 0, 0, 1, 17, 12, 15, "#e8d9c4", S_SHOPHOUSE);
                        P("box", 0, 8.4, -6.65, 12, 2.4, 0.35, "#e8743b", S_SIGN);
                        P("box", 0, 12, 1, 17.2, 0.3, 15.2, ROOFGREEN);
                        P("hip", -4, 12.3, 3, 6, 2.6, 6, "#d9473b");
                        P("cyl", 6, 12.3, 5, 1.4, 6, 1.4, "#c8b8a2");
                    }
                    else
                    {
                        P("box", 0, 0, 1, 15, 6, 13, "#cfe0e8", S_HOUSE);
                        P("box", 0, 6, 1, 15.2, 0.4, 13.2, ROOFGREEN);
                        P("box", 0, 4.2, -5.65, 7, 1.4, 0.3, "#2f6db3", S_SIGN);
                        P("cyl", 5.5, 0, 5, 1.8, 18, 1.8, "#c8b8a2");
                        P("cyl", 5.5, 15.2, 5, 1.95, 1.4, 1.95, "#c0392b");
                    }
                    break;
                case "coal":
                    box(-3, 0, 2, 16, 15, 12, "#a7a199", S_FACTORY);
                    box(-3, 15, 2, 16, 1, 12, "#7d7a74");
                    shape("cyl", 7, 0, -6, 2.4, 46, 2.4, "#d8d2c8");
                    shape("cyl", 3, 0, -6, 2.4, 46, 2.4, "#d8d2c8");
                    shape("cyl", 7, 40, -6, 2.5, 4, 2.5, "#c0392b");
                    shape("cyl", 3, 40, -6, 2.5, 4, 2.5, "#c0392b");
                    shape("cone", -8, 0, -8, 11, 20, 11, "#cfcac0");
                    shape("prism", 9, 0, 9, 9, 3.5, 9, "#2a2a2c");
                    break;
                case "solar":
                    box(0, 0, 0, 19, 0.2, 19, "#a7a395");
                    for (int k = 0; k < 5; k++) shape("prism", 0, 0.2, -7.6 + k * 3.8, 17, 1.6, 2.8, "#24365e");
                    break;
                case "water":
                    box(-7, 0, -7, 12, 8, 10, "#dfe3e6", S_APT, "#2f77b5");
                    foreach (var (px, pz) in new[] { (6.0, -6.0), (6.0, 6.0), (-6.0, 7.0) })
                    {
                        shape("cyl", px, 0, pz, 9, 2.4, 9, "#c7cfd4");
                        shape("cyl", px, 2.4, pz, 8, 0.05, 8, "#4a8db5");
                    }
                    break;
                case "well":
                    box(-4, 0, -3, 7, 3.4, 6, "#e3ded2", S_FACTORY);
                    shape("gable", -4, 3.4, -3, 7.4, 1.4, 6.4, "#3f6f9f");
                    foreach (var (px, pz) in new[] { (-5.0, 5.5), (5.0, 6.5), (6.5, -6.5) })
                    {
                        box(px, 0, pz, 2.2, 0.3, 2.2, "#b9b4ab");
                        shape("cyl", px, 0.3, pz, 0.8, 1.3, 0.8, "#2f77b5");
                    }
                    box(1, 0.5, 6, 8, 0.25, 0.25, "#8d9399");
                    box(5.5, 0.5, -1, 0.25, 0.25, 11, "#8d9399");
                    foreach (var (px, pz) in new[] { (3.0, -6.5), (8.0, -6.5), (3.0, -1.5), (8.0, -1.5) }) box(px, 0, pz, 0.4, 6, 0.4, "#8d9399");
                    shape("cyl", 5.5, 6, -4, 6, 3.6, 6, "#dfe6ea");
                    shape("cyl", 5.5, 9.6, -4, 6.2, 0.3, 6.2, "#2f77b5");
                    break;
                case "sewage":
                    foreach (double pz in new[] { -5.0, 4 })
                    {
                        box(-3, 0, pz, 11, 1.6, 7, "#b6b2a8");
                        box(-3, 1.6, pz, 10, 0.05, 6, "#6d7f5a");
                    }
                    shape("cyl", 6, 0, 0, 6, 2, 6, "#b6b2a8");
                    shape("cyl", 6, 2, 0, 5.2, 0.05, 5.2, "#7a8a62");
                    break;
                case "park":
                    if (b.look < 0.4) { box(0, 0, 0, 3.4, 2.6, 3.4, "#8a5a3a"); shape("prism", 0, 2.6, 0, 4.6, 1.4, 4.6, "#6b3d2a"); }
                    else if (b.look < 0.7) shape("cyl", 0, 0, 0, 3.2, 0.5, 3.2, "#c9c2b0");
                    break;
                case "school":
                    box(Math.Sin(along) * 4.5, 0, Math.Cos(along) * 4.5, 17, 12, 6, "#e8dcc0", S_APT, "#2f6db5", along);
                    box(Math.Sin(along) * 4.5 + Math.Cos(along) * 7, 12, Math.Cos(along) * 4.5 - Math.Sin(along) * 7, 3, 3, 3, "#d8ccb0");
                    break;
                case "police": box(0, 0, 0, 8, 9, 8, "#e9edf2", S_APT, "#1f4e9a"); break;
                case "fire":
                    box(0, 0, 0, 8.4, 7.5, 8, "#efe9e1", S_APT, "#c0392b");
                    box(0, 0, 3.8, 6, 4, 0.6, "#b03a2e");
                    box(-3, 7.5, -2.5, 2.2, 6, 2.2, "#efe9e1");
                    break;
                case "snowbase":
                    box(-2, 0, -2, 5.5, 3.2, 5, "#e3ded2", S_PLAIN);
                    shape("cyl", 2.6, 0, 1.4, 3.6, 2.6, 3.6, "#b9b4a8");
                    shape("cyl", 2.6, 2.6, 1.4, 2.4, 1.0, 2.4, "#f2f2ee");
                    box(-2.2, 0, 3.2, 2, 1.6, 3.4, "#e8812b");
                    box(-2.2, 1.6, 2.4, 1.9, 0.9, 1.4, "#2c2f33");
                    box(-2.2, 0, 5.1, 2.8, 0.7, 0.3, "#f3c623");
                    break;
                case "metro":
                    box(0, 0, 0, 5.2, 0.4, 7.4, "#5b6066");
                    box(0, 0.4, 1.2, 4.2, 2.6, 4.6, "#a7c4d6", S_OFFICE);
                    box(0, 3.0, 0.6, 4.8, 0.35, 6.2, "#e7ebee");
                    box(-3.2, 0, -2.6, 0.5, 4.2, 0.5, "#e7ebee");
                    box(-3.2, 4.2, -2.6, 1.6, 1.0, 0.4, "#263c96");
                    break;
                case "parking":
                {
                    box(0, 0, 0, 9.4, 0.14, 9.4, "#55585c");
                    for (int k = -2; k <= 2; k++) { box(k * 2.3, 0.14, -2.6, 0.12, 0.02, 4, "#eeeeea"); box(k * 2.3, 0.14, 2.6, 0.12, 0.02, 4, "#eeeeea"); }
                    foreach (double k in new[] { -1.5, -0.5, 0.5, 1.5 }) foreach (double zz in new[] { -2.6, 2.6 })
                    {
                        if (r() < 0.35) continue;
                        string col = pick(new[] { "#f2f2f0", "#1b1c1e", "#a9adb2", "#6f7378", "#2a3d66", "#8c1d1d" }, r());
                        box(k * 2.3, 0.14, zz, 1.7, 0.8, 3.9, col);
                        box(k * 2.3, 0.94, zz, 1.5, 0.55, 2.0, "#2c2f33");
                    }
                    box(-4.3, 0, -4.3, 0.15, 3, 0.15, "#8c9196");
                    box(-4.3, 2.4, -4.3, 1.1, 1.1, 0.15, "#2f6db5", S_PLAIN);
                    break;
                }
                case "parktower":
                {
                    double H2 = b.floors * 2.6;
                    for (int f = 0; f < b.floors; f++)
                    {
                        box(0, f * 2.6, 0, 8.8, 0.35, 8.8, "#b4b1a9");
                        if (f != 0) foreach (double x in new[] { -3.0, 0, 3 }) box(x, f * 2.6 + 0.35, (r() - 0.5) * 4, 1.6, 0.9, 3.6, pick(new[] { "#f2f2f0", "#1b1c1e", "#a9adb2", "#2a3d66", "#8c1d1d" }, r()));
                        foreach (var (x, zz) in new[] { (-4.2, -4.2), (4.2, -4.2), (-4.2, 4.2), (4.2, 4.2) }) box(x, f * 2.6, zz, 0.5, 2.6, 0.5, "#9d9a92");
                    }
                    box(0, H2, 0, 8.8, 0.4, 8.8, "#9d9a92");
                    box(0, H2 + 0.4, 4.2, 2.4, 2.4, 0.3, "#2f6db5");
                    box(-0.3, H2 + 0.9, 4.4, 0.4, 1.5, 0.1, "#ffffff");
                    box(0.15, H2 + 1.85, 4.4, 0.6, 0.45, 0.1, "#ffffff");
                    box(0.35, H2 + 1.35, 4.4, 0.25, 0.5, 0.1, "#ffffff");
                    box(0.15, H2 + 1.1, 4.4, 0.6, 0.3, 0.1, "#ffffff");
                    break;
                }
                case "market":
                    foreach (double zz in new[] { -4.6, 4.6 })
                    {
                        box(0, 0, zz, 18, 3, 3.2, "#d9cfbf", S_SHOPS, pick(SIGN, r()));
                        for (int k = 0; k < 4; k++) shape("prism", -6.75 + k * 4.5, 2.4, zz - Math.Sign(zz) * 2.1, 4.2, 0.7, 1.2, pick(new[] { "#d9483b", "#2f6db5", "#e0a400", "#2e9e4f" }, r()), zz > 0 ? 0 : PI);
                    }
                    shape("vault", 0, 4.2, 0, 19, 3.2, 12.4, "#a9cfe3");
                    box(-9.6, 0, -6.4, 0.5, 6.4, 0.5, "#7a3b2e");
                    box(-9.6, 0, 6.4, 0.5, 6.4, 0.5, "#7a3b2e");
                    box(-9.6, 6.0, 0, 0.6, 1.4, 13.4, "#c0392b");
                    break;
                case "riverpark":
                    box(0, 0, 3, 19.6, 0.06, 2, "#d9c08a");
                    box(-6, 0, -4, 3.4, 2.8, 3, "#f4f6f6", S_SHOPS, "#2bb24c");
                    foreach (var (x, zz, col) in new[] { (2.0, -5.0, "#e74c3c"), (6.0, -3.0, "#3498db"), (3.0, -1.0, "#f1c40f") })
                    {
                        shape("prism", x, 0, zz, 2.2, 1.4, 1.1, col, 0);
                        shape("prism", x, 0, zz - 1.1, 2.2, 1.4, 1.1, col, PI);
                    }
                    foreach (double x in new[] { -2.0, 8 }) box(x, 0, 6, 1.6, 0.45, 0.5, "#8a5a3a");
                    break;
                case "palace":
                {
                    double S2 = 13.5;
                    foreach (var q in new[] { new[] { 0, -S2, 27, 0.8 }, new[] { 0, S2, 27, 0.8 }, new[] { -S2, 0, 0.8, 27 }, new[] { S2, 0, 0.8, 27 } })
                    {
                        box(q[0], 0, q[1], q[2], 2.6, q[3], "#d8cfc0");
                        box(q[0], 2.6, q[1], q[2] + 0.6, 0.5, q[3] + 0.6, "#4a4f55");
                    }
                    box(0, 0, -2, 20, 1.4, 14, "#cfc8b8");
                    box(0, 1.4, -2, 15, 4.6, 8, "#a33b2c");
                    box(0, 6, -2, 18.5, 0.7, 11.5, "#2f6b5e");
                    shape("prism", 0, 6.7, -2 + 3, 19, 4.2, 6, "#474c52", PI);
                    shape("prism", 0, 6.7, -2 - 3, 19, 4.2, 6, "#474c52", 0);
                    box(0, 0, S2, 7, 4.6, 3, "#a33b2c");
                    box(0, 4.6, S2, 8.6, 0.5, 4.4, "#2f6b5e");
                    shape("prism", 0, 5.1, S2 + 1.1, 9, 2.4, 2.2, "#474c52", PI);
                    shape("prism", 0, 5.1, S2 - 1.1, 9, 2.4, 2.2, "#474c52", 0);
                    break;
                }
                case "tower":
                    box(0, 0, 0, 9, 4, 7, "#e7ebee", S_OFFICE);
                    shape("cyl", 0, 4, 0, 3.2, 50, 3.2, "#eef0f2");
                    shape("cyl", 0, 46, 0, 10, 6, 10, "#d5dadf");
                    shape("cyl", 0, 52, 0, 7, 3, 7, "#c9ced4");
                    shape("cyl", 0, 55, 0, 1.1, 20, 1.1, "#e05a4f");
                    output.Add(new Part { shape = "neon", x = cx, y = 75, z = cz, sx = 1.4, sy = 1.4, sz = 1.4, rot = 0, color = "#ff3b30", style = 0 });
                    break;
                case "clinic":
                    box(0, 0, 0, 8.4, 9, 8.4, "#f4f6f6", S_APT, "#2fa35a");
                    box(0, 9, 0, 4, 0.5, 1.2, "#2fa35a");
                    box(0, 9, 0, 1.2, 0.5, 4, "#2fa35a");
                    break;
            }
            return output;
        }

        /// <summary>The parts of one building, fitted to its lot, curves, avenues and diagonals.</summary>
        public static List<Part> parts(Building b, World w) => clearDiagonals(b, w, squeeze(b, w, lotParts(b, w)));

        struct Seg4 { public double ax, az, bx, bz; public int t; }

        static List<Seg4> diagonalsNear(Building b, World w)
        {
            int W = bw(b), D = bh(b);
            var o = new List<Seg4>();
            bool inLot(int x, int y) => x >= b.x && x < b.x + W && y >= b.y && y < b.y + D;
            for (int y = b.y - 1; y <= b.y + D; y++) for (int x = b.x - 1; x <= b.x + W; x++)
            {
                if (x < 0 || y < 0 || x >= N || y >= N) continue;
                int i = y * N + x, bits = w.diag[i];
                if (bits == 0 || w.road[i] == 0) continue;
                foreach (var (dx, dy, bit) in Graph.DIAG)
                {
                    if ((bits & bit) == 0 || dx < 0) continue;
                    int x2 = x + dx, y2 = y + dy;
                    if (inLot(x, y) || inLot(x2, y2)) continue;
                    int j = y2 * N + x2;
                    if (w.curves.Any(c => c.cells.Contains(i) && c.cells.Contains(j))) continue;
                    o.Add(new Seg4 { ax = (x + 0.5) * CELL, az = (y + 0.5) * CELL, bx = (x2 + 0.5) * CELL, bz = (y2 + 0.5) * CELL, t = w.road[i] == Road.Avenue ? 2 : 1 });
                }
            }
            return o;
        }

        static double rectSegDist(double x0, double z0, double x1, double z1, Seg4 s)
        {
            double best = double.PositiveInfinity;
            for (int k = 0; k <= 24; k++)
            {
                double t = k / 24.0, px = s.ax + (s.bx - s.ax) * t, pz = s.az + (s.bz - s.az) * t;
                double dx = Math.Max(Math.Max(x0 - px, 0), px - x1), dz = Math.Max(Math.Max(z0 - pz, 0), pz - z1);
                best = Math.Min(best, Math.Sqrt(dx * dx + dz * dz));
            }
            return best;
        }

        static List<Part> clearDiagonals(Building b, World w, List<Part> o)
        {
            var segs = diagonalsNear(b, w);
            if (segs.Count == 0 || o.Count == 0) return o;
            double x0 = double.PositiveInfinity, z0 = double.PositiveInfinity, x1 = double.NegativeInfinity, z1 = double.NegativeInfinity;
            foreach (var p in o)
            {
                double c = Math.Abs(Math.Cos(p.rot)), sn = Math.Abs(Math.Sin(p.rot));
                double hx = (p.sx * c + p.sz * sn) / 2, hz = (p.sx * sn + p.sz * c) / 2;
                x0 = Math.Min(x0, p.x - hx); x1 = Math.Max(x1, p.x + hx); z0 = Math.Min(z0, p.z - hz); z1 = Math.Max(z1, p.z + hz);
            }
            bool clear(double k, double axp, double azp) => segs.All(sg => rectSegDist(axp + (x0 - axp) * k, azp + (z0 - azp) * k, axp + (x1 - axp) * k, azp + (z1 - azp) * k, sg) >= Curves.HALF_WIDTH(sg.t) + Curves.KERB_W(sg.t) + 0.4);
            if (clear(1, x0, z0)) return o;
            double bestK = 0.35, bx = x0, bz = z0;
            foreach (var (axp, azp) in new[] { (x0, z0), (x1, z0), (x0, z1), (x1, z1) })
            {
                double k = 1;
                while (k > 0.35 && !clear(k, axp, azp)) k -= 0.03;
                if (k > bestK) { bestK = k; bx = axp; bz = azp; }
            }
            foreach (var p in o)
            {
                p.x = bx + (p.x - bx) * bestK;
                p.z = bz + (p.z - bz) * bestK;
                p.sx *= bestK; p.sz *= bestK;
                p.y *= 0.5 + bestK / 2; p.sy *= 0.5 + bestK / 2;
            }
            return o;
        }

        static List<Part> squeeze(Building b, World w, List<Part> o)
        {
            var sh = avenueShift(w, b);
            if (sh.x == 0 && sh.z == 0) return o;
            double Wm = bw(b) * CELL, Dm = bh(b) * CELL, cx = b.x * CELL + Wm / 2, cz = b.y * CELL + Dm / 2;
            double kx = (Wm - Math.Abs(sh.x)) / Wm, kz = (Dm - Math.Abs(sh.z)) / Dm;
            foreach (var p in o)
            {
                p.x = cx + sh.x / 2 + (p.x - cx) * kx;
                p.z = cz + sh.z / 2 + (p.z - cz) * kz;
                double c = Math.Abs(Math.Cos(p.rot)), sn = Math.Abs(Math.Sin(p.rot));
                double fx = c * kx + sn * kz, fz = c * kz + sn * kx;
                p.sx *= fx; p.sz *= fz;
            }
            return o;
        }

        static List<Part> lotParts(Building b, World w)
        {
            if (bw(b) != b.size || bh(b) != b.size) return stretched(b, w);
            var o = rawParts(b, w, b.x, b.y);
            if (KINDS[b.kind].zone == 0 || w.curves.Count == 0) return o;
            double S = b.size * CELL;
            double cx = b.x * CELL + S / 2, cz = b.y * CELL + S / 2;
            var near = Curves.nearestCurve(w, cx, cz, S / 2 + 9);
            if (near == null) return o;
            int? a = accessOf(w, b);
            if (a == null || !near.c.cells.Contains(a.Value)) return o;
            double phi = Math.Atan2(-near.tan.z, near.tan.x);
            phi -= Math.Floor(phi / (PI / 2) + 0.5) * (PI / 2);
            if (Math.Abs(phi) < 0.03) return o;
            double cos = Math.Cos(phi), sin = Math.Sin(phi);
            double k = Math.Min(1, 1.15 / (Math.Abs(cos) + Math.Abs(sin)));
            double clr = Curves.HALF_WIDTH(near.c.t) + Curves.KERB_W(near.c.t) + 0.3;
            double half = S * 0.42;
            if (near.d - clr < half * k) k = Math.Max(0.55, Math.Min(k, (near.d - clr) / half));
            double push = Math.Min(2, Math.Max(0, half * k - (near.d - clr)));
            double nd = near.d != 0 ? near.d : 1;
            double nx = (cx - near.x) / nd, nz = (cz - near.z) / nd;
            double ox = nx * push, oz = nz * push;
            foreach (var p in o)
            {
                double dx = (p.x - cx) * k, dz = (p.z - cz) * k;
                p.x = cx + ox + dx * cos + dz * sin;
                p.z = cz + oz - dx * sin + dz * cos;
                p.sx *= k; p.sz *= k;
                p.rot += phi;
            }
            return o;
        }

        static List<Part> stretched(Building b, World w)
        {
            if (b.kind == "r3") return complex(b);
            if (b.kind == "c3") { if (variantOf("c3", b.look) == 2) { var o2 = new List<Part>(); bigMart(b, w, o2); return o2; } return officeBlock(b); }
            int W = bw(b), D = bh(b), bas = b.size;
            var o = rawParts(b, w, b.x + (W - bas) / 2.0, b.y + (D - bas) / 2.0);
            double cx = (b.x + W / 2.0) * CELL, cz = (b.y + D / 2.0) * CELL;
            double fx = (double)W / bas, fz = (double)D / bas;
            foreach (var p in o)
            {
                p.x = cx + (p.x - cx) * fx;
                p.z = cz + (p.z - cz) * fz;
                if (Math.Abs(Math.Sin(p.rot)) > 0.5) { p.sx *= fz; p.sz *= fx; } else { p.sx *= fx; p.sz *= fz; }
            }
            return o;
        }

        static List<Part> complex(Building b)
        {
            if (variantOf("r3", b.look) == 2) { var m = new List<Part>(); mixedUse(b, m); return m; }
            var r = seq(b.look + b.id * 0.0137);
            double Wm = bw(b) * CELL, Dm = bh(b) * CELL;
            double cx = b.x * CELL + Wm / 2, cz = b.y * CELL + Dm / 2;
            double H = b.floors * 3;
            string col = pick(APT, r()), brand = pick(BRAND, r());
            var o = new List<Part>();
            bool alongX = Wm > Dm || (Wm == Dm && b.look < 0.3);
            double lng = alongX ? Wm : Dm, shrt = alongX ? Dm : Wm;
            void Q(string s, double u, double v, double y, double lu, double h, double lv, string color, int style = S_PLAIN, string sign = null) =>
                o.Add(alongX ? new Part { shape = s, x = cx + u, y = y, z = cz + v, sx = lu, sy = h, sz = lv, rot = 0, color = color, style = style, sign = sign }
                             : new Part { shape = s, x = cx + v, y = y, z = cz + u, sx = lv, sy = h, sz = lu, rot = 0, color = color, style = style, sign = sign });
            var CARS = new[] { "#f2f2f0", "#f2f2f0", "#1b1c1e", "#a9adb2", "#6f7378", "#2a3d66", "#8c1d1d" };
            var LEAF = new[] { "#5e8f45", "#6c9f4f", "#7aab55" };
            void parking(double u0, double u1, double v, double ww)
            {
                Q("box", (u0 + u1) / 2, v, 0.05, u1 - u0, 0.05, ww, "#5a5d61");
                for (double u = u0 + 1.4; u < u1 - 1.2; u += 2.6)
                {
                    Q("box", u - 1.3, v, 0.1, 0.1, 0.02, ww * 0.8, "#eeeeea");
                    if (r() < 0.25) continue;
                    string k = pick(CARS, r());
                    Q("box", u, v, 0.1, 1.7, 0.8, Math.Min(4.1, ww - 0.6), k);
                    Q("box", u, v, 0.9, 1.5, 0.55, Math.Min(2, ww - 2), "#2c2f33");
                }
            }
            void park(double u0, double u1, double v, double ww, bool play)
            {
                Q("box", (u0 + u1) / 2, v, 0.05, u1 - u0, 0.08, ww, "#7fae55");
                for (double u = u0 + 1.6; u < u1 - 1; u += 4.2)
                {
                    Q("box", u, v + ww / 2 - 1, 0.1, 0.25, 1.4, 0.25, "#6b5440");
                    Q("tree", u, v + ww / 2 - 1, 1.1, 2.6, 2.8, 2.6, pick(LEAF, r()));
                }
                double mu = (u0 + u1) / 2;
                if (play)
                {
                    Q("box", mu, v - 0.4, 0.1, 4, 0.15, Math.Min(3.4, ww - 1.2), "#e2c48a");
                    Q("prism", mu - 0.8, v - 0.4, 0.25, 0.9, 1.6, 2.2, pick(new[] { "#e74c3c", "#f1c40f", "#3498db" }, r()));
                    Q("box", mu + 1, v - 0.4, 0.25, 0.9, 1.6, 0.9, "#2e9e4f");
                }
                else
                {
                    Q("box", mu, v - 0.3, 0.1, 2.6, 0.4, 2.6, "#8a6a4a");
                    Q("hip", mu, v - 0.3, 2.4, 3.4, 1.2, 3.4, "#4a4f55");
                    foreach (var (a, c) in new[] { (-1, -1), (1, -1), (-1, 1), (1, 1) }) Q("box", mu + a * 1.1, v - 0.3 + c * 1.1, 0.5, 0.18, 1.9, 0.18, "#7a3b2e");
                }
            }
            bool big = bw(b) * bh(b) >= 6 && variantOf("r3", b.look) != 3;
            int nth = 0;
            void vent(double u, double v)
            {
                Q("box", u, v, 0.1, 1.1, 1.3, 1.1, "#bdb7aa");
                Q("box", u, v, 1.4, 1.3, 0.15, 1.3, "#8d8a83");
            }
            void garden(double u0, double u1, double v, double ww)
            {
                double mu = (u0 + u1) / 2, len = u1 - u0; int k = nth++ % 4;
                Q("box", mu, v, 0.05, len, 0.08, ww, "#7fae55");
                Q("box", mu, v, 0.13, len - 1, 0.03, 1.2, "#e3d6bc");
                for (double u = u0 + 1.6; u < u1 - 1; u += 4.6) foreach (int sv in new[] { -1, 1 }) Q("tree", u, v + sv * (ww / 2 - 0.9), 0.1, 2.2, 3, 2.2, pick(LEAF, r()));
                if (k == 0 && len > 9)
                {
                    Q("box", mu, v, 0.1, Math.Min(10, len - 3), 3.6, Math.Min(4.4, ww - 1), "#dfe6e8", S_OFFICE);
                    Q("box", mu, v, 3.7, Math.Min(10.4, len - 2.6), 0.3, Math.Min(4.8, ww - 0.6), "#6f9a55");
                    Q("box", mu, v - Math.Min(4.4, ww - 1) / 2 - 0.1, 2.6, 3, 0.6, 0.2, brand, S_SIGN);
                }
                else if (k == 1)
                {
                    Q("box", mu, v, 0.1, Math.Min(8, len - 2), 0.06, Math.Min(5, ww - 0.6), "#d9d2c3");
                    Q("cyl", mu, v, 0.16, 3.2, 0.45, 3.2, "#cfc9bd");
                    Q("cyl", mu, v, 0.2, 2.8, 0.42, 2.8, "#6fa8d6");
                    Q("cyl", mu, v, 0.6, 0.35, 1.2, 0.35, "#d7ecf7");
                    foreach (int su in new[] { -1, 1 }) Q("box", mu + su * 3, v, 0.15, 1.6, 0.45, 0.5, "#8a6a4a");
                }
                else if (k == 2 && len > 7)
                {
                    Q("box", mu - 1.5, v, 0.1, 4.4, 3, Math.Min(4, ww - 1), "#f3ead8", S_HOUSE);
                    Q("box", mu - 1.5, v, 3.1, 4.7, 0.35, Math.Min(4.3, ww - 0.7), pick(new[] { "#f1c40f", "#e67e22", "#3498db" }, r()));
                    Q("box", mu + 2.4, v, 0.12, 3, 0.05, Math.Min(3.6, ww - 1.2), "#e2c48a");
                    Q("prism", mu + 2.4, v, 0.17, 0.9, 1.4, 2, "#e74c3c");
                }
                else
                {
                    for (int t = 0; t < 3; t++) Q("box", mu - 2 + t * 2, v - 0.6, 0.13, 0.15, 1.5, 0.9, "#3f7fb5");
                    Q("box", mu + 3, v + 0.4, 0.15, 1.6, 0.45, 0.5, "#8a6a4a");
                }
                if (len > 6) vent(u0 + 1.2, v + (ww / 2 - 1.2) * (r() < 0.5 ? 1 : -1));
            }
            Action<double, double, double, double> lot = big ? (Action<double, double, double, double>)garden : parking;
            Q("box", 0, 0, 0, lng - 0.6, 0.04, shrt - 0.6, "#cbc5b8");
            foreach (int sv in new[] { -1, 1 }) Q("box", 2.2, sv * (shrt / 2 - 0.5), 0, lng - 5.4, 0.8, 0.5, "#5f8f45");
            foreach (int su in new[] { -1, 1 }) Q("box", su * (lng / 2 - 0.5), 2.2, 0, 0.5, 0.8, shrt - 5.4, "#5f8f45");
            double gu = -lng / 2 + 1.3, gv = -shrt / 2 + 1.3;
            Q("box", gu + 2.6, gv, 0, 0.7, 3.6, 0.7, "#cfc8ba");
            Q("box", gu, gv + 2.6, 0, 0.7, 3.6, 0.7, "#cfc8ba");
            Q("box", gu + 1.6, gv + 1.6, 1.2, 1.9, 2.4, 1.9, "#d9d2c3", S_HOUSE);
            Q("box", gu + 2.6, gv, 3.6, 1.2, 0.8, 0.9, brand, S_SIGN);
            if (big)
            {
                double ru = gu + 8, rv = -shrt / 2 + 1.4;
                Q("box", ru, rv, 0.02, 6, 0.06, 2.2, "#2a2c2f");
                foreach (int sv in new[] { -1, 1 }) Q("box", ru, rv + sv * 1.2, 0, 6, 0.9, 0.2, "#cfc8ba");
                foreach (int su in new[] { -1, 1 }) Q("box", ru + su * 2.8, rv, 0, 0.2, 2.6, 2.4, "#9aa0a6");
                Q("box", ru, rv, 2.6, 6.2, 0.15, 2.8, "#9fc3cf");
                Q("box", ru - 3.4, rv, 2, 0.6, 0.6, 0.15, "#2f6db3", S_SIGN);
            }
            bool pil = variantOf("r3", b.look) == 3;
            double sub = (b.look * (VARIANTS.TryGetValue("r3", out var vr) ? vr.Length : 1)) % 1;
            if (pil || sub < 0.55)
            {
                int rows = Math.Max(2, (int)Math.Floor((shrt - 2) / 9));
                int segs = lng >= 28 ? 2 : 1;
                double gap = 3, len = (lng - 3.5 - (segs - 1) * gap) / segs;
                double pitch = shrt / rows, gw = pitch - 4.6 - 0.8;
                for (int i = 0; i < rows; i++)
                {
                    double v = -shrt / 2 + pitch * (i + 0.5);
                    for (int k = 0; k < segs; k++)
                    {
                        double u = -lng / 2 + 1.75 + len / 2 + k * (len + gap);
                        double h = H - Math.Floor(r() * 3) * 3;
                        if (pil)
                        {
                            Q("box", u, v, 0.05, len, 0.05, 4.6, "#6a6d70");
                            int n = Math.Max(2, (int)Math.Floor(len / 3.6 + 0.5));
                            for (int kk = 0; kk <= n; kk++) foreach (int sv in new[] { -1, 1 }) Q("box", u - len / 2 + 0.3 + (kk * (len - 0.6)) / n, v + sv * 2, 0, 0.5, 3, 0.5, "#cfc9bd");
                            for (double x = u - len / 2 + 1.5; x < u + len / 2 - 1.2; x += 2.6)
                            {
                                if (Math.Abs(x - u) < 2) continue;
                                if (r() < 0.25) continue;
                                Q("box", x, v, 0.1, 1.7, 0.8, 4, pick(CARS, r()));
                                Q("box", x, v, 0.9, 1.5, 0.55, 2, "#2c2f33");
                            }
                            Q("box", u, v + 0.6, 0, 2.8, 3, 3, col, S_HOUSE);
                            Q("box", u, v - 0.95, 0, 1.4, 2.3, 0.12, "#7d9bb5");
                            Q("box", u, v, 2.75, len + 0.2, 0.25, 4.8, "#d6d0c4");
                            Q("box", u, v, 3, len, h - 3, 4.6, col, S_SLAB, brand);
                        }
                        else Q("box", u, v, 0, len, h, 4.6, col, S_SLAB, brand);
                        Q("box", u, v, h, Math.Min(4, len * 0.3), 2.2, 3.2, col);
                        foreach (int sv in new[] { -1, 1 }) Q("box", u, v + sv * 2.2, h, len, 0.7, 0.2, col);
                        Q("cyl", u + len * 0.3, v, h, 1.6, 1.4, 1.6, "#d8d4cc");
                        if (r() < 0.6) Q("cyl", u - len * 0.32, v, h, 0.12, 4, 0.12, "#9aa0a6");
                    }
                    if (i == rows - 1) break;
                    double gv2 = v + pitch / 2;
                    if (rows == 2)
                    {
                        lot(-lng / 2 + 1, lng * 0.18, gv2, gw);
                        park(lng * 0.18, lng / 2 - 1, gv2, gw, true);
                    }
                    else if (i % 2 == 0) lot(-lng / 2 + 1, lng / 2 - 1, gv2, gw);
                    else park(-lng / 2 + 1, lng / 2 - 1, gv2, gw, i % 4 == 1);
                }
            }
            else
            {
                int nu = Math.Max(2, (int)Math.Floor(lng / 10 + 0.5)), nv = Math.Max(2, (int)Math.Floor(shrt / 10 + 0.5));
                double su = lng / nu, sv = shrt / nv;
                int n = 0;
                for (int i = 0; i < nu; i++) for (int j = 0; j < nv; j++)
                {
                    double u = -lng / 2 + su * (i + 0.5), v = -shrt / 2 + sv * (j + 0.5);
                    if ((i + j) % 2 == 0)
                    {
                        double h = H - Math.Floor(r() * 3) * 6;
                        Q("box", u, v, 0, 8, h, 8, col, S_APT, brand);
                        Q("box", u, v, h, 5, 2.4, 5, brand);
                    }
                    else if (n++ % 2 == 0) lot(u - su / 2 + 0.8, u + su / 2 - 0.8, v, sv - 2);
                    else park(u - su / 2 + 0.8, u + su / 2 - 0.8, v, sv - 2, n % 4 == 1);
                }
            }
            return o;
        }

        static void mixedUse(Building b, List<Part> o)
        {
            var r = seq(b.look + b.id * 0.0137);
            double Wm = bw(b) * CELL, Dm = bh(b) * CELL;
            double cx = b.x * CELL + Wm / 2, cz = b.y * CELL + Dm / 2;
            double H = b.floors * 3, bas = 9;
            void box(double x, double y, double z, double sx, double sy, double sz, string color, int style = S_PLAIN, string sign = null) =>
                o.Add(new Part { shape = "box", x = cx + x, y = y, z = cz + z, sx = sx, sy = sy, sz = sz, rot = 0, color = color, style = style, sign = sign });
            box(0, 0, 0, Wm - 1.6, bas, Dm - 1.6, "#d8d5cc", S_SHOPHOUSE);
            box(0, 6.6, -(Dm - 1.6) / 2 - 0.15, (Wm - 1.6) * 0.8, 1.1, 0.3, pick(SIGNS, r()), S_SIGN);
            box(0, 6.6, (Dm - 1.6) / 2 + 0.15, (Wm - 1.6) * 0.8, 1.1, 0.3, pick(SIGNS, r()), S_SIGN);
            bool alongX = Wm >= Dm; double lng = alongX ? Wm : Dm;
            int n = Math.Max(1, (int)Math.Floor(lng / 18 + 0.5));
            string col = pick(new[] { "#eef0f0", "#e7ebee", "#f1ece2" }, r()), brand = pick(BRAND, r());
            for (int k = 0; k < n; k++)
            {
                double u = -lng / 2 + (lng / n) * (k + 0.5);
                double x = alongX ? u : 0, z = alongX ? 0 : u;
                double h = H - (k % 2) * 9;
                box(x, bas, z, 13, h - bas, 7, col, S_APT, brand);
                box(x, bas, z, 7, h - bas - 3, 13, col, S_APT, brand);
                box(x, h, z, 5, 3, 5, "#cfd3d6");
            }
        }

        static void bigMart(Building b, World w, List<Part> o)
        {
            var r = seq(b.look + b.id * 0.0137);
            double Wm = bw(b) * CELL, Dm = bh(b) * CELL;
            double cx = b.x * CELL + Wm / 2, cz = b.y * CELL + Dm / 2;
            int? a = accessOf(w, b);
            double rot = PI;
            if (a != null)
            {
                double dx = (a.Value % N) * CELL + CELL / 2.0 - cx, dz = Math.Floor(a.Value / (double)N) * CELL + CELL / 2.0 - cz;
                rot = Math.Abs(dx) / Wm > Math.Abs(dz) / Dm ? (dx > 0 ? -PI / 2 : PI / 2) : dz > 0 ? PI : 0;
            }
            bool side = Math.Abs(Math.Sin(rot)) > 0.5;
            double FW = side ? Dm : Wm, FD = side ? Wm : Dm;
            double c0 = Math.Cos(rot), s0 = Math.Sin(rot);
            Put P = (s, dx, dy, dz, ww, h, d, color, style, dr, sign) =>
                o.Add(new Part { shape = s, x = cx + dx * c0 + dz * s0, y = dy, z = cz - dx * s0 + dz * c0, sx = ww, sy = h, sz = d, rot = rot + dr, color = color, style = style, sign = sign });
            double H = 12, bwid = FW - 5.5, bdep = FD - 3, bx = -2.2, bz = 0.8;
            string brand = pick(new[] { "#f2c12e", "#d9473b", "#2f6db3", "#e8743b" }, r());
            P("box", bx, 0, bz, bwid, H, bdep, "#ebe8e1", S_FACTORY);
            P("box", bx, H - 3.6, bz - bdep / 2 - 0.2, bwid * 0.55, 2.6, 0.35, brand, S_SIGN);
            P("box", bx, H - 0.9, bz - bdep / 2 - 0.12, bwid, 0.6, 0.2, brand);
            P("box", bx, 0, bz - bdep / 2 - 0.1, 9, 3.6, 0.3, "#7d9bb5", S_OFFICE);
            P("box", bx, 3.6, bz - bdep / 2 - 1.4, 10, 0.3, 2.8, "#d8d5cc");
            P("box", bx + bwid / 2 - 3, 0, bz - bdep / 2 - 1.2, 3.6, 2.2, 1.6, "#c9ced4");
            P("box", bx, H, bz, bwid, 0.1, bdep, "#5a5d61");
            foreach (int sz in new[] { -1, 1 }) P("box", bx, H, bz + sz * (bdep / 2 - 0.2), bwid, 1, 0.3, "#d8d5cc");
            foreach (int sx2 in new[] { -1, 1 }) P("box", bx + sx2 * (bwid / 2 - 0.2), H, bz, 0.3, 1, bdep, "#d8d5cc");
            var CARS = new[] { "#f2f2f0", "#1b1c1e", "#a9adb2", "#6f7378", "#2a3d66", "#8c1d1d" };
            foreach (int lane in new[] { -1, 1 }) for (double x = bx - bwid / 2 + 2; x < bx + bwid / 2 - 2; x += 2.6)
            {
                if (r() < 0.35) continue;
                P("box", x, H + 0.1, bz + lane * (bdep / 4), 1.7, 0.8, 4, pick(CARS, r()));
                P("box", x, H + 0.9, bz + lane * (bdep / 4), 1.5, 0.5, 2, "#2c2f33");
            }
            P("box", bx + bwid / 2 - 2.5, H, bz + bdep / 2 - 2.5, 3.5, 3.4, 3.5, "#d8d5cc");
            double rx = FW / 2 - 2.2;
            P("prism", rx, 0, bz, 4.2, H, bdep, "#9d9a92", S_PLAIN, 0);
            P("box", rx, H, bz + bdep / 2 - 0.5, 4.2, 0.9, 0.3, "#d8d5cc");
        }

        static List<Part> officeBlock(Building b)
        {
            var r = seq(b.look + b.id * 0.0137);
            double Wm = bw(b) * CELL, Dm = bh(b) * CELL;
            double cx = b.x * CELL + Wm / 2, cz = b.y * CELL + Dm / 2;
            double H = b.floors * 3;
            var o = new List<Part>();
            void box(double x, double y, double z, double sx, double sy, double sz, string color, int style = S_PLAIN, string sign = null) =>
                o.Add(new Part { shape = "box", x = cx + x, y = y, z = cz + z, sx = sx, sy = sy, sz = sz, rot = 0, color = color, style = style, sign = sign });
            box(0, 0, 0, Wm - 1.6, 9, Dm - 1.6, "#b9b4ab", S_SHOPS, pick(SIGN, r()));
            bool alongX = Wm >= Dm; double lng = alongX ? Wm : Dm;
            int n = Math.Max(1, (int)Math.Floor(lng / 15));
            string glass = pick(new[] { "#7c90a6", "#8aa1a8", "#6d7f94", "#9aa7b4" }, r());
            for (int k = 0; k < n; k++)
            {
                double u = -lng / 2 + (lng / n) * (k + 0.5);
                double tw = 10 + r() * 3, td = 10 + r() * 3, h = H - (k % 2) * 9;
                double x = alongX ? u : 0, z = alongX ? 0 : u;
                box(x, 9, z, tw, h - 9, td, glass, S_OFFICE);
                box(x, h, z, 3, 2.5, 3, "#c9cbcc");
            }
            return o;
        }

        static string pick3(double h) => pick(new[] { "#5e8f45", "#6c9f4f", "#7aab55" }, h);

        /// <summary>The parts of one backland cell: a green strip, a 소공원, a 놀이터, a 주말 텃밭 or a 공터.</summary>
        public static List<Part> pocketParts(int i)
        {
            var o = new List<Part>();
            double cx = (i % N) * CELL + CELL / 2.0, cz = (i / N) * CELL + CELL / 2.0;
            double h(int k) { double s = Math.Sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.Floor(s); }
            void box(double x, double y, double z, double sx, double sy, double sz, string color) => o.Add(new Part { shape = "box", x = cx + x, y = y, z = cz + z, sx = sx, sy = sy, sz = sz, rot = 0, color = color, style = S_PLAIN });
            void shape(string s, double x, double y, double z, double sx, double sy, double sz, string color, double rt = 0) => o.Add(new Part { shape = s, x = cx + x, y = y, z = cz + z, sx = sx, sy = sy, sz = sz, rot = rt, color = color, style = S_PLAIN });
            void tree(double x, double z, double s) { box(x, 0, z, 0.25, 1.4 * s, 0.25, "#6b5440"); shape("tree", x, 1.1 * s, z, 2.8 * s, 3 * s, 2.8 * s, pick3(h(9))); }
            switch (Pockets.pocketKind(i))
            {
                case "green":
                    box(0, 0, 0, 9.6, 0.06, 9.6, "#7fae55");
                    tree(-2.5, -2, 1 + h(1) * 0.3); tree(2.6, 2.2, 0.9 + h(2) * 0.3);
                    if (h(3) < 0.5) tree(2.4, -2.6, 0.8);
                    break;
                case "park":
                    box(0, 0, 0, 9.6, 0.06, 9.6, "#86b55e");
                    box(0, 0.06, 0, 1.4, 0.03, 9.6, "#d8c9a8");
                    foreach (double z in new[] { -2.0, 2 }) box(-1.6, 0, z, 0.6, 0.45, 1.8, "#8a6a4a");
                    tree(-3, -3, 1); tree(3, 3, 1.1);
                    if (h(4) < 0.5) { shape("hip", 2.8, 2.4, -2.6, 3, 1, 3, "#4a4f55"); foreach (var (a, c) in new[] { (-1, -1), (1, -1), (-1, 1), (1, 1) }) box(2.8 + a, 0, -2.6 + c, 0.16, 2.4, 0.16, "#7a3b2e"); }
                    break;
                case "play":
                    box(0, 0, 0, 9.6, 0.06, 9.6, "#c9b48a");
                    box(-1.4, 0.06, -0.6, 4, 0.1, 4, "#e2c48a");
                    shape("prism", -1.6, 0.16, -0.8, 1, 1.7, 2.4, pick(new[] { "#e74c3c", "#f1c40f", "#3498db" }, h(5)));
                    box(-0.2, 0.16, -0.8, 1, 1.7, 1, "#2e9e4f");
                    foreach (double x in new[] { 2.4, 3.6 }) box(x, 0, 2.6, 0.12, 2, 0.12, "#8d9399");
                    box(3, 2, 2.6, 1.5, 0.12, 0.12, "#8d9399");
                    tree(-3.4, 3.4, 0.9);
                    break;
                case "garden":
                    box(0, 0, 0, 9.6, 0.06, 9.6, "#8a7a5c");
                    for (int k = 0; k < 4; k++) box(-1, 0.06, -3.3 + k * 2.2, 6.4, 0.3, 1.2, h(6 + k) < 0.5 ? "#6f9a3f" : "#8fb34f");
                    box(3.6, 0, 3.2, 1.4, 1.2, 1.2, "#3f6f9f");
                    shape("cyl", 3.6, 0, -3.4, 0.8, 0.9, 0.8, "#5a3b2a");
                    break;
                case "empty":
                    box(0, 0, 0, 9.6, 0.04, 9.6, "#b59f7a");
                    for (int k = 0; k < 3; k++) shape("tree", (h(10 + k) - 0.5) * 7, 0, (h(20 + k) - 0.5) * 7, 1.6, 0.8, 1.6, "#8a9a5a");
                    if (h(7) < 0.5) box(2.5, 0, -2.5, 2.2, 0.3, 1.2, "#8d8a84");
                    break;
            }
            return o;
        }
    }
}
