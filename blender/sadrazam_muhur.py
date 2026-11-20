import bpy, os, math
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
out=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','public','models')); os.makedirs(out,exist_ok=True)
gold=bpy.data.materials.new('Sadrazam_Altin'); gold.diffuse_color=(.85,.62,.18,1); gold.use_nodes=True
p=gold.node_tree.nodes['Principled BSDF']; p.inputs['Metallic'].default_value=.85; p.inputs['Roughness'].default_value=.22
p.inputs['Emission'].default_value=(.35,.18,.04,1); p.inputs['Emission Strength'].default_value=.12
bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=2.2,depth=.55,location=(0,.3,0)); seal=bpy.context.object; seal.name='Sadrazam_Muhur'; seal.data.materials.append(gold)
for i in range(12):
 a=i*math.tau/12
 bpy.ops.mesh.primitive_cube_add(size=1,location=(math.cos(a)*1.55,.65,math.sin(a)*1.55)); o=bpy.context.object; o.dimensions=(.12,.12,.55); o.rotation_euler[2]=-a; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(gold)
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'sadrazam_muhur.glb'),export_format='GLB')
