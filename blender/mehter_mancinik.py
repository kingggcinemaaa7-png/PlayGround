import bpy, os, math
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
out=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','public','models')); os.makedirs(out,exist_ok=True)
def mat(name,color,metal=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes['Principled BSDF']; p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=.55
 return m
wood=mat('Ceviz',(.28,.12,.05)); gold=mat('Kuslama',(.72,.5,.12),.7); red=mat('Davul_Derisi',(.52,.08,.06))
bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.9,depth=.7,location=(0,1.2,0),rotation=(math.pi/2,0,0)); drum=bpy.context.object; drum.name='Kos_Davul'; drum.data.materials.append(red)
bpy.ops.mesh.primitive_torus_add(major_radius=.78,minor_radius=.12,major_segments=24,minor_segments=8,location=(0,1.2,.35),rotation=(math.pi/2,0,0)); bpy.context.object.data.materials.append(gold)
bpy.ops.mesh.primitive_cube_add(size=1,location=(5,.5,0)); base=bpy.context.object; base.name='Mancinik_Govde'; base.dimensions=(3,.7,2); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); base.data.materials.append(wood)
for x in (4,6):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,1.5,-.7)); arm=bpy.context.object; arm.name='Mancinik_Destegi'; arm.dimensions=(.25,2.5,.25); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); arm.data.materials.append(wood)
bpy.context.scene.frame_start=1; bpy.context.scene.frame_end=60
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'mehter_davul.glb'),export_format='GLB',export_animations=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'mancinik.glb'),export_format='GLB',export_animations=True)
