using UnityEngine.UIElements;

namespace NaeDosi.Ui
{
    /// <summary>Live visiting by code between Unity copies (filled in in phase 3).</summary>
    public static class Visit
    {
        public static string SectionHtml(bool mine) => "";
        public static void Act(string act, VisualElement e, CityUi ui) { }
        public static void Stop() { }
        public static void Tick(World w, CityUi ui) { }
    }
}
