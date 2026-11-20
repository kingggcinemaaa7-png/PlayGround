#!/usr/bin/env python3
"""
Procedural GLB exporter for Çay Ocağı Kaosu.

Works with Blender 4.x and 5.x (tested on 5.0). Run headless:

    blender --background --factory-startup --python blender/export_models.py

Every asset is built from primitives, assigned Principled BSDF materials and
exported as a self-contained .glb into public/models/. No external textures or
addons are required.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "models")
EXPORTED = []


# ---------------------------------------------------------------- scene utils

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"


def material(name, color, metallic=0.0, roughness=0.6, emission=None, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, alpha)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, alpha)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if emission:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
                bsdf.inputs["Emission Strength"].default_value = 2.0
            elif "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = (*emission, 1.0)
    if alpha < 1.0:
        mat.blend_method = "BLEND"
    return mat


def _finish(obj, mat, smooth=False):
    if mat is not None:
        obj.data.materials.append(mat)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def cube(name, size, location=(0, 0, 0), rotation=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, mat)


def cylinder(name, radius, depth, location=(0, 0, 0), rotation=(0, 0, 0), vertices=20, mat=None, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return _finish(obj, mat, smooth)


def cone(name, r1, r2, depth, location=(0, 0, 0), vertices=20, mat=None, smooth=True):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    return _finish(obj, mat, smooth)


def sphere(name, radius, location=(0, 0, 0), scale=(1, 1, 1), mat=None, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, mat, True)


def torus(name, major, minor, location=(0, 0, 0), rotation=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=location, rotation=rotation, major_segments=24, minor_segments=8)
    obj = bpy.context.object
    obj.name = name
    return _finish(obj, mat, True)


def badge(name, label, location):
    """Small geometric plate that survives GLB export (no text objects)."""
    return cube(name, (0.18, 0.02, 0.06), location=location, mat=material("Badge" + label, (0.9, 0.55, 0.18), metallic=0.7, roughness=0.3))


# ------------------------------------------------------------------- assets

def build_tea_glass():
    glass = material("Glass", (0.72, 0.86, 0.9), metallic=0.05, roughness=0.08, alpha=0.45)
    tea = material("Tea", (0.42, 0.12, 0.03), metallic=0.0, roughness=0.22, emission=(0.22, 0.05, 0.01))
    saucer = material("Saucer", (0.92, 0.84, 0.68), roughness=0.35)

    cylinder("Saucer", 0.075, 0.008, (0, 0, 0.004), mat=saucer, vertices=24)
    cone("GlassBody", 0.038, 0.055, 0.11, (0, 0, 0.063), vertices=24, mat=glass)
    cylinder("Tea", 0.047, 0.07, (0, 0, 0.055), mat=tea, vertices=24)
    torus("Rim", 0.055, 0.0035, (0, 0, 0.118), mat=glass)
    cylinder("Sugar", 0.013, 0.016, (0.105, 0.02, 0.008), mat=material("Sugar", (0.98, 0.96, 0.9), roughness=0.9), vertices=8)
    return "cay_bardagi"


def build_samovar():
    copper = material("Copper", (0.62, 0.24, 0.08), metallic=0.9, roughness=0.25)
    brass = material("Brass", (0.85, 0.58, 0.2), metallic=0.85, roughness=0.28)
    dark = material("StoveDark", (0.08, 0.06, 0.05), metallic=0.5, roughness=0.7)
    glow = material("Ember", (0.9, 0.25, 0.05), emission=(1.0, 0.28, 0.05), roughness=0.5)

    cylinder("Base", 0.18, 0.06, (0, 0, 0.03), mat=dark, vertices=24)
    cone("Firebox", 0.17, 0.2, 0.22, (0, 0, 0.17), vertices=24, mat=copper)
    cylinder("Belly", 0.2, 0.3, (0, 0, 0.43), mat=copper, vertices=24)
    cone("Shoulder", 0.2, 0.12, 0.14, (0, 0, 0.65), vertices=24, mat=brass)
    cylinder("Chimney", 0.055, 0.3, (0, 0, 0.85), mat=brass, vertices=16)
    cone("ChimneyCap", 0.08, 0.03, 0.06, (0, 0, 1.02), vertices=16, mat=copper)
    torus("HandleL", 0.07, 0.012, (-0.22, 0, 0.45), rotation=(0, math.pi / 2, 0), mat=brass)
    torus("HandleR", 0.07, 0.012, (0.22, 0, 0.45), rotation=(0, math.pi / 2, 0), mat=brass)
    cube("Tap", (0.14, 0.03, 0.03), (0.23, 0, 0.28), mat=brass)
    cylinder("TapHandle", 0.022, 0.03, (0.3, 0, 0.28), rotation=(0, math.pi / 2, 0), mat=brass, vertices=10)
    cube("EmberWindow", (0.12, 0.02, 0.07), (0, -0.17, 0.16), mat=glow)
    for i in range(3):
        torus("Band%d" % i, 0.202, 0.008, (0, 0, 0.34 + i * 0.09), mat=brass)
    cube("TeaPot", (0.11, 0.11, 0.09), (0, 0, 0.72), mat=brass)
    cube("TeaPotLid", (0.08, 0.08, 0.02), (0, 0, 0.775), mat=copper)
    return "semaver"


def build_okey_table():
    felt = material("Felt", (0.05, 0.33, 0.2), roughness=1.0)
    wood = material("Wood", (0.28, 0.15, 0.07), roughness=0.55)
    wood_light = material("WoodLight", (0.45, 0.26, 0.12), roughness=0.5)
    ivory = material("Ivory", (0.94, 0.89, 0.76), roughness=0.42)
    red = material("TileRed", (0.7, 0.1, 0.08), roughness=0.4)
    black = material("TileBlack", (0.06, 0.06, 0.07), roughness=0.4)

    cube("Top", (1.2, 0.82, 0.06), (0, 0, 0.75), mat=wood)
    cube("Felt", (1.1, 0.72, 0.012), (0, 0, 0.785), mat=felt)
    for x in (-0.46, 0.46):
        for y in (-0.3, 0.3):
            cube("Leg", (0.07, 0.07, 0.72), (x, y, 0.37), mat=wood)
    # Chairs
    for i, (x, y, ry) in enumerate(((-0.78, 0, 0), (0.78, 0, math.pi), (0, -0.62, math.pi / 2), (0, 0.62, -math.pi / 2))):
        cube("Seat%d" % i, (0.38, 0.38, 0.05), (x, y, 0.44), rotation=(0, 0, ry), mat=wood_light)
        cube("Back%d" % i, (0.38, 0.05, 0.36), (x, y + 0.165, 0.62), rotation=(0, 0, ry), mat=wood_light)
        for lx in (-0.15, 0.15):
            for ly in (-0.15, 0.15):
                px, py = x + lx * math.cos(ry) - ly * math.sin(ry), y + lx * math.sin(ry) + ly * math.cos(ry)
                cube("ChairLeg", (0.035, 0.035, 0.42), (px, py, 0.21), mat=wood)
    # Okey rack and tiles
    for i in range(7):
        cube("Tile%d" % i, (0.07, 0.03, 0.025), (-0.3 + i * 0.09, 0.24, 0.81), mat=ivory)
    cube("TileRed1", (0.07, 0.03, 0.025), (0.14, -0.18, 0.81), mat=red)
    cube("TileBlack1", (0.07, 0.03, 0.025), (0.25, -0.18, 0.81), mat=black)
    cylinder("Dice", 0.045, 0.045, (0.38, 0.2, 0.81), rotation=(math.pi / 4, 0, 0), vertices=12, mat=ivory)
    return "okey_masasi"


def build_tost():
    plate = material("Plate", (0.95, 0.93, 0.88), roughness=0.3)
    bread = material("Bread", (0.72, 0.42, 0.12), roughness=0.85)
    crust = material("Crust", (0.45, 0.22, 0.06), roughness=0.9)
    cheese = material("Cheese", (0.98, 0.78, 0.22), roughness=0.5)
    tomato = material("Tomato", (0.72, 0.08, 0.05), roughness=0.45)

    cylinder("Plate", 0.22, 0.025, (0, 0, 0.0125), vertices=32, mat=plate)
    cylinder("PlateRim", 0.225, 0.012, (0, 0, 0.03), vertices=32, mat=plate)
    for i, (x, y, rz) in enumerate(((-0.04, 0, 0.1), (0.04, 0.01, -0.08))):
        cube("Bread%d" % i, (0.22, 0.16, 0.035), (x, y, 0.06 + i * 0.04), rotation=(0, 0, rz), mat=bread)
        cube("Crust%d" % i, (0.225, 0.165, 0.012), (x, y, 0.085 + i * 0.04), rotation=(0, 0, rz), mat=crust)
    cube("Cheese", (0.2, 0.14, 0.02), (0.04, 0.02, 0.115), rotation=(0, 0, -0.08), mat=cheese)
    cylinder("Tomato", 0.035, 0.012, (0.13, -0.08, 0.05), vertices=16, mat=tomato)
    return "tost"


def build_cat():
    fur = material("Fur", (0.34, 0.2, 0.1), roughness=0.95)
    fur_light = material("FurLight", (0.55, 0.38, 0.22), roughness=0.95)
    nose = material("Nose", (0.72, 0.36, 0.36), roughness=0.7)
    eye = material("Eye", (0.65, 0.75, 0.1), roughness=0.3)

    sphere("Body", 0.23, (0, 0, 0.13), scale=(1.5, 0.85, 0.62), mat=fur)
    sphere("Head", 0.13, (0.3, 0, 0.17), scale=(0.9, 1.0, 0.9), mat=fur)
    for side in (-1, 1):
        cone("Ear", 0.06, 0.0, 0.1, (0.3, 0.09 * side, 0.3), vertices=4, mat=fur, smooth=False)
        sphere("Eye", 0.016, (0.39, 0.055 * side, 0.2), mat=eye)
        sphere("Paw", 0.045, (0.2, 0.14 * side, 0.045), scale=(1.4, 0.8, 0.5), mat=fur_light)
    sphere("Nose", 0.016, (0.43, 0, 0.16), mat=nose)
    # Curled tail and stripes
    for i in range(5):
        angle = i * 0.55
        sphere("Tail", 0.055 - i * 0.004, (-0.3 - math.cos(angle) * 0.12, math.sin(angle) * 0.12, 0.09 + i * 0.015), mat=fur)
    for i in range(4):
        cube("Stripe", (0.018, 0.18 - i * 0.02, 0.01), (-0.1 + i * 0.09, 0, 0.29), mat=fur_light)
    return "uyuyan_kedi"


def build_tray():
    brass = material("TrayBrass", (0.82, 0.55, 0.18), metallic=0.9, roughness=0.22)
    glass = material("TrayGlass", (0.72, 0.86, 0.9), roughness=0.08, alpha=0.45)
    tea = material("TrayTea", (0.45, 0.13, 0.03), roughness=0.22)
    sugar = material("TraySugar", (0.98, 0.96, 0.9), roughness=0.9)

    cylinder("Tray", 0.42, 0.02, (0, 0, 0.01), vertices=32, mat=brass)
    torus("TrayRim", 0.42, 0.015, (0, 0, 0.025), mat=brass)
    for i, angle in enumerate((0, math.pi / 2, math.pi, math.pi * 1.5, math.pi / 4, math.pi * 1.25)):
        x, y = math.cos(angle) * 0.25, math.sin(angle) * 0.25
        cone("Glass%d" % i, 0.03, 0.042, 0.085, (x, y, 0.07), vertices=16, mat=glass)
        cylinder("Tea%d" % i, 0.036, 0.05, (x, y, 0.062), mat=tea, vertices=16)
        torus("Rim%d" % i, 0.042, 0.0025, (x, y, 0.113), mat=glass)
    for i in range(4):
        cube("Sugar%d" % i, (0.022, 0.022, 0.018), (-0.08 + i * 0.03, -0.32, 0.03), mat=sugar)
    return "cay_tepsisi"


def build_street_lamp():
    iron = material("Iron", (0.1, 0.1, 0.11), metallic=0.8, roughness=0.4)
    glass = material("LampGlass", (1.0, 0.82, 0.48), emission=(1.0, 0.65, 0.24), roughness=0.15, alpha=0.75)
    glow = material("LampGlow", (1.0, 0.7, 0.3), emission=(1.0, 0.62, 0.2), roughness=0.5)

    cylinder("Base", 0.15, 0.18, (0, 0, 0.09), vertices=16, mat=iron)
    cylinder("Pole", 0.045, 2.5, (0, 0, 1.35), vertices=12, mat=iron)
    cube("Arm", (0.5, 0.05, 0.05), (0.22, 0, 2.55), mat=iron)
    cone("LanternTop", 0.16, 0.05, 0.12, (0.45, 0, 2.45), vertices=8, mat=iron, smooth=False)
    cylinder("LanternGlass", 0.11, 0.22, (0.45, 0, 2.32), vertices=8, mat=glass)
    sphere("Bulb", 0.055, (0.45, 0, 2.32), mat=glow)
    cone("LanternBottom", 0.13, 0.06, 0.06, (0.45, 0, 2.19), vertices=8, mat=iron, smooth=False)
    cylinder("Finial", 0.025, 0.1, (0.45, 0, 2.56), vertices=8, mat=iron)
    return "sokak_lambasi"


BUILDERS = [
    build_tea_glass,
    build_samovar,
    build_okey_table,
    build_tost,
    build_cat,
    build_tray,
    build_street_lamp,
]


# -------------------------------------------------------------------- export

def export_glb(name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name + ".glb")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.select_set(True)
    bpy.context.view_layer.objects.active = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "MESH"), None
    )
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    size = os.path.getsize(path)
    if size < 512:
        raise RuntimeError("exported file looks empty: %s (%d bytes)" % (path, size))
    EXPORTED.append((name, size))
    print("[models] %-18s %7.1f KB" % (name + ".glb", size / 1024))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("[models] Blender", bpy.app.version_string)
    for builder in BUILDERS:
        reset_scene()
        name = builder()
        export_glb(name)
    manifest = os.path.join(OUT_DIR, "manifest.json")
    with open(manifest, "w", encoding="utf-8") as handle:
        import json
        json.dump(
            {
                "generator": "blender/export_models.py",
                "blender": bpy.app.version_string,
                "assets": [
                    {"file": name + ".glb", "bytes": size, "license": "CC0-1.0"}
                    for name, size in EXPORTED
                ],
            },
            handle,
            indent=2,
        )
        handle.write("\n")
    print("[models] wrote %d GLB files -> %s" % (len(EXPORTED), OUT_DIR))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # Blender returns 0 on script exceptions otherwise.
        print("[models] FAILED:", exc, file=sys.stderr)
        raise
