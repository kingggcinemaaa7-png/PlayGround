import bpy, math, os
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
out=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','public','models')); os.makedirs(out,exist_ok=True)
def mat(name,color,metal=0,emission=None):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes['Principled BSDF']; p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=.6
 if emission:
  p.inputs['Emission'].default_value=(*emission,1); p.inputs['Emission Strength'].default_value=3
 return m
stone=mat('Selcuk_tasi',(.38,.34,.25)); gold=mat('Altin',(.82,.58,.16),.8); fire=mat('Meşale_Ateşi',(1,.12,.02),0,(1,.05,.01))
for z in range(-22,33,3):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,z)); o=bpy.context.object; o.name='Tas_Yol'; o.dimensions=(12,.25,2.7); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(stone)
for x in (-7,7):
 for z in (-18,-10,-2,6,14,22):
  bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.13,depth=2.2,location=(x,1,z)); bpy.context.object.data.materials.append(stone)
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.32,location=(x,2.2,z)); bpy.context.object.data.materials.append(fire)
for i,x in enumerate((-8,-4,0,4,8)):
 bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=1.8,radius2=1.1,depth=4,location=(x,2,-24)); bpy.context.object.data.materials.append(stone)
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'fetih_yolu.glb'),export_format='GLB')
