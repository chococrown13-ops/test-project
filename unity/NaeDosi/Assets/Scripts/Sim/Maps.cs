using System;
using System.Collections.Generic;
using static NaeDosi.Defs;

namespace NaeDosi
{
    /// <summary>
    /// The land a city starts on (port of sim/maps.ts). Every map has some water, a flat corridor
    /// along the west edge for the expressway link, and hills whose heights come from the seed alone.
    /// </summary>
    public static class Maps
    {
        public static readonly (string id, string name, string desc)[] MAPS =
        {
            ("river", "강변 도시", "도시를 가로지르는 큰 강, 뒤로는 산"),
            ("coast", "바닷가 도시", "남쪽으로 탁 트인 바다와 모래사장"),
            ("lake", "호숫가 도시", "가운데 넓은 호수와 흘러나가는 개울"),
            ("valley", "산골 분지", "산으로 둘러싸인 아늑한 분지, 시냇물 하나"),
            ("plain", "너른 평야", "땅은 넓고 물은 작은 못과 실개천뿐"),
            ("island", "섬 도시", "바다에 떠 있는 섬, 다리 하나로 육지와 이어져요"),
        };

        public static bool isMapKind(string s) { foreach (var m in MAPS) if (m.id == s) return true; return false; }
        public static string randomMap(double seed) => MAPS[(int)(Math.Abs(Math.Floor(seed / 7)) % MAPS.Length)].id;

        static double JsMod(double a, double b) => a - b * Math.Truncate(a / b);

        public static double riverY(double x, double seed)
        {
            double p = JsMod(seed, 1000) / 1000;
            return N * 0.58 + Math.Sin((x / N) * Math.PI * 1.6 + p * 6) * 9 + Math.Sin((x / N) * Math.PI * 4.2 + p * 3) * 2.5;
        }

        static double fh(double x, double y) { double s = Math.Sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.Floor(s); }
        public static double vnoise(double x, double y)
        {
            double xi = Math.Floor(x), yi = Math.Floor(y), xf = x - xi, yf = y - yi;
            double u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            double a = fh(xi, yi), b = fh(xi + 1, yi), c = fh(xi, yi + 1), d = fh(xi + 1, yi + 1);
            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        }

        static double phase(double seed) => JsMod(seed, 1000) / 1000;
        static double coastY(double x, double seed) { double p = phase(seed); return N * 0.7 + Math.Sin((x / N) * Math.PI * 1.3 + p * 6) * 7 + Math.Sin(x * 0.21 + p * 9) * 2; }
        static double streamY(double x, double seed) { double p = phase(seed); return N * 0.62 + Math.Sin((x / N) * Math.PI * 2 + p * 6) * 6 + Math.Sin(x * 0.17 + p) * 1.5; }
        static (double x, double y) lakeC(double seed) => (N * (0.58 + phase(seed) * 0.1), N * 0.64);
        static (double x, double y) pondC(double seed) => (N * (0.62 + phase(seed) * 0.15), N * 0.28);

        static int Round(double v) => (int)Math.Floor(v + 0.5); // Math.round in JS

        public static int startRow(double seed, string kind)
        {
            switch (kind)
            {
                case "river": return Round(riverY(0, seed) - 22);
                case "coast": return Round(coastY(0, seed) - 24);
                case "lake": return Round(N * 0.38);
                case "valley": return Round(streamY(0, seed) - 14);
                case "plain": return Round(N * 0.55);
                case "island": return Round(N * 0.5);
                default: return Round(N * 0.5);
            }
        }

        public static byte[] waterMask(double seed, string kind)
        {
            var m = new byte[N * N];
            double o = JsMod(seed, 997) * 0.37;
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++)
                {
                    bool wet = false;
                    switch (kind)
                    {
                        case "river":
                            {
                                double half = 3.6 + Math.Sin(x * 0.07 + seed) * 0.9;
                                wet = Math.Abs(y + 0.5 - riverY(x, seed)) < half;
                                break;
                            }
                        case "coast": wet = y + 0.5 > coastY(x, seed); break;
                        case "lake":
                            {
                                var c = lakeC(seed); double a = Math.Atan2(y - c.y, x - c.x);
                                double r = 1 + (vnoise(Math.Cos(a) * 2 + o, Math.Sin(a) * 2) - 0.5) * 0.5;
                                wet = Geom.Hypot((x - c.x) / 20, (y - c.y) / 13) < r;
                                if (!wet && x > c.x) wet = Math.Abs(y + 0.5 - (c.y + Math.Sin(x * 0.11 + o) * 3)) < 1.3;
                                break;
                            }
                        case "valley": wet = Math.Abs(y + 0.5 - streamY(x, seed)) < 1.6; break;
                        case "plain":
                            {
                                var c = pondC(seed);
                                wet = Geom.Hypot(x - c.x, y - c.y) < 6 + (vnoise(x / 3.0 + o, y / 3.0) - 0.5) * 2;
                                if (!wet && y > c.y) wet = Math.Abs(x + 0.5 - (c.x + Math.Sin(y * 0.12 + o) * 4)) < 1.2;
                                break;
                            }
                        case "island":
                            {
                                double a = Math.Atan2(y - N / 2.0, x - N / 2.0);
                                double r = N / 2.0 - 14 + (vnoise(Math.Cos(a) * 2.5 + o, Math.Sin(a) * 2.5) - 0.5) * 14;
                                wet = Geom.Hypot(x - N / 2.0, y - N / 2.0) > r;
                                break;
                            }
                    }
                    if (wet) m[y * N + x] = 1;
                }
            return m;
        }

        static byte[] waterDistance(byte[] m)
        {
            var d = new byte[N * N];
            for (int i = 0; i < d.Length; i++) d[i] = 12;
            var q = new List<int>();
            for (int i = 0; i < N * N; i++) if (m[i] != 0) { d[i] = 0; q.Add(i); }
            for (int k = 1; k < 12 && q.Count > 0; k++)
            {
                var next = new List<int>();
                foreach (int i in q)
                {
                    int x = i % N, y = i / N;
                    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++)
                        {
                            int nx = x + dx, ny = y + dy;
                            if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
                            int j = ny * N + nx;
                            if (d[j] > k) { d[j] = (byte)k; next.Add(j); }
                        }
                }
                q = next;
            }
            return d;
        }

        public static float[] hillField(double seed, string kind)
        {
            var h = new float[N * N];
            double o = JsMod(seed, 997) * 0.37;
            int row = startRow(seed, kind);
            if (kind == "river")
            {
                int hx = Round(N * (0.55 + JsMod(seed, 7) * 0.03)), hy = Round(Math.Min(N - 14, riverY(hx, seed) + 22));
                for (int y = 0; y < N; y++) for (int x = 0; x < N; x++)
                    {
                        double depth = 6 + vnoise(x / 13.0 + o, 3.1) * 13;
                        double v = 0;
                        if (y < depth) v = Math.Pow((depth - y) / depth, 0.8) * (45 + vnoise(x / 8.0 + o, 7.7) * 50);
                        double d = Geom.Hypot(x - hx, y - hy), r = 7.5 + vnoise(o, 1.3) * 3;
                        if (d < r) v = Math.Max(v, Math.Pow(1 - d / r, 1.2) * (55 + vnoise(o, 9.1) * 25));
                        v *= 0.85 + vnoise(x / 4.0 + o, y / 4.0) * 0.3;
                        double river = Math.Abs(y + 0.5 - riverY(x, seed));
                        if (river < 9 || (x < 40 && Math.Abs(y - row) < 12) || v < 4) v = 0;
                        h[y * N + x] = (float)v;
                    }
                return h;
            }
            var wd = waterDistance(waterMask(seed, kind));
            double ridge(double t, double along, double salt, double scale = 1)
            {
                double depth = 6 + vnoise(along / 13 + o + salt, 3.1) * 13;
                return t < depth ? Math.Pow((depth - t) / depth, 0.8) * (45 + vnoise(along / 8 + o + salt, 7.7) * 50) * scale : 0;
            }
            double hill(double x, double y, double ccx, double ccy, double r, double top)
            {
                double a = Math.Atan2(y - ccy, x - ccx);
                r *= 0.75 + vnoise(Math.Cos(a) * 1.8 + ccx * 0.1 + o, Math.Sin(a) * 1.8 + ccy * 0.1) * 0.55;
                double d = Geom.Hypot(x - ccx, y - ccy);
                return d < r ? Math.Pow(1 - d / r, 1.2) * top : 0;
            }
            int margin = kind == "valley" || kind == "plain" ? 5 : 8;
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++)
                {
                    double v = 0;
                    switch (kind)
                    {
                        case "coast": v = Math.Max(ridge(y, x, 0), hill(x, y, N * 0.82, coastY(N * 0.82, seed) - 12, 9, 60)); break;
                        case "lake": v = Math.Max(ridge(y, x, 0) * (x > N * 0.35 ? 1 : 0.4), hill(x, y, N * 0.22, N * 0.84, 10, 55)); break;
                        case "valley":
                            v = Math.Max(ridge(y, x, 0, 1.1), Math.Max(ridge(N - 1 - y, x, 5.5, 0.9), ridge(N - 1 - x, y, 2.7, 1.2)));
                            v = Math.Max(v, hill(x, y, N * 0.5, N * 0.3, 7, 40 * (0.8 + phase(seed) * 0.4)));
                            break;
                        case "plain": v = Math.Max(hill(x, y, N * 0.3, N * 0.18, 9, 35), hill(x, y, N * 0.45, N * 0.86, 8, 30)); break;
                        case "island": v = hill(x, y, N * 0.56, N * 0.34, 13, 75); break;
                    }
                    v *= 0.85 + vnoise(x / 4.0 + o, y / 4.0) * 0.3;
                    if (wd[y * N + x] < margin || (x < 40 && Math.Abs(y - row) < 12) || v < 4) v = 0;
                    h[y * N + x] = (float)v;
                }
            return h;
        }
    }
}
