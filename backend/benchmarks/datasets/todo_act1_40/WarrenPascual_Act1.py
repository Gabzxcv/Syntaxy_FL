# Name: Warren Kyle S. Pascual
# Student ID: 2023-10712
# Assignment: To-do list

tasks = []


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
