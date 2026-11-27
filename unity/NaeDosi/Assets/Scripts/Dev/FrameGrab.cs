#if UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using UnityEngine;

/// <summary>Editor-only: records a camera path as numbered JPEG frames at a fixed 30 fps (for the short play video).</summary>
public sealed class FrameGrab : MonoBehaviour
{
    public string dir;
    public int frames;
    public Action<int> step;
    public bool done;

    public static FrameGrab Run(string dir, int frames, Action<int> step)
    {
        Directory.CreateDirectory(dir);
        var g = new GameObject("FrameGrab").AddComponent<FrameGrab>();
        g.dir = dir; g.frames = frames; g.step = step;
        return g;
    }

    IEnumerator Start()
    {
        Time.captureFramerate = 30;
        for (int i = 0; i < frames; i++)
        {
            step?.Invoke(i);
            yield return new WaitForEndOfFrame();
            var t = ScreenCapture.CaptureScreenshotAsTexture();
            File.WriteAllBytes(Path.Combine(dir, $"f{i:0000}.jpg"), t.EncodeToJPG(90));
            Destroy(t);
        }
        Time.captureFramerate = 0;
        done = true;
    }
}
#endif
