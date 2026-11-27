using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NaeDosi.Render;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi.Ui
{
    /// <summary>
    /// The game's screen and controls: top bar, goal, dock, sheets, start screen, and every tool on the map
    /// (port of main.ts). The HUD's markup comes from Hud (ui/hud.ts) through Html.
    /// </summary>
    public sealed class CityUi : MonoBehaviour
    {
        public static CityUi I;
        CityGame G => CityGame.I;
        Sim sim => G.sim;
        UIDocument doc;
        VisualElement root;
        VisualElement top, goalBox, toasts, tipEl, info, panelEl, dock, draftEl, toolsEl, catsEl, start, slots, visit, visitBar;
        Label tipLabel;
        public bool running;
        public double speed = 0;
        double lastSpeed = 1;
        string tool = "select";
        string cat;
        string panel;
        int? confirmLine;
        string panelStamp = "";
        (int x, int y)? infoCell;
        public (string kind, List<int> stops, string bus)? draft;
        string roadMode = "grid";
        static readonly (string id, string name, string hint)[] ROAD_MODES = { ("grid", "직각", "가로세로"), ("diag", "대각선", "45도"), ("free", "자유 직선", "아무 각도"), ("curve", "곡선", "꺾는 점") };
        class Bend { public int a, b; public double hx, hz; public bool active; }
        Bend bend;
        readonly List<string> undoStack = new List<string>();
        const int UNDO_MAX = 10;
        public PreviewView preview;
        string mapChoice = "random";
        string mode = "real";
        Korea.Draw kdraw;
        string picked;
        bool nameTouched;
        readonly Dictionary<string, Texture2D> previews = new Dictionary<string, Texture2D>();
        public (World home, bool homeRunning)? visiting;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot() { if (FindAnyObjectByType<CityUi>() == null) new GameObject("Ui").AddComponent<CityUi>(); }

        void Start()
        {
            I = this;
            preview = new PreviewView(Shader.Find("NaeDosi/Ghost"));
            var ps = panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
            ps.themeStyleSheet = Resources.Load<ThemeStyleSheet>("UI/Runtime");
            // CSS pixels: 96 dpi, so the browser's zoom and a phone's pixel ratio size it like the web page.
            ps.scaleMode = PanelScaleMode.ConstantPhysicalSize;
            ps.referenceDpi = 96; ps.fallbackDpi = 96;
            ps.sortingOrder = 10;
            doc = gameObject.AddComponent<UIDocument>();
            doc.panelSettings = ps;
            root = doc.rootVisualElement;
            var uss = Resources.Load<StyleSheet>("UI/city");
            if (uss != null) root.styleSheets.Add(uss);
            root.pickingMode = PickingMode.Ignore;
            BuildLayout();
            G.speed = 0;
            RenderCats();
            RenderMapChips();
            kdraw = Korea.Saved();
            RenderDraw();
            root.Q<TextField>("nameInput")?.RegisterValueChangedCallback(_ => nameTouched = true);
            ShowStart(true);
            FocusStart();
        }

        // ---------------------------------------------------------------- layout

        const string LAYOUT = @"
<div id='screen' class='screen'>
<header id='top' class='bar'>
  <button id='menuBtn' class='btn icon' data-act='menu'><div class='burger'><i></i><i></i><i></i></div></button>
  <div class='city'><div id='cityName' class='name'>새솔시</div><div id='date' class='date'>2026년 3월 1일</div></div>
  <div class='stats'>
    <div class='stat'><dt>인구</dt><dd id='pop' class='num'>0</dd><div id='tier' class='tier'><div class='tier-bar'><i id='tierBar'></i></div><span id='tierText' class='tier-text'></span></div></div>
    <div class='stat'><dt>자금</dt><dd id='money' class='num'>0</dd></div>
    <div class='stat'><dt>행복</dt><dd id='happy' class='num'>없음</dd></div>
  </div>
  <div class='rci'>
    <div class='rci-col'><div class='rci-bar' id='barR'><i class='rci-fill' id='dR'></i><i class='mid'></i></div><span>주</span></div>
    <div class='rci-col'><div class='rci-bar' id='barC'><i class='rci-fill' id='dC'></i><i class='mid'></i></div><span>상</span></div>
    <div class='rci-col'><div class='rci-bar' id='barI'><i class='rci-fill' id='dI'></i><i class='mid'></i></div><span>산</span></div>
  </div>
  <div class='speed' id='speed'>
    <button data-speed='0'>멈춤</button><button data-speed='1' aria-pressed='true'>1배</button><button data-speed='2'>2배</button><button data-speed='4'>4배</button>
  </div>
  <button id='bellBtn' class='music-btn bell' data-act='bell'><span class='bell-glyph'>!</span><b id='bellCount' class='bell-count' hidden>0</b></button>
  <button id='musicBtn' class='music-btn' data-act='music'>♪</button>
</header>
<aside id='goal' class='card'>
  <div class='goal-head'><span class='tag'>목표</span><span id='goalStep'></span><button id='goalFold' class='btn small ghost' data-act='fold'>접기</button></div>
  <p id='goalText' class='goal-text'></p>
  <div class='goal-bar'><i id='goalBar'></i></div>
</aside>
<div id='toasts'></div>
<section id='info' class='card sheet' hidden></section>
<section id='panel' class='card sheet wide' hidden></section>
<nav id='dock'>
  <div id='draft' class='draft card' hidden></div>
  <div id='tools' class='tools' hidden></div>
  <div id='cats' class='cats'></div>
</nav>
<div id='visitBar' class='visit-bar' hidden><span id='visitText'></span><button class='btn small primary' data-act='visitHome'>돌아가기</button></div>
<div id='tip' class='tip'></div>
<div id='slots' class='overlay' hidden></div>
<div id='visit' class='overlay' hidden></div>
<div id='start' class='overlay'>
  <div class='card hero'>
    <h1>내 도시 더 크게</h1>
    <p class='lead'>대한민국 어느 시·군의 실제 땅 2.56km 사방에 우리 도시를 세워 보세요. 도로를 깔고 구역을 나누고 전기와 물을 대면 사람들이 이사 와요.</p>
    <div class='field'><span>도시 이름</span><input id='nameInput' maxlength='10' value='새솔시' /></div>
    <div class='field'><span>땅</span>
      <div id='mapMode' class='chips'><button data-mode='real' aria-pressed='true'>대한민국 실제 지도</button><button data-mode='fake'>가상 지형</button></div>
      <div id='realBox' class='draw'></div>
      <div id='fakeBox' hidden><div id='mapChips' class='chips'></div><p id='mapDesc' class='map-desc'></p></div>
    </div>
    <div class='row'><button id='newBtn' class='btn primary' data-act='newCity'>새 도시 시작</button><button id='loadBtn' class='btn' data-act='slots' hidden>불러오기</button><button id='visitBtn' class='btn' data-act='visit'>친구 도시 구경</button></div>
    <dl class='howto'>
      <div><dt>PC</dt><dd>좌클릭으로 건설, 우클릭 드래그로 회전, 휠로 확대, WASD로 이동</dd></div>
      <div><dt>모바일</dt><dd>한 손가락으로 건설(선택 중일 땐 이동), 두 손가락으로 이동·확대·회전, 함께 위아래로 밀면 기울이기</dd></div>
    </dl>
    <p class='map-desc credit'>지도 데이터: 행정구역 통계청(southkorea-maps), 토지피복 © ESA WorldCover 2021 (CC BY 4.0), 고도 AWS Terrain Tiles (Mapzen, SRTM 등)</p>
  </div>
</div>
</div>";

        VisualElement E(string id) => root.Q(id);

        // ---------------------------------------------------------------- phone layout

        PanelSettings panelSettings;
        bool layoutCompact, layoutPortrait, layoutKnown;
        ScrollView toolsScroll, catsScroll;
        float safeNext;

        /// <summary>
        /// Phones (short side under ~560 CSS px) get a tighter layout: everything a little smaller, the tool and category rows in
        /// one line each that slides sideways, the top bar wrapping onto two lines when upright, and windows kept to one side
        /// so the city stays in view. The goal card always sits just under the top bar, however tall it has become.
        /// </summary>
        void Responsive()
        {
            float dpi = Screen.dpi > 0 ? Screen.dpi : 96;
            float w = Screen.width * 96f / dpi, h = Screen.height * 96f / dpi;
            bool compact = Mathf.Min(w, h) < 560, portrait = h > w * 1.05f;
            if (!layoutKnown || compact != layoutCompact || portrait != layoutPortrait)
            {
                layoutKnown = true; layoutCompact = compact; layoutPortrait = portrait;
                root.EnableInClassList("compact", compact);
                root.EnableInClassList("portrait", compact && portrait);
                root.EnableInClassList("landscape", compact && !portrait);
                if (panelSettings != null) panelSettings.scale = compact ? 0.9f : 1f;
                Slide(ref toolsScroll, E("tools"), compact);
                Slide(ref catsScroll, E("cats"), compact);
            }
            // Keep the HUD clear of the notch or Dynamic Island, rounded corners and the home bar (checked twice a second: it turns with the phone).
            if (Time.unscaledTime >= safeNext)
            {
                safeNext = Time.unscaledTime + 0.5f;
                float k = compact ? 0.9f : 1f;
                var sc = E("screen");
                if (sc != null)
                {
                    // On phones the dock's paper runs under the home bar instead of leaving a strip of map below it.
                    sc.style.top = SafeArea.Top / k; sc.style.bottom = compact ? 0 : SafeArea.Bottom / k;
                    var dk = E("dock");
                    if (dk != null) dk.style.paddingBottom = compact ? SafeArea.Bottom / k + 4 : new StyleLength(StyleKeyword.Null);
                    sc.style.left = SafeArea.Left / k; sc.style.right = SafeArea.Right / k;
                }
            }
            // Windows open just above the dock, however tall it is.
            var dock = E("dock");
            foreach (var id in new[] { "panel", "info" })
            {
                var sh = E(id);
                if (sh == null) continue;
                if (compact && dock != null && dock.layout.height > 0) sh.style.bottom = dock.layout.height + 6;
                else sh.style.bottom = new StyleLength(StyleKeyword.Null);
            }
            var top = E("top"); var goal = E("goal");
            if (top != null && goal != null && top.layout.height > 0) goal.style.top = top.layout.yMax + 8;
        }

        /// <summary>Puts a row into a sideways-scrolling strip on phones, and back into the dock on bigger screens.</summary>
        void Slide(ref ScrollView sv, VisualElement row, bool on)
        {
            if (row == null) return;
            var dock = E("dock");
            if (sv == null)
            {
                sv = new ScrollView(ScrollViewMode.Horizontal) { horizontalScrollerVisibility = ScrollerVisibility.Hidden, verticalScrollerVisibility = ScrollerVisibility.Hidden };
                sv.AddToClassList("slide");
                sv.touchScrollBehavior = ScrollView.TouchScrollBehavior.Clamped;
            }
            if (on && row.parent != sv.contentContainer)
            {
                int ix = dock.IndexOf(row);
                dock.Insert(ix, sv);
                sv.Add(row);
            }
            else if (!on && row.parent == sv.contentContainer)
            {
                int ix = dock.IndexOf(sv);
                dock.Insert(ix, row);
                sv.RemoveFromHierarchy();
            }
        }
        Label L(string id) => root.Q<Label>(id);

        void BuildLayout()
        {
            Html.Fill(root, LAYOUT, OnAct);
            var screen = E("screen"); screen.pickingMode = PickingMode.Ignore;
            top = E("top"); goalBox = E("goal"); toasts = E("toasts"); info = E("info"); panelEl = E("panel");
            dock = E("dock"); draftEl = E("draft"); toolsEl = E("tools"); catsEl = E("cats"); start = E("start"); slots = E("slots"); visit = E("visit"); visitBar = E("visitBar");
            tipEl = E("tip");
            tipLabel = new Label(); tipEl.Add(tipLabel);
            foreach (var e in new[] { dock, toasts, tipEl, tipLabel }) e.pickingMode = PickingMode.Ignore;
            tipEl.style.display = DisplayStyle.None;
            // Sheets scroll when long.
            foreach (var s in new[] { info, panelEl }) s.style.overflow = Overflow.Hidden;
        }

        static void Show(VisualElement e, bool on) { if (e != null) e.style.display = on ? DisplayStyle.Flex : DisplayStyle.None; }
        static bool Shown(VisualElement e) => e != null && e.resolvedStyle.display != DisplayStyle.None && e.style.display != DisplayStyle.None;

        /// <summary>Fill a sheet; long sheets scroll.</summary>
        void FillSheet(VisualElement sheet, string html)
        {
            sheet.Clear();
            var sv = new ScrollView(ScrollViewMode.Vertical);
            sv.AddToClassList("sheet-scroll");
            sv.horizontalScrollerVisibility = ScrollerVisibility.Hidden;
            sheet.Add(sv);
            foreach (var e in Html.Parse(html).Count > 0 ? BuildInto(html) : new List<VisualElement>()) sv.Add(e);
        }
        List<VisualElement> BuildInto(string html) { var tmp = new VisualElement(); Html.Fill(tmp, html, OnAct); return tmp.Children().ToList(); }

        // ---------------------------------------------------------------- dock

        void RenderCats()
        {
            var w = sim.w;
            string h = string.Concat(ToolDefs.CATEGORIES.Select(c => $"<button class=\"cat\" data-cat=\"{c.id}\" aria-pressed=\"{(c.id == cat ? "true" : "false")}\">{c.name}</button>"))
                + $"<span class=\"cats-rule\"></span><button class=\"cat\" data-undo {(undoStack.Count > 0 ? "" : "disabled")}>되돌리기</button><button class=\"cat\" data-panel=\"stats\" aria-pressed=\"{(panel == "stats" ? "true" : "false")}\">현황</button><button class=\"cat\" data-panel=\"budget\" aria-pressed=\"{(panel == "budget" ? "true" : "false")}\">예산</button>";
            Html.Fill(catsEl, h, OnAct);
            var c0 = ToolDefs.CATEGORIES.FirstOrDefault(k => k.id == cat);
            Show(toolsEl, c0 != null && !(c0.tools.Length < 2 && c0.id != "transit"));
            if (c0 != null)
            {
                string t = string.Concat(c0.tools.Select(x => $"<button class=\"tool\" data-tool=\"{x.id}\" aria-pressed=\"{(x.id == tool ? "true" : "false")}\">{(x.swatch != null ? $"<span class=\"sw\" style=\"--sw:{x.swatch}\"></span>" : "")}<div class=\"col\"><span class=\"n\">{x.name}</span>{(x.price != "" ? $"<span class=\"p\">{x.price}</span>" : "")}</div></button>"));
                if (c0.id == "road") t += $"<span class=\"cats-rule\"></span><button class=\"tool\" data-policy=\"noAvenueParking\" aria-pressed=\"{(w.noAvenueParking ? "true" : "false")}\"><div class=\"col\"><span class=\"n\">대로 주정차 금지</span><span class=\"p\">{(w.noAvenueParking ? "시행 중" : "안 함")}</span></div></button>";
                if (c0.id == "road" && ToolDefs.TOOLS.TryGetValue(tool, out var td) && td.road >= 0)
                    t += "<span class=\"cats-rule\"></span>" + string.Concat(ROAD_MODES.Select(m => $"<button class=\"tool\" data-roadmode=\"{m.id}\" aria-pressed=\"{(roadMode == m.id ? "true" : "false")}\"><div class=\"col\"><span class=\"n\">{m.name}</span><span class=\"p\">{m.hint}</span></div></button>"));
                if (c0.id == "transit")
                    t += $"<span class=\"cats-rule\"></span><button class=\"tool\" data-policy=\"transferDiscount\" aria-pressed=\"{(w.transferDiscount ? "true" : "false")}\"><div class=\"col\"><span class=\"n\">환승 할인</span><span class=\"p\">{(w.transferDiscount ? "시행 중" : "안 함")}</span></div></button>"
                       + $"<button class=\"tool\" data-panel=\"lines\" aria-pressed=\"{(panel == "lines" ? "true" : "false")}\"><div class=\"col\"><span class=\"n\">노선 관리</span><span class=\"p\">{w.lines.Count}개 운행 중</span></div></button>";
                Html.Fill(toolsEl, t, OnAct);
            }
            RenderDraft();
        }

        string draftHtmlShown = "";
        void RenderDraft()
        {
            Show(draftEl, draft != null);
            string html = draft != null ? Hud.draftHtml(sim.w, draft.Value.kind, draft.Value.stops, draft.Value.bus) : "";
            if (html != "" && html != draftHtmlShown) { Html.Fill(draftEl, html, OnAct); draftHtmlShown = html; }
            G.transitDraft = draft != null;
        }

        void FinishDraft()
        {
            if (draft == null) return;
            var d = draft.Value;
            var err = Transit.createLine(sim.w, d.kind, d.stops, d.bus ?? "branch");
            if (err != null) { Toast(err, "warn"); return; }
            draft = (d.kind, new List<int>(), d.bus);
            RenderCats();
        }

        void SetTool(string t)
        {
            if (visiting != null && t != "select") { Toast("구경 중에는 지을 수 없어요. 돌아가기를 누르면 내 도시로 가요.", "info"); t = "select"; }
            tool = t;
            drag = null; bend = null;
            preview.Clear(); HideTip();
            ToolDefs.TOOLS.TryGetValue(t, out var def);
            draft = def?.line != null ? (def.line, draft != null && draft.Value.kind == def.line ? draft.Value.stops : new List<int>(), def.bus) : ((string, List<int>, string)?)null;
            G.ground.showZoneable = def != null && def.zone > 0;
            string k = def?.kind;
            G.ground.showSites = k == "riverpark" || k == "tower" || k == "trailhead" || k == "terminal" || (k == "water" && Tools.hasOpenWater(sim.w)) ? k : null;
            G.ForceRepaint();
            if (t != "select") CloseInfo();
            RenderCats();
        }

        void SetRoadMode(string m) { roadMode = m; bend = null; preview.Clear(); RenderCats(); Preview(); }

        void SelectCategory(string id)
        {
            var c = ToolDefs.CATEGORIES.FirstOrDefault(k => k.id == id);
            if (c == null) return;
            if (cat == c.id) { cat = null; SetTool("select"); return; }
            cat = c.id;
            SetTool(c.tools[0].id);
        }

        public void SetSpeed(double s)
        {
            speed = s;
            G.speed = running ? s : 0;
            foreach (var b in root.Q("speed").Children())
            {
                var n = b.userData as Html.Node;
                b.EnableInClassList("pressed", n != null && double.Parse(n.Attr("data-speed"), CultureInfo.InvariantCulture) == s);
            }
        }

        // ---------------------------------------------------------------- undo

        string ChangeSig() { var w = sim.w; return $"{w.ver.roads},{w.ver.zones},{w.ver.buildings},{w.ver.transit}:{w.money}:{w.buildings.Count}:{w.lines.Count}:{w.roundabouts.Count}:{w.noAvenueParking}:{w.transferDiscount}"; }

        void Undoable(Action fn)
        {
            if (visiting != null) { Toast("구경 중에는 지을 수 없어요. 돌아가기를 누르면 내 도시로 가요.", "info"); return; }
            string before = ChangeSig(), snap = Save.serialize(sim.w);
            fn();
            if (ChangeSig() != before) { undoStack.Add(snap); if (undoStack.Count > UNDO_MAX) undoStack.RemoveAt(0); RenderCats(); Sfx.Play(SoundOfTool()); }
        }

        string SoundOfTool()
        {
            if (!ToolDefs.TOOLS.TryGetValue(tool, out var d)) return "build";
            if (tool == "bulldoze" || d.zone == Zone.None) return "demolish";
            if (d.road >= 0 || d.level > 0 || d.roundabout || d.widen || d.oneway || d.hwyPart != null) return "road";
            if (d.zone > 0 || d.trees) return "zone";
            return "build";
        }

        void UndoLast()
        {
            if (undoStack.Count == 0) { Toast("되돌릴 공사가 없어요."); return; }
            var snap = undoStack[undoStack.Count - 1]; undoStack.RemoveAt(undoStack.Count - 1);
            G.SetWorld(Save.deserialize(snap), keepCamera: true);
            CloseInfo();
            draft = null; bend = null; preview.Clear();
            Toast("방금 한 공사를 되돌렸어요.");
            Sfx.Play("undo");
            RenderCats();
        }

        // ---------------------------------------------------------------- panels

        void OpenPanel(string k)
        {
            if (panel == k) { ClosePanel(); return; }
            panel = k; confirmLine = null;
            CloseInfo();
            Show(panelEl, true);
            RenderPanel(true);
            RenderCats();
        }
        void ClosePanel() { var was = panel; panel = null; Show(panelEl, false); if (was != null) RenderCats(); }

        void RenderPanel(bool force = false)
        {
            if (panel == null) return;
            var w = sim.w;
            string stamp = panel == "budget" ? $"{w.reports.Count}:{w.taxR}{w.taxC}{w.taxI}:{w.loans.Count}" : panel == "stats" ? $"{w.day}:{G.overlay}" : panel == "lines" ? $"{w.ver.transit}:{w.reports.Count}:{confirmLine}" : panel == "notices" ? $"{w.notices.Count}:{(w.notices.Count > 0 ? w.notices[0].text : "")}" : panel;
            if (!force && stamp == panelStamp) return;
            panelStamp = stamp;
            FillSheet(panelEl, panel == "budget" ? Hud.budgetHtml(w) : panel == "stats" ? Hud.statsHtml(w, G.overlay) : panel == "menu" ? Hud.menuHtml(w, G.quality, Bgm.On, Bgm.Volume, G.dayLock, Sfx.On, !w.noHazards, G.artStyle, G.tiltShift) : panel == "lines" ? Hud.linesHtml(w, confirmLine) : panel == "notices" ? Hud.noticesHtml(w) : Hud.HELP);
        }

        void OpenInfo(int x, int y) { infoCell = (x, y); ClosePanel(); Show(info, true); FillSheet(info, Hud.infoHtml(sim.w, x, y)); }
        void CloseInfo() { infoCell = null; Show(info, false); }

        /// <summary>Every button press in the HUD, by its data attributes (the click handlers of main.ts).</summary>
        void OnAct(Html.Node n, VisualElement e)
        {
            var w = sim.w;
            string A(string k) => n.Attr(k);
            if (n.Has("data-tax") && e is SliderInt s)
            {
                string key = A("data-tax");
                if (key == "R") w.taxR = s.value; else if (key == "C") w.taxC = s.value; else w.taxI = s.value;
                if (e.parent?.Q<Label>(className: "t-b") is Label lab) lab.text = $"{s.value}%";
                return;
            }
            Sfx.Play("click");
            if (A("data-speed") != null) { double sp = double.Parse(A("data-speed"), CultureInfo.InvariantCulture); if (sp != 0) lastSpeed = sp; SetSpeed(sp); return; }
            if (n.Has("data-undo")) { UndoLast(); return; }
            if (A("data-cat") != null) { SelectCategory(A("data-cat")); return; }
            if (A("data-tool") != null) { SetTool(A("data-tool")); return; }
            if (A("data-panel") != null) { OpenPanel(A("data-panel")); return; }
            if (A("data-roadmode") != null) { SetRoadMode(A("data-roadmode")); return; }
            if (A("data-policy") == "noAvenueParking")
            {
                Undoable(() => w.noAvenueParking = !w.noAvenueParking);
                Parking.updateParking(w);
                Toast(w.noAvenueParking ? "대로에 차를 세울 수 없어요. 차가 잘 빠지지만 주변 주차난은 늘어요." : "대로 갓길 주차를 다시 허용했어요.");
                RenderCats(); return;
            }
            if (A("data-policy") == "transferDiscount")
            {
                Undoable(() => w.transferDiscount = !w.transferDiscount);
                Toast(w.transferDiscount ? "갈아타도 요금을 한 번만 내요. 환승하는 승객이 크게 늘지만 요금 수입은 줄어요." : "갈아탈 때마다 요금을 따로 받아요. 수입은 늘지만 갈아타는 사람이 줄어요.");
                RenderCats(); return;
            }
            if (A("data-draft") != null && draft != null)
            {
                string d = A("data-draft");
                if (d == "undo" && draft.Value.stops.Count > 0) draft.Value.stops.RemoveAt(draft.Value.stops.Count - 1);
                if (d == "cancel") { cat = null; SetTool("select"); return; }
                if (d == "done") Undoable(FinishDraft);
                if (d.StartsWith("up:"))
                {
                    string bus = d.Substring(3);
                    var id = ToolDefs.TOOLS.Values.FirstOrDefault(t => t.line == "bus" && t.bus == bus)?.id;
                    if (id != null) { SetTool(id); Toast($"{Transit.BUS_TYPES[bus].name}로 업그레이드했어요. 정류장은 그대로예요. 노선 완성을 누르면 개통해요.", "good"); }
                    return;
                }
                draftHtmlShown = ""; RenderDraft(); return;
            }
            if (n.Has("data-close")) { if (IsIn(e, info)) CloseInfo(); else ClosePanel(); return; }
            if (A("data-demolish") != null)
            {
                int id = int.Parse(A("data-demolish"));
                Undoable(() => { if (w.buildings.TryGetValue(id, out var b)) Tools.bulldoze(w, new List<int> { idx(b.x, b.y) }); });
                CloseInfo(); return;
            }
            if (A("data-ov") != null) { G.SetOverlay(A("data-ov")); RenderPanel(true); return; }
            if (A("data-remove-line") != null)
            {
                int id = int.Parse(A("data-remove-line"));
                if (n.Has("data-confirmed")) { Undoable(() => Transit.removeLine(w, id)); confirmLine = null; } else confirmLine = id;
                RenderPanel(true); RenderCats(); return;
            }
            if (A("data-notice") != null) { var nt = w.notices[int.Parse(A("data-notice"))]; if (nt.at >= 0) GoTo(nt.at, nt.overlay); return; }
            if (A("data-taxstep") != null)
            {
                var p = A("data-taxstep").Split(':'); double dd = double.Parse(p[1], CultureInfo.InvariantCulture);
                if (p[0] == "R") w.taxR = Math.Max(0, Math.Min(20, w.taxR + dd)); else if (p[0] == "C") w.taxC = Math.Max(0, Math.Min(20, w.taxC + dd)); else w.taxI = Math.Max(0, Math.Min(20, w.taxI + dd));
                RenderPanel(true); return;
            }
            if (A("data-taxpreset") != null) { double v = double.Parse(A("data-taxpreset"), CultureInfo.InvariantCulture); w.taxR = w.taxC = w.taxI = v; RenderPanel(true); Toast($"세율을 모두 {v}%로 맞췄어요.", "good"); return; }
            if (A("data-loan") != null) { double a = double.Parse(A("data-loan"), CultureInfo.InvariantCulture); var err = Economy.takeLoan(w, a); Toast(err ?? $"{a / 10000}억 원을 빌렸어요. 다음 달부터 나눠 갚아요.", err != null ? "warn" : "good"); RenderPanel(true); return; }
            if (A("data-repay") != null) { var err = Economy.repayLoan(w, int.Parse(A("data-repay"))); Toast(err ?? "대출을 다 갚았어요.", err != null ? "warn" : "good"); RenderPanel(true); return; }
            if (A("data-map") != null) { mapChoice = A("data-map"); RenderMapChips(); return; }
            if (A("data-mode") != null)
            {
                mode = A("data-mode");
                foreach (var b in E("mapMode").Children()) b.EnableInClassList("pressed", (b.userData as Html.Node)?.Attr("data-mode") == mode);
                Show(E("realBox"), mode == "real"); Show(E("fakeBox"), mode == "fake");
                return;
            }
            if (A("data-draw") == "go" && kdraw == null)
            {
                var sel = E("realBox").Q<DropdownField>();
                string ex = sel != null && sel.index > 0 ? ((List<string>)sel.userData)[sel.index] : "";
                kdraw = new Korea.Draw { exclude = ex, picks = Korea.DrawTiles(ex) }; picked = null;
                Korea.Store(kdraw); RenderDraw(); return;
            }
            if (A("data-draw") == "again" && kdraw != null && !kdraw.rerolled)
            {
                kdraw = new Korea.Draw { exclude = kdraw.exclude, picks = Korea.DrawTiles(kdraw.exclude, kdraw.picks), rerolled = true }; picked = null;
                Korea.Store(kdraw); RenderDraw(); return;
            }
            if (A("data-pick") != null)
            {
                picked = A("data-pick");
                var t = Korea.Tiles.FirstOrDefault(x => x.id == picked);
                if (t != null && !nameTouched) { var tf = root.Q<TextField>("nameInput"); if (tf != null) { tf.SetValueWithoutNotify(t.name.Length > 10 ? t.name.Substring(0, 10) : t.name); } }
                RenderDraw(); return;
            }
            if (A("data-open") != null) { var lw = Slots.Load(A("data-open")); if (lw != null) { UseWorld(lw); Show(slots, false); Begin(); Toast($"{lw.name}을(를) 불러왔어요.", "good"); } else Toast("이 저장은 열 수 없어요.", "warn"); return; }
            if (A("data-del") != null)
            {
                if (!n.Has("data-sure")) { n.attr["data-sure"] = ""; if (e is Button b) b.text = "정말 지우기"; return; }
                Slots.Delete(A("data-del")); OpenSlots(); Show(E("loadBtn"), Slots.List().Count > 0); return;
            }
            if (n.Has("data-close-slots")) { Show(slots, false); return; }
            if (A("data-visit") != null) { VisitAct(A("data-visit"), e); return; }
            switch (A("data-act"))
            {
                case "menu": OpenPanel("menu"); break;
                case "bell": OpenPanel("notices"); unread = 0; ShowBell(); break;
                case "music": SetMusic(!Bgm.On); break;
                case "fold":
                {
                    bool fold = !goalBox.ClassListContains("fold");
                    goalBox.EnableInClassList("fold", fold);
                    if (e is Button fb) fb.text = fold ? "펼치기" : "접기";
                    break;
                }
                case "visit": ClosePanel(); OpenVisit(); break;
                case "save":
                    if (visiting != null) Toast("구경 중인 도시는 저장하지 않아요.");
                    else { bool ok = Slots.Save(w); Toast(ok ? $"{w.name}을(를) 저장했어요. 불러오기에서 다른 도시와 골라 열 수 있어요." : "저장하지 못했어요.", ok ? "good" : "warn"); }
                    break;
                case "slots": ClosePanel(); OpenSlots(); break;
                case "new": ClosePanel(); running = false; SetSpeed(0); ShowStart(true); break;
                case "help": OpenPanel("help"); break;
                case "music2": break;
                case "sfx": Sfx.On = !Sfx.On; PlayerPrefs.SetString("city.sfx", Sfx.On ? "on" : "off"); RenderPanel(true); break;
                case "vol-": case "vol+":
                    Bgm.SetVolume(Mathf.Round((Bgm.Volume + (A("data-act") == "vol+" ? 0.1f : -0.1f)) * 10) / 10f);
                    PlayerPrefs.SetFloat("city.volume", Bgm.Volume); RenderPanel(true); break;
                case "hazards": w.noHazards = !w.noHazards; if (w.noHazards) w.cold = null; RenderPanel(true); break;
                case "daylock": G.dayLock = !G.dayLock; PlayerPrefs.SetInt("city.daylock", G.dayLock ? 1 : 0); RenderPanel(true); break;
                case "quality": G.SetQuality(!G.quality); PlayerPrefs.SetInt("city.quality", G.quality ? 1 : 0); RenderPanel(true); break;
                case "newCity": NewCity(); break;
                case "style": G.artStyle = (G.artStyle + 1) % 3; PlayerPrefs.SetInt("city.style", G.artStyle); RenderPanel(true); break;
                case "tilt": G.tiltShift = !G.tiltShift; PlayerPrefs.SetInt("city.tilt", G.tiltShift ? 1 : 0); RenderPanel(true); break;
                case "visitHome": LeaveVisit(); break;
            }
            if (A("data-act") == "music" && panel == "menu") RenderPanel(true);
        }

        static bool IsIn(VisualElement e, VisualElement box) { for (var p = e; p != null; p = p.parent) if (p == box) return true; return false; }

        // ---------------------------------------------------------------- toasts, bell, tip

        int unread;
        Notice lastTop;
        public void ResetToasts(World w) { lastTop = w.notices.Count > 0 ? w.notices[0] : null; }
        void PumpToasts(World w)
        {
            int fresh = 0; bool warn = false;
            foreach (var n in w.notices) { if (n == lastTop) break; fresh++; if (n.tone == "warn") warn = true; }
            if (fresh == 0) return;
            lastTop = w.notices[0];
            unread = Math.Min(99, unread + fresh);
            ShowBell();
            if (warn) Sfx.Play("warn");
        }
        void ShowBell()
        {
            var el = L("bellCount");
            if (el == null) return;
            el.text = unread > 0 ? unread.ToString() : "";
            Show(el, unread > 0);
        }

        /// <summary>A toast; with a place, it carries a button that takes the camera there.</summary>
        public void Toast(string text, string tone = "info", int at = -1, string overlay = null)
        {
            if (tone != "info") Sfx.Play(tone);
            var el = new VisualElement(); el.AddToClassList("toast"); el.AddToClassList(tone);
            var dot = new VisualElement(); dot.AddToClassList("toast-dot"); el.Add(dot);
            var l = new Label(text); el.Add(l);
            if (at >= 0)
            {
                var go = new Button(() => { GoTo(at, overlay); el.RemoveFromHierarchy(); }) { text = "어디인지 보기" };
                go.AddToClassList("btn"); go.AddToClassList("small");
                el.Add(go);
            }
            el.pickingMode = PickingMode.Ignore;
            toasts.Insert(0, el);
            float life = tone == "warn" ? 3.5f : 2.6f;
            el.schedule.Execute(() => { el.AddToClassList("out"); el.schedule.Execute(() => el.RemoveFromHierarchy()).StartingIn(450); }).StartingIn((long)(life * 1000));
            while (toasts.childCount > 2) toasts.RemoveAt(toasts.childCount - 1);
        }

        string demolishNote = "";
        void ShowTip(Vector2 screen, string text, bool err = false)
        {
            var p = RuntimePanelUtils.ScreenToPanel(root.panel, new Vector2(screen.x, Screen.height - screen.y));
            tipEl.style.display = DisplayStyle.Flex;
            tipEl.style.left = p.x + 14; tipEl.style.top = p.y + 14;
            tipLabel.text = demolishNote != "" && !err ? $"{text}\n{demolishNote}" : text;
            tipEl.EnableInClassList("err", err);
            tipEl.EnableInClassList("warn", !err && demolishNote != "");
        }
        void HideTip() { if (tipEl != null) tipEl.style.display = DisplayStyle.None; }

        // ---------------------------------------------------------------- start, slots, visiting

        void RenderMapChips()
        {
            var opts = new List<(string id, string name, string desc)> { ("random", "무작위", "어떤 땅이 나올지 몰라요. 매번 지형이 달라져요") };
            opts.AddRange(Maps.MAPS);
            Html.Fill(E("mapChips"), string.Concat(opts.Select(m => $"<button data-map=\"{m.id}\" aria-pressed=\"{(m.id == mapChoice ? "true" : "false")}\">{m.name}</button>")), OnAct);
            L("mapDesc").text = opts.First(m => m.id == mapChoice).desc;
        }

        void RenderDraw()
        {
            var box = E("realBox");
            if (Korea.Tiles.Count == 0) { Html.Fill(box, "<p class=\"map-desc\">실제 지도 데이터가 없어요. 가상 지형을 골라 주세요.</p>", OnAct); return; }
            string opts = string.Concat(Korea.Provinces.Select(kv => $"<option value=\"{kv.Key}\" {(kdraw?.exclude == kv.Key ? "selected" : "")}>{kv.Value}</option>"));
            string select = $"<div class=\"draw-row\"><span class=\"map-desc\">제외할 지역</span><select {(kdraw != null ? "disabled" : "")}><option value=\"\">제외 안 함</option>{opts}</select></div>";
            if (kdraw == null)
            {
                Html.Fill(box, $"{select}<div class=\"draw-row\"><button class=\"btn\" data-draw=\"go\">지역 추첨</button><span class=\"map-desc\">시·군 세 곳이 나와요. 다시 뽑기는 한 번뿐이에요.</span></div>", OnAct);
                return;
            }
            var infos = kdraw.picks.Select(id => Korea.Tiles.FirstOrDefault(t => t.id == id)).Where(t => t != null).ToList();
            string cards = string.Concat(infos.Select(t => $"<button class=\"draw-card\" data-pick=\"{t.id}\" aria-pressed=\"{(picked == t.id ? "true" : "false")}\"><div class=\"draw-img\"></div><span class=\"n\">{t.name}</span><span class=\"p\">{(Korea.Provinces.TryGetValue(t.prov, out var pv) ? pv : "")}{(t.water ? " · 물가" : "")}</span></button>"));
            Html.Fill(box, $"{select}<div class=\"draw-cards\">{cards}</div><div class=\"draw-row\">{(kdraw.rerolled ? "<span class=\"map-desc\">다시 뽑기를 썼어요. 셋 중에서 골라 주세요.</span>" : "<button class=\"btn\" data-draw=\"again\">다시 뽑기 (1회)</button><span class=\"map-desc\">마음에 드는 곳이 없으면 한 번 더 뽑을 수 있어요.</span>")}</div>", OnAct);
            var imgs = box.Query(className: "draw-img").ToList();
            for (int k = 0; k < imgs.Count && k < infos.Count; k++)
            {
                if (!previews.TryGetValue(infos[k].id, out var tex)) { try { tex = Korea.Preview(infos[k]); } catch { tex = null; } previews[infos[k].id] = tex; }
                if (tex != null) imgs[k].style.backgroundImage = new StyleBackground(tex);
            }
        }

        void ShowStart(bool on)
        {
            Show(start, on);
            Show(E("loadBtn"), Slots.List().Count > 0);
        }

        void NewCity()
        {
            string name = (root.Q<TextField>("nameInput")?.value ?? "").Trim();
            if (name == "") name = "새솔시";
            if (name.Length > 10) name = name.Substring(0, 10);
            double seed = Math.Floor(UnityEngine.Random.value * 1e9);
            if (mode == "real")
            {
                var info = Korea.Tiles.FirstOrDefault(t => t.id == picked);
                if (info == null) { Toast(kdraw != null ? "세 곳 중 한 곳을 골라 주세요." : "먼저 지역 추첨을 해 주세요.", "warn"); return; }
                var real = Korea.LoadTile(info);
                UseWorld(createRealWorld(seed, name, real));
                kdraw = null; picked = null; Korea.Store(null); RenderDraw();
                Begin();
                Toast($"{real.prov} {real.name}의 실제 땅이에요. {name}에 오신 걸 환영해요, 시장님!", "good");
                return;
            }
            UseWorld(createWorld(seed, name, mapChoice == "random" ? Maps.randomMap(seed) : mapChoice));
            Begin();
            Toast($"{name}에 오신 걸 환영해요, 시장님! 왼쪽 위 목표를 따라가 보세요.", "good");
        }

        public void UseWorld(World w)
        {
            undoStack.Clear();
            G.SetWorld(w);
            ResetToasts(w);
            CloseInfo(); ClosePanel();
            FocusStart();
        }

        void FocusStart() { int row = startRowOf(sim.w); G.view.Focus(24 * CELL, row * CELL + 40); }

        public void Begin()
        {
            ShowStart(false);
            running = true;
            SetSpeed(1);
            G.view.Zoom((Screen.width < 640 ? 380 : 260) / G.view.dist);
            saveDay = sim.w.day;
        }

        void GoTo(int at, string overlay)
        {
            if (overlay != null) { G.SetOverlay(overlay); RenderPanel(true); }
            G.view.Focus((at % N) * CELL + CELL / 2.0, (at / N) * CELL + CELL / 2.0);
            G.view.Zoom(220 / G.view.dist);
        }

        void OpenSlots()
        {
            var list = Slots.List();
            string when(long t) => t != 0 ? DateTimeOffset.FromUnixTimeMilliseconds(t).ToLocalTime().ToString("M. d. HH:mm", CultureInfo.InvariantCulture) : "예전 저장";
            string items = list.Count > 0 ? string.Concat(list.Select(x => $"<div class=\"slot\"><div><b>{Hud.esc(x.name)}</b><small>{(x.pop > 0 ? $"인구 {Hud.num(x.pop)} · {x.day / 360 + 1}년차 · " : "")}{when(x.at)}</small></div><button class=\"btn primary small\" data-open=\"{x.id}\">열기</button><button class=\"btn small\" data-del=\"{x.id}\">지우기</button></div>")) : "<p class=\"hint\">저장한 도시가 없어요.</p>";
            Html.Fill(slots, $"<div class=\"card hero slots-card\"><h2>저장한 도시</h2><div class=\"slot-list\">{items}</div><div class=\"row\"><button class=\"btn\" data-close-slots>닫기</button></div></div>", OnAct);
            Show(slots, true);
        }

        void OpenVisit()
        {
            bool mine = running && visiting == null;
            string h = "<div class=\"card hero visit-card\"><h2>도시 구경</h2>"
                + "<section><h3>파일로 주고받기</h3><p class=\"hint\">도시를 파일로 내보내 메신저로 보내고, 받은 파일을 열어 구경해요. 웹판에서 만든 도시 파일도 열려요.</p><div class=\"visit-row\">"
                + (mine ? "<button class=\"btn\" data-visit=\"export\">파일로 내보내기</button>" : "") + "<button class=\"btn\" data-visit=\"open\">파일 열어 구경하기</button></div></section>"
                + Visit.SectionHtml(mine)
                + "<div class=\"row\"><button class=\"btn\" data-visit=\"close\">닫기</button></div></div>";
            Html.Fill(visit, h, OnAct);
            Show(visit, true);
        }

        public void RefreshVisit() { if (Shown(visit)) OpenVisit(); }
        public void CloseVisit() => Show(visit, false);

        void VisitAct(string act, VisualElement e)
        {
            switch (act)
            {
                case "close": Show(visit, false); break;
                case "export": FileIo.Export($"{sim.w.name}.city", Save.pack(sim.w)); Toast("도시 파일을 내보냈어요. 친구에게 보내 주세요.", "good"); break;
                case "open": FileIo.Open(text => { if (EnterVisit(text.Trim(), "파일")) Show(visit, false); }); break;
                default: Visit.Act(act, e, this); break;
            }
        }

        /// <summary>Swap the visited copy in.</summary>
        public bool EnterVisit(string z, string from)
        {
            World w = null;
            try { w = Save.unpack(z); } catch { }
            if (w == null) { Toast("이 도시는 열 수 없어요.", "warn"); return false; }
            bool first = visiting == null;
            if (first) visiting = (running ? sim.w : null, running);
            if (first) { UseWorld(w); if (!running) Begin(); else SetSpeed(1); }
            else { G.SetWorld(w, keepCamera: true); ResetToasts(w); }
            cat = null; SetTool("select");
            L("visitText").text = $"{w.name} 구경 중{(from != "" ? $" · {from}" : "")} · 인구 {Hud.num(w.stats.pop)}";
            Show(visitBar, true);
            return true;
        }

        public void LeaveVisit(string why = null)
        {
            if (visiting == null) return;
            var v = visiting.Value;
            visiting = null;
            Visit.Stop();
            Show(visitBar, false);
            if (v.home != null) { UseWorld(v.home); Toast(why ?? "내 도시로 돌아왔어요."); }
            else { running = false; SetSpeed(0); ShowStart(true); if (why != null) Toast(why); }
        }

        void SetMusic(bool on)
        {
            if (on) Bgm.Start(); else Bgm.Stop();
            PlayerPrefs.SetString("city.music", on ? "on" : "off");
            E("musicBtn").EnableInClassList("pressed", on);
        }

        // ---------------------------------------------------------------- tools on the map

        class Drag { public int sx, sy, cx, cy; public bool moved; }
        Drag drag;
        (int x, int y, Vector2 px, double wx, double wz)? hover;
        int camMode; Vector2 camLast; bool camMoved; int camButton;
        string armed = "";
        static readonly Dictionary<int, string> ZONE_COLOR = new Dictionary<int, string> { [Zone.R] = "#4cc47c", [Zone.C] = "#3f7fd6", [Zone.I] = "#e3b04b" };
        static string wonW(double n) => $"{Hud.num(n)}만 원";

        (int x, int y, int s) FootprintAt(ToolDef def, int x, int y)
        {
            int s = KINDS[def.kind].size, off = (s - 1) / 2;
            return (Math.Max(0, Math.Min(N - s, x - off)), Math.Max(0, Math.Min(N - s, y - off)), s);
        }

        List<int> CellsUnder(ToolDef def, (int x, int y) a, (int x, int y) b)
        {
            var w = sim.w;
            if (def.roundabout) { int i = idx(b.x, b.y); return w.road[i] != 0 ? Roundabouts.roundaboutCells(i, Roundabouts.roundaboutType(w, i)) : new List<int>(); }
            if (def.road >= 0 && (roadMode == "free" || (roadMode == "curve" && bend != null)))
            {
                int ia = bend != null ? bend.a : idx(a.x, a.y), ib = bend != null ? bend.b : idx(b.x, b.y);
                if (ia == ib) return new List<int>();
                double hx, hz;
                if (bend != null) { var h = Curves.snapControl(w, ia, ib, bend.hx, bend.hz); hx = h.x; hz = h.z; }
                else { hx = ((ia % N + ib % N) / 2.0 + 0.5) * CELL; hz = ((ia / N + ib / N) / 2.0 + 0.5) * CELL; }
                var c = Tools.curveOf(ia, ib, hx, hz, def.road);
                return Curves.curveCells(c).Concat(Curves.coverCells(c)).ToList();
            }
            if (def.road >= 0 && roadMode != "curve") return roadMode == "diag" ? Tools.diagonalPath(a.x, a.y, b.x, b.y) : Tools.roadPath(a.x, a.y, b.x, b.y);
            if (def.zone >= 0) return Tools.rectCells(a.x, a.y, b.x, b.y).Where(i => def.zone == Zone.None ? w.zone[i] != 0 : Tools.zoneable(w, i) && w.zone[i] != def.zone).ToList();
            if (def.kind != null) { var f = FootprintAt(def, b.x, b.y); return Tools.rectCells(f.x, f.y, f.x + f.s - 1, f.y + f.s - 1); }
            return new List<int>();
        }

        (int n, double people, double jobs) DoomedBy(List<int> cells)
        {
            var w = sim.w; var ids = new HashSet<int>();
            foreach (int i in cells) { int id = w.bld[i]; if (id >= 0 && KINDS[w.buildings[id].kind].zone != 0) ids.Add(id); }
            double people = 0, jobs = 0;
            foreach (int id in ids) { var b = w.buildings[id]; if (KINDS[b.kind].zone == Zone.R) people += b.occ; else jobs += b.occ; }
            return (ids.Count, Hud.JsRound(people), Hud.JsRound(jobs));
        }

        static string DoomText((int n, double people, double jobs) d)
        {
            var parts = new List<string>();
            if (d.people > 0) parts.Add($"주민 {Hud.num(d.people)}명");
            if (d.jobs > 0) parts.Add($"일자리 {Hud.num(d.jobs)}개");
            return $"건물 {d.n}채를 허물어요{(parts.Count > 0 ? $" ({string.Join(", ", parts)})" : "")}";
        }

        string ActionKey((int x, int y) a, (int x, int y) b) => $"{tool}:{roadMode}:{a.x},{a.y}:{b.x},{b.y}:{(bend != null ? $"{bend.a},{bend.b},{Math.Round(bend.hx)},{Math.Round(bend.hz)}" : "")}";

        bool ConfirmDemolish(List<int> cells, string key)
        {
            var d = DoomedBy(cells);
            if (d.n == 0 || armed == key) { armed = ""; return true; }
            armed = key;
            Toast($"{DoomText(d)}. 그대로 진행하려면 같은 곳을 한 번 더 누르세요.", "warn");
            return false;
        }

        /// <summary>The preview for the current tool at the hovered cell (and the drag start, if any).</summary>
        void Preview()
        {
            var w = sim.w; var p = preview;
            if (hover == null || tool == "select" || !ToolDefs.TOOLS.TryGetValue(tool, out var def)) { p.Clear(); HideTip(); return; }
            var hv = hover.Value;
            var a = drag != null ? (drag.sx, drag.sy) : (hv.x, hv.y);
            var b = (x: hv.x, y: hv.y);
            var px = hv.px;
            bool noDoom = tool == "bulldoze" || def.trees || def.line != null || def.level > 0 || def.oneway || def.widen || def.hwyPart != null || (def.road >= 0 && roadMode == "curve" && bend == null);
            if (!noDoom) { var doom = DoomedBy(CellsUnder(def, a, b)); demolishNote = doom.n > 0 ? $"{DoomText(doom)}{(armed == ActionKey(a, b) ? ". 한 번 더 누르면 진행해요" : "")}" : ""; }
            else demolishNote = "";
            p.Path(new List<V>(), 0, "#ffffff"); p.RingAt(0, 0, 0);
            if (def.trees)
            {
                var all = Tools.rectCells(a.Item1, a.Item2, b.x, b.y);
                var ok = Tools.treeCells(w, all);
                var todo = ok.Where(i => w.trees[i] == 0).ToList();
                if (ok.Count == 0) { p.Show(all, "#ff5a5a"); ShowTip(px, "가로수: 도로 위를 끌어 심어요. 심어진 곳을 다시 끌면 뽑아요", drag == null); return; }
                double cost = todo.Count * Tools.TREE_COST;
                p.Show(ok, todo.Count > 0 ? (cost > w.money ? "#ff5a5a" : "#7cf0a6") : "#ffb347");
                ShowTip(px, todo.Count > 0 ? (cost > w.money ? $"예산이 부족해요, {wonW(cost)} 필요" : $"가로수 {todo.Count}칸, {wonW(cost)} · 땅값이 조금 오르고 먼지가 줄어요") : $"가로수 뽑기 {ok.Count}칸", cost > w.money);
                return;
            }
            if (def.hwyPart != null)
            {
                int i = idx(b.x, b.y); bool ok = w.road[i] == Road.Highway;
                p.Show(new[] { i }, ok ? "#8fd0ff" : "#ff5a5a");
                ShowTip(px, def.hwyPart == "ic" ? "나들목: 일반 도로와 붙은 고속도로 칸을 눌러 이어 주세요. 고속도로는 나들목에서만 다른 길과 이어져요" : "톨게이트: 곧은 고속도로 칸을 누르세요. 지나가는 차마다 통행료가 들어오지만 차가 느려져요", !ok);
                return;
            }
            if (def.widen || def.oneway)
            {
                var cells = Tools.roadPath(a.Item1, a.Item2, b.x, b.y);
                if (def.widen)
                {
                    var set = new HashSet<int>(cells.Where(i => w.road[i] == Road.Street));
                    foreach (var c in w.curves.Where(c => c.t == Road.Street && c.cells.Any(cells.Contains))) foreach (int i in c.cells) if (w.road[i] == Road.Street) set.Add(i);
                    double cost = Tools.roadCost(w, set.ToList(), Road.Avenue);
                    p.Show(set.Count > 0 ? set.ToList() : cells, set.Count == 0 || cost > w.money ? "#ff5a5a" : "#8fd0ff");
                    ShowTip(px, drag == null ? "대로로 넓히기: 일반 도로 위를 끌어 주세요. 곡선 도로는 통째로 넓어져요" : set.Count == 0 ? "넓힐 일반 도로가 없어요" : cost > w.money ? $"예산이 부족해요, {wonW(cost)} 필요" : $"{set.Count}칸을 4차선 대로로, {wonW(cost)}", set.Count == 0 || cost > w.money);
                }
                else
                {
                    var on = cells.Where(i => w.road[i] != 0 && w.roadAlt[i] == 0).ToList();
                    int dx = Math.Sign(b.x - a.Item1), dy = Math.Sign(b.y - a.Item2);
                    bool bent = dx != 0 && dy != 0;
                    string arrow = dx > 0 ? "→ 동쪽" : dx < 0 ? "← 서쪽" : dy > 0 ? "↓ 남쪽" : "↑ 북쪽";
                    p.Show(on.Count > 0 ? on : cells, bent || on.Count == 0 ? "#ff5a5a" : "#ffd36b");
                    ShowTip(px, drag == null ? "일방통행: 차가 다닐 방향으로 도로를 따라 끌어 주세요. 같은 방향으로 다시 끌면 양방향으로 돌아가요. 일반 도로 두 줄을 나란히 붙이면 저절로 왕복 4차선이 돼요" : bent ? "곧은 길로만 끌어 주세요" : $"{on.Count}칸 {arrow}으로 일방통행, {wonW(on.Count * Tools.ONEWAY_COST)}", bent || on.Count == 0);
                }
                return;
            }
            if (def.roundabout)
            {
                int i = idx(b.x, b.y); string why = Roundabouts.roundaboutProblem(w, i); int t = Roundabouts.roundaboutType(w, i);
                p.Show(w.road[i] != 0 ? Roundabouts.roundaboutCells(i, t) : new List<int> { i }, why != null ? "#ff5a5a" : "#c6f0ff", 0.3f);
                p.RingAt((b.x + 0.5) * CELL, (b.y + 0.5) * CELL, w.road[i] != 0 ? Roundabouts.ringOf(i, t).outer : 0);
                ShowTip(px, why ?? $"회전교차로{(t == Road.Avenue ? " (대로용)" : "")}, {wonW(Roundabouts.ROUNDABOUT_COST(t))} · 얕은 각도로 엇갈리는 길은 여기서만 만날 수 있어요", why != null);
                return;
            }
            if (def.road >= 0 && (roadMode == "curve" || roadMode == "free")) { PreviewCurve(def.road, a, hv); return; }
            if (def.road >= 0)
            {
                var cells = roadMode == "diag" ? Tools.diagonalPath(a.Item1, a.Item2, b.x, b.y) : Tools.roadPath(a.Item1, a.Item2, b.x, b.y);
                double cost = Tools.roadCost(w, cells, def.road);
                bool hill = cells.Any(i => w.ground[i] == Ground.Mountain);
                string meet = Roundabouts.gridMeetProblem(w, cells);
                bool blocked = Tools.roadBlocked(w, cells);
                bool bad = hill || blocked || cost > w.money || meet != null;
                bool loose = !bad && !cells.Any(i => { int x = i % N, y = i / N; if (w.road[i] != 0) return true; foreach (var (ddx, ddy) in new[] { (1, 0), (-1, 0), (0, 1), (0, -1) }) { int nx = x + ddx, ny = y + ddy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && w.road[idx(nx, ny)] != 0) return true; } return false; });
                p.Show(cells, bad ? "#ff5a5a" : loose ? "#ffb347" : def.road == Road.Avenue ? "#8fd0ff" : "#c6f0ff");
                string len = $"{(roadMode == "diag" ? "대각선 " : "")}{cells.Count * 10}m, {wonW(cost)}";
                ShowTip(px, meet ?? (hill ? "산은 터널로만 지날 수 있어요" : blocked ? "시설과 겹쳐서 놓을 수 없어요" : cost > w.money ? $"예산이 부족해요, {wonW(cost)} 필요" : loose ? $"기존 도로와 이어지지 않아요 · {len}" : len), bad || loose);
                return;
            }
            if (def.level > 0)
            {
                var cells = Tools.altCells(w, Tools.roadPath(a.Item1, a.Item2, b.x, b.y));
                if (drag == null) { p.Show(new[] { idx(b.x, b.y) }, "#c6f0ff"); ShowTip(px, $"{LEVEL_NAME[def.level]}: 도로 끝에서 시작해 이을 도로까지 끌어 주세요"); return; }
                string why = Tools.altProblem(w, cells, def.level);
                p.Show(cells, why != null ? "#ff5a5a" : def.level == Level.Elevated ? "#c6f0ff" : "#a4b0c4", def.level == Level.Elevated ? 3 : 0.6f);
                ShowTip(px, why ?? $"{LEVEL_NAME[def.level]} {cells.Count * 10}m, {wonW(Tools.altCost(w, cells, def.level))}", why != null);
                return;
            }
            if (def.zone >= 0)
            {
                var cells = Tools.rectCells(a.Item1, a.Item2, b.x, b.y);
                if (def.zone == Zone.None) { p.Show(cells.Where(i => w.zone[i] != 0).ToList(), "#ffffff"); ShowTip(px, "구역 해제"); return; }
                var ok = cells.Where(i => Tools.zoneable(w, i)).ToList();
                p.Show(ok, ZONE_COLOR[def.zone]);
                ShowTip(px, ok.Count > 0 ? $"{def.name} {ok.Count}칸" : "도로에서 3칸 안쪽만 칠할 수 있어요", ok.Count == 0);
                return;
            }
            if (def.line != null && draft != null)
            {
                int i = idx(b.x, b.y);
                string why = Transit.stopProblem(w, def.line, i, draft.Value.stops);
                p.Show(new[] { i }, why != null ? "#f0644f" : def.line == "bus" ? "#2e9e4f" : "#263c96", def.line == "bus" ? 0.6f : 3);
                p.RingAt((b.x + 0.5) * CELL, (b.y + 0.5) * CELL, why != null ? 0 : (def.line == "bus" ? Transit.BUS_TYPES[def.bus ?? "branch"].radius : Transit.STOP_RADIUS("metro")) * CELL);
                ShowTip(px, why ?? (def.line == "bus" ? $"{Transit.BUS_TYPES[def.bus ?? "branch"].name} 정류장 {draft.Value.stops.Count + 1}번째로 추가" : $"{draft.Value.stops.Count + 1}번째 역으로 추가"), why != null);
                return;
            }
            if (tool == "bulldoze")
            {
                var cells = Tools.rectCells(a.Item1, a.Item2, b.x, b.y);
                var hit = cells.Where(i => w.bld[i] >= 0).ToList();
                p.Show(hit.Count > 0 ? hit : cells.Where(i => w.road[i] != 0).ToList(), "#ff5a5a");
                ShowTip(px, hit.Count > 0 ? "건물 철거" : "도로 철거");
                return;
            }
            if (def.kind != null)
            {
                var f = FootprintAt(def, b.x, b.y);
                string why = Tools.placeProblem(w, def.kind, f.x, f.y);
                bool off = why == null && def.kind != "tower" && Network.findAccess(w, f.x, f.y, f.s, f.s) < 0;
                p.Show(Tools.rectCells(f.x, f.y, f.x + f.s - 1, f.y + f.s - 1), why != null ? "#ff5a5a" : off ? "#ffb347" : "#7cf0a6", 3);
                SERVICE.TryGetValue(def.kind, out var svc);
                p.RingAt((f.x + f.s / 2.0) * CELL, (f.y + f.s / 2.0) * CELL, svc != null ? svc.radius * CELL : def.kind == "snowbase" ? Hazards.SNOW_RADIUS * CELL : 0);
                string price = $"{def.name}, {wonW(KINDS[def.kind].cost)}, 유지비 월 {wonW(KINDS[def.kind].upkeep)}";
                ShowTip(px, why ?? (off ? $"도로에 닿지 않아요. 여기 지으면 도로를 이어 줄 때까지 작동하지 않아요 · {price}" : price), why != null || off);
            }
        }

        void PreviewCurve(int type, (int, int) a, (int x, int y, Vector2 px, double wx, double wz) b)
        {
            var w = sim.w; var p = preview;
            int ia = bend != null ? bend.a : idx(a.Item1, a.Item2), ib = bend != null ? bend.b : idx(b.x, b.y);
            bool free = roadMode == "free";
            if (bend == null && drag == null) { p.Show(new[] { ia }, "#c6f0ff"); p.Path(new List<V>(), 0, ""); ShowTip(b.px, free ? "자유 직선: 시작점에서 끝점까지 끌어 주세요. 각도는 자유예요" : "곡선: 시작점에서 끝점까지 끈 다음, 굽힐 곳을 눌러 주세요"); return; }
            if (ia == ib) { p.Show(new[] { ia }, "#c6f0ff"); p.Path(new List<V>(), 0, ""); return; }
            var h = bend != null ? Curves.snapControl(w, ia, ib, bend.hx, bend.hz) : Curves.snapControl(w, ia, ib, -1e6, -1e6);
            double cx = bend != null ? h.x : ((ia % N + ib % N) / 2.0 + 0.5) * CELL, cz = bend != null ? h.z : ((ia / N + ib / N) / 2.0 + 0.5) * CELL;
            var c = Tools.curveOf(ia, ib, cx, cz, type);
            var cc = Tools.curveCost(w, ia, ib, cx, cz, type);
            string why = Curves.curveProblem(w, c, cc.cells) ?? (cc.cells.Any(i => w.ground[i] == Ground.Mountain) ? "산은 터널로만 지날 수 있어요" : Tools.roadBlocked(w, cc.cells) ? "시설과 겹쳐서 놓을 수 없어요" : cc.cost > w.money ? $"예산이 부족해요, {wonW(cc.cost)} 필요" : null);
            var pts = Enumerable.Range(0, 41).Select(k => Curves.bez(c, k / 40.0)).ToList();
            p.Show(cc.cells, why != null ? "#ff5a5a" : type == Road.Avenue ? "#8fd0ff" : "#c6f0ff", 0.3f);
            p.Path(pts, Curves.HALF_WIDTH(type) * 2, why != null ? "#ff8a8a" : "#ffffff", bend != null ? new V(cx, cz) : (V?)null);
            string snapNote = bend != null && h.snap == "tangent" ? " · 매끄럽게 이어짐" : bend != null && h.snap == "straight" ? " · 직선" : "";
            double deg = ((Math.Round(Math.Atan2(-((ib / N) - (ia / N)), (ib % N) - (ia % N)) * 180 / Math.PI) + 360) % 180);
            ShowTip(b.px, why ?? (free ? $"직선 {cc.length}m, {deg}°, {wonW(cc.cost)}" : bend != null ? $"곡선 {cc.length}m, {wonW(cc.cost)}{snapNote} · 눌러서 완성" : $"{cc.length}m · 손을 떼면 굽힐 수 있어요"), why != null);
        }

        void CommitCurve()
        {
            if (bend == null) return;
            var def = ToolDefs.TOOLS[tool];
            var h = Curves.snapControl(sim.w, bend.a, bend.b, bend.hx, bend.hz);
            if (!ConfirmDemolish(CellsUnder(def, (0, 0), (0, 0)), ActionKey((0, 0), (0, 0)))) return;
            string err = Tools.placeCurve(sim.w, bend.a, bend.b, h.x, h.z, def.road);
            bend = null; preview.Clear();
            if (err != null) Toast(err, "warn");
        }

        void Commit()
        {
            if (drag == null || !ToolDefs.TOOLS.TryGetValue(tool, out var def)) return;
            var w = sim.w;
            var a = (drag.sx, drag.sy); var b = (drag.cx, drag.cy);
            string err = null;
            if (tool != "bulldoze" && !(def.road >= 0 && roadMode == "curve") && def.line == null && !def.trees && def.level == 0 && !def.oneway && !def.widen && def.hwyPart == null
                && !ConfirmDemolish(CellsUnder(def, a, b), ActionKey(a, b))) return;
            if (def.roundabout) { err = Tools.placeRoundabout(w, idx(b.Item1, b.Item2)); if (err != null) Toast(err, "warn"); return; }
            if (def.trees)
            {
                var r = Tools.plantTrees(w, Tools.rectCells(a.Item1, a.Item2, b.Item1, b.Item2), out int planted, out int removed);
                if (r != null) Toast(r, "warn"); else Toast(planted > 0 ? $"가로수 {planted}칸을 심었어요." : $"가로수 {removed}칸을 뽑았어요.", "good");
                return;
            }
            if (def.hwyPart != null) { err = Tools.placeHighwayPart(w, idx(b.Item1, b.Item2), def.hwyPart); if (err != null) Toast(err, "warn"); return; }
            if (def.widen || def.oneway)
            {
                var cells = Tools.roadPath(a.Item1, a.Item2, b.Item1, b.Item2);
                err = def.widen ? Tools.widenRoad(w, cells) : Tools.setOneWay(w, cells);
                if (err != null) Toast(err, "warn");
                return;
            }
            if (def.road >= 0 && roadMode == "free")
            {
                int ia = idx(a.Item1, a.Item2), ib = idx(b.Item1, b.Item2);
                if (ia != ib) { err = Tools.placeCurve(w, ia, ib, ((a.Item1 + b.Item1) / 2.0 + 0.5) * CELL, ((a.Item2 + b.Item2) / 2.0 + 0.5) * CELL, def.road); if (err != null) Toast(err, "warn"); }
                return;
            }
            if (def.road >= 0 && roadMode == "curve")
            {
                if (a != b) bend = new Bend { a = idx(a.Item1, a.Item2), b = idx(b.Item1, b.Item2), hx = hover?.wx ?? 0, hz = hover?.wz ?? 0 };
                return;
            }
            if (def.road >= 0) err = Tools.placeRoad(w, roadMode == "diag" ? Tools.diagonalPath(a.Item1, a.Item2, b.Item1, b.Item2) : Tools.roadPath(a.Item1, a.Item2, b.Item1, b.Item2), def.road);
            else if (def.level > 0) err = Tools.placeAltRoad(w, Tools.roadPath(a.Item1, a.Item2, b.Item1, b.Item2), def.level);
            else if (def.zone >= 0)
            {
                int n = Tools.paintZone(w, Tools.rectCells(a.Item1, a.Item2, b.Item1, b.Item2), def.zone);
                if (n == 0 && def.zone != Zone.None) err = "도로에서 3칸 안쪽 빈 땅에만 구역을 칠할 수 있어요.";
            }
            else if (tool == "bulldoze") Tools.bulldoze(w, Tools.rectCells(a.Item1, a.Item2, b.Item1, b.Item2));
            else if (def.kind != null) { var f = FootprintAt(def, b.Item1, b.Item2); err = Tools.placeFacility(w, def.kind, f.x, f.y); }
            else if (def.line != null && draft != null)
            {
                int i = idx(b.Item1, b.Item2);
                if (draft.Value.stops.Count >= 2 && i == draft.Value.stops[0]) { FinishDraft(); return; }
                err = Transit.stopProblem(w, def.line, i, draft.Value.stops);
                if (err == null) { draft.Value.stops.Add(i); RenderDraft(); }
            }
            if (err != null) Toast(err, "warn");
        }

        /// <summary>Is the pointer over the HUD (so the map shouldn't take it)?</summary>
        bool OverUi(Vector2 screen)
        {
            if (root?.panel == null) return false;
            var p = RuntimePanelUtils.ScreenToPanel(root.panel, new Vector2(screen.x, Screen.height - screen.y));
            var hit = root.panel.Pick(p);
            return hit != null && hit != root;
        }

        (int x, int y, double wx, double wz)? CellAt(Vector2 screen) => G.view.Pick(screen);

        /// <summary>One pointer for the frame: the mouse on a computer, one finger on a phone.</summary>
        struct Ptr { public Vector2 pos; public bool lDown, lUp, rDown, rUp, mDown, mUp; public float wheel; }

        float lastTouchAt = -99;
        bool gesture;             // two fingers are (or were, until every finger lifts) steering the camera
        Vector2 gMid; float gDist, gAng; bool gHas;

        /// <summary>
        /// Phones: one finger builds (or, with nothing chosen, moves the map); two fingers move, pinch to zoom, twist to turn,
        /// and slide up or down together to tilt. Browsers also fake mouse clicks after a tap: those are ignored for a moment.
        /// </summary>
        bool ReadPtr(out Ptr p)
        {
            p = default;
            var ts = Touchscreen.current;
            if (ts != null)
            {
                var down = new List<UnityEngine.InputSystem.Controls.TouchControl>();
                UnityEngine.InputSystem.Controls.TouchControl ended = null;
                foreach (var t in ts.touches)
                {
                    if (t.press.isPressed) down.Add(t);
                    else if (t.press.wasReleasedThisFrame) ended = t;
                }
                if (down.Count > 0 || ended != null) lastTouchAt = Time.unscaledTime;
                if (down.Count >= 2)
                {
                    if (!gesture)
                    {
                        gesture = true; gHas = false;
                        // A second finger means the first wasn't building: drop what it started.
                        drag = null; bend = null; camMode = 0; hover = null; preview.Clear(); HideTip(); Preview();
                    }
                    Vector2 a = down[0].position.ReadValue(), b = down[1].position.ReadValue();
                    Vector2 mid = (a + b) / 2; float dist = Mathf.Max(1, (a - b).magnitude), ang = Mathf.Atan2(b.y - a.y, b.x - a.x);
                    if (gHas)
                    {
                        var dm = mid - gMid;
                        float twist = Mathf.DeltaAngle(gAng * Mathf.Rad2Deg, ang * Mathf.Rad2Deg) * Mathf.Deg2Rad;
                        float pinch = dist / gDist;
                        // Both fingers sliding up or down together (with little pinch) tilts; otherwise the pair drags the map.
                        if (Mathf.Abs(pinch - 1) < 0.01f && Mathf.Abs(dm.y) > Mathf.Abs(dm.x) * 2.5f && Mathf.Abs(dm.y) > 1.5f) G.view.Rotate(0, -dm.y * 0.004);
                        else G.view.PanPixels(dm.x, -dm.y, Screen.height);
                        if (Mathf.Abs(pinch - 1) > 0.002f) G.view.Zoom(gDist / dist);
                        if (Mathf.Abs(twist) > 0.002f) G.view.Rotate(twist, 0);
                    }
                    gMid = mid; gDist = dist; gAng = ang; gHas = true;
                    return false;
                }
                if (gesture)
                {
                    if (down.Count == 0) gesture = false;
                    return false; // wait until every finger is up before a lone finger acts again
                }
                if (down.Count == 1)
                {
                    var t = down[0];
                    p.pos = t.position.ReadValue();
                    p.lDown = t.press.wasPressedThisFrame;
                    return true;
                }
                if (ended != null)
                {
                    p.pos = ended.position.ReadValue();
                    p.lUp = true;
                    touchLift = true;
                    return true;
                }
            }
            var m = Mouse.current;
            if (m == null) return false;
            // After any touch the browser keeps a fake mouse parked where the finger last was; taken as a hover, it would
            // leave the tool's ghost (a service's coverage ring, say) on screen. Only a real mouse, moved well after the last
            // touch, brings the mouse back.
            if (lastTouchAt > -99)
            {
                bool real = Time.unscaledTime - lastTouchAt > 1.5f && (m.delta.ReadValue().sqrMagnitude > 1f || m.leftButton.wasPressedThisFrame || m.scroll.ReadValue().sqrMagnitude > 0);
                if (!real) return false;
                lastTouchAt = -99;
            }
            p.pos = m.position.ReadValue();
            p.lDown = m.leftButton.wasPressedThisFrame; p.lUp = m.leftButton.wasReleasedThisFrame;
            p.rDown = m.rightButton.wasPressedThisFrame; p.rUp = m.rightButton.wasReleasedThisFrame;
            p.mDown = m.middleButton.wasPressedThisFrame; p.mUp = m.middleButton.wasReleasedThisFrame;
            p.wheel = m.scroll.ReadValue().y;
            return true;
        }
        bool touchLift;

        void Pointer()
        {
            touchLift = false;
            if (!ReadPtr(out var m)) return;
            var pos = m.pos;
            bool overUi = OverUi(pos);
            bool startShown = Shown(start) || Shown(slots) || Shown(visit);
            // Wheel zoom.
            float wheel = m.wheel;
            if (Mathf.Abs(wheel) > 0.01f && !overUi && !startShown) G.view.Zoom(Math.Exp(-Math.Sign(wheel) * 0.12));
            if (startShown) return;

            bool lDown = m.lDown, rDown = m.rDown, mDown = m.mDown;
            if ((lDown || rDown || mDown) && !overUi)
            {
                if (rDown) { camMode = 2; camLast = pos; camMoved = false; camButton = 1; }
                else if (mDown || (tool == "select" && lDown)) { camMode = 1; camLast = pos; camMoved = false; camButton = mDown ? 2 : 0; }
                else
                {
                    var c = CellAt(pos);
                    if (c != null)
                    {
                        var cv = c.Value;
                        hover = (cv.x, cv.y, pos, cv.wx, cv.wz);
                        if (bend != null) { bend.active = true; bend.hx = cv.wx; bend.hz = cv.wz; Preview(); }
                        else { drag = new Drag { sx = cv.x, sy = cv.y, cx = cv.x, cy = cv.y }; Preview(); }
                    }
                }
            }
            if (camMode != 0)
            {
                var d = pos - camLast;
                if (Mathf.Abs(d.x) + Mathf.Abs(d.y) > 2) camMoved = true;
                if (camMode == 1) G.view.PanPixels(d.x, -d.y, Screen.height);
                else G.view.Rotate(-d.x * 0.006, -d.y * 0.004);
                camLast = pos;
                bool up = camButton == 1 ? m.rUp : camButton == 2 ? m.mUp : m.lUp;
                if (up)
                {
                    int was = camMode; camMode = 0;
                    if (!camMoved)
                    {
                        if (was == 2 && tool != "select") { cat = null; SetTool("select"); }
                        else if (was == 1 && tool == "select" && camButton == 0) { var c = CellAt(pos); if (c != null) OpenInfo(c.Value.x, c.Value.y); }
                    }
                }
                return;
            }
            // Hover and drag.
            if (!overUi || drag != null || bend != null)
            {
                var c = CellAt(pos);
                if (c == null) { if (hover != null) { hover = null; Preview(); } }
                else
                {
                    var cv = c.Value;
                    bool moved = hover == null || hover.Value.x != cv.x || hover.Value.y != cv.y || (bend != null);
                    hover = (cv.x, cv.y, pos, cv.wx, cv.wz);
                    if (bend != null) { bend.hx = cv.wx; bend.hz = cv.wz; }
                    if (drag != null)
                    {
                        if (cv.x != drag.cx || cv.y != drag.cy) drag.moved = true;
                        drag.cx = cv.x; drag.cy = cv.y;
                        if (ToolDefs.TOOLS.TryGetValue(tool, out var td) && td.kind != null) { drag.sx = cv.x; drag.sy = cv.y; }
                    }
                    if (moved) Preview(); else if (Shown(tipEl)) ShowTip(pos, tipLabel.text.Split('\n')[0], tipEl.ClassListContains("err"));
                }
            }
            else if (hover != null && drag == null) { hover = null; preview.Clear(); HideTip(); }
            if (m.lUp)
            {
                if (bend != null && bend.active) { Undoable(CommitCurve); return; }
                if (drag != null) Undoable(Commit);
                drag = null;
                Preview();
            }
            // A finger has no hover: once it lifts, the ghost goes (a curve waiting for its bend point keeps its own).
            if (touchLift && bend == null) { hover = null; preview.Clear(); HideTip(); }
        }

        void Keys()
        {
            var k = Keyboard.current;
            if (k == null) return;
            if (root.focusController?.focusedElement is TextField) return;
            if (k.escapeKey.wasPressedThisFrame)
            {
                if (bend != null) { bend = null; preview.Clear(); Preview(); return; }
                cat = null; SetTool("select"); CloseInfo(); ClosePanel(); return;
            }
            if (!running) return;
            bool ctrl = k.ctrlKey.isPressed || k.leftCommandKey.isPressed;
            if (ctrl && k.zKey.wasPressedThisFrame) { UndoLast(); return; }
            if (draft != null && k.enterKey.wasPressedThisFrame) { Undoable(FinishDraft); return; }
            if (draft != null && k.backspaceKey.wasPressedThisFrame && draft.Value.stops.Count > 0) { draft.Value.stops.RemoveAt(draft.Value.stops.Count - 1); draftHtmlShown = ""; RenderDraft(); return; }
            if (k.tKey.wasPressedThisFrame && cat == "road") { int ix = Array.FindIndex(ROAD_MODES, m => m.id == roadMode); SetRoadMode(ROAD_MODES[(ix + 1) % ROAD_MODES.Length].id); return; }
            foreach (var c in ToolDefs.CATEGORIES)
            {
                var key = c.key == "Delete" ? k.deleteKey : k.FindKeyOnCurrentKeyboardLayout(c.key.ToLowerInvariant());
                if (key != null && key.wasPressedThisFrame && !ctrl) { SelectCategory(c.id); return; }
            }
            if (k.spaceKey.wasPressedThisFrame) { SetSpeed(speed != 0 ? 0 : lastSpeed); return; }
            if (k.digit1Key.wasPressedThisFrame) { lastSpeed = 1; SetSpeed(1); }
            if (k.digit2Key.wasPressedThisFrame) { lastSpeed = 2; SetSpeed(2); }
            if (k.digit3Key.wasPressedThisFrame) { lastSpeed = 4; SetSpeed(4); }
            // Camera keys (WASD, arrows, QE, RF), not while a key typed into the start screen.
            float dt = Mathf.Min(0.1f, Time.deltaTime);
            G.view.Keys(k.wKey.isPressed || k.upArrowKey.isPressed, k.sKey.isPressed || k.downArrowKey.isPressed, k.aKey.isPressed || k.leftArrowKey.isPressed, k.dKey.isPressed || k.rightArrowKey.isPressed,
                k.qKey.isPressed, k.eKey.isPressed, k.rKey.isPressed || k.equalsKey.isPressed, k.fKey.isPressed || k.minusKey.isPressed, dt);
        }

        /// <summary>For automated play and checks: run a tool over a drag, as a mouse would.</summary>
        public string DevDrag(string t, int x0, int y0, int x1, int y1)
        {
            if (t != tool) { var c = ToolDefs.CATEGORIES.FirstOrDefault(k => k.tools.Any(x => x.id == t)); cat = c?.id; SetTool(t); }
            drag = new Drag { sx = x0, sy = y0, cx = x1, cy = y1, moved = true };
            hover = (x1, y1, new Vector2(400, 300), (x1 + 0.5) * CELL, (y1 + 0.5) * CELL);
            Preview();
            string tipText = tipLabel.text;
            Undoable(Commit);
            drag = null;
            return tipText;
        }
        public void DevAct(string html) { foreach (var n in Html.Parse(html)) OnAct(n, null); }
        public void DevNew(string map) { mapChoice = map; NewCity(); }
        public void DevInfo(int x, int y) => OpenInfo(x, y);
        public void DevPanel(string k) => OpenPanel(k);

        // ---------------------------------------------------------------- frame

        float hudTimer;
        int saveDay;
        bool firstGesture;

        void Update()
        {
            if (G == null || root == null) return;
            if (!firstGesture && ((Mouse.current?.leftButton.wasPressedThisFrame ?? false) || (Touchscreen.current?.primaryTouch.press.wasPressedThisFrame ?? false) || (Keyboard.current?.anyKey.wasPressedThisFrame ?? false)))
            {
                firstGesture = true;
                if (PlayerPrefs.GetString("city.music", "on") != "off" && !Bgm.On) SetMusic(true);
            }
            Responsive();
            Pointer();
            Keys();
            if (!running) G.view.Rotate(Time.deltaTime * 0.05, 0);
            preview.Draw();
            hudTimer -= Time.deltaTime;
            if (hudTimer > 0) return;
            hudTimer = 0.25f;
            var w = sim.w;
            UpdateTop(w);
            UpdateGoal(w);
            if (running) PumpToasts(w);
            if (infoCell != null) FillSheet(info, Hud.infoHtml(w, infoCell.Value.x, infoCell.Value.y));
            if (draft != null && draft.Value.stops.Count >= 2) RenderDraft();
            RenderPanel();
            if (running && visiting == null && w.day >= saveDay + 30) { saveDay = w.day; Slots.Save(w); }
            Visit.Tick(w, this);
        }

        void UpdateTop(World w)
        {
            L("cityName").text = w.name;
            L("date").text = Hud.dateText(w.day);
            L("pop").text = Hud.num(w.stats.pop);
            int next = !Growth.tierOpen(w, 2) ? 2 : !Growth.tierOpen(w, 3) ? 3 : 0;
            Show(E("tier"), next != 0);
            if (next != 0)
            {
                double goal = Growth.TIER_POP(next), from = next == 3 ? Growth.TIER_POP(2) : 0;
                E("tierBar").style.width = Length.Percent((float)Math.Max(0, Math.Min(100, (w.stats.pop - from) / (goal - from) * 100)));
                L("tierText").text = $"{next}단계까지 {Hud.num(Math.Max(0, goal - w.stats.pop))}명";
            }
            var m = L("money");
            m.text = Hud.shortWon(w.money);
            m.EnableInClassList("neg", w.money < 0);
            L("happy").text = w.stats.pop != 0 ? $"{Hud.JsRound(w.stats.happy)}%" : "없음";
            foreach (var (k, v0) in new[] { ("R", w.demR), ("C", w.demC), ("I", w.demI) })
            {
                double v = Math.Max(-100, Math.Min(100, v0));
                var fill = E("d" + k);
                // Grows up from the midline for demand, down for surplus.
                float h = (float)(Math.Abs(v) / 100 * 16);
                fill.style.height = h;
                fill.style.top = v >= 0 ? 16 - h : 16;
                fill.style.backgroundColor = new StyleColor(k == "R" ? new Color32(0x54, 0xc5, 0x7a, 255) : k == "C" ? new Color32(0x2f, 0x8a, 0xdc, 255) : new Color32(0xe3, 0xad, 0x4b, 255));
                E("bar" + k).EnableInClassList("low", v < 0);
            }
        }

        void UpdateGoal(World w)
        {
            var g = Hud.goal(w);
            L("goalStep").text = g.step;
            L("goalText").text = g.text;
            E("goalBar").style.scale = new Scale(new Vector3((float)g.bar, 1, 1));
            goalBox.EnableInClassList("done", g.done);
        }
    }
}
