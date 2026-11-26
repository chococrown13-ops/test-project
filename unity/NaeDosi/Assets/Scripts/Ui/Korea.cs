using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace NaeDosi.Ui
{
    /// <summary>
    /// Real-Korea starting maps (ui/korea.ts): a draw of three 2.56 km squares from different 시/군, with one
    /// province left out if the player wants and one redraw; remembered until a city is founded from it.
    /// </summary>
    public static class Korea
    {
        public sealed class TileInfo { public string id, name, prov; public bool water; }
        public sealed class Draw { public string exclude = ""; public List<string> picks = new List<string>(); public bool rerolled; }

        static Dictionary<string, string> provinces;
        static List<TileInfo> tiles;
        static readonly Dictionary<string, List<Dictionary<string, object>>> provCache = new Dictionary<string, List<Dictionary<string, object>>>();

        public static Dictionary<string, string> Provinces { get { Load(); return provinces; } }
        public static List<TileInfo> Tiles { get { Load(); return tiles; } }

        static void Load()
        {
            if (tiles != null) return;
            provinces = new Dictionary<string, string>(); tiles = new List<TileInfo>();
            var ta = Resources.Load<TextAsset>("Korea/index");
            if (ta == null) return;
            var o = Json.Parse(ta.text) as Dictionary<string, object>;
            foreach (var kv in o.O("provinces")) provinces[kv.Key] = kv.Value as string;
            foreach (Dictionary<string, object> t in o.L("tiles")) tiles.Add(new TileInfo { id = t.S("id"), name = t.S("name"), prov = t.S("prov"), water = t.B("water") });
        }

        static List<Dictionary<string, object>> Province(string prov)
        {
            if (provCache.TryGetValue(prov, out var l)) return l;
            var ta = Resources.Load<TextAsset>("Korea/p" + prov);
            l = ta == null ? new List<Dictionary<string, object>>() : (Json.Parse(ta.text) as List<object>).Cast<Dictionary<string, object>>().ToList();
            provCache[prov] = l;
            return l;
        }

        /// <summary>Everything createRealWorld needs for one tile.</summary>
        public static RealLand LoadTile(TileInfo info)
        {
            var t = Province(info.prov).FirstOrDefault(x => x.S("id") == info.id);
            if (t == null) throw new Exception($"지도 조각을 찾지 못했어요: {info.id}");
            var cells = Deflate.Inflate(Convert.FromBase64String(t.S("data")));
            return new RealLand { cells = cells, row = t.I("row"), id = info.id, name = info.name, prov = Provinces.TryGetValue(info.prov, out var p) ? p : "", lat = t.D("lat"), lon = t.D("lon") };
        }

        const string KEY = "city.koreaDraw.v2";
        public static Draw Saved()
        {
            var s = PlayerPrefs.GetString(KEY, "");
            if (s == "") return null;
            var f = s.Split('|');
            return f.Length < 3 ? null : new Draw { exclude = f[0], picks = f[1].Split(',').Where(x => x != "").ToList(), rerolled = f[2] == "1" };
        }
        public static void Store(Draw d)
        {
            if (d == null) PlayerPrefs.DeleteKey(KEY); else PlayerPrefs.SetString(KEY, $"{d.exclude}|{string.Join(",", d.picks)}|{(d.rerolled ? 1 : 0)}");
            PlayerPrefs.Save();
        }

        /// <summary>Three tiles from three different 시/군, none in the excluded province; `avoid` keeps a redraw from repeating places.</summary>
        public static List<string> DrawTiles(string exclude, List<string> avoid = null)
        {
            string unitOf(string id) => id.Split('-')[0];
            var skip = new HashSet<string>((avoid ?? new List<string>()).Select(unitOf));
            var units = new Dictionary<string, List<TileInfo>>();
            var order = new List<string>();
            foreach (var t in Tiles)
            {
                if (t.prov == exclude || skip.Contains(unitOf(t.id))) continue;
                var u = unitOf(t.id);
                if (!units.ContainsKey(u)) { units[u] = new List<TileInfo>(); order.Add(u); }
                units[u].Add(t);
            }
            var o = new List<string>();
            while (o.Count < 3 && order.Count > 0)
            {
                int k = UnityEngine.Random.Range(0, order.Count);
                var list = units[order[k]]; order.RemoveAt(k);
                o.Add(list[UnityEngine.Random.Range(0, list.Count)].id);
            }
            return o;
        }

        /// <summary>A small top-down picture of a tile: water, woods, open land and hills, and the expressway link.</summary>
        public static Texture2D Preview(TileInfo info)
        {
            var real = LoadTile(info);
            int N = Defs.N;
            var tex = new Texture2D(N, N, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point };
            var px = new Color32[N * N];
            for (int i = 0; i < N * N; i++)
            {
                int v = real.cells[i];
                Color32 c;
                if (v == 2) c = new Color32(86, 150, 204, 255);
                else if (v == 1) c = new Color32(120, 168, 104, 255);
                else if (v == 0) c = new Color32(196, 214, 150, 255);
                else { float k = Mathf.Min(1, (v - 3) / 90f); c = new Color32((byte)(150 - k * 40), (byte)(140 - k * 30), (byte)(108 - k * 20), 255); }
                int x = i % N, y = i / N;
                px[(N - 1 - y) * N + x] = c;
            }
            for (int x = 0; x < 23; x++) for (int dy = 0; dy < 2; dy++) { int y = real.row + dy; if (y < N) px[(N - 1 - y) * N + x] = new Color32(0x2b, 0x2d, 0x31, 255); }
            tex.SetPixels32(px); tex.Apply();
            return tex;
        }
    }
}
