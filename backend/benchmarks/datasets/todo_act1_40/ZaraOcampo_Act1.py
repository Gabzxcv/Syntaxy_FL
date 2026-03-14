# Name: Zara Faith D. Ocampo
# Student ID: 2023-10715
# Assignment: To-do list

todo = []


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
