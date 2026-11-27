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

            float2 _Fade; float4 _SkyHorizonC; float _InkStrength; float _Night; float _ArtStyle; float _TiltShift; float _TiltFocus;

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
                // 미니어처 (tilt-shift): the bands above and below the focus line blur, like a photo of a model town.
                if (_TiltShift > 0.5)
                {
                    float blur = smoothstep(0.12, 0.42, abs(uv.y - _TiltFocus)) * 7.0;
                    if (blur > 0.05)
                    {
                        static const float2 DISC[12] = { float2(-0.326, -0.406), float2(-0.840, -0.074), float2(-0.696, 0.457), float2(-0.203, 0.621), float2(0.962, -0.195), float2(0.473, -0.480), float2(0.519, 0.767), float2(0.185, -0.893), float2(0.507, 0.064), float2(0.896, 0.412), float2(-0.322, -0.933), float2(-0.792, -0.598) };
                        float3 acc = col;
                        for (int k = 0; k < 12; k++) acc += SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv + DISC[k] * blur * _ScreenSize.zw).rgb;
                        col = acc / 13.0;
                    }
                }
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
                    if (_ArtStyle > 1.5)
                    {
                        // 실사: air between the eye and far things turns them paler and bluer.
                        float haze = 1.0 - exp(-d0 * 0.0009);
                        col = lerp(col, _SkyHorizonC.rgb * 0.95, haze * 0.4 * (1.0 - _Night * 0.7));
                    }
                    if (abs(_ArtStyle - 1.0) < 0.5)
                    {
                        // 툰: three or four flat bands of light, bolder ink that reaches further.
                        float l0 = max(dot(col, float3(0.2126, 0.7152, 0.0722)), 1e-4);
                        float g = pow(l0, 1.0 / 2.2) * 4.0;
                        float q = (floor(g) + smoothstep(0.4, 0.6, frac(g))) / 4.0;
                        col *= pow(max(q, 0.06), 2.2) / l0;
                        edge = smoothstep(0.15, 0.6, edge);
                        fade = 1.0 - smoothstep(_Fade.x * 1.6, _Fade.y * 1.6, d0);
                    }
                    float3 ink = col * (abs(_ArtStyle - 1.0) < 0.5 ? float3(0.26, 0.22, 0.2) : float3(0.5, 0.44, 0.4));
                    col = lerp(col, ink, edge * fade * _InkStrength);
                }
                float lum = dot(col, float3(0.2126, 0.7152, 0.0722));
                col = lerp(lum.xxx, col, _ArtStyle > 1.5 ? 1.06 : _ArtStyle > 0.5 ? 1.2 : 1.08);
                if (_TiltShift > 0.5) col = lerp(lum.xxx, col, 1.12);
                col *= lerp(_ArtStyle > 1.5 ? float3(1.01, 1.0, 0.985) : float3(1.035, 1.0, 0.955), float3(0.98, 0.99, 1.03), _Night);
                float2 c = uv - 0.5;
                col *= 1.0 - 0.12 * smoothstep(0.45, 0.95, length(c * float2(1.25, 1.0)));

                col = toSrgb(acesThree(max(col, 0)));
                float l = dot(col, float3(0.2126, 0.7152, 0.0722));
                col = lerp(l.xxx, col, 1.05);
                col = (col - 0.5) * (_ArtStyle > 1.5 ? 1.16 : 1.08) + 0.5;
                col *= float3(1.025, 1.0, 0.965);
                col *= 1.0 - 0.22 * smoothstep(0.35, 0.85, length(c * float2(1.25, 1.0)));
                return half4(toLin(saturate(col)), 1);
            }
            ENDHLSL
        }
    }
}
