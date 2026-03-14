# Name: Yuri Angelo C. Galang
# Student ID: 2023-10714
# Assignment: To-do list

todo = []


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
