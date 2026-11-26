using System.Collections.Generic;
using UnityEngine;
using static NaeDosi.Defs;

namespace NaeDosi.Render
{
    /// <summary>See-through cell highlights for the active tool, a coverage ring, and the band of a curve being laid (render/preview.ts).</summary>
    public sealed class PreviewView
    {
        readonly Instances cells;
        readonly Material cellMat, ringMat, lineMat, handleMat;
        readonly Mesh ring, handle;
        readonly Mesh line = new Mesh();
        bool ringOn, lineOn, handleOn;
        Vector3 ringPos, handlePos; float ringR;

        public PreviewView(Shader ghost)
        {
            cellMat = new Material(ghost) { enableInstancing = true }; cellMat.SetColor("_Color", new Color(1, 1, 1, 0.45f));
            ringMat = new Material(ghost); ringMat.SetColor("_Color", new Color(1, 1, 1, 0.8f));
            lineMat = new Material(ghost); lineMat.SetColor("_Color", new Color(1, 1, 1, 0.75f));
            handleMat = new Material(ghost); handleMat.SetColor("_Color", new Color(1, 1, 1, 0.9f));
            var box = new MeshKit.Shape().Box(new Vector3(0, 0.3f, 0), new Vector3(CELL * 0.96f, 0.6f, CELL * 0.96f), Color.white).ToMesh("ghostcell");
            cells = new Instances(box, cellMat) { shadows = false };
            // A flat ring of radius 0.97..1 (scaled by the radius).
            var rv = new List<Vector3>(); var ri = new List<int>();
            for (int k = 0; k <= 64; k++) { float a = k * Mathf.PI * 2 / 64; rv.Add(new Vector3(Mathf.Cos(a) * 0.97f, 0, Mathf.Sin(a) * 0.97f)); rv.Add(new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a))); }
            for (int k = 0; k < 64; k++) { int a = k * 2; ri.AddRange(new[] { a, a + 1, a + 3, a, a + 3, a + 2 }); }
            ring = MeshKit.Build("ring", rv, null, ri);
            handle = new MeshKit.Shape().Cylinder(1.6f, 1.6f, -0.2f, 0.2f, 20, Color.white).ToMesh("handle");
        }

        static Color C(string hex) { ColorUtility.TryParseHtmlString(hex, out var c); return c.linear; }

        /// <summary>Show cells (by index) in a colour; extra height for building ghosts.</summary>
        public void Show(IList<int> list, string color, float height = 0.6f)
        {
            var m = new List<Matrix4x4>(); var c = new List<Color>(); var k = C(color);
            int n = Mathf.Min(list.Count, N * N);
            for (int j = 0; j < n; j++)
            {
                int i = list[j];
                m.Add(Matrix4x4.TRS(MeshKit.P((i % N) * CELL + CELL / 2.0, 0, (i / N) * CELL + CELL / 2.0), Quaternion.identity, new Vector3(1, height / 0.6f, 1)));
                c.Add(k);
            }
            cells.Set(m, c);
        }

        public void ShowEach(IList<(int i, string color)> list)
        {
            var m = new List<Matrix4x4>(); var c = new List<Color>();
            foreach (var (i, col) in list) { m.Add(Matrix4x4.Translate(MeshKit.P((i % N) * CELL + CELL / 2.0, 0, (i / N) * CELL + CELL / 2.0))); c.Add(C(col)); }
            cells.Set(m, c);
        }

        public void RingAt(double x, double z, double r) { ringOn = r > 0; ringPos = MeshKit.P(x, 0.8, z); ringR = (float)r; }

        /// <summary>A flat band along a polyline (a curved road being laid), and the bend handle.</summary>
        public void Path(IList<V> pts, double width, string color, V? handleAt = null)
        {
            lineOn = pts.Count > 1; handleOn = handleAt != null;
            if (handleAt != null) handlePos = MeshKit.P(handleAt.Value.x, 1.2, handleAt.Value.z);
            if (!lineOn) return;
            var t = new Tris();
            var k = Rgb.Hex(color);
            for (int j = 0; j + 1 < pts.Count; j++)
            {
                V a = pts[j], b = pts[j + 1];
                double l = System.Math.Sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)); if (l == 0) l = 1;
                double nx = -(b.z - a.z) / l * width / 2, nz = (b.x - a.x) / l * width / 2;
                t.quad(new V(a.x + nx, a.z + nz), new V(b.x + nx, b.z + nz), new V(b.x - nx, b.z - nz), new V(a.x - nx, a.z - nz), 0.9, k);
            }
            var mesh = MeshKit.FromTris("path", t);
            line.Clear(); line.SetVertices(mesh.vertices); line.SetTriangles(mesh.triangles, 0); line.RecalculateBounds();
            lineMat.SetColor("_Color", new Color(k.r, k.g, k.b, 0.75f));
        }

        public void Clear() { cells.Set(new List<Matrix4x4>(), null); ringOn = lineOn = handleOn = false; }

        public void Draw()
        {
            cells.Draw();
            if (ringOn) Graphics.RenderMesh(new RenderParams(ringMat), ring, 0, Matrix4x4.TRS(ringPos, Quaternion.identity, Vector3.one * ringR));
            if (lineOn) Graphics.RenderMesh(new RenderParams(lineMat), line, 0, Matrix4x4.identity);
            if (handleOn) Graphics.RenderMesh(new RenderParams(handleMat), handle, 0, Matrix4x4.Translate(handlePos));
        }
    }
}
