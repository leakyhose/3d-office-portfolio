"""Encode baked EXR lighting into 8-bit sRGB lightmaps.

Blender -b --python encode.py -- <bake_dir> <out_dir> [scale=1.5] [ao_strength=0.5]
final = diffuse * mix(1, ao, ao_strength); stored = final / scale (sRGB 8-bit PNG).
Runtime: lightMapIntensity = PI * scale (LIGHTMAP_SCALE in src/scene/office.ts).
ao_strength approximates the old N8AO contact darkening on top of Cycles' GI.
The result is denoised with OpenImageDenoise (Blender's compositor Denoise
node) after the islands have been dilated into their gutters, like Unity's
lightmapper does; DENOISE=0 skips it.
"""
import sys, os, tempfile
import bpy
import numpy as np
import OpenImageIO as oiio

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]
SCALE = float(argv[2]) if len(argv) > 2 else 1.5
AO = float(argv[3]) if len(argv) > 3 else 0.5
os.makedirs(dst, exist_ok=True)


def read(p):
    buf = oiio.ImageBuf(p)
    px = buf.get_pixels(oiio.FLOAT)
    mask = px[..., 3] > 0.5 if px.shape[-1] > 3 else np.ones(px.shape[:2], bool)
    return px[..., :3], mask


def dilate(img, mask, iterations=12):
    # Grow every island outwards into uncovered texels (average of covered
    # 8-neighbours) so bilinear filtering at island edges never reads black.
    img = img.copy(); mask = mask.copy()
    for _ in range(iterations):
        acc = np.zeros_like(img); cnt = np.zeros(mask.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                m = np.roll(np.roll(mask, dy, 0), dx, 1)
                acc += np.roll(np.roll(img, dy, 0), dx, 1) * m[..., None]
                cnt += m
        grow = (~mask) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][:, None]
        mask = mask | grow
    return img


def denoise(img):
    """OIDN via the compositor: Image -> Denoise -> Composite."""
    h, w = img.shape[:2]
    tmp = tempfile.mkdtemp()
    src_p, out_p = os.path.join(tmp, 'in.exr'), os.path.join(tmp, 'out.exr')
    buf = oiio.ImageBuf(oiio.ImageSpec(w, h, 3, oiio.FLOAT))
    buf.set_pixels(oiio.ROI(), np.ascontiguousarray(img, dtype=np.float32))
    buf.write(src_p)
    scene = bpy.context.scene
    scene.use_nodes = True
    nt = scene.node_tree
    nt.nodes.clear()
    im = nt.nodes.new('CompositorNodeImage')
    im.image = bpy.data.images.load(src_p)
    dn = nt.nodes.new('CompositorNodeDenoise')
    dn.prefilter = 'ACCURATE'
    dn.use_hdr = True
    comp = nt.nodes.new('CompositorNodeComposite')
    nt.links.new(im.outputs['Image'], dn.inputs['Image'])
    nt.links.new(dn.outputs['Image'], comp.inputs['Image'])
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '32'
    scene.render.image_settings.color_mode = 'RGB'
    scene.view_settings.view_transform = 'Standard'
    scene.render.filepath = out_p
    bpy.ops.render.render(write_still=True)
    res = oiio.ImageBuf(out_p).get_pixels(oiio.FLOAT)[..., :3]
    return np.maximum(res, 0)


def lin_to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


for which in ('atlas', 'room', 'floor'):
    d, mask = read(os.path.join(src, f'{which}_diffuse.exr'))
    ao, _ = read(os.path.join(src, f'{which}_ao.exr'))
    final = d * (1 - AO + AO * ao[..., :1])
    print(which, 'coverage', mask.mean())
    final = dilate(final, mask)
    if os.environ.get('DENOISE', '1') == '1':
        final = denoise(final)
    print(which, 'max', final.max(), 'p99', np.percentile(final, 99), 'p50', np.percentile(final, 50))
    enc = (lin_to_srgb(final / SCALE) * 255 + 0.5).astype(np.uint8)
    out = oiio.ImageBuf(oiio.ImageSpec(enc.shape[1], enc.shape[0], 3, oiio.UINT8))
    out.set_pixels(oiio.ROI(), enc)
    out.write(os.path.join(dst, f'{which}.png'))
print('ENCODED')
