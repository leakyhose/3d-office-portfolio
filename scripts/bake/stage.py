"""Desk arrangement + lights shared by bake.py (lightmap bake) and preview.py
(quick Cycles renders of the app's camera views for art direction).

The desk stands on an open floor under a distant warm key, in a dark void:
no walls, so the floor is evenly lit everywhere outside the desk's and
chair's shadows and every view's text sits over the same plain, dark floor.
(Until 2026-11, a room with a window, rug and a lamp-pool key surrounded the
desk; see git history for build_room().)

Coordinates: three (x, y, z) == Blender (x, -z, y). Helpers take three coords.
"""
import bpy, bmesh, math, os
from mathutils import Vector


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


# --- Desk rearrangement ------------------------------------------------------
# Moves applied to the source model (art/newcat.glb) before baking, so the
# runtime GLB, its lightmaps and preview.py all agree. Three-space deltas.
#
# SpeakerL: from beside the monitor's front to the back of the desk, against
# the PC case. Seen square-on (projects view) it then hides behind the case,
# so on squarer screens the shot can show the monitor higher up without the
# speaker standing behind the panel's nav links.
OBJECT_MOVES = {
    'SpeakerL_ComputerDesk_0': (-0.18, 0.0, -1.3),
}
# The speaker cable's right-hand branch ran on to the speaker's old place:
# cut it off inside the speaker's new place (drop the vertices right of x and
# in front of z, three space), so it ends inside the speaker.
SPEAKER_CABLE_CUT = (1.1, 0.7)
# The mouse cable ran past the back of the desk through the speaker's new
# place: bend that stretch out to the right (three x += this, faded in and
# out along z over MOUSE_CABLE_BEND_Z = (z0, z1, z2, z3)).
MOUSE_CABLE_BEND = 0.3
MOUSE_CABLE_BEND_Z = (-0.3, 0.0, 0.85, 1.6)


def _smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def arrange(scene):
    """Applies OBJECT_MOVES and the matching cable edits to the imported model."""
    for name, d in OBJECT_MOVES.items():
        scene.objects[name].location += t2b(d)

    cable = scene.objects['Speakers_cable_ComputerDesk_0']
    mw = cable.matrix_world
    bm = bmesh.new()
    bm.from_mesh(cable.data)
    cx, cz = SPEAKER_CABLE_CUT
    cut = [v for v in bm.verts if (mw @ v.co).x > cx and -(mw @ v.co).y > cz]
    bmesh.ops.delete(bm, geom=cut, context='VERTS')
    bm.to_mesh(cable.data)
    bm.free()

    mouse = scene.objects['BézierCurve']
    mw = mouse.matrix_world
    inv = mw.inverted()
    z0, z1, z2, z3 = MOUSE_CABLE_BEND_Z
    for v in mouse.data.vertices:
        w = mw @ v.co
        tz = -w.y  # three z
        if w.x < 1.3:  # the other strand, and the loop hanging off the desk
            continue
        k = _smooth(z0, z1, tz) * (1 - _smooth(z2, z3, tz))
        if k > 0:
            v.co = inv @ (w + Vector((MOUSE_CABLE_BEND * k, 0, 0)))
    mouse.data.update()


# Keep in sync with FLOOR_COLOR in src/components/Scene.tsx. Lighter than the
# backdrop (#1e1a15): lit, it's the warm brown the original realtime render
# had; the fog takes it to the backdrop colour towards the horizon.
FLOOR_COLOR = '#34312e'
KEY_POS = (14.2, 13.3, 12.3)  # direction towards the key sun
CHAIR = 'Cube.000_ComputerDesk_0'


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
    # The key: the original realtime directional light. As a sun (parallel,
    # no falloff) it lights the floor evenly to the horizon, so nothing but
    # the desk's and chair's own shadows varies behind the panels' text.
    key = add_sun('__key', KEY_POS, hex_lin('#ffe0a0'), 2.8, 1.5)
    # From this side the backrest shades most of the seat, which then reads
    # as a dark hole in the middle of the home view. The chair takes the key
    # from its own sun instead, one it casts no shadow from: seat and backrest
    # are lit through, while the chair still shadows the floor.
    chair = scene.objects[CHAIR]
    only_chair = bpy.data.collections.new('__key_chair_only')
    only_chair.objects.link(chair)
    not_chair = bpy.data.collections.new('__key_not_chair')
    not_chair.objects.link(chair)
    not_chair.collection_objects[0].light_linking.link_state = 'EXCLUDE'
    key.light_linking.receiver_collection = not_chair
    chair_key = add_sun('__key_chair', KEY_POS, hex_lin('#ffe0a0'), 2.8, 1.5)
    chair_key.light_linking.receiver_collection = only_chair
    chair_key.light_linking.blocker_collection = not_chair
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
