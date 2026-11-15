"""Builds the desk cat (art/cat.glb): the original desk cat, remade after the
owner's exotic shorthair: grey head with a white muzzle, white bib and paws,
grey right foreleg, dark ears and tail, a bigger head and a shorter muzzle.

  Blender -b --python scripts/cat/build_cat.py -- <out.glb> [preview_dir]

Cat space: +X forward, +Y the cat's left, +Z up, origin on the desk under the
body; units are the office model's. stage.py puts it on the desk.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
PREVIEW = argv[1] if len(argv) > 1 else None

# sRGB colours. WhiteFur keeps the original model's material name.
COLORS = {
    'WhiteFur': (245, 243, 240),
    'CatCream': (206, 197, 192),
    'CatMask': (146, 140, 148),
    'CatPoint': (62, 57, 66),
    'CatEye': (78, 124, 180),
    'CatDark': (38, 34, 38),
}
MAT_INDEX = {n: i for i, n in enumerate(COLORS)}


def lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def make_materials():
    mats = []
    for name, rgb in COLORS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        col = (*[lin(v) for v in rgb], 1)
        p = m.node_tree.nodes['Principled BSDF']
        p.inputs['Base Color'].default_value = col
        p.inputs['Roughness'].default_value = 0.9
        p.inputs['Metallic'].default_value = 0.0
        m.diffuse_color = col
        mats.append(m)
    return mats


# --- the cat -----------------------------------------------------------------------
# The original desk cat's mesh (art/cat_base.glb, in cat space), recoloured.
# Its head is rebuilt as plain closed shapes around the original's points (a
# skull and two solid ears: the original's hollow ears and loose seams bake
# badly), bigger and with the muzzle pressed flat.
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'art', 'cat_base.glb')
# The body sits turned on the desk, the head looks along +X: the body's own
# forward and left, and the point between the forepaws.
FWD, LAT = Vector((0.87, -0.5, 0)), Vector((0.5, 0.87, 0))
PAWS_MID = Vector((0.36, -0.10, 0))
BODY_WIDER = 1.1  # a stockier build than the original
SMOOTH = 25  # degrees: edges gentler than this are inside one facet (as bake_cat.py lights it)
# The head is what lies beyond this plane through the neck.
NECK_AT, NECK_NO = Vector((0.52, -0.1, 1.47)), Vector((0.836, 0, 0.549)).normalized()
HEAD_PIVOT = Vector((0.66, -0.10, 1.62))
HEAD_SCALE = 1.22  # an exotic shorthair's big round head
MUZZLE_FROM, MUZZLE_KEEP = 0.80, 0.32  # the muzzle beyond this x keeps this much of its length
HEAD_Y = -0.11  # the head's middle
# In the original's coordinates: the ears are the points above EARS_FROM and
# further out than EARS_OUT; the skull is everything up to SKULL_TOP.
EARS_FROM, EARS_OUT, SKULL_TOP = 1.80, 0.10, 1.87
# The white muzzle patch on the finished face: half width, top, depth back from the nose.
MUZZLE_HALF, MUZZLE_TOP, MUZZLE_DEEP = 0.13, 1.575, 0.07
BIB_BACK, BIB_HALF = -0.05, 0.22  # the white bib: forward of this (from the paws), this far to each side
LEGS_BELOW = 0.78


def cut(bm, co, plane_no, faces):
    """A straight edge along the plane through these faces."""
    geom = set()
    for f in faces:
        geom.update((f, *f.edges, *f.verts))
    bmesh.ops.bisect_plane(bm, geom=list(geom), dist=1e-5, plane_co=Vector(co), plane_no=Vector(plane_no))


def reshape_head(co):
    """A point of the original head, on the new one: a shorter muzzle, then
    bigger, easing in over the neck."""
    co = co.copy()
    d = (co - NECK_AT).dot(NECK_NO)
    if co.x > MUZZLE_FROM:
        co.x = MUZZLE_FROM + (co.x - MUZZLE_FROM) * MUZZLE_KEEP
    return HEAD_PIVOT + (co - HEAD_PIVOT) * (1 + (HEAD_SCALE - 1) * min(max(d, 0) / 0.12, 1.0))


def build_body():
    """-> (the body without its head, the old head's points)"""
    bpy.ops.import_scene.gltf(filepath=BASE)
    ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    white = [i for i, slot in enumerate(ob.material_slots) if 'White' in slot.material.name]
    old = ob.data
    for slot in ob.material_slots:
        bpy.data.materials.remove(slot.material)
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(old)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)

    # the head comes off at the neck, and the neck is closed
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6, plane_co=NECK_AT, plane_no=NECK_NO)
    head_points = [v.co.copy() for v in bm.verts if (v.co - NECK_AT).dot(NECK_NO) > -1e-5]
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if (f.calc_center_median() - NECK_AT).dot(NECK_NO) > 0], context='FACES')
    rim = [e for e in bm.edges if e.is_boundary and all(abs((v.co - NECK_AT).dot(NECK_NO)) < 1e-4 for v in e.verts)]
    bmesh.ops.triangle_fill(bm, edges=rim, use_beauty=True)

    def where(f):
        """(forward of the paws, to the cat's left, centre)"""
        c = f.calc_center_median()
        return (c - PAWS_MID).dot(FWD), (c - PAWS_MID).dot(LAT), c

    # straight edges for the colours to meet at
    faces = lambda test: [f for f in bm.faces if test(*where(f))]
    cut(bm, PAWS_MID + FWD * BIB_BACK, FWD, faces(lambda fwd, lat, c: c.z > 0.7))
    for side in (1, -1):
        cut(bm, PAWS_MID + LAT * BIB_HALF * side, LAT, faces(lambda fwd, lat, c: c.z > 0.7 and fwd > BIB_BACK - 0.1))
    cut(bm, (0, 0, LEGS_BELOW), (0, 0, 1), faces(lambda fwd, lat, c: fwd > -0.3))
    # some of the original's faces point inwards (it never showed on a black cat)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    def colour(f):
        fwd, lat, c = where(f)
        if c.x < -0.6 or (c.z < 0.14 and fwd < -0.72):
            return 'CatPoint'  # tail
        if f.material_index in white:
            return 'WhiteFur'  # forepaws
        if fwd > -0.25 and c.z < LEGS_BELOW and abs(lat) < 0.36:
            if c.z < 0.14:
                return 'WhiteFur'  # hind toes
            return 'WhiteFur' if lat > 0 else 'CatMask'  # forelegs: the right one grey
        if c.z > LEGS_BELOW and fwd > BIB_BACK and abs(lat) < BIB_HALF and f.normal.dot(FWD) > 0.25 and f.normal.x > 0.25:
            return 'WhiteFur'  # bib
        return 'CatCream'

    for f, name in [(f, colour(f)) for f in bm.faces]:
        f.material_index = MAT_INDEX[name]
    for v in bm.verts:  # wider across the body's own left-right
        v.co += LAT * ((v.co - PAWS_MID).dot(LAT) * (BODY_WIDER - 1))
    return bm, head_points


def build_head(points):
    bm = bmesh.new()

    def hull(pts, name):
        verts = [bm.verts.new(reshape_head(p)) for p in pts]
        got = bmesh.ops.convex_hull(bm, input=verts)
        inside = set(got['geom_interior']) | set(got['geom_unused'])
        bmesh.ops.delete(bm, geom=[v for v in verts if v in inside], context='VERTS')
        faces = [f for f in bm.faces if f.material_index == 0 and not f.tag]
        for f in faces:
            f.material_index = MAT_INDEX[name]
            f.tag = True
        return faces

    skull = hull([p for p in points if p.z < SKULL_TOP], 'CatMask')
    for side in (1, -1):
        hull([p for p in points if p.z > EARS_FROM and (p.y - HEAD_Y) * side > EARS_OUT], 'CatPoint')
    # flat faces come out of the hull in triangles: merge them back, per colour
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(3), verts=bm.verts[:], edges=bm.edges[:], delimit={'MATERIAL'})

    # the white muzzle: a patch on the face's front, with straight edges
    grey = lambda: [f for f in bm.faces if f.material_index == MAT_INDEX['CatMask']]
    nose = max(v.co.x for f in grey() for v in f.verts)
    for side in (1, -1):
        cut(bm, (0, HEAD_Y + MUZZLE_HALF * side, 0), (0, 1, 0), grey())
    cut(bm, (0, 0, MUZZLE_TOP), (0, 0, 1), grey())
    cut(bm, (nose - MUZZLE_DEEP, 0, 0), (1, 0, 0), grey())
    for f in grey():
        c = f.calc_center_median()
        if c.x > nose - MUZZLE_DEEP and c.z < MUZZLE_TOP and abs(c.y - HEAD_Y) < MUZZLE_HALF:
            f.material_index = MAT_INDEX['WhiteFur']
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def drop_hidden(bm):
    """Removes the faces no light reaches: the original's leftovers inside the
    body, and where the parts run into each other. Left in, they drag the
    smooth shading of their neighbours to black."""
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges[:])
    bm.normal_update()
    bvh = BVHTree.FromBMesh(bm)
    dirs = []
    for i in range(64):  # evenly over a sphere
        z = 1 - (2 * i + 1) / 64
        r, a = math.sqrt(1 - z * z), i * math.pi * (3 - math.sqrt(5))
        dirs.append(Vector((r * math.cos(a), r * math.sin(a), z)))

    def lit(f):
        c = f.calc_center_median()
        for p in [c] + [c.lerp(v.co, 0.6) for v in f.verts]:
            for d in dirs:
                if d.dot(f.normal) > 0.1 and bvh.ray_cast(p + f.normal * 1e-4, d)[0] is None:
                    return True
        return False

    hidden = [f for f in bm.faces if not lit(f)]
    print('CAT hidden faces removed:', len(hidden), 'of', len(bm.faces))
    bmesh.ops.delete(bm, geom=hidden, context='FACES')


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body, head_points = build_body()
    mats = make_materials()
    head = build_head(head_points)
    me = bpy.data.meshes.new('Cat')
    bm = bmesh.new()
    for part in (body, head):
        part.to_mesh(me)
        part.free()
        bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    drop_hidden(bm)
    for f in bm.faces:
        f.smooth = True
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    me.set_sharp_from_angle(angle=math.radians(SMOOTH))
    ob = bpy.data.objects.new('Cat', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def render_previews(ob, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_cavity = False
    sh.show_shadows = False
    sc.world = bpy.data.worlds.new('w')
    sc.world.color = (0.05, 0.045, 0.04)
    sc.view_settings.view_transform = 'Standard'
    sc.render.resolution_x = sc.render.resolution_y = 640
    cd = bpy.data.cameras.new('c')
    cd.lens = 70
    cam = bpy.data.objects.new('c', cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    views = {
        'front_low': ((1, 0.12, -0.05), (0.1, -0.05, 1.05), 7.4),
        'front': ((1, -0.25, 0.25), (0.1, -0.05, 1.05), 7.4),
        'above': ((1, -0.2, 1.0), (0.1, -0.05, 0.95), 7.4),
        'right': ((0.05, -1, 0.2), (0, -0.05, 1.05), 7.4),
        'left': ((0.3, 1, 0.3), (0, -0.05, 1.05), 7.4),
        'back': ((-1, -0.5, 0.6), (0, -0.05, 1.0), 7.4),
        'face': ((1, -0.12, 0.1), (0.8, -0.1, 1.7), 3.8),
        'top': ((0.01, 0, 1), (0, -0.1, 1.0), 7.6),
        'legs': ((1, 0.55, 0.12), (0.3, -0.05, 0.42), 3.6),
        'legs2': ((0.6, -1, 0.2), (0.3, -0.05, 0.42), 3.6),
    }
    for name, (d, tgt, dist) in views.items():
        d = Vector(d).normalized()
        cam.location = Vector(tgt) + d * dist
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(out_dir, name + '.png')
        bpy.ops.render.render(write_still=True)


cat = build()
me = cat.data
ws = [v.co for v in me.vertices]
print('CAT tris', len(me.polygons), 'bounds', [round(min(getattr(v, a) for v in ws), 3) for a in 'xyz'], [round(max(getattr(v, a) for v in ws), 3) for a in 'xyz'])
if PREVIEW:
    render_previews(cat, PREVIEW)
bpy.ops.object.select_all(action='DESELECT')
cat.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_normals=True, export_texcoords=False, export_materials='EXPORT')
print('DONE')
