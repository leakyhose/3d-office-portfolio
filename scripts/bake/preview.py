"""Quick Cycles renders of the app's camera views, for iterating on the room
and lights in stage.py without running the full lightmap bake.

  Blender -b --python scripts/bake/preview.py -- art/newcat.glb <out_dir> [views=home,about,...] [samples=48] [scale=50]

Renders with the real albedo (the bake uses grey) and approximates the app:
unlit screen showing the Win95 clouds, #1e1a15 backdrop, no tone mapping.
"""
import bpy, sys, os, math
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import stage  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
IN, OUT = argv[0], argv[1]
VIEWS = argv[2].split(',') if len(argv) > 2 and argv[2] else ['home', 'about', 'experience', 'projects', 'contact', 'far']
SAMPLES = int(argv[3]) if len(argv) > 3 else 48
SCALE = int(argv[4]) if len(argv) > 4 else 50
os.makedirs(OUT, exist_ok=True)

# position, look-at target (from src/config/views.ts; target = position + 20 * forward)
# [, vertical lens shift (views.ts wideShift, NDC)]
CAMS = {
    'home': ((-8, 12, 19), (4.96, 4.0, 6.04)),
    'about': ((-0.29, 5.61, 4.35), (-20.11, 7.91, 3.0)),
    'experience': ((5.95, 7.36, 2.2), (5.95, -12.64, 1.84), 0.3),
    'projects': ((0.2, 6.5, 6.0), (4.17, 6.5, -13.6), -0.74),
    'contact': ((7.6, 7.9, -0.4), (-9.29, -2.7, -1.88)),
    'far': ((16, 16, 27), (-2, 4, 1)),
    'behind': ((14, 14, -16), (0, 4, 2)),
    'right': ((22, 12, 14), (0, 4, 2)),
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
scene = bpy.context.scene
stage.arrange(scene)  # desk rearrangement (see stage.OBJECT_MOVES)

# Floor (runtime: 600x600 plane, colour = backdrop)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.01))
floor = bpy.context.active_object
floor.data.materials.append(stage.material('__floor', stage.FLOOR_COLOR))

_, sky = stage.build_room()
world = stage.add_lights(IN)

# Night sky behind the window (runtime: unlit canvas texture)
skm = sky.data.materials[0]
skm.use_nodes = True
skm.node_tree.nodes.clear()
_o = skm.node_tree.nodes.new('ShaderNodeOutputMaterial')
_e = skm.node_tree.nodes.new('ShaderNodeEmission')
_e.inputs['Color'].default_value = (*stage.hex_lin('#1b2a4a'), 1)
skm.node_tree.links.new(_e.outputs['Emission'], _o.inputs['Surface'])

# Backdrop colour for camera rays only (lighting unchanged).
nt = world.node_tree
outn = next(n for n in nt.nodes if n.type == 'OUTPUT_WORLD')
bg = outn.inputs['Surface'].links[0].from_node
lp = nt.nodes.new('ShaderNodeLightPath')
bd = nt.nodes.new('ShaderNodeBackground')
bd.inputs['Color'].default_value = (*stage.hex_lin('#1e1a15'), 1)
mix = nt.nodes.new('ShaderNodeMixShader')
nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
nt.links.new(bg.outputs['Background'], mix.inputs[1])
nt.links.new(bd.outputs['Background'], mix.inputs[2])
nt.links.new(mix.outputs['Shader'], outn.inputs['Surface'])

# Screen: emissive clouds image (runtime MeshBasicMaterial, colour 0.95)
scr = scene.objects['ComputerScreen']
sm = bpy.data.materials.new('__screen')
sm.use_nodes = True
snt = sm.node_tree
snt.nodes.clear()
so = snt.nodes.new('ShaderNodeOutputMaterial')
em = snt.nodes.new('ShaderNodeEmission')
img = snt.nodes.new('ShaderNodeTexImage')
img.image = bpy.data.images.load(os.path.join(os.path.dirname(IN), '..', 'art', 'screen', 'clouds_background.png'))
em.inputs['Strength'].default_value = 0.95
snt.links.new(img.outputs['Color'], em.inputs['Color'])
snt.links.new(em.outputs['Emission'], so.inputs['Surface'])
scr.data.materials.clear()
scr.data.materials.append(sm)
scr.visible_diffuse = False  # its light is the __crt spot, as in the bake

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.render.resolution_x = 1440
scene.render.resolution_y = 900
scene.render.resolution_percentage = SCALE
scene.render.image_settings.file_format = 'PNG'

cam_data = bpy.data.cameras.new('__cam')
cam_data.sensor_fit = 'VERTICAL'
cam_data.angle_y = math.radians(50)
cam_data.clip_start = 0.1
cam_data.clip_end = 1000
cam = bpy.data.objects.new('__cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

for v in VIEWS:
    pos, tgt = CAMS[v][:2]
    # setViewOffset shifts by NDC/2 of the height; Blender's shift is in units of the width
    cam_data.shift_y = -(CAMS[v][2] if len(CAMS[v]) > 2 else 0) / 2 * 900 / 1440
    cam.location = stage.t2b(pos)
    cam.rotation_euler = (stage.t2b(tgt) - stage.t2b(pos)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(OUT, f'{v}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', v, flush=True)
