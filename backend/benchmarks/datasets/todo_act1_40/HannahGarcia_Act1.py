# Name: Hannah Claire S. Garcia
# Student ID: 2023-10697
# Assignment: To-do list

todos = []


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
