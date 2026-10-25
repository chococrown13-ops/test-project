"""편마다 쓴 돈을 적는 장부 (에피소드 폴더의 cost.json) 와 이번 달 한도 확인.

    from ledger import add_cost, month_total
    add_cost(ep_dir, "image", 0.045, "장면 1")
    python gunggeum/tools/ledger.py            # 이번 달 합계·한도
"""

import datetime as dt
import glob
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
EPISODES = os.path.join(HERE, "..", "episodes")
CONFIG = os.path.join(HERE, "..", "studio.config.json")


def config():
    with open(CONFIG, encoding="utf-8") as f:
        return json.load(f)


def _load(ep_dir):
    path = os.path.join(ep_dir, "cost.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {"items": []}


def episode_total(ep_dir):
    return round(sum(i["usd"] for i in _load(ep_dir)["items"]), 3)


def month_total(month=None):
    month = month or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m")
    total = 0.0
    for path in glob.glob(os.path.join(EPISODES, "*", "cost.json")):
        with open(path, encoding="utf-8") as f:
            total += sum(i["usd"] for i in json.load(f)["items"] if i["at"].startswith(month))
    return round(total, 3)


def check_budget(extra_usd=0.0):
    """이번 달 합계 + 쓰려는 돈이 월 한도를 넘으면 예외 — 생성 전에 부른다"""
    cap = config()["monthly_budget_usd"]
    spent = month_total()
    if spent + extra_usd > cap:
        raise SystemExit(f"월 한도 초과: 이번 달 ${spent:.2f} + 이번 ${extra_usd:.2f} > 한도 ${cap:.2f} — 멈추고 대표님께 보고")
    return spent


def add_cost(ep_dir, kind, usd, note):
    data = _load(ep_dir)
    data["items"].append({"at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "kind": kind, "usd": round(usd, 4), "note": note})
    with open(os.path.join(ep_dir, "cost.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return episode_total(ep_dir)


if __name__ == "__main__":
    cap = config()["monthly_budget_usd"]
    spent = month_total()
    print(f"이번 달 ${spent:.2f} / 한도 ${cap:.2f} (남은 돈 ${cap - spent:.2f})")
