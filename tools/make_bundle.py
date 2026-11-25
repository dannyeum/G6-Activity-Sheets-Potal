#!/usr/bin/env python3
"""
📦 data/*.json 세 개를 합쳐 data/bundle.js 를 만들어요.
bundle.js가 있으면 index.html을 더블클릭(file://)해도 포털이 열려요.

사용법 (포털 폴더에서):  python tools/make_bundle.py
(build_catalog.py를 실행하면 자동으로 함께 실행돼요)
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
bundle = {n: json.loads((DATA / f"{n}.json").read_text(encoding="utf-8")) for n in ("catalog", "standards", "subjects")}
(DATA / "bundle.js").write_text(
    "/* 자동 생성 파일 — 직접 고치지 말고 data/*.json 을 고친 뒤 python tools/make_bundle.py 를 실행하세요 */\n"
    "window.PORTAL_DATA = " + json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
print(f"✅ data/bundle.js 생성 ({(DATA / 'bundle.js').stat().st_size // 1024} KB)")
