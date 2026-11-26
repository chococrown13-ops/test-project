using System.Collections.Generic;
using UnityEngine;

namespace Ssuksuk
{
    /// <summary>
    /// The fight, with no input: each spirit picks the nearest enemy, walks into range and strikes.
    /// Strikes and blows fill mana; a full bar casts the spirit's skill. Distances are in board squares.
    /// </summary>
    public class Fighter
    {
        public SpiritDef Def;
        public int Star, Side;
        public SpiritView View;
        public Vector2 Pos;          // board squares
        public float Hp, MaxHp, Ad, Armor, Range, AtkInterval, Mana, MaxMana, Shield, ShieldT, StunT, AtkT, RetargetT;
        public bool Alive = true;
        public Fighter Target;
        public float Dealt;

        public float Hp01 => MaxHp > 0 ? Hp / MaxHp : 0f;
    }

    public class Battle
    {
        public readonly List<Fighter> F = new();
        public float T;
        public bool Over;
        public int Winner = -1; // 0 us, 1 them, -1 a draw (time ran out)
        public const float TimeLimit = 35f;
        const float Speed = 1.9f;    // squares a second
        readonly System.Func<Vector2, Vector3> world;

        public Battle(System.Func<Vector2, Vector3> toWorld) { world = toWorld; }

        public Fighter Add(SpiritDef d, int star, int side, Vector2 pos, SpiritView view)
        {
            float m = Spirits.StarMul(star);
            var f = new Fighter
            {
                Def = d, Star = star, Side = side, View = view, Pos = pos,
                MaxHp = d.Hp * m, Ad = d.Ad * m, Armor = d.Armor, Range = d.Range, AtkInterval = 1f / d.AttackSpeed,
                MaxMana = d.MaxMana, Mana = d.StartMana,
                AtkT = Random.Range(0.1f, 0.5f),
            };
            f.Hp = f.MaxHp;
            F.Add(f);
            view.ShowBars(true);
            return f;
        }

        public int AliveOn(int side) { int n = 0; foreach (var f in F) if (f.Alive && f.Side == side) n++; return n; }

        public void Step(float dt)
        {
            if (Over) return;
            T += dt;
            foreach (var f in F)
            {
                if (!f.Alive) continue;
                if (f.ShieldT > 0 && (f.ShieldT -= dt) <= 0) f.Shield = 0;
                if (f.StunT > 0) { f.StunT -= dt; continue; }
                f.RetargetT -= dt;
                if (f.Target == null || !f.Target.Alive || f.RetargetT <= 0) { f.Target = Nearest(f); f.RetargetT = 0.6f; }
                var e = f.Target;
                if (e == null) continue;
                float dist = Vector2.Distance(f.Pos, e.Pos);
                f.View.Face(world(e.Pos) - world(f.Pos));
                if (dist > f.Range + 0.2f)
                {
                    Vector2 dir = (e.Pos - f.Pos).normalized;
                    // Keep a little room from friends so they don't stack on one square.
                    foreach (var o in F)
                    {
                        if (o == f || !o.Alive) continue;
                        Vector2 d = f.Pos - o.Pos;
                        float m = d.magnitude;
                        if (m < 0.85f && m > 1e-4f) dir += d / m * (0.85f - m) * 2.2f;
                    }
                    f.Pos += dir.normalized * Speed * dt;
                    f.Pos.x = Mathf.Clamp(f.Pos.x, 0f, Board.Cols - 1);
                    f.Pos.y = Mathf.Clamp(f.Pos.y, 0f, Board.Rows - 1);
                    continue;
                }
                f.AtkT -= dt;
                if (f.AtkT > 0) continue;
                f.AtkT = f.AtkInterval;
                Strike(f, e);
            }
            foreach (var f in F) if (f.View != null) f.View.SetBars(f.Hp01, f.Shield / f.MaxHp, f.MaxMana > 0 ? f.Mana / f.MaxMana : 0);
            int a = AliveOn(0), b = AliveOn(1);
            if (a == 0 || b == 0) { Over = true; Winner = a > 0 ? 0 : b > 0 ? 1 : -1; }
            else if (T >= TimeLimit) { Over = true; Winner = -1; }
        }

        Fighter Nearest(Fighter f)
        {
            Fighter best = null; float bd = float.MaxValue;
            foreach (var o in F)
            {
                if (!o.Alive || o.Side == f.Side) continue;
                float d = Vector2.Distance(f.Pos, o.Pos);
                if (d < bd) { bd = d; best = o; }
            }
            return best;
        }

        Fighter Weakest(int side, bool ofSide)
        {
            Fighter best = null;
            foreach (var o in F)
                if (o.Alive && (o.Side == side) == ofSide && (best == null || o.Hp01 < best.Hp01)) best = o;
            return best;
        }

        void Strike(Fighter f, Fighter e)
        {
            bool ranged = f.Range > 1.5f;
            if (ranged) Fx.Shot(world(f.Pos) + Vector3.up * 0.7f, world(e.Pos) + Vector3.up * 0.6f, f.Def.Main);
            f.View.Pop(0.12f);
            Damage(f, e, f.Ad, false);
            f.Mana += 10f;
            if (f.Mana >= f.MaxMana && f.MaxMana > 0) { f.Mana = 0; Cast(f, e); }
        }

        public void Damage(Fighter by, Fighter e, float raw, bool magic)
        {
            if (!e.Alive) return;
            float v = magic ? raw : raw * 100f / (100f + e.Armor);
            float absorbed = Mathf.Min(e.Shield, v);
            e.Shield -= absorbed;
            float toHp = v - absorbed;
            e.Hp -= toHp;
            by.Dealt += v;
            e.Mana = Mathf.Min(e.MaxMana, e.Mana + v * 0.04f);
            e.View.Pop(0.2f);
            Sfx.Hit();
            var at = world(e.Pos) + Vector3.up * 1.4f;
            Fx.Number(at + new Vector3(Random.Range(-0.2f, 0.2f), 0, 0), Mathf.RoundToInt(v).ToString(), magic ? Palette.Mana : by.Side == 0 ? Palette.Paper : Palette.Enemy);
            Fx.Burst(world(e.Pos) + Vector3.up * 0.6f, magic ? Palette.Mana : by.Def.Main, 5, 2f, 0.1f, 0.35f);
            if (e.Hp <= 0f) Kill(e);
        }

        void Kill(Fighter e)
        {
            e.Alive = false;
            e.Hp = 0;
            Fx.Burst(world(e.Pos) + Vector3.up * 0.5f, e.Def.Main, 16, 3f, 0.16f, 0.7f, 0.5f);
            e.View.StartCoroutine(e.View.Die());
        }

        void Heal(Fighter f, float v)
        {
            if (!f.Alive) return;
            f.Hp = Mathf.Min(f.MaxHp, f.Hp + v);
            Fx.Number(world(f.Pos) + Vector3.up * 1.5f, "+" + Mathf.RoundToInt(v), Palette.Hp);
            Fx.Burst(world(f.Pos) + Vector3.up * 0.6f, Palette.Hp, 8, 1.5f, 0.12f, 0.6f, 1f);
        }

        void GiveShield(Fighter f, float v)
        {
            f.Shield = Mathf.Max(f.Shield, v);
            f.ShieldT = 4f;
            Fx.Burst(world(f.Pos) + Vector3.up * 0.7f, Palette.Shield, 12, 1.6f, 0.13f, 0.6f, 0.3f);
        }

        void Cast(Fighter f, Fighter e)
        {
            Sfx.Cast();
            f.View.Pop(0.35f);
            float s = Spirits.StarMul(f.Star);
            Vector3 at = world(e.Pos) + Vector3.up * 0.5f;
            switch (f.Def.Skill)
            {
                case Skill.Guard:
                    GiveShield(f, 260f * s);
                    break;
                case Skill.Ward:
                    foreach (var o in F) if (o.Alive && o.Side == f.Side && Vector2.Distance(o.Pos, f.Pos) <= 1.6f) GiveShield(o, 170f * s);
                    break;
                case Skill.Fireball:
                    Fx.Shot(world(f.Pos) + Vector3.up * 0.8f, at, Palette.Accent, 0.3f);
                    Fx.Burst(at, f.Def.Main, 22, 3.5f, 0.2f, 0.6f, 0.6f);
                    foreach (var o in Around(e.Pos, 1.3f, 1 - f.Side)) Damage(f, o, (o == e ? 210f : 110f) * s, true);
                    break;
                case Skill.Snipe:
                    {
                        var w = Weakest(f.Side, false) ?? e;
                        Fx.Shot(world(f.Pos) + Vector3.up * 0.8f, world(w.Pos) + Vector3.up * 0.6f, f.Def.Second, 0.18f);
                        Damage(f, w, 230f * s, true);
                    }
                    break;
                case Skill.Bonk:
                    Damage(f, e, 170f * s, false);
                    e.StunT = Mathf.Max(e.StunT, 1.3f);
                    Fx.Burst(at + Vector3.up * 0.8f, Palette.Accent, 10, 1.2f, 0.12f, 0.8f, 0.5f);
                    break;
                case Skill.Peck:
                    {
                        var w = Weakest(f.Side, false) ?? e;
                        Vector2 behind = w.Pos + (w.Side == 1 ? Vector2.up : Vector2.down) * 0.8f;
                        behind.x = Mathf.Clamp(behind.x, 0, Board.Cols - 1); behind.y = Mathf.Clamp(behind.y, 0, Board.Rows - 1);
                        Fx.Burst(world(f.Pos) + Vector3.up * 0.5f, Palette.Shadow, 12, 1.5f, 0.15f, 0.5f);
                        f.Pos = behind;
                        f.Target = w;
                        float before = w.Hp;
                        Damage(f, w, 190f * s, false);
                        Heal(f, (before - Mathf.Max(0, w.Hp)) * 0.35f);
                    }
                    break;
                case Skill.Bolt:
                    Fx.Burst(at + Vector3.up * 2f, f.Def.Main, 26, 4f, 0.18f, 0.5f);
                    foreach (var o in Around(e.Pos, 1.3f, 1 - f.Side)) { Damage(f, o, 180f * s, true); o.StunT = Mathf.Max(o.StunT, 0.6f); }
                    break;
                case Skill.Spin:
                    Fx.Burst(world(f.Pos) + Vector3.up * 0.4f, f.Def.Main, 20, 3.5f, 0.15f, 0.5f);
                    foreach (var o in Around(f.Pos, 1.4f, 1 - f.Side)) Damage(f, o, 150f * s, false);
                    break;
                case Skill.Bloom:
                    {
                        var w = Weakest(f.Side, true) ?? f;
                        Heal(w, 300f * s);
                        Fx.Shot(world(f.Pos) + Vector3.up * 0.8f, world(w.Pos) + Vector3.up * 0.6f, Palette.Hp, 0.3f);
                    }
                    break;
            }
        }

        IEnumerable<Fighter> Around(Vector2 p, float r, int side)
        {
            var hits = new List<Fighter>();
            foreach (var o in F) if (o.Alive && o.Side == side && Vector2.Distance(o.Pos, p) <= r) hits.Add(o);
            return hits;
        }
    }
}
