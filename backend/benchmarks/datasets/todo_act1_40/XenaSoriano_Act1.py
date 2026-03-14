# Name: Xena April M. Soriano
# Student ID: 2023-10713
# Assignment: To-do list

tasks = []


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
