// The city's one shader, on URP's lighting (shadows, ambient, fog, SSAO). _Mode picks what it draws:
//   0 ground: the painted ground texture, soft grass patches, snow by height
//   1 vertex colour: roads, trees, decks (road snow from _RoadSnow)
//   2 buildings: facades drawn from world position (port of render/materials.ts buildingMaterial)
//   3 water: ripples that catch the sun
// Building vertices carry: color = wall colour, uv1 = (style, seed, powered, abandoned),
// uv2 = (sign r, g, b, 0), uv3 = (local y 0..1, part height, local normal x, top y).
Shader "NaeDosi/City"
{
    Properties
    {
        _BaseMap ("Ground map", 2D) = "white" {}
        _Mode ("Mode", Float) = 1
        _Smooth ("Smoothness", Float) = 0.1
        _Metal ("Metallic", Float) = 0
        [HDR] _Emit ("Emission", Color) = (0,0,0,0)
        _Cull ("Cull", Float) = 2
        _Off ("Depth offset", Float) = 0
        _RoadOv ("Traffic overlay", Float) = 0
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" "Queue"="Geometry" }

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        CBUFFER_START(UnityPerMaterial)
            float4 _BaseMap_ST;
            float _Mode, _Smooth, _Metal, _Cull, _RoadOv, _Off;
            float4 _Emit;
        CBUFFER_END
        TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
        TEXTURE2D(_RoadSnow); SAMPLER(sampler_RoadSnow);
        float _Night, _Snow, _Time0;
        // World-space scale of the map: positions are in metres, the web map's z runs the other way.
        float _MapSize;
        UNITY_INSTANCING_BUFFER_START(Props)
            UNITY_DEFINE_INSTANCED_PROP(float4, _Tint)
        UNITY_INSTANCING_BUFFER_END(Props)
        ENDHLSL

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode"="UniversalForward" }
            Cull [_Cull]
            Offset [_Off], [_Off]
            HLSLPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fog
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            struct A { float4 pos : POSITION; float3 nrm : NORMAL; float4 col : COLOR; float2 uv0 : TEXCOORD0; float4 uv1 : TEXCOORD1; float4 uv2 : TEXCOORD2; float4 uv3 : TEXCOORD3; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct V2F
            {
                float4 cs : SV_POSITION; float3 ws : TEXCOORD0; float3 nw : TEXCOORD1; float4 col : COLOR;
                float2 uv0 : TEXCOORD2; float4 info : TEXCOORD3; float4 sign : TEXCOORD4; float4 loc : TEXCOORD5; float fog : TEXCOORD6;
            };

            V2F vert(A i)
            {
                V2F o;
                UNITY_SETUP_INSTANCE_ID(i);
                VertexPositionInputs p = GetVertexPositionInputs(i.pos.xyz);
                o.cs = p.positionCS; o.ws = p.positionWS;
                o.nw = TransformObjectToWorldNormal(i.nrm);
                float4 tint = UNITY_ACCESS_INSTANCED_PROP(Props, _Tint);
                if (tint.a <= 0) tint = float4(1, 1, 1, 1);
                o.col = i.col * float4(tint.rgb, 1);
                if (_Mode > 4.5 && _Mode < 5.5 && min(i.col.r, min(i.col.g, i.col.b)) < 0.95) o.col = i.col; o.uv0 = i.uv0; o.info = i.uv1; o.sign = i.uv2; o.loc = i.uv3;
                o.fog = ComputeFogFactor(p.positionCS.z);
                return o;
            }

            float h21(float2 p) { return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
            float vn(float2 p) { float2 i = floor(p), f = frac(p); f = f * f * (3.0 - 2.0 * f);
                return lerp(lerp(h21(i), h21(i + float2(1, 0)), f.x), lerp(h21(i + float2(0, 1)), h21(i + float2(1, 1)), f.x), f.y); }

            // Facade: walls, windows, signs, balconies (render/materials.ts buildingMaterial).
            void facade(V2F i, inout float3 col, inout float3 emit)
            {
                float st = floor(i.info.x + 0.5);
                // Worked in the web map's coordinates (z south), so windows fall exactly where they do there.
                float3 n = normalize(i.nw); n.z = -n.z;
                bool side = abs(n.y) < 0.5;
                float abandoned = i.info.w;
                float lit = 0.0, winTint = 0.0;
                float3 vSign = i.sign.rgb;
                float vLY = i.loc.x, vH = i.loc.y, vTop = i.loc.w;
                float3 wp = float3(i.ws.x, i.ws.y, -i.ws.z);
                if (!side)
                {
                    if (st < 0.5 || abs(st - 2.0) < 0.5) col = float3(0.36, 0.55, 0.42);
                    else col *= 0.78;
                    col = lerp(col, float3(0.94, 0.96, 0.98), _Snow * 0.85);
                }
                else
                {
                    float2 t = normalize(float2(-n.z, n.x));
                    float u = dot(wp.xz, t);
                    float fy = wp.y / 3.0;
                    float floorIx = floor(fy);
                    float fv = frac(fy);
                    float spacing = st < 0.5 ? 3.2 : st < 1.5 ? 2.6 : st < 2.5 ? 3.4 : st < 3.5 ? 1.7 : 6.0;
                    float cu = frac(u / spacing);
                    float colIx = floor(u / spacing);
                    float win = 0.0;
                    if (st < 0.5) win = step(0.35, fv) * step(fv, 0.72) * step(0.28, cu) * step(cu, 0.72);
                    else if (st < 1.5) win = step(0.3, fv) * step(fv, 0.8) * step(0.12, cu) * step(cu, 0.88);
                    else if (st < 2.5) win = step(0.25, fv) * step(fv, 0.85) * step(0.08, cu) * step(cu, 0.92);
                    else if (st < 3.5) win = step(0.1, fv) * step(cu, 0.94);
                    else if (st < 4.5) win = step(0.6, fv) * step(fv, 0.85) * step(0.3, cu) * step(cu, 0.7) * step(fy, 1.0);
                    else if (st > 5.5)
                    {
                        float yl = vLY * vH, fl = frac(yl / 3.0);
                        if (st < 6.5) { float c = frac(u / 3.4); win = step(0.38, fl) * step(fl, 0.72) * step(0.3, c) * step(c, 0.7); }
                        else if (st < 7.5)
                        {
                            float c = frac(u / 2.6);
                            if (vLY > 0.84 || c < 0.07) col = float3(0.36, 0.26, 0.2);
                            else if (vLY > 0.18 && vLY < 0.78 && c > 0.18 && c < 0.82)
                            {
                                float lat = max(step(frac(u * 2.2), 0.12), step(frac(yl * 2.2), 0.12));
                                col = lerp(float3(0.93, 0.88, 0.76), float3(0.4, 0.3, 0.22), lat);
                                win = 0.0;
                            }
                        }
                        else if (st < 8.5)
                        {
                            float c = frac(u / 3.2);
                            float frame = step(0.3, fl) * step(fl, 0.8) * step(0.22, c) * step(c, 0.78);
                            col = lerp(col, float3(0.93, 0.92, 0.88), frame);
                            win = step(0.34, fl) * step(fl, 0.76) * step(0.26, c) * step(c, 0.74);
                        }
                        else if (st < 9.5)
                        {
                            if (abs(i.loc.z) < 0.5)
                            {
                                float c = frac(u / 2.8), unit = floor(u / 2.8);
                                if (fl < 0.28 && yl > 3.0) col = lerp(col, float3(0.95, 0.95, 0.95), 0.6);
                                win = step(0.32, fl) * step(fl, 0.8) * step(0.1, c) * step(c, 0.9) * step(3.0, yl);
                                if (fmod(unit, 2.0) < 0.5 && c < 0.07 && yl > 3.0) col *= 0.78;
                                if (win > 0.5 && abs(c - 0.5) < 0.03) { win = 0.0; col = float3(0.93, 0.93, 0.9); }
                                if (fl > 0.06 && fl < 0.26 && c > 0.66 && c < 0.86 && yl > 3.0 && h21(float2(unit, floor(yl / 3.0))) > 0.6) col = float3(0.62, 0.63, 0.62);
                            }
                        }
                        else if (st < 10.5)
                        {
                            float c = frac(u / 3.6);
                            win = yl < 3.0 ? step(0.12, fl) * step(fl, 0.66) * step(0.06, c) * step(c, 0.94)
                                           : step(0.3, fl) * step(fl, 0.72) * step(0.15, c) * step(c, 0.85);
                        }
                    }
                    if (wp.y < 3.0 && st < 4.5) win = st < 0.5 ? 0.0 : 1.0;
                    if (abs(st - 1.0) < 0.5 && fv < 0.3 && wp.y > 3.0) col = lerp(col, float3(0.93, 0.93, 0.93), 0.6);
                    if (abs(st - 2.0) < 0.5 && fy < 3.0 && fv > 0.85) { col = vSign; win = 0.0; }
                    if ((abs(st - 1.0) < 0.5 || abs(st - 9.0) < 0.5) && wp.y > vTop - 2.4 && wp.y < vTop - 1.2) { col = vSign; win = 0.0; }
                    float3 glass = st > 2.5 && st < 3.5 ? float3(0.32, 0.45, 0.58) : float3(0.18, 0.22, 0.28);
                    float pane = h21(float2(floorIx * 5.3 + i.info.y * 13.0, colIx * 2.9));
                    if (st > 2.5 && st < 3.5)
                    {
                        glass = lerp(glass, float3(0.66, 0.77, 0.88), 0.25 * fv + 0.22 * pane);
                        if (fv < 0.1) { col = float3(0.27, 0.31, 0.36); win = 0.0; }
                    }
                    else
                    {
                        glass = lerp(glass, float3(0.45, 0.55, 0.66), 0.28 * fv);
                        if (pane > 0.72) glass = lerp(glass, float3(0.86, 0.8, 0.68), 0.45);
                    }
                    col = lerp(col, glass, win * (1.0 - abandoned * 0.5));
                    float on = step(0.42, h21(float2(floorIx * 7.0 + i.info.y * 91.0, colIx)));
                    lit = win * on * i.info.z * (1.0 - abandoned);
                    if (abs(st - 2.0) < 0.5 && fy < 3.0 && fv > 0.85) lit = i.info.z * 0.8;
                    if (st > 10.5) lit = i.info.z * (1.0 - abandoned);
                    if ((st < 4.5 || (st > 5.5 && st < 10.5 && st != 7.0)) && fv < 0.035 && wp.y > 2.9) col *= 0.86;
                    col *= lerp(0.6, 1.0, smoothstep(0.0, 3.2, wp.y));
                    winTint = h21(float2(floorIx * 3.1 + i.info.y * 17.0, colIx * 1.7));
                }
                col *= 1.0 - abandoned * 0.35;
                float3 warm = winTint < 0.7 ? float3(1.0, 0.78, 0.45) : winTint < 0.9 ? float3(0.95, 0.92, 0.82) : float3(0.55, 0.7, 1.0);
                float3 e = st > 10.5 ? col * 1.4 : (abs(st - 2.0) < 0.5 && wp.y < 9.0 && frac(wp.y / 3.0) > 0.85) ? vSign * 1.6 : warm * 0.95;
                emit += lit * _Night * e;
            }

            half4 frag(V2F i) : SV_Target
            {
                float3 n = normalize(i.nw);
                float3 col = i.col.rgb;
                float3 emit = _Emit.rgb;
                float smooth = _Smooth;
                float2 gp = float2(i.ws.x, -i.ws.z); // the web map's ground coordinates
                if (_Mode < 0.5)
                {
                    col = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv0).rgb;
                    col *= 0.9 + 0.14 * vn(gp / 46.0) + 0.06 * vn(gp / 9.0);
                    float greenness = saturate((col.g - max(col.r, col.b)) * 6.0);
                    float dry = smoothstep(0.5, 0.85, vn(gp / 130.0 + 7.3));
                    col = lerp(col, col * float3(1.16, 1.02, 0.7), dry * 0.45 * greenness);
                    col *= 1.0 - greenness * 0.08 * smoothstep(0.55, 0.9, vn(gp / 22.0 + 3.1));
                    col *= 1.0 + greenness * (vn(gp / 1.6) - 0.5) * 0.09;
                    float snow = _Snow * (0.55 + 0.45 * smoothstep(8.0, 45.0, i.ws.y)) * (0.75 + 0.25 * vn(gp / 6.0));
                    if (i.ws.y > -0.5) col = lerp(col, float3(0.93, 0.95, 0.97), clamp(snow, 0.0, 0.92));
                    // Flat-shaded hills: the face normal from screen-space derivatives.
                    n = normalize(cross(ddy(i.ws), ddx(i.ws)));
                    if (dot(n, i.nw) < 0) n = -n;
                }
                else if (_Mode < 1.5)
                {
                    if (_RoadOv > 0.5 && _MapSize > 0) col = lerp(col, SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, float2(gp.x / _MapSize, 1 - gp.y / _MapSize)).rgb, 0.8);
                    if (_MapSize > 0)
                    {
                        float rs = SAMPLE_TEXTURE2D(_RoadSnow, sampler_RoadSnow, gp / _MapSize).r;
                        if (rs > 0.01)
                        {
                            float2 sp = gp / _MapSize * 2560.0;
                            float nn = frac(sin(dot(floor(sp * 0.7), float2(12.9898, 78.233))) * 43758.5453);
                            float cover = smoothstep(0.0, 0.7, rs * (0.75 + 0.5 * nn));
                            col = lerp(col, float3(0.9, 0.92, 0.95), cover * 0.92);
                        }
                    }
                }
                else if (_Mode < 2.5) facade(i, col, emit);
                else if (_Mode > 5.5)
                {
                    // Buses and trains: windows and signs glow at night.
                    emit += float3(1, 0.86, 0.6) * i.info.x * _Night;
                }
                else if (_Mode > 3.5 && _Mode < 4.5)
                {
                    // Vehicles: headlights (positive) and tail lights (negative) glow, brighter at night.
                    float gl = i.info.x;
                    emit += (gl > 0 ? float3(1, 0.92, 0.75) * gl : float3(1, 0.08, 0.05) * -gl) * (0.15 + _Night);
                }
                else
                {
                    float2 wv = float2(sin(gp.x * 0.21 + _Time0 * 1.3) + sin(gp.y * 0.13 - _Time0 * 0.9) * 0.6, cos(gp.y * 0.19 + _Time0 * 1.1) + sin((gp.x + gp.y) * 0.09 + _Time0 * 0.7) * 0.6);
                    n = normalize(n + float3(wv.x * 0.06, 0.0, -wv.y * 0.06));
                }

                InputData d = (InputData)0;
                d.positionWS = i.ws;
                d.normalWS = n;
                d.viewDirectionWS = GetWorldSpaceNormalizeViewDir(i.ws);
                d.shadowCoord = TransformWorldToShadowCoord(i.ws);
                d.fogCoord = i.fog;
                d.bakedGI = SampleSH(n);
                d.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(i.cs);
                d.shadowMask = half4(1, 1, 1, 1);
                SurfaceData s = (SurfaceData)0;
                s.albedo = col;
                s.metallic = _Metal;
                s.smoothness = smooth;
                s.occlusion = 1;
                s.emission = emit;
                s.alpha = 1;
                s.normalTS = float3(0, 0, 1);
                half4 c = UniversalFragmentPBR(d, s);
                c.rgb = MixFog(c.rgb, i.fog);
                return c;
            }
            ENDHLSL
        }

        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode"="ShadowCaster" }
            ZWrite On ZTest LEqual ColorMask 0
            Cull [_Cull]
            HLSLPROGRAM
            #pragma vertex sv
            #pragma fragment sf
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"
            float3 _LightDirection; float3 _LightPosition;
            struct A { float4 pos : POSITION; float3 nrm : NORMAL; UNITY_VERTEX_INPUT_INSTANCE_ID };
            float4 sv(A i) : SV_POSITION
            {
                UNITY_SETUP_INSTANCE_ID(i);
                float3 ws = TransformObjectToWorld(i.pos.xyz);
                float3 nw = TransformObjectToWorldNormal(i.nrm);
                #if _CASTING_PUNCTUAL_LIGHT_SHADOW
                    float3 ld = normalize(_LightPosition - ws);
                #else
                    float3 ld = _LightDirection;
                #endif
                float4 cs = TransformWorldToHClip(ApplyShadowBias(ws, nw, ld));
                #if UNITY_REVERSED_Z
                    cs.z = min(cs.z, UNITY_NEAR_CLIP_VALUE);
                #else
                    cs.z = max(cs.z, UNITY_NEAR_CLIP_VALUE);
                #endif
                return cs;
            }
            half4 sf() : SV_Target { return 0; }
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode"="DepthOnly" }
            ZWrite On ColorMask R
            Cull [_Cull]
            HLSLPROGRAM
            #pragma vertex dv
            #pragma fragment df
            #pragma multi_compile_instancing
            struct A { float4 pos : POSITION; UNITY_VERTEX_INPUT_INSTANCE_ID };
            float4 dv(A i) : SV_POSITION { UNITY_SETUP_INSTANCE_ID(i); return TransformObjectToHClip(i.pos.xyz); }
            half df() : SV_Target { return 0; }
            ENDHLSL
        }

        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode"="DepthNormals" }
            ZWrite On
            Cull [_Cull]
            HLSLPROGRAM
            #pragma vertex nv
            #pragma fragment nf
            #pragma multi_compile_fragment _ _GBUFFER_NORMALS_OCT
            #pragma multi_compile_instancing
            struct A { float4 pos : POSITION; float3 nrm : NORMAL; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct V2F { float4 cs : SV_POSITION; float3 nw : TEXCOORD0; };
            V2F nv(A i) { V2F o; UNITY_SETUP_INSTANCE_ID(i); o.cs = TransformObjectToHClip(i.pos.xyz); o.nw = TransformObjectToWorldNormal(i.nrm); return o; }
            half4 nf(V2F i) : SV_Target
            {
                float3 n = normalize(i.nw);
                #if defined(_GBUFFER_NORMALS_OCT)
                    float2 oct = PackNormalOctQuadEncode(n);
                    float2 r = saturate(oct * 0.5 + 0.5);
                    return half4(PackFloat2To888(r), 0.0);
                #else
                    return half4(n, 0.0);
                #endif
            }
            ENDHLSL
        }
    }
}
