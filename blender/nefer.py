import bpy, os
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
out=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','public','models')); os.makedirs(out,exist_ok=True)
def mat(name,color,metal=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes['Principled BSDF']; p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=.5
 return m
cloth=mat('Nefer',(.45,.08,.06)); armor=mat('Zirh',(.45,.48,.48),.65); gold=mat('Altin',(.8,.58,.18),.8)
bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.32,depth=1.4,location=(0,1,0)); o=bpy.context.object; o.name='Nefer_Govde'; o.data.materials.append(cloth)
bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.28,location=(0,1.9,0)); bpy.context.object.name='Kafa'
for name,material in [('Tier1_Nefer',cloth),('Tier2_Sipahi',armor),('Tier3_Sancaktar',cloth),('Tier4_Vezir',gold)]:
 bpy.ops.mesh.primitive_torus_add(major_radius=.48,minor_radius=.055,major_segments=16,minor_segments=6,location=(0,2.45,0)); o=bpy.context.object; o.name=name; o.data.materials.append(material)
bpy.ops.mesh.primitive_torus_add(major_radius=.5,minor_radius=.035,major_segments=32,minor_segments=6,location=(0,2.35,.05)); bpy.context.object.name='AvatarFrame'
bpy.context.scene.frame_start=1; bpy.context.scene.frame_end=60
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'nefer.glb'),export_format='GLB',export_animations=True)
