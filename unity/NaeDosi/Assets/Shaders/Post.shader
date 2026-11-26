// The web game's whole picture finish in one full-screen pass, run before URP's own post (which then only adds night bloom):
//   1. render/stylize.ts (low-poly): soft ink lines where depth or surface direction changes, a touch more colour, warm tint, faint vignette
//   2. three.js ACESFilmicToneMapping (exposure 1) and the sRGB output
//   3. render/scene.ts grade: saturation 1.05, contrast 1.08 around mid-grey, warmer, darker corners (in sRGB values)
// The result is turned back to linear so URP's sRGB output writes the same pixels the browser shows.
Shader "NaeDosi/Post"
{
    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" }
        ZWrite Off ZTest Always Blend Off Cull Off
        Pass
        {
            Name "Finish"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareNormalsTexture.hlsl"

            float2 _Fade; float _InkStrength; float _Night;

            float lin(float2 uv) { return LinearEyeDepth(SampleSceneDepth(uv), _ZBufferParams); }
            float3 nrm(float2 uv) { return SampleSceneNormals(uv); }

            float3 RRTAndODTFit(float3 v)
            {
                float3 a = v * (v + 0.0245786) - 0.000090537;
                float3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
                return a / b;
            }
            float3 acesThree(float3 c)
            {
                c *= 1.0 / 0.6;
                c = float3(dot(c, float3(0.59719, 0.35458, 0.04823)), dot(c, float3(0.07600, 0.90834, 0.01566)), dot(c, float3(0.02840, 0.13383, 0.83777)));
                c = RRTAndODTFit(c);
                c = float3(dot(c, float3(1.60475, -0.53108, -0.07367)), dot(c, float3(-0.10208, 1.10813, -0.00605)), dot(c, float3(-0.00327, -0.07276, 1.07602)));
                return saturate(c);
            }
            float3 toSrgb(float3 c) { return lerp(c * 12.92, 1.055 * pow(max(c, 1e-6), 1.0 / 2.4) - 0.055, step(0.0031308, c)); }
            float3 toLin(float3 c) { return lerp(c / 12.92, pow((max(c, 0) + 0.055) / 1.055, 2.4), step(0.04045, c)); }

            half4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.texcoord;
                float3 col = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv).rgb;
                float raw = SampleSceneDepth(uv);
                #if UNITY_REVERSED_Z
                    bool sky = raw <= 0.000002;
                #else
                    bool sky = raw >= 0.999998;
                #endif
                if (!sky)
                {
                    float2 tx = _ScreenSize.zw;
                    float2 ox = float2(tx.x, 0), oy = float2(0, tx.y);
                    float d0 = lin(uv);
                    float dd = abs(lin(uv + ox) - d0) + abs(lin(uv - ox) - d0) + abs(lin(uv + oy) - d0) + abs(lin(uv - oy) - d0);
                    float depthEdge = smoothstep(0.012 * d0, 0.05 * d0, dd);
                    float3 n0 = nrm(uv);
                    float nd = (1.0 - dot(n0, nrm(uv + ox))) + (1.0 - dot(n0, nrm(uv - ox))) + (1.0 - dot(n0, nrm(uv + oy))) + (1.0 - dot(n0, nrm(uv - oy)));
                    float normalEdge = smoothstep(0.35, 0.9, nd);
                    float edge = max(depthEdge, normalEdge * 0.75);
                    float fade = 1.0 - smoothstep(_Fade.x, _Fade.y, d0);
                    float3 ink = col * float3(0.5, 0.44, 0.4);
                    col = lerp(col, ink, edge * fade * _InkStrength);
                }
                float lum = dot(col, float3(0.2126, 0.7152, 0.0722));
                col = lerp(lum.xxx, col, 1.08);
                col *= lerp(float3(1.035, 1.0, 0.955), float3(0.98, 0.99, 1.03), _Night);
                float2 c = uv - 0.5;
                col *= 1.0 - 0.12 * smoothstep(0.45, 0.95, length(c * float2(1.25, 1.0)));

                col = toSrgb(acesThree(max(col, 0)));
                float l = dot(col, float3(0.2126, 0.7152, 0.0722));
                col = lerp(l.xxx, col, 1.05);
                col = (col - 0.5) * 1.08 + 0.5;
                col *= float3(1.025, 1.0, 0.965);
                col *= 1.0 - 0.22 * smoothstep(0.35, 0.85, length(c * float2(1.25, 1.0)));
                return half4(toLin(saturate(col)), 1);
            }
            ENDHLSL
        }
    }
}
