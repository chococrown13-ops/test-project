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
        TEXTURE2D(_WaterMap); SAMPLER(sampler_WaterMap);
        float4 _SkyTopC, _SkyHorizonC; float _WaterAmb;
        float _Night, _Snow, _Time0, _Real;
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
                float2 uv0 : TEXCOORD2; float4 info : TEXCOORD3; float4 sign : TEXCOORD4; float4 loc : TEXCOORD5; float fog : TEXCOORD6; float4 raw : TEXCOORD7;
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
                o.raw = i.col; o.uv0 = i.uv0; o.info = i.uv1; o.sign = i.uv2; o.loc = i.uv3;
                o.fog = ComputeFogFactor(p.positionCS.z);
                return o;
            }

            float h21(float2 p) { return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
            float vn(float2 p) { float2 i = floor(p), f = frac(p); f = f * f * (3.0 - 2.0 * f);
                return lerp(lerp(h21(i), h21(i + float2(1, 0)), f.x), lerp(h21(i + float2(0, 1)), h21(i + float2(1, 1)), f.x), f.y); }
            float fbm(float2 p) { return (vn(p) * 0.5 + vn(p * 2.03 + 5.1) * 0.25 + vn(p * 4.07 + 9.7) * 0.125 + vn(p * 8.13 + 2.3) * 0.0625) / 0.9375; }
            // Fades fine detail out before it shimmers: 1 when a cell of noise at this scale covers many pixels, 0 when under one.
            float detail(float2 p) { float w = max(fwidth(p.x), fwidth(p.y)); return 1.0 - smoothstep(0.35, 1.0, w); }

            // Seven-segment digits for apartment block numbers: segment bits a..g per digit, p in the cell's 0..1 square.
            float seg7(float dgt, float2 p)
            {
                if (any(p < 0) || any(p > 1)) return 0;
                float m = dgt < 0.5 ? 63 : dgt < 1.5 ? 6 : dgt < 2.5 ? 91 : dgt < 3.5 ? 79 : dgt < 4.5 ? 102 : dgt < 5.5 ? 109 : dgt < 6.5 ? 125 : dgt < 7.5 ? 7 : dgt < 8.5 ? 127 : 111;
                float t = 0.17, on = 0;
                float4 r[7] = { float4(0, 1 - t, 1, 1), float4(1 - t, 0.5, 1, 1), float4(1 - t, 0, 1, 0.5), float4(0, 0, 1, t), float4(0, 0, t, 0.5), float4(0, 0.5, t, 1), float4(0, 0.5 - t / 2, 1, 0.5 + t / 2) };
                for (int k = 0; k < 7; k++)
                {
                    float bit = fmod(floor(m / exp2((float)k)), 2.0);
                    if (bit > 0.5 && p.x >= r[k].x && p.x <= r[k].z && p.y >= r[k].y && p.y <= r[k].w) on = 1;
                }
                return on;
            }

            // Facade: walls, windows, signs, balconies (render/materials.ts buildingMaterial).
            void facade(V2F i, inout float3 col, inout float3 emit, inout float glassAmt)
            {
                float st = floor(i.info.x + 0.5);
                // Worked in the web map's coordinates (z south), so windows fall exactly where they do there.
                float3 n = normalize(i.nw); n.z = -n.z;
                bool side = abs(n.y) < 0.5;
                float abandoned = i.info.w;
                float lit = 0.0, winTint = 0.0, aptLit = -1.0;
                float3 vSign = i.sign.rgb;
                float vLY = i.loc.x, vH = i.loc.y, vTop = i.loc.w;
                float3 wp = float3(i.ws.x, i.ws.y, -i.ws.z);
                if (!side)
                {
                    if (st < 0.5 || abs(st - 2.0) < 0.5) col = float3(0.36, 0.55, 0.42);
                    else col *= 0.78;
                    if (_Real > 0.5) { col *= 0.82 + 0.3 * fbm(wp.xz * 1.3 + i.info.y * 17.0) * (0.5 + 0.5 * detail(wp.xz * 5.0)); col *= 0.92 + 0.12 * vn(wp.xz * 9.0) * detail(wp.xz * 9.0); }
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
                    if (_Real > 0.5)
                    {
                        // 실사: plaster with blotches, rain streaks running down from the windows, grime near the ground.
                        float2 wall = float2(u, wp.y);
                        col *= 0.9 + 0.2 * fbm(wall * 0.6 + i.info.y * 31.0) * (0.6 + 0.4 * detail(wall * 2.0));
                        col *= 0.96 + 0.08 * vn(wall * 7.0) * detail(wall * 7.0);
                        float streak = vn(float2(u * 2.4 + i.info.y * 7.0, wp.y * 0.12));
                        col *= 1.0 - 0.16 * smoothstep(0.55, 0.95, streak) * (1.0 - win);
                        col *= lerp(0.78, 1.0, smoothstep(0.0, 1.8, wp.y));
                        glass *= 0.55;
                        float curtain = h21(float2(floorIx * 2.3 + i.info.y * 5.0, colIx * 4.1));
                        if (curtain > 0.6) glass = lerp(glass, float3(0.62, 0.56, 0.46), 0.5 * step(0.45, fv) * step(fv, 0.5 + 0.4 * curtain));
                        else if (curtain < 0.2) glass = lerp(glass, float3(0.55, 0.56, 0.56), 0.4 * step(0.5 + 0.3 * frac(fy * 9.0), fv) * step(frac(fy * 30.0), 0.6));
                    }
                    col = lerp(col, glass, win * (1.0 - abandoned * 0.5));
                    glassAmt = win * (1.0 - abandoned * 0.5);
                    if (_Real > 0.5)
                    {
                        float across = i.sign.w;
                        float brand = h21(float2(i.info.y * 41.0, 3.0));
                        float3 brandC = brand < 0.3 ? float3(0.1, 0.32, 0.2) : brand < 0.55 ? float3(0.12, 0.22, 0.45) : brand < 0.8 ? float3(0.55, 0.2, 0.1) : float3(0.35, 0.3, 0.26);
                        // 아파트, as built lately: white and charcoal panels, floor-to-ceiling glass, a stone base, a lit glass crown,
                        // and a small block number (1xx동) high on the end wall.
                        if ((abs(st - 9.0) < 0.5 || abs(st - 1.0) < 0.5) && vH > 12.0)
                        {
                            float3 white = float3(0.84, 0.85, 0.85), charcoal = float3(0.17, 0.18, 0.2), stone = float3(0.46, 0.43, 0.39);
                            float yl = wp.y;
                            float fl2 = frac(yl / 3.0);
                            float uw = 3.4, cu2 = frac(u / uw), unitI = floor(u / uw);
                            bool accent = fmod(abs(unitI) + floor(brand * 3.0), 4.0) < 0.5;
                            bool front = abs(i.loc.z) < 0.5;
                            float glassF = step(0.1, fl2) * step(fl2, 0.92) * step(0.06, cu2) * step(cu2, 0.94);
                            float w2 = glassF; // the same on every face: two parts' walls often share a plane
                            col = accent ? charcoal : white;
                            if (fl2 < 0.1) col = lerp(col, float3(0.7, 0.71, 0.72), 0.6); // slab edge between floors
                            if (yl < 6.0) { col = stone * (0.9 + 0.2 * h21(float2(floor(u / 1.2), floor(yl / 0.6)))); w2 = yl < 3.0 ? step(0.15, fl2) * step(0.06, cu2) * step(cu2, 0.94) : 0.0; }
                            float crown = step(vTop - 4.5, wp.y);
                            if (crown > 0.5)
                            {
                                float fin = step(0.82, frac(u / 1.1));
                                col = charcoal; w2 = 1.0 - fin;
                                emit += (1.0 - fin) * float3(0.85, 0.9, 1.0) * 0.5 * _Night * i.info.z;
                            }
                            float3 g2 = lerp(float3(0.14, 0.18, 0.22), float3(0.42, 0.52, 0.6), 0.3 * fl2 + 0.25 * h21(float2(unitI, floor(yl / 3.0))));
                            if (crown > 0.5) g2 = float3(0.3, 0.36, 0.42);
                            col = lerp(col, g2, w2 * (1.0 - abandoned * 0.5));
                            glassAmt = w2 * (1.0 - abandoned * 0.5);
                            // Lit windows follow the new glass.
                            aptLit = w2 * step(0.45, h21(float2(floor(yl / 3.0) * 7.0 + i.info.y * 91.0, unitI))) * i.info.z * (1.0 - abandoned) * (1.0 - crown);
                            if (!front)
                            {
                                float dh = 1.3, dw = 0.75, gap = 0.22, y0 = vTop - 7.0;
                                float x0 = across + (3.0 * dw + 2.0 * gap) / 2.0;
                                float n3 = floor(h21(float2(i.info.y * 13.0, 7.0)) * 9.0) + 1.0;
                                float ink = 0;
                                for (int k = 0; k < 3; k++)
                                {
                                    float dg = k == 0 ? 1.0 : k == 1 ? 0.0 : n3;
                                    ink = max(ink, seg7(dg, float2((x0 - k * (dw + gap)) / dw, (wp.y - y0) / dh)));
                                }
                                if (ink > 0.5) { col = accent ? white : charcoal; glassAmt = 0; aptLit = 0; }
                            }
                        }
                        // 상가: a signboard across every upper floor, bright with white lettering, lit at night.
                        if ((abs(st - 2.0) < 0.5 || abs(st - 10.0) < 0.5) && wp.y > 3.0 && floorIx < 6.0)
                        {
                            float unit = floor(u / 6.5);
                            float pick = h21(float2(unit * 3.7 + i.info.y * 9.0, floorIx * 5.1));
                            float3 sc = pick < 0.2 ? float3(0.75, 0.08, 0.06) : pick < 0.4 ? float3(0.05, 0.25, 0.65) : pick < 0.55 ? float3(0.95, 0.7, 0.05) : pick < 0.7 ? float3(0.05, 0.45, 0.2) : pick < 0.85 ? float3(0.9, 0.92, 0.94) : float3(0.45, 0.08, 0.35);
                            float board = step(0.74, fv) * step(fv, 0.97) * step(0.04, frac(u / 6.5)) * step(frac(u / 6.5), 0.96);
                            if (board > 0.5 && pick < 0.93)
                            {
                                float tv = (fv - 0.74) / 0.23, tu = frac(u / 6.5);
                                float letters = step(0.3, tv) * step(tv, 0.72) * step(0.2, tu) * step(tu, 0.8) * step(0.35, frac(u * 1.25)) * step(0.3, vn(float2(u * 2.5, floorIx)));
                                float3 txt = pick > 0.7 && pick < 0.85 ? float3(0.7, 0.05, 0.05) : float3(0.97, 0.97, 0.95);
                                col = lerp(sc, txt, letters);
                                glassAmt = 0;
                                emit += col * 0.7 * _Night * i.info.z;
                            }
                        }
                        // 빌라: red brick with pale mortar.
                        if (st < 0.5)
                        {
                            float2 wb = float2(u, wp.y);
                            float row = floor(wb.y / 0.09);
                            float bx = frac(wb.x / 0.23 + fmod(row, 2.0) * 0.5), by = frac(wb.y / 0.09);
                            float mortar = max(step(bx, 0.07), step(by, 0.13)) * (1.0 - win);
                            float dd = detail(wb * 11.0);
                            col *= lerp(1.0, lerp(0.88 + 0.2 * h21(float2(floor(wb.x / 0.23 + fmod(row, 2.0) * 0.5), row)), 1.35, mortar), dd);
                        }
                    }
                    if (_Real > 0.5 && st < 10.5 && aptLit < 0.0)
                    {
                        // A frame round every pane where the window pattern changes, and a ledge shadow just under it.
                        float fr = saturate(fwidth(win) * 1.5);
                        col = lerp(col, float3(0.82, 0.82, 0.8), fr * 0.8);
                        glassAmt *= 1.0 - fr;
                    }
                    float on = step(0.42, h21(float2(floorIx * 7.0 + i.info.y * 91.0, colIx)));
                    lit = win * on * i.info.z * (1.0 - abandoned);
                    if (abs(st - 2.0) < 0.5 && fy < 3.0 && fv > 0.85) lit = i.info.z * 0.8;
                    if (st > 10.5) lit = i.info.z * (1.0 - abandoned);
                    if (aptLit >= 0.0) lit = aptLit;
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
                // People: only the shirt (white in the mesh) takes the walker's colour; trousers, skin and hair keep their own.
                if (_Mode > 4.5 && _Mode < 5.5 && min(i.raw.r, min(i.raw.g, i.raw.b)) < 0.95) col = i.raw.rgb;
                float3 emit = _Emit.rgb;
                float smooth = _Smooth;
                float2 gp = float2(i.ws.x, -i.ws.z); // the web map's ground coordinates
                float waterFresnel = 0, glassAmt = 0, metal = _Metal;
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
                else if (_Mode < 2.5) facade(i, col, emit, glassAmt);
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
                else if (_Mode > 2.5 && _Mode < 3.5)
                {
                    float2 wv = float2(sin(gp.x * 0.21 + _Time0 * 1.3) + sin(gp.y * 0.13 - _Time0 * 0.9) * 0.6, cos(gp.y * 0.19 + _Time0 * 1.1) + sin((gp.x + gp.y) * 0.09 + _Time0 * 0.7) * 0.6);
                    // Finer ripples on top of the long waves.
                    float2 fw = float2(vn(gp * 0.35 + _Time0 * 0.6) - 0.5, vn(gp * 0.35 - _Time0 * 0.5 + 17.0) - 0.5);
                    n = normalize(n + float3(wv.x * 0.06 + fw.x * 0.12, 0.0, -(wv.y * 0.06 + fw.y * 0.12)));
                    // Depth from the shore: shallow water by the banks is lighter and greener, open water deep blue.
                    float2 wuv = gp / max(_MapSize, 1);
                    float shore = (any(wuv < 0) || any(wuv > 1)) ? 1 : SAMPLE_TEXTURE2D(_WaterMap, sampler_WaterMap, wuv).r;
                    float depth = smoothstep(0.0, 0.6, shore);
                    col = lerp(float3(0.1, 0.4, 0.42), col, depth);
                    smooth = 0.7;
                    // Foam where the water meets the land, breaking up as it moves.
                    float band = 1.0 - smoothstep(0.08, 0.2, shore);
                    float froth = vn(gp * 0.9 + float2(_Time0 * 0.4, -_Time0 * 0.3));
                    float foam = band * smoothstep(0.35, 0.65, froth + 0.25 * sin(shore * 60.0 - _Time0 * 2.0));
                    col = lerp(col, float3(0.9, 0.94, 0.95), foam * 0.85);
                    if (_Real > 0.5) col *= 0.75;
                    waterFresnel = (1 - foam) * pow(1.0 - saturate(dot(normalize(GetWorldSpaceNormalizeViewDir(i.ws)), n)), 5.0);
                }

                if (_Real > 0.5 && (_Mode < 2.5 || _Mode > 3.5))
                {
                    float lum0 = dot(col, float3(0.299, 0.587, 0.114));
                    float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
                    float green = saturate((col.g - max(col.r, col.b)) * 5.0);
                    if (_Mode < 0.5)
                    {
                        // Grass: duller and deeper, clumps and blades, bare soil showing through here and there.
                        float3 g = lerp(lum0.xxx, col, 0.9) * float3(0.6, 0.66, 0.4);
                        float clump = fbm(gp * 0.45);
                        g *= 0.72 + 0.5 * clump;
                        g *= 1.0 + (vn(gp * 6.0) - 0.5) * 0.35 * detail(gp * 6.0);
                        g *= 1.0 + (vn(gp * 22.0) - 0.5) * 0.3 * detail(gp * 22.0);
                        float soil = smoothstep(0.62, 0.78, fbm(gp * 0.07 + 3.7)) * smoothstep(0.35, 0.6, vn(gp * 0.9));
                        g = lerp(g, float3(0.3, 0.24, 0.16) * (0.8 + 0.4 * vn(gp * 3.0)), soil * 0.7);
                        col = lerp(col * (0.9 + 0.2 * fbm(gp * 0.8)), g, green);
                        // A little bumpiness so the sun picks out the clumps.
                        float2 e = float2(0.15, 0);
                        float hx = fbm(gp * 0.45 + e.xy) - clump, hz = fbm(gp * 0.45 + e.yx) - clump;
                        n = normalize(n + float3(-hx, 0, hz) * 1.6 * green);
                    }
                    else if (_Mode < 1.5)
                    {
                        float flat = step(0.85, n.y);
                        float grey = 1.0 - saturate(sat * 5.0);
                        if (grey > 0.5 && flat > 0.5 && lum0 < 0.55)
                        {
                            // Asphalt: darker, grainy, patched, worn paler in the wheel tracks.
                            col *= 0.72;
                            col *= 0.84 + 0.32 * vn(gp * 35.0) * detail(gp * 35.0) + 0.08;
                            col *= 0.9 + 0.2 * fbm(gp * 0.25);
                            float patch = smoothstep(0.66, 0.7, fbm(gp * 0.12 + 11.0));
                            col = lerp(col, col * 0.72, patch * 0.8);
                            smooth = 0.12 + 0.25 * _Snow;
                        }
                        else if (grey > 0.5 && flat > 0.5 && lum0 < 0.78)
                        {
                            // 보도블럭: grey and dull-red paving blocks in a running bond.
                            float2 pb = gp / float2(0.3, 0.15);
                            float rowB = floor(pb.y);
                            float2 cell = float2(pb.x + fmod(rowB, 2.0) * 0.5, pb.y);
                            float2 fb = frac(cell);
                            float joint = max(step(fb.x, 0.05), step(fb.y, 0.09));
                            float pick = h21(floor(cell));
                            float3 block = pick > 0.78 ? col * float3(1.0, 0.72, 0.65) : col * (0.9 + 0.16 * pick);
                            col = lerp(col * (0.92 + 0.1 * fbm(gp * 0.3)), lerp(block, col * 0.7, joint), detail(pb * 1.5));
                        }
                        else if (lum0 > 0.78 && flat > 0.5)
                        {
                            // Road paint, scuffed.
                            col *= 0.82 + 0.18 * vn(gp * 5.0);
                        }
                        else if (green > 0.25)
                        {
                            // Leaves: darker, every tree a little different, light and shade within the crown.
                            col = lerp(lum0.xxx, col, 0.8) * float3(0.8, 0.82, 0.62);
                            col *= 0.7 + 0.55 * vn(i.ws.xz * 0.37 + i.ws.y * 0.11);
                            col *= 0.85 + 0.3 * vn(i.ws.xz * 4.0 + i.ws.y * 3.0) * detail(i.ws.xz * 4.0);
                            n = normalize(n + (float3(vn(i.ws.xz * 3.0), 0, vn(i.ws.zy * 3.0)) - 0.5) * 0.9);
                            smooth = 0.05;
                        }
                        else col *= 0.92 + 0.12 * vn(i.ws.xz * 2.0 + i.ws.y);
                    }
                    else if (_Mode > 3.5 && _Mode < 4.5) { smooth = 0.75; metal = 0.25; }
                    else if (_Mode > 5.5) { smooth = 0.6; metal = 0.2; }
                    col = lerp(dot(col, float3(0.299, 0.587, 0.114)).xxx, col, 0.94);
                }
                if (glassAmt > 0 && _Real > 0.5) { smooth = lerp(smooth, 0.92, glassAmt); waterFresnel = glassAmt * (0.25 + pow(1.0 - saturate(dot(GetWorldSpaceNormalizeViewDir(i.ws), n)), 3.0)); }

                InputData d = (InputData)0;
                d.positionWS = i.ws;
                d.normalWS = n;
                d.viewDirectionWS = GetWorldSpaceNormalizeViewDir(i.ws);
                d.shadowCoord = TransformWorldToShadowCoord(i.ws);
                // Fog per pixel: the water and the land past the map edge are a few huge triangles.
                float fogF = ComputeFogFactor(TransformWorldToHClip(i.ws).z);
                d.fogCoord = fogF;
                d.bakedGI = SampleSH(n);
                d.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(i.cs);
                d.shadowMask = half4(1, 1, 1, 1);
                SurfaceData s = (SurfaceData)0;
                s.albedo = col;
                s.metallic = metal;
                s.smoothness = smooth;
                // Water: little of the bright sky-and-studio ambient soaks into it, so it stays a deep blue as on the web.
                s.occlusion = _Mode > 2.5 && _Mode < 3.5 ? _WaterAmb : (_Real > 0.5 ? 0.72 : 1);
                s.emission = emit;
                s.alpha = 1;
                s.normalTS = float3(0, 0, 1);
                half4 c = UniversalFragmentPBR(d, s);
                // Water mirrors the sky at a glancing angle.
                if (waterFresnel > 0) { float3 r = reflect(-d.viewDirectionWS, n); float3 sky = lerp(_SkyHorizonC.rgb, _SkyTopC.rgb, pow(saturate(r.y), 0.55)); c.rgb = lerp(c.rgb, sky * 0.85, saturate(waterFresnel) * (_Real > 0.5 ? 0.6 : 0.3)); }
                c.rgb = MixFog(c.rgb, fogF);
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
