#!/usr/bin/env python3
"""Procedural glTF exports for tea, okey, tost and golden tray props."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from common import reset_scene, material, cube, cylinder, cone, sphere, torus, export_glb, write_manifest

assets=[]

# Glass tea cup
reset_scene(); glass=material("İnceBelliCam",(.65,.82,.82),.12,.12,alpha=.60); tea=material("Çay",(.42,.12,.02),0,.18); gold=material("ÇayKaşığı",(.78,.66,.32),.85,.18)
cylinder("İnceBelliBardak",.34,.52,(0,0,.26),mat=glass,vertices=20)
cylinder("ÇaySıvısı",.30,.36,(0,0,.27),mat=tea,vertices=20)
assets.append(export_glb("cay_bardagi",apply=True))

# Okey tile
reset_scene(); ivory=material("OkeyPirinç",(.92,.86,.67),.05,.28); dot=material("OkeyNoktası",(.08,.08,.07));
cube("OkeyTaşı",(.18,.48,.08),(0,0,.04),mat=ivory)
for x in (-.055,.055):
    for y in (-.12,.12): cylinder("Nokta",.018,.012,(x,y,.09),mat=dot,vertices=10)
assets.append(export_glb("okey_tasi",apply=True))

# Toast
reset_scene(); bread=material("TostEkmegi",(.75,.42,.16)); cheese=material("Kaşar",(1,.72,.18)); grill=material("Izgara",(.25,.12,.04))
cube("AltEkmek",(.90,.55,.16),(0,0,.08),mat=bread)
cube("Kaşarlıİç",(.78,.48,.10),(0,0,.21),mat=cheese)
cube("ÜstEkmek",(.90,.55,.16),(0,0,.34),mat=bread)
for x in (-.55,-.25,.05,.35,.65):
    cube("IzgaraÇizgisi",(.025,.52,.012),(x-.2,0,.43),(.18,0,.3),mat=grill)
assets.append(export_glb("tost",apply=True))

# Golden serving tray with tea and toast set pieces
reset_scene(); brass=material("AltınTepsi",(.90,.65,.12),.82,.20); wood=material("TepsiKulpu",(.32,.14,.06)); tea=material("TepsiÇay",(.42,.12,.02)); glass=material("TepsiBardak",(.7,.85,.85),.1,.12,alpha=.55)
cylinder("AltınTepsi",1.35,.10,(0,0,.08),mat=brass,vertices=32)
torus("TepsiKenarı",1.25,.055,(0,0,.18),mat=brass)
for x in (-.75,.75):
    cylinder("TepsiBardak",.20,.42,(x,0,.42),mat=glass,vertices=16)
    cylinder("TepsiÇay",.17,.28,(x,0,.38),mat=tea,vertices=16)
cube("TepsiTost",(.75,.48,.14),(0,.55,.23),mat=wood)
assets.append(export_glb("altin_tepsi",apply=True))

write_manifest(assets,"blender/objeler.py")
