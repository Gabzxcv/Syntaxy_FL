# Name: Nora Elaine C. Tee
# Student ID: 2023-10729
# Assignment: To-do list

def task_generator(source):
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
