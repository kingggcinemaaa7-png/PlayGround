import os, runpy
HERE=os.path.dirname(os.path.abspath(__file__))
for name in ('fetih_yolu','nefer','at','otag_taht','mehter_mancinik','sadrazam_muhur'):
    runpy.run_path(os.path.join(HERE,name+'.py'),run_name='__main__')
