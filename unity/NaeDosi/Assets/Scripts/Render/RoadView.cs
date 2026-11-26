using System.Collections.Generic;
using UnityEngine;
using static NaeDosi.Defs;

namespace NaeDosi.Render
{
    /// <summary>Roads, flyovers and bridges, street lamps and the 가로수 (port of the drawing half of render/roads.ts).</summary>
    public sealed class RoadView
    {
        public readonly GameObject root;
        readonly Material roadMat, paintMat, poleMat, lampMat, treeMat;
        readonly Instances poles, lamps, trunks, ginkgo, cherry;
        string ver = "", season = "";
        List<(double x, double z, bool cherry, double s)> spots = new List<(double, double, bool, double)>();
        readonly List<GameObject> parts = new List<GameObject>();

        public RoadView(Transform parent, Shader shader)
        {
            root = new GameObject("Roads");
            root.transform.SetParent(parent, false);
            roadMat = new Material(shader) { name = "road" };
            roadMat.SetFloat("_Mode", 1); roadMat.SetFloat("_Smooth", 0.08f);
            paintMat = new Material(shader) { name = "paint" };
            paintMat.SetFloat("_Mode", 1); paintMat.SetFloat("_Smooth", 0.4f);
            paintMat.renderQueue = 2010; paintMat.SetFloat("_Off", -2);
            poleMat = new Material(shader) { name = "pole", enableInstancing = true };
            poleMat.SetFloat("_Mode", 1); poleMat.SetFloat("_Smooth", 0.4f);
            lampMat = new Material(shader) { name = "lamp", enableInstancing = true };
            lampMat.SetFloat("_Mode", 1); lampMat.SetFloat("_Smooth", 0.3f);
            treeMat = new Material(shader) { name = "streettree", enableInstancing = true };
            treeMat.SetFloat("_Mode", 1); treeMat.SetFloat("_Smooth", 0.1f);
            poles = new Instances(new MeshKit.Shape().Cylinder(0.09f, 0.12f, 0, 6.5f, 5, MeshKit.Lin("#8c9196")).ToMesh("pole"), poleMat);
            lamps = new Instances(new MeshKit.Shape().Box(Vector3.zero, new Vector3(0.45f, 0.22f, 1.4f), MeshKit.Lin("#d8d8d0")).ToMesh("lamp"), lampMat) { shadows = false };
            trunks = new Instances(new MeshKit.Shape().Cylinder(0.11f, 0.16f, 0, 2.8f, 5, Color.white).ToMesh("trunk"), treeMat);
            ginkgo = new Instances(new MeshKit.Shape().Cylinder(0, 1.25f, 2.0f, 6.4f, 7, Color.white).ToMesh("ginkgo"), treeMat);
            cherry = new Instances(new MeshKit.Shape().Ico(1.8f, new Vector3(0, 3.6f, 0), Color.white, new Vector3(1, 0.75f, 1)).ToMesh("cherry"), treeMat);
        }

        static string SeasonOf(int m) => m == 4 ? "blossom" : m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 9 ? "summer" : m >= 10 && m <= 11 ? "autumn" : "winter";

        public void Update(World w, string busKey, HashSet<int> busCells, int month, float night)
        {
            lampMat.SetColor("_Emit", MeshKit.Lin("#ffcf86") * (night * 2.2f));
            string v = $"{w.ver.roads}:{busKey}";
            if (v == ver) { if (SeasonOf(month) != season) Trees(month); return; }
            ver = v;
            foreach (var g in parts) Object.Destroy(g);
            parts.Clear();
            var d = RoadLayerData.Build(w, busCells);
            Add("road", MeshKit.FromTris("road", d.road.ToArray()), roadMat, true);
            Add("paint", MeshKit.FromTris("paint", d.paint.ToArray()), paintMat, false);
            Add("extra", MeshKit.FromTris("extra", d.extra), roadMat, true);
            var pm = new List<Matrix4x4>(); var lm = new List<Matrix4x4>();
            float SW = (float)RoadLayerData.SW;
            foreach (var (x, z, ang) in d.lamps)
            {
                pm.Add(Matrix4x4.Translate(MeshKit.P(x, SW, z)));
                // three.js turns by ang about +y; with z mirrored that is a turn of -ang.
                lm.Add(Matrix4x4.TRS(MeshKit.P(x + System.Math.Sin(ang) * 0.7, SW + 6.4, z + System.Math.Cos(ang) * 0.7), Quaternion.Euler(0, (float)(-ang * Mathf.Rad2Deg), 0), Vector3.one));
            }
            poles.Set(pm, null); lamps.Set(lm, null);
            spots = d.trees;
            Trees(month);
        }

        void Add(string name, Mesh m, Material mat, bool shadows)
        {
            if (m.vertexCount == 0) return;
            var g = new GameObject(name);
            g.transform.SetParent(root.transform, false);
            g.AddComponent<MeshFilter>().sharedMesh = m;
            var r = g.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = shadows ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            parts.Add(g);
        }

        void Trees(int month)
        {
            season = SeasonOf(month);
            var GINKGO = new Dictionary<string, string> { { "spring", "#9cc65a" }, { "blossom", "#9cc65a" }, { "summer", "#5f9a3f" }, { "autumn", "#f2c12e" }, { "winter", "" } };
            var CHERRY = new Dictionary<string, string> { { "spring", "#86b85a" }, { "blossom", "#f6c9d6" }, { "summer", "#4f8a3c" }, { "autumn", "#d9822b" }, { "winter", "" } };
            var tm = new List<Matrix4x4>(); var tc = new List<Color>();
            var gm = new List<Matrix4x4>(); var gc = new List<Color>();
            var cm = new List<Matrix4x4>(); var cc = new List<Color>();
            float SW = (float)RoadLayerData.SW;
            var brown = MeshKit.Lin("#6b5440");
            foreach (var t in spots)
            {
                var m = Matrix4x4.TRS(MeshKit.P(t.x, SW, t.z), Quaternion.identity, Vector3.one * (float)t.s);
                tm.Add(m); tc.Add(brown);
                if (season == "winter") continue;
                if (t.cherry) { cm.Add(m); cc.Add(MeshKit.Lin(CHERRY[season])); }
                else { gm.Add(m); gc.Add(MeshKit.Lin(GINKGO[season])); }
            }
            trunks.Set(tm, tc); ginkgo.Set(gm, gc); cherry.Set(cm, cc);
        }

        public void Draw() { poles.Draw(); lamps.Draw(); trunks.Draw(); ginkgo.Draw(); cherry.Draw(); }
    }
}
