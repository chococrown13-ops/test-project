using System.Collections;
using System.Collections.Generic;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;

namespace Ssuksuk
{
    public enum RunState { Ready, Running, Won, Lost }
    public enum Phase { Shop, Fight }

    public class Piece
    {
        public SpiritDef Def;
        public int Star;
        public SpiritView View;
        public int Worth => Def.Cost * (int)Mathf.Pow(3, Star - 1);
    }

    /// <summary>
    /// The one owner of a run. Buy spirits, set them on the board, and send them to fight.
    /// Three of a kind merge into a stronger, renamed spirit. Lose a fight and you lose life.
    /// Get through ten fights with life left and you win; run out of life and you lose.
    /// The HUD, sounds and effects all hang off its events.
    /// </summary>
    public class GameLoop : MonoBehaviour
    {
        // Goal and pressure: tunable live.
        public int GoalRounds = 10;
        public int StartLife = 20;
        public int StartGold = 5;
        public int Income = 4;
        public int RerollCost = 1;
        public const int ShopSize = 5;

        public RunState State { get; private set; } = RunState.Ready;
        public Phase Phase { get; private set; } = Phase.Shop;
        public bool Paused { get; private set; }
        public int Round { get; private set; } = 1;
        public int Life { get; private set; }
        public int Gold { get; private set; }
        public int Wins { get; private set; }
        public float FightTime => battle != null ? battle.T : 0f;
        public readonly SpiritDef[] Shop = new SpiritDef[ShopSize];
        public readonly Piece[] Bench = new Piece[Board.BenchSlots];
        public readonly Piece[,] OnBoard = new Piece[Board.Cols, Board.Half];
        public Piece Selected { get; private set; }
        public string BestSpirit { get; private set; } = "";

        public event System.Action<RunState> StateChanged;
        public event System.Action Changed;
        public event System.Action<string> Toast;
        public event System.Action<string, bool> Moment;   // a big centred banner: text, good?
        public event System.Action<bool> PauseChanged;

        public Board board;
        public CinemachineImpulseSource impulse;
        Battle battle;
        readonly List<SpiritView> fightViews = new();
        readonly List<SpiritView> titleDecor = new();
        Transform pieces;
        readonly System.Random rng = new();

        public int Cap => Mathf.Min(3 + (Round - 1) / 2, Board.Cols);
        public int OnBoardCount { get { int n = 0; foreach (var p in OnBoard) if (p != null) n++; return n; } }

        void Start()
        {
            pieces = new GameObject("pieces").transform;
            pieces.SetParent(transform, false);
            board.Build();
            Life = StartLife;
            Gold = StartGold;
            RollShop(true);
            // A few spirits stand on the board behind the title, so the backdrop is the live game.
            string[] ids = { "saessak", "bulttong", "mulbang", "buong", "somteol" };
            for (int i = 0; i < ids.Length; i++)
            {
                var v = SpiritView.Build(Spirits.ById[ids[i]], i == 1 ? 2 : 1, i % 2, pieces);
                v.transform.position = Board.ToWorld(new Vector2(1 + i * 1.2f, i % 2 == 0 ? 2 : 3));
                v.FaceSide();
                titleDecor.Add(v);
            }
            Changed?.Invoke();
        }

        // ---------------------------------------------------------------- transitions

        public void StartRun()
        {
            if (State != RunState.Ready) return;
            foreach (var v in titleDecor) if (v != null) Destroy(v.gameObject);
            titleDecor.Clear();
            Set(RunState.Running);
            Sfx.Sting();
            Toast?.Invoke("상점에서 정령을 사서 판에 올리고, 싸우기를 눌러요.");
        }

        public void Win() { if (State == RunState.Running) { Set(RunState.Won); Sfx.Sting(); Fx.Confetti(Vector3.up); Moment?.Invoke("열 판을 버텼어요!", true); } }
        public void Lose() { if (State == RunState.Running) { Set(RunState.Lost); Sfx.Lose(); Moment?.Invoke("생명이 다했어요", false); } }

        void Set(RunState s) { State = s; StateChanged?.Invoke(s); Changed?.Invoke(); }

        public void Restart()
        {
            Time.timeScale = 1f;
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
        }

        public void SetPaused(bool on)
        {
            if (State != RunState.Running || Paused == on) return;
            Paused = on;
            Time.timeScale = on ? 0f : 1f;
            PauseChanged?.Invoke(on);
        }

        // ---------------------------------------------------------------- input

        void Update()
        {
            var kb = Keyboard.current;
            var mouse = Mouse.current;
            if (State == RunState.Ready)
            {
                bool any = (kb != null && kb.anyKey.wasPressedThisFrame) || (mouse != null && mouse.leftButton.wasPressedThisFrame);
                if (any) StartRun();
                return;
            }
            if (State != RunState.Running) return;
            if (kb != null && kb.escapeKey.wasPressedThisFrame) SetPaused(!Paused);
            if (Paused) return;

            if (Phase == Phase.Fight)
            {
                battle.Step(Time.deltaTime);
                foreach (var f in battle.F) if (f.Alive) f.View.transform.position = Board.ToWorld(f.Pos);
                if (battle.Over && !settling) StartCoroutine(Settle());
                return;
            }

            if (kb != null)
            {
                if (kb.spaceKey.wasPressedThisFrame) Fight();
                if (kb.dKey.wasPressedThisFrame) Reroll();
                if (kb.eKey.wasPressedThisFrame && Selected != null) Sell(Selected);
                for (int i = 0; i < ShopSize; i++) if (kb[Key.Digit1 + i].wasPressedThisFrame) Buy(i);
            }
            if (mouse == null) return;
            bool overUi = EventSystem.current != null && EventSystem.current.IsPointerOverGameObject();
            if (overUi) return;
            if (mouse.leftButton.wasPressedThisFrame) Click(mouse.position.ReadValue(), false);
            if (mouse.rightButton.wasPressedThisFrame) Click(mouse.position.ReadValue(), true);
        }

        void Click(Vector2 screen, bool sell)
        {
            var cam = Camera.main;
            if (cam == null) return;
            var ray = cam.ScreenPointToRay(screen);
            Piece hitPiece = null; Spot hitSpot = null;
            foreach (var h in Physics.RaycastAll(ray, 200f))
            {
                var v = h.collider.GetComponentInParent<SpiritView>();
                if (v != null) { hitPiece = Find(v); if (hitPiece != null) break; }
                var s = h.collider.GetComponent<Spot>();
                if (s != null && hitSpot == null) hitSpot = s;
            }
            if (hitPiece == null && hitSpot != null) hitPiece = At(hitSpot);
            if (sell) { if (hitPiece != null) Sell(hitPiece); return; }
            if (Selected == null)
            {
                if (hitPiece != null) Select(hitPiece);
                return;
            }
            if (hitPiece == Selected) { Select(null); return; }
            if (hitSpot == null && hitPiece != null) hitSpot = SpotOf(hitPiece);
            if (hitSpot == null) { Select(null); return; }
            MoveTo(Selected, hitSpot);
        }

        // ---------------------------------------------------------------- the shop

        void RollShop(bool free)
        {
            var odds = Spirits.ShopOdds(Round);
            for (int i = 0; i < ShopSize; i++)
            {
                float roll = (float)rng.NextDouble();
                int tier = 1;
                for (float acc = 0; tier <= 3; tier++) { acc += odds[tier - 1]; if (roll < acc) break; }
                tier = Mathf.Clamp(tier, 1, 3);
                var pool = Spirits.All.FindAll(d => d.Tier == tier);
                Shop[i] = pool[rng.Next(pool.Count)];
            }
            Changed?.Invoke();
        }

        public void Reroll()
        {
            if (!CanAct()) return;
            if (Gold < RerollCost) { Toast?.Invoke("엽전이 모자라요."); return; }
            Gold -= RerollCost;
            Sfx.Click();
            RollShop(false);
        }

        public bool Buy(int slot)
        {
            if (!CanAct()) return false;
            var d = Shop[slot];
            if (d == null) return false;
            if (Gold < d.Cost) { Toast?.Invoke("엽전이 모자라요."); return false; }
            int copies = CountOf(d, 1);
            int free = System.Array.IndexOf(Bench, null);
            bool boardRoom = OnBoardCount < Cap;
            if (free < 0 && !boardRoom && copies < 2) { Toast?.Invoke("벤치가 가득 찼어요. 정령을 팔거나 판에 올려 주세요."); return false; }
            Gold -= d.Cost;
            Shop[slot] = null;
            var p = new Piece { Def = d, Star = 1 };
            // A new spirit goes straight onto the board while there's room, else to the bench.
            if (boardRoom && PlaceOnBoard(p)) { }
            else if (free >= 0) PutOnBench(p, free);
            else { p.View = SpiritView.Build(d, 1, 0, pieces); Pending = p; }
            Sfx.Coin();
            Fx.Burst(p.View.transform.position + Vector3.up * 0.6f, Palette.Accent, 10, 2.5f, 0.12f, 0.5f, 0.5f);
            p.View.Pop(0.3f);
            MergeAll();
            Pending = null;
            Changed?.Invoke();
            return true;
        }
        Piece Pending; // a piece bought onto a full bench that is about to merge away

        bool PlaceOnBoard(Piece p)
        {
            // Close fighters go to the front row, shooters and casters to the back.
            bool back = p.Def.Range > 1.5f;
            int[] rows = back ? new[] { 0, 1, 2 } : new[] { 2, 1, 0 };
            int[] cols = { 3, 2, 4, 1, 5, 0, 6 };
            foreach (int r in rows)
                foreach (int c in cols)
                    if (OnBoard[c, r] == null)
                    {
                        OnBoard[c, r] = p;
                        if (p.View == null) p.View = SpiritView.Build(p.Def, p.Star, 0, pieces);
                        p.View.transform.position = Board.ToWorld(new Vector2(c, r));
                        p.View.FaceSide();
                        AddPicker(p.View);
                        return true;
                    }
            return false;
        }

        void PutOnBench(Piece p, int i)
        {
            Bench[i] = p;
            if (p.View == null) p.View = SpiritView.Build(p.Def, p.Star, 0, pieces);
            p.View.transform.position = Board.BenchWorld(i);
            p.View.FaceSide();
            AddPicker(p.View);
        }

        static void AddPicker(SpiritView v)
        {
            if (v.GetComponent<CapsuleCollider>() != null) return;
            var c = v.gameObject.AddComponent<CapsuleCollider>();
            c.center = new Vector3(0, 0.6f, 0);
            c.height = 1.3f;
            c.radius = 0.45f;
        }

        public void Sell(Piece p)
        {
            if (!CanAct() || p == null) return;
            Remove(p);
            Gold += p.Worth;
            Fx.Number(p.View.transform.position + Vector3.up * 1.2f, "+" + p.Worth, Palette.Accent);
            Fx.Burst(p.View.transform.position + Vector3.up * 0.5f, Palette.Accent, 12, 2.5f);
            Sfx.Coin();
            Destroy(p.View.gameObject);
            if (Selected == p) Selected = null;
            board.Hint(false);
            Changed?.Invoke();
        }

        // ---------------------------------------------------------------- moving pieces

        public void Select(Piece p)
        {
            if (Selected != null && Selected.View != null) Selected.View.Select(false);
            Selected = p;
            if (p != null) { p.View.Select(true); Sfx.Click(); }
            board.Hint(p != null);
            Changed?.Invoke();
        }

        void MoveTo(Piece p, Spot s)
        {
            var other = At(s);
            var from = SpotOf(p);
            if (from == null) return;
            if (!s.Bench && other == null && SpotOf(p).Bench && OnBoardCount >= Cap)
            {
                Toast?.Invoke($"이번 판엔 정령을 {Cap}마리까지 올릴 수 있어요.");
                Select(null);
                return;
            }
            // Swap (or move into an empty spot).
            Put(p, s);
            if (other != null) Put(other, from); else Clear(from, p);
            Sfx.Blip();
            p.View.Pop(0.2f);
            Select(null);
        }

        void Put(Piece p, Spot s)
        {
            Clear(SpotOf(p), p);
            if (s.Bench) { Bench[s.Index] = p; p.View.transform.position = Board.BenchWorld(s.Index); }
            else { OnBoard[s.C, s.R] = p; p.View.transform.position = Board.ToWorld(new Vector2(s.C, s.R)); }
        }

        void Clear(Spot s, Piece p)
        {
            if (s == null) return;
            if (s.Bench) { if (Bench[s.Index] == p) Bench[s.Index] = null; }
            else if (OnBoard[s.C, s.R] == p) OnBoard[s.C, s.R] = null;
        }

        void Remove(Piece p) => Clear(SpotOf(p), p);

        Spot SpotOf(Piece p)
        {
            for (int i = 0; i < Bench.Length; i++) if (Bench[i] == p) return board.BenchSpots[i];
            for (int c = 0; c < Board.Cols; c++) for (int r = 0; r < Board.Half; r++) if (OnBoard[c, r] == p) return board.Squares[c, r];
            return null;
        }

        Piece At(Spot s) => s.Bench ? Bench[s.Index] : s.R < Board.Half ? OnBoard[s.C, s.R] : null;

        Piece Find(SpiritView v)
        {
            foreach (var p in Bench) if (p != null && p.View == v) return p;
            foreach (var p in OnBoard) if (p != null && p.View == v) return p;
            return null;
        }

        IEnumerable<Piece> Owned()
        {
            foreach (var p in OnBoard) if (p != null) yield return p;
            foreach (var p in Bench) if (p != null) yield return p;
            if (Pending != null) yield return Pending;
        }

        int CountOf(SpiritDef d, int star) { int n = 0; foreach (var p in Owned()) if (p.Def == d && p.Star == star) n++; return n; }

        /// <summary>Three of a kind (same spirit, same stars) become one with a star more, on the first one's spot.</summary>
        void MergeAll()
        {
            bool again = true;
            while (again)
            {
                again = false;
                foreach (var d in Spirits.All)
                    for (int star = 1; star < 3; star++)
                    {
                        var same = new List<Piece>();
                        foreach (var p in Owned()) if (p.Def == d && p.Star == star) same.Add(p);
                        if (same.Count < 3) continue;
                        var keep = same[0];
                        var spot = SpotOf(keep) ?? (SpotOf(same[1]) ?? SpotOf(same[2]));
                        Vector3 at = spot != null ? spot.transform.position : keep.View.transform.position;
                        for (int k = 0; k < 3; k++)
                        {
                            Remove(same[k]);
                            if (Selected == same[k]) Selected = null;
                            Destroy(same[k].View.gameObject);
                            if (Pending == same[k]) Pending = null;
                        }
                        var up = new Piece { Def = d, Star = star + 1 };
                        up.View = SpiritView.Build(d, up.Star, 0, pieces);
                        AddPicker(up.View);
                        up.View.FaceSide();
                        if (spot != null) Put(up, spot); else if (!PlaceOnBoard(up)) PutOnBench(up, System.Array.IndexOf(Bench, null));
                        up.View.Pop(0.45f);
                        Fx.Burst(up.View.transform.position + Vector3.up * 0.7f, Palette.Accent, 30, 3.5f, 0.16f, 0.8f, 1f);
                        Sfx.Merge();
                        Moment?.Invoke($"{d.NameAt(star)} 셋 → {d.NameAt(star + 1)}!", true);
                        board.Hint(false);
                        again = true;
                        break;
                    }
            }
        }

        bool CanAct() => State == RunState.Running && Phase == Phase.Shop && !Paused && !settling;

        // ---------------------------------------------------------------- the fight

        public void Fight()
        {
            if (!CanAct()) return;
            // Fill empty board places from the bench so nothing sits out by accident.
            for (int i = 0; i < Bench.Length && OnBoardCount < Cap; i++)
                if (Bench[i] != null) { var p = Bench[i]; Bench[i] = null; p.View.transform.position = Vector3.zero; if (!PlaceOnBoard(p)) Bench[i] = p; }
            if (OnBoardCount == 0) { Toast?.Invoke("판에 정령을 먼저 올려 주세요."); return; }
            Select(null);
            Phase = Phase.Fight;
            battle = new Battle(Board.ToWorld);
            foreach (var p in OnBoard) if (p != null) p.View.gameObject.SetActive(false);
            for (int c = 0; c < Board.Cols; c++)
                for (int r = 0; r < Board.Half; r++)
                {
                    var p = OnBoard[c, r];
                    if (p == null) continue;
                    var v = SpiritView.Build(p.Def, p.Star, 0, pieces);
                    v.transform.position = Board.ToWorld(new Vector2(c, r));
                    v.FaceSide();
                    fightViews.Add(v);
                    battle.Add(p.Def, p.Star, 0, new Vector2(c, r), v);
                }
            foreach (var (d, star, c, r) in EnemyTeam(Round))
            {
                var v = SpiritView.Build(d, star, 1, pieces);
                v.transform.position = Board.ToWorld(new Vector2(c, r));
                v.FaceSide();
                fightViews.Add(v);
                battle.Add(d, star, 1, new Vector2(c, r), v);
            }
            Sfx.Cast();
            Changed?.Invoke();
        }

        /// <summary>The other side grows each round: as many spirits as we may field, with more stars as the game goes on.</summary>
        List<(SpiritDef, int, int, int)> EnemyTeam(int round)
        {
            var team = new List<(SpiritDef, int, int, int)>();
            var r = new System.Random(round * 7919 + 13);
            int n = Cap;
            int twos = Mathf.Clamp((round - 2) / 2 + (round >= 6 ? 1 : 0), 0, n);
            int threes = round >= 9 ? 1 : 0;
            var odds = Spirits.ShopOdds(round);
            var used = new HashSet<(int, int)>();
            int[] cols = { 3, 2, 4, 1, 5, 0, 6 };
            for (int i = 0; i < n; i++)
            {
                int tier = r.NextDouble() < odds[0] ? 1 : (r.NextDouble() < 0.7 ? 2 : 3);
                var pool = Spirits.All.FindAll(d => d.Tier == tier);
                var def = pool[r.Next(pool.Count)];
                int star = i < threes ? 3 : i < threes + twos ? 2 : 1;
                // Their front row is the one nearest the middle line (row 3); shooters stand at the back (row 5).
                int row = def.Range > 1.5f ? 5 : def.Role == Role.Striker ? 4 : 3;
                int col = -1;
                for (int k = 0; k < cols.Length && col < 0; k++) if (!used.Contains((cols[(k + i) % cols.Length], row))) col = cols[(k + i) % cols.Length];
                if (col < 0) { row = 4; for (int k = 0; k < cols.Length && col < 0; k++) if (!used.Contains((cols[k], row))) col = cols[k]; }
                used.Add((col, row));
                team.Add((def, star, col, row));
            }
            return team;
        }

        bool settling;
        IEnumerator Settle()
        {
            settling = true;
            int winner = battle.Winner;
            int theirs = battle.AliveOn(1);
            Fighter best = null;
            foreach (var f in battle.F) if (f.Side == 0 && (best == null || f.Dealt > best.Dealt)) best = f;
            if (best != null) BestSpirit = best.Def.NameAt(best.Star);
            if (winner == 0)
            {
                Wins++;
                Sfx.Sting();
                Fx.Confetti(Vector3.up * 0.5f);
                Moment?.Invoke("이겼어요!", true);
            }
            else
            {
                int loss = 2 + theirs + Round / 3;
                Life = Mathf.Max(0, Life - loss);
                Sfx.Lose();
                impulse?.GenerateImpulse(0.6f);
                Moment?.Invoke(winner == 1 ? $"졌어요  생명 -{loss}" : $"비겼어요  생명 -{loss}", false);
            }
            Changed?.Invoke();
            yield return new WaitForSeconds(1.6f);
            foreach (var v in fightViews) if (v != null) Destroy(v.gameObject);
            fightViews.Clear();
            foreach (var p in OnBoard) if (p != null) p.View.gameObject.SetActive(true);
            battle = null;
            Phase = Phase.Shop;
            settling = false;
            if (Life <= 0) { Lose(); yield break; }
            if (Round >= GoalRounds) { Round = GoalRounds; Win(); yield break; }
            Round++;
            int interest = Mathf.Min(2, Gold / 10);
            int gain = Income + (winner == 0 ? 1 : 0) + interest;
            Gold += gain;
            Toast?.Invoke($"{Round}판째. 엽전 +{gain}" + (interest > 0 ? $" (이자 {interest})" : "") + (Cap > OnBoardCount ? $"  ·  이제 {Cap}마리까지 올릴 수 있어요" : ""));
            RollShop(true);
            Changed?.Invoke();
        }

        // For the done gate's script checks: set the run to one fight from either end.
        public void DebugSetLife(int v) { Life = v; Changed?.Invoke(); }
        public void DebugSetRound(int v) { Round = v; Changed?.Invoke(); }
        public void DebugAddGold(int v) { Gold += v; Changed?.Invoke(); }
        public Battle CurrentBattle => battle;
    }
}
