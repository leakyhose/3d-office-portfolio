"""Builds the desk cat (art/cat.glb): the original desk cat, remade after the
owner's exotic shorthair: grey head with a white muzzle, white bib and paws,
grey right foreleg, dark ears and tail, a bigger head and a shorter muzzle.

  Blender -b --python scripts/cat/build_cat.py -- <out.glb> [preview_dir]

Cat space: +X forward, +Y the cat's left, +Z up, origin on the desk under the
body; units are the office model's. stage.py puts it on the desk.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

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
# The original desk cat's mesh (art/cat_base.glb, in cat space), recoloured,
# with a bigger head and a shorter muzzle.
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'art', 'cat_base.glb')
# The body sits turned on the desk, the head looks along +X: the body's own
# forward and left, and the point between the forepaws.
FWD, LAT = Vector((0.87, -0.5, 0)), Vector((0.5, 0.87, 0))
PAWS_MID = Vector((0.36, -0.10, 0))
BODY_WIDER = 1.1  # a stockier build than the original
SMOOTH = 62  # degrees: edges gentler than this are shaded smooth, as the original's were
# The head is what lies beyond this plane through the neck.
NECK_AT, NECK_NO = Vector((0.52, -0.1, 1.47)), Vector((0.836, 0, 0.549))
HEAD_PIVOT = Vector((0.66, -0.10, 1.62))
HEAD_SCALE = 1.22  # an exotic shorthair's big round head
MUZZLE_FROM, MUZZLE_KEEP = 0.84, 0.45  # the muzzle beyond this x keeps this much of its length
HEAD_Y = -0.11  # the head's middle
EARS_ABOVE, CROWN_HALF = 1.80, 0.12  # the ears: above this z, this far out from the middle
MUZZLE_HALF = 0.11
MUZZLE_X, MUZZLE_TOP = 0.88, 1.58  # the white muzzle: forward of this x, below this z (before the head is reshaped)
BIB_BACK, BIB_HALF = -0.05, 0.22  # the white bib: forward of this (from the paws), this far to each side
LEGS_BELOW = 0.78


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=BASE)
    ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    white = [i for i, slot in enumerate(ob.material_slots) if 'White' in slot.material.name]
    old = ob.data
    for slot in ob.material_slots:
        bpy.data.materials.remove(slot.material)
    mats = make_materials()
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    no = NECK_NO.normalized()

    def where(f):
        """(in the head, forward of the paws, to the cat's left, centre)"""
        c = f.calc_center_median()
        return (c - NECK_AT).dot(no) > 0, (c - PAWS_MID).dot(FWD), (c - PAWS_MID).dot(LAT), c

    def cut(co, plane_no, test):
        """A straight edge along the plane, through the faces that pass test(*where(f))."""
        geom = set()
        for f in bm.faces:
            if test(*where(f)):
                geom.update((f, *f.edges, *f.verts))
        bmesh.ops.bisect_plane(bm, geom=list(geom), dist=1e-5, plane_co=Vector(co), plane_no=Vector(plane_no))

    # straight edges for the colours to meet at
    cut((MUZZLE_X, 0, 0), (1, 0, 0), lambda head, fwd, lat, c: head)
    cut((0, 0, MUZZLE_TOP), (0, 0, 1), lambda head, fwd, lat, c: head and c.x > MUZZLE_X - 0.1)
    cut((0, 0, EARS_ABOVE), (0, 0, 1), lambda head, fwd, lat, c: head)
    for side in (1, -1):
        cut((0, HEAD_Y + MUZZLE_HALF * side, 0), (0, 1, 0), lambda head, fwd, lat, c: head and c.x > MUZZLE_X - 0.1 and c.z < MUZZLE_TOP + 0.1)
        cut((0, HEAD_Y + CROWN_HALF * side, 0), (0, 1, 0), lambda head, fwd, lat, c: head and c.z > EARS_ABOVE - 0.1)
    cut(PAWS_MID + FWD * BIB_BACK, FWD, lambda head, fwd, lat, c: not head and c.z > 0.7)
    for side in (1, -1):
        cut(PAWS_MID + LAT * BIB_HALF * side, LAT, lambda head, fwd, lat, c: not head and c.z > 0.7 and fwd > BIB_BACK - 0.1)
    cut((0, 0, LEGS_BELOW), (0, 0, 1), lambda head, fwd, lat, c: not head and fwd > -0.3)
    bm.normal_update()

    def colour(f):
        head, fwd, lat, c = where(f)
        if head:
            if c.z > EARS_ABOVE and abs(c.y - HEAD_Y) > CROWN_HALF:
                return 'CatPoint'  # ears
            return 'WhiteFur' if c.x > MUZZLE_X and c.z < MUZZLE_TOP and abs(c.y - HEAD_Y) < MUZZLE_HALF else 'CatMask'
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
        f.smooth = True
    # some of the original's faces point inwards (it never showed on a black cat)
    bm.normal_update()
    before = {f: f.normal.copy() for f in bm.faces}
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    print('CAT faces turned outwards:', sum(1 for f in bm.faces if f.normal.dot(before[f]) < 0), 'of', len(bm.faces))
    for v in bm.verts:
        d = (v.co - NECK_AT).dot(no)
        if d > 0:  # head: a shorter muzzle, then bigger, easing in over the neck
            if v.co.x > MUZZLE_FROM:
                v.co.x = MUZZLE_FROM + (v.co.x - MUZZLE_FROM) * MUZZLE_KEEP
            k = 1 + (HEAD_SCALE - 1) * min(d / 0.12, 1.0)
            v.co = HEAD_PIVOT + (v.co - HEAD_PIVOT) * k
        else:  # body: wider across its own left-right
            v.co += LAT * ((v.co - PAWS_MID).dot(LAT) * (BODY_WIDER - 1))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    me = bpy.data.meshes.new('Cat')
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    me.set_sharp_from_angle(angle=math.radians(SMOOTH))
    ob.data = me
    bpy.data.meshes.remove(old)
    ob.name = 'Cat'
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
