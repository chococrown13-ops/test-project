using System;
using System.Collections.Generic;
using static NaeDosi.Defs;

namespace NaeDosi
{
    /// <summary>
    /// The road network as a graph (port of sim/graph.ts). A node is a cell on one of two layers: the
    /// ground road (node = cell) or the second road in that cell, over or under it (node = cell + NN).
    /// </summary>
    public static class Graph
    {
        public const int NN = N * N;
        public const double SQRT2 = 1.4142135623730951;

        /// <summary>Diagonal directions: dx, dy and the bit for each in World.diag.</summary>
        public static readonly (int dx, int dy, int bit)[] DIAG = { (1, -1, 1), (1, 1, 2), (-1, 1, 4), (-1, -1, 8) };
        public static int oppositeDiag(int bit) => bit == 1 ? 4 : bit == 2 ? 8 : bit == 4 ? 1 : 2;

        public static int cellOf(int node) => node >= NN ? node - NN : node;
        public static bool isAlt(int node) => node >= NN;

        public static int roadTypeOf(World w, int node) => node >= NN ? w.roadAlt[node - NN] : w.road[node];

        static void orth(int c, List<int> o)
        {
            o.Clear();
            int x = c % N, y = c / N;
            if (x > 0) o.Add(c - 1);
            if (x < N - 1) o.Add(c + 1);
            if (y > 0) o.Add(c - N);
            if (y < N - 1) o.Add(c + N);
        }

        [ThreadStatic] static List<int> tmp;
        static List<int> Tmp => tmp ??= new List<int>(4);

        public static List<int> altNeighbours(World w, int c)
        {
            var o = new List<int>();
            if (w.roadAlt[c] == 0) return o;
            var t = new List<int>(4); orth(c, t);
            foreach (int n in t) if (w.roadAlt[n] != 0 && w.altLevel[n] == w.altLevel[c]) o.Add(n);
            return o;
        }

        public static int rampExit(World w, int c)
        {
            var nb = altNeighbours(w, c);
            if (nb.Count != 1) return -1;
            int m = nb[0];
            int dx = (c % N) - (m % N), dy = (c / N) - (m / N);
            int x = (c % N) + dx, y = (c / N) + dy;
            if (x < 0 || y < 0 || x >= N || y >= N) return -1;
            int e = y * N + x;
            return w.road[e] != Road.None ? e : -1;
        }

        public static bool isRamp(World w, int c) => w.roadAlt[c] != Road.None && altNeighbours(w, c).Count <= 1;

        public static readonly (int x, int y)[] ONEWAY_STEP = { (0, 0), (1, 0), (0, 1), (-1, 0), (0, -1) };
        static int axisOfCode(int o) => o == 1 || o == 3 ? 0 : 1;

        static bool pairGap(World w, int a, int b)
        {
            int oa = w.oneway[a], ob = w.oneway[b];
            if (oa == 0 || ob == 0 || axisOfCode(oa) != axisOfCode(ob)) return false;
            int dx = (b % N) - (a % N), dy = (b / N) - (a / N);
            if ((axisOfCode(oa) == 0) != (dx == 0)) return false;
            int beyondB = b + dx + dy * N, beforeA = a - dx - dy * N;
            bool ok(int c) => c >= 0 && c < NN && Math.Abs((c % N) - (a % N)) <= 2 && w.road[c] != 0 && w.oneway[c] == 0;
            return !ok(beyondB) && !ok(beforeA);
        }

        public static bool highwayLinkOk(World w, int a, int b)
        {
            bool ha = w.road[a] == 3, hb = w.road[b] == 3;
            if (ha == hb) return true;
            return ha ? (w.hwy[a] & 1) != 0 : (w.hwy[b] & 1) != 0;
        }

        public static bool driveOk(World w, int a, int b)
        {
            if (a >= NN || b >= NN) return true;
            int dx = Math.Sign((b % N) - (a % N)), dy = Math.Sign((b / N) - (a / N));
            if (dx != 0 && dy != 0) return true;
            foreach (int c in new[] { a, b })
            {
                int o = w.oneway[c];
                if (o == 0) continue;
                var (ox, oy) = ONEWAY_STEP[o];
                if (ox != 0 && dx != 0 && dx != ox) return false;
                if (oy != 0 && dy != 0 && dy != oy) return false;
            }
            return true;
        }

        public static void forEachDriveStep(World w, int node, Action<int, double> fn)
            => forEachNeighbour(w, node, (n, len) => { if (driveOk(w, node, n)) fn(n, len); });

        public static void forEachNeighbour(World w, int node, Action<int, double> fn)
        {
            if (node < NN)
            {
                int c = node;
                if (w.road[c] == 0) return;
                var nb = new List<int>(4); orth(c, nb);
                foreach (int n in nb) if (w.road[n] != 0 && Curves.curveLinkOk(w, c, n) && !pairGap(w, c, n) && highwayLinkOk(w, c, n)) fn(n, 1);
                int d = w.diag[c];
                if (d != 0)
                {
                    int x = c % N, y = c / N;
                    foreach (var (dx, dy, bit) in DIAG)
                    {
                        if ((d & bit) == 0) continue;
                        int nx = x + dx, ny = y + dy;
                        if (nx >= 0 && ny >= 0 && nx < N && ny < N && w.road[ny * N + nx] != 0) fn(ny * N + nx, SQRT2);
                    }
                }
                foreach (int n in nb) if (w.roadAlt[n] != 0 && rampExit(w, n) == c) fn(n + NN, 1);
                return;
            }
            int cc = node - NN;
            if (w.roadAlt[cc] == 0) return;
            foreach (int m in altNeighbours(w, cc)) fn(m + NN, 1);
            int e = rampExit(w, cc);
            if (e >= 0) fn(e, 1);
        }

        public static bool nodeExists(World w, int node) => roadTypeOf(w, node) != 0;
    }
}
