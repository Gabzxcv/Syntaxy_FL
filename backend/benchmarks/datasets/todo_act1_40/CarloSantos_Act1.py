# Name: Carlo Miguel P. Santos
# Student ID: 2023-10692
# Assignment: To-do list

todo_items = []


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
