using UnityEngine;

namespace Ssuksuk
{
    /// <summary>A square the mouse can point at: a board square (c, r) or a bench slot.</summary>
    public class Spot : MonoBehaviour
    {
        public bool Bench;
        public int C, R, Index;
        public Renderer Face;
        public Color Base;
    }

    /// <summary>
    /// The lacquered game board in its mossy yard: 7 squares across and 6 deep, the near three rows
    /// ours, with a bench of 8 slots in front. Board squares are 1.6 m; (0,0) is our near-left corner.
    /// </summary>
    public class Board : MonoBehaviour
    {
        public const int Cols = 7, Rows = 6, Half = 3, BenchSlots = 8;
        public const float Sq = 1.6f;
        public Spot[,] Squares { get; private set; }
        public Spot[] BenchSpots { get; private set; }

        public static Vector3 ToWorld(Vector2 p) => new Vector3((p.x - (Cols - 1) / 2f) * Sq, 0.12f, (p.y - (Rows - 1) / 2f) * Sq);
        public static Vector3 BenchWorld(int i) => new Vector3((i - (BenchSlots - 1) / 2f) * Sq * 0.92f, 0.12f, -(Rows / 2f) * Sq - 1.55f);

        public void Build()
        {
            var frameM = Mats.Lit(Palette.Lacquer, 0.55f);
            // The yard.
            var ground = Mats.Prim(PrimitiveType.Cylinder, transform, new Vector3(0, -0.15f, -1f), new Vector3(220, 0.1f, 220), Mats.Lit(Palette.Moss, 0.05f));
            ground.name = "yard";
            // The board's lacquer frame, raised a little off the yard, with a darker lip.
            float w = Cols * Sq, d = Rows * Sq;
            Mats.Prim(PrimitiveType.Cube, transform, new Vector3(0, -0.06f, 0), new Vector3(w + 0.7f, 0.24f, d + 0.7f), frameM).name = "frame";
            Mats.Prim(PrimitiveType.Cube, transform, new Vector3(0, -0.13f, 0), new Vector3(w + 1.0f, 0.12f, d + 1.0f), Mats.Lit(Palette.LacquerDeep, 0.4f)).name = "lip";
            // The line between the halves.
            Mats.Prim(PrimitiveType.Cube, transform, new Vector3(0, 0.075f, 0), new Vector3(w, 0.02f, 0.06f), Mats.Lit(Palette.Accent, 0.5f)).name = "midline";

            Squares = new Spot[Cols, Rows];
            for (int c = 0; c < Cols; c++)
                for (int r = 0; r < Rows; r++)
                {
                    var col = (c + r) % 2 == 0 ? Palette.TileLight : Palette.TileDark;
                    if (r >= Half) col = Color.Lerp(col, Palette.Enemy, 0.06f);
                    var g = Mats.Prim(PrimitiveType.Cube, transform, ToWorld(new Vector2(c, r)) + new Vector3(0, -0.07f, 0), new Vector3(Sq * 0.96f, 0.08f, Sq * 0.96f), Mats.Lit(col, 0.15f));
                    g.name = $"square {c},{r}";
                    var s = g.AddComponent<Spot>();
                    s.C = c; s.R = r; s.Face = g.GetComponent<Renderer>(); s.Base = col;
                    if (r < Half) g.AddComponent<BoxCollider>();
                    Squares[c, r] = s;
                }

            // The bench: a lacquer tray with eight paper slots.
            var bz = BenchWorld(0).z;
            Mats.Prim(PrimitiveType.Cube, transform, new Vector3(0, -0.06f, bz), new Vector3(BenchSlots * Sq * 0.92f + 0.5f, 0.22f, Sq + 0.3f), frameM).name = "bench";
            BenchSpots = new Spot[BenchSlots];
            for (int i = 0; i < BenchSlots; i++)
            {
                var g = Mats.Prim(PrimitiveType.Cube, transform, BenchWorld(i) + new Vector3(0, -0.07f, 0), new Vector3(Sq * 0.84f, 0.08f, Sq * 0.84f), Mats.Lit(Palette.TileDark, 0.15f));
                g.name = $"bench {i}";
                g.AddComponent<BoxCollider>();
                var s = g.AddComponent<Spot>();
                s.Bench = true; s.Index = i; s.Face = g.GetComponent<Renderer>(); s.Base = Palette.TileDark;
                BenchSpots[i] = s;
            }
            Dress();
        }

        /// <summary>The yard round the board: stones, round trees, grass tufts, two stone lanterns. Scaled against a spirit (about 1 m).</summary>
        void Dress()
        {
            var rng = new System.Random(11);
            float R(float a, float b) => a + (float)rng.NextDouble() * (b - a);
            var stone = Mats.Lit(Palette.Muted, 0.1f);
            var leaf = Mats.Lit(Palette.MossDark, 0.1f);
            var leaf2 = Mats.Lit(Color.Lerp(Palette.Moss, Palette.Accent, 0.25f), 0.1f);
            var bark = Mats.Lit(Palette.Lacquer, 0.2f);
            // Trees behind and to the sides, so the far edge of the frame has depth.
            Vector3[] trees = { new(-9.5f, 0, 6f), new(-7.2f, 0, 9.5f), new(8.8f, 0, 7.5f), new(11f, 0, 3f), new(-11.5f, 0, 1.5f), new(3.5f, 0, 11f), new(-2.5f, 0, 12f) };
            foreach (var t in trees)
            {
                float h = R(1.6f, 2.6f);
                Mats.Prim(PrimitiveType.Cylinder, transform, t + new Vector3(0, h * 0.5f, 0), new Vector3(0.35f, h * 0.5f, 0.35f), bark, new Vector3(R(-4, 4), 0, R(-4, 4)));
                Mats.Prim(PrimitiveType.Sphere, transform, t + new Vector3(0, h + 0.8f, 0), new Vector3(2.6f, 2.2f, 2.6f) * R(0.9f, 1.2f), rng.NextDouble() < 0.5 ? leaf : leaf2);
                Mats.Prim(PrimitiveType.Sphere, transform, t + new Vector3(R(-0.6f, 0.6f), h + 1.7f, R(-0.6f, 0.6f)), Vector3.one * R(1.4f, 1.9f), leaf2);
            }
            for (int i = 0; i < 16; i++)
            {
                float a = R(0, Mathf.PI * 2), dist = R(7.5f, 13f);
                var p = new Vector3(Mathf.Cos(a) * dist * 1.1f, 0, Mathf.Sin(a) * dist * 0.9f);
                if (p.z < -7.5f) continue; // keep the near edge open for the camera
                Mats.Prim(PrimitiveType.Sphere, transform, p + new Vector3(0, 0.05f, 0), new Vector3(R(0.5f, 1.2f), R(0.3f, 0.6f), R(0.5f, 1f)), stone, new Vector3(0, R(0, 180), R(-8, 8)));
            }
            for (int i = 0; i < 40; i++)
            {
                float a = R(0, Mathf.PI * 2), dist = R(6.8f, 14f);
                var p = new Vector3(Mathf.Cos(a) * dist * 1.15f, 0, Mathf.Sin(a) * dist);
                Mats.Prim(PrimitiveType.Sphere, transform, p, new Vector3(0.35f, 0.25f, 0.35f) * R(0.7f, 1.4f), rng.NextDouble() < 0.5 ? leaf : leaf2);
            }
            // Stone lanterns at the board's far corners, with a warm glowing window.
            foreach (var x in new[] { -7.4f, 7.4f })
            {
                var at = new Vector3(x, 0, 5.6f);
                Mats.Prim(PrimitiveType.Cylinder, transform, at + new Vector3(0, 0.4f, 0), new Vector3(0.4f, 0.4f, 0.4f), stone);
                Mats.Prim(PrimitiveType.Cube, transform, at + new Vector3(0, 1.05f, 0), new Vector3(0.6f, 0.45f, 0.6f), stone);
                Mats.Prim(PrimitiveType.Cube, transform, at + new Vector3(0, 1.05f, 0), new Vector3(0.62f, 0.22f, 0.3f), Mats.Glow(Palette.Accent, 2.5f));
                Mats.Prim(PrimitiveType.Cube, transform, at + new Vector3(0, 1.42f, 0), new Vector3(0.95f, 0.14f, 0.95f), stone, new Vector3(0, 45, 0));
            }
        }

        /// <summary>Tint the squares a piece could go to; clear with null.</summary>
        public void Hint(bool on)
        {
            for (int c = 0; c < Cols; c++)
                for (int r = 0; r < Half; r++)
                {
                    var s = Squares[c, r];
                    s.Face.sharedMaterial = Mats.Lit(on ? Color.Lerp(s.Base, Palette.Accent, 0.28f) : s.Base, 0.15f);
                }
        }
    }
}
