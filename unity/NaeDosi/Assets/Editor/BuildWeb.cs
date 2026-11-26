using System.IO;
using UnityEditor;
using UnityEngine;

/// <summary>The browser build of 내 도시 더 크게: WebGL, gzip with a JS fallback (works on any static host), our page template.</summary>
public static class BuildWeb
{
    public const string OUT = "../../public/games/city";

    [MenuItem("NaeDosi/Build Web")]
    public static void Build()
    {
        PlayerSettings.companyName = "chococrown";
        PlayerSettings.productName = "내 도시 더 크게";
        PlayerSettings.runInBackground = true;
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
        PlayerSettings.WebGL.decompressionFallback = true;
        PlayerSettings.WebGL.template = "PROJECT:NaeDosi";
        PlayerSettings.WebGL.dataCaching = true;
        PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
        PlayerSettings.WebGL.memoryGrowthMode = WebGLMemoryGrowthMode.Geometric;
        PlayerSettings.WebGL.maximumMemorySize = 2048;
        PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.WebGL, ManagedStrippingLevel.Low);
        var outDir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", OUT));
        if (Directory.Exists(outDir)) Directory.Delete(outDir, true);
        var opts = new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/SampleScene.unity" },
            locationPathName = outDir,
            target = BuildTarget.WebGL,
            options = BuildOptions.None,
        };
        var r = BuildPipeline.BuildPlayer(opts);
        Debug.Log($"BUILD {r.summary.result} {r.summary.totalSize / 1e6:0.0} MB {r.summary.totalTime}");
        if (Application.isBatchMode) EditorApplication.Exit(r.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded ? 0 : 1);
    }
}
