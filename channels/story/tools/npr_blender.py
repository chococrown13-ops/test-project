import bpy, sys, math, numpy as np
from mathutils import Euler, Quaternion, Vector
a = sys.argv[sys.argv.index("--")+1:]; VRM, OUT = a[0], a[1]; RES = int(a[2]) if len(a) > 2 else 1920
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=VRM)
S = bpy.context.scene
arm = next(o for o in S.objects if o.type == 'ARMATURE')
# ---- 색 바꾸기(민재) ----
def lum(p): return 0.3*p[...,0]+0.59*p[...,1]+0.11*p[...,2]
def recolor(img, fn):
    w,h = img.size; px = np.empty(w*h*4, np.float32); img.pixels.foreach_get(px); p = px.reshape(-1,4)
    l = lum(p); out = fn(p, l); p[:, :3] = out; img.pixels.foreach_set(p.ravel()); img.update()
def srgb(c): return np.array(c, np.float32)/255.0
for m in bpy.data.materials:
    tex = next((n for n in (m.node_tree.nodes if m.node_tree else []) if n.type == 'TEX_IMAGE' and n.image), None)
    if not tex: continue
    im = tex.image; n = m.name
    if 'HAIR' in n: recolor(im, lambda p,l: np.stack([(20+l*34)/255,(18+l*26)/255,(20+l*26)/255],1))
    elif 'EyeIris' in n: recolor(im, lambda p,l: np.stack([(40+l*150)/255,(24+l*92)/255,(14+l*48)/255],1))
    elif 'Tops' in n:
        def f(p,l):
            vest = (l < 0.5) & (p[:,2] >= p[:,0] + 4/255)
            jk = np.stack([(24+(0.2+l*1.1)*60)/255,(96+(0.2+l*1.1)*120)/255,(62+(0.2+l*1.1)*70)/255],1)
            sh = np.stack([(40+l*46)/255,(42+l*48)/255,(48+l*52)/255],1)
            return np.where(vest[:,None], jk, sh)
        recolor(im, f)
    elif 'Accessory' in n: recolor(im, lambda p,l: np.stack([(40+l*0.8*46)/255,(42+l*0.8*48)/255,(48+l*0.8*52)/255],1))
    elif 'Bottoms' in n: recolor(im, lambda p,l: np.stack([(40+l*60)/255,(46+l*70)/255,(66+l*90)/255],1))
# ---- 셀(2단) 명암 + 텍스처 ----
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree; nodes = nt.nodes
    tex = next((n for n in nodes if n.type == 'TEX_IMAGE' and n.image and not n.image.name.endswith(('nml','spe','out')) and 'Matcap' not in n.image.name and 'Shader' not in n.image.name), None)
    out = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
    for n in list(nodes):
        if n not in (tex, out): nodes.remove(n)
    diff = nodes.new('ShaderNodeBsdfDiffuse'); s2r = nodes.new('ShaderNodeShaderToRGB'); ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'; e = ramp.color_ramp.elements; e[0].position = 0; e[0].color = ((0.62,0.6,0.72,1) if not any(k in m.name for k in ('_EYE','Eyelash','Eyeline','FaceBrow','FaceMouth')) else (1,1,1,1)); e[1].position = 0.35; e[1].color = (1,1,1,1)
    mix = nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1
    emi = nodes.new('ShaderNodeEmission'); tr = nodes.new('ShaderNodeBsdfTransparent'); ms = nodes.new('ShaderNodeMixShader')
    nt.links.new(diff.outputs[0], s2r.inputs[0]); nt.links.new(s2r.outputs[0], ramp.inputs[0]); nt.links.new(ramp.outputs[0], mix.inputs[1])
    if tex: nt.links.new(tex.outputs['Color'], mix.inputs[2]); nt.links.new(tex.outputs['Alpha'], ms.inputs[0])
    else: mix.inputs[2].default_value = (1,1,1,1); ms.inputs[0].default_value = 1
    nt.links.new(mix.outputs[0], emi.inputs[0]); nt.links.new(tr.outputs[0], ms.inputs[1]); nt.links.new(emi.outputs[0], ms.inputs[2]); nt.links.new(ms.outputs[0], out.inputs[0])
    m.blend_method = 'CLIP'; m.alpha_threshold = 0.4; m.shadow_method = 'NONE'
# ---- 자세: 팔 내리기 ----
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE')
def rot_world(bname, axis, ang):
    pb = arm.pose.bones.get(bname)
    if not pb: return
    pb.rotation_mode = 'QUATERNION'
    M = (arm.matrix_world @ pb.bone.matrix_local).to_3x3().inverted()
    pb.rotation_quaternion = Quaternion(M @ Vector(axis), ang) @ pb.rotation_quaternion
AX = [float(x) for x in (a[3].split(',') if len(a) > 3 else ['0','-1','0'])]
for side, sg in (('L', 1), ('R', -1)):
    rot_world(f'J_Bip_{side}_UpperArm', AX, sg * 1.2)
    rot_world(f'J_Bip_{side}_LowerArm', (0, 0, 1), sg * 0.25)
bpy.ops.object.mode_set(mode='OBJECT')
# 눈·속눈썹·눈썹·입 면에는 선을 안 그림(얼굴이 지저분해지는 것 방지)
for o in S.objects:
    if o.type != 'MESH': continue
    bad = {i for i, ms in enumerate(o.material_slots) if ms.material and any(k in ms.material.name for k in ('_EYE', 'Eyelash', 'Eyeline', 'FaceBrow', 'FaceMouth', 'Face_00_SKIN'))}
    if not bad: continue
    for poly in o.data.polygons: poly.use_freestyle_mark = poly.material_index in bad
# ---- 카메라·빛·선 ----
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); S.collection.objects.link(cam); S.camera = cam
head = arm.matrix_world @ arm.pose.bones['J_Bip_C_Head'].head
cam.data.lens = 55
cam.location = (head.x - 0.5, head.y + 2.3, head.z + 0.08)
d = Vector((head.x - 0.08, head.y, head.z - 0.12)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); S.collection.objects.link(sun); sun.rotation_euler = Euler((math.radians(50), math.radians(-25), math.radians(-30)))
sun.data.energy = 3
S.render.engine = 'BLENDER_EEVEE'; S.render.resolution_x = RES; S.render.resolution_y = RES * 9 // 16; S.render.film_transparent = True
S.world = bpy.data.worlds.new('w'); S.world.color = (0.05, 0.06, 0.1)
S.render.use_freestyle = True; S.render.line_thickness_mode = 'ABSOLUTE'; S.render.line_thickness = 2.2 * RES / 1920
ls = S.view_layers[0].freestyle_settings.linesets[0] if S.view_layers[0].freestyle_settings.linesets else S.view_layers[0].freestyle_settings.linesets.new('L')
ls.select_by_visibility = True; ls.select_silhouette = True; ls.select_border = False; ls.select_crease = False; ls.select_external_contour = True; ls.select_by_face_marks = True; ls.face_mark_negation = 'EXCLUSIVE'; ls.face_mark_condition = 'ONE'
if not ls.linestyle: ls.linestyle = bpy.data.linestyles.new('LS')
ls.linestyle.color = (0.12, 0.08, 0.07); ls.linestyle.thickness = 2.4 * RES / 1920
S.view_settings.view_transform = 'Standard'
import os, json
LINE = os.environ.get('NPR_LINE')
if not LINE:
    S.render.filepath = OUT; bpy.ops.render.render(write_still=True); print('NPR_DONE', OUT)
else:
    ln = json.load(open(LINE)); FPS = 24; S.render.fps = FPS; lead = 0.4
    N = int((ln['dur'] + lead + 0.6) * FPS); S.frame_start = 0; S.frame_end = N - 1
    import struct
    raw = open(VRM, 'rb').read(); jl = struct.unpack('<I', raw[12:16])[0]; TN = json.loads(raw[20:20 + jl])['meshes'][0]['primitives'][0]['extras']['targetNames']
    face = next(o for o in S.objects if o.type == 'MESH' and o.data.shape_keys)
    KB = {TN[int(k.name.split('_')[1])].split('Fcl_')[-1]: k for k in face.data.shape_keys.key_blocks if k.name.startswith('target_')}
    VIS = {'A': {'MTH_Close': 0.5}, 'B': {'MTH_I': 0.35}, 'C': {'MTH_E': 0.6}, 'D': {'MTH_A': 0.85}, 'E': {'MTH_O': 0.75}, 'F': {'MTH_U': 0.75}, 'G': {'MTH_I': 0.3}, 'H': {'MTH_A': 0.45, 'MTH_E': 0.2}, 'X': {}}
    def cue(u):
        v = 'X'
        for ct, c in ln['cues']:
            if ct <= u: v = c
            else: break
        return v
    blinks = [0.5, 3.3]
    head = arm.pose.bones['J_Bip_C_Head']; head.rotation_mode = 'XYZ'
    for f in range(N):
        t = f / FPS; u = t - lead; w = {}
        for dt, k in ((-0.045, 0.3), (0, 0.45), (0.03, 0.25)):
            for n, v in VIS[cue(u + dt) if 0 <= u <= ln['dur'] else 'X'].items(): w[n] = w.get(n, 0) + v * k
        for n in ('MTH_A', 'MTH_I', 'MTH_U', 'MTH_E', 'MTH_O', 'MTH_Close', 'EYE_Close', 'BRW_Sorrow', 'EYE_Sorrow'):
            kb = KB.get(n)
            if not kb: continue
            val = w.get(n, 0)
            if n == 'EYE_Close': val = max(0, 1 - abs(min((t - b for b in blinks), key=abs)) / 0.08) if any(abs(t - b) < 0.08 for b in blinks) else 0
            if n == 'BRW_Sorrow': val = 0.6
            if n == 'EYE_Sorrow': val = 0.3
            kb.value = val; kb.keyframe_insert('value', frame=f)
        head.rotation_euler = (0.03 * math.sin(t * 2.2), 0.04 * math.sin(t * 1.3), 0); head.keyframe_insert('rotation_euler', frame=f)
    S.render.image_settings.file_format = 'PNG'; S.render.image_settings.color_mode = 'RGBA'
    S.render.filepath = OUT; bpy.ops.render.render(animation=True); print('NPR_ANIM_DONE', N)
