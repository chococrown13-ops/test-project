using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace NaeDosi.Render
{
    /// <summary>
    /// Turns the web game's triangle lists into Unity meshes. The web map runs x east, z south (right-handed);
    /// Unity is left-handed, so every point goes in with z negated and every triangle with its winding reversed.
    /// </summary>
    public static class MeshKit
    {
        public static Vector3 P(double x, double y, double z) => new Vector3((float)x, (float)y, (float)-z);

        /// <summary>A flat-shaded mesh from a list of (web-space) triangles with one colour per vertex.</summary>
        public static Mesh FromTris(string name, params Tris[] parts)
        {
            var v = new List<Vector3>();
            var c = new List<Color>();
            foreach (var t in parts)
            {
                if (t == null) continue;
                var p = t.pos; var k = t.col;
                for (int i = 0; i + 8 < p.Count; i += 9)
                {
                    // a, c, b: the mirror flips the winding back.
                    v.Add(new Vector3(p[i], p[i + 1], -p[i + 2]));
                    v.Add(new Vector3(p[i + 6], p[i + 7], -p[i + 8]));
                    v.Add(new Vector3(p[i + 3], p[i + 4], -p[i + 5]));
                    c.Add(new Color(k[i], k[i + 1], k[i + 2]));
                    c.Add(new Color(k[i + 6], k[i + 7], k[i + 8]));
                    c.Add(new Color(k[i + 3], k[i + 4], k[i + 5]));
                }
            }
            return Build(name, v, c, null);
        }

        public static Mesh Build(string name, List<Vector3> v, List<Color> c, List<int> idx, List<Vector2> uv = null)
        {
            var m = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
            m.SetVertices(v);
            if (c != null) m.SetColors(c);
            if (uv != null) m.SetUVs(0, uv);
            if (idx == null) { idx = new List<int>(v.Count); for (int i = 0; i < v.Count; i++) idx.Add(i); }
            m.SetTriangles(idx, 0);
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }

        // ---- Small primitives, built flat-shaded (one vertex per corner of each face) in Unity space. ----

        public sealed class Shape
        {
            public readonly List<Vector3> v = new List<Vector3>();
            public readonly List<Color> c = new List<Color>();
            public void Tri(Vector3 a, Vector3 b, Vector3 d, Color k) { v.Add(a); v.Add(b); v.Add(d); c.Add(k); c.Add(k); c.Add(k); }
            public Mesh ToMesh(string name) => Build(name, v, c, null);

            /// <summary>Three.js CylinderGeometry: radialSegments around, from y0 to y1, with caps.</summary>
            public Shape Cylinder(float rTop, float rBot, float y0, float y1, int seg, Color k, float sx = 1, float sy = 1, float sz = 1, Vector3 off = default)
            {
                Vector3 at(float r, float y, int i)
                {
                    // three.js starts at +z and runs towards +x; mirror z for Unity.
                    float a = i * Mathf.PI * 2 / seg;
                    return off + new Vector3(r * Mathf.Sin(a) * sx, y * sy, -r * Mathf.Cos(a) * sz);
                }
                for (int i = 0; i < seg; i++)
                {
                    Vector3 t0 = at(rTop, y1, i), t1 = at(rTop, y1, i + 1), b0 = at(rBot, y0, i), b1 = at(rBot, y0, i + 1);
                    if (rTop > 0) Tri(t0, t1, b1, k);
                    if (rBot > 0) Tri(t0, b1, b0, k);
                    else Tri(t0, t1, b0, k);
                    if (rTop > 0) Tri(off + new Vector3(0, y1 * sy, 0), t1, t0, k);
                    if (rBot > 0) Tri(off + new Vector3(0, y0 * sy, 0), b0, b1, k);
                }
                return this;
            }

            /// <summary>Three.js IcosahedronGeometry(r, 0), scaled and moved.</summary>
            public Shape Ico(float r, Vector3 centre, Color k, Vector3 scale)
            {
                float t = (1 + Mathf.Sqrt(5)) / 2;
                var p = new[] { new Vector3(-1, t, 0), new Vector3(1, t, 0), new Vector3(-1, -t, 0), new Vector3(1, -t, 0), new Vector3(0, -1, t), new Vector3(0, 1, t), new Vector3(0, -1, -t), new Vector3(0, 1, -t), new Vector3(t, 0, -1), new Vector3(t, 0, 1), new Vector3(-t, 0, -1), new Vector3(-t, 0, 1) };
                int[] f = { 0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1 };
                Vector3 at(int i) { var q = p[i].normalized * r; q.z = -q.z; return centre + Vector3.Scale(q, scale); }
                for (int i = 0; i < f.Length; i += 3) Tri(at(f[i]), at(f[i + 2]), at(f[i + 1]), k);
                return this;
            }

            /// <summary>An axis-aligned box centred on c (Unity space).</summary>
            public Shape Box(Vector3 c0, Vector3 size, Color k)
            {
                Vector3 h = size * 0.5f;
                Vector3 p(int x, int y, int z) => c0 + new Vector3(x * h.x, y * h.y, z * h.z);
                void q(Vector3 a, Vector3 b, Vector3 cc, Vector3 d) { Tri(a, b, cc, k); Tri(a, cc, d, k); }
                q(p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1));     // top
                q(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)); // bottom
                q(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1));     // +z
                q(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)); // -z
                q(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1));     // +x
                q(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)); // -x
                return this;
            }
        }

        public static Color Lin(int hex) { var r = Rgb.FromInt(hex); return new Color(r.r, r.g, r.b); }
        public static Color Lin(string hex) { var r = Rgb.Hex(hex); return new Color(r.r, r.g, r.b); }
    }

    /// <summary>Draws one mesh many times with a colour each, in batches of 1023 (Unity's limit per call).</summary>
    public sealed class Instances
    {
        public Mesh mesh;
        public Material mat;
        public bool shadows = true;
        /// <summary>Cast shadows but never draw (the web's colorWrite:false clouds).</summary>
        public bool shadowsOnly;
        readonly List<Matrix4x4[]> mats = new List<Matrix4x4[]>();
        readonly List<MaterialPropertyBlock> blocks = new List<MaterialPropertyBlock>();
        readonly List<int> counts = new List<int>();
        static readonly int TINT = Shader.PropertyToID("_Tint");

        public Instances(Mesh mesh, Material mat) { this.mesh = mesh; this.mat = mat; }

        public void Set(List<Matrix4x4> m, List<Color> c)
        {
            mats.Clear(); blocks.Clear(); counts.Clear();
            for (int s = 0; s < m.Count; s += 1023)
            {
                int n = Mathf.Min(1023, m.Count - s);
                var a = new Matrix4x4[n]; var t = new Vector4[n];
                for (int i = 0; i < n; i++) { a[i] = m[s + i]; var k = c != null ? c[s + i] : Color.white; t[i] = new Vector4(k.r, k.g, k.b, 1); }
                var b = new MaterialPropertyBlock();
                b.SetVectorArray(TINT, t);
                mats.Add(a); blocks.Add(b); counts.Add(n);
            }
        }

        public void Draw()
        {
            if (mesh == null) return;
            for (int i = 0; i < mats.Count; i++)
            {
                var rp = new RenderParams(mat) { matProps = blocks[i], shadowCastingMode = shadowsOnly ? ShadowCastingMode.ShadowsOnly : shadows ? ShadowCastingMode.On : ShadowCastingMode.Off, receiveShadows = true, worldBounds = new Bounds(new Vector3(1280, 0, -1280), new Vector3(8000, 400, 8000)) };
                Graphics.RenderMeshInstanced(rp, mesh, 0, mats[i], counts[i]);
            }
        }
    }
}
