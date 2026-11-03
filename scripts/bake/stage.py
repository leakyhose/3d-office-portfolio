"""Room geometry + lights shared by bake.py (lightmap bake) and preview.py
(quick Cycles renders of the app's camera views for art direction).

Coordinates: three (x, y, z) == Blender (x, -z, y). Helpers take three coords.
"""
import bpy, bmesh, math, os
from mathutils import Vector

ROOM_PREFIX = 'Room_'


def t2b(v):  # three -> blender coords
    return Vector((v[0], -v[2], v[1]))


def srgb_to_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h):
    h = h.lstrip('#')
    return tuple(srgb_to_lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def material(name, hex_color, roughness=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*hex_lin(hex_color), 1)
    p.inputs['Roughness'].default_value = roughness
    return m


def box(name, mn, mx, mat, keep=None):
    """Axis-aligned box from three-space min/max corners. `keep` lists the
    faces to keep by three-space normal ('+x-y...'); hidden faces are dropped
    so they don't take lightmap space."""
    a, b = t2b(mn), t2b(mx)
    lo = Vector((min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)))
    hi = Vector((max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)))
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((lo.x + (v.co.x + 0.5) * (hi.x - lo.x), lo.y + (v.co.y + 0.5) * (hi.y - lo.y), lo.z + (v.co.z + 0.5) * (hi.z - lo.z)))
    if keep:
        bm.normal_update()
        wanted = [t2b(v) for v in (
            (1, 0, 0) if '+x' in keep else None, (-1, 0, 0) if '-x' in keep else None,
            (0, 1, 0) if '+y' in keep else None, (0, -1, 0) if '-y' in keep else None,
            (0, 0, 1) if '+z' in keep else None, (0, 0, -1) if '-z' in keep else None) if v]
        drop = [f for f in bm.faces if not any(f.normal.dot(w) > 0.9 for w in wanted)]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


def quad(name, corners, mat):
    """One-sided quad from four three-space corners (counter-clockwise seen from the front)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([t2b(c) for c in corners], [], [(0, 1, 2, 3)])
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


FLOOR_COLOR = '#1e1a15'
WALL_COLOR = os.environ.get('WALL_COLOR', '#39403b')
TRIM_COLOR = '#2a241d'
FRAME_COLOR = '#cfc3a8'
RUG_BORDER = os.environ.get('RUG_BORDER', '#4a3a2c')
RUG_FIELD = os.environ.get('RUG_FIELD', '#5a2c25')

# The room is open towards the front (+z) and has no ceiling, and its walls
# are one-sided quads facing inwards: seen from outside (free cam, intro
# fly-in) they are back-face culled, so the room reads as a cut-away set.
BACK_Z = -1.0          # back wall
LEFT_X = -11.0         # left wall
RIGHT_X = 21.0         # right wall
FRONT_Z = 26.0
HEIGHT = 20.0
DEPTH = 0.5            # window reveal depth
WIN = (-8.6, -3.4, 6.4, 12.4)  # window hole in the back wall (x0, x1, y0, y1)
SKY_Z = BACK_Z - 3.0
SKY_MARGIN = 3.0
RUG = (-3.6, 7.4, 5.0, 13.5)   # x0, x1, z0, z1


def build_room():
    """Adds the room around the desk. Every object is named Room_*; the sky
    quad (Room_Sky) is drawn unlit at runtime and takes no part in the bake."""
    wall = material(ROOM_PREFIX + 'Wall', WALL_COLOR)
    trim = material(ROOM_PREFIX + 'Trim', TRIM_COLOR)
    frame = material(ROOM_PREFIX + 'Frame', FRAME_COLOR, 0.6)
    x0, x1, y0, y1 = WIN
    B, L, R, F, H = BACK_Z, LEFT_X, RIGHT_X, FRONT_Z, HEIGHT
    zb = B - DEPTH
    obs = [
        # back wall (+z facing), split around the window hole
        quad(ROOM_PREFIX + 'BackL', [(L, 0, B), (x0, 0, B), (x0, H, B), (L, H, B)], wall),
        quad(ROOM_PREFIX + 'BackR', [(x1, 0, B), (R, 0, B), (R, H, B), (x1, H, B)], wall),
        quad(ROOM_PREFIX + 'BackB', [(x0, 0, B), (x1, 0, B), (x1, y0, B), (x0, y0, B)], wall),
        quad(ROOM_PREFIX + 'BackT', [(x0, y1, B), (x1, y1, B), (x1, H, B), (x0, H, B)], wall),
        # window reveals (the wall's thickness inside the hole)
        quad(ROOM_PREFIX + 'RevealL', [(x0, y0, B), (x0, y0, zb), (x0, y1, zb), (x0, y1, B)], wall),
        quad(ROOM_PREFIX + 'RevealR', [(x1, y0, zb), (x1, y0, B), (x1, y1, B), (x1, y1, zb)], wall),
        quad(ROOM_PREFIX + 'RevealT', [(x0, y1, B), (x0, y1, zb), (x1, y1, zb), (x1, y1, B)], wall),
        quad(ROOM_PREFIX + 'RevealB', [(x0, y0, zb), (x0, y0, B), (x1, y0, B), (x1, y0, zb)], wall),
        # side walls
        quad(ROOM_PREFIX + 'Left', [(L, 0, F), (L, 0, B), (L, H, B), (L, H, F)], wall),
        quad(ROOM_PREFIX + 'Right', [(R, 0, B), (R, 0, F), (R, H, F), (R, H, B)], wall),
        # baseboards
        box(ROOM_PREFIX + 'BaseBack', (L, 0, B), (R, 0.45, B + 0.08), trim, keep='+z+y'),
        box(ROOM_PREFIX + 'BaseLeft', (L, 0, B), (L + 0.08, 0.45, F), trim, keep='+x+y'),
        box(ROOM_PREFIX + 'BaseRight', (R - 0.08, 0, B), (R, 0.45, F), trim, keep='-x+y'),
    ]
    # window: casing, sill, cross mullions
    f, d = 0.22, 0.12
    xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
    obs += [
        box(ROOM_PREFIX + 'FrameL', (x0 - f, y0 - f, B), (x0, y1 + f, B + d), frame, keep='+z-x+x'),
        box(ROOM_PREFIX + 'FrameR', (x1, y0 - f, B), (x1 + f, y1 + f, B + d), frame, keep='+z-x+x'),
        box(ROOM_PREFIX + 'FrameT', (x0 - f, y1, B), (x1 + f, y1 + f, B + d), frame, keep='+z-y+y-x+x'),
        box(ROOM_PREFIX + 'Sill', (x0 - f - 0.15, y0 - 0.18, B), (x1 + f + 0.15, y0, B + 0.3), frame, keep='+z+y-y-x+x'),
        box(ROOM_PREFIX + 'MullionV', (xm - 0.07, y0, B - 0.3), (xm + 0.07, y1, B - 0.18), frame, keep='+z-x+x'),
        box(ROOM_PREFIX + 'MullionH', (x0, ym - 0.07, B - 0.3), (x1, ym + 0.07, B - 0.18), frame, keep='+z-y+y'),
    ]
    # rug under the chair
    rug_b = material(ROOM_PREFIX + 'RugBorder', RUG_BORDER)
    rug_f = material(ROOM_PREFIX + 'RugField', RUG_FIELD)
    rx0, rx1, rz0, rz1 = RUG
    b = 0.45
    obs += [
        box(ROOM_PREFIX + 'Rug', (rx0, 0, rz0), (rx1, 0.03, rz1), rug_b, keep='+y-x+x-z+z'),
        box(ROOM_PREFIX + 'RugIn', (rx0 + b, 0.03, rz0 + b), (rx1 - b, 0.045, rz1 - b), rug_f, keep='+y-x+x-z+z'),
    ]
    for o in obs:
        for m in o.data.materials:
            m.use_backface_culling = True  # exported single-sided
    # night sky behind the window (unlit canvas at runtime)
    sky_m = bpy.data.materials.new(ROOM_PREFIX + 'Sky')
    sky_m.use_backface_culling = True
    s = SKY_MARGIN
    # (kept inside the side walls so it can't be seen from outside the room)
    sx0, sx1 = max(x0 - s, L + 0.2), min(x1 + s, R - 0.2)
    sky = quad(ROOM_PREFIX + 'Sky', [(sx0, y0 - s, SKY_Z), (sx1, y0 - s, SKY_Z), (sx1, y1 + s, SKY_Z), (sx0, y1 + s, SKY_Z)], sky_m)
    uv = sky.data.uv_layers.new(name='UVMap')
    for loop in sky.data.loops:
        uv.data[loop.index].uv = [(0, 0), (1, 0), (1, 1), (0, 1)][loop.vertex_index]
    sky.visible_shadow = False
    sky.visible_diffuse = False
    sky.visible_glossy = False
    sky.visible_transmission = False
    sky.visible_volume_scatter = False
    return obs, sky


def add_sun(name, pos3, color, strength, angle_deg):
    scene = bpy.context.scene
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = strength
    ld.color = color
    ld.angle = math.radians(angle_deg)
    ob = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(ob)
    d = -t2b(pos3).normalized()
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return ob


def add_lights(model_path):
    """Lights + world. Returns the world (bake.py tweaks its AO distance)."""
    scene = bpy.context.scene
    key_dir = Vector(tuple(float(c) for c in os.environ.get('KEY_DIR', '8,14,15').split(','))).normalized()
    key_mode = os.environ.get('KEY', 'spot')
    if key_mode == 'sun':
        add_sun('__key', (14.2, 13.3, 12.3), hex_lin('#ffe0a0'), 2.8, 1.5)
    else:
        # A distant warm spot instead of a sun: practically parallel over the
        # desk, but its cone falls off across the walls into a lamp-like pool.
        dist = float(os.environ.get('KEY_DIST', '34'))
        aim = Vector((0.5, 4.0, 3.0))
        pos = aim + key_dir * dist
        kd = bpy.data.lights.new('__key', 'SPOT')
        kd.energy = 2.8 * 4 * math.pi * dist * dist * float(os.environ.get('KEY_GAIN', '0.85'))
        kd.color = hex_lin('#ffe0a0')
        kd.spot_size = math.radians(float(os.environ.get('KEY_CONE', '55')))
        kd.spot_blend = float(os.environ.get('KEY_BLEND', '0.9'))
        kd.shadow_soft_size = float(os.environ.get('KEY_SOFT', '1.0'))
        ko = bpy.data.objects.new('__key', kd)
        scene.collection.objects.link(ko)
        ko.location = t2b(pos)
        ko.rotation_euler = (t2b(aim) - t2b(pos)).normalized().to_track_quat('-Z', 'Y').to_euler()
        # Wider, dimmer cones from the same lamp ("cone:gain,..."): a single
        # spot's smoothstep reaches zero over a few degrees, which reads as a
        # hard edge across the back wall once sRGB lifts the dim end. Stacked
        # halos give the pool a long tail into the dark instead.
        halos = os.environ.get('KEY_HALO', '75:0.12,100:0.06')
        for i, spec in enumerate(h for h in halos.split(',') if h):
            cone, gain = (float(x) for x in spec.split(':'))
            hd = kd.copy()
            hd.name = f'__key_halo{i}'
            hd.energy = kd.energy * gain
            hd.spot_size = math.radians(cone)
            hd.spot_blend = 1.0
            ho = bpy.data.objects.new(hd.name, hd)
            scene.collection.objects.link(ho)
            ho.location = ko.location
            ho.rotation_euler = ko.rotation_euler
        # The right wall sees the lamp almost edge-on, so where the halo
        # crosses the back/right corner the wall turns dark in one step. A
        # matching cone linked to the right wall only ("cone:gain") carries
        # the falloff round the corner.
        side = os.environ.get('KEY_SIDE', '100:0.24')
        if side:
            cone, gain = (float(x) for x in side.split(':'))
            sd_ = kd.copy()
            sd_.name = '__key_side'
            sd_.energy = kd.energy * gain
            sd_.spot_size = math.radians(cone)
            sd_.spot_blend = 1.0
            so_ = bpy.data.objects.new(sd_.name, sd_)
            scene.collection.objects.link(so_)
            so_.location = ko.location
            so_.rotation_euler = ko.rotation_euler
            recv = bpy.data.collections.new('__key_side_receivers')
            for n in (ROOM_PREFIX + 'Right', ROOM_PREFIX + 'BaseRight'):
                recv.objects.link(scene.objects[n])
            so_.light_linking.receiver_collection = recv
    add_sun('__rim', (30, 20, -10), hex_lin('#ffe8cc'), 0.03, 3)
    moon = float(os.environ.get('MOON', '0.8'))
    if moon > 0:
        mo = add_sun('__moon', (-2, 4.7, -3), hex_lin('#8fa8ff'), moon, 1.5)
        # The moon comes over the top of the back wall, whose shadow lands on
        # the right wall as a long hard diagonal: blue above, warm below. The
        # home view puts the title on that wall, so by default it skips the
        # moon and keeps the lamp's soft falloff only (MOON_RIGHT=1: as before).
        if os.environ.get('MOON_RIGHT', '0') != '1':
            moon_skip = bpy.data.collections.new('__moon_receivers')
            for n in (ROOM_PREFIX + 'Right', ROOM_PREFIX + 'BaseRight'):
                moon_skip.objects.link(scene.objects[n])
            for co in moon_skip.collection_objects:
                co.light_linking.link_state = 'EXCLUDE'
            mo.light_linking.receiver_collection = moon_skip

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
    hdr_path = os.path.join(os.path.dirname(model_path), 'lebombo_1k.hdr')
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
    return world
