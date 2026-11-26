using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace NaeDosi
{
    /// <summary>
    /// A small JSON reader and writer: objects become Dictionary&lt;string, object&gt;, arrays List&lt;object&gt;,
    /// numbers double. Enough for the web game's save files, which are one big JSON object.
    /// </summary>
    public static class Json
    {
        public static object Parse(string s) { int i = 0; var v = Value(s, ref i); return v; }

        static void Ws(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

        static object Value(string s, ref int i)
        {
            Ws(s, ref i);
            char c = s[i];
            if (c == '{')
            {
                var d = new Dictionary<string, object>();
                i++; Ws(s, ref i);
                if (s[i] == '}') { i++; return d; }
                for (; ; )
                {
                    Ws(s, ref i);
                    string k = Str(s, ref i);
                    Ws(s, ref i); i++; // ':'
                    d[k] = Value(s, ref i);
                    Ws(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    i++; return d; // '}'
                }
            }
            if (c == '[')
            {
                var l = new List<object>();
                i++; Ws(s, ref i);
                if (s[i] == ']') { i++; return l; }
                for (; ; )
                {
                    l.Add(Value(s, ref i));
                    Ws(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    i++; return l;
                }
            }
            if (c == '"') return Str(s, ref i);
            if (c == 't') { i += 4; return true; }
            if (c == 'f') { i += 5; return false; }
            if (c == 'n') { i += 4; return null; }
            int st = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            return double.Parse(s.Substring(st, i - st), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        static string Str(string s, ref int i)
        {
            i++; // opening quote
            var sb = new StringBuilder();
            for (; ; )
            {
                char c = s[i++];
                if (c == '"') return sb.ToString();
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u': sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                    default: sb.Append(e); break;
                }
            }
        }

        // ------------------------------------------------------------------ writing

        public static string Write(object v) { var sb = new StringBuilder(1 << 20); W(sb, v); return sb.ToString(); }

        static void W(StringBuilder sb, object v)
        {
            switch (v)
            {
                case null: sb.Append("null"); break;
                case string s: Q(sb, s); break;
                case bool b: sb.Append(b ? "true" : "false"); break;
                case double d: Num(sb, d); break;
                case float f: Num(sb, f); break;
                case int n: sb.Append(n.ToString(CultureInfo.InvariantCulture)); break;
                case long n: sb.Append(n.ToString(CultureInfo.InvariantCulture)); break;
                case uint n: sb.Append(n.ToString(CultureInfo.InvariantCulture)); break;
                case IDictionary<string, object> d:
                    sb.Append('{');
                    bool first = true;
                    foreach (var kv in d)
                    {
                        if (kv.Value is Skip) continue;
                        if (!first) sb.Append(',');
                        first = false;
                        Q(sb, kv.Key); sb.Append(':'); W(sb, kv.Value);
                    }
                    sb.Append('}');
                    break;
                case System.Collections.IEnumerable e:
                    sb.Append('[');
                    bool f2 = true;
                    foreach (var x in e) { if (!f2) sb.Append(','); f2 = false; W(sb, x); }
                    sb.Append(']');
                    break;
                default: Q(sb, v.ToString()); break;
            }
        }

        /// <summary>A value that leaves its key out (JSON.stringify drops undefined).</summary>
        public sealed class Skip { public static readonly Skip It = new Skip(); }

        static void Num(StringBuilder sb, double d)
        {
            if (double.IsNaN(d) || double.IsInfinity(d)) { sb.Append("null"); return; }
            if (d == Math.Floor(d) && Math.Abs(d) < 1e15) sb.Append(((long)d).ToString(CultureInfo.InvariantCulture));
            else sb.Append(d.ToString("R", CultureInfo.InvariantCulture));
        }

        static void Q(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4")); else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        // ------------------------------------------------------------------ helpers for reading

        public static double D(this Dictionary<string, object> o, string k, double def = 0) => o != null && o.TryGetValue(k, out var v) && v is double d ? d : def;
        public static int I(this Dictionary<string, object> o, string k, int def = 0) => o != null && o.TryGetValue(k, out var v) && v is double d ? (int)d : def;
        public static bool B(this Dictionary<string, object> o, string k, bool def = false) => o != null && o.TryGetValue(k, out var v) && v is bool b ? b : def;
        public static string S(this Dictionary<string, object> o, string k, string def = null) => o != null && o.TryGetValue(k, out var v) && v is string s ? s : def;
        public static Dictionary<string, object> O(this Dictionary<string, object> o, string k) => o != null && o.TryGetValue(k, out var v) ? v as Dictionary<string, object> : null;
        public static List<object> L(this Dictionary<string, object> o, string k) => o != null && o.TryGetValue(k, out var v) ? v as List<object> : null;
        public static bool Has(this Dictionary<string, object> o, string k) => o != null && o.TryGetValue(k, out var v) && v != null;
    }
}
