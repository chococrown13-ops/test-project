using TMPro;
using UnityEngine;

namespace Ssuksuk
{
    /// <summary>
    /// The two Korean faces (both SIL Open Font License, in Resources/Fonts): 검은고딕 for titles and
    /// numbers, 고운돋움 for everything else. TextMeshPro builds their glyphs as they are first needed.
    /// </summary>
    public static class Fonts
    {
        static TMP_FontAsset title, body;

        public static TMP_FontAsset Title => title ??= Make("Fonts/BlackHanSans-Regular");
        public static TMP_FontAsset Body => body ??= Make("Fonts/GowunDodum-Regular");

        static TMP_FontAsset Make(string path)
        {
            var f = Resources.Load<Font>(path);
            if (f == null) { Debug.LogError("Missing font " + path); return null; }
            var a = TMP_FontAsset.CreateFontAsset(f, 72, 6, UnityEngine.TextCore.LowLevel.GlyphRenderMode.SDFAA, 2048, 2048, AtlasPopulationMode.Dynamic, true);
            a.name = f.name + " SDF";
            return a;
        }

        /// <summary>A font asset's outline and face set once on its shared material: a dark lacquer outline so light text reads on the board.</summary>
        public static Material Outlined(TMP_FontAsset a, Color outline, float width)
        {
            var m = new Material(a.material);
            m.SetColor(ShaderUtilities.ID_OutlineColor, outline);
            m.SetFloat(ShaderUtilities.ID_OutlineWidth, width);
            m.EnableKeyword(ShaderUtilities.Keyword_Outline);
            return m;
        }
    }
}
