import bpy, os
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
out=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','public','models')); os.makedirs(out,exist_ok=True)
gold=bpy.data.materials.new('Altin_Varak'); gold.diffuse_color=(.82,.58,.18,1); gold.use_nodes=True
p=gold.node_tree.nodes['Principled BSDF']; p.inputs['Metallic'].default_value=.9; p.inputs['Roughness'].default_value=.22
red=bpy.data.materials.new('Kadife'); red.diffuse_color=(.55,.04,.04,1); red.use_nodes=True
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,.5,0)); base=bpy.context.object; base.name='Saltanat_Tahti'; base.dimensions=(4,.8,3); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); base.data.materials.append(gold)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,2.5,-1.2)); back=bpy.context.object; back.dimensions=(4,4,.35); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); back.data.materials.append(red)
for x in (-2,2):
 bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.25,depth=4,location=(x,2,0)); bpy.context.object.data.materials.append(gold)
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'otag_taht.glb'),export_format='GLB')
