"""Bake static lighting for art/newcat.glb into a lightmap atlas.

Normally run via scripts/bake/bake.sh. Direct use:
  Blender -b --python bake.py -- <in.glb> <out_dir> [atlas_size] [samples]
  (BAKE_DEVICE=GPU to try Metal; the first Metal run spends a long time
  compiling kernels, CPU is predictable: ~1-4 min for 2048px @ 384 samples.)

The lights mirror what the app used to render in real time (Scene.tsx before
the bake + CRTLight.tsx): key sun, faint rim sun, the bluish CRT spot, a
hemisphere fill and the lebombo HDR at 0.08. Change them here, not in code.

Outputs (in out_dir):
  scene_lm.glb        original scene + a 'Lightmap' UV set (TEXCOORD_1) on every baked mesh
  atlas_diffuse.exr   diffuse lighting (direct+indirect, no albedo) for all baked meshes
  atlas_ao.exr        ambient occlusion
  floor_diffuse.exr / floor_ao.exr   same for a 40x40 floor patch centred on the origin
Coordinates: three (x, y, z) == Blender (x, -z, y).
"""
import bpy, sys, math, os, time
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
IN, OUT = argv[0], argv[1]
SIZE = int(argv[2]) if len(argv) > 2 else 2048
SAMPLES = int(argv[3]) if len(argv) > 3 else 384
FLOOR_SIZE_M = 40.0
FLOOR_RES = int(os.environ.get('FLOOR_RES', '512'))
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
scene = bpy.context.scene


def t2b(v):  # three -> blender coords
    return Vector((v[0], -v[2], v[1]))


def srgb_to_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h):
    h = h.lstrip('#')
    return tuple(srgb_to_lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))


# Meshes that get a lightmap. The screen gets a runtime emissive material, so it
# only acts as an occluder here.
SKIP = {'ComputerScreen'}
meshes = [o for o in scene.objects if o.type == 'MESH']
baked = [o for o in meshes if o.name not in SKIP]

# --- Lightmap UVs ----------------------------------------------------------
for o in baked:
    me = o.data
    # drop the unused secondary Sketchfab UV set so Lightmap becomes TEXCOORD_1
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[-1])
    uv0 = me.uv_layers[0]
    lm = me.uv_layers.new(name='Lightmap')
    me.uv_layers.active = lm
    uv0.active_render = True

# Unwrap on world-space duplicates joined into ONE object (UV operators are
# unreliable across multi-object edit mode in background), so islands get
# consistent texel density regardless of the wildly varying object scales.
# Corner attributes remember where every loop came from, to copy UVs back.
dups = []
for idx, o in enumerate(baked):
    d = o.copy()
    d.data = o.data.copy()
    scene.collection.objects.link(d)
    d.data.transform(o.matrix_world)
    d.matrix_world = Matrix.Identity(4)
    n = len(d.data.loops)
    a_obj = d.data.attributes.new('src_obj', 'INT', 'CORNER')
    a_obj.data.foreach_set('value', [idx] * n)
    a_loop = d.data.attributes.new('src_loop', 'INT', 'CORNER')
    a_loop.data.foreach_set('value', list(range(n)))
    # only keep the Lightmap UV on the duplicate
    for uvl in [u for u in d.data.uv_layers if u.name != 'Lightmap']:
        d.data.uv_layers.remove(uvl)
    dups.append(d)

bpy.ops.object.select_all(action='DESELECT')
for d in dups:
    d.select_set(True)
bpy.context.view_layer.objects.active = dups[0]
bpy.ops.object.join()
joined = bpy.context.view_layer.objects.active
joined.data.uv_layers.active = joined.data.uv_layers['Lightmap']
scene.tool_settings.use_uv_select_sync = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
print('PHASE unwrap', flush=True)
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, rotate_method='AXIS_ALIGNED', scale=True, merge_overlap=False, margin_method='FRACTION', margin=4.0 / SIZE, shape_method='AABB')
bpy.ops.object.mode_set(mode='OBJECT')

jm = joined.data
nl = len(jm.loops)
objs = [0] * nl; loops = [0] * nl; uvs = [0.0] * (nl * 2)
jm.attributes['src_obj'].data.foreach_get('value', objs)
jm.attributes['src_loop'].data.foreach_get('value', loops)
jm.uv_layers['Lightmap'].data.foreach_get('uv', uvs)
per = [[0.0] * (len(o.data.loops) * 2) for o in baked]
for i in range(nl):
    t = per[objs[i]]; l = loops[i]
    t[2 * l] = uvs[2 * i]; t[2 * l + 1] = uvs[2 * i + 1]
for o, buf in zip(baked, per):
    o.data.uv_layers['Lightmap'].data.foreach_set('uv', buf)
bpy.data.objects.remove(joined, do_unlink=True)

# --- Floor patch -----------------------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=FLOOR_SIZE_M, location=(0, 0, -0.01))
floor = bpy.context.active_object
floor.name = '__bake_floor'
floor_mat = bpy.data.materials.new('__bake_floor_mat')
floor_mat.use_nodes = True
floor_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*hex_lin('#1e1a15'), 1)
floor_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
floor.data.materials.append(floor_mat)
floor.data.uv_layers[0].name = 'Lightmap'

# Paper2_ComputerDesk_0 has no material in the glTF (three renders it with the
# default white MeshStandardMaterial). Give it a temporary one for the bake.
tmp_mats = []
for o in baked:
    if len(o.data.materials) == 0:
        m = bpy.data.materials.new('__bake_default')
        m.use_nodes = True
        o.data.materials.append(m)
        tmp_mats.append((o, m))

# Only the UBC sticker is a real alpha decal; make sure nothing else is treated
# as partly transparent during the bake (all other materials are OPAQUE in the
# glTF, so this doesn't change the export).
for m in bpy.data.materials:
    if not m.use_nodes or m.name == 'ubc-logo':
        continue
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            for link in list(n.inputs['Alpha'].links):
                m.node_tree.links.remove(link)
            n.inputs['Alpha'].default_value = 1.0

# Cycles' "diffuse light" pass (no Color) is the diffuse result divided by the
# albedo, which collapses to 0 wherever the albedo is ~0 (printed text, black
# logos, dark palette texels) and imprints the textures into the lighting.
# Bake against a uniform grey albedo instead (the old realtime render had no
# colour bleeding either) and restore the real colours before exporting.
BAKE_ALBEDO = 0.35
saved_base_colors = []
for m in bpy.data.materials:
    if not m.use_nodes or m.name == '__bake_floor_mat':  # floor keeps its real (dark) albedo
        continue
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            sock = n.inputs['Base Color']
            links = [(l.from_socket, sock) for l in sock.links]
            saved_base_colors.append((m, sock, tuple(sock.default_value), links))
            for l in list(sock.links):
                m.node_tree.links.remove(l)
            sock.default_value = (BAKE_ALBEDO, BAKE_ALBEDO, BAKE_ALBEDO, 1)

# The paper sheets are coplanar, stacked quads; letting them occlude each other
# makes the bake z-fight (garbage shadows on the experience paper). Their only
# relevant occluder is the pen, so take the sheets out of light transport.
for name in ('EXPERIENCE PAPER', 'Paper2_ComputerDesk_0', 'Paper_ComputerDesk_0'):
    ob = scene.objects.get(name)
    if ob:
        ob.visible_shadow = False
        ob.visible_diffuse = False
        ob.visible_glossy = False

# --- Lights (mirror src/components/Scene.tsx + CRTLight.tsx) -----------------
def add_sun(name, pos3, color, strength, angle_deg):
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = strength
    ld.color = color
    ld.angle = math.radians(angle_deg)
    ob = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(ob)
    d = -t2b(pos3).normalized()
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return ob

add_sun('__key', (14.2, 13.3, 12.3), hex_lin('#ffe0a0'), 2.8, 1.5)
add_sun('__rim', (30, 20, -10), hex_lin('#ffe8cc'), 0.03, 3)

scr = scene.objects['ComputerScreen']
bb = [scr.matrix_world @ Vector(c) for c in scr.bound_box]
center = sum(bb, Vector()) / 8
normal = (scr.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()  # three local +Z
home = t2b((-5.9, 10.47, 14.15))
if (home - center).dot(normal) < 0:
    normal = -normal
spot_pos = center + normal * 0.3
spot_tgt = center + normal * 1.5 + Vector((0, 0, -2))
sd = bpy.data.lights.new('__crt', 'SPOT')
sd.energy = 4 * math.pi * 2.5  # three candela -> Blender watts
sd.color = hex_lin('#a0c0ff')
sd.spot_size = math.pi / 2
sd.spot_blend = 0.6
sd.shadow_soft_size = 0.15
so = bpy.data.objects.new('__crt', sd)
scene.collection.objects.link(so)
so.location = spot_pos
so.rotation_euler = (spot_tgt - spot_pos).normalized().to_track_quat('-Z', 'Y').to_euler()

# World = hemisphere light (0.2) + HDR environment (x0.08), both as radiance.
world = bpy.data.worlds.new('__bake_world')
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
outn = nt.nodes.new('ShaderNodeOutputWorld')
bg = nt.nodes.new('ShaderNodeBackground')
bg.inputs['Strength'].default_value = 1.0
texco = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(texco.outputs['Generated'], sep.inputs[0])
mapr = nt.nodes.new('ShaderNodeMapRange')  # z in [-1,1] -> [0,1]
mapr.inputs['From Min'].default_value = -1
mapr.inputs['From Max'].default_value = 1
nt.links.new(sep.outputs['Z'], mapr.inputs['Value'])
hemi = nt.nodes.new('ShaderNodeMix')
hemi.data_type = 'RGBA'
k = 0.2 / math.pi
hemi.inputs['A'].default_value = (*[c * k for c in hex_lin('#0f0d0a')], 1)
hemi.inputs['B'].default_value = (*[c * k for c in hex_lin('#c4a878')], 1)
nt.links.new(mapr.outputs['Result'], hemi.inputs['Factor'])
hdr_path = os.path.join(os.path.dirname(IN), 'lebombo_1k.hdr')
add = nt.nodes.new('ShaderNodeMix')
add.data_type = 'RGBA'
add.blend_type = 'ADD'
add.inputs['Factor'].default_value = 1.0
nt.links.new(hemi.outputs['Result'], add.inputs['A'])
if os.path.exists(hdr_path):
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(hdr_path)
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Rotation'].default_value = (0, 0, math.pi)  # three vs Blender equirect seam
    tc2 = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(tc2.outputs['Generated'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
    sc = nt.nodes.new('ShaderNodeMix')
    sc.data_type = 'RGBA'
    sc.blend_type = 'MULTIPLY'
    sc.inputs['Factor'].default_value = 1.0
    sc.inputs['B'].default_value = (0.08, 0.08, 0.08, 1)
    nt.links.new(env.outputs['Color'], sc.inputs['A'])
    nt.links.new(sc.outputs['Result'], add.inputs['B'])
else:
    add.inputs['B'].default_value = (0, 0, 0, 1)
nt.links.new(add.outputs['Result'], bg.inputs['Color'])
nt.links.new(bg.outputs['Background'], outn.inputs['Surface'])

print('PHASE lights done', flush=True)
# --- Bake ------------------------------------------------------------------
scene.render.engine = 'CYCLES'
DEVICE = os.environ.get('BAKE_DEVICE', 'CPU')
if DEVICE == 'CPU':
    scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'AUTO'
else:
  try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for dv in prefs.devices:
        dv.use = True
    scene.cycles.device = 'GPU'
  except Exception as e:
    print('GPU setup failed', e)
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
# Margin 0: Blender applies the margin per object, so with many objects in one
# tightly packed atlas a later object's margin overwrites earlier islands.
# encode.py dilates islands afterwards using the alpha coverage mask.
scene.render.bake.margin = 0
scene.render.bake.margin_type = 'EXTEND'
scene.render.bake.use_clear = True


def new_img(name, size):
    img = bpy.data.images.new(name, size, size, alpha=True, float_buffer=True)
    img.generated_color = (0, 0, 0, 0)
    img.colorspace_settings.name = 'Non-Color'
    return img

images = {
    'atlas': {'diffuse': new_img('atlas_diffuse', SIZE), 'ao': new_img('atlas_ao', SIZE)},
    'floor': {'diffuse': new_img('floor_diffuse', FLOOR_RES), 'ao': new_img('floor_ao', FLOOR_RES)},
}
bake_objs = baked + [floor]
mats = {}
for o in bake_objs:
    for m in o.data.materials:
        if m is None:
            continue
        mats[m.name] = (m, 'floor' if o is floor else 'atlas')
img_nodes = {}
for name, (m, which) in mats.items():
    m.use_nodes = True
    n = m.node_tree.nodes.new('ShaderNodeTexImage')
    n.name = '__bake_target'
    uvn = m.node_tree.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'Lightmap'
    m.node_tree.links.new(uvn.outputs['UV'], n.inputs['Vector'])
    img_nodes[name] = (n, which, uvn)

bpy.ops.object.select_all(action='DESELECT')
for o in bake_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = bake_objs[0]

for kind in ('diffuse', 'ao'):
    for name, (n, which, _) in img_nodes.items():
        n.image = images[which][kind]
        m = mats[name][0]
        for nn in m.node_tree.nodes:
            nn.select = False
        n.select = True
        m.node_tree.nodes.active = n
    t0 = time.time()
    print('PHASE bake', kind, flush=True)
    if kind == 'diffuse':
        scene.render.bake.use_pass_direct = True
        scene.render.bake.use_pass_indirect = True
        scene.render.bake.use_pass_color = False
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=0, use_clear=True)
    else:
        scene.cycles.samples = max(16, SAMPLES // 4)
        world.light_settings.distance = 1.5
        bpy.ops.object.bake(type='AO', margin=0, use_clear=True)
    print(f'BAKE {kind} took {time.time() - t0:.1f}s')
    for which in ('atlas', 'floor'):
        img = images[which][kind]
        img.filepath_raw = os.path.join(OUT, f'{which}_{kind}.exr')
        img.file_format = 'OPEN_EXR'
        img.save()

# --- Clean up + export -----------------------------------------------------
for m, sock, value, links in saved_base_colors:
    sock.default_value = value
    for from_socket, to_socket in links:
        m.node_tree.links.new(from_socket, to_socket)
for name, (n, which, uvn) in img_nodes.items():
    nt_ = mats[name][0].node_tree
    nt_.nodes.remove(n)
    nt_.nodes.remove(uvn)
for o, m in tmp_mats:
    o.data.materials.clear()
    bpy.data.materials.remove(m)
for ob in [o for o in scene.objects if o.name.startswith('__')]:
    bpy.data.objects.remove(ob, do_unlink=True)
for o in baked:
    o.data.uv_layers.active = o.data.uv_layers[0]
    o.data.uv_layers[0].active_render = True

bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, 'scene_lm.glb'),
    export_format='GLB',
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
    export_yup=True,
    export_apply=False,
    export_lights=False,
    export_cameras=False,
    export_extras=False,
)
print('DONE')
