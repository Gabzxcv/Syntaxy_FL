# Name: Helena Beatrice V. Ang
# Student ID: 2023-10723
# Assignment: To-do list

import json
from pathlib import Path


DB = Path("todo_local.json")


def load_items():
    if DB.exists():
        return json.loads(DB.read_text(encoding="utf-8"))
    return {"tasks": []}


def save_items(payload):
    DB.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def add(payload, title):
    payload["tasks"].append({"title": title, "checked": False})


def toggle(payload, idx):
    payload["tasks"][idx]["checked"] = not payload["tasks"][idx]["checked"]


if __name__ == "__main__":
    state = load_items()
    add(state, "Record demo")
    toggle(state, 0)
    save_items(state)
