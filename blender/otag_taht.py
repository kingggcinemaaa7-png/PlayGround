import bpy, os, sys
sys.path.insert(0,os.path.dirname(__file__))
from common import *
reset_scene()
gold=mat('Osmanli_Yaprak_Altin',(0.82,.55,.10),.8,.22); red=mat('Saltanat_Kadifesi',(0.45,.025,.018),.05,.45); white=mat('Hilal_Krem',(0.9,.82,.55),.15,.35)
cube('Taht_Govde',(0,1.2,0),(5,.8,3),red,.2)
for x in (-2.2,2.2): cube('Altin_Ayak',(x,2.3,0),(.45,3.8,.45),gold,.08)
cube('Taht_Arkalik',(0,4.8,-1.25),(5,5,.45),gold,.08)
cube('Kadife_Koltuk',(0,2.8,.3),(4.5,.6,2.2),red,.18)
for z in (-1.4,1.4): cylinder('Sancak_Diregi',(z*1.2,4.7,0),.08,7,gold,10)
export_glb('otag_taht.glb')
