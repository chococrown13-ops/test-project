// Unlit see-through colour for tool previews (cells, rings, the curve band), tinted per instance.
Shader "NaeDosi/Ghost"
{
    Properties { _Color ("Color", Color) = (1,1,1,0.45) }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent+5" "RenderPipeline"="UniversalPipeline" }
        Pass
        {
            Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            CBUFFER_START(UnityPerMaterial) float4 _Color; CBUFFER_END
            UNITY_INSTANCING_BUFFER_START(Props) UNITY_DEFINE_INSTANCED_PROP(float4, _Tint) UNITY_INSTANCING_BUFFER_END(Props)
            struct A { float4 pos : POSITION; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct V { float4 cs : SV_POSITION; float4 c : COLOR; };
            V vert(A i)
            {
                V o; UNITY_SETUP_INSTANCE_ID(i);
                o.cs = TransformObjectToHClip(i.pos.xyz);
                float4 t = UNITY_ACCESS_INSTANCED_PROP(Props, _Tint);
                o.c = _Color * (t.a > 0 ? float4(t.rgb, 1) : float4(1,1,1,1));
                return o;
            }
            half4 frag(V i) : SV_Target { return i.c; }
            ENDHLSL
        }
    }
}
