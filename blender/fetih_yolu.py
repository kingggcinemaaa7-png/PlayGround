import bpy, os, sys
sys.path.insert(0,os.path.dirname(__file__))
from common import *
reset_scene()
stone=mat('Selcuk_Kaya',(0.42,.38,.30),0,.9); gold=mat('Osmanli_Altin',(0.82,.55,.12),.75,.25); red=mat('Kadife',(0.42,.035,.025),0,.55); flame=mat('Mescil_Atesi',(1,.22,.03),0,.25,(1,.09,.01))
for z in range(-120,121,4):
    cube('Tas_Kaldirim',(0,0,z),(12,.35,3.7),stone,.12)
for side in (-1,1):
    for z in range(-110,111,12):
        cylinder('Meşale_Diregi',(side*8,1.8,z),.18,3.6,mat('Demir',(0.08,.07,.06),.7,.3),10)
        bpy.ops.mesh.primitive_cone_add(vertices=10,radius1=.45,radius2=.08,depth=1.2,location=(side*8,4,z)); bpy.context.object.data.materials.append(flame)
for i in range(-4,5):
    bpy.ops.mesh.primitive_torus_add(major_radius=3.4,minor_radius=.28,major_segments=24,minor_segments=8,location=(i*13,3,-40)); bpy.context.object.name='Kemeri_Kale_Taci'; bpy.context.object.data.materials.append(stone)
for i in range(-3,4):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=(i*9,4,-100)); d=bpy.context.object; d.name='Kubbe'; d.scale=(2,1.3,2); d.data.materials.append(red)
export_glb('fetih_yolu.glb')
