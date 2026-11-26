using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace NaeDosi.Ui
{
    /// <summary>Saved cities, one slot each, like the web's localStorage slots (in the browser PlayerPrefs live in IndexedDB).</summary>
    public static class Slots
    {
        public sealed class Slot { public string id, name; public double pop, money; public int day; public long at; }
        const string INDEX = "city.slots";
        static string Key(string id) => "city.slot." + id;

        public static List<Slot> List()
        {
            var list = new List<Slot>();
            foreach (var line in PlayerPrefs.GetString(INDEX, "").Split('\n'))
            {
                var f = line.Split('\t');
                if (f.Length < 6) continue;
                list.Add(new Slot { id = f[0], name = f[1], pop = double.Parse(f[2]), day = int.Parse(f[3]), money = double.Parse(f[4]), at = long.Parse(f[5]) });
            }
            return list.OrderByDescending(x => x.at).ToList();
        }

        static void WriteIndex(List<Slot> list)
        {
            PlayerPrefs.SetString(INDEX, string.Join("\n", list.Select(x => $"{x.id}\t{x.name.Replace('\t', ' ').Replace('\n', ' ')}\t{x.pop}\t{x.day}\t{x.money}\t{x.at}")));
            PlayerPrefs.Save();
        }

        static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public static bool Save(World w)
        {
            try
            {
                w.slot ??= "c" + Convert.ToString(Now, 16);
                PlayerPrefs.SetString(Key(w.slot), NaeDosi.Save.pack(w));
                var list = List().Where(x => x.id != w.slot).ToList();
                list.Add(new Slot { id = w.slot, name = w.name, pop = w.stats.pop, day = w.day, money = Math.Round(w.money), at = Now });
                WriteIndex(list);
                return true;
            }
            catch { return false; }
        }

        public static World Load(string id)
        {
            try
            {
                var s = PlayerPrefs.GetString(Key(id), "");
                var w = s != "" ? NaeDosi.Save.unpack(s) : null;
                if (w != null) w.slot = id;
                return w;
            }
            catch { return null; }
        }

        public static void Delete(string id)
        {
            PlayerPrefs.DeleteKey(Key(id));
            WriteIndex(List().Where(x => x.id != id).ToList());
        }
    }
}
