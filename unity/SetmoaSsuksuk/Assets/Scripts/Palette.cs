using UnityEngine;

namespace Ssuksuk
{
    /// <summary>
    /// The art bible, and the one place colours come from.
    /// Style: a storybook folk diorama, with round primitive spirits on a lacquered wooden game board.
    /// Mood: warm late-afternoon sun from the left over a mossy yard, with cool plum shadows.
    /// Every material, light, particle and UI colour in the game reads from here.
    /// </summary>
    public static class Palette
    {
        static Color Hex(string h) { ColorUtility.TryParseHtmlString(h, out var c); return c; }

        // The board and the ground round it.
        public static readonly Color TileLight = Hex("#E9DCC0");   // hanji paper squares
        public static readonly Color TileDark = Hex("#D3C29C");    // the checker's other half
        public static readonly Color Lacquer = Hex("#7A4B2E");     // the board frame and the bench
        public static readonly Color LacquerDeep = Hex("#3A2418"); // panels, outlines, dark text
        public static readonly Color Moss = Hex("#6E8B5A");        // the yard the board sits in
        public static readonly Color MossDark = Hex("#4E6A44");    // stones and tufts

        // Sides.
        public static readonly Color Ally = Hex("#3E7CB1");        // indigo: our pieces' rings and bars
        public static readonly Color Enemy = Hex("#C2452D");       // vermilion: theirs
        public static readonly Color Hp = Hex("#5DB36A");          // health that is ours
        public static readonly Color Mana = Hex("#5B8FD6");        // the mana bar
        public static readonly Color Shield = Hex("#D9E6F2");      // the shield on top of health

        // Light and accent.
        public static readonly Color Shadow = Hex("#3B3550");      // cool plum: eyes, dark accents, ambient ground
        public static readonly Color Accent = Hex("#F2B134");      // brass: gold, stars, the selected glow
        public static readonly Color Sun = Hex("#FFE8C8");         // the warm key light
        public static readonly Color SkyTop = Hex("#9DC0D6");
        public static readonly Color SkyHorizon = Hex("#F3E3C3");
        public static readonly Color AmbientSky = Hex("#B5CCE0");
        public static readonly Color AmbientEquator = Hex("#C9B79A");
        public static readonly Color AmbientGround = Hex("#5A4636");

        // UI.
        public static readonly Color Paper = Hex("#FBF3E2");       // light text on dark panels
        public static readonly Color Panel = new Color(0.227f, 0.141f, 0.094f, 0.92f); // LacquerDeep, nearly opaque
        public static readonly Color Scrim = new Color(0.227f, 0.141f, 0.094f, 0.72f);
        public static readonly Color Card = Hex("#F4E9D2");
        public static readonly Color Muted = Hex("#B9A88A");
        public static readonly Color Good = Hex("#5DB36A");
        public static readonly Color Bad = Hex("#C2452D");

        /// <summary>The same colour with a different alpha.</summary>
        public static Color A(Color c, float a) { c.a = a; return c; }
        public static Color Parse(string hex) => Hex(hex);
    }
}
