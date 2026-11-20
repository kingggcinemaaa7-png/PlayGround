"""
Shared Blender helpers for Çay Ocağı Kaosu procedural assets.

Works with Blender 4.x and 5.x. Imported by mahalle_meydani.py,
karakterler.py and objeler.py; also exports the common GLB/manifest helpers.
"""
import json
import math
import os

import bpy
from mathutils import Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "models")
MANIFEST = os.path.join(OUT_DIR, "manifest.json")


# ------------------------------------------------------------------ scene

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"


def material(name, color, metallic=0.0, roughness=0.6, emission=None, alpha=1.0):
    """Create a Principled BSDF material that survives glTF export."""
    key = name
    if key in bpy.data.materials:
        return bpy.data.materials[key]
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
        try:
            mat.blend_method = "BLEND"
        except TypeError:
            pass
    return mat


def _finish(obj, mat=None, smooth=False):
    if mat is not None:
        obj.data.materials.append(mat)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


# --------------------------------------------------------------- primitives

def cube(name, size, location=(0, 0, 0), rotation=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, mat)


def cylinder(name, radius, depth, location=(0, 0, 0), rotation=(0, 0, 0),
             vertices=20, mat=None, smooth=True, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    if scale != (1, 1, 1):
        obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, mat, smooth)


def cone(name, r1, r2, depth, location=(0, 0, 0), rotation=(0, 0, 0),
         vertices=20, mat=None, smooth=True):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2,
                                    depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return _finish(obj, mat, smooth)


def sphere(name, radius, location=(0, 0, 0), scale=(1, 1, 1), mat=None,
           segments=20, rings=12, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings,
                                         radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, mat, smooth)


def torus(name, major, minor, location=(0, 0, 0), rotation=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     location=location, rotation=rotation,
                                     major_segments=24, minor_segments=8)
    obj = bpy.context.object
    obj.name = name
    return _finish(obj, mat, True)


def between(name, start, end, radius, mat=None, vertices=8):
    """Cylinder between two points (for cables, branches, table legs)."""
    from mathutils import Vector
    a, b = Vector(start), Vector(end)
    direction = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius,
                                        depth=max(0.0001, direction.length))
    obj = bpy.context.object
    obj.name = name
    if direction.length > 0:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.location = (a + b) / 2
    return _finish(obj, mat, True)


# ------------------------------------------------------------------ export

def ensure_out():
    os.makedirs(OUT_DIR, exist_ok=True)


def export_glb(name, apply=True, animations=False):
    ensure_out()
    path = os.path.join(OUT_DIR, name + ".glb")
    bpy.ops.object.select_all(action="DESELECT")
    selected = [obj for obj in bpy.context.scene.objects if obj.type in {"MESH", "ARMATURE"}]
    for obj in selected:
        obj.select_set(True)
    if not selected:
        raise RuntimeError("nothing to export for " + name)
    bpy.context.view_layer.objects.active = selected[0]
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=apply,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=animations,
    )
    if animations:
        kwargs["export_animation_mode"] = "ACTIONS"
    bpy.ops.export_scene.gltf(**kwargs)
    size = os.path.getsize(path)
    if size < 512:
        raise RuntimeError("exported file looks empty: %s (%d bytes)" % (path, size))
    print("[models] %-22s %7.1f KB" % (name + ".glb", size / 1024))
    return {"file": name + ".glb", "bytes": size}


def write_manifest(assets, generator):
    """Merge this run's assets into the shared models/manifest.json."""
    ensure_out()
    existing = {}
    try:
        with open(MANIFEST, "r", encoding="utf-8") as handle:
            for item in json.load(handle).get("assets", []):
                existing[item.get("file")] = item
    except (OSError, ValueError):
        pass
    for item in assets:
        existing[item["file"]] = item
    payload = {
        "generator": "blender/build-all.sh",
        "last_script": generator,
        "blender": bpy.app.version_string,
        "license": "CC0-1.0",
        "assets": [existing[key] for key in sorted(existing)],
    }
    with open(MANIFEST, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
