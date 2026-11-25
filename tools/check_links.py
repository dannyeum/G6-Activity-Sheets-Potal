#!/usr/bin/env python3
"""
🔗 catalog.json 의 모든 활동지 링크(href)가 실제 파일로 있는지 확인해요.
사용법 (포털 폴더에서):  python tools/check_links.py
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
items = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf-8"))["items"]
missing = [o["href"] for o in items if not (ROOT / o["href"]).is_file()]
print(f"활동지 {len(items)}개 중 파일 있음 {len(items) - len(missing)}개")
if missing:
    print("❌ 없는 파일:\n  " + "\n  ".join(missing))
    sys.exit(1)
print("✅ 모든 링크가 정상이에요!")
