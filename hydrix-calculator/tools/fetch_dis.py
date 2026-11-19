import json, urllib.request, urllib.parse, time, sys
UA = "Mozilla/5.0 (X11; Linux) hydrix-calc-local/1.0"
def q(query):
    url = "https://runescape.wiki/api.php?" + urllib.parse.urlencode({"action":"bucket","format":"json","query":query})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return json.load(urllib.request.urlopen(req, timeout=60))
out = []
off = 0
while True:
    Q = ("bucket('disassembly').select('page_name','category','augmented','estimated_cost','estimated_cost_per','recurring_cost','recurring_cost_per','required_quantity','normal_material_quantity','json')"
         ".where(bucket.Not('Category:Equipment applied cosmetic changes')).where(bucket.Not('Category:Dyed equipment')).where(bucket.Not('Category:Removed content'))"
         ".where('Category:Grand Exchange items')"
         f".limit(5000).offset({off}).run()")
    r = q(Q)
    if 'error' in r: print(r); sys.exit(1)
    b = r['bucket']; out += b
    print("got", len(b), "total", len(out), file=sys.stderr)
    if len(b) < 5000: break
    off += 5000; time.sleep(1)
json.dump(out, open(sys.argv[1], 'w'))
