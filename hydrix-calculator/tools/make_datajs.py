import json, sys, time
S=json.load(open('sources.json')); P=json.load(open('geprices.json')); L=json.load(open('gelimits.json')); V=json.load(open('gevolumes.json'))
IM=json.load(open('img_map.json'))['map']
core=['Alchemical hydrix','Hydrix','Uncut hydrix','Incomplete hydrix','Onyx','Uncut onyx','Junk refiner','Rune bar','Alchemical onyx',
      'Alchemical hydrix brooch','Essence of Finality amulet','Brooch of the Gods','Alchemical hydrix dust']
names=set(S)|set(core)
snap={'updated':P['%LAST_UPDATE%'],'updatedText':P['%LAST_UPDATE_F%'],
      'prices':{k:P[k] for k in sorted(names) if k in P},
      'limits':{k:L[k] for k in sorted(names) if k in L},
      'volumes':{k:V[k] for k in sorted(names) if k in V}}
data={'built':int(time.time()),'snapshot':snap,'images':IM,'sources':S}
out='/* Generated from the RuneScape Wiki (runescape.wiki) disassembly + Grand Exchange data. Do not edit by hand. */\nwindow.HYDRIX_DATA='+json.dumps(data,separators=(',',':'))+';\n'
open(sys.argv[1],'w').write(out)
print(len(out)//1024,'KB', len(snap['prices']),'prices')
