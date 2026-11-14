"""Builds the desk cat (art/cat.glb): a low-poly exotic shorthair modelled on
the owner's cat: round body, big flat face, small wide-set dark ears, grey
mask with a white blaze over the muzzle, white bib and paws, grey right
foreleg, dark fluffy tail.

  Blender -b --python scripts/cat/build_cat.py -- <out.glb> [preview_dir]

Cat space: +X forward, +Y the cat's left, +Z up, origin on the desk under the
body; units are the office model's. stage.py puts it on the desk.
Shapes are unions of ellipsoids (voxel remesh), smoothed, then decimated to a
faceted low-poly mesh; colours are flat materials assigned per face, with the
boundaries cut into the mesh as straight edges first.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
PREVIEW = argv[1] if len(argv) > 1 else None

# sRGB colours. WhiteFur keeps the original model's material name.
COLORS = {
    'WhiteFur': (245, 243, 240),
    'CatCream': (206, 197, 192),
    'CatMask': (152, 146, 154),
    'CatShade': (112, 106, 117),
    'CatPoint': (62, 57, 66),
    'CatEye': (112, 160, 205),
    'CatDark': (38, 34, 38),
    'CatPink': (222, 140, 150),
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


# --- primitives ---------------------------------------------------------------
def add_ellipsoid(bm, c, r, rot=(0, 0, 0)):
    mat = Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*r, 1))
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0, matrix=mat)


def add_capsule(bm, pts, radii):
    """Spheres strung along the polyline pts (radius interpolated)."""
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        ra, rb = radii[i], radii[i + 1]
        n = max(2, int((b - a).length / (min(ra, rb) * 0.45)))
        for k in range(n + 1):
            t = k / n
            r = ra + (rb - ra) * t
            add_ellipsoid(bm, a.lerp(b, t), (r, r, r))


def skin(bm, tris, voxel=0.022, smooth=10, symmetric=True):
    """Union (voxel remesh) + smooth + decimate to ~tris triangles."""
    me = bpy.data.meshes.new('tmp')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('tmp', me)
    bpy.context.scene.collection.objects.link(ob)
    rm = ob.modifiers.new('r', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    rm.adaptivity = 0
    sm = ob.modifiers.new('s', 'SMOOTH')
    sm.factor = 0.5
    sm.iterations = smooth
    dg = bpy.context.evaluated_depsgraph_get()
    dense = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    ob.data = dense
    n = sum(len(p.vertices) - 2 for p in dense.polygons)
    dm = ob.modifiers.new('d', 'DECIMATE')
    dm.decimate_type = 'COLLAPSE'
    dm.ratio = tris / n
    dm.use_collapse_triangulate = True
    if symmetric:
        dm.use_symmetry = True
        dm.symmetry_axis = 'Y'
    dg = bpy.context.evaluated_depsgraph_get()
    low = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    out = bmesh.new()
    out.from_mesh(low)
    bpy.data.objects.remove(ob, do_unlink=True)
    bmesh.ops.triangulate(out, faces=out.faces[:])
    return out


def cut(bm, co, no, where=None):
    """Cuts a straight edge loop into bm along the plane (co, no), through the
    faces whose centroid passes where()."""
    faces = [f for f in bm.faces if where is None or where(f.calc_center_median())]
    geom = set(faces)
    for f in faces:
        geom.update(f.edges)
        geom.update(f.verts)
    bmesh.ops.bisect_plane(bm, geom=list(geom), dist=1e-5, plane_co=Vector(co), plane_no=Vector(no).normalized())


def paint(bm, rule):
    for f in bm.faces:
        f.material_index = MAT_INDEX[rule(f.calc_center_median(), f.normal)]


def seg_dist(p, a, b):
    a, b = Vector(a), Vector(b)
    t = max(0.0, min(1.0, (p - a).dot(b - a) / (b - a).length_squared))
    return (p - a.lerp(b, t)).length


# --- body -----------------------------------------------------------------------
SHOULDER_Z = 0.74
LEG = {  # foreleg axis: shoulder -> wrist
    +1: ((0.30, 0.18, SHOULDER_Z), (0.44, 0.17, 0.14)),
    -1: ((0.30, -0.18, SHOULDER_Z), (0.44, -0.17, 0.14)),
}
PAW = {s: (0.52, 0.17 * s, 0.085) for s in (1, -1)}
FOOT = {s: (0.36, 0.43 * s, 0.07) for s in (1, -1)}
SOCK_Z = 0.21


def near_paw(c):
    return (min(seg_dist(c, *LEG[s]) for s in (1, -1)) < 0.24
            or min((c - Vector(FOOT[s])).length for s in (1, -1)) < 0.27)


def build_body():
    bm = bmesh.new()
    add_ellipsoid(bm, (0.02, 0, 0.66), (0.48, 0.51, 0.66), (0, math.radians(12), 0))  # torso, leaning forward
    add_ellipsoid(bm, (-0.14, 0, 0.42), (0.58, 0.66, 0.45))
    add_ellipsoid(bm, (0.30, 0, 0.32), (0.20, 0.22, 0.30))  # between the forelegs
    add_ellipsoid(bm, (-0.06, 0, 0.64), (0.52, 0.57, 0.46))  # waist: a pear, not an hourglass  # belly + rump
    add_ellipsoid(bm, (0.22, 0, 0.92), (0.34, 0.45, 0.38))  # chest ruff
    for s in (1, -1):
        add_ellipsoid(bm, (0.0, 0.45 * s, 0.33), (0.43, 0.26, 0.35))  # haunch
        add_ellipsoid(bm, FOOT[s], (0.20, 0.12, 0.08))  # hind foot
        a, b = LEG[s]
        add_capsule(bm, [a, b], [0.15, 0.125])
        add_ellipsoid(bm, PAW[s], (0.20, 0.16, 0.10))
    bm = skin(bm, 300)

    front = lambda c: c.x > 0.12
    cut(bm, (0, 0, SOCK_Z), (0, 0, 1), lambda c: c.x > 0.15 and c.z < 0.45 and near_paw(c))
    cut(bm, (0, -0.015, 0), (0, 1, 0), lambda c: front(c) and c.z < 0.8)
    cut(bm, (0, -0.30, 0), (0, 1, 0), lambda c: front(c) and 0.15 < c.z < 0.9)
    cut(bm, (0, 0, SHOULDER_Z), (0, 0, 1), lambda c: front(c) and c.y < 0.02)
    cut(bm, (0, 0.30, 0), (0, 1, 0.0), lambda c: front(c) and c.z > 0.3)
    bm.normal_update()

    def rule(c, n):
        if c.z < SOCK_Z and c.x > 0.15 and near_paw(c):
            return 'WhiteFur'
        if c.x > 0.12 and -0.30 < c.y < -0.015 and c.z < SHOULDER_Z and n.x > -0.2:
            return 'CatMask'  # the grey right foreleg
        if c.x > 0.12 and n.x > 0.15 and abs(c.y) < 0.30:
            return 'WhiteFur'  # bib + left foreleg
        if (c - Vector((0.12, -0.62, 0.30))).length < 0.2:
            return 'CatMask'  # hock patch
        return 'CatCream'
    paint(bm, rule)
    return bm


# --- head (head space: origin at the skull's centre) ---------------------------
HEAD_AT = Vector((0.30, 0, 1.34))
HEAD_TILT = math.radians(-11)  # chin up a little
EAR = {s: Vector((-0.04, 0.41 * s, 0.33)) for s in (1, -1)}
EAR_LEAN = math.radians(34)
EYE_Y, EYE_Z, EYE_R = 0.215, -0.02, 0.088
HEAD_SCALE = 1.03
BAND = (-0.15, 0.13)  # the darker patch around the eyes: z range at the nose...
BAND_TAPER = (0.22, 0.38)  # ...closing towards the cheeks (bottom, top slope)
BLAZE_APEX = (0, 0.03, -0.03)
BLAZE_SLOPE = 0.62
BLAZE_HALF = 0.24  # ...no wider than the whisker pads
MASK_CO, MASK_NO = (0.10, 0, 0), (1, 0, -0.35)  # in front of this plane the face is grey


def build_head():
    bm = bmesh.new()
    add_ellipsoid(bm, (0, 0, 0), (0.48, 0.56, 0.47))
    add_ellipsoid(bm, (0.14, 0, 0.06), (0.38, 0.50, 0.40))  # flat brow
    for s in (1, -1):
        add_ellipsoid(bm, (0.10, 0.31 * s, -0.17), (0.34, 0.31, 0.27))  # jowl
        add_ellipsoid(bm, (0.37, 0.125 * s, -0.19), (0.14, 0.155, 0.115))  # whisker pad
        eu = Vector((0, math.sin(EAR_LEAN) * s, math.cos(EAR_LEAN)))
        add_ellipsoid(bm, EAR[s], (0.07, 0.155, 0.13), (-EAR_LEAN * s, 0, 0))
        add_ellipsoid(bm, EAR[s] + eu * 0.125, (0.05, 0.085, 0.08), (-EAR_LEAN * s, 0, 0))
        add_ellipsoid(bm, EAR[s] + eu * 0.195, (0.03, 0.045, 0.045), (-EAR_LEAN * s, 0, 0))
        add_ellipsoid(bm, (0.36, 0.20 * s, 0.13), (0.10, 0.17, 0.07), (0.25 * s, 0, 0))  # brow
    add_ellipsoid(bm, (0.33, 0, -0.33), (0.12, 0.15, 0.08))  # chin
    bm = skin(bm, 270, voxel=0.018, smooth=7)

    ear_up = {s: Vector((0, math.sin(EAR_LEAN) * s, math.cos(EAR_LEAN))) for s in (1, -1)}
    for s in (1, -1):
        cut(bm, EAR[s], ear_up[s], lambda c, s=s: (c - EAR[s]).length < 0.3)
    # the blaze: an inverted V from between the eyes down over the muzzle
    for s in (1, -1):
        cut(bm, (0, BLAZE_APEX[1] * s, BLAZE_APEX[2]), (0, s, BLAZE_SLOPE), lambda c, s=s: c.x > 0.1 and c.y * s > -0.01)
    for s in (1, -1):
        cut(bm, (0, BLAZE_HALF * s, 0), (0, 1, 0), lambda c: c.x > 0.1 and c.z < -0.2)
    cut(bm, MASK_CO, MASK_NO, lambda c: c.z > -0.45)
    for s in (1, -1):  # the darker patch around the eyes: a flat hexagon
        side = lambda c, s=s: c.x > 0.2 and c.y * s > -0.01
        cut(bm, (0, 0, BAND[1]), (0, BAND_TAPER[1] * s, 1), side)
        cut(bm, (0, 0, BAND[0]), (0, -BAND_TAPER[0] * s, 1), side)
    bm.normal_update()

    def rule(c, n):
        for s in (1, -1):
            if (c - EAR[s]).dot(ear_up[s]) > 0 and (c - EAR[s]).length < 0.3:
                return 'CatPoint'
        if c.x > 0.1 and abs(c.y) < BLAZE_HALF and abs(c.y) - BLAZE_APEX[1] + BLAZE_SLOPE * (c.z - BLAZE_APEX[2]) < 0:
            return 'WhiteFur'
        if c.x > 0.2 and BAND[0] + BAND_TAPER[0] * abs(c.y) < c.z < BAND[1] - BAND_TAPER[1] * abs(c.y):
            return 'CatShade'
        if (c - Vector(MASK_CO)).dot(Vector(MASK_NO)) > 0:
            return 'CatMask'
        return 'CatCream'
    paint(bm, rule)
    add_face_details(bm)
    return bm


def fan(bm, centre, normal, up, rx, ry, mat, n=8, dome=0.0, lift=0.0, start=0.0, arc=None):
    """A small n-gon (or, with arc=(a0, a1), a segment of one) lying on the
    head, as a triangle fan."""
    normal = normal.normalized()
    right = up.cross(normal).normalized()
    up = normal.cross(right).normalized()
    o = centre + normal * lift
    cv = bm.verts.new(o + normal * dome)

    def pt(a):
        return bm.verts.new(o + right * math.cos(a) * rx + up * math.sin(a) * ry)

    if arc is None:
        ring = [pt(start + 2 * math.pi * i / n) for i in range(n)]
        pairs = [(i, (i + 1) % n) for i in range(n)]
    else:
        ring = [pt(arc[0] + (arc[1] - arc[0]) * i / n) for i in range(n + 1)]
        pairs = [(i, i + 1) for i in range(n)]
    for i, j in pairs:
        f = bm.faces.new((cv, ring[i], ring[j]))
        f.material_index = MAT_INDEX[mat]


def eye_dome(bm, loc, axis, up, s):
    """A bulging eye: dark rim, blue iris ring, dark pupil on top."""
    right = up.cross(axis).normalized()
    upv = axis.cross(right).normalized()

    def ring(r, h, n, rot=0.0):
        return [bm.verts.new(loc + axis * h + right * math.cos(rot + 2 * math.pi * i / n) * r + upv * math.sin(rot + 2 * math.pi * i / n) * r * 0.94) for i in range(n)]

    def band(a, b, mat):
        n = len(a)
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            f.material_index = MAT_INDEX[mat]

    n = 8
    rot = math.pi / 8
    base = ring(EYE_R * 1.16, -0.05, n, rot)
    rim = ring(EYE_R * 1.10, 0.012, n, rot)
    iris = ring(EYE_R * 0.92, 0.030, n, rot)
    pupil = ring(EYE_R * 0.50, 0.040, n, rot)
    band(base, rim, 'CatDark')
    band(rim, iris, 'CatDark')
    band(iris, pupil, 'CatEye')
    f = bm.faces.new(pupil)
    f.material_index = MAT_INDEX['CatDark']
    # heavy upper lid, lower at the nose end: the grumpy look
    d = math.radians(4) * s
    a0, a1 = math.radians(27), math.radians(153)
    lid = [bm.verts.new(loc + axis * 0.044 + right * math.cos(d + a0 + (a1 - a0) * i / 4) * EYE_R * 1.2 + upv * math.sin(d + a0 + (a1 - a0) * i / 4) * EYE_R * 1.15) for i in range(5)]
    f = bm.faces.new(lid)
    f.material_index = MAT_INDEX['CatShade']
    under = [bm.verts.new(v.co - axis * 0.06) for v in (lid[0], lid[-1])]
    f = bm.faces.new((lid[-1], lid[0], under[0], under[1]))
    f.material_index = MAT_INDEX['CatDark']


def add_face_details(bm):
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    fwd = Vector((1, 0, 0))
    up = Vector((0, 0, 1))

    def surface(y, z):
        loc, no, _, _ = tree.ray_cast(Vector((3, y, z)), -fwd)
        return loc, no

    for s in (1, -1):
        loc, no = surface(EYE_Y * s, EYE_Z)
        axis = (no * 0.35 + fwd * 0.65 + Vector((0, 0.06 * s, 0))).normalized()
        eye_dome(bm, loc, axis, up, s)
    # nose: a small dark triangle between the eyes
    loc, no = surface(0, EYE_Z - 0.03)
    fan(bm, loc, (no + fwd).normalized(), up, 0.06, 0.045, 'CatDark', n=3, dome=0.012, lift=0.014, start=-math.pi / 2)
    # the downturned mouth: two thin dark strokes under the whisker pads
    for s in (1, -1):
        pts = []
        for y, z in ((0.0, -0.262), (0.075 * s, -0.285), (0.15 * s, -0.33)):
            loc, no = surface(y, z)
            pts.append((loc, (no + fwd).normalized()))
        for (a, na), (b, nb) in zip(pts, pts[1:]):
            w = Vector((0, 0, 0.011))
            vs = [bm.verts.new(q) for q in (a + na * 0.012 - w, b + nb * 0.012 - w, b + nb * 0.012 + w, a + na * 0.012 + w)]
            f = bm.faces.new(vs if s > 0 else vs[::-1])
            f.material_index = MAT_INDEX['CatDark']
    # the tip of the tongue, under the nose
    loc, no = surface(0, -0.275)
    fan(bm, loc, (no + fwd).normalized(), up, 0.032, 0.03, 'CatPink', n=5, dome=0.01, lift=0.012, start=math.pi / 2)


# --- tail ----------------------------------------------------------------------
def build_tail():
    bm = bmesh.new()
    pts = [(-0.42, 0.0, 0.20), (-0.70, -0.22, 0.16), (-0.66, -0.56, 0.15), (-0.38, -0.80, 0.15), (-0.02, -0.86, 0.16), (0.22, -0.80, 0.19)]
    add_capsule(bm, pts, [0.15, 0.155, 0.16, 0.16, 0.15, 0.12])
    bm = skin(bm, 110, voxel=0.02, smooth=6, symmetric=False)
    paint(bm, lambda c, n: 'CatPoint')
    return bm


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    body, head, tail = build_body(), build_head(), build_tail()
    bmesh.ops.transform(head, verts=head.verts[:], matrix=Matrix.Translation(HEAD_AT) @ Matrix.Rotation(HEAD_TILT, 4, 'Y') @ Matrix.Scale(HEAD_SCALE, 4))
    me = bpy.data.meshes.new('Cat')
    out = bmesh.new()
    for part in (body, head, tail):
        tmp = bpy.data.meshes.new('part')
        part.to_mesh(tmp)
        out.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        part.free()
    bmesh.ops.triangulate(out, faces=out.faces[:])
    for v in out.verts:  # sit on the desk
        v.co.z = max(0.0, v.co.z)
    out.normal_update()
    out.to_mesh(me)
    out.free()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = False
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
        'front_low': ((1, 0.12, -0.12), (0.1, 0, 0.95), 6.2),
        'front': ((1, -0.25, 0.25), (0.1, 0, 0.95), 6.2),
        'above': ((1, -0.2, 1.0), (0.1, 0, 0.85), 6.2),
        'right': ((0.05, -1, 0.2), (0, 0, 0.95), 6.2),
        'left': ((0.3, 1, 0.3), (0, 0, 0.95), 6.2),
        'back': ((-1, -0.5, 0.6), (0, 0, 0.9), 6.2),
        'face': ((1, -0.12, 0.1), (0.5, 0, 1.33), 3.4),
        'top': ((0.01, 0, 1), (0, -0.2, 0.9), 6.5),
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
