using System.Collections;
using UnityEngine;

namespace Ssuksuk
{
    /// <summary>Three easing curves and a coroutine tween. Tweens run on unscaled time unless told otherwise, so menus keep moving while paused.</summary>
    public static class Ease
    {
        public static float OutCubic(float t) { t = 1f - t; return 1f - t * t * t; }

        public static float OutBack(float t)
        {
            const float c1 = 1.70158f, c3 = c1 + 1f;
            float u = t - 1f;
            return 1f + c3 * u * u * u + c1 * u * u;
        }

        public static float OutElastic(float t)
        {
            if (t <= 0f) return 0f;
            if (t >= 1f) return 1f;
            const float c4 = 2f * Mathf.PI / 3f;
            return Mathf.Pow(2f, -10f * t) * Mathf.Sin((t * 10f - 0.75f) * c4) + 1f;
        }

        public static IEnumerator Tween(float duration, System.Action<float> apply, System.Func<float, float> ease, bool unscaled = true)
        {
            for (float t = 0f; t < 1f; t += (unscaled ? Time.unscaledDeltaTime : Time.deltaTime) / duration)
            {
                apply(ease(t));
                yield return null;
            }
            apply(1f);
        }
    }
}
