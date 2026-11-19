#!/usr/bin/env python3
"""Builds index.html: the QuerysClues gear/backpack presets for every clue tier.

Reads the built-in presets from Banking/Presets.java and the per-account edits from
~/.rs3Client/querysclues-presets.json, looks every item up on the RuneScape wiki once
(cached in .cache/), and saves the icons in img/ so the page works offline.

Run again after a preset changes (or use the page's Rebuild button):   python3 build.py
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRESETS_JAVA = Path.home() / "Hoor2/launcher/payload/build/scripts/Scripts/QuerysClues/Banking/Presets.java"
OVERRIDES = Path.home() / ".rs3Client/querysclues-presets.json"
CACHE = HERE / ".cache"
IMG = HERE / "img"
WIKI = "https://runescape.wiki"
UA = "clue-preset-page/1.0"

TIERS = ["EASY", "MEDIUM", "HARD", "ELITE", "MASTER"]
BUILTIN_FOR = {"EASY": "DEFAULT", "MEDIUM": "DEFAULT", "HARD": "HARD", "ELITE": "ELITE", "MASTER": "DEFAULT"}

# Name-prefix picks ("Slayer cape (" matches any slayer cape with brackets): the wiki page to show.
NAMED_TITLES = {
    "slayer cape (": "Slayer cape (t)",
    "dungeoneering cape (": "Dungeoneering cape (t)",
    "powerburst of acceleration (": "Powerburst of acceleration (4)",
    "ring of fortune": "Ring of fortune",
}

# Script constants used as ids in Presets.java.
CONSTANTS = {"CLUE_CARRIER": 47836}


# ── wiki access (cached) ─────────────────────────────────────────────────────

def _get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                time.sleep(0.25)
                return (data, r.geturl()) if binary else (data.decode("utf-8"), r.geturl())
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                raise
            print(f"  retry {url}: {e}", file=sys.stderr)
            time.sleep(2)


def cached_json(key, fetch):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / (re.sub(r"[^A-Za-z0-9_.-]", "_", key) + ".json")
    if f.exists():
        return json.loads(f.read_text())
    val = fetch()
    f.write_text(json.dumps(val))
    return val


def lookup_item(item_id):
    """Special:Lookup → (page title, version anchor)."""
    def fetch():
        _, final = _get(f"{WIKI}/w/Special:Lookup?type=item&id={item_id}")
        path = urllib.parse.urlparse(final)
        title = urllib.parse.unquote(path.path.rsplit("/w/", 1)[-1]).replace("_", " ")
        anchor = urllib.parse.unquote(path.fragment).replace("_", " ") if path.fragment else ""
        return {"title": title, "anchor": anchor}
    return cached_json(f"lookup_{item_id}", fetch)


def wikitext(title):
    def fetch():
        q = urllib.parse.urlencode({"action": "query", "prop": "revisions", "rvprop": "content",
                                    "rvslots": "main", "format": "json", "redirects": 1, "titles": title})
        body, _ = _get(f"{WIKI}/api.php?{q}")
        d = json.loads(body)["query"]
        page = next(iter(d["pages"].values()))
        if "revisions" not in page:
            return {"title": title, "text": ""}
        return {"title": page["title"], "text": page["revisions"][0]["slots"]["main"]["*"]}
    return cached_json(f"page_{title}", fetch)


def template_params(text, name):
    """Params of the first {{name ...}} in text (top-level |key = value only)."""
    m = re.search(r"\{\{\s*" + re.escape(name) + r"\s*\n?\|", text, re.I)
    if not m:
        return {}
    i, depth, start = m.start(), 0, m.start()
    while i < len(text):
        if text.startswith("{{", i):
            depth += 1; i += 2; continue
        if text.startswith("}}", i):
            depth -= 1; i += 2
            if depth == 0:
                break
            continue
        i += 1
    body = text[start + 2:i - 2]
    params, depth, cur = {}, 0, ""
    parts = []
    j = 0
    while j < len(body):
        two = body[j:j + 2]
        if two in ("{{", "[["):
            depth += 1; cur += two; j += 2; continue
        if two in ("}}", "]]"):
            depth -= 1; cur += two; j += 2; continue
        if body[j] == "|" and depth == 0:
            parts.append(cur); cur = ""; j += 1; continue
        cur += body[j]; j += 1
    parts.append(cur)
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.strip().lower()] = v.strip()
    return params


def versioned(params, key, n):
    return params.get(f"{key}{n}") or params.get(key) or ""


def clean_file(v):
    m = re.search(r"\[\[\s*File:([^|\]]+)", v)
    return m.group(1).strip() if m else ""


def strip_markup(v):
    v = re.sub(r"\{\{[^{}]*\}\}", "", v)
    v = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", v)
    v = re.sub(r"'{2,}", "", v)
    v = re.sub(r"<[^>]+>", "", v)
    return v.strip()


def image_file(fname, dest_name, width=None):
    """Download a wiki file into img/ once; returns the relative path or ''."""
    IMG.mkdir(exist_ok=True)
    dest = IMG / dest_name
    if dest.exists() and dest.stat().st_size > 0:
        return f"img/{dest_name}"
    miss = CACHE / f"missing_{re.sub(r'[^A-Za-z0-9_.-]', '_', dest_name)}"
    if miss.exists():
        return ""
    url = f"{WIKI}/w/Special:Redirect/file/{urllib.parse.quote(fname.replace(' ', '_'))}"
    if width:
        url += f"?width={width}"
    try:
        data, _ = _get(url, binary=True)
        if not data.startswith(b"\x89PNG") and not data[:4] in (b"GIF8",) and not data[:3] == b"\xff\xd8\xff":
            raise ValueError("not an image")
        dest.write_bytes(data)
        return f"img/{dest_name}"
    except Exception as e:  # noqa: BLE001
        print(f"  no image {fname}: {e}", file=sys.stderr)
        CACHE.mkdir(exist_ok=True)
        miss.write_text("")
        return ""


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def resolve(pick):
    """Wiki data for one preset pick: {'id'| 'prefix'} → name, link, icon, detail, slot, examine."""
    if "id" in pick:
        lk = lookup_item(pick["id"])
        title, anchor = lk["title"], lk["anchor"]
        if title.startswith("Special:"):
            return {"key": f"id{pick['id']}", "name": f"Item {pick['id']}", "title": "", "anchor": "",
                    "icon": "", "detail": "", "slot": "", "examine": "", "id": pick["id"]}
    else:
        title = NAMED_TITLES.get(pick["prefix"].lower(), pick["prefix"].rstrip(" ("))
        anchor = ""
    page = wikitext(title)
    text = page["text"]
    info = template_params(text, "Infobox Item")
    bon = template_params(text, "Infobox Bonuses")

    # Which infobox version is this item?
    n = ""
    if "id" in pick:
        for k, v in info.items():
            m = re.fullmatch(r"id(\d*)", k)
            if m and str(pick["id"]) in re.split(r"[,\s]+", v):
                n = m.group(1); break
    else:
        want = title.lower()
        for k, v in info.items():
            m = re.fullmatch(r"name(\d+)", k)
            if m and strip_markup(v).lower() == want:
                n = m.group(1); break
    if not n and anchor:
        for k, v in info.items():
            m = re.fullmatch(r"version(\d+)", k)
            if m and v.strip().lower() == anchor.lower():
                n = m.group(1); break

    name = strip_markup(versioned(info, "name", n)) or page["title"]
    icon_file = clean_file(versioned(info, "image", n))
    examine = strip_markup(versioned(info, "examine", n))
    bversion = ""
    if n and info.get(f"version{n}"):
        for k, v in bon.items():
            m = re.fullmatch(r"version(\d+)", k)
            if m and v.strip().lower() == info[f"version{n}"].strip().lower():
                bversion = m.group(1); break
    slot = strip_markup(versioned(bon, "slot", bversion or n)).lower()

    # Detail image: "<name> detail.png" if the page uses it, else the first detail image.
    details = re.findall(r"\[\[\s*File:([^|\]]*detail[^|\]]*)", text, re.I)
    detail_file = next((d for d in details if d.lower().startswith(name.lower() + " detail")), None) \
        or (details[0] if details else f"{name} detail.png")

    key = pick.get("id") and f"id{pick['id']}" or f"n-{slug(pick['prefix'])}"
    base = f"{slug(name) or 'item'}-{key}"
    icon = image_file(icon_file, f"{base}.png") if icon_file else ""
    detail = image_file(detail_file, f"{base}-detail.png", width=150)
    return {
        "key": key, "id": pick.get("id"), "prefix": pick.get("prefix"), "name": name,
        "title": page["title"], "anchor": anchor or (info.get(f"version{n}", "") if n else ""),
        "icon": icon, "detail": detail, "slot": slot, "examine": examine,
    }


# ── preset sources ───────────────────────────────────────────────────────────

def parse_presets_java(path):
    src = path.read_text()
    out = {}
    for m in re.finditer(r"private static final List<Entry> (\w+) = build\(l -> \{\n(.*?)\n    \}\);", src, re.S):
        name, body = m.group(1), m.group(2)
        doc = re.search(r"/\*\*([^*]*(?:\*(?!/)[^*]*)*)\*/\s*private static final List<Entry> " + name, src)
        entries = []
        for line in body.splitlines():
            s = line.strip()
            if s.startswith("//"):
                if entries:
                    entries[-1]["comment"] += " " + s.lstrip("/ ").strip()
                continue
            lm = re.match(r"(?:for \(int i = 0; i < (\d+); i\+\+\) )?(pack|packAll|worn)\(l, (.*)\);\s*(?://\s*(.*))?$", s)
            if not lm:
                continue
            count, kind, args, comment = lm.groups()
            picks = []
            for pm in re.finditer(r'id\((\w+)\)|named\("([^"]*)"\)', args):
                if pm.group(1):
                    v = pm.group(1)
                    picks.append({"id": int(v) if v.isdigit() else CONSTANTS[v]})
                else:
                    picks.append({"prefix": pm.group(2)})
            entries.append({"worn": kind == "worn", "all": kind == "packAll", "count": int(count or 1),
                            "picks": picks, "comment": (comment or "").strip()})
        out[name] = {"entries": entries,
                     "doc": re.sub(r"\s*\*\s*", " ", doc.group(1)).strip() if doc else ""}
    return out


def parse_overrides(path):
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    out = {}
    for account, tiers in data.items():
        for tier, lines in tiers.items():
            entries = []
            for e in lines:
                picks = [{"id": p["id"]} if "id" in p else {"prefix": p["name"]} for p in e["picks"]]
                # Consecutive identical backpack lines collapse into one with a count.
                if entries and not e["worn"] and not entries[-1]["worn"] and entries[-1]["picks"] == picks \
                        and entries[-1]["all"] == e["all"]:
                    entries[-1]["count"] += 1
                    continue
                entries.append({"worn": e["worn"], "all": e["all"], "count": 1, "picks": picks,
                                "comment": "", "meerkats": e.get("meerkats", False)})
            out.setdefault(account, {})[tier] = entries
    return out


def note_from_comment(comment, name):
    """The part of a Presets.java comment after the item name (the script's own reason)."""
    c = comment.strip()
    if not c:
        return ""
    low, nl = c.lower(), name.lower()
    for cut in (nl, nl.split(" (")[0]):
        if low.startswith(cut):
            c = c[len(cut):]
            break
    else:
        # The comment names the item differently ("Passage of the abyss" vs "(Red)"): drop up to ';' or ' - '.
        for sep in (";", " - "):
            if sep in c:
                c = c.split(sep, 1)[1]
                break
        else:
            return ""
    c = re.sub(r"^\s*(\([^)]*\))?\s*[;:,-]?\s*", "", c).strip()
    c = re.sub(r"\s*\([A-Z]\w+(?:Node|State)\)", "", c)   # code class names
    return c[:1].upper() + c[1:] if c else ""


# ── build ────────────────────────────────────────────────────────────────────

def main():
    builtin = parse_presets_java(PRESETS_JAVA)
    overrides = parse_overrides(OVERRIDES)

    all_picks = {}
    def note_pick(p):
        k = f"id{p['id']}" if "id" in p else f"n-{slug(p['prefix'])}"
        all_picks.setdefault(k, p)
        return k

    presets = {}
    for pname, pdata in builtin.items():
        presets[pname] = {"doc": pdata["doc"], "entries": []}
        for e in pdata["entries"]:
            keys = [note_pick(p) for p in e["picks"]]
            presets[pname]["entries"].append({**e, "keys": keys})
    accounts = {}
    for acc, tiers in overrides.items():
        for tier, entries in tiers.items():
            accounts.setdefault(acc, {})[tier] = [{**e, "keys": [note_pick(p) for p in e["picks"]]} for e in entries]

    print(f"Resolving {len(all_picks)} items on the wiki…")
    items = {}
    for k, p in all_picks.items():
        items[k] = resolve(p)
        print(f"  {k:14} {items[k]['name']:42} slot={items[k]['slot'] or '-':10} icon={'ok' if items[k]['icon'] else 'MISSING'}")

    # Script notes per entry (comment minus the item name).
    for pdata in presets.values():
        for e in pdata["entries"]:
            e["note"] = note_from_comment(e["comment"], items[e["keys"][0]]["name"])
    # The HARD rune pouch comment runs over three lines: give it to all three.
    for pdata in presets.values():
        es = pdata["entries"]
        for i, e in enumerate(es):
            if "pouches carry the" in e["comment"]:
                joined = " ".join(x["comment"] for x in es[i:i + 3])
                m = re.search(r"the pouches carry the (.*)", joined.replace("Grasping rune pouch (blue)", "")
                              .replace("Grasping rune pouch", ""))
                txt = "Carries the " + re.sub(r"\s+", " ", m.group(1)).strip() if m else ""
                for x in es[i:i + 3]:
                    x["note"] = txt

    tier_icons = {t: image_file(f"Sealed clue scroll ({t.lower()}).png", f"tier-{t.lower()}.png") for t in TIERS}

    data = {
        "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "tierIcons": tier_icons,
        "source": str(PRESETS_JAVA).replace(str(Path.home()), "~"),
        "overridesSource": str(OVERRIDES).replace(str(Path.home()), "~"),
        "tiers": TIERS,
        "builtinFor": BUILTIN_FOR,
        "presets": presets,
        "accounts": accounts,
        "items": items,
        "wiki": WIKI,
    }
    template = (HERE / "template.html").read_text()
    page = template.replace("/*__DATA__*/null", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
    (HERE / "index.html").write_text(page)
    print(f"Wrote {HERE / 'index.html'}")


if __name__ == "__main__":
    main()
