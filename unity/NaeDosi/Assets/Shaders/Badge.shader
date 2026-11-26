// Round problem badges over the map, always on top (the web's sprites with depthTest off).
Shader "NaeDosi/Badge"
{
    Properties { _MainTex ("Badge", 2D) = "white" {} }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Overlay" "RenderPipeline"="UniversalPipeline" }
        Pass
        {
            Blend SrcAlpha OneMinusSrcAlpha ZWrite Off ZTest Always Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            TEXTURE2D(_MainTex); SAMPLER(sampler_MainTex);
            struct A { float4 pos : POSITION; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct V { float4 cs : SV_POSITION; float2 uv : TEXCOORD0; };
            V vert(A i)
            {
                V o; UNITY_SETUP_INSTANCE_ID(i);
                // Billboard: the instance's centre and scale, the quad laid out in view space.
                float3 c = TransformObjectToWorld(float3(0, 0, 0));
                float s = length(float3(UNITY_MATRIX_M[0].x, UNITY_MATRIX_M[1].x, UNITY_MATRIX_M[2].x));
                float3 vc = TransformWorldToView(c) + float3(i.pos.xy * s, 0);
                o.cs = TransformWViewToHClip(vc);
                o.uv = i.uv;
                return o;
            }
            half4 frag(V i) : SV_Target { half4 c = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv); return c; }
            ENDHLSL
        }
    }
}
