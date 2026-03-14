# Name: Bianca Marie V. Reyes
# Student ID: 2023-10691
# Assignment: To-do list

tasks = []


def add_task(title, priority="normal"):
    task = {
        "title": title.strip(),
        "priority": priority,
        "done": False,
    }
    tasks.append(task)


def complete_task(index):
    if 0 <= index < len(tasks):
        tasks[index]["done"] = True
        return True
    return False


def remove_task(index):
    if 0 <= index < len(tasks):
        tasks.pop(index)
        return True
    return False


def print_tasks():
    for i, task in enumerate(tasks, start=1):
        marker = "x" if task["done"] else " "
        print(f"{i}. [{marker}] {task['title']} ({task['priority']})")


if __name__ == "__main__":
    add_task("Submit assignment", "high")
    add_task("Review notes", "medium")
    complete_task(0)
    print_tasks()
