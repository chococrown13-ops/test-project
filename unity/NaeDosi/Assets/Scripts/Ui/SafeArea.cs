#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace NaeDosi.Ui
{
    /// <summary>How far the phone's notch, rounded corners and home bar reach into the screen, in CSS pixels (all zero off the web).</summary>
    public static class SafeArea
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern float SafeInset(int side);
        public static float Top => SafeInset(0);
        public static float Right => SafeInset(1);
        public static float Bottom => SafeInset(2);
        public static float Left => SafeInset(3);
#else
        public static float Top => 0;
        public static float Right => 0;
        public static float Bottom => 0;
        public static float Left => 0;
#endif
    }
}
