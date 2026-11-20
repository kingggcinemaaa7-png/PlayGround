#!/usr/bin/env python3
"""Procedural two-level Turkish neighborhood square."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from common import reset_scene, material, cube, cylinder, cone, sphere, torus, between, export_glb, write_manifest

reset_scene()
stone=material("Arnavut Taşı",(.28,.27,.24)); stone2=material("Taş Açık",(.48,.45,.39)); wood=material("Ahşap",(.35,.16,.07)); copper=material("Bakır",(.55,.25,.08),.75,.24); green=material("Çuha Yeşili",(.08,.28,.16)); brass=material("Pirinc",(.72,.48,.12),.8,.22); leaf=material("Sarmaşık",(.12,.35,.11)); bulb=material("Edison",(1,.48,.12),0,.2,(1,.35,.08)); red=material("Kırmızı TV",(.7,.04,.02)); dark=material("Gece Beton",(.10,.11,.10)); glass=material("Bardak Cam",(.65,.82,.82),.1,.15,alpha=.55)

# Lower cobbled street and upper terrace steps
for x in range(-12,13):
    for y in range(-7,1):
        cube("Arnavut_%d_%d"%(x,y),(0.95,.95,.10),(x*.95,y*.95,-.05),(0,0,((x+y)%3)*.02), stone if (x+y)%4 else stone2)
for i in range(2):
    cube("TerasBasamak%d"%i,(24,1.0,.20),(0,1.2+i*.65,.10+i*.24),mat=stone2)
cube("ÜstTeras",(24,5,.18),(0,5,.58),mat=stone)

# Six green-baize okey tables and chairs on lower square
for row,y in enumerate((-4.2,-1.7)):
    for col,x in enumerate((-7,-2.5,2.5,7)):
        cube("OkeyMasası_%d_%d"%(row,col),(2.0,1.35,.12),(x,y,.72),mat=wood)
        cube("YeşilÇuha_%d_%d"%(row,col),(1.75,1.12,.08),(x,y,.78),mat=green)
        for dx,dy in ((-.75,-.58),(.75,-.58),(-.75,.58),(.75,.58)):
            cylinder("MasaAyagi",.07,1.15,(x+dx,y+dy,.20),mat=wood,vertices=10)
        for sx in (-1.0,1.0):
            cube("Sandalyex",(.65,.55,.08),(x+sx,y-.05,.62),mat=wood)

# Tea stall / counter and upper terrace
cube("ÇayTezgahı",(8,1.25,1.55),(0,7.0,1.35),mat=wood)
for x in (-3,-1,1,3): cylinder("SemaverAyak",.12,.9,(x,7.0,.75),mat=copper,vertices=16)
for z in (1.0,2.1,3.15):
    cylinder("BakırSemaver",.48,.55,(0,6.9,z),mat=copper,vertices=24)
cylinder("SemaverBoyun",.25,.65,(0,6.9,3.75),mat=copper,vertices=16)
torus("SemaverKulplu",.85,.07,(0,6.9,3.8),(1.5708,0,0),copper)
# glass cup shelf
cube("CamRaf",(5.2,.18,.06),(0,7.65,2.15),mat=brass)
for x in range(-2,3):
    cylinder("ÇayBardağı",.20,.42,(x*.75,7.58,2.42),mat=glass,vertices=16)

# Pergola, vines and Edison bulbs
for x in (-9,-3,3,9):
    cube("PergolaDirek",(.18,.18,4.5),(x,8.2,2.8),mat=wood)
for y in (8.2,9.2): cube("PergolaKiriş",(19,.16,.16),(0,y,5.05),mat=wood)
for x in range(-8,9,2):
    cube("PergolaÇatı",(.12,2.5,.12),(x,8.7,5.05),mat=wood)
    sphere("EdisonAmpul",.13,(x,8.55,4.7),mat=bulb,segments=12,rings=8)
    between("DamlalikKablosu",(x,8.55,5.0),(x,8.55,4.75),.015,dark,6)
for x in range(-8,10,1):
    for z in (4.7,4.9): sphere("AsmaYapragı",.16,(x+(x%2)*.12,8.3,z+(x%3)*.10),scale=(1.2,.35,.8),mat=leaf,segments=10,rings=6)

# Old TV and clock on back wall
cube("EskiTv",(2.2,.35,1.45),(-5.7,8.55,3.45),mat=dark)
cube("TvMaçEkranı",(1.9,.03,.92),(-5.7,8.34,3.48),mat=red)
cylinder("SaatGovde",.55,.12,(5.0,8.45,3.55),(.1,0,0),mat=wood,vertices=20)
for ang in (0,1.5708): between("SaatAkrep",(5.0,8.35,3.55),(5.0+.42*__import__('math').cos(ang),8.30,3.55+.42*__import__('math').sin(ang)),.025,brass,6)

# Barber and grocery silhouettes, fountain and pots
cube("BerberVitasi",(3.0,.12,2.1),(8.8,8.0,1.8),mat=wood)
cylinder("BerberKutuplu",.10,2.4,(7.9,7.82,1.5),mat=brass,vertices=12)
cube("BakkalReyonu",(3.2,.4,1.7),(12.0,7.7,1.45),mat=wood)
cylinder("Çeşme",.55,1.25,(10.5,3.7,.65),mat=stone2,vertices=16)
sphere("ÇeşmeSu",.30,(10.5,3.7,1.45),scale=(.8,.8,.55),mat=glass,segments=12,rings=6)
for x in (-11,-9,11):
    cone("Saksı",.45,.32,.55,(x,3.0,.30),vertices=16,mat=stone2)
    sphere("SaksıBitki",.48,(x,3.0,.95),scale=(.8,.8,1.2),mat=leaf,segments=12,rings=8)

assets=[export_glb("mahalle_meydani",apply=True,animations=False)]
write_manifest(assets,"blender/mahalle_meydani.py")
