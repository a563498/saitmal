import argparse, json, re, sqlite3, zipfile
from pathlib import Path

HANGUL = re.compile(r"[가-힣]+")
STOP = set("그리고 그래서 하지만 그러나 또는 및 등 것을 있다 없다 하다 되다 하게 하기 했다 했다".split())

def tokenize(text: str):
    text = text or ""
    out = []
    for m in HANGUL.finditer(text):
        w = m.group(0)
        if len(w) <= 1: 
            continue
        if w in STOP:
            continue
        out.append(w)
    # dedup but keep order
    seen=set()
    res=[]
    for w in out:
        if w not in seen:
            seen.add(w); res.append(w)
    return res

def get_feat(obj, att):
    if obj is None: return ""
    if isinstance(obj, dict):
        return obj.get(att,"") if att in obj else ""
    if isinstance(obj, list):
        for x in obj:
            if isinstance(x, dict) and x.get("att")==att:
                return x.get("val","")
    return ""

def sense_feats(sense):
    # returns dict of att->val for list-like feat
    feats={}
    f = sense.get("feat")
    if isinstance(f, list):
        for x in f:
            if isinstance(x, dict) and "att" in x:
                feats[x["att"]] = x.get("val","")
    elif isinstance(f, dict) and "att" in f:
        feats[f["att"]] = f.get("val","")
    return feats

def extract_rel_tokens(sense):
    rel = sense.get("SenseRelation")
    toks=[]
    if not rel: 
        return toks
    rels = rel if isinstance(rel, list) else [rel]
    for r in rels:
        feats = r.get("feat", [])
        if isinstance(feats, dict): feats=[feats]
        rel_word = ""
        rel_type = ""
        for f in feats:
            if isinstance(f, dict):
                if f.get("att") in ("word", "target_word", "related_word"):
                    rel_word = f.get("val","")
                if f.get("att") in ("type","relType","relationType"):
                    rel_type = f.get("val","")
        if rel_word:
            toks += tokenize(rel_word)
            # relation type token acts as weak signal
            if rel_type:
                toks += tokenize(rel_type)
    # dedup
    seen=set(); out=[]
    for t in toks:
        if t not in seen:
            seen.add(t); out.append(t)
    return out

def iter_entries_from_zip(zip_path: Path):
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if not name.lower().endswith(".json"): 
                continue
            data = json.loads(z.read(name).decode("utf-8"))
            lex = data["LexicalResource"]["Lexicon"]
            for e in lex.get("LexicalEntry", []):
                yield e

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="전체 내려받기 zip 경로")
    ap.add_argument("--out", required=True, help="출력 sqlite db 경로")
    ap.add_argument("--max", type=int, default=0, help="테스트용 최대 레코드(0=전체)")
    args = ap.parse_args()

    inp = Path(args.input)
    out = Path(args.out)
    if out.exists(): out.unlink()
    con = sqlite3.connect(out)
    cur = con.cursor()
    cur.executescript(Path(__file__).with_name("schema.sql").read_text(encoding="utf-8"))

    n=0
    for e in iter_entries_from_zip(inp):
        lemma = e.get("Lemma", {}).get("feat", {})
        word = lemma.get("writtenForm","").strip()
        if not word or " " in word or "-" in word:
            continue
        # filter very long / weird
        if len(word) > 10:
            continue

        feats = e.get("feat", [])
        if isinstance(feats, dict): feats=[feats]
        pos = ""
        level = ""
        for f in feats:
            if isinstance(f, dict) and f.get("att")=="partOfSpeech":
                pos = f.get("val","")
            if isinstance(f, dict) and f.get("att")=="vocabularyLevel":
                level = f.get("val","")

        senses = e.get("Sense", [])
        if isinstance(senses, dict): senses=[senses]
        if not senses: 
            continue

        # pick first sense with definition
        picked=None
        for s in senses:
            sf = sense_feats(s)
            if sf.get("definition"):
                picked = (s, sf)
                break
        if not picked:
            continue
        s, sf = picked
        definition = sf.get("definition","").strip()
        if not definition:
            continue
        example = sf.get("example","").strip()

        toks = tokenize(definition)
        rel_toks = extract_rel_tokens(s)
        if not toks:
            continue

        cur.execute(
            "INSERT INTO entries(word,pos,level,definition,example,tokens,rel_tokens) VALUES (?,?,?,?,?,?,?)",
            (word, pos, level, definition, example, json.dumps(toks, ensure_ascii=False), json.dumps(rel_toks, ensure_ascii=False))
        )
        n += 1
        if n % 5000 == 0:
            con.commit()
            print("inserted", n)
        if args.max and n >= args.max:
            break
    con.commit()
    print("done", n)
    con.close()

if __name__ == "__main__":
    main()
