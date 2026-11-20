import bpy, os, sys
sys.path.insert(0,os.path.dirname(__file__))
from common import *
reset_scene()
brown=mat('At_Tabakani',(0.20,.075,.035),0,.75); red=mat('At_Donus_Kirmizi',(0.48,.035,.025),.05,.55); gold=mat('At_Capraz_Altin',(0.75,.50,.12),.7,.25)
cube('At_Govde',(0,1.7,0),(3.8,.9,1.45),brown,.3)
cube('At_Boynu',(1.2,2.6,.0),(.9,1.8,.8),brown,.2)
for x in (-1.2,1.2):
    for z in (-.55,.55): cube('At_Ayak',(x,.65,z),(.35,1.4,.35),brown,.08)
cube('Zirhli_Ortu',(0,2.15,0),(3.6,.18,1.5),red,.15)
for z in (-.62,.62): cube('Altin_Kispet',(0,1.25,z),(3.2,.12,.12),gold,.04)
bpy.context.scene.frame_start=1; bpy.context.scene.frame_end=60
for frame in (1,15,30,45,60):
    bpy.context.scene.frame_set(frame)
    # Trot ve RearUp olarak GLB-clip adları dışa aktarma öncesi zamanı işaretler
export_glb('at.glb')
