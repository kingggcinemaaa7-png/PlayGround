#!/usr/bin/python3
"""Procedural low-poly character exports with AvatarFrame mesh."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from common import reset_scene, material, cube, cylinder, cone, sphere, between, export_glb, write_manifest


def avatar_frame():
    skin=material("AvatarFrameSkin",(.85,.55,.28)); rim=material("AvatarFrameGold",(.95,.72,.18),.7,.2)
    cylinder("AvatarFrame_Rim",.42,.06,(0,0,3.15),(1.5708,0,0),mat=rim,vertices=24)
    cylinder("AvatarFrame",.34,.035,(0,-.035,3.15),(1.5708,0,0),mat=skin,vertices=24)


def character(name, apron=False, uniform=False, suit=False, beard=True):
    reset_scene()
    skin=material(name+"_Ten",(.82,.56,.34)); shirt=material(name+"_Kiyafet",(.15,.32,.52) if uniform else (.82,.22,.14)); dark=material(name+"_Koyu",(.08,.08,.08)); white=material(name+"_Beyaz",(.95,.92,.82)); apron_mat=material(name+"_Önlük",(.95,.95,.88)); gold=material(name+"_Altın",(.85,.62,.16),.7,.24)
    cylinder("Gövde",.55,1.35,(0,0,1.55),mat=shirt,vertices=16)
    sphere("Baş",.50,(0,0,2.55),scale=(.92,1,.95),mat=skin,segments=16,rings=10)
    if beard:
        sphere("Bıyık",.34,(0,-.42,2.36),scale=(1.15,.16,.38),mat=dark,segments=12,rings=8)
    if apron:
        cube("Önlük",(.85,.12,1.05),(0,-.50,1.35),mat=apron_mat)
    if suit:
        cube("TakımCeket",(1.18,.20,1.20),(0,-.52,1.55),mat=dark)
        cylinder("Köstek",.035,.55,(.35,-.58,1.4),(0,0,0),mat=gold,vertices=8)
    if uniform:
        cylinder("Şapka",.58,.28,(0,0,3.05),mat=dark,vertices=16)
        between("Telsiz",(-.20,-.55,2.75),(-.20,-.68,2.15),.035,dark,6)
    for sx in (-.72,.72):
        cylinder("Kol",.16,1.05,(sx,0,1.62),(.10*sx,0,0),mat=shirt,vertices=12)
    for sx in (-.30,.30): cylinder("Bacak",.20,1.10,(sx,0,.55),mat=dark,vertices=12)
    avatar_frame()
    return export_glb(name,apply=True,animations=True)

assets=[]
assets.append(character("cayci",apron=True,beard=True))
assets.append(character("musteri",beard=True))
assets.append(character("zabita",uniform=True,beard=False))
assets.append(character("muhtar",suit=True,beard=True))
write_manifest(assets,"blender/karakterler.py")
