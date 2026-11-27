using System;
using System.Collections.Generic;
using UnityEngine;
using static NaeDosi.Defs;

namespace NaeDosi.Render
{
    /// <summary>Cars, buses, trucks and delivery scooters where the simulation has them, plus kerbside parked cars (render/vehicles.ts).</summary>
    public sealed class VehicleView
    {
        readonly Instances[] models = new Instances[4];
        readonly Instances parked, busesByLine;
        readonly Material mat;
        string parkedKey = "";
        readonly Dictionary<Car, double> side = new Dictionary<Car, double>();
        double lastClock;
        /// <summary>Where every moving car is this frame (web x, z), for the walkers to look out for.</summary>
        public readonly List<V> spots = new List<V>();
        /// <summary>Where each line's buses are this frame (drawn by the transit layer in the line's colour).</summary>
        public readonly List<(int line, Matrix4x4 m)> busPoses = new List<(int, Matrix4x4)>();

        static readonly string[] CAR_COLORS = { "#f2f2f0", "#f2f2f0", "#1b1c1e", "#1b1c1e", "#a9adb2", "#a9adb2", "#6f7378", "#2a3d66", "#8c1d1d", "#e6e1d3" };
        static readonly string[] BUS_COLORS = { "#2e9e4f", "#2f6db5", "#2e9e4f", "#d9483b" };
        static readonly string[] TRUCK_COLORS = { "#2f5fa8", "#2f5fa8", "#f2f2f0" };
        static readonly string[] SCOOTER_COLORS = { "#e0a400", "#d9483b", "#2e9e4f", "#2f6db5", "#f2f2f0" };
        const int MAX_PARKED = 6000;

        sealed class Model
        {
            public readonly List<Vector3> v = new List<Vector3>(); public readonly List<Color> c = new List<Color>(); public readonly List<Vector4> g = new List<Vector4>();
            /// <summary>A box in the web model's frame (x forward, base at y), shade k, glow.</summary>
            public Model Box(float sx, float sy, float sz, float x, float y, float z, float k, float glow = 0)
            {
                var s = new MeshKit.Shape().Box(new Vector3(x, y + sy / 2, -z), new Vector3(sx, sy, sz), new Color(k, k, k));
                v.AddRange(s.v); c.AddRange(s.c);
                for (int i = 0; i < s.v.Count; i++) g.Add(new Vector4(glow, 0, 0, 0));
                return this;
            }
            /// <summary>Any shape already in the model's frame, as one piece with one glow.</summary>
            public Model Add(MeshKit.Shape s, float glow = 0)
            {
                v.AddRange(s.v); c.AddRange(s.c);
                for (int i = 0; i < s.v.Count; i++) g.Add(new Vector4(glow, 0, 0, 0));
                return this;
            }
            /// <summary>A tyre with a grey hub at (x, z), radius r.</summary>
            public Model Wheel(float x, float z, float r, float w = 0.24f)
            {
                var s = new MeshKit.Shape();
                s.Cylinder(r, r, -w / 2, w / 2, 10, new Color(0.03f, 0.03f, 0.03f));
                s.Cylinder(r * 0.55f, r * 0.55f, -w / 2 - 0.01f, w / 2 + 0.01f, 8, new Color(0.35f, 0.35f, 0.35f));
                s.Turn(0, Quaternion.Euler(90, 0, 0), Vector3.zero);
                for (int i = 0; i < s.v.Count; i++) s.v[i] += new Vector3(x, r, -z);
                return Add(s);
            }
            /// <summary>A block whose top is shorter than its bottom: windscreen and rear window lean in.</summary>
            public Model Cabin(float x0, float x1, float tx0, float tx1, float y0, float y1, float hw, float thw, float k)
            {
                var s = new MeshKit.Shape(); var kk = new Color(k, k, k);
                Vector3 B(float x, float z) => new Vector3(x, y0, -z); Vector3 T(float x, float z) => new Vector3(x, y1, -z);
                void q(Vector3 a, Vector3 b, Vector3 cc, Vector3 d) { s.Tri(a, b, cc, kk); s.Tri(a, cc, d, kk); }
                q(T(tx0, -thw), T(tx0, thw), T(tx1, thw), T(tx1, -thw));
                q(B(x1, -hw), B(x1, hw), T(tx1, thw), T(tx1, -thw));
                q(B(x0, hw), B(x0, -hw), T(tx0, -thw), T(tx0, thw));
                q(B(x0, -hw), B(x1, -hw), T(tx1, -thw), T(tx0, -thw));
                q(B(x1, hw), B(x0, hw), T(tx0, thw), T(tx1, thw));
                return Add(s);
            }
            public Model Lights(float L, float y, float w, float dx = 0)
            {
                Box(0.08f, 0.22f, 0.4f, L / 2 + 0.02f + dx, y, w / 2 - 0.35f, 1, 2.2f); Box(0.08f, 0.22f, 0.4f, L / 2 + 0.02f + dx, y, -w / 2 + 0.35f, 1, 2.2f);
                Box(0.08f, 0.2f, 0.35f, -L / 2 - 0.02f + dx, y, w / 2 - 0.3f, 0.6f, -1.6f); Box(0.08f, 0.2f, 0.35f, -L / 2 - 0.02f + dx, y, -w / 2 + 0.3f, 0.6f, -1.6f);
                return this;
            }
            public Mesh Mesh(string name)
            {
                // Shades are written as sRGB grey in three.js's attribute; vertex colours there are linear already.
                var m = MeshKit.Build(name, v, c, null);
                m.SetUVs(1, g);
                return m;
            }
        }

        public VehicleView(Shader shader)
        {
            mat = new Material(shader) { name = "cars", enableInstancing = true };
            mat.SetFloat("_Mode", 4); mat.SetFloat("_Smooth", 0.6f); mat.SetFloat("_Metal", 0.08f);
            var car = new Model().Box(4.3f, 0.85f, 1.8f, 0, 0.3f, 0, 1).Box(2.3f, 0.65f, 1.6f, -0.3f, 1.15f, 0, 0.22f).Lights(4.3f, 0.6f, 1.8f).Mesh("car");
            var bus = new Model().Box(10.5f, 2.4f, 2.4f, 0, 0.35f, 0, 1).Box(10.3f, 0.8f, 2.45f, 0, 1.45f, 0, 0.18f, 0.5f).Lights(10.5f, 0.6f, 2.4f).Mesh("bus");
            var truck = new Model().Box(1.9f, 1.7f, 1.75f, 1.6f, 0.3f, 0, 1).Box(0.9f, 0.6f, 1.7f, 1.9f, 1.25f, 0, 0.2f).Box(3.1f, 0.6f, 1.8f, -0.9f, 0.35f, 0, 0.75f).Lights(5.0f, 0.55f, 1.8f, 0.05f).Mesh("truck");
            var scooter = new Model().Box(1.8f, 0.5f, 0.45f, 0, 0.3f, 0, 0.3f).Box(0.5f, 1.0f, 0.5f, -0.1f, 0.8f, 0, 0.25f).Box(0.55f, 0.35f, 0.5f, 0, 1.8f, 0, 0.9f).Box(0.6f, 0.6f, 0.6f, -0.75f, 0.75f, 0, 1).Box(0.06f, 0.15f, 0.2f, 0.92f, 0.5f, 0, 1, 2.2f).Box(0.06f, 0.12f, 0.2f, -1.07f, 0.6f, 0, 0.6f, -1.6f).Mesh("scooter");
            var meshes = new[] { car, bus, truck, scooter };
            // 실사: rounder bodies, leaning glass, real wheels.
            var carR = new Model().Box(4.3f, 0.55f, 1.8f, 0, 0.32f, 0, 1).Cabin(-1.9f, 1.45f, -1.25f, 0.55f, 0.87f, 1.0f, 0.9f, 0.86f, 1)
                .Cabin(-1.55f, 0.95f, -1.15f, 0.35f, 1.0f, 1.45f, 0.84f, 0.74f, 0.12f).Box(1.5f, 0.06f, 1.48f, -0.4f, 1.44f, 0, 1).Box(0.12f, 0.2f, 1.7f, 2.17f, 0.3f, 0, 0.3f).Box(0.12f, 0.2f, 1.7f, -2.17f, 0.3f, 0, 0.3f)
                .Wheel(1.35f, 0.82f, 0.33f).Wheel(1.35f, -0.82f, 0.33f).Wheel(-1.35f, 0.82f, 0.33f).Wheel(-1.35f, -0.82f, 0.33f).Lights(4.3f, 0.6f, 1.8f).Mesh("car-real");
            var busR = new Model().Box(10.5f, 2.3f, 2.4f, 0, 0.45f, 0, 1).Box(10.3f, 0.9f, 2.45f, 0, 1.4f, 0, 0.1f, 0.5f).Box(0.1f, 1.4f, 2.2f, 5.27f, 1.0f, 0, 0.1f, 0.5f)
                .Wheel(3.6f, 1.05f, 0.5f, 0.3f).Wheel(3.6f, -1.05f, 0.5f, 0.3f).Wheel(-3.2f, 1.05f, 0.5f, 0.3f).Wheel(-3.2f, -1.05f, 0.5f, 0.3f).Lights(10.5f, 0.6f, 2.4f).Mesh("bus-real");
            var truckR = new Model().Box(1.9f, 1.5f, 1.75f, 1.6f, 0.45f, 0, 1).Cabin(1.0f, 2.55f, 1.0f, 2.2f, 1.25f, 1.85f, 0.88f, 0.86f, 0.12f).Box(3.1f, 0.6f, 1.8f, -0.9f, 0.5f, 0, 0.75f).Box(3.2f, 0.15f, 1.6f, -0.3f, 0.35f, 0, 0.15f)
                .Wheel(1.75f, 0.8f, 0.36f).Wheel(1.75f, -0.8f, 0.36f).Wheel(-1.4f, 0.8f, 0.36f).Wheel(-1.4f, -0.8f, 0.36f).Lights(5.0f, 0.6f, 1.8f, 0.05f).Mesh("truck-real");
            plain = new[] { car, bus, truck }; real = new[] { carR, busR, truckR };
            for (int k = 0; k < 4; k++) models[k] = new Instances(meshes[k], mat);
            parked = new Instances(car, mat);
            busesByLine = new Instances(bus, mat);
        }

        Mesh[] plain, real;
        public void SetReal(bool r)
        {
            var m = r ? real : plain;
            for (int k = 0; k < 3; k++) models[k].mesh = m[k];
            parked.mesh = m[0]; busesByLine.mesh = m[1];
        }

        static Color C(string hex) { ColorUtility.TryParseHtmlString(hex, out var c); return c.linear; }

        /// <summary>A web-space pose (centre, direction with slope) as a Unity matrix; models face +x.</summary>
        static Matrix4x4 Pose(double x, double y, double z, double dx, double dy, double dz)
        {
            var dir = new Vector3((float)dx, (float)dy, (float)-dz);
            var q = Quaternion.LookRotation(dir, Vector3.up) * Quaternion.Euler(0, -90, 0);
            return Matrix4x4.TRS(MeshKit.P(x, y, z), q, Vector3.one);
        }

        void UpdateParked(World w)
        {
            string key = $"{w.day >> 1}:{w.ver.roads}:{w.noAvenueParking}";
            if (key == parkedKey) return;
            parkedKey = key;
            var m = new List<Matrix4x4>(); var c = new List<Color>();
            for (int i = 0; i < Graph.NN && m.Count < MAX_PARKED; i++)
            {
                int k = w.parked[i];
                if (k == 0 || w.road[i] == 0) continue;
                int x = i % N, y = i / N;
                bool horiz = (x > 0 && w.road[i - 1] != 0) || (x < N - 1 && w.road[i + 1] != 0);
                double off = w.road[i] == 2 ? 4.35 : 2.55;
                double mx = x * CELL + CELL / 2.0, mz = y * CELL + CELL / 2.0;
                int[,] slots = { { 1, -24 }, { -1, 24 }, { -1, -24 }, { 1, 24 } };
                for (int s = 0; s < Math.Min(k, 4) && m.Count < MAX_PARKED; s++)
                {
                    int sd = slots[(s + x + y) % 4, 0]; double along = slots[(s + x + y) % 4, 1] / 10.0;
                    double h = Math.Sin(i * 12.9898 + s * 78.233) * 43758.5453, r = h - Math.Floor(h);
                    if (horiz) m.Add(Pose(mx + along, 0.12, mz + sd * off, r < 0.5 ? 1 : -1, 0, 0));
                    else m.Add(Pose(mx + sd * off, 0.12, mz + along, 0, 0, r < 0.5 ? 1 : -1));
                    c.Add(C(CAR_COLORS[(int)Math.Floor(r * 997) % CAR_COLORS.Length]));
                }
            }
            parked.Set(m, c);
        }

        public void Update(World w, TrafficState tr)
        {
            UpdateParked(w);
            var mats = new List<Matrix4x4>[4]; var cols = new List<Color>[4];
            for (int k = 0; k < 4; k++) { mats[k] = new List<Matrix4x4>(); cols[k] = new List<Color>(); }
            var bm = new List<Matrix4x4>(); var bc = new List<Color>();
            double dt = Math.Max(0, Math.Min(0.5, tr.clock - lastClock));
            lastClock = tr.clock;
            double ease = 1 - Math.Exp(-dt * 6);
            spots.Clear(); busPoses.Clear();
            var live = new HashSet<Car>();
            var a = new LanePath.P3(); var b = new LanePath.P3();
            foreach (var car in tr.cars)
            {
                live.Add(car);
                double st = car.i + car.t;
                double want = LaneOff(w, car, st);
                double off = side.TryGetValue(car, out var o) ? o + (want - o) * ease : want;
                side[car] = off;
                Sample(w, car, st - 0.3, off, ref a);
                Sample(w, car, st + 0.3, off, ref b);
                double dx = b.x - a.x, dz = b.z - a.z;
                if (dx * dx + dz * dz < 1e-4) continue;
                double px = (a.x + b.x) / 2, py = (a.y + b.y) / 2, pz = (a.z + b.z) / 2;
                if (car.v > 1) spots.Add(new V(px, pz));
                var pose = Pose(px, py, pz, dx, b.y - a.y, dz);
                if (car.bus >= 0)
                {
                    busPoses.Add((car.bus, pose));
                    continue;
                }
                int kind = car.kind;
                mats[kind].Add(pose);
                var pal = kind == 0 ? CAR_COLORS : kind == 1 ? BUS_COLORS : kind == 2 ? TRUCK_COLORS : SCOOTER_COLORS;
                cols[kind].Add(C(pal[(int)Math.Floor(car.look * 997) % pal.Length]));
            }
            if (side.Count > live.Count * 2 + 100) { var dead = new List<Car>(); foreach (var k in side.Keys) if (!live.Contains(k)) dead.Add(k); foreach (var k in dead) side.Remove(k); }
            for (int k = 0; k < 4; k++) models[k].Set(mats[k], cols[k]);

        }

        public void Draw() { foreach (var m in models) m.Draw(); parked.Draw(); }

        static double LaneOff(World w, Car car, double s)
        {
            var path = car.path; int last = path.Length - 1;
            s = Math.Max(0, Math.Min(last, s));
            int i = Math.Min(last - 1, (int)Math.Floor(s)); double f = s - i;
            int node = path[f < 0.5 ? i : i + 1];
            int rt = Graph.roadTypeOf(w, node);
            if (rt == Road.Highway) return car.kind == 3 ? 5.2 : car.lane != 0 ? 4.6 : 1.9;
            bool avenue = rt == Road.Avenue;
            bool pk = node < Graph.NN && w.parked[node] > 0;
            if (node < Graph.NN && w.oneway[node] != 0)
            {
                double half = avenue ? 2.4 : 1.3;
                if (car.kind == 3) return car.lane != 0 ? half + 0.6 : -half + 0.4;
                return car.lane != 0 ? half : -half + (pk ? 0.6 : 0);
            }
            if (avenue)
            {
                if (car.kind == 3) return car.lane != 0 ? (pk ? 3.0 : 4.1) : 1.6;
                return car.lane != 0 ? (pk ? 2.6 : 3.75) : pk ? 0.85 : 1.25;
            }
            return car.kind == 3 ? (pk ? 1.1 : 2.9) : pk ? 1.1 : 1.75;
        }

        static void Sample(World w, Car car, double s, double lane, ref LanePath.P3 o)
        {
            var path = car.path; int last = path.Length - 1;
            s = Math.Max(0, Math.Min(last, s));
            int i = Math.Min(last - 1, (int)Math.Floor(s)); double f = s - i;
            int n0 = path[Math.Max(0, i)], n1 = path[Math.Min(last, i + 1)];
            LanePath.laneAt(k => CityRoads.nodeCentre(path[k], w), last, s, lane, 6, false, ref o);
            if (LanePath.onRing(w, path, s, lane, out double rx, out double rz)) { o.x = rx; o.z = rz; }
            o.y = CityRoads.roadY(w, n0, n1, f, o.x, o.z);
        }
    }
}
