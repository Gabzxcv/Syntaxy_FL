"""
Generate a 40-student Python to-do list dataset for TAHD clone testing.

Output:
  benchmarks/datasets/todo_act1_40/
    - 40 files named FirstNameLastName_Act1.py
    - manifest.csv
    - README.md

Category layout:
  - 10 files: Type-1 exact clone pairs (5 pairs)
  - 12 files: Type-2 renamed clone pairs (6 pairs)
  - 10 files: Type-3 near-miss clone pairs (5 pairs)
  - 8 files : No-clone diverse implementations
"""

from __future__ import annotations

import csv
from pathlib import Path

DATASET_DIR = Path(__file__).resolve().parent / "datasets" / "todo_act1_40"


ROSTER = [
    ("AllenCruz", "Allen Gabriel B. Cruz", "2023-10690"),
    ("BiancaReyes", "Bianca Marie V. Reyes", "2023-10691"),
    ("CarloSantos", "Carlo Miguel P. Santos", "2023-10692"),
    ("DianaFlores", "Diana Therese R. Flores", "2023-10693"),
    ("EthanMendoza", "Ethan James L. Mendoza", "2023-10694"),
    ("FaithNavarro", "Faith Anne G. Navarro", "2023-10695"),
    ("GavinLopez", "Gavin Paulo D. Lopez", "2023-10696"),
    ("HannahGarcia", "Hannah Claire S. Garcia", "2023-10697"),
    ("IvanRamos", "Ivan Joseph T. Ramos", "2023-10698"),
    ("JuliaTorres", "Julia Mae C. Torres", "2023-10699"),
    ("KevinAquino", "Kevin Joshua M. Aquino", "2023-10700"),
    ("LaraVillanueva", "Lara Denise A. Villanueva", "2023-10701"),
    ("MarcoPadilla", "Marco Luis P. Padilla", "2023-10702"),
    ("NinaCastillo", "Nina Bea E. Castillo", "2023-10703"),
    ("OscarDominguez", "Oscar Vincent R. Dominguez", "2023-10704"),
    ("PaulaDelosReyes", "Paula Andrea L. Delos Reyes", "2023-10705"),
    ("QuinnMercado", "Quinn Elijah B. Mercado", "2023-10706"),
    ("RheaBautista", "Rhea Nicole V. Bautista", "2023-10707"),
    ("SeanFernandez", "Sean Matthew D. Fernandez", "2023-10708"),
    ("TinaValdez", "Tina Krystal P. Valdez", "2023-10709"),
    ("UlyssesDelaCruz", "Ulysses Mark A. Dela Cruz", "2023-10710"),
    ("VeraSalazar", "Vera Camille G. Salazar", "2023-10711"),
    ("WarrenPascual", "Warren Kyle S. Pascual", "2023-10712"),
    ("XenaSoriano", "Xena April M. Soriano", "2023-10713"),
    ("YuriGalang", "Yuri Angelo C. Galang", "2023-10714"),
    ("ZaraOcampo", "Zara Faith D. Ocampo", "2023-10715"),
    ("AdrianMalik", "Adrian Paul N. Malik", "2023-10716"),
    ("BeaIlagan", "Bea Katrina T. Ilagan", "2023-10717"),
    ("CedricUy", "Cedric Allan R. Uy", "2023-10718"),
    ("DaphneCo", "Daphne Louise K. Co", "2023-10719"),
    ("ElioTan", "Elio Martin J. Tan", "2023-10720"),
    ("FreyaLim", "Freya Nicole H. Lim", "2023-10721"),
    ("GioSy", "Gio Rafael P. Sy", "2023-10722"),
    ("HelenaAng", "Helena Beatrice V. Ang", "2023-10723"),
    ("IsaacChua", "Isaac Miguel D. Chua", "2023-10724"),
    ("JannaYu", "Janna Therese M. Yu", "2023-10725"),
    ("KianKho", "Kian Paulo S. Kho", "2023-10726"),
    ("LiaGo", "Lia Camille A. Go", "2023-10727"),
    ("MiloTiu", "Milo Vincent R. Tiu", "2023-10728"),
    ("NoraTee", "Nora Elaine C. Tee", "2023-10729"),
]


def make_header(full_name: str, student_id: str) -> str:
    return (
        f"# Name: {full_name}\n"
        f"# Student ID: {student_id}\n"
        "# Assignment: To-do list\n\n"
    )


TYPE1_TEMPLATES = [
    """tasks = []


def add_task(title, priority="normal"):
    task = {
        "title": title.strip(),
        "priority": priority,
        "done": False,
    }
    tasks.append(task)


def complete_task(index):
    if 0 <= index < len(tasks):
        tasks[index]["done"] = True
        return True
    return False


def remove_task(index):
    if 0 <= index < len(tasks):
        tasks.pop(index)
        return True
    return False


def print_tasks():
    for i, task in enumerate(tasks, start=1):
        marker = "x" if task["done"] else " "
        print(f"{i}. [{marker}] {task['title']} ({task['priority']})")


if __name__ == "__main__":
    add_task("Submit assignment", "high")
    add_task("Review notes", "medium")
    complete_task(0)
    print_tasks()
""",
    """todo_items = []


def create_todo(text, category="school"):
    entry = {
        "text": text,
        "category": category,
        "finished": False,
    }
    todo_items.append(entry)


def mark_finished(task_number):
    if task_number < 0 or task_number >= len(todo_items):
        return False
    todo_items[task_number]["finished"] = True
    return True


def list_open_tasks():
    open_count = 0
    for idx, item in enumerate(todo_items, start=1):
        if not item["finished"]:
            open_count += 1
            print(f"{idx}: {item['text']} [{item['category']}]")
    return open_count


def purge_finished():
    global todo_items
    todo_items = [item for item in todo_items if not item["finished"]]


if __name__ == "__main__":
    create_todo("Read chapter 2", "study")
    create_todo("Buy marker", "errand")
    mark_finished(1)
    print("Open tasks:", list_open_tasks())
""",
    """task_bank = []


def add(title, due_day):
    task_bank.append({
        "title": title,
        "due_day": due_day,
        "status": "pending",
    })


def set_done(title):
    for task in task_bank:
        if task["title"].lower() == title.lower():
            task["status"] = "done"
            return True
    return False


def overdue(reference_day):
    results = []
    for task in task_bank:
        if task["status"] == "pending" and task["due_day"] < reference_day:
            results.append(task)
    return results


def summarize():
    pending = sum(1 for task in task_bank if task["status"] == "pending")
    done = sum(1 for task in task_bank if task["status"] == "done")
    return {"pending": pending, "done": done}


if __name__ == "__main__":
    add("Code feature", 3)
    add("Fix bug", 1)
    set_done("Code feature")
    print(summarize())
""",
    """todos = []


def push_task(name, estimate):
    todos.append({
        "name": name,
        "estimate": int(estimate),
        "done": False,
    })


def finish_by_name(name):
    for todo in todos:
        if todo["name"] == name:
            todo["done"] = True
            return True
    return False


def total_estimate(include_done=False):
    total = 0
    for todo in todos:
        if include_done or not todo["done"]:
            total += todo["estimate"]
    return total


def pending_names():
    names = []
    for todo in todos:
        if not todo["done"]:
            names.append(todo["name"])
    return names


if __name__ == "__main__":
    push_task("Write tests", 2)
    push_task("Refactor", 1)
    finish_by_name("Write tests")
    print(pending_names())
""",
    """records = []


def add_record(task, label="general"):
    records.append({
        "task": task,
        "label": label,
        "done": False,
    })


def change_label(index, new_label):
    if 0 <= index < len(records):
        records[index]["label"] = new_label
        return True
    return False


def done_ratio():
    if not records:
        return 0.0
    done = sum(1 for rec in records if rec["done"])
    return done / len(records)


def close_by_label(label):
    count = 0
    for rec in records:
        if rec["label"] == label and not rec["done"]:
            rec["done"] = True
            count += 1
    return count


if __name__ == "__main__":
    add_record("Polish slides", "school")
    add_record("Walk dog", "home")
    close_by_label("school")
    print(done_ratio())
""",
]


def build_type2(pair_id: int, variant: int) -> str:
    configs = [
        {
            "list": "items",
            "add": "add_item",
            "finish": "finish_item",
            "remove": "remove_item",
            "show": "show_items",
            "name": "name",
            "level": "level",
            "done": "done",
        },
        {
            "list": "entries",
            "add": "create_entry",
            "finish": "mark_entry_done",
            "remove": "delete_entry",
            "show": "display_entries",
            "name": "label",
            "level": "priority",
            "done": "completed",
        },
    ]
    a, b = configs
    cfg = a if variant == 0 else b

    example_a = [
        ("Review handout", "high"),
        ("Write pseudocode", "medium"),
        ("Submit zip", "high"),
        ("Practice loops", "low"),
        ("Plan features", "medium"),
        ("Debug edge case", "high"),
    ][pair_id]

    return f"""{cfg['list']} = []


def {cfg['add']}({cfg['name']}, {cfg['level']}="normal"):
    row = {{
        "{cfg['name']}": {cfg['name']}.strip(),
        "{cfg['level']}": {cfg['level']},
        "{cfg['done']}": False,
    }}
    {cfg['list']}.append(row)


def {cfg['finish']}(position):
    if position < 0 or position >= len({cfg['list']}):
        return False
    {cfg['list']}[position]["{cfg['done']}"] = True
    return True


def {cfg['remove']}(position):
    if position < 0 or position >= len({cfg['list']}):
        return False
    {cfg['list']}.pop(position)
    return True


def {cfg['show']}():
    output = []
    for idx, row in enumerate({cfg['list']}, start=1):
        mark = "x" if row["{cfg['done']}"] else " "
        text = row["{cfg['name']}"]
        lvl = row["{cfg['level']}"]
        output.append(f"{{idx}}. [{{mark}}] {{text}} ({{lvl}})")
    return output


if __name__ == "__main__":
    {cfg['add']}("{example_a[0]}", "{example_a[1]}")
    {cfg['add']}("Warm-up problem", "low")
    {cfg['finish']}(0)
    for line in {cfg['show']}():
        print(line)
"""


TYPE3_PAIR_A = [
    """tasks = []


def add_task(text, tag="general"):
    tasks.append({"text": text, "tag": tag, "done": False})


def complete(index):
    if 0 <= index < len(tasks):
        tasks[index]["done"] = True


def list_by_tag(tag):
    rows = []
    for task in tasks:
        if task["tag"] == tag:
            rows.append(task)
    return rows


def build_report():
    done = 0
    pending = 0
    for task in tasks:
        if task["done"]:
            done += 1
        else:
            pending += 1
    return {"done": done, "pending": pending, "total": len(tasks)}


if __name__ == "__main__":
    add_task("Research topic", "school")
    add_task("Write outline", "school")
    complete(0)
    print(build_report())
""",
    """tasks = []


def add_task(text, tag="general", estimate=1):
    tasks.append({"text": text.strip(), "tag": tag, "done": False, "estimate": estimate})


def complete(index):
    if index < 0 or index >= len(tasks):
        return False
    tasks[index]["done"] = True
    return True


def list_by_tag(tag):
    rows = []
    for task in tasks:
        if task["tag"] == tag and not task["done"]:
            rows.append(task)
    rows.sort(key=lambda row: row["estimate"], reverse=True)
    return rows


def build_report():
    done = sum(1 for task in tasks if task["done"])
    pending = sum(1 for task in tasks if not task["done"])
    effort = sum(task["estimate"] for task in tasks if not task["done"])
    return {"done": done, "pending": pending, "effort": effort, "total": len(tasks)}


if __name__ == "__main__":
    add_task("Research topic", "school", 2)
    add_task("Write outline", "school", 1)
    complete(0)
    print(build_report())
""",
]

TYPE3_PAIR_B = [
    """todo = []


def add(title, due):
    todo.append({"title": title, "due": due, "status": "open"})


def close_overdue(day):
    for task in todo:
        if task["status"] == "open" and task["due"] < day:
            task["status"] = "done"


def stats():
    info = {"open": 0, "done": 0}
    for task in todo:
        info[task["status"]] += 1
    return info


if __name__ == "__main__":
    add("Finish slides", 2)
    add("Practice demo", 3)
    close_overdue(3)
    print(stats())
""",
    """todo = []


def add(title, due, category="school"):
    todo.append({"title": title, "due": int(due), "category": category, "status": "open"})


def close_overdue(day, include_category=None):
    for task in todo:
        overdue = task["status"] == "open" and task["due"] < day
        allowed = include_category is None or task["category"] == include_category
        if overdue and allowed:
            task["status"] = "done"


def stats():
    info = {"open": 0, "done": 0, "urgent": 0}
    for task in todo:
        info[task["status"]] += 1
        if task["status"] == "open" and task["due"] <= 1:
            info["urgent"] += 1
    return info


if __name__ == "__main__":
    add("Finish slides", 2, "school")
    add("Practice demo", 1, "school")
    close_overdue(3, include_category="school")
    print(stats())
""",
]

TYPE3_PAIR_C = [
    """items = []


def add_task(text, points=1):
    items.append({"text": text, "points": points, "done": False})


def complete_task(text):
    for row in items:
        if row["text"].lower() == text.lower():
            row["done"] = True
            break


def remaining_points():
    total = 0
    for row in items:
        if not row["done"]:
            total += row["points"]
    return total


if __name__ == "__main__":
    add_task("Read docs", 2)
    add_task("Write code", 4)
    complete_task("Read docs")
    print(remaining_points())
""",
    """items = []


def add_task(text, points=1, owner="self"):
    items.append({"text": text.strip(), "points": int(points), "owner": owner, "done": False})


def complete_task(text):
    for row in items:
        if row["text"].lower() == text.lower() and not row["done"]:
            row["done"] = True
            return True
    return False


def remaining_points(owner=None):
    total = 0
    for row in items:
        same_owner = owner is None or row["owner"] == owner
        if same_owner and not row["done"]:
            total += row["points"]
    return total


if __name__ == "__main__":
    add_task("Read docs", 2, "self")
    add_task("Write code", 4, "self")
    complete_task("Read docs")
    print(remaining_points("self"))
""",
]

TYPE3_PAIR_D = [
    """tasks = []


def add(name):
    tasks.append({"name": name, "done": False})


def toggle(index):
    if 0 <= index < len(tasks):
        tasks[index]["done"] = not tasks[index]["done"]


def reorder_open_first():
    open_items = [x for x in tasks if not x["done"]]
    done_items = [x for x in tasks if x["done"]]
    return open_items + done_items


if __name__ == "__main__":
    add("Task A")
    add("Task B")
    toggle(1)
    print(reorder_open_first())
""",
    """tasks = []


def add(name, tag="general"):
    tasks.append({"name": name, "tag": tag, "done": False})


def toggle(index):
    if index < 0 or index >= len(tasks):
        return False
    tasks[index]["done"] = not tasks[index]["done"]
    return True


def reorder_open_first(tag=None):
    selected = [x for x in tasks if tag is None or x["tag"] == tag]
    open_items = [x for x in selected if not x["done"]]
    done_items = [x for x in selected if x["done"]]
    return sorted(open_items, key=lambda x: x["name"]) + done_items


if __name__ == "__main__":
    add("Task A", "school")
    add("Task B", "school")
    toggle(1)
    print(reorder_open_first("school"))
""",
]

TYPE3_PAIR_E = [
    """tasks = []


def add_task(text, priority):
    tasks.append({"text": text, "priority": priority, "done": False})


def high_priority_open():
    result = []
    for task in tasks:
        if task["priority"] == "high" and not task["done"]:
            result.append(task)
    return result


def close_first_high():
    for task in tasks:
        if task["priority"] == "high" and not task["done"]:
            task["done"] = True
            return True
    return False


if __name__ == "__main__":
    add_task("Design UI", "high")
    add_task("Clean desk", "low")
    close_first_high()
    print(high_priority_open())
""",
    """tasks = []


def add_task(text, priority, owner="self"):
    tasks.append({"text": text, "priority": priority, "owner": owner, "done": False})


def high_priority_open(owner=None):
    result = []
    for task in tasks:
        owner_ok = owner is None or task["owner"] == owner
        if owner_ok and task["priority"] in ("high", "urgent") and not task["done"]:
            result.append(task)
    return result


def close_first_high(owner=None):
    for task in tasks:
        owner_ok = owner is None or task["owner"] == owner
        if owner_ok and task["priority"] in ("high", "urgent") and not task["done"]:
            task["done"] = True
            return True
    return False


if __name__ == "__main__":
    add_task("Design UI", "urgent", "self")
    add_task("Clean desk", "low", "self")
    close_first_high("self")
    print(high_priority_open("self"))
""",
]


NO_CLONE_TEMPLATES = [
    """from dataclasses import dataclass


@dataclass
class Task:
    title: str
    done: bool = False


class TodoList:
    def __init__(self):
        self.data = []

    def add(self, title):
        self.data.append(Task(title=title))

    def mark(self, title):
        for task in self.data:
            if task.title == title:
                task.done = True

    def export_open(self):
        return [task.title for task in self.data if not task.done]


if __name__ == "__main__":
    app = TodoList()
    app.add("Study graphs")
    app.add("Run tests")
    app.mark("Study graphs")
    print(app.export_open())
""",
    """import json
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
""",
    """import heapq


queue = []
counter = 0


def push_task(name, priority):
    global counter
    counter += 1
    heapq.heappush(queue, (-priority, counter, {"name": name, "done": False}))


def pop_next():
    if not queue:
        return None
    _, _, task = heapq.heappop(queue)
    return task


def list_names():
    return [row[2]["name"] for row in queue]


if __name__ == "__main__":
    push_task("Patch endpoint", 3)
    push_task("Write report", 1)
    print(list_names())
""",
    """def parse_command(raw):
    parts = raw.strip().split(" ", 1)
    cmd = parts[0].lower() if parts else ""
    arg = parts[1] if len(parts) > 1 else ""
    return cmd, arg


def run_script(lines):
    todos = []
    for line in lines:
        cmd, arg = parse_command(line)
        if cmd == "add":
            todos.append(arg)
        elif cmd == "drop" and arg in todos:
            todos.remove(arg)
    return todos


if __name__ == "__main__":
    sample = ["add review", "add package", "drop review"]
    print(run_script(sample))
""",
    """def group_by_tag(entries):
    grouped = {}
    for title, tag in entries:
        grouped.setdefault(tag, []).append({"title": title, "done": False})
    return grouped


def close_tag(grouped, tag):
    if tag not in grouped:
        return 0
    count = 0
    for item in grouped[tag]:
        if not item["done"]:
            item["done"] = True
            count += 1
    return count


if __name__ == "__main__":
    pool = group_by_tag([("Quiz prep", "school"), ("Laundry", "home")])
    print(close_tag(pool, "school"))
""",
    """def add_task(container, title):
    return container + ((title, False),)


def complete_task(container, title):
    updated = []
    for row in container:
        if row[0] == title:
            updated.append((row[0], True))
        else:
            updated.append(row)
    return tuple(updated)


def open_tasks(container):
    return [title for title, done in container if not done]


if __name__ == "__main__":
    state = tuple()
    state = add_task(state, "Watch lecture")
    state = complete_task(state, "Watch lecture")
    print(open_tasks(state))
""",
    """from datetime import date, timedelta


def schedule():
    return {
        "today": [],
        "tomorrow": [],
        "later": [],
    }


def add(s, title, due):
    bucket = "later"
    if due <= date.today():
        bucket = "today"
    elif due <= date.today() + timedelta(days=1):
        bucket = "tomorrow"
    s[bucket].append({"title": title, "due": due.isoformat()})


if __name__ == "__main__":
    data = schedule()
    add(data, "Fix lint", date.today())
    print(data)
""",
    """def task_generator(source):
    for raw in source:
        value = raw.strip()
        if value:
            yield {"text": value, "done": False}


def collect(source):
    out = []
    for task in task_generator(source):
        out.append(task)
    return out


def mark_all_done(tasks):
    for task in tasks:
        task["done"] = True


if __name__ == "__main__":
    items = collect(["draft plan", "", "ship feature"])
    mark_all_done(items)
    print(items)
""",
]


def type3_body(pair_id: int, variant: int) -> str:
    pairs = [TYPE3_PAIR_A, TYPE3_PAIR_B, TYPE3_PAIR_C, TYPE3_PAIR_D, TYPE3_PAIR_E]
    return pairs[pair_id][variant]


def category_for_index(i: int) -> tuple[str, int, int]:
    if i < 10:
        return ("type1", i // 2, i % 2)
    if i < 22:
        j = i - 10
        return ("type2", j // 2, j % 2)
    if i < 32:
        j = i - 22
        return ("type3", j // 2, j % 2)
    return ("no_clone", i - 32, 0)


def body_for_student(i: int) -> tuple[str, str]:
    category, group, variant = category_for_index(i)
    if category == "type1":
        return category, TYPE1_TEMPLATES[group]
    if category == "type2":
        return category, build_type2(group, variant)
    if category == "type3":
        return category, type3_body(group, variant)
    return category, NO_CLONE_TEMPLATES[group]


def write_dataset() -> None:
    DATASET_DIR.mkdir(parents=True, exist_ok=True)

    manifest_rows = []

    for i, (stem, full_name, student_id) in enumerate(ROSTER):
        category, body = body_for_student(i)
        filename = f"{stem}_Act1.py"
        file_path = DATASET_DIR / filename
        file_path.write_text(make_header(full_name, student_id) + body, encoding="utf-8")

        cat_name, group_id, variant = category_for_index(i)
        pair_key = f"{cat_name}_group_{group_id}" if cat_name != "no_clone" else "none"
        manifest_rows.append(
            {
                "filename": filename,
                "full_name": full_name,
                "student_id": student_id,
                "expected_category": category,
                "pair_key": pair_key,
                "variant": variant,
            }
        )

    manifest_path = DATASET_DIR / "manifest.csv"
    with manifest_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "filename",
                "full_name",
                "student_id",
                "expected_category",
                "pair_key",
                "variant",
            ],
        )
        writer.writeheader()
        writer.writerows(manifest_rows)

    readme = DATASET_DIR / "README.md"
    readme.write_text(
        "\n".join(
            [
                "# To-do List Dataset (40 Students)",
                "",
                "This dataset is designed for TAHD clone testing.",
                "",
                "## Composition",
                "- 10 files in Type-1 exact-clone pairs (5 pairs)",
                "- 12 files in Type-2 renamed-clone pairs (6 pairs)",
                "- 10 files in Type-3 near-miss pairs (5 pairs)",
                "- 8 files with no intended clones",
                "",
                "See `manifest.csv` for expected grouping.",
            ]
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    if len(ROSTER) != 40:
        raise ValueError(f"Expected 40 students, got {len(ROSTER)}")
    write_dataset()
    print(f"Generated dataset at: {DATASET_DIR}")
