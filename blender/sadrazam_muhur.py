import bpy, os, sys
sys.path.insert(0,os.path.dirname(__file__))
from common import *
reset_scene()
gold=mat('Sadrazam_Altin',(0.9,.62,.15),.86,.18)
cylinder('Sadrazam_Muhur',(0,3,0),3,.7,gold,32)
for i in range(16):
    angle=i*3.14159*2/16
    cylinder('Muhur_Motif',(3.4*__import__('math').cos(angle),3,3.4*__import__('math').sin(angle)),.12,.12,gold,8)
export_glb('sadrazam_muhur.glb')
