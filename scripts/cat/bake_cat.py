"""Puts the cats (art/cat.glb on the desk, art/chair_cat.glb on the chair) into
the runtime scene without re-baking the rest.

Normally run via scripts/cat/bake_cat.sh. Direct use:
  Blender -b --python bake_cat.py -- <office_plain.glb> <art/newcat.glb> <old_atlas.png> <out_dir> [samples=384]

office_plain.glb is the current src/assets/office.glb, decoded (no meshopt /
quantization): every mesh keeps the lightmap UVs it already has. The cats are
swapped in, unwrapped into the gaps between the other islands of the lightmap
atlas, and only the cats and what they stand on around them (the desk top, the
chair: their shadows) are baked, with stage.py's lights; those texels are then
laid over the existing atlas. Everything else in the atlas, and the floor
lightmap, stay as they are.

Outputs (in out_dir): scene_lm.glb, atlas.png (+ the bake's EXRs).
Coordinates: three (x, y, z) == Blender (x, -z, y).
"""
import bpy, bmesh, sys, os, math, time
import numpy as np
import OpenImageIO as oiio
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'bake'))
import stage  # noqa: E402
import encode  # noqa: E402
from stage import t2b, hex_lin  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
OFFICE, MODEL, OLD_ATLAS, OUT = argv[:4]
SAMPLES = int(argv[4]) if len(argv) > 4 else 384
os.makedirs(OUT, exist_ok=True)

DESK = 'Office_desk_ComputerDesk_0'
# What a cat stands on is re-lit within NEAR of the cat (Blender XY distance),
# fading into the existing atlas by FAR: covers the cat's shadow and its
# contact darkening.
NEAR, FAR = 2.0, 3.0
GUTTER = 5  # texels kept between the cat's islands and everything else
DENSITY = float(os.environ.get('CAT_DENSITY', 120))  # lightmap texels per unit on the cat, if that fits
FACET = float(os.environ.get('CAT_FACET', 25))  # degrees: edges gentler than this are inside one facet
# How far each facet's lighting is pulled towards its own average: the hard
# shadows the cat casts on itself are too fine for the lightmap (stair-steps)
# and too harsh for a figure this small.
EVEN = float(os.environ.get('CAT_EVEN', 0.6))
# How much of the chair cat's shadow the seat takes: in full it is a dark
# hole in the middle of the home view.
SHADE = float(os.environ.get('CAT_SHADE', 0.6))
FLOOR_SIZE_M, FLOOR_CENTER = 32.0, (-2.0, 3.0)  # as bake.py

old = oiio.ImageBuf(OLD_ATLAS).get_pixels(oiio.UINT8)[..., :3]
SIZE = old.shape[0]
assert old.shape[1] == SIZE

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=OFFICE)
scene = bpy.context.scene
cats = [stage.replace_cat(scene, stage.cat_path(MODEL)), stage.place_chair_cat(scene, stage.chair_cat_path(MODEL))]
others = []
for o in scene.objects:
    if o.type != 'MESH' or o in cats or len(o.data.uv_layers) < 2:
        continue
    o.data.uv_layers[1].name = 'Lightmap'
    others.append(o)
# what each cat stands on
grounds = [scene.objects[DESK], scene.objects[stage.CHAIR]]


# --- rasterising lightmap UVs ----------------------------------------------------
def uv_tris(o):
    """(n, 3, 2) lightmap UVs and (n, 3, 3) world positions of o's triangles."""
    me = o.data
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    loops = np.zeros(n * 3, np.int32)
    me.loop_triangles.foreach_get('loops', loops)
    verts = np.zeros(n * 3, np.int32)
    me.loop_triangles.foreach_get('vertices', verts)
    uv = np.zeros(len(me.loops) * 2, np.float32)
    me.uv_layers['Lightmap'].data.foreach_get('uv', uv)
    co = np.zeros(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    mw = np.array(o.matrix_world)
    world = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
    return uv.reshape(-1, 2)[loops].reshape(n, 3, 2), world[verts].reshape(n, 3, 3)


def raster(tris, attrs=None):
    """Coverage mask (rows top-down, like the image files) of UV triangles; with
    attrs (n, 3, k), also their interpolated values. Texel centres within half
    a texel of a triangle count as covered."""
    mask = np.zeros((SIZE, SIZE), bool)
    img = np.zeros((SIZE, SIZE, attrs.shape[2]), np.float32) if attrs is not None else None
    px = tris.copy()
    px[..., 0] *= SIZE
    px[..., 1] = (1 - px[..., 1]) * SIZE
    for i, t in enumerate(px):
        x0, y0 = np.floor(t.min(0) - 1).astype(int)
        x1, y1 = np.ceil(t.max(0) + 1).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, SIZE), min(y1, SIZE)
        if x1 <= x0 or y1 <= y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = t
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12:
            continue
        w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
        w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        w2 = 1 - w0 - w1
        # half a texel of slack, in barycentric units
        e = 0.5 * max(np.hypot(by - cy, cx - bx), np.hypot(cy - ay, ax - cx), np.hypot(ay - by, bx - ax)) / abs(d)
        inside = (w0 >= -e) & (w1 >= -e) & (w2 >= -e)
        if not inside.any():
            continue
        sub = mask[y0:y1, x0:x1]
        if img is not None:
            w = np.clip(np.stack([w0, w1, w2], -1), 0, 1)
            w /= w.sum(-1, keepdims=True)
            vals = w @ attrs[i]
            new = inside & ~sub
            img[y0:y1, x0:x1][new] = vals[new]
        sub |= inside
    return mask, img


def grow(mask, n):
    for _ in range(n):
        m = mask.copy()
        m[1:] |= mask[:-1]; m[:-1] |= mask[1:]; m[:, 1:] |= mask[:, :-1]; m[:, :-1] |= mask[:, 1:]
        m[1:, 1:] |= mask[:-1, :-1]; m[:-1, :-1] |= mask[1:, 1:]; m[1:, :-1] |= mask[:-1, 1:]; m[:-1, 1:] |= mask[1:, :-1]
        mask = m
    return mask


def place(blocked, h, w):
    """Top-left (row, col) of the first free h x w box, or None."""
    ii = np.zeros((SIZE + 1, SIZE + 1), np.int32)
    ii[1:, 1:] = blocked.cumsum(0, dtype=np.int32).cumsum(1, dtype=np.int32)
    if h > SIZE or w > SIZE:
        return None
    tot = ii[h:, w:] - ii[:-h, w:] - ii[h:, :-w] + ii[:-h, :-w]
    free = np.argwhere(tot == 0)
    return (int(free[0][0]), int(free[0][1])) if len(free) else None


def uv_islands(me, uv, group):
    """Faces grouped into UV islands (lists of polygon indices), split where
    the faces' group changes."""
    parent = list(range(len(me.polygons)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    seen = {}
    for p in me.polygons:
        for li in p.loop_indices:
            key = (me.loops[li].vertex_index, round(float(uv[li][0]), 5), round(float(uv[li][1]), 5), group[p.index])
            if key in seen:
                parent[find(p.index)] = find(seen[key])
            else:
                seen[key] = p.index
    out = {}
    for p in me.polygons:
        out.setdefault(find(p.index), []).append(p.index)
    return list(out.values())


def pack_into_gaps(me, uv, group, blocked, density, k):
    """Moves every island of uv (uniform scale: k UV units per world unit) into
    free atlas space at `density` texels per world unit, largest first.
    Returns the new UVs and the space then taken, or None if they don't all fit."""
    blocked = blocked.copy()
    out = uv.copy()
    islands = []
    for faces in uv_islands(me, uv, group):
        loops = [li for f in faces for li in me.polygons[f].loop_indices]
        px = (uv[loops] - uv[loops].min(0)) / k * density
        islands.append((loops, px))
    islands.sort(key=lambda it: -it[1].max(0).prod())
    pad = 1
    for loops, px in islands:
        w, h = (np.ceil(px.max(0)).astype(int) + 2 * pad + 1)
        at = place(blocked, h, w)
        if at is None:
            return None
        r, c = at
        out[loops, 0] = (c + pad + px[:, 0]) / SIZE
        out[loops, 1] = 1 - (r + pad + px[:, 1]) / SIZE
        blocked[max(r - 3, 0):r + h + 3, max(c - 3, 0):c + w + 3] = True
    return out, blocked


print('PHASE coverage', flush=True)
t0 = time.time()
used = np.zeros((SIZE, SIZE), bool)
for o in others:
    used |= raster(uv_tris(o)[0])[0]
print(f'atlas coverage without the cat: {used.mean():.3f} ({time.time() - t0:.0f}s)')
blocked = grow(used, GUTTER)

# --- the cats' lightmap UVs ------------------------------------------------------
cat_mask = np.zeros((SIZE, SIZE), bool)
cat_facet = np.zeros((SIZE, SIZE), np.int64)
facets_so_far = 0
for cat in cats:
  me = cat.data
  bm = bmesh.new()
  bm.from_mesh(me)
  bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)  # the glTF has every face split off
  bm.to_mesh(me)
  bm.free()
  # Lit in clear polygons, like everything else in the room: only the edges
  # gentler than FACET are smoothed over, so the triangles of one facet are lit
  # as one face (welding dropped the glTF's normals).
  if 'custom_normal' in me.attributes:
    me.attributes.remove(me.attributes['custom_normal'])
  for p in me.polygons:
    p.use_smooth = True
  me.set_sharp_from_angle(angle=math.radians(FACET))
  # the facets: triangles joined across the smoothed edges
  bm = bmesh.new()
  bm.from_mesh(me)
  bm.faces.ensure_lookup_table()
  facet_of = list(range(len(bm.faces)))
  def _root(i):
    while facet_of[i] != i:
      facet_of[i] = facet_of[facet_of[i]]
      i = facet_of[i]
    return i
  for e in bm.edges:
    if e.smooth and len(e.link_faces) == 2 and e.link_faces[0].material_index == e.link_faces[1].material_index:
      facet_of[_root(e.link_faces[0].index)] = _root(e.link_faces[1].index)
  facet_of = np.array([_root(i) for i in range(len(bm.faces))], np.float32)
  bm.free()
  print('CAT facets:', cat.name, len(set(facet_of.tolist())), 'of', len(facet_of), 'triangles')
  while len(me.uv_layers):
    me.uv_layers.remove(me.uv_layers[-1])
  me.uv_layers.new(name='UVMap')  # placeholder TEXCOORD_0, so Lightmap is TEXCOORD_1
  me.uv_layers.new(name='Lightmap')
  me.uv_layers.active = me.uv_layers['Lightmap']
  bpy.ops.object.select_all(action='DESELECT')
  cat.select_set(True)
  bpy.context.view_layer.objects.active = cat
  scene.tool_settings.use_uv_select_sync = True
  bpy.ops.object.mode_set(mode='EDIT')
  bpy.ops.mesh.select_all(action='SELECT')
  bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
  bpy.ops.object.mode_set(mode='OBJECT')
  uv = np.zeros(len(me.loops) * 2, np.float32)
  me.uv_layers['Lightmap'].data.foreach_get('uv', uv)
  uv = uv.reshape(-1, 2)
  area_w = sum(p.area for p in me.polygons)  # the cat's matrix has no scale
  area_uv = 0.0
  for p in me.polygons:
    q = uv[list(p.loop_indices)]
    area_uv += abs(float(np.cross(q[1] - q[0], q[2] - q[0]))) / 2
  k = math.sqrt(area_uv / area_w)
  density = DENSITY
  while True:  # into the gaps between the other islands, as dense as fits
    # an island to each facet: no lightmap texel is shared across a hard edge
    packed = pack_into_gaps(me, uv, facet_of, blocked, density, k)
    if packed is not None:
      break
    density *= 0.94
  uv, blocked = packed
  print(f'DENSITY {cat.name}: {density:.1f} texels/unit')
  me.uv_layers['Lightmap'].data.foreach_set('uv', uv.ravel())
  me.uv_layers.active = me.uv_layers[0]
  me.uv_layers[0].active_render = True

  cat_tris, cat_world = uv_tris(cat)
  me.calc_loop_triangles()
  tri_poly = np.zeros(len(me.loop_triangles), np.int32)
  me.loop_triangles.foreach_get('polygon_index', tri_poly)
  mask, facet = raster(cat_tris, np.repeat(facet_of[tri_poly] + facets_so_far, 3).reshape(-1, 3, 1))
  assert not (grow(mask, 2) & grow(used | cat_mask, 2)).any(), 'cat islands touch other islands'
  cat_facet[mask] = facet[..., 0][mask].astype(np.int64)
  cat_mask |= mask
  facets_so_far += len(facet_of)

# where on the desk and the chair the new bake replaces the old one
ground_mask = np.zeros((SIZE, SIZE), bool)
weight = np.zeros((SIZE, SIZE), np.float32)
for cat, ground in zip(cats, grounds):
    mask, pos = raster(*uv_tris(ground))
    at = cat.matrix_world.translation
    dist = np.hypot(pos[..., 0] - at.x, pos[..., 1] - at.y)
    t = np.clip((FAR - dist) / (FAR - NEAR), 0, 1)
    weight = np.where(mask, t * t * (3 - 2 * t), weight).astype(np.float32)
    ground_mask |= mask

# --- scene for the bake (as bake.py) ---------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=FLOOR_SIZE_M, location=t2b((FLOOR_CENTER[0], -0.01, FLOOR_CENTER[1])))
floor = bpy.context.active_object
floor.name = '__bake_floor'
floor_mat = bpy.data.materials.new('__bake_floor_mat')
floor_mat.use_nodes = True
floor_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*hex_lin(stage.FLOOR_COLOR), 1)
floor_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
floor.data.materials.append(floor_mat)

tmp_mats = []
for o in scene.objects:
    if o.type == 'MESH' and len(o.data.materials) == 0:
        m = bpy.data.materials.new('__bake_default')
        m.use_nodes = True
        o.data.materials.append(m)
        tmp_mats.append((o, m))
BAKE_ALBEDO = 0.35
saved = []
for m in bpy.data.materials:
    if not m.use_nodes or m.name == '__bake_floor_mat':
        continue
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            if m.name != 'ubc-logo':
                for link in list(n.inputs['Alpha'].links):
                    m.node_tree.links.remove(link)
                n.inputs['Alpha'].default_value = 1.0
            sock = n.inputs['Base Color']
            saved.append((m, sock, tuple(sock.default_value), [(l.from_socket, sock) for l in sock.links]))
            for l in list(sock.links):
                m.node_tree.links.remove(l)
            sock.default_value = (BAKE_ALBEDO, BAKE_ALBEDO, BAKE_ALBEDO, 1)
for name in ('EXPERIENCE PAPER', 'Paper2_ComputerDesk_0', 'Paper_ComputerDesk_0'):
    ob = scene.objects.get(name)
    if ob:
        ob.visible_shadow = ob.visible_diffuse = ob.visible_glossy = False

world = stage.add_lights(MODEL)
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
scene.render.bake.margin = 0
scene.render.bake.use_clear = True

targets = cats + grounds
for o in targets:  # Cycles bakes into the active UV layer
    o.data.uv_layers.active = o.data.uv_layers['Lightmap']
images = {}
for kind in ('diffuse', 'ao'):
    img = bpy.data.images.new('atlas_' + kind, SIZE, SIZE, alpha=True, float_buffer=True)
    img.generated_color = (0, 0, 0, 0)
    img.colorspace_settings.name = 'Non-Color'
    images[kind] = img
nodes = []
for m in {m for o in targets for m in o.data.materials if m}:
    n = m.node_tree.nodes.new('ShaderNodeTexImage')
    uvn = m.node_tree.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'Lightmap'
    m.node_tree.links.new(uvn.outputs['UV'], n.inputs['Vector'])
    nodes.append((m, n, uvn))


def bake(objs, name):
    """Bakes objs' lighting into <name>_diffuse.exr and <name>_ao.exr."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for kind in ('diffuse', 'ao'):
        for m, n, _ in nodes:
            n.image = images[kind]
            for nn in m.node_tree.nodes:
                nn.select = False
            n.select = True
            m.node_tree.nodes.active = n
        t0 = time.time()
        print('PHASE bake', name, kind, flush=True)
        if kind == 'diffuse':
            scene.cycles.samples = SAMPLES
            bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=0, use_clear=True)
        else:
            scene.cycles.samples = max(16, SAMPLES // 4)
            world.light_settings.distance = 1.5
            bpy.ops.object.bake(type='AO', margin=0, use_clear=True)
        print(f'BAKE {name} {kind} took {time.time() - t0:.1f}s', flush=True)
        images[kind].filepath_raw = os.path.join(OUT, f'{name}_{kind}.exr')
        images[kind].file_format = 'OPEN_EXR'
        images[kind].save()


bake(targets, 'atlas')
# The chair once more, without its cat: this machine's Cycles lights the chair
# a little differently from the bake the atlas came from, so the chair keeps
# its old lighting and only takes the cat's shadow, as the ratio of the two.
chair = grounds[1]
cats[1].hide_render = True
bake([chair], 'bare')
cats[1].hide_render = False

# --- export the model ------------------------------------------------------------
for m, sock, value, links in saved:
    sock.default_value = value
    for a, b in links:
        m.node_tree.links.new(a, b)
for m, n, uvn in nodes:
    m.node_tree.nodes.remove(n)
    m.node_tree.nodes.remove(uvn)
for o, m in tmp_mats:
    o.data.materials.clear()
    bpy.data.materials.remove(m)
for ob in [o for o in scene.objects if o.name.startswith('__')]:
    bpy.data.objects.remove(ob, do_unlink=True)
for o in targets:
    o.data.uv_layers.active = o.data.uv_layers[0]
    o.data.uv_layers[0].active_render = True
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, 'scene_lm.glb'), export_format='GLB', export_texcoords=True, export_normals=True,
    export_materials='EXPORT', export_image_format='AUTO', export_yup=True, export_apply=False,
    export_lights=False, export_cameras=False, export_extras=False,
)

# --- lay the new texels over the existing atlas ----------------------------------
final, _ = encode.combine(OUT, 'atlas')
for i in np.unique(cat_facet[cat_mask]):
    m = cat_mask & (cat_facet == i)
    final[m] += (final[m].mean(0) - final[m]) * EVEN
grown = grow(cat_mask, GUTTER - 2)
final[grown] = encode.dilate(np.where(cat_mask[..., None], final, 0), cat_mask, GUTTER)[grown]
bare, _ = encode.combine(OUT, 'bare')
chair_mask = grow(raster(uv_tris(chair)[0])[0], GUTTER - 2)  # and its gutters, which the filtering reads
shade = 1 - SHADE * (1 - np.clip(final.mean(-1) / np.maximum(bare.mean(-1), 1e-4), 0, 1))  # the cat only darkens
old_lin = np.where(old <= 0.04045 * 255, old / 255 / 12.92, ((old / 255 + 0.055) / 1.055) ** 2.4) * encode.SCALE
final[chair_mask] = (old_lin * shade[..., None])[chair_mask]
new = encode.to_srgb8(final).astype(np.float32)
w = weight.copy()
edge = ground_mask.copy()
for _ in range(2):  # carry the grounds' weights two texels into their gutters
    acc = np.zeros_like(w); cnt = np.zeros_like(w)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            m = np.roll(np.roll(edge, dy, 0), dx, 1)
            acc += np.roll(np.roll(w, dy, 0), dx, 1) * m
            cnt += m
    g = (~edge) & (cnt > 0)
    w[g] = acc[g] / cnt[g]
    edge |= g
w[grow(cat_mask, GUTTER - 2)] = 1
oldf = old.astype(np.float32)
for ground in grounds:
    ring = raster(uv_tris(ground)[0])[0] & (weight > 0.02) & (weight < 0.5)
    if ring.any():
        d = np.abs(oldf[ring] - new[ring]).mean(-1)
        print(f'MATCH {ground.name}, where the new bake fades into the old: mean |diff| {d.mean():.2f}, p95 {np.percentile(d, 95):.2f} (of 255)')
out = (oldf * (1 - w[..., None]) + new * w[..., None] + 0.5).astype(np.uint8)
encode.write_png(out, os.path.join(OUT, 'atlas.png'))
encode.write_png((np.repeat(w[..., None], 3, -1) * 255).astype(np.uint8), os.path.join(OUT, 'weight.png'))
print('DONE')
