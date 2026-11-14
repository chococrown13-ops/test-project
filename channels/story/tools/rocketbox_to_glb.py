import bpy, sys, os
a = sys.argv[sys.argv.index("--")+1:]; fbx, texdir, out = a
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
for img in bpy.data.images:
    base = os.path.splitext(os.path.basename(img.filepath))[0]
    p = os.path.join(texdir, base + ".png")
    if os.path.exists(p): img.filepath = p; img.reload()
KEEP = ("Basis", "AA_VI_", "AK_09_EyeBlink", "AK_10_EyeBlink", "AK_44_MouthSmile", "AK_45_MouthSmile", "AK_03_BrowInnerUp", "AK_01_BrowDown", "AK_02_BrowDown", "AK_25_JawOpen", "AK_30_MouthFrown", "AK_31_MouthFrown", "AK_21_EyeWide", "AK_22_EyeWide")
for o in bpy.data.objects:
    if o.type == 'MESH' and o.data.shape_keys:
        for kb in list(o.data.shape_keys.key_blocks):
            if not kb.name.startswith(KEEP): o.shape_key_remove(kb)
    if o.type == 'MESH':
        for m in o.data.materials:
            if m and 'opacity' in m.name:
                m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
                bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                tex = next((n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE'), None)
                if bsdf and tex: m.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_morph=True, export_skins=True, export_animations=False, export_image_format='AUTO', export_yup=True)
print("DONE", out)
