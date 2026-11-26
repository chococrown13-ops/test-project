using System.Collections.Generic;
using UnityEngine;

namespace Ssuksuk
{
    public enum Role { Tank, Fighter, Striker, Ranged, Caster }

    /// <summary>What a skill does when the mana bar fills.</summary>
    public enum Skill
    {
        Guard,   // a shield on itself
        Ward,    // a shield on itself and the friends next to it
        Fireball,// magic damage on the target and a little round it
        Snipe,   // a shot at the weakest enemy anywhere
        Bonk,    // a heavy blow that stuns
        Peck,    // jump behind the weakest enemy, strike, heal from it
        Bolt,    // lightning on the target and everyone round it
        Spin,    // damage to every enemy next to it
        Bloom,   // heals the weakest friend
    }

    /// <summary>The shape a spirit is built from (see SpiritView).</summary>
    public enum Body { Hedgehog, Flame, Drop, Sprout, Chick, Owl, Spark, Pebble, Shadow, Fawn }

    public sealed class SpiritDef
    {
        public string Id, Name;
        public string[] EvoNames; // the names at two and three stars
        public int Tier;
        public Role Role;
        public Skill Skill;
        public string SkillText;
        public Body Body;
        public Color Main, Second;
        public int Hp, Ad, Armor, MaxMana, StartMana;
        public float AttackSpeed, Range;

        public int Cost => Tier;
        public string NameAt(int star) => star <= 1 ? Name : EvoNames[Mathf.Min(star, 3) - 2];
        public string RoleName => Role switch
        {
            Role.Tank => "수호", Role.Fighter => "돌격", Role.Striker => "그림자", Role.Ranged => "사수", _ => "술사",
        };
    }

    /// <summary>
    /// The spirits of 정령 키우기 that this first Unity slice carries, with the web game's names,
    /// colours and roles. Three of a kind make a two-star with a new name; three of those, a three-star.
    /// </summary>
    public static class Spirits
    {
        public static readonly List<SpiritDef> All = new();
        public static readonly Dictionary<string, SpiritDef> ById = new();

        /// <summary>How much stronger each star is (health and attack).</summary>
        public static float StarMul(int star) => star == 1 ? 1f : star == 2 ? 1.8f : 3.24f;

        static Spirits()
        {
            Add("dochi", "뾰롱", new[] { "뾰로롱", "가시뾰롱" }, 1, Role.Tank, Skill.Guard, "가시를 곤두세워 자기 몸에 보호막을 둘러요.", Body.Hedgehog, "#9A7650", "#E2C49A", 80, 0);
            Add("bulttong", "화르미", new[] { "화르륵", "화르르왕" }, 1, Role.Caster, Skill.Fireball, "불꽃을 던져 맞은 적과 그 둘레에 마법 피해를 줘요.", Body.Flame, "#F08A4A", "#F8B878", 70, 20);
            Add("mulbang", "퐁당이", new[] { "찰랑이", "출렁이" }, 1, Role.Ranged, Skill.Snipe, "물총을 쏘아 체력이 가장 낮은 적을 맞혀요.", Body.Drop, "#7CC0E8", "#A8DCF4", 60, 0);
            Add("saessak", "싹싹이", new[] { "쑥쑥이", "무럭이" }, 1, Role.Fighter, Skill.Bonk, "떡잎으로 후려쳐 피해를 주고 잠깐 기절시켜요.", Body.Sprout, "#7AB85A", "#C8E898", 70, 0);
            Add("somteol", "삐약이", new[] { "파닥이", "휘리릭" }, 1, Role.Striker, Skill.Peck, "가장 약한 적 뒤로 날아가 쪼고, 제 체력을 채워요.", Body.Chick, "#F2EDE0", "#F2C14A", 60, 0);
            Add("buong", "부엉이", new[] { "부엉부엉", "달부엉" }, 1, Role.Tank, Skill.Ward, "날개를 펼쳐 자기와 옆의 우리 편에게 보호막을 둘러요.", Body.Owl, "#A8865A", "#E8D4B0", 80, 0);
            Add("beongae", "찌릿이", new[] { "찌르릉", "우르릉" }, 2, Role.Caster, Skill.Bolt, "번개를 떨어뜨려 맞은 적과 둘레에 피해를 주고 잠깐 멈춰 세워요.", Body.Spark, "#F6D85A", "#FFF2B0", 70, 20);
            Add("jogak", "데굴이", new[] { "데구르", "쿵쿵이" }, 2, Role.Fighter, Skill.Spin, "빙글 굴러 바로 옆의 적 모두에게 피해를 줘요.", Body.Pebble, "#A8A498", "#6E6A62", 80, 20);
            Add("geurimja", "쪼르르", new[] { "살금이", "어스름" }, 2, Role.Striker, Skill.Peck, "그림자를 타고 가장 약한 적 뒤로 가 할퀴어요.", Body.Shadow, "#5A5A6E", "#7A7A90", 60, 0);
            Add("kkotsasum", "사뿐이", new[] { "꽃사뿐", "봄사뿐" }, 3, Role.Caster, Skill.Bloom, "꽃잎을 날려 체력이 가장 낮은 우리 편을 고쳐요.", Body.Fawn, "#D8A07A", "#ECC8A4", 80, 30);
        }

        static void Add(string id, string name, string[] evo, int tier, Role role, Skill skill, string text, Body body, string main, string second, int mana, int startMana)
        {
            // The web game's role numbers, a little stronger per tier.
            var (hp, ad, aspd, range, armor) = role switch
            {
                Role.Tank => (700, 50, 0.6f, 1f, 40),
                Role.Fighter => (620, 60, 0.7f, 1f, 30),
                Role.Striker => (520, 66, 0.8f, 1f, 20),
                Role.Ranged => (490, 58, 0.75f, 4f, 15),
                _ => (480, 42, 0.65f, 3f, 15),
            };
            float k = 1f + (tier - 1) * 0.22f;
            var d = new SpiritDef
            {
                Id = id, Name = name, EvoNames = evo, Tier = tier, Role = role, Skill = skill, SkillText = text, Body = body,
                Main = Palette.Parse(main), Second = Palette.Parse(second),
                Hp = Mathf.RoundToInt(hp * k), Ad = Mathf.RoundToInt(ad * k), Armor = armor, AttackSpeed = aspd, Range = range,
                MaxMana = mana, StartMana = startMana,
            };
            All.Add(d);
            ById[id] = d;
        }

        /// <summary>Which tiers the shop offers at a round: dearer spirits show up as the game goes on.</summary>
        public static float[] ShopOdds(int round) => round switch
        {
            <= 2 => new[] { 1f, 0f, 0f },
            <= 4 => new[] { 0.75f, 0.25f, 0f },
            <= 6 => new[] { 0.55f, 0.35f, 0.10f },
            _ => new[] { 0.40f, 0.40f, 0.20f },
        };
    }
}
