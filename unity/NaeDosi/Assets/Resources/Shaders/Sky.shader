// A gradient sky with a sun glow and, at night, stars (port of render/atmosphere.ts). Drawn on a big sphere round the camera.
Shader "NaeDosi/Sky"
{
    Properties { }
    SubShader
    {
        Tags { "RenderType"="Background" "RenderPipeline"="UniversalPipeline" "Queue"="Background" "PreviewType"="Skybox" }
        Pass
        {
            Cull Front ZWrite Off ZTest LEqual
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            float3 _SkyTop, _SkyHorizon, _SunDir, _SunColor; float _Night, _Real, _Time0;
            struct A { float4 pos : POSITION; };
            struct V { float4 cs : SV_POSITION; float3 dir : TEXCOORD0; };
            V vert(A i)
            {
                V o;
                float3 ws = TransformObjectToWorld(i.pos.xyz);
                o.cs = TransformWorldToHClip(ws);
                #if UNITY_REVERSED_Z
                    o.cs.z = 0.000001 * o.cs.w;
                #else
                    o.cs.z = o.cs.w * 0.999999;
                #endif
                o.dir = ws - GetCameraPositionWS();
                return o;
            }
            float h31(float3 p) { return frac(sin(dot(p, float3(127.1, 311.7, 74.7))) * 43758.5453); }
            float h21(float2 p) { return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
            float vn(float2 p) { float2 i = floor(p), f = frac(p); f = f * f * (3.0 - 2.0 * f);
                return lerp(lerp(h21(i), h21(i + float2(1, 0)), f.x), lerp(h21(i + float2(0, 1)), h21(i + float2(1, 1)), f.x), f.y); }
            float fbm(float2 p) { float a = 0.5, s = 0; for (int k = 0; k < 5; k++) { s += vn(p) * a; p = p * 2.03 + 7.1; a *= 0.5; } return s / 0.97; }
            half4 frag(V i) : SV_Target
            {
                float3 d = normalize(i.dir);
                // Stars use the web's direction grid: its z runs the other way.
                float3 dw = float3(d.x, d.y, -d.z);
                float h = d.y;
                float3 c = lerp(_SkyHorizon, _SkyTop, pow(saturate(h), 0.55));
                if (h < 0.0) c = _SkyHorizon * 0.92;
                float s = max(dot(d, normalize(_SunDir)), 0.0);
                c += _SunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.28) * (1.0 - _Night);
                if (_Real > 0.5 && h > 0.0)
                {
                    // 실사: a deeper zenith, a pale band at the horizon, and drifting fair-weather clouds on a far flat layer.
                    c = lerp(c, c * float3(0.82, 0.9, 1.08), saturate(h * 1.5));
                    c = lerp(c, lerp(c, float3(0.86, 0.9, 0.94), 0.45), pow(1.0 - h, 6.0));
                    float2 uv = dw.xz / (h + 0.06) * 1.6 + float2(_Time0 * 0.004, _Time0 * 0.0015);
                    float n = fbm(uv);
                    float cover = smoothstep(0.52, 0.78, n) * smoothstep(0.0, 0.12, h);
                    float lit = 0.75 + 0.25 * saturate((n - fbm(uv + normalize(_SunDir).xz * 0.06)) * 6.0 + 0.5);
                    float3 cloud = lerp(float3(0.72, 0.75, 0.8), float3(1.0, 0.98, 0.95), lit) * lerp(1.0, 0.25, _Night);
                    cloud += _SunColor * pow(s, 8.0) * 0.35 * (1.0 - _Night);
                    c = lerp(c, cloud, cover * 0.92);
                }
                float3 g = floor(dw * 420.0);
                float st = step(0.9975, h31(g)) * smoothstep(0.05, 0.3, h) * _Night;
                c += st * (0.6 + 0.4 * h31(g + 3.1));
                return half4(c, 1);
            }
            ENDHLSL
        }
    }
}
