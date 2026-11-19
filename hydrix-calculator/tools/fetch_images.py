import json, urllib.request, urllib.parse, time, re, os, sys, concurrent.futures as cf
UA="Mozilla/5.0 (X11; Linux) hydrix-calc-local/1.0"
OUT=sys.argv[1]
items=json.load(open('img_items.json'))['items']
extra={  # key -> file title
 'Refined components':'Refined  components.png','Fortunate components':'Fortunate components.png','Precious components':'Precious components.png',
 'Rumbling components':'Rumbling components.png','Junk':'Junk.png','Crafted parts':'Crafted parts.png',
 '@hero':'Alchemical hydrix detail.png','@hero_onyx':'Alchemical onyx detail.png','@hydrix_detail':'Hydrix detail.png','@invention':'Invention.png','@crafting':'Crafting.png',
 '@invention_icon':'Invention-icon.png','@crafting_icon':'Crafting-icon.png','@chisel':'Chisel.png','@coins':'Coins 10000.png',
 '@workbench':"Inventor's workbench.png",'@ge':'Grand Exchange icon.png','@reaper':'Reaper points.png','@divination_icon':'Divination-icon.png',
 '@tokkul':'Tokkul.png','@disassemble':'Disassemble.png','@wiki':'RuneScape Wiki logo.png'}
want={k:k+'.png' for k in items}; want.update(extra)
def api(params):
    url="https://runescape.wiki/api.php?"+urllib.parse.urlencode(params)
    return json.load(urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":UA}),timeout=60))
keys=list(want); urls={}
for i in range(0,len(keys),50):
    chunk=keys[i:i+50]
    titles=['File:'+want[k] for k in chunk]
    r=api({'action':'query','format':'json','formatversion':2,'prop':'imageinfo','iiprop':'url','redirects':1,'titles':'|'.join(titles)})
    q=r['query']; norm={n['from']:n['to'] for n in q.get('normalized',[])}; red={n['from']:n['to'] for n in q.get('redirects',[])}
    byt={p['title']:p for p in q['pages']}
    for k,t in zip(chunk,titles):
        t2=norm.get(t,t); t3=red.get(t2,t2); p=byt.get(t3)
        if p and p.get('imageinfo'): urls[k]=p['imageinfo'][0]['url']
    time.sleep(0.5)
missing=[k for k in keys if k not in urls]
print('found',len(urls),'missing',len(missing),missing[:40],file=sys.stderr)
def fname(k):
    s=re.sub(r'[^A-Za-z0-9._-]+','_',k.lstrip('@')).strip('_')
    return s[:80]+'.png'
used={}; mapping={}
for k in urls:
    f=fname(k); 
    while f in used.values(): f=f[:-4]+'_x.png'
    used[k]=f
def dl(k):
    path=os.path.join(OUT,used[k])
    if not os.path.exists(path):
        for a in range(3):
            try:
                data=urllib.request.urlopen(urllib.request.Request(urls[k],headers={"User-Agent":UA}),timeout=60).read()
                open(path,'wb').write(data); break
            except Exception as e:
                time.sleep(2)
        time.sleep(0.15)
    return k, os.path.exists(path)
with cf.ThreadPoolExecutor(4) as ex:
    for k,ok in ex.map(dl, list(urls)):
        if ok: mapping[k]='img/'+used[k]
json.dump({'map':mapping,'missing':missing}, open('img_map.json','w'), indent=0)
print('downloaded',len(mapping),file=sys.stderr)
