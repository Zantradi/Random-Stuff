import json
S=json.load(open('sources.json')); P=json.load(open('geprices.json')); L=json.load(open('gelimits.json'))
mult=[1,.99,.97,.95,.93,.91,.88,.86,.83,.80]
pick=set()
def ranked(fn, flt=lambda k:True):
    rows=[]
    for k,s in S.items():
        if not P.get(k) or not flt(k): continue
        r=fn(s)
        if r and r>0: rows.append((P[k]*s[0]/r,k))
    rows.sort(); return [k for _,k in rows]
for t in (0,5,9):
    ref=lambda s,t=t: s[1]*s[2]*mult[t]/100/100
    pick.update(ranked(ref)[:250])
    pick.update(ranked(ref, lambda k:(L.get(k) or 0)>=1000)[:200])
    pick.update(ranked(ref, lambda k:(L.get(k) or 0)>=5000)[:120])
    prec=lambda s,t=t: s[1]*(1-s[2]*mult[t]/100)*s[3]/100
    pick.update(ranked(prec)[:80])
pick.update(ranked(lambda s: s[4] and s[4][0]*s[4][1]/100)[:400])
pick.update(ranked(lambda s: s[5] and s[5][0]*s[5][1]/100))
core=['Alchemical hydrix','Hydrix','Uncut hydrix','Incomplete hydrix','Onyx','Uncut onyx','Junk refiner','Rune bar','Alchemical onyx',
      'Alchemical hydrix brooch','Essence of Finality amulet','Brooch of the Gods','Alchemical hydrix dust']
print(len(pick))
json.dump({'items':sorted(pick|set(core))}, open('img_items.json','w'))
