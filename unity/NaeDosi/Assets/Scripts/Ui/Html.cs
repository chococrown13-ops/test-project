using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.UIElements;

namespace NaeDosi.Ui
{
    /// <summary>
    /// Builds UI Toolkit elements from the small HTML the web game's HUD writes (ui/hud.ts), so the panels can be
    /// ported string for string and styled by the same class names (city.uss mirrors style.css).
    /// Runs of text with only plain inline tags (b, small, em, br) become one rich-text Label.
    /// Elements carry their classes, plus "t-&lt;tag&gt;"; aria-pressed="true" becomes the class "pressed".
    /// </summary>
    public static class Html
    {
        public sealed class Node
        {
            public string tag;                 // null for text
            public string text;
            public readonly Dictionary<string, string> attr = new Dictionary<string, string>();
            public readonly List<Node> kids = new List<Node>();
            public Node parent;
            public string Attr(string k) => attr.TryGetValue(k, out var v) ? v : null;
            public bool Has(string k) => attr.ContainsKey(k);
        }

        static readonly HashSet<string> VOID = new HashSet<string> { "input", "br", "img", "hr", "meta", "link" };
        static readonly HashSet<string> TEXTY = new HashSet<string> { "span", "b", "p", "dd", "dt", "h1", "h2", "h3", "h4", "label", "small", "strong" };
        static readonly HashSet<string> INLINE = new HashSet<string> { "b", "strong", "small", "em", "br", "i" };

        /// <summary>What a press on a button (or a change of a slider) hands back: the element's attributes.</summary>
        public delegate void Act(Node n, VisualElement e);

        public static List<Node> Parse(string html)
        {
            var root = new Node { tag = "#root" };
            var cur = root;
            int i = 0, L = html.Length;
            var sb = new StringBuilder();
            void flush()
            {
                if (sb.Length == 0) return;
                var t = Decode(sb.ToString());
                sb.Clear();
                if (t.Trim().Length == 0 && !t.Contains(" ")) { if (t.Length > 0 && cur.kids.Count > 0) cur.kids.Add(new Node { text = " ", parent = cur }); return; }
                cur.kids.Add(new Node { text = t, parent = cur });
            }
            while (i < L)
            {
                char c = html[i];
                if (c == '<')
                {
                    if (i + 3 < L && html[i + 1] == '!' && html[i + 2] == '-' && html[i + 3] == '-') { int e = html.IndexOf("-->", i, StringComparison.Ordinal); i = e < 0 ? L : e + 3; continue; }
                    flush();
                    int end = TagEnd(html, i);
                    string inner = html.Substring(i + 1, end - i - 1).Trim();
                    i = end + 1;
                    if (inner.StartsWith("/"))
                    {
                        string name = inner.Substring(1).Trim().ToLowerInvariant();
                        var n = cur;
                        while (n != root && n.tag != name) n = n.parent;
                        if (n != root) cur = n.parent;
                        continue;
                    }
                    bool selfClose = inner.EndsWith("/");
                    if (selfClose) inner = inner.Substring(0, inner.Length - 1).Trim();
                    var node = new Node { parent = cur };
                    int k = 0;
                    while (k < inner.Length && !char.IsWhiteSpace(inner[k])) k++;
                    node.tag = inner.Substring(0, k).ToLowerInvariant();
                    ParseAttrs(inner.Substring(k), node.attr);
                    cur.kids.Add(node);
                    if (!selfClose && !VOID.Contains(node.tag)) cur = node;
                    continue;
                }
                sb.Append(c);
                i++;
            }
            flush();
            return root.kids;
        }

        static int TagEnd(string s, int from)
        {
            char q = '\0';
            for (int i = from + 1; i < s.Length; i++)
            {
                char c = s[i];
                if (q != '\0') { if (c == q) q = '\0'; continue; }
                if (c == '"' || c == '\'') q = c;
                else if (c == '>') return i;
            }
            return s.Length - 1;
        }

        static void ParseAttrs(string s, Dictionary<string, string> into)
        {
            int i = 0;
            while (i < s.Length)
            {
                while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
                int a = i;
                while (i < s.Length && s[i] != '=' && !char.IsWhiteSpace(s[i])) i++;
                if (i == a) { i++; continue; }
                string name = s.Substring(a, i - a).ToLowerInvariant();
                while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
                string val = "";
                if (i < s.Length && s[i] == '=')
                {
                    i++;
                    while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
                    if (i < s.Length && (s[i] == '"' || s[i] == '\''))
                    {
                        char q = s[i++]; int b = i;
                        while (i < s.Length && s[i] != q) i++;
                        val = s.Substring(b, i - b); i++;
                    }
                    else { int b = i; while (i < s.Length && !char.IsWhiteSpace(s[i])) i++; val = s.Substring(b, i - b); }
                }
                into[name] = Decode(val);
            }
        }

        public static string Decode(string s)
        {
            if (s.IndexOf('&') < 0) return s;
            return s.Replace("&lt;", "<").Replace("&gt;", ">").Replace("&quot;", "\"").Replace("&#39;", "'").Replace("&nbsp;", " ").Replace("&amp;", "&");
        }

        /// <summary>Replace the host's children with the elements for this HTML.</summary>
        public static void Fill(VisualElement host, string html, Act act)
        {
            host.Clear();
            foreach (var e in BuildAll(Parse(html), act)) host.Add(e);
        }

        static bool IsInline(Node n)
        {
            if (n.tag == null || n.tag == "br") return true;
            if (n.kids.Count == 0 || n.Has("id") || n.Has("class") || n.Has("style")) return false;
            return (INLINE.Contains(n.tag) || n.tag == "span") && n.kids.TrueForAll(IsInline);
        }

        static List<VisualElement> BuildAll(List<Node> nodes, Act act)
        {
            var o = new List<VisualElement>();
            var run = new List<Node>();
            void flushRun()
            {
                if (run.Count == 0) return;
                string rt = Rich(run).Trim();
                run.Clear();
                if (rt.Length == 0) return;
                var l = new Label(rt) { enableRichText = true };
                l.AddToClassList("txt");
                o.Add(l);
            }
            foreach (var n in nodes)
            {
                if (IsInline(n)) { run.Add(n); continue; }
                flushRun();
                var e = Build(n, act);
                if (e != null) o.Add(e);
            }
            flushRun();
            return o;
        }

        /// <summary>Plain inline content as rich text.</summary>
        static string Rich(List<Node> nodes)
        {
            var sb = new StringBuilder();
            foreach (var n in nodes)
            {
                if (n.tag == null) { sb.Append(n.text.Replace("<", "&lt;")); continue; }
                string inner = Rich(n.kids);
                switch (n.tag)
                {
                    case "b": case "strong": sb.Append("<b>").Append(inner).Append("</b>"); break;
                    case "small": sb.Append("<size=85%>").Append(inner).Append("</size>"); break;
                    case "em": case "i": sb.Append("<i>").Append(inner).Append("</i>"); break;
                    case "br": sb.Append('\n'); break;
                    default: sb.Append(inner); break;
                }
            }
            return sb.ToString();
        }

        static VisualElement Build(Node n, Act act)
        {
            VisualElement e;
            bool allInline = n.kids.TrueForAll(IsInline);
            switch (n.tag)
            {
                case "button":
                {
                    var b = new Button();
                    if (allInline) b.text = Rich(n.kids).Trim();
                    else foreach (var k in BuildAll(n.kids, act)) b.Add(k);
                    b.enableRichText = true;
                    if (n.Has("disabled")) b.SetEnabled(false);
                    b.clicked += () => act?.Invoke(n, b);
                    e = b;
                    break;
                }
                case "input":
                {
                    string type = n.Attr("type") ?? "text";
                    if (type == "range")
                    {
                        int lo = int.Parse(n.Attr("min") ?? "0"), hi = int.Parse(n.Attr("max") ?? "100"), v = (int)Math.Round(double.Parse(n.Attr("value") ?? "0", CultureInfo.InvariantCulture));
                        var s = new SliderInt(lo, hi) { value = v };
                        s.RegisterValueChangedCallback(ev => { n.attr["value"] = ev.newValue.ToString(); act?.Invoke(n, s); });
                        e = s;
                    }
                    else
                    {
                        var t = new TextField { value = n.Attr("value") ?? "", maxLength = int.TryParse(n.Attr("maxlength"), out int ml) ? ml : -1 };
                        e = t;
                    }
                    break;
                }
                case "select":
                {
                    var choices = new List<string>(); var values = new List<string>(); int sel = 0;
                    foreach (var k in n.kids) if (k.tag == "option") { if (k.Has("selected")) sel = choices.Count; choices.Add(Rich(k.kids)); values.Add(k.Attr("value") ?? ""); }
                    var d = new DropdownField(choices, sel);
                    d.userData = values;
                    if (n.Has("disabled")) d.SetEnabled(false);
                    e = d;
                    break;
                }
                default:
                    if (n.kids.Count == 0 && TEXTY.Contains(n.tag)) { e = new Label(""); break; }
                    e = allInline && n.kids.Count > 0 ? new Label(Rich(n.kids).Trim()) { enableRichText = true } : new VisualElement();
                    if (!(allInline && n.kids.Count > 0)) foreach (var k in BuildAll(n.kids, act)) e.Add(k);
                    break;
            }
            e.AddToClassList("t-" + n.tag);
            var cls = n.Attr("class");
            if (cls != null) foreach (var c in cls.Split(' ')) if (c.Length > 0) e.AddToClassList(c);
            if (n.Attr("aria-pressed") == "true") e.AddToClassList("pressed");
            if (n.Has("hidden")) e.style.display = DisplayStyle.None;
            var id = n.Attr("id");
            if (id != null) e.name = id;
            var title = n.Attr("title");
            if (title != null) e.tooltip = title;
            e.userData ??= n;
            var st = n.Attr("style");
            if (st != null) ApplyStyle(e, st);
            return e;
        }

        /// <summary>The few inline styles the HUD writes: swatch colours, bar widths and scales.</summary>
        public static void ApplyStyle(VisualElement e, string css)
        {
            foreach (var part in css.Split(';'))
            {
                int c = part.IndexOf(':');
                if (c < 0) continue;
                string k = part.Substring(0, c).Trim(), v = part.Substring(c + 1).Trim();
                if (k == "--sw" && TryColor(v, out var col)) e.style.backgroundColor = col;
                else if (k == "width" && v.EndsWith("%")) e.style.width = Length.Percent(F(v.TrimEnd('%')));
                else if (k == "transform")
                {
                    if (v.StartsWith("scaleX(")) e.style.scale = new Scale(new Vector3(F(Inside(v)), 1, 1));
                    else if (v.StartsWith("scaleY(")) { float s = F(Inside(v)); e.style.scale = new Scale(new Vector3(1, Mathf.Abs(s), 1)); if (s < 0) e.AddToClassList("neg"); }
                }
            }
        }

        static string Inside(string v) { int a = v.IndexOf('('), b = v.IndexOf(')'); return a >= 0 && b > a ? v.Substring(a + 1, b - a - 1) : "0"; }
        static float F(string s) => float.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var f) ? f : 0;

        /// <summary>CSS colours the game writes: #rgb, #rrggbb, and the zone tokens.</summary>
        public static bool TryColor(string v, out Color c)
        {
            v = v.Trim();
            if (v.StartsWith("var(")) v = v == "var(--color-zone-r)" ? "#54c57a" : v == "var(--color-zone-c)" ? "#2f8adc" : v == "var(--color-zone-i)" ? "#e3ad4b" : "#888888";
            return ColorUtility.TryParseHtmlString(v, out c);
        }

        /// <summary>The first element (depth first) with this class.</summary>
        public static VisualElement Q(VisualElement root, string cls) => root.Q(className: cls);
    }
}
