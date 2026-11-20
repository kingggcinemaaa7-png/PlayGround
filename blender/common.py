# Blender 4.x ortak yardımcıları
import bpy, os
from mathutils import Vector

def reset_scene():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for db in (bpy.data.meshes,bpy.data.curves,bpy.data.armatures,bpy.data.materials):
        pass

def mat(name,color,metal=0,rough=.5,emission=None):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Metallic'].default_value=metal; bs.inputs['Roughness'].default_value=rough
    if emission:
        bs.inputs['Emission Color'].default_value=(*emission,1); bs.inputs['Emission Strength'].default_value=4
    return m

def cube(name,loc,scale,material,bevel=.05):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('PBR_Bevel','BEVEL'); mod.width=bevel; mod.segments=2
    o.data.materials.append(material); return o

def cylinder(name,loc,radius,depth,material,vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc); o=bpy.context.object; o.name=name; o.data.materials.append(material); return o

def export_glb(filename):
    folder=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','public','models')); os.makedirs(folder,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(folder,filename),export_format='GLB',export_animations=True,export_apply=True)
