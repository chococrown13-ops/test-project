using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace Ssuksuk
{
    /// <summary>
    /// The screens: title, the in-run HUD (goal, life, gold, shop, fight button, the selected spirit),
    /// pause with volume sliders, and the end screen. uGUI with TextMeshPro, on a screen-space-camera
    /// canvas, built in code from the palette. Every screen change crosses a short fade.
    /// </summary>
    public class Hud : MonoBehaviour
    {
        public GameLoop loop;
        Canvas canvas;
        RectTransform root;
        Sprite round;

        // Screens.
        GameObject title, hud, pause, ended;
        Image fade, flash;
        TextMeshProUGUI prompt, toast, moment;
        // HUD parts.
        TextMeshProUGUI goalText, lifeText, goldText, phaseText, capText, infoName, infoText, endTitle, endStats;
        Image goalFill;
        GameObject info, shopRow, fightBtn, rerollBtn;
        readonly List<(GameObject card, TextMeshProUGUI name, TextMeshProUGUI meta, Image face, Image swatch)> cards = new();
        float goalShown;
        Coroutine toastCo, momentCo;
        public static string Version = "0.1";

        void Start()
        {
            round = RoundedSprite();
            BuildCanvas();
            BuildTitle();
            BuildHud();
            BuildPause();
            BuildEnded();
            fade = Panel(root, "fade", Palette.LacquerDeep, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            fade.raycastTarget = false;
            fade.color = Palette.A(Palette.LacquerDeep, 1f);
            flash = Panel(root, "flash", Palette.A(Palette.Accent, 0f), Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            flash.raycastTarget = false;
            loop.StateChanged += OnState;
            loop.Changed += Refresh;
            loop.Toast += ShowToast;
            loop.Moment += ShowMoment;
            loop.PauseChanged += p => pause.SetActive(p);
            OnState(loop.State);
            Refresh();
            StartCoroutine(Fade(1f, 0f, 0.6f));
        }

        // ---------------------------------------------------------------- building blocks

        void BuildCanvas()
        {
            var g = new GameObject("UI", typeof(RectTransform));
            g.transform.SetParent(transform, false);
            canvas = g.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceCamera;
            canvas.worldCamera = Camera.main;
            canvas.planeDistance = 1f;
            canvas.sortingOrder = 10;
            var scaler = g.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1600, 900);
            scaler.matchWidthOrHeight = 0.5f;
            g.AddComponent<GraphicRaycaster>();
            root = g.GetComponent<RectTransform>();
            if (FindAnyObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
                es.transform.SetParent(transform, false);
            }
        }

        /// <summary>A 64-px rounded square, nine-sliced, drawn in code: every panel and button is one.</summary>
        static Sprite RoundedSprite()
        {
            const int n = 64, rad = 20;
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color32[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float cx = Mathf.Clamp(x + 0.5f, rad, n - rad), cy = Mathf.Clamp(y + 0.5f, rad, n - rad);
                    float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(cx, cy));
                    byte a = (byte)(Mathf.Clamp01(rad - d + 0.5f) * 255);
                    px[y * n + x] = new Color32(255, 255, 255, a);
                }
            tex.SetPixels32(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100, 0, SpriteMeshType.FullRect, new Vector4(rad, rad, rad, rad));
        }

        Image Panel(Transform parent, string name, Color c, Vector2 aMin, Vector2 aMax, Vector2 oMin, Vector2 oMax, bool rounded = false)
        {
            var g = new GameObject(name, typeof(RectTransform), typeof(Image));
            g.transform.SetParent(parent, false);
            var rt = (RectTransform)g.transform;
            rt.anchorMin = aMin; rt.anchorMax = aMax; rt.offsetMin = oMin; rt.offsetMax = oMax;
            var img = g.GetComponent<Image>();
            img.color = c;
            if (rounded) { img.sprite = round; img.type = Image.Type.Sliced; }
            return img;
        }

        TextMeshProUGUI Label(Transform parent, string text, float size, bool display, Color c, TextAlignmentOptions align, Vector2 aMin, Vector2 aMax, Vector2 oMin, Vector2 oMax)
        {
            var g = new GameObject("text", typeof(RectTransform));
            g.transform.SetParent(parent, false);
            var rt = (RectTransform)g.transform;
            rt.anchorMin = aMin; rt.anchorMax = aMax; rt.offsetMin = oMin; rt.offsetMax = oMax;
            var t = g.AddComponent<TextMeshProUGUI>();
            t.font = display ? Fonts.Title : Fonts.Body;
            t.text = text;
            t.fontSize = size;
            t.color = c;
            t.alignment = align;
            t.characterSpacing = display ? 2f : 0f;
            t.textWrappingMode = TextWrappingModes.Normal;
            t.raycastTarget = false;
            return t;
        }

        GameObject Button(Transform parent, string text, System.Action onClick, Color bg, Color fg, Vector2 aMin, Vector2 aMax, Vector2 oMin, Vector2 oMax, float size = 26)
        {
            var img = Panel(parent, "button " + text, bg, aMin, aMax, oMin, oMax, true);
            var b = img.gameObject.AddComponent<Button>();
            var cols = b.colors;
            cols.normalColor = Color.white;
            cols.highlightedColor = new Color(1.08f, 1.08f, 1.08f);
            cols.pressedColor = new Color(0.85f, 0.85f, 0.85f);
            cols.disabledColor = new Color(0.6f, 0.6f, 0.6f, 0.7f);
            b.colors = cols;
            b.onClick.AddListener(() => { Sfx.Click(); onClick(); });
            Label(img.transform, text, size, true, fg, TextAlignmentOptions.Center, Vector2.zero, Vector2.one, new Vector2(8, 4), new Vector2(-8, -4));
            return img.gameObject;
        }

        static readonly Vector2 Z = Vector2.zero, O = Vector2.one;

        // ---------------------------------------------------------------- title

        void BuildTitle()
        {
            title = new GameObject("title", typeof(RectTransform));
            title.transform.SetParent(root, false);
            Stretch(title);
            var scrim = Panel(title.transform, "scrim", Palette.A(Palette.LacquerDeep, 0.7f), new Vector2(0, 0.43f), new Vector2(1, 0.76f), Z, Z);
            scrim.raycastTarget = false;
            var name = Label(title.transform, "셋모아 쑥쑥", 128, true, Palette.Accent, TextAlignmentOptions.Center, new Vector2(0, 0.52f), new Vector2(1, 0.72f), Z, Z);
            name.fontSharedMaterial = Fonts.Outlined(Fonts.Title, Palette.LacquerDeep, 0.18f);
            Label(title.transform, "같은 정령 셋을 모으면 쑥쑥 자라요 · 열 판을 버텨 보세요", 30, true, Palette.Paper, TextAlignmentOptions.Center, new Vector2(0, 0.46f), new Vector2(1, 0.52f), Z, Z);
            var pscrim = Panel(title.transform, "prompt scrim", Palette.A(Palette.LacquerDeep, 0.7f), new Vector2(0.5f, 0.2f), new Vector2(0.5f, 0.27f), new Vector2(-320, 0), new Vector2(320, 0), true);
            pscrim.raycastTarget = false;
            prompt = Label(pscrim.transform, "아무 키나 누르거나 화면을 눌러 시작", 28, true, Palette.Paper, TextAlignmentOptions.Center, Z, O, Z, Z);
        }

        static void Stretch(GameObject g)
        {
            var rt = (RectTransform)g.transform;
            rt.anchorMin = Z; rt.anchorMax = O; rt.offsetMin = Z; rt.offsetMax = Z;
        }

        // ---------------------------------------------------------------- the run's HUD

        void BuildHud()
        {
            hud = new GameObject("hud", typeof(RectTransform));
            hud.transform.SetParent(root, false);
            Stretch(hud);

            // Goal, top left: ten fights, and how far along.
            var goal = Panel(hud.transform, "goal", Palette.Panel, new Vector2(0, 1), new Vector2(0, 1), new Vector2(20, -108), new Vector2(420, -20), true);
            Label(goal.transform, "목표 · 열 판 버티기", 20, false, Palette.Muted, TextAlignmentOptions.TopLeft, Z, O, new Vector2(20, 10), new Vector2(-20, -12));
            goalText = Label(goal.transform, "", 34, true, Palette.Paper, TextAlignmentOptions.TopLeft, Z, O, new Vector2(20, 10), new Vector2(-20, -36));
            var track = Panel(goal.transform, "track", Palette.A(Palette.Paper, 0.15f), new Vector2(0, 0), new Vector2(1, 0), new Vector2(20, 12), new Vector2(-20, 22), true);
            goalFill = Panel(track.transform, "fill", Palette.Accent, Z, new Vector2(0, 1), Z, Z, true);

            // Life and gold, top right.
            var stats = Panel(hud.transform, "stats", Palette.Panel, new Vector2(1, 1), new Vector2(1, 1), new Vector2(-440, -88), new Vector2(-20, -20), true);
            Dot(stats.transform, Palette.Bad, new Vector2(30, 0));
            lifeText = Label(stats.transform, "", 32, true, Palette.Paper, TextAlignmentOptions.Left, new Vector2(0, 0), new Vector2(0.5f, 1), new Vector2(54, 0), Z);
            Dot(stats.transform, Palette.Accent, new Vector2(240, 0));
            goldText = Label(stats.transform, "", 32, true, Palette.Paper, TextAlignmentOptions.Left, new Vector2(0.5f, 0), new Vector2(1, 1), new Vector2(54, 0), Z);

            // What's happening, top centre.
            phaseText = Label(hud.transform, "", 30, true, Palette.Paper, TextAlignmentOptions.Center, new Vector2(0.3f, 1), new Vector2(0.7f, 1), new Vector2(0, -80), new Vector2(0, -24));
            phaseText.fontSharedMaterial = Fonts.Outlined(Fonts.Title, Palette.LacquerDeep, 0.25f);

            // The shop along the bottom.
            var bar = Panel(hud.transform, "shop", Palette.Panel, new Vector2(0, 0), new Vector2(1, 0), new Vector2(20, 20), new Vector2(-20, 170), true);
            shopRow = bar.gameObject;
            for (int i = 0; i < GameLoop.ShopSize; i++)
            {
                int slot = i;
                float x0 = 0.02f + i * 0.13f;
                var card = Panel(bar.transform, "card", Palette.Card, new Vector2(x0, 0), new Vector2(x0 + 0.12f, 1), new Vector2(0, 14), new Vector2(0, -14), true);
                var b = card.gameObject.AddComponent<Button>();
                b.onClick.AddListener(() => { if (loop.Buy(slot)) StartCoroutine(PopUi(card.transform)); });
                var swatch = Panel(card.transform, "swatch", Palette.Moss, new Vector2(0, 1), new Vector2(1, 1), new Vector2(10, -52), new Vector2(-10, -10), true);
                var nm = Label(card.transform, "", 26, true, Palette.LacquerDeep, TextAlignmentOptions.TopLeft, Z, O, new Vector2(14, 10), new Vector2(-10, -58));
                var meta = Label(card.transform, "", 18, false, Palette.Lacquer, TextAlignmentOptions.BottomLeft, Z, O, new Vector2(14, 10), new Vector2(-10, -10));
                Label(card.transform, (i + 1).ToString(), 16, true, Palette.A(Palette.LacquerDeep, 0.5f), TextAlignmentOptions.TopRight, Z, O, new Vector2(0, 0), new Vector2(-14, -14));
                cards.Add((card.gameObject, nm, meta, card, swatch));
            }
            rerollBtn = Button(bar.transform, "새로 뽑기", () => loop.Reroll(), Palette.Lacquer, Palette.Paper, new Vector2(0.67f, 0), new Vector2(0.79f, 1), new Vector2(0, 14), new Vector2(0, -14));
            Label(rerollBtn.transform, $"엽전 {loop.RerollCost} · D", 16, false, Palette.Muted, TextAlignmentOptions.Bottom, Z, O, new Vector2(0, 8), Z);
            fightBtn = Button(bar.transform, "싸우기", () => loop.Fight(), Palette.Accent, Palette.LacquerDeep, new Vector2(0.8f, 0), new Vector2(0.985f, 1), new Vector2(0, 14), new Vector2(0, -14), 40);
            capText = Label(fightBtn.transform, "", 16, false, Palette.Lacquer, TextAlignmentOptions.Bottom, Z, O, new Vector2(0, 8), Z);

            // The chosen spirit, above the shop on the left.
            var inf = Panel(hud.transform, "info", Palette.Panel, new Vector2(0, 0), new Vector2(0, 0), new Vector2(20, 186), new Vector2(560, 330), true);
            info = inf.gameObject;
            infoName = Label(inf.transform, "", 30, true, Palette.Accent, TextAlignmentOptions.TopLeft, Z, O, new Vector2(20, 12), new Vector2(-150, -14));
            infoText = Label(inf.transform, "", 20, false, Palette.Paper, TextAlignmentOptions.TopLeft, Z, O, new Vector2(20, 12), new Vector2(-20, -56));
            Button(inf.transform, "팔기 · E", () => { if (loop.Selected != null) loop.Sell(loop.Selected); }, Palette.Bad, Palette.Paper, new Vector2(1, 1), new Vector2(1, 1), new Vector2(-140, -60), new Vector2(-16, -14), 20);

            toast = Label(hud.transform, "", 24, false, Palette.Paper, TextAlignmentOptions.Center, new Vector2(0.2f, 1), new Vector2(0.8f, 1), new Vector2(0, -205), new Vector2(0, -150));
            toast.fontSharedMaterial = Fonts.Outlined(Fonts.Body, Palette.LacquerDeep, 0.3f);
            moment = Label(root, "", 96, true, Palette.Accent, TextAlignmentOptions.Center, new Vector2(0, 0.42f), new Vector2(1, 0.62f), Z, Z);
            moment.fontSharedMaterial = Fonts.Outlined(Fonts.Title, Palette.LacquerDeep, 0.2f);
            moment.gameObject.SetActive(false);

            var help = Label(hud.transform, "정령 누르기 → 칸 누르기: 옮기기 · 오른쪽 클릭: 팔기 · Space: 싸우기 · Esc: 멈춤", 17, false, Palette.A(Palette.Paper, 0.8f), TextAlignmentOptions.Right, new Vector2(0.4f, 1), new Vector2(1, 1), new Vector2(0, -132), new Vector2(-24, -100));
            help.fontSharedMaterial = Fonts.Outlined(Fonts.Body, Palette.LacquerDeep, 0.3f);
        }

        void Dot(Transform parent, Color c, Vector2 at)
        {
            var d = Panel(parent, "dot", c, new Vector2(0, 0.5f), new Vector2(0, 0.5f), at - new Vector2(13, 13), at + new Vector2(13, 13), true);
            d.raycastTarget = false;
        }

        // ---------------------------------------------------------------- pause and settings

        void BuildPause()
        {
            pause = Panel(root, "pause", Palette.Scrim, Z, O, Z, Z).gameObject;
            var box = Panel(pause.transform, "box", Palette.LacquerDeep, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-300, -250), new Vector2(300, 250), true);
            var t = Label(box.transform, "잠깐 멈춤", 56, true, Palette.Accent, TextAlignmentOptions.Top, Z, O, new Vector2(0, 0), new Vector2(0, -28));
            Slider(box.transform, "음악", Sfx.Music, Sfx.SetMusic, 330);
            Slider(box.transform, "효과음", Sfx.Effects, Sfx.SetEffects, 260);
            Button(box.transform, "계속하기", () => loop.SetPaused(false), Palette.Accent, Palette.LacquerDeep, new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(-260, 110), new Vector2(-10, 180), 28);
            Button(box.transform, "처음부터", () => StartCoroutine(FadeThen(loop.Restart)), Palette.Lacquer, Palette.Paper, new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(10, 110), new Vector2(260, 180), 28);
            Label(box.transform, "Esc로도 계속할 수 있어요", 18, false, Palette.Muted, TextAlignmentOptions.Bottom, Z, O, new Vector2(0, 40), Z);
            pause.SetActive(false);
        }

        void Slider(Transform parent, string label, float value, System.Action<float> set, float y)
        {
            Label(parent, label, 24, false, Palette.Paper, TextAlignmentOptions.Left, new Vector2(0, 0), new Vector2(0, 0), new Vector2(50, y - 20), new Vector2(190, y + 20));
            var g = new GameObject("slider " + label, typeof(RectTransform));
            g.transform.SetParent(parent, false);
            var rt = (RectTransform)g.transform;
            rt.anchorMin = rt.anchorMax = Z;
            rt.offsetMin = new Vector2(200, y - 12); rt.offsetMax = new Vector2(550, y + 12);
            var bg = Panel(g.transform, "track", Palette.A(Palette.Paper, 0.18f), Z, O, Z, Z, true);
            var fillArea = new GameObject("fill area", typeof(RectTransform)); fillArea.transform.SetParent(g.transform, false); Stretch(fillArea);
            var fill = Panel(fillArea.transform, "fill", Palette.Accent, Z, O, Z, Z, true);
            var handleArea = new GameObject("handle area", typeof(RectTransform)); handleArea.transform.SetParent(g.transform, false); Stretch(handleArea);
            var handle = Panel(handleArea.transform, "handle", Palette.Paper, Z, new Vector2(0, 1), new Vector2(-14, -8), new Vector2(14, 8), true);
            var s = g.AddComponent<Slider>();
            s.fillRect = (RectTransform)fill.transform;
            s.handleRect = (RectTransform)handle.transform;
            s.targetGraphic = handle;
            s.minValue = 0; s.maxValue = 1; s.value = value;
            s.onValueChanged.AddListener(v => set(v));
        }

        // ---------------------------------------------------------------- the end

        void BuildEnded()
        {
            ended = Panel(root, "ended", Palette.Scrim, Z, O, Z, Z).gameObject;
            var box = Panel(ended.transform, "box", Palette.LacquerDeep, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-360, -260), new Vector2(360, 260), true);
            endTitle = Label(box.transform, "", 72, true, Palette.Accent, TextAlignmentOptions.Top, Z, O, new Vector2(20, 0), new Vector2(-20, -30));
            endStats = Label(box.transform, "", 28, false, Palette.Paper, TextAlignmentOptions.Top, Z, O, new Vector2(40, 0), new Vector2(-40, -140));
            Button(box.transform, "다시 하기", () => StartCoroutine(FadeThen(loop.Restart)), Palette.Accent, Palette.LacquerDeep, new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(-150, 40), new Vector2(150, 115), 34);
            ended.SetActive(false);
        }

        // ---------------------------------------------------------------- reacting to the loop

        void OnState(RunState s)
        {
            title.SetActive(s == RunState.Ready);
            hud.SetActive(s == RunState.Running);
            if (s == RunState.Running && fade != null) StartCoroutine(Fade(0.8f, 0f, 0.3f));
            if (s == RunState.Won || s == RunState.Lost) StartCoroutine(ShowEnd(s == RunState.Won));
        }

        IEnumerator ShowEnd(bool won)
        {
            yield return new WaitForSecondsRealtime(1.4f);
            hud.SetActive(false);
            endTitle.text = won ? "열 판을 버텼어요!" : "생명이 다했어요";
            endTitle.color = won ? Palette.Accent : Palette.Bad;
            int fought = won ? loop.Round : Mathf.Max(0, loop.Round - 1) + 1;
            endStats.text = $"싸운 판 <b>{fought}</b> · 이긴 판 <b>{loop.Wins}</b>\n남은 생명 <b>{loop.Life}</b>\n" +
                            (loop.BestSpirit.Length > 0 ? $"가장 잘 싸운 정령 <b>{loop.BestSpirit}</b>\n" : "") + RecordLine;
            ended.SetActive(true);
            var box = ended.transform.GetChild(0);
            yield return Ease.Tween(0.35f, t => box.localScale = Vector3.one * Mathf.LerpUnclamped(0.6f, 1f, t), Ease.OutBack);
        }

        /// <summary>The best result so far, set by the live layer once Cloud Save answers.</summary>
        public static string RecordLine = "";

        float lastLife = -1, lastGold = -1;
        void Refresh()
        {
            if (goalText == null) return;
            goalText.text = $"{loop.Round} / {loop.GoalRounds}판";
            lifeText.text = $"생명 {loop.Life}";
            goldText.text = $"엽전 {loop.Gold}";
            if (lastLife >= 0 && loop.Life < lastLife) StartCoroutine(PopUi(lifeText.transform));
            if (lastGold >= 0 && loop.Gold != lastGold) StartCoroutine(PopUi(goldText.transform));
            lastLife = loop.Life; lastGold = loop.Gold;
            bool shop = loop.Phase == Phase.Shop;
            shopRow.SetActive(shop);
            capText.text = $"판 {loop.OnBoardCount}/{loop.Cap} · Space";
            for (int i = 0; i < cards.Count; i++)
            {
                var d = loop.Shop[i];
                var (card, nm, meta, face, swatch) = cards[i];
                card.GetComponent<Button>().interactable = d != null;
                if (d == null) { nm.text = ""; meta.text = "팔렸어요"; meta.color = Palette.Muted; face.color = Palette.A(Palette.Card, 0.35f); swatch.color = Palette.A(Palette.Muted, 0.3f); continue; }
                face.color = loop.Gold >= d.Cost ? Palette.Card : Color.Lerp(Palette.Card, Palette.Muted, 0.5f);
                swatch.color = d.Main.grayscale > 0.8f ? d.Second : d.Main;
                nm.text = d.Name;
                meta.text = $"{d.RoleName} · 엽전 {d.Cost}"; meta.color = Palette.Lacquer;
            }
            var sel = loop.Selected;
            info.SetActive(sel != null && shop);
            if (sel != null)
            {
                infoName.text = sel.Def.NameAt(sel.Star) + " " + new string('★', sel.Star);
                float m = Spirits.StarMul(sel.Star);
                infoText.text = $"{sel.Def.RoleName} · 체력 {Mathf.RoundToInt(sel.Def.Hp * m)} · 공격 {Mathf.RoundToInt(sel.Def.Ad * m)}\n{sel.Def.SkillText}\n<color=#B9A88A>팔면 엽전 {sel.Worth}</color>";
            }
        }

        void Update()
        {
            if (prompt != null && title.activeSelf)
                prompt.alpha = 0.5f + 0.5f * (0.5f + 0.5f * Mathf.Sin(Time.unscaledTime * 2f * Mathf.PI / 1.6f));
            if (goalFill != null)
            {
                float want = Mathf.Clamp01((loop.Round - 1 + (loop.State == RunState.Won ? 1 : 0)) / (float)loop.GoalRounds);
                goalShown = Mathf.Lerp(goalShown, want, 1f - Mathf.Exp(-Time.unscaledDeltaTime * 8f));
                ((RectTransform)goalFill.transform).anchorMax = new Vector2(Mathf.Max(0.02f, goalShown), 1);
            }
            if (phaseText != null && loop.State == RunState.Running)
                phaseText.text = loop.Phase == Phase.Fight ? $"싸우는 중 · {Mathf.Max(0, Battle.TimeLimit - loop.FightTime):0}초" : "준비";
        }

        // ---------------------------------------------------------------- moments

        void ShowToast(string s)
        {
            if (toastCo != null) StopCoroutine(toastCo);
            toastCo = StartCoroutine(ToastCo(s));
        }

        IEnumerator ToastCo(string s)
        {
            toast.text = s;
            toast.alpha = 1f;
            yield return new WaitForSecondsRealtime(2.4f);
            yield return Ease.Tween(0.4f, t => toast.alpha = 1f - t, Ease.OutCubic);
        }

        /// <summary>A moment: a flash of colour, the banner overshooting in, a hold, and out.</summary>
        void ShowMoment(string s, bool good)
        {
            if (momentCo != null) StopCoroutine(momentCo);
            moment.transform.SetAsLastSibling();
            pause.transform.SetAsLastSibling(); ended.transform.SetAsLastSibling(); fade.transform.SetAsLastSibling(); flash.transform.SetAsLastSibling();
            momentCo = StartCoroutine(MomentCo(s, good));
        }

        IEnumerator MomentCo(string s, bool good)
        {
            moment.gameObject.SetActive(true);
            moment.text = s;
            moment.color = good ? Palette.Accent : Palette.Bad;
            StartCoroutine(Ease.Tween(0.1f, t => flash.color = Palette.A(good ? Palette.Accent : Palette.Bad, 0.45f * (1f - t)), Ease.OutCubic));
            yield return new WaitForSecondsRealtime(0.05f);
            yield return Ease.Tween(0.35f, t => moment.transform.localScale = Vector3.one * Mathf.Max(0.01f, t), Ease.OutBack);
            yield return new WaitForSecondsRealtime(1.0f);
            yield return Ease.Tween(0.2f, t => moment.transform.localScale = Vector3.one * Mathf.Max(0.01f, 1f - t), Ease.OutCubic);
            moment.gameObject.SetActive(false);
        }

        IEnumerator PopUi(Transform t)
        {
            yield return Ease.Tween(0.15f, k => t.localScale = Vector3.one * (1f + 0.2f * Mathf.Sin(k * Mathf.PI)), x => x);
            t.localScale = Vector3.one;
        }

        IEnumerator Fade(float from, float to, float len)
        {
            fade.gameObject.SetActive(true);
            yield return Ease.Tween(len, t => fade.color = Palette.A(Palette.LacquerDeep, Mathf.Lerp(from, to, t)), Ease.OutCubic);
            if (to <= 0f) fade.gameObject.SetActive(false);
        }

        IEnumerator FadeThen(System.Action a)
        {
            yield return Fade(0f, 1f, 0.3f);
            a();
        }

        // For the done gate.
        public bool EndedVisible => ended.activeSelf;
        public bool TitleVisible => title.activeSelf;
        public bool PauseVisible => pause.activeSelf;
        public float GoalFill => goalShown;
    }
}
