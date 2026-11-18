"""Rebuild foods.js from the "Bank Kalori Makanan" PDF.

Usage:  pip install pdfplumber
        python3 tools/build_foods.py bank_kalori_makanan.pdf foods.js

Reads every table row, tags it with its section heading, folds drink
add-on rows ("+ gula", "+ susu pekat manis") into the drink's total,
turns food add-ons into combos and standalone "Tambahan" items, merges
rows repeated across sections, fixes a few spelling slips and appends
the app's own estimates for foods the table does not have.
"""
import json, re, sys
import pdfplumber

SECTIONS = ["NASI, MEE, BIHUN,KUETIAU DAN LAIN- LAIN", "AYAM DAN DAGING",
    "IKAN DAN HASIL LAUT", "BUAH-BUAHAN", "SAYUR-SAYURAN", "KEKACANG",
    "KUIH MUIH, SNEK DAN PENCUCI MULUT", "MAKANAN WESTERN", "JEM DAN SAPUAN",
    "LAIN-LAIN", "MINUMAN", "ii) VEGETARIAN"]

def extract(pdf_path):
    rows, cur = [], None
    with pdfplumber.open(pdf_path) as pdf:
        for pi, pg in enumerate(pdf.pages):
            marks = [(l["top"], s) for l in pg.extract_text_lines()
                     for s in SECTIONS if l["text"].strip() == s]
            for t in pg.find_tables():
                for r in t.rows:
                    above = [s for mt, s in marks if mt < r.bbox[1]]
                    sec = above[-1] if above else cur
                    rows.append((pi + 1, sec, [pg.crop(c).extract_text() if c else "" for c in r.cells]))
            if marks: cur = marks[-1][1]
    return rows

raw = extract(sys.argv[1])
out_path = sys.argv[2]
CAT = {
 "NASI, MEE, BIHUN,KUETIAU DAN LAIN- LAIN": "rice", "AYAM DAN DAGING": "meat",
 "IKAN DAN HASIL LAUT": "fish", "BUAH-BUAHAN": "fruit", "SAYUR-SAYURAN": "veg",
 "KEKACANG": "legume", "KUIH MUIH, SNEK DAN PENCUCI MULUT": "kuih",
 "MAKANAN WESTERN": "western", "JEM DAN SAPUAN": "spread", "LAIN-LAIN": "other",
 "MINUMAN": "drink", "ii) VEGETARIAN": "vegetarian"}
CATS = [("rice","Nasi, mi & bihun","Rice & noodles"),("meat","Ayam & daging","Chicken & meat"),
 ("fish","Ikan & makanan laut","Fish & seafood"),("veg","Sayur-sayuran","Vegetables"),
 ("fruit","Buah-buahan","Fruit"),("legume","Kekacang","Beans & nuts"),
 ("kuih","Kuih, snek & pencuci mulut","Kuih, snacks & desserts"),("western","Makanan Western","Western food"),
 ("drink","Minuman","Drinks"),("spread","Jem & sapuan","Jams & spreads"),("other","Lain-lain","Others"),
 ("vegetarian","Vegetarian","Vegetarian"),("addon","Tambahan","Add-ons: sugar, milk, sauces")]
FIX = [(r"\bgoring\b","goreng"),(r"Musroom","Mushroom"),(r"\btimu\b","timun"),(r"talapia","tilapia"),
       (r"Brocolli","Broccoli"),(r"triffle","trifle"),(r"Flacky","Flaky"),(r"Teh/ Kopi","Teh/Kopi"),
       (r"Teh O/ Kopi O","Teh O/Kopi O"),(r"\s*/\s+"," / ")]
SRC = {"NP":"NP","NC":"NC","NC.":"NC","Atlas":"Atlas","Altas":"Atlas"}
clean = lambda s: re.sub(r"\s+"," ",(s or "").replace("\n"," ")).strip()
def fix(n):
    for a,b in FIX: n = re.sub(a,b,n)
    return n.replace(" / ","/") if re.search(r"\w / \w",n) and len(n)<20 else n
num = lambda s: (float(s) if "." in s else int(s)) if re.fullmatch(r"\d+(\.\d+)?",clean(s)) else None

rows=[]
for page,sec,cells in raw:
    if cells[0]=="Makanan": continue
    n,s,g,k,src = [clean(c) for c in (cells+[""]*5)[:5]]
    s = re.sub(r"(\w)\(", r"\1 (", s)
    if not n and rows:  # unnamed row = another serving of the food above
        n=rows[-1]["n"]; src=src or rows[-1]["src"]
    rows.append(dict(n=n,s=s,g=num(g),k=num(k),src=src,cat=CAT[sec],page=page))

# group "+" add-on rows under their parent
items=[]
for r in rows:
    if r["n"].startswith("+"):
        r["n"]=r["n"].lstrip("+ ").strip(); items[-1].setdefault("add",[]).append(r)
    else: items.append(r)

foods=[]; addons={}
def addon_name(a): return a["n"][0].upper()+a["n"][1:]
for it in items:
    name=fix(it["n"]); note=None; src=SRC.get(it["src"])
    if it["src"].startswith("Nestle"): src="Label"; note="Value from Nestlé product label"
    if name.endswith("*"):
        name=name.rstrip("*").strip(); note="Calculated with sweetened condensed milk (susu pekat manis); low-fat milk is the healthier choice"
    k=it["k"]; adds=it.get("add",[])
    for a in adds:
        if a["k"] is not None:
            key=(addon_name(a).lower(),a["s"])
            addons.setdefault(key,dict(n=addon_name(a),s=a["s"],g=a["g"],k=a["k"],src=src,c=["addon"]))
    if adds and it["cat"]=="drink":
        parts=", ".join(f'{a["n"]} {a["s"]}' for a in adds)
        known=[a["k"] for a in adds if a["k"] is not None]
        if (k in (None,0)) and known: k=(k or 0)+sum(known)
        note=f"Includes {parts}"
        if name=="Teh/Kopi": name=f'Teh/Kopi ({" + ".join(a["n"] for a in adds)})'
    elif adds:
        for a in adds:
            if a["k"] is None or k is None: continue
            foods.append(dict(n=f'{name} + {a["n"]}',s=f'{it["s"]} + {a["s"]}',
                g=(it["g"]+a["g"]) if it["g"] and a["g"] else None,k=k+a["k"],src=src,c=[it["cat"]]))
    if k is None: print("SKIP no kcal:",name,file=sys.stderr); continue
    foods.append(dict(n=name,s=it["s"],g=it["g"],k=k,src=src,c=[it["cat"]],note=note))

# merge identical rows listed in several sections
merged={}
for f in foods:
    key=(f["n"].lower(),f["s"].lower(),f["g"],f["k"])
    if key in merged:
        for c in f["c"]:
            if c not in merged[key]["c"]: merged[key]["c"].append(c)
    else: merged[key]=f
foods=list(merged.values())+list(addons.values())

EXTRA=[("Roti bawang","1 keping, tanpa kuah",None,340,"rice"),("Roti telur / tampal","1 keping, tanpa kuah",None,390,"rice"),
 ("Telur goreng","1 biji",None,110,"meat"),("Nasi ayam penyet","1 pinggan",None,700,"rice"),
 ("Ikan bakar","1 hidangan",120,180,"fish"),("Teh C kurang manis","1 cawan (susu & gula)",None,70,"drink"),
 ("Susu segar rendah lemak","100 ml",None,45,"drink"),("Serbuk Milo","2 sudu teh paras",10,40,"drink"),
 ("Bijirin Nestum","8 sudu teh paras",24,90,"kuih"),("Yogurt asli (plain)","1 cawan",125,80,"kuih"),
 ("Onigiri","1 biji",None,180,"rice"),("Pisang","1 biji sederhana",None,105,"fruit"),
 ("Dada ayam (masak)","100 g",100,165,"meat"),("Kunafa coklat","1 potong kecil",40,180,"kuih")]
for n,s,g,k,c in EXTRA: foods.append(dict(n=n,s=s,g=g,k=k,src="Est",c=[c]))

order=[c[0] for c in CATS]
foods.sort(key=lambda f:(order.index(f["c"][0]),f["n"].lower()))
def js(f):
    o={"n":f["n"],"s":f["s"]}
    if f.get("g"): o["g"]=f["g"]
    o["k"]=f["k"]; o["src"]=f["src"] or "NP"; o["c"]=f["c"]
    if f.get("note"): o["note"]=f["note"]
    return "  "+json.dumps(o,ensure_ascii=False,separators=(",",":"))+","
head='''// Food library data. Values come from the "Bank Kalori Makanan" table
// (bank_kalori_makanan.pdf). src: NP = Nutritionist Pro v2.1.13,
// NC = Nutrient Composition of Malaysian Foods (4th ed., 1997),
// Atlas = Atlas Makanan: Saiz Pertukaran & Porsi (2009), Label = product
// label, Est = app estimate (foods not in the table).
// n = name, s = serving, g = weight in grams, k = kcal per serving, c = categories.
// To add a food, copy a line and edit it. Order does not matter.
'''
body=head+"const FOOD_SOURCES = "+json.dumps({"NP":"Nutritionist Pro v2.1.13","NC":"Nutrient Composition of Malaysian Foods, 4th ed. (1997)","Atlas":"Atlas Makanan: Saiz Pertukaran & Porsi (2009)","Label":"Product label","Est":"App estimate (not in the table)"},ensure_ascii=False,indent=2)+";\n"
body+="const FOOD_CATEGORIES = [\n"+"\n".join("  "+json.dumps(list(c),ensure_ascii=False)+"," for c in CATS)+"\n];\n"
body+="const foods = [\n"+"\n".join(js(f) for f in foods)+"\n];\n"
open(out_path,"w").write(body)
from collections import Counter
print("foods:",len(foods),Counter(c for f in foods for c in f["c"]),Counter(f["src"] for f in foods),file=sys.stderr)
