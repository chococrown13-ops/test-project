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
            float3 _SkyTop, _SkyHorizon, _SunDir, _SunColor; float _Night;
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
                float3 g = floor(dw * 420.0);
                float st = step(0.9975, h31(g)) * smoothstep(0.05, 0.3, h) * _Night;
                c += st * (0.6 + 0.4 * h31(g + 3.1));
                return half4(c, 1);
            }
            ENDHLSL
        }
    }
}
