# Name: Freya Nicole H. Lim
# Student ID: 2023-10721
# Assignment: To-do list

tasks = []


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
