using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.UIElements;

namespace NaeDosi.Ui
{
    /// <summary>
    /// 도시 구경 by code between Unity copies (net/visit.ts through Plugins/WebGL/Visit.jslib): show my city under a
    /// five-letter code, or watch a friend's. Visitors only look; their copy is never saved or sent back.
    /// </summary>
    public sealed class Visit : MonoBehaviour
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void VisitInit(string go);
        [DllImport("__Internal")] static extern void VisitShowOpen();
        [DllImport("__Internal")] static extern void VisitShowPush(string z, string host);
        [DllImport("__Internal")] static extern void VisitShowClose();
        [DllImport("__Internal")] static extern void VisitJoin(string code);
        [DllImport("__Internal")] static extern void VisitStop();
        const bool LIVE = true;
#else
        static void VisitInit(string go) { }
        static void VisitShowOpen() { }
        static void VisitShowPush(string z, string host) { }
        static void VisitShowClose() { }
        static void VisitJoin(string code) { }
        static void VisitStop() { }
        const bool LIVE = false;
#endif
        static Visit inst;
        static string code = "";
        static int viewers;
        static bool opening, joining, watching;
        static float showClock;
        static string showSig = "";

        static Visit Get()
        {
            if (inst == null) { inst = new GameObject("Visit").AddComponent<Visit>(); DontDestroyOnLoad(inst.gameObject); VisitInit(inst.gameObject.name); }
            return inst;
        }

        public static string SectionHtml(bool mine)
        {
            Get();
            string h = "<section><h3>친구 도시 구경하기</h3><p class=\"hint\">친구가 '내 도시 보여주기'로 받은 코드 다섯 자리를 넣어요. 보기만 하고, 친구 도시는 바뀌지 않아요. (Unity판끼리만 연결돼요)</p>"
                + $"<div class=\"visit-row\"><input class=\"visit-code\" maxlength=\"5\" value=\"\" /><button class=\"btn primary\" data-visit=\"go\"{(joining ? " disabled" : "")}>{(joining ? "연결 중…" : "구경하기")}</button></div></section>";
            if (!mine) return h;
            h += "<section><h3>내 도시 보여주기</h3><p class=\"hint\">코드를 친구에게 알려 주면 친구가 지금 내 도시를 볼 수 있어요. 창을 닫거나 그만두면 끝나요.</p><div>";
            h += code != ""
                ? $"<div class=\"visit-row\"><span class=\"show-code\">{code}</span><span class=\"hint\">{(viewers > 0 ? $"{viewers}명 구경 중" : "친구를 기다리는 중")}</span></div><div class=\"visit-row\"><button class=\"btn danger\" data-visit=\"unshow\">그만 보여주기</button></div>"
                : $"<div class=\"visit-row\"><button class=\"btn primary\" data-visit=\"show\"{(opening ? " disabled" : "")}>{(opening ? "만드는 중…" : "코드 만들기")}</button></div>";
            return h + "</div></section>";
        }

        public static void Act(string act, VisualElement e, CityUi ui)
        {
            Get();
            if (!LIVE && (act == "go" || act == "show")) { ui.Toast("코드로 구경하기는 웹 브라우저에서 열린 게임끼리 돼요. 파일로 주고받기는 여기서도 돼요."); return; }
            if (act == "go")
            {
                var root = e.panel.visualTree;
                var tf = root.Q<TextField>(className: "visit-code");
                string c = (tf?.value ?? "").Trim().ToUpperInvariant();
                if (c.Length != 5) { ui.Toast("코드 다섯 자리를 넣어 주세요.", "warn"); return; }
                if (code != "") { VisitShowClose(); code = ""; }
                joining = true; VisitJoin(c); ui.RefreshVisit();
            }
            if (act == "show")
            {
                opening = true; VisitShowOpen(); ui.RefreshVisit();
                VisitShowPush(Save.pack(Render.CityGame.I.sim.w), Render.CityGame.I.sim.w.name);
            }
            if (act == "unshow") { VisitShowClose(); code = ""; viewers = 0; ui.RefreshVisit(); }
        }

        public static void Stop() { if (watching) { VisitStop(); watching = false; } }

        /// <summary>While showing: send the city again every so often if it changed.</summary>
        public static void Tick(World w, CityUi ui)
        {
            if (code == "" || viewers == 0 || ui.visiting != null) return;
            showClock += 0.25f;
            if (showClock < 12) return;
            string sig = $"{w.ver.roads},{w.ver.zones},{w.ver.buildings},{w.ver.transit}:{w.day >> 3}";
            if (sig == showSig) return;
            showClock = 0; showSig = sig;
            VisitShowPush(Save.pack(w), w.name);
        }

        // Callbacks from the page.
        void OnShowCode(string c) { opening = false; code = c; CityUi.I.RefreshVisit(); }
        void OnShowError(string m) { opening = false; CityUi.I.Toast(m, "warn"); CityUi.I.RefreshVisit(); }
        void OnShowCount(string n) { int.TryParse(n, out viewers); if (viewers > 0) CityUi.I.Toast($"친구 {viewers}명이 내 도시를 구경하고 있어요.", "good"); CityUi.I.RefreshVisit(); }
        void OnVisitCity(string z) { bool first = joining; joining = false; watching = true; if (CityUi.I.EnterVisit(z, "코드") && first) CityUi.I.CloseVisit(); }
        void OnVisitError(string m) { joining = false; CityUi.I.Toast(m, "warn"); CityUi.I.RefreshVisit(); }
        void OnVisitEnd(string m) { watching = false; CityUi.I.LeaveVisit(m); }
    }
}
