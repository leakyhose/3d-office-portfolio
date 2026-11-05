"""Bake static lighting for art/newcat.glb (lights from stage.py) into lightmaps.

Normally run via scripts/bake/bake.sh. Direct use:
  Blender -b --python bake.py -- <in.glb> <out_dir> [atlas_size] [samples]
  (BAKE_DEVICE=GPU to try Metal; the first Metal run spends a long time
  compiling kernels, CPU is predictable.)

Lights and the desk arrangement live in stage.py (preview.py renders them from the app's
camera views without baking). Change them there, not in code.

Outputs (in out_dir):
  scene_lm.glb        model, with a 'Lightmap' UV set (TEXCOORD_1) on every baked mesh
  atlas_diffuse.exr   diffuse lighting (direct+indirect, no albedo) for the model's meshes
  atlas_ao.exr        ambient occlusion
  floor_*.exr         same for the floor patch (FLOOR_CENTER / FLOOR_SIZE_M)
Coordinates: three (x, y, z) == Blender (x, -z, y).
"""
import bpy, bmesh, sys, math, os, time
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(__file__))
import stage  # noqa: E402
from stage import t2b, hex_lin  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
IN, OUT = argv[0], argv[1]
SIZE = int(argv[2]) if len(argv) > 2 else 2048
SAMPLES = int(argv[3]) if len(argv) > 3 else 384
# Keep in sync with FLOOR_BAKE_SIZE / FLOOR_BAKE_CENTER in src/scene/office.ts
# The patch covers every shadow the key casts (towards -x, -z); outside it the
# floor is evenly lit, so the runtime's clamped edge texels carry on to the
# horizon.
FLOOR_SIZE_M = 32.0
FLOOR_CENTER = (-2.0, 3.0)  # three x, z
FLOOR_RES = int(os.environ.get('FLOOR_RES', '1024'))
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
scene = bpy.context.scene
stage.arrange(scene)  # desk rearrangement (see stage.OBJECT_MOVES)

# Meshes that get a lightmap. The screen gets a runtime emissive material, so it
# only acts as an occluder here.
SKIP = {'ComputerScreen'}
meshes = [o for o in scene.objects if o.type == 'MESH']
baked = [o for o in meshes if o.name not in SKIP]

# Lightmap texel density per object (linear factor over the uniform default).
# Close-up views get more texels (experience paper + pen, phone, desk top),
# surfaces nobody sees (undersides) fewer.
DENSITY = {
    'EXPERIENCE PAPER': 3.2, 'Pen_ComputerDesk_0': 3.2,
    'Paper2_ComputerDesk_0': 1.6, 'Paper_ComputerDesk_0': 1.6,
    'Phone_stand_ComputerDesk_0': 1.8, 'Phonehandle_ComputerDesk_0': 1.8,
    'Mousepad_ComputerDesk_0': 1.3, 'Mouse_ComputerDesk_0': 1.3,
    'Keyboard_ComputerDesk_0': 1.2, 'Cup': 1.3, 'ubc-logo': 1.3,
    'Cube.010_WhiteFur_0': 1.2,  # cat
    'Drawers_ComputerDesk_0': 0.8, 'Speakers_cable_ComputerDesk_0': 0.6,
    'KeyboardCable_ComputerDesk_0': 0.6, 'BézierCurve': 0.6,
}
DESK_TOP = ('Office_desk_ComputerDesk_0', 1.8)  # upward faces of the desk
UNDERSIDE = 0.4


def face_density(name, normal):
    if normal.z < -0.5:
        return UNDERSIDE
    if name == DESK_TOP[0] and normal.z > 0.9:
        return DESK_TOP[1]
    return DENSITY.get(name, 1.0)


# --- Lightmap UVs ----------------------------------------------------------
def prepare_uv_layers(objs):
    for o in objs:
        me = o.data
        # drop the unused secondary Sketchfab UV set so Lightmap becomes TEXCOORD_1
        while len(me.uv_layers) > 1:
            me.uv_layers.remove(me.uv_layers[-1])
        if len(me.uv_layers) == 0:
            me.uv_layers.new(name='UVMap')  # placeholder TEXCOORD_0
        uv0 = me.uv_layers[0]
        lm = me.uv_layers.new(name='Lightmap')
        me.uv_layers.active = lm
        uv0.active_render = True


def scale_islands(me, objs):
    """Scales every UV island of the joined mesh about its centre by the
    density of its faces, so pack_islands (which keeps relative island sizes)
    hands out texels by importance."""
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv['Lightmap']
    src = bm.faces.layers.int.get('src_face_obj')
    parent = list(range(len(bm.faces)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    bm.faces.ensure_lookup_table()
    for e in bm.edges:
        lf = e.link_loops
        if len(lf) != 2:
            continue
        a, b = lf
        # same island if the UVs agree at both ends of the shared edge
        a0, a1 = a[uvl].uv, a.link_loop_next[uvl].uv
        b0, b1 = b[uvl].uv, b.link_loop_next[uvl].uv
        if (a0 - b1).length < 1e-6 and (a1 - b0).length < 1e-6:
            ra, rb = find(a.face.index), find(b.face.index)
            if ra != rb:
                parent[ra] = rb
    islands = {}
    for f in bm.faces:
        islands.setdefault(find(f.index), []).append(f)
    for faces in islands.values():
        w = max(face_density(objs[f[src]].name, f.normal) for f in faces)
        if abs(w - 1) < 1e-3:
            continue
        loops = [l for f in faces for l in f.loops]
        c = sum((l[uvl].uv for l in loops), Vector((0, 0))) / len(loops)
        for l in loops:
            l[uvl].uv = c + (l[uvl].uv - c) * w
    bm.to_mesh(me)
    bm.free()


def unwrap(objs, size, weighted):
    """Unwraps + packs the Lightmap UVs of `objs` into one shared [0,1] space.
    Works on world-space duplicates joined into ONE object (UV operators are
    unreliable across multi-object edit mode in background), so islands get
    consistent texel density regardless of the wildly varying object scales.
    Corner attributes remember where every loop came from, to copy UVs back."""
    dups = []
    for idx, o in enumerate(objs):
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
        a_face = d.data.attributes.new('src_face_obj', 'INT', 'FACE')
        a_face.data.foreach_set('value', [idx] * len(d.data.polygons))
        for uvl in [u for u in d.data.uv_layers if u.name != 'Lightmap']:
            d.data.uv_layers.remove(uvl)
        dups.append(d)

    bpy.ops.object.select_all(action='DESELECT')
    for d in dups:
        d.select_set(True)
    bpy.context.view_layer.objects.active = dups[0]
    if len(dups) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.data.uv_layers.active = joined.data.uv_layers['Lightmap']
    scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    if weighted:
        scale_islands(joined.data, objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, rotate_method='AXIS_ALIGNED', scale=True, merge_overlap=False, margin_method='FRACTION', margin=4.0 / size, shape_method='AABB')
    bpy.ops.object.mode_set(mode='OBJECT')

    jm = joined.data
    nl = len(jm.loops)
    srcs = [0] * nl; loops = [0] * nl; uvs = [0.0] * (nl * 2)
    jm.attributes['src_obj'].data.foreach_get('value', srcs)
    jm.attributes['src_loop'].data.foreach_get('value', loops)
    jm.uv_layers['Lightmap'].data.foreach_get('uv', uvs)
    per = [[0.0] * (len(o.data.loops) * 2) for o in objs]
    for i in range(nl):
        t = per[srcs[i]]; l = loops[i]
        t[2 * l] = uvs[2 * i]; t[2 * l + 1] = uvs[2 * i + 1]
    for o, buf in zip(objs, per):
        o.data.uv_layers['Lightmap'].data.foreach_set('uv', buf)
    bpy.data.objects.remove(joined, do_unlink=True)


def report_density(objs, size, label):
    # texels per world unit, per object (area-weighted over its faces)
    for o in objs:
        me = o.data
        uv = me.uv_layers['Lightmap'].data
        wa = ua = 0.0
        mw = o.matrix_world
        for p in me.polygons:
            vs = [mw @ me.vertices[v].co for v in p.vertices]
            us = [Vector((*uv[li].uv, 0)) for li in p.loop_indices]
            for k in range(1, len(vs) - 1):
                wa += (vs[k] - vs[0]).cross(vs[k + 1] - vs[0]).length / 2
                ua += (us[k] - us[0]).cross(us[k + 1] - us[0]).length / 2
        if wa > 0:
            print(f'DENSITY {label} {o.name}: {size * math.sqrt(ua / wa):.1f} texels/unit')


print('PHASE unwrap', flush=True)
prepare_uv_layers(baked)
unwrap(baked, SIZE, weighted=True)
report_density(baked, SIZE, 'atlas')

# --- Floor patch -----------------------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=FLOOR_SIZE_M, location=t2b((FLOOR_CENTER[0], -0.01, FLOOR_CENTER[1])))
floor = bpy.context.active_object
floor.name = '__bake_floor'
floor_mat = bpy.data.materials.new('__bake_floor_mat')
floor_mat.use_nodes = True
floor_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*hex_lin(stage.FLOOR_COLOR), 1)
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
# Bake the model against a uniform grey albedo instead (the old realtime
# render had no colour bleeding either) and restore the real colours before
# exporting. The floor keeps its real (plain, dark) colour so it bounces a
# plausible amount of light.
BAKE_ALBEDO = 0.35
saved_base_colors = []
for m in bpy.data.materials:
    if not m.use_nodes or m.name == '__bake_floor_mat':
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

world = stage.add_lights(IN)

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
    which = 'floor' if o is floor else 'atlas'
    for m in o.data.materials:
        if m is None:
            continue
        prev = mats.get(m.name)
        assert prev is None or prev[1] == which, f'material {m.name} shared across lightmaps'
        mats[m.name] = (m, which)
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
    for which in images:
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
