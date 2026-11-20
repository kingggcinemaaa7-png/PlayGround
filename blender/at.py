import bpy, os
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
out=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','public','models')); os.makedirs(out,exist_ok=True)
def mat(name,color,metal=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes['Principled BSDF']; p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=.55
 return m
horse=mat('At_Deri',(.25,.10,.06)); armor=mat('At_Zirh',(.48,.50,.48),.7); cloth=mat('Islemeli_Ortu',(.5,.05,.04))
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,1.4,0)); body=bpy.context.object; body.name='At_Govde'; body.dimensions=(1.4,.9,2.8); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); body.data.materials.append(horse)
for x in (-.45,.45):
 for z in (-1,.9):
  bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=.12,depth=1.3,location=(x,.45,z)); bpy.context.object.data.materials.append(horse)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,1.75,0)); cover=bpy.context.object; cover.name='Zirhli_Ortu'; cover.dimensions=(1.55,.12,2.2); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); cover.data.materials.append(cloth)
bpy.context.scene.frame_start=1; bpy.context.scene.frame_end=60
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'at.glb'),export_format='GLB',export_animations=True)
