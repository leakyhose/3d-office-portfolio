"""Builds the cat asleep on the chair (art/chair_cat.glb): the owner's
tortoiseshell, curled up, in the desk cat's plain low-poly style.

  Blender -b --python scripts/cat/build_chair_cat.py -- <out.glb> [preview_dir]

Cat space: +Z up, origin on the seat under the middle of the curl; the head
lies towards +X, a little to -Y; units are the office model's (the desk cat is
2.1 tall). stage.py puts it on the chair.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
PREVIEW = argv[1] if len(argv) > 1 else None

# sRGB colours
COLORS = {
    'TortieBlack': (78, 64, 56),
    'TortieOrange': (186, 122, 64),
    'TortieTan': (134, 100, 72),
    'TortieCream': (214, 190, 160),
}
MAT_INDEX = {n: i for i, n in enumerate(COLORS)}

# The body: a low mound, drawn as rings of N corners from the seat up:
# (height, how wide against the footprint). The footprint is an ellipse.
SCALE = 1.2  # of everything below: a little smaller than the desk cat would be, curled up
N = 9
FOOT = (0.70, 0.56)  # half length (X), half width (Y)
RINGS = [(0.0, 0.94), (0.15, 1.0), (0.34, 0.80), (0.46, 0.44)]
TOP = (-0.06, -0.05, 0.50)  # the highest point, over the back
HAUNCH = 0.14  # the mound is this much higher and wider at the haunch (-X) than at the shoulders
# The head lies on the seat in front of the shoulders, nose towards the tail.
HEAD_AT, HEAD_YAW = Vector((0.17, 0.56, 0.0)), 190
HEAD = 1.35  # its size
# The tail lies along the front of the mound, from the haunch to under the nose:
# from/to angle around the footprint, how far out, thickness at root and tip.
TAIL = (200, 132, 0.93, 0.09, 0.05)


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
        m.diffuse_color = col
        mats.append(m)
    return mats


def paint(faces, name):
    for f in faces:
        f.material_index = MAT_INDEX[name]


def hull(bm, pts, name):
    """A closed solid around the points."""
    before = set(bm.faces)
    verts = [bm.verts.new(p) for p in pts]
    got = bmesh.ops.convex_hull(bm, input=verts)
    inside = set(got['geom_interior']) | set(got['geom_unused'])
    bmesh.ops.delete(bm, geom=[v for v in verts if v in inside], context='VERTS')
    faces = [f for f in bm.faces if f not in before]
    paint(faces, name)
    return faces


def foot(deg, out=1.0):
    a = math.radians(deg)
    return Vector((math.cos(a) * FOOT[0], math.sin(a) * FOOT[1], 0)) * out


def body(bm):
    # tortoiseshell: one colour to each panel of the mound, in patches
    patches = [
        'OBBTBOOBB',  # round the bottom, from the shoulders (+X) by the front (+Y)
        'OBTBBBOBB',
        'BOBBOBBTB',
    ]
    cap = 'BBTBOBBBB'
    names = {'B': 'TortieBlack', 'O': 'TortieOrange', 'T': 'TortieTan'}
    rows = []
    for k, (z, wide) in enumerate(RINGS):
        row = []
        for i in range(N):
            deg = 360 * (i + 0.5 * (k % 2)) / N  # each ring half a step round from the last
            big = 1 + HAUNCH * (0.5 - 0.5 * math.cos(math.radians(deg)))  # 1 at the shoulders
            row.append(bm.verts.new(foot(deg, wide * (0.93 + 0.07 * big)) + Vector((0, 0, z * big))))
        rows.append(row)
    for k in range(len(rows) - 1):
        a, b = rows[k], rows[k + 1]
        for i in range(N):
            j = (i + 1) % N
            if k % 2 == 0:
                tris = [(a[i], a[j], b[i]), (a[j], b[j], b[i])]
            else:
                tris = [(a[i], a[j], b[j]), (a[i], b[j], b[i])]
            for t in tris:
                paint([bm.faces.new(t)], names[patches[k][i]])
    top = bm.verts.new(TOP)
    for i in range(N):
        paint([bm.faces.new((rows[-1][i], rows[-1][(i + 1) % N], top))], names[cap[i]])


def head(bm):
    a = math.radians(HEAD_YAW)
    fwd, left, up = Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0)), Vector((0, 0, 1))
    at = lambda f, l, u: HEAD_AT + (fwd * f + left * l + up * u) * HEAD
    half = [(-0.20, 0.13, 0.0), (-0.21, 0.13, 0.22), (0.0, 0.21, 0.0), (0.0, 0.21, 0.20), (-0.06, 0.11, 0.31),
            (0.09, 0.10, 0.27), (0.21, 0.11, 0.0), (0.21, 0.09, 0.13), (0.27, 0.05, 0.0), (0.27, 0.04, 0.08)]
    faces = hull(bm, [at(f, l * s, u) for f, l, u in half for s in (1, -1)], 'TortieBlack')
    # the face split down the middle: black, with an orange blaze on its right cheek (the side the room sees)
    geom = set()
    for f in faces:
        geom.update((f, *f.edges, *f.verts))
    bmesh.ops.bisect_plane(bm, geom=list(geom), dist=1e-5, plane_co=at(0, -0.015, 0), plane_no=left)
    geom = set()
    for f in [f for f in bm.faces if f.material_index == MAT_INDEX['TortieBlack'] and (f.calc_center_median() - HEAD_AT).length < 0.45 * HEAD]:
        geom.update((f, *f.edges, *f.verts))
    bmesh.ops.bisect_plane(bm, geom=list(geom), dist=1e-5, plane_co=at(-0.06, 0, 0), plane_no=fwd)  # a blaze: the cheek by the muzzle only
    for f in bm.faces:
        c = f.calc_center_median() - HEAD_AT
        if f.material_index == MAT_INDEX['TortieBlack'] and c.dot(fwd) > -0.06 * HEAD and (c - fwd * c.dot(fwd)).length < 0.4 and c.dot(left) < -0.015 and f.normal.dot(left) < 0.2 and f in bm.faces and c.z < 0.4 and (f.calc_center_median() - HEAD_AT).length < 0.36 * HEAD:
            f.material_index = MAT_INDEX['TortieOrange']
    nose = at(0.27, 0, 0).dot(fwd)
    for f in bm.faces:  # the pale muzzle
        c = f.calc_center_median()
        if (c - HEAD_AT).length < 0.4 * HEAD and c.dot(fwd) > nose - 0.075 * HEAD and f.normal.dot(fwd) > 0.3:
            f.material_index = MAT_INDEX['TortieCream']
    for s in (1, -1):  # ears
        hull(bm, [at(0.0, 0.20 * s, 0.19), at(-0.15, 0.17 * s, 0.22), at(-0.09, 0.07 * s, 0.29), at(0.0, 0.08 * s, 0.27),
                  at(-0.10, 0.17 * s, 0.45)], 'TortieBlack')


def tail(bm):
    d0, d1, out, r0, r1 = TAIL
    steps = 5
    rings = []
    for k in range(steps + 1):
        t = k / steps
        deg = d0 + (d1 - d0) * t
        r = r0 + (r1 - r0) * t
        c = foot(deg, out) + foot(deg).normalized() * r * 0.6
        o = foot(deg).normalized()
        rings.append([bm.verts.new(q) for q in (c + o * r, c + Vector((0, 0, r * 1.7)), c - o * r, c)])
    for k in range(steps):
        for i in range(3):  # no underside
            paint([bm.faces.new((rings[k][i], rings[k + 1][i], rings[k + 1][i + 1], rings[k][i + 1]))], 'TortieBlack' if k != 2 else 'TortieOrange')
    paint([bm.faces.new(rings[0][::-1]), bm.faces.new(rings[-1])], 'TortieBlack')


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    bm = bmesh.new()
    body(bm)
    head(bm)
    tail(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.scale(bm, vec=(SCALE, SCALE, SCALE), verts=bm.verts[:])
    me = bpy.data.meshes.new('ChairCat')
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new('ChairCat', me)
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
        'top': ((0, -0.01, 1), 3.8),
        'front': ((0.3, 1, 0.55), 3.8),
        'head': ((-0.6, 1, 0.45), 3.8),
        'back': ((0.6, -1, 0.5), 3.8),
        'side': ((1, 0.2, 0.35), 3.8),
        'home': ((-0.75, 0.3, 0.6), 3.8),
    }
    for name, (d, dist) in views.items():
        d = Vector(d).normalized()
        cam.location = Vector((0, 0.05, 0.25)) + d * dist * SCALE
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
