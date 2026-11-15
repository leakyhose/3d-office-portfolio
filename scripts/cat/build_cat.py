"""Builds the desk cat (art/cat.glb): a low-poly exotic shorthair modelled on
the owner's cat: big round head with a flat face, small wide-set dark ears,
grey head with a white muzzle, white bib and paws, grey right foreleg, dark
tail.

  Blender -b --python scripts/cat/build_cat.py -- <out.glb> [preview_dir]

Cat space: +X forward, +Y the cat's left, +Z up, origin on the desk under the
body; units are the office model's. stage.py puts it on the desk.

In the plain style of the rest of the desk: every part is a few rings of
vertices placed by hand (body, head, legs, paws, ears, muzzle, tail), joined
into one closed skin with exact booleans, so no two faces overlap. Colours
are flat materials per face.
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
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


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


# --- building blocks ------------------------------------------------------------
def ring(c, u, v, ru, rv, n=8, off=None, shape=None):
    """n points on an ellipse about c in the plane (u, v). By default a facet,
    not a vertex, faces +u. shape: a radius factor per point."""
    off = -math.pi / n if off is None else off
    f = shape or [1.0] * n
    return [Vector(c) + u * (ru * f[k] * math.cos(off + 2 * math.pi * k / n)) + v * (rv * f[k] * math.sin(off + 2 * math.pi * k / n)) for k in range(n)]


def solid(rings, mat, xf=None):
    """A closed part lofted through rings (lists of n points; a 1-point ring
    closes to a tip). mat: a material name, or f(ring index, facet index)."""
    bm = bmesh.new()
    vs = [[bm.verts.new(xf @ p if xf else p) for p in r] for r in rings]
    pick = (lambda i, k: mat) if isinstance(mat, str) else mat

    def face(pts, i, k):
        f = bm.faces.new(pts)
        f.material_index = MAT_INDEX[pick(i, k)]

    for i in range(len(vs) - 1):
        a, b = vs[i], vs[i + 1]
        n = max(len(a), len(b))
        for k in range(n):
            j = (k + 1) % n
            if len(a) == 1:
                face((a[0], b[k], b[j]), i, k)
            elif len(b) == 1:
                face((a[k], a[j], b[0]), i, k)
            else:
                face((a[k], a[j], b[j], b[k]), i, k)
    if len(vs[0]) > 2:
        face(vs[0], -1, 0)
    if len(vs[-1]) > 2:
        face(vs[-1], len(vs) - 1, 0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def to_object(bm, mats):
    me = bpy.data.meshes.new('part')
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new('part', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def union(a, b):
    """a | b as one closed skin (exact boolean); b is removed."""
    mod = a.modifiers.new('u', 'BOOLEAN')
    mod.operation = 'UNION'
    mod.solver = 'EXACT'
    mod.object = b
    a.data = bpy.data.meshes.new_from_object(a.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    a.modifiers.clear()
    bpy.data.objects.remove(b, do_unlink=True)
    return a


def cut(bm, co, no, where):
    """Cuts a straight edge along the plane (co, no) into the faces that pass where(face)."""
    faces = [f for f in bm.faces if where(f)]
    geom = set(faces)
    for f in faces:
        geom.update(f.edges)
        geom.update(f.verts)
    bmesh.ops.bisect_plane(bm, geom=list(geom), dist=1e-6, plane_co=Vector(co), plane_no=Vector(no).normalized())


# --- the cat -----------------------------------------------------------------------
# The body, legs and tail are the original desk cat's (art/cat_base.glb, in cat
# space), recoloured; only the head is new.
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'art', 'cat_base.glb')
# The body sits turned on the desk, the head looks along +X: the body's own
# forward and left, and the point between the forepaws.
FWD, LAT = Vector((0.87, -0.5, 0)), Vector((0.5, 0.87, 0))
PAWS_MID = Vector((0.36, -0.10, 0))
BODY_WIDER = 1.1  # a stockier build than the original
BODY_SMOOTH = 35  # degrees: body edges gentler than this are shaded smooth
# The old head comes off at this plane through the neck.
NECK_AT, NECK_NO = Vector((0.55, -0.1, 1.52)), Vector((0.836, 0, 0.549))

# Head space: origin at the skull's centre, +X out of the face; rings across X
# (x, half width, half height); the last one is the flat face plate.
HEAD_AT = Vector((0.60, -0.10, 1.64))
HEAD_TILT = math.radians(-6)  # chin up a little
HEAD_SCALE = 1.0
SKULL = [(-0.36, 0.15, 0.15), (-0.20, 0.32, 0.32), (0.04, 0.40, 0.385), (0.24, 0.365, 0.35), (0.33, 0.27, 0.26)]
FACE_X = SKULL[-1][0]
# The skull's outline, seen from the front: full cheeks, a smaller chin and crown
# (radius factors, anticlockwise from the lower left cheek).
CHEEKS = [1.08, 1.0, 0.96, 0.96, 1.0, 1.08, 0.86, 0.86]
EYE_Y, EYE_Z = (0.105, 0.185), (-0.025, 0.045)  # small, wide apart, low on the face
MUZZLE_Y, MUZZLE_Z, MUZZLE_OUT = 0.105, (-0.205, -0.065), 0.06


def build_body():
    bpy.ops.import_scene.gltf(filepath=BASE)
    src = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.transform(src.matrix_world)
    white = [i for i, slot in enumerate(src.material_slots) if 'White' in slot.material.name]
    was_white = {f for f in bm.faces if f.material_index in white}
    old = src.data
    for slot in src.material_slots:
        bpy.data.materials.remove(slot.material)
    bpy.data.objects.remove(src, do_unlink=True)
    bpy.data.meshes.remove(old)
    bm.normal_update()

    def colour(f):
        c = f.calc_center_median()
        fwd, lat = (c - PAWS_MID).dot(FWD), (c - PAWS_MID).dot(LAT)
        if c.x < -0.6 or (c.z < 0.14 and fwd < -0.72):
            return 'CatPoint'  # tail
        if f in was_white:
            return 'WhiteFur'  # forepaws
        if fwd > -0.25 and c.z < 0.78 and abs(lat) < 0.36:
            if c.z < 0.14:
                return 'WhiteFur'  # hind toes
            return 'WhiteFur' if lat > 0 else 'CatMask'  # forelegs: the right one grey
        if fwd > -0.3 and 0.7 < c.z and f.normal.dot(FWD) > 0.1:
            return 'WhiteFur'  # bib
        return 'CatCream'

    for f, name in [(f, colour(f)) for f in bm.faces]:
        f.material_index = MAT_INDEX[name]
        f.smooth = True
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6, plane_co=NECK_AT, plane_no=NECK_NO, clear_outer=True)
    # close the neck's open end
    rim = [e for e in bm.edges if e.is_boundary and all(abs((v.co - NECK_AT).dot(NECK_NO.normalized())) < 1e-4 for v in e.verts)]
    for f in bmesh.ops.triangle_fill(bm, edges=rim, use_beauty=True)['geom']:
        if isinstance(f, bmesh.types.BMFace):
            f.material_index = MAT_INDEX['CatCream']
            f.smooth = True
    # some of the original's faces point inwards (it never showed on a black cat)
    bm.normal_update()
    before = {f: f.normal.copy() for f in bm.faces}
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    print('CAT faces turned outwards:', sum(1 for f in bm.faces if f.normal.dot(before[f]) < 0), 'of', len(bm.faces))
    for v in bm.verts:  # wider across the body's own left-right
        v.co += LAT * ((v.co - PAWS_MID).dot(LAT) * (BODY_WIDER - 1))
    return bm


def head_parts():
    parts = []
    xf = Matrix.Translation(HEAD_AT) @ Matrix.Rotation(HEAD_TILT, 4, 'Y') @ Matrix.Scale(HEAD_SCALE, 4)
    lower_front = lambda i, k: 'WhiteFur' if i >= len(SKULL) - 2 and k == 6 else 'CatMask'  # under the jaw
    parts.append(solid([ring((x, 0, 0), Y, Z, ry, rz, shape=CHEEKS) for x, ry, rz in SKULL], lower_front, xf))

    # eyes: small blue panes, all but flush with the face plate
    for s in (1, -1):
        (y0, y1), (z0, z1) = EYE_Y, EYE_Z
        eye = lambda x: [Vector((x, y0 * s, z0)), Vector((x, y1 * s, z0)), Vector((x, y1 * s, z1)), Vector((x, y0 * s, z1))]
        parts.append(solid([eye(FACE_X - 0.04), eye(FACE_X + 0.006)], 'CatEye', xf))

    # muzzle: a white wedge on the lower face, and the nose on top of it
    z0, z1 = MUZZLE_Z
    box = lambda x, hy, za, zb: [Vector((x, hy, za)), Vector((x, hy, zb)), Vector((x, -hy, zb)), Vector((x, -hy, za))]
    parts.append(solid([box(FACE_X - 0.05, MUZZLE_Y, z0, z1), box(FACE_X + MUZZLE_OUT, MUZZLE_Y * 0.72, z0 + 0.03, z1 - 0.035)], 'WhiteFur', xf))
    nz = z1 - 0.02
    tri = lambda x, k: [Vector((x, 0.04 * k, nz + 0.025 * k)), Vector((x, -0.04 * k, nz + 0.025 * k)), Vector((x, 0, nz - 0.035 * k))]
    parts.append(solid([tri(FACE_X - 0.03, 1.0), tri(FACE_X + MUZZLE_OUT + 0.02, 0.8)], 'CatDark', xf))

    # ears: dark pyramids on the skull's upper corners
    for s in (1, -1):
        n = Vector((0, 0.72 * s, 0.69))
        t = Vector((0, -0.69 * s, 0.72))
        p = Vector((-0.07, 0.27 * s, 0.27))
        base = [p - n * 0.07 + X * 0.085, p - n * 0.07 + t * 0.15, p - n * 0.07 - X * 0.085, p - n * 0.07 - t * 0.15]
        parts.append(solid([base, [p + n * 0.18 + t * 0.02]], 'CatPoint', xf))
    return parts


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body = build_body()
    mats = make_materials()
    # the head's parts are closed solids: one skin, by exact booleans
    obs = [to_object(bm, mats) for bm in head_parts()]
    ob = obs[0]
    for other in obs[1:]:
        ob = union(ob, other)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    # the booleans leave flat faces in pieces: merge them back, per colour
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=bm.verts[:], edges=bm.edges[:], delimit={'MATERIAL'})
    for f in bm.faces:
        f.smooth = False  # the head is faceted; the body keeps the original's soft facets
    # the head sits over the neck's open end
    tmp = bpy.data.meshes.new('body')
    body.to_mesh(tmp)
    body.free()
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    me = bpy.data.meshes.new('Cat')
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    me.set_sharp_from_angle(angle=math.radians(BODY_SMOOTH))
    ob.data = me
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
