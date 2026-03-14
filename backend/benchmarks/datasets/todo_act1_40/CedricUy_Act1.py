# Name: Cedric Allan R. Uy
# Student ID: 2023-10718
# Assignment: To-do list

tasks = []


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
