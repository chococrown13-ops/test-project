using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using static NaeDosi.Defs;

namespace NaeDosi.Render
{
    /// <summary>
    /// Puts the city on screen: loads a city, builds the layers, runs the simulation and lights the scene by the
    /// real sun over Seoul for the game's date and hour (port of render/scene.ts).
    /// </summary>
    public sealed class CityGame : MonoBehaviour
    {
        public static CityGame I;
        public Sim sim;
        public CityCam view;
        public GroundView ground;
        public RoadView roads;
        public BuildingView buildings;
        public VehicleView vehicles;
        public PeopleView people;
        public StreetView streets;
        public TransitView transit;
        public EffectsView effects;
        public BadgeView badges;
        public FreeRoads free;
        Shader ghost;
        float iconTimer, stallTimer;
        public bool dayLock;
        /// <summary>그림체: 0 로우폴리, 1 툰. 미니어처: the tilt-shift blur.</summary>
        public int artStyle;
        bool realMeshes; GroundView realFor;
        public bool tiltShift;
        Instances clouds;
        readonly List<(float x, float z, float y, float s, float r)> cloudSeeds = new List<(float, float, float, float, float)>();
        Texture2D waterMap;
        public static float envGain = 1f, reflGain = 1f, upGain = 3.0f;
        Cubemap reflCube; float lastEnv = -1;
        /// <summary>Game speed: 0 paused, 1, 2, 3.</summary>
        public double speed = 1;
        Light sun;
        Material skyMat;
        GameObject sky;
        Volume volume;
        Bloom bloom;
        Shader shader;
        Texture2D roadSnow;
        string paintVer = "", busKey = "";
        HashSet<int> busCells = new HashSet<int>();
        float snow, paintTimer;
        Transform world;

        static readonly int NIGHT = Shader.PropertyToID("_Night"), SNOW = Shader.PropertyToID("_Snow"), TIME0 = Shader.PropertyToID("_Time0"), MAPSIZE = Shader.PropertyToID("_MapSize"), ROADSNOW = Shader.PropertyToID("_RoadSnow");

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (FindAnyObjectByType<CityGame>() != null) return;
            new GameObject("City").AddComponent<CityGame>();
        }

        void Awake()
        {
            I = this;
            Application.targetFrameRate = 60;
            shader = Shader.Find("NaeDosi/City");
            ghost = Shader.Find("NaeDosi/Ghost");
            foreach (var c in FindObjectsByType<Camera>(FindObjectsSortMode.None)) if (c.gameObject != gameObject) Destroy(c.gameObject);
            foreach (var l in FindObjectsByType<Light>(FindObjectsSortMode.None)) Destroy(l.gameObject);
            foreach (var v in FindObjectsByType<Volume>(FindObjectsSortMode.None)) Destroy(v.gameObject);

            var camGo = new GameObject("Camera");
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.8f, 0.89f, 0.94f);
            var cd = cam.GetUniversalAdditionalCameraData();
            cd.renderPostProcessing = true;
            cd.antialiasing = AntialiasingMode.None;
            camGo.tag = "MainCamera";
            camGo.AddComponent<AudioListener>();
            view = new CityCam(cam);

            var sunGo = new GameObject("Sun");
            sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.shadows = LightShadows.Soft;
            sun.shadowBias = 0.05f; sun.shadowNormalBias = 0.4f;

            skyMat = new Material(Shader.Find("NaeDosi/Sky"));
            sky = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            sky.name = "Sky";
            Destroy(sky.GetComponent<Collider>());
            sky.transform.localScale = Vector3.one * 10000;
            var sr = sky.GetComponent<MeshRenderer>();
            sr.sharedMaterial = skyMat; sr.shadowCastingMode = ShadowCastingMode.Off; sr.receiveShadows = false;

            // Post: the web's tone mapping, ink lines and grade run in the Post shader (a renderer feature);
            // URP's own post only adds bloom at night.
            var vg = new GameObject("Post");
            volume = vg.AddComponent<Volume>();
            volume.isGlobal = true;
            var prof = ScriptableObject.CreateInstance<VolumeProfile>();
            var tm = prof.Add<Tonemapping>(true); tm.mode.Override(TonemappingMode.None);
            bloom = prof.Add<Bloom>(true); bloom.threshold.Override(0.9f); bloom.intensity.Override(0f); bloom.scatter.Override(0.5f);
            volume.profile = prof;

            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            reflCube = new Cubemap(16, TextureFormat.RGBAHalf, true);
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
            RenderSettings.customReflectionTexture = reflCube;
            RenderSettings.reflectionIntensity = 1;

            roadSnow = new Texture2D(N, N, TextureFormat.R8, false, true) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            Shader.SetGlobalTexture(ROADSNOW, roadSnow);
            Shader.SetGlobalFloat(MAPSIZE, N * CELL);

            world = new GameObject("World").transform;
            dayLock = PlayerPrefs.GetInt("city.daylock", 0) == 1;
            artStyle = PlayerPrefs.GetInt("city.style", 0);
            tiltShift = PlayerPrefs.GetInt("city.tilt", 0) == 1;
            MakeClouds();
            quality = PlayerPrefs.GetInt("city.quality", 1) == 1;
            SetWorld(WorldOps.createWorld());
            SetQuality(quality);
        }

        /// <summary>Swap in a different city (new game or load).</summary>
        public void SetWorld(World w, bool keepCamera = false)
        {
            foreach (Transform t in world) Destroy(t.gameObject);
            sim = SimLoop.createSim(w);
            ground = new GroundView(w, world, shader);
            roads = new RoadView(world, shader, ground.tex);
            buildings = new BuildingView(world, shader) { heightAt = (x, z) => ground.HeightAt(x, z) };
            buildings.onBorn = b => { if (KINDS[b.kind].zone != 0) Sfx.Play("grow"); };
            vehicles ??= new VehicleView(shader);
            free ??= new FreeRoads(shader, (x, z) => ground.HeightAt(x, z), vehicles.CarMesh, vehicles.Mat);
            people ??= new PeopleView(shader);
            streets = new StreetView(world, shader, ghost);
            transit = new TransitView(world, shader, ghost);
            effects ??= new EffectsView(ghost, shader);
            effects.heightAt = (x, z) => ground.HeightAt(x, z);
            badges ??= new BadgeView(Shader.Find("NaeDosi/Badge"));
            iconTimer = 0; stallTimer = 0;
            paintVer = ""; busKey = "";
            ground.overlay = overlay;
            WaterMap(w);
        }

        /// <summary>A transit line is being drawn: buildings sink flat so the streets show.</summary>
        public bool transitDraft;
        public string overlay = "none";
        public bool quality = true;
        public void SetOverlay(string o) { overlay = o; ground.overlay = o; roads.trafficOverlay = o == "traffic"; paintVer = ""; }
        public void ForceRepaint() { paintVer = ""; }
        /// <summary>High: sharp shadows and multisampling; normal: lighter for phones.</summary>
        public void SetQuality(bool high)
        {
            quality = high;
            var a = UniversalRenderPipeline.asset;
            if (a != null) { a.msaaSampleCount = high ? 4 : 1; a.renderScale = high ? 1f : 0.8f; }
            QualitySettings.shadows = UnityEngine.ShadowQuality.All;
            sun.shadowResolution = high ? UnityEngine.Rendering.LightShadowResolution.High : UnityEngine.Rendering.LightShadowResolution.Medium;
        }

        static float Smooth(float a, float b, float x) { float t = Mathf.Clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
        static Color Lerp(Color a, Color b, float t) => new Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);

        float night;

        /// <summary>Daylight from the real sun over Seoul (37.5°N) on the game's date.</summary>
        void Lighting(double clock, int gameDay)
        {
            double doy = (((gameDay + 59) % 360) * 365) / 360.0;
            double decl = 23.44 * Math.PI / 180 * Math.Sin(2 * Math.PI * (284 + doy) / 365);
            double lat = 37.5 * Math.PI / 180, H = (clock - 12.5) * 15 * Math.PI / 180;
            double sinEl = Math.Sin(lat) * Math.Sin(decl) + Math.Cos(lat) * Math.Cos(decl) * Math.Cos(H);
            float elDeg = (float)(Math.Asin(sinEl) * 180 / Math.PI);
            double azm = Math.Atan2(Math.Sin(H), Math.Cos(H) * Math.Sin(lat) - Math.Tan(decl) * Math.Cos(lat)) + Math.PI;
            float day = Smooth(-3, 8, elDeg);
            night = 1 - Smooth(-5, 5, elDeg);
            float dusk = Mathf.Max(0, 1 - Mathf.Abs(elDeg - 3) / 9) * (day > 0.02f ? 1 : 0.4f);
            double el = day > 0.01 ? Math.Max(0.12, sinEl) : 0.8;
            double ce = Math.Sqrt(1 - el * el);
            double dx = day > 0.01 ? Math.Sin(azm) * ce : 0.3, dz = day > 0.01 ? -Math.Cos(azm) * ce : 0.4;
            // Towards the sun, in Unity space (web z mirrored).
            var toSun = new Vector3((float)dx, (float)el, (float)-dz).normalized;
            sun.transform.rotation = Quaternion.LookRotation(-toSun);
            // three.js lights divide by π in the BRDF; Unity's don't.
            sun.intensity = (0.22f + day * 2.4f) / Mathf.PI * (artStyle == 2 ? 1.2f : 1f);
            Color sc = day < 0.1f ? new Color(0.6f, 0.7f, 1f) : new Color(1, 0.9f - dusk * 0.18f, 0.77f - dusk * 0.32f);
            sun.color = sc.gamma;
            // Hemisphere light plus the web's soft studio environment (RoomEnvironment, bright from above).
            float hemi = (0.22f + day * 0.6f) / Mathf.PI, env = (0.12f + day * 0.4f) * envGain;
            Color skyC = MeshKit.Lin("#dbe8f2"), gnd = MeshKit.Lin("#8a7a58"), envC = MeshKit.Lin("#f4f1ec");
            RenderSettings.ambientSkyColor = (skyC * hemi + envC * env * upGain).gamma;
            RenderSettings.ambientEquatorColor = (Lerp(skyC, gnd, 0.5f) * hemi + envC * env).gamma;
            RenderSettings.ambientGroundColor = (gnd * hemi + envC * env * 0.6f).gamma;
            // The same studio environment in reflections: glass, car paint and a soft sheen on everything.
            if (Mathf.Abs(env - lastEnv) > 0.002f)
            {
                lastEnv = env;
                for (int f = 0; f < 6; f++)
                {
                    float k = f == 2 ? 1.3f : f == 3 ? 0.5f : 0.9f;
                    var px = new Color[16 * 16];
                    for (int i = 0; i < px.Length; i++) px[i] = envC * env * k * reflGain;
                    reflCube.SetPixels(px, (CubemapFace)f);
                }
                reflCube.Apply(true);
            }
            Color top = Lerp(Lerp(MeshKit.Lin("#071022"), MeshKit.Lin("#3f84cc"), day), MeshKit.Lin("#5d5f9c"), Mathf.Min(0.6f, dusk * 0.7f));
            Color hor = Lerp(Lerp(MeshKit.Lin("#16223a"), MeshKit.Lin("#cde3ef"), day), MeshKit.Lin("#f2a874"), Mathf.Min(0.75f, dusk * 0.85f));
            Color sunC = Lerp(MeshKit.Lin("#fff1d6"), MeshKit.Lin("#ffb070"), Mathf.Min(1, dusk));
            skyMat.SetVector("_SkyTop", (Vector4)top); skyMat.SetVector("_SkyHorizon", (Vector4)hor);
            skyMat.SetVector("_SunDir", toSun); skyMat.SetVector("_SunColor", (Vector4)sunC); skyMat.SetFloat("_Night", night);
            RenderSettings.fogColor = hor.gamma;
            RenderSettings.fogStartDistance = (float)(view.dist * 1.25);
            RenderSettings.fogEndDistance = (float)(view.dist * 4.2 + 650);
            bloom.intensity.Override(night * 0.45f * 2f);
            Shader.SetGlobalFloat(NIGHT, night);
            Shader.SetGlobalVector("_Fade", new Vector4((float)(view.dist * 1.1), (float)(view.dist * 3.6), 0, 0));
            Shader.SetGlobalFloat("_InkStrength", artStyle == 2 ? 0.12f : (artStyle == 1 ? 0.9f : 0.55f) - night * 0.2f);
            Shader.SetGlobalFloat("_Real", artStyle == 2 ? 1 : 0);
            bool real = artStyle == 2;
            if (real != realMeshes || ground != realFor) { realMeshes = real; realFor = ground; ground?.SetReal(real); roads?.SetReal(real); vehicles?.SetReal(real); people?.SetReal(real); } BuildingView.Real = real;
            Shader.SetGlobalFloat("_ArtStyle", artStyle);
            Shader.SetGlobalFloat("_TiltShift", tiltShift ? 1 : 0);
            Shader.SetGlobalFloat("_TiltFocus", 0.47f);
            Shader.SetGlobalVector("_SkyTopC", (Vector4)top); Shader.SetGlobalVector("_SkyHorizonC", (Vector4)hor);
            if (UniversalRenderPipeline.asset != null) UniversalRenderPipeline.asset.shadowDistance = (float)Math.Min(1600, Math.Max(300, view.dist * 2.6));
        }

        void Update()
        {
            float dt = Mathf.Min(0.1f, Time.deltaTime);
            SimLoop.tick(sim, dt, speed);
            var w = sim.w;
            view.Update(dt);
            sky.transform.position = view.cam.transform.position;
            Shader.SetGlobalFloat(TIME0, Time.time);
            Lighting(dayLock ? 14 : sim.clock, w.day);

            string bk = $"{w.ver.transit}:{w.ver.roads}:{w.lines.Count}";
            if (bk != busKey)
            {
                busKey = bk;
                busCells = new HashSet<int>();
                foreach (var l in w.lines) if (l.kind == "bus") { var route = Transit.busRoute(w, l.stops, l.id); if (route != null) foreach (int n in route) if (n < Graph.NN) busCells.Add(n); }
            }
            int month = SimLoop.calendarMonth(w.day);
            roads.Update(w, bk, busCells, month, night);
            ground.Shape(w);
            ground.month = month;
            float want = month == 12 ? 0.45f : month == 1 ? 0.9f : month == 2 ? 0.6f : 0;
            snow += (want - snow) * Mathf.Min(1, dt * 0.8f);
            Shader.SetGlobalFloat(SNOW, snow);
            buildings.Update(w, night);
            // Laying out a line (or looking at the transit map): buildings sink flat.
            float want2 = transitDraft || overlay == "transit" ? 0.04f : 1f;
            var bs = buildings.root.transform.localScale;
            if (Mathf.Abs(bs.y - want2) > 0.001f) buildings.root.transform.localScale = new Vector3(1, bs.y + (want2 - bs.y) * Mathf.Min(1, dt * 8), 1);
            string ver = $"{w.ver.roads}:{w.ver.zones}:{w.ver.buildings}:{month}";
            paintTimer -= dt;
            if (ver != paintVer || (overlay != "none" && paintTimer <= 0))
            {
                paintTimer = 0.5f;
                paintVer = ver;
                ground.Paint(w);
                ground.PlantTrees(w);
            }
            // Snow lying on the roads (row 0 is the map's north edge, as the shader reads it).
            var px = roadSnow.GetPixelData<byte>(0);
            bool any = false;
            for (int i = 0; i < N * N; i++) { byte v = (byte)Math.Min(255, w.snow[i] * 2.55); if (px[i] != v) { px[i] = v; any = true; } }
            if (any) roadSnow.Apply(false);

            double pace = speed * SimLoop.GAME_PACE;
            Synth.Night(night);
            vehicles.Update(w, sim.tr);
            streets.Update(w, sim.tr.clock, view.dist);
            people.Update(w, sim.tr, dt, pace, night, view.dist, vehicles.spots);
            var ui = NaeDosi.Ui.CityUi.I;
            transit.showRoutes = transitDraft || overlay == "transit";
            transit.Update(w, w.day * SimLoop.DAY_SECONDS + sim.acc, ui != null ? ui.draft : null, vehicles.busPoses);
            effects.Update(w, dt, view.tx, view.tz, night);
            iconTimer -= dt;
            if (iconTimer <= 0)
            {
                iconTimer = 0.5f;
                badges.UpdateIcons(w, overlay == "power" || overlay == "water", overlay == "parking");
                badges.UpdateJams(w);
                if ((stallTimer -= 0.5f) <= 0) { stallTimer = 3; badges.UpdateStalls(w); }
            }
            badges.hidden = transitDraft || overlay == "transit";
            ground.Draw();
            roads.Draw();
            vehicles.Draw();
            if (free != null) { free.Update(Time.deltaTime); free.Draw(); }
            people.Draw();
            streets.Draw();
            transit.Draw();
            effects.Draw();
            badges.Draw();
            if (quality) { UpdateClouds(); clouds.Draw(); }
        }

        /// <summary>
        /// Clouds that only cast shadows (render/atmosphere.ts): seen from above a city they read as boulders, so only
        /// their shade drifts across the town.
        /// </summary>
        void MakeClouds()
        {
            var sh = new MeshKit.Shape();
            foreach (var (x, y, z, r) in new[] { (0f, 0f, 0f, 22f), (20f, -3f, 4f, 16f), (-18f, -4f, -3f, 15f), (6f, 6f, -8f, 13f), (-6f, 3f, 10f, 12f) })
                sh.Ico(r, new Vector3(x, y, -z), Color.white, new Vector3(1, 0.55f, 1));
            var m = new Material(shader) { enableInstancing = true }; m.SetFloat("_Mode", 1);
            clouds = new Instances(sh.ToMesh("cloud"), m) { shadowsOnly = true };
            long seed = 7;
            double rnd() { seed = seed * 16807 % 2147483647; return seed / 2147483647.0; }
            float S = N * CELL;
            for (int i = 0; i < 14; i++) cloudSeeds.Add(((float)(rnd() * S * 1.6 - S * 0.3), (float)(rnd() * S), (float)(210 + rnd() * 70), (float)(0.8 + rnd() * 1.1), (float)(rnd() * 6.28)));
        }

        void UpdateClouds()
        {
            float S = N * CELL, span = S * 1.8f, t = Time.time;
            var mats = new List<Matrix4x4>();
            foreach (var c in cloudSeeds)
            {
                float x = ((c.x + t * 6) % span + span) % span - S * 0.4f;
                mats.Add(Matrix4x4.TRS(MeshKit.P(x, c.y, c.z), Quaternion.Euler(0, -c.r * Mathf.Rad2Deg, 0), Vector3.one * c.s));
            }
            clouds.Set(mats, null);
        }

        /// <summary>How far each water cell is from the shore (in cells, up to 8): the water shader's depth and foam.</summary>
        void WaterMap(World w)
        {
            if (waterMap == null) { waterMap = new Texture2D(N, N, TextureFormat.R8, false, true) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp }; Shader.SetGlobalTexture("_WaterMap", waterMap); }
            var d = new int[N * N]; var q = new Queue<int>();
            for (int i = 0; i < N * N; i++) { if (w.ground[i] == Ground.Water) d[i] = 99; else { d[i] = 0; q.Enqueue(i); } }
            while (q.Count > 0)
            {
                int i = q.Dequeue(), x = i % N, y = i / N;
                foreach (var (dx, dy) in new[] { (1, 0), (-1, 0), (0, 1), (0, -1) })
                {
                    int nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
                    int j = ny * N + nx;
                    if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.Enqueue(j); }
                }
            }
            var px = waterMap.GetPixelData<byte>(0);
            for (int i = 0; i < N * N; i++) px[i] = (byte)(Math.Min(8, d[i]) * 255 / 8);
            waterMap.Apply(false);
        }

        /// <summary>Put the camera straight on a view (for comparison shots).</summary>
        public static void Shot(double x, double z, double dist, double yaw, double pitch) { I.view.Jump(x, z, dist, yaw, pitch); I.dayLock = true; }
    }
}
