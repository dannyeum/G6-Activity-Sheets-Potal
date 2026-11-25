#!/usr/bin/env python3
"""
📦 활동지 목록(catalog.json) 자동 갱신 스크립트

사용법 (포털 폴더에서):
    python tools/build_catalog.py

하는 일
  1. worksheets/{과목}/ 폴더의 *_활동지.html 을 모두 훑어요.
  2. 각 파일의 `const CONFIG = {...}` 에서 제목·성취기준·목표·개념·활동·문항 수를 읽어요.
     (CONFIG 형식이 아닌 활동지는 기존 catalog.json 정보를 그대로 둬요.)
  3. data/catalog.json 을 새로 쓰고, data/standards.json 의 made(제작 여부)를 갱신해요.
     목록에 없던 성취기준 코드라면 standards.json 에 새로 추가해요.
  4. 마지막에 data/bundle.js 도 다시 만들어요.

새 활동지를 추가할 때
  - 파일 이름: 6과07-01_온도재기_활동지.html 처럼 '성취기준코드_짧은이름_활동지.html'
  - 넣을 곳: worksheets/sci/ (과목 폴더 이름은 data/subjects.json 의 id)
"""
import json, os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
WS = ROOT / "worksheets"

subjects = json.loads((DATA / "subjects.json").read_text(encoding="utf-8"))["subjects"]
NAME_BY_ID = {s["id"]: s["name"] for s in subjects}
old = json.loads((DATA / "catalog.json").read_text(encoding="utf-8"))
OLD = {o["file"]: o for o in old["items"]}
TYPES = old.get("activityTypes", {})


def strip_tags(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def js_str(block, key):
    """key:"값" 또는 key:'값' 또는 key:`값` 을 찾아요."""
    m = re.search(key + r'\s*:\s*(["\'`])((?:\\.|(?!\1).)*)\1', block, re.S)
    if not m:
        return ""
    return m.group(2).replace('\\"', '"').replace("\\'", "'").replace("\\n", "\n")


def section(text, start_key, end_keys):
    i = re.search(r"\b" + start_key + r"\s*:", text)
    if not i:
        return ""
    rest = text[i.end():]
    ends = [m.start() for k in end_keys for m in [re.search(r"\n\s*" + k + r"\s*:", rest)] if m]
    return rest[: min(ends)] if ends else rest


def parse(path):
    h = path.read_text(encoding="utf-8")
    ci = h.find("const CONFIG")
    if ci < 0:
        return None
    cfg = h[ci:]
    end = cfg.find("\n};")
    cfg = cfg[: end if end > 0 else len(cfg)]
    code = js_str(cfg, "standardCode")
    if not code:
        return None
    concepts = section(cfg, "concepts", ["activities", "quiz"])
    acts = section(cfg, "activities", ["quiz", "praise"])
    quiz = section(cfg, "quiz", ["praise", "reflectQuestion"])
    act_list = [{"type": t, "title": strip_tags(ti)} for t, ti in re.findall(r'\{\s*type\s*:\s*"(\w+)".*?\btitle\s*:\s*"([^"]*)"', acts, re.S)]
    return {
        "subject": js_str(cfg, "subject"),
        "unit": js_str(cfg, "unit"),
        "code": code,
        "standard": js_str(cfg, "standardText"),
        "title": strip_tags(js_str(cfg, "title")),
        "goal": strip_tags(js_str(cfg, "goal")),
        "concepts": [strip_tags(t) for t in re.findall(r'\btitle\s*:\s*"([^"]*)"', concepts)],
        "activities": act_list,
        "quiz": len(re.findall(r"\banswer\s*:", quiz)),
    }


items, skipped = [], []
for sub_dir in sorted(p for p in WS.iterdir() if p.is_dir()):
    sid = sub_dir.name
    if sid not in NAME_BY_ID:
        print(f"⚠️  모르는 과목 폴더: {sid} (data/subjects.json 의 id와 같아야 해요)")
        continue
    for f in sorted(sub_dir.glob("*.html")):
        info = parse(f)
        base = dict(OLD.get(f.name, {}))
        if info is None and not base:
            skipped.append(f.name)
            continue
        if info:
            # 활동지에서 읽은 값으로 갱신 (비어 있는 값은 기존 정보를 유지)
            base.update({k: v for k, v in info.items() if v})
        code = base["code"]
        sid_code = code.strip("[]")
        base.update({
            "file": f.name, "subjectShort": NAME_BY_ID[sid], "subjectId": sid,
            "subject": base.get("subject") or f"6학년 {NAME_BY_ID[sid]}",
            "id": sid_code, "domain": re.search(r"(\d{2})-\d{2}$", sid_code).group(1),
            "href": f"worksheets/{sid}/{f.name}", "size": f.stat().st_size,
        })
        base.setdefault("batch", None)
        for a in base["activities"]:
            TYPES.setdefault(a["type"], a["type"])
        items.append(base)

items.sort(key=lambda o: o["id"])
dups = {o["id"] for o in items if sum(1 for x in items if x["id"] == o["id"]) > 1}
if dups:
    print("⚠️  같은 성취기준 활동지가 2개 이상 있어요 (첫 번째만 학습맵에 연결돼요):", ", ".join(sorted(dups)))

(DATA / "catalog.json").write_text(json.dumps({"activityTypes": TYPES, "items": items}, ensure_ascii=False, indent=1), encoding="utf-8")

# standards.json 의 made 갱신 (+ 새 코드 추가)
stds = json.loads((DATA / "standards.json").read_text(encoding="utf-8"))
have = {s["id"]: s for s in stds}
made_ids = {o["id"] for o in items}
for o in items:
    if o["id"] not in have:
        s = {"code": o["code"], "id": o["id"], "text": o["standard"], "made": True, "subject": o["subjectShort"], "domain": o["domain"]}
        stds.append(s)
        have[o["id"]] = s
for s in stds:
    s["made"] = s["id"] in made_ids
stds.sort(key=lambda s: s["id"])
(DATA / "standards.json").write_text(json.dumps(stds, ensure_ascii=False, indent=1), encoding="utf-8")

print(f"✅ 활동지 {len(items)}개 · 성취기준 {len(stds)}개 (제작 {len(made_ids)}개)")
if skipped:
    print("⚠️  읽지 못한 파일:", ", ".join(skipped))

# bundle.js 다시 만들기
sys.path.insert(0, str(Path(__file__).parent))
import make_bundle  # noqa: E402,F401
