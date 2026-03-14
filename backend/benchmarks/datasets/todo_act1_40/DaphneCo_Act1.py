# Name: Daphne Louise K. Co
# Student ID: 2023-10719
# Assignment: To-do list

tasks = []


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
