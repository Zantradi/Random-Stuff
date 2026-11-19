import json, re, sys, collections
d = json.load(open('dis_all.json')); P = json.load(open('geprices.json')); L=json.load(open('gelimits.json')); V=json.load(open('gevolumes.json'))
recs=[]
for r in d:
    if not r.get('json'): continue
    j=json.loads(r['json'])
    if not isinstance(j.get('materials'),dict): j['materials']={}
    if not isinstance(j.get('special'),dict): j['special']={}
    recs.append((r,j))
def pkey(j):
    n=j['name']
    if n in P: return n
    m=re.search(r'(\d) dose', j['category'])
    if m and f"{n} ({m.group(1)})" in P: return f"{n} ({m.group(1)})"
    return None
def spec(j, mat):
    s=j['special'].get(mat)
    if not s: return None
    ch=s.get('chance')
    if isinstance(ch,list): ch=100*ch[0]/ch[1]
    if not ch: return None
    return [s.get('quantity') or 1, round(ch,4)]
sources={}
for r,j in recs:
    k=pkey(j)
    if not k or k in sources: continue
    junk=j['junk'][0]
    prec=j['materials'].get('Precious components',0)
    fo=spec(j,'Fortunate components'); ru=spec(j,'Rumbling components')
    if junk<=0 and not prec and not fo and not ru: continue
    page=r['page_name']
    sources[k]=[j['item_quantity'] or 1, j['mat_quantity'] or 0, round(junk,3), round(prec,4), fo, ru, page if page!=k else 0, j['level']]
print('sources',len(sources), file=sys.stderr)
json.dump(sources, open('sources.json','w'), separators=(',',':'))
