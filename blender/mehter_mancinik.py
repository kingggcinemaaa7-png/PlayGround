import bpy, os, sys
sys.path.insert(0,os.path.dirname(__file__))
from common import *
reset_scene()
wood=mat('Mancinik_Ahsap',(0.28,.12,.045),0,.72); iron=mat('Mancinik_Demir',(0.12,.12,.13),.75,.28); gold=mat('Kös_Caprak_Altin',(0.75,.48,.10),.72,.24); red=mat('Davul_Kirmizi',(0.45,.025,.02),0,.6)
# Mancınık
for x in (-1.4,1.4):
    cube('Mancinik_Tahta', (x,1,0),(.25,2,.25),wood,.06)
cube('Mancinik_Kolu',(0,2,0),(0.18,.18,5),wood,.04)
# Mehter kösü
cylinder('Mehter_Kos',(7,1.8,0),1.3,1.7,gold,24)
cylinder('Davul_Kirmizi_Yuzey',(7,2.6,0),1.32,.12,red,24)
export_glb('mancinik.glb')
# Aynı projede ikinci çıktı için obje setini kös odaklı dışa aktarma
for o in list(bpy.context.scene.objects):
    if o.name.startswith('Mancinik'): bpy.data.objects.remove(o,do_unlink=True)
export_glb('mehter_davul.glb')
