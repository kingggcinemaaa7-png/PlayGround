import bpy, os, sys
sys.path.insert(0,os.path.dirname(__file__))
from common import *
reset_scene()
red=mat('Nefer_Kirmizi',(0.45,.05,.035),0,.65); steel=mat('Zirh_Celik',(0.52,.55,.58),.85,.22); gold=mat('Zirh_Altin',(0.8,.55,.12),.75,.25); blue=mat('Mavi_Kurdela',(0.06,.15,.28),0,.5)
body=cube('Tier1_Nefer',(0,1.15,0),(1,.1,.8),red,.2)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.55,location=(0,2.35,.1)); head=bpy.context.object; head.name='Kafa_Avatar_Frame'; head.data.materials.append(gold)
# 3 görünür rütbe katmanı, animasyonlarda zırh kapatma için Three.js tarafında yönetilir
for name,matx,z in [('Tier2_Sipahi',steel,.36),('Tier3_Sancaktar',gold,.42),('Tier4_Vezir',blue,.48)]:
    cylinder(name,(0,1.2,0),z,2.2,matx,12)
# Basit yürüme ve cheer iskeleti animasyonları
for a in (0,18):
    pass
if not bpy.context.scene.animation_data: bpy.context.scene.frame_start=1; bpy.context.scene.frame_end=48
for frame in (1,12,24,36,48):
    bpy.context.scene.frame_set(frame)
    body.keyframe_insert(data_path='location',frame=frame)
    body.location.z=(.12 if frame%24 else -.12)
export_glb('nefer.glb')
