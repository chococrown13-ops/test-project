using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace NaeDosi.Ui
{
    /// <summary>
    /// Saved cities, one slot each, kept exactly where and how the web version keeps them (games/city/src/sim/save.ts):
    /// in the page's localStorage, an index under 'city.slots' (a JSON list) and each city under 'city.save.v1:&lt;id&gt;'
    /// ('city.save.v1' itself for the old single save 'main'). So the web version's saves open here and the other way round,
    /// and a big city fits (localStorage holds about 5 MB; Unity's PlayerPrefs in a browser only 1 MB).
    /// Saves made by earlier builds of this version, in PlayerPrefs, are copied over once.
    /// Off the web (the editor) PlayerPrefs stands in for localStorage.
    /// </summary>
    public static class Slots
    {
        public sealed class Slot { public string id, name; public double pop, money; public int day; public long at; }
        const string INDEX = "city.slots", KEY = "city.save.v1";
        static string SlotKey(string id) => id == "main" ? KEY : KEY + ":" + id;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern string LsGet(string key);
        [DllImport("__Internal")] static extern int LsSet(string key, string value);
        [DllImport("__Internal")] static extern void LsRemove(string key);
        static string Get(string k) => LsGet(k);
        static bool Set(string k, string v) => LsSet(k, v) == 1;
        static void Remove(string k) => LsRemove(k);
#else
        static string Get(string k) => PlayerPrefs.HasKey("ls." + k) ? PlayerPrefs.GetString("ls." + k) : null;
        static bool Set(string k, string v) { try { PlayerPrefs.SetString("ls." + k, v); PlayerPrefs.Save(); return true; } catch { return false; } }
        static void Remove(string k) => PlayerPrefs.DeleteKey("ls." + k);
#endif

        [Serializable] class Row { public string id, name; public double pop, money, at; public int day; }
        [Serializable] class Rows { public Row[] a; }

        static List<Slot> ReadIndex()
        {
            var list = new List<Slot>();
            var s = Get(INDEX);
            if (!string.IsNullOrEmpty(s))
            {
                try
                {
                    var r = JsonUtility.FromJson<Rows>("{\"a\":" + s + "}");
                    if (r?.a != null) foreach (var x in r.a) if (!string.IsNullOrEmpty(x.id)) list.Add(new Slot { id = x.id, name = x.name ?? "도시", pop = x.pop, money = x.money, day = x.day, at = (long)x.at });
                }
                catch { }
            }
            // The web version's single save from before slots.
            if (!list.Any(x => x.id == "main") && !string.IsNullOrEmpty(Get(KEY))) list.Add(new Slot { id = "main", name = "저장된 도시", at = 0 });
            return list;
        }

        static bool WriteIndex(List<Slot> list)
        {
            string J(string t) => "\"" + (t ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", " ").Replace("\t", " ") + "\"";
            string N(double d) => d.ToString("R", CultureInfo.InvariantCulture);
            return Set(INDEX, "[" + string.Join(",", list.Select(x => $"{{\"id\":{J(x.id)},\"name\":{J(x.name)},\"pop\":{N(x.pop)},\"day\":{x.day},\"money\":{N(x.money)},\"at\":{x.at}}}")) + "]");
        }

        /// <summary>Copies saves written by earlier builds of this version (PlayerPrefs 'city.slot.*') into the shared place, once.</summary>
        static void MoveOldSaves()
        {
            if (PlayerPrefs.GetInt("city.slots.moved", 0) == 1) return;
            var old = PlayerPrefs.GetString("city.slots", "");
            if (old == "") { PlayerPrefs.SetInt("city.slots.moved", 1); PlayerPrefs.Save(); return; }
            var list = ReadIndex();
            bool ok = true;
            foreach (var line in old.Split('\n'))
            {
                var f = line.Split('\t');
                if (f.Length < 6) continue;
                string id = f[0];
                var data = PlayerPrefs.GetString("city.slot." + id, "");
                if (data == "" || list.Any(x => x.id == id)) continue;
                if (!Set(SlotKey(id), data)) { ok = false; continue; }
                double.TryParse(f[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var pop);
                int.TryParse(f[3], out var day);
                double.TryParse(f[4], NumberStyles.Float, CultureInfo.InvariantCulture, out var money);
                long.TryParse(f[5], out var at);
                list.Add(new Slot { id = id, name = f[1], pop = pop, day = day, money = money, at = at });
            }
            if (WriteIndex(list) && ok) { PlayerPrefs.SetInt("city.slots.moved", 1); PlayerPrefs.Save(); }
        }

        public static List<Slot> List()
        {
            MoveOldSaves();
            return ReadIndex().OrderByDescending(x => x.at).ToList();
        }

        static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public static bool Save(World w)
        {
            try
            {
                w.slot ??= "c" + Convert.ToString(Now, 16);
                if (!Set(SlotKey(w.slot), NaeDosi.Save.pack(w))) return false;
                var list = List().Where(x => x.id != w.slot).ToList();
                list.Add(new Slot { id = w.slot, name = w.name, pop = w.stats.pop, day = w.day, money = Math.Round(w.money), at = Now });
                return WriteIndex(list);
            }
            catch { return false; }
        }

        public static World Load(string id)
        {
            try
            {
                var s = Get(SlotKey(id));
                if (string.IsNullOrEmpty(s)) s = PlayerPrefs.GetString("city.slot." + id, ""); // an earlier build's save not yet copied
                var w = !string.IsNullOrEmpty(s) ? NaeDosi.Save.unpack(s) : null;
                if (w != null) w.slot = id;
                return w;
            }
            catch { return null; }
        }

        public static void Delete(string id)
        {
            Remove(SlotKey(id));
            PlayerPrefs.DeleteKey("city.slot." + id);
            WriteIndex(List().Where(x => x.id != id).ToList());
        }
    }
}
