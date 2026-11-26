#if UNITY_EDITOR
using Unity.Cinemachine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Ssuksuk.EditorTools
{
    /// <summary>
    /// Builds the game scene from the art bible: the key light and ambient, the sky, the global
    /// post-processing Volume, the Cinemachine camera, and the game root with its components.
    /// Safe to run again: it finds what it made before by name.
    /// Menu: 셋모아 쑥쑥 / 장면 다시 만들기.
    /// </summary>
    public static class SceneSetup
    {
        const string ScenePath = "Assets/Scenes/Game.unity";
        const string MatDir = "Assets/Materials";

        [MenuItem("셋모아 쑥쑥/장면 다시 만들기")]
        public static string Build()
        {
            if (!AssetDatabase.IsValidFolder(MatDir)) AssetDatabase.CreateFolder("Assets", "Materials");
            var scene = EditorSceneManager.GetActiveScene();
            if (scene.path != ScenePath)
            {
                if (System.IO.File.Exists(ScenePath)) scene = EditorSceneManager.OpenScene(ScenePath);
                else
                {
                    scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                    EditorSceneManager.SaveScene(scene, ScenePath);
                }
            }

            // ---- base materials (assets, so their URP shaders ship in the build)
            var pipe = GraphicsSettings.currentRenderPipeline;
            var lit = MakeMat("Lit Base", pipe.defaultMaterial.shader, null);
            var unlit = MakeMat("Unlit Base", Shader.Find("Universal Render Pipeline/Unlit"), null);
            var particle = MakeMat("Particle Base", Shader.Find("Sprites/Default"), null);
            var sky = MakeMat("Sky", Shader.Find("Skybox/Procedural"), m =>
            {
                m.SetColor("_SkyTint", Palette.SkyTop);
                m.SetColor("_GroundColor", Palette.MossDark);
                m.SetFloat("_AtmosphereThickness", 0.75f);
                m.SetFloat("_Exposure", 1.15f);
                m.SetFloat("_SunSize", 0.03f);
            });

            // ---- light: warm key from the left, elevation 38 degrees, soft shadows
            var light = Find<Light>("Sun") ?? new GameObject("Sun").AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = Palette.Sun;
            light.intensity = 1.2f;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.85f;
            light.transform.rotation = Quaternion.Euler(38f, 62f, 0f);
            RenderSettings.sun = light;
            RenderSettings.skybox = sky;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Palette.AmbientSky;
            RenderSettings.ambientEquatorColor = Palette.AmbientEquator;
            RenderSettings.ambientGroundColor = Palette.AmbientGround;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = Color.Lerp(Palette.SkyHorizon, Palette.AmbientSky, 0.35f);
            RenderSettings.fogStartDistance = 26f;
            RenderSettings.fogEndDistance = 70f;

            // ---- camera with the Cinemachine brain and post-processing on
            var cam = Find<Camera>("Main Camera") ?? new GameObject("Main Camera").AddComponent<Camera>();
            cam.tag = "MainCamera";
            cam.orthographic = false;
            cam.fieldOfView = 42f;
            cam.nearClipPlane = 0.3f;
            cam.farClipPlane = 120f;
            cam.clearFlags = CameraClearFlags.Skybox;
            var camData = cam.GetUniversalAdditionalCameraData();
            camData.renderPostProcessing = true;
            camData.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
            if (!cam.GetComponent<AudioListener>()) cam.gameObject.AddComponent<AudioListener>();
            if (!cam.GetComponent<CinemachineBrain>()) cam.gameObject.AddComponent<CinemachineBrain>();

            var vcamGo = GameObject.Find("CM Board") ?? new GameObject("CM Board");
            var vcam = vcamGo.GetComponent<CinemachineCamera>() ?? vcamGo.AddComponent<CinemachineCamera>();
            var lens = vcam.Lens; lens.FieldOfView = 42f; lens.FarClipPlane = 120f; vcam.Lens = lens;
            if (!vcamGo.GetComponent<CinemachineImpulseListener>()) vcamGo.AddComponent<CinemachineImpulseListener>();
            var rig = vcamGo.GetComponent<CamRig>() ?? vcamGo.AddComponent<CamRig>();
            vcamGo.transform.SetPositionAndRotation(rig.playPos, Quaternion.LookRotation(rig.playLook - rig.playPos));

            // ---- global Volume: ACES, gentle bloom on the glowing accents, vignette, a little colour
            var volGo = GameObject.Find("Global Volume") ?? new GameObject("Global Volume");
            var vol = volGo.GetComponent<Volume>() ?? volGo.AddComponent<Volume>();
            vol.isGlobal = true;
            var profPath = "Assets/Settings/GameVolume.asset";
            var prof = AssetDatabase.LoadAssetAtPath<VolumeProfile>(profPath);
            if (prof == null) { prof = ScriptableObject.CreateInstance<VolumeProfile>(); AssetDatabase.CreateAsset(prof, profPath); }
            Over<Tonemapping>(prof, t => { t.mode.Override(TonemappingMode.ACES); });
            Over<Bloom>(prof, b => { b.intensity.Override(0.35f); b.threshold.Override(1.1f); b.scatter.Override(0.6f); b.tint.Override(Palette.Sun); });
            Over<Vignette>(prof, v => { v.intensity.Override(0.24f); v.color.Override(Palette.Shadow); v.smoothness.Override(0.45f); });
            Over<ColorAdjustments>(prof, c => { c.saturation.Override(8f); c.contrast.Override(5f); c.postExposure.Override(0.15f); });
            Over<WhiteBalance>(prof, w => { w.temperature.Override(10f); });
            EditorUtility.SetDirty(prof);
            vol.sharedProfile = prof;

            // ---- HDR on the URP asset so bloom's threshold above 1 can fire; shadows sized to the board
            if (pipe is UniversalRenderPipelineAsset urp)
            {
                urp.supportsHDR = true;
                urp.shadowDistance = 45f;
                EditorUtility.SetDirty(urp);
            }

            // ---- the game root
            var rootGo = GameObject.Find("Game") ?? new GameObject("Game");
            var mats = rootGo.GetComponent<Mats>() ?? rootGo.AddComponent<Mats>();
            mats.lit = lit; mats.unlit = unlit; mats.particle = particle;
            var sfx = rootGo.GetComponent<Sfx>() ?? rootGo.AddComponent<Sfx>();
            var fx = rootGo.GetComponent<Fx>() ?? rootGo.AddComponent<Fx>();
            var boardGo = GameObject.Find("Board") ?? new GameObject("Board");
            boardGo.transform.SetParent(rootGo.transform, false);
            var board = boardGo.GetComponent<Board>() ?? boardGo.AddComponent<Board>();
            var loop = rootGo.GetComponent<GameLoop>() ?? rootGo.AddComponent<GameLoop>();
            loop.board = board;
            loop.impulse = rootGo.GetComponent<CinemachineImpulseSource>() ?? rootGo.AddComponent<CinemachineImpulseSource>();
            var hud = rootGo.GetComponent<Hud>() ?? rootGo.AddComponent<Hud>();
            hud.loop = loop;
            var live = rootGo.GetComponent<LiveFloor>() ?? rootGo.AddComponent<LiveFloor>();
            live.loop = loop;
            rig.loop = loop;
            // Component order matters for Awake: materials first, then sound and effects.
            EditorUtility.SetDirty(rootGo);
            EditorUtility.SetDirty(vcamGo);

            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            return "ok " + ScenePath;
        }

        static T Find<T>(string name) where T : Component
        {
            var g = GameObject.Find(name);
            return g != null ? g.GetComponent<T>() : null;
        }

        static Material MakeMat(string name, Shader shader, System.Action<Material> init)
        {
            string path = $"{MatDir}/{name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                if (shader == null) throw new System.Exception("Shader missing for " + name);
                m = new Material(shader);
                AssetDatabase.CreateAsset(m, path);
            }
            init?.Invoke(m);
            EditorUtility.SetDirty(m);
            return m;
        }

        static void Over<T>(VolumeProfile p, System.Action<T> set) where T : VolumeComponent
        {
            if (!p.TryGet<T>(out var c)) { c = p.Add<T>(true); AssetDatabase.AddObjectToAsset(c, p); }
            c.active = true;
            set(c);
            EditorUtility.SetDirty(c);
        }
    }
}
#endif
