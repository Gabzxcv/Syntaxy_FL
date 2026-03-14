# Name: Faith Anne G. Navarro
# Student ID: 2023-10695
# Assignment: To-do list

task_bank = []


def add(title, due_day):
    task_bank.append({
        "title": title,
        "due_day": due_day,
        "status": "pending",
    })


def set_done(title):
    for task in task_bank:
        if task["title"].lower() == title.lower():
            task["status"] = "done"
            return True
    return False


def overdue(reference_day):
    results = []
    for task in task_bank:
        if task["status"] == "pending" and task["due_day"] < reference_day:
            results.append(task)
    return results


def summarize():
    pending = sum(1 for task in task_bank if task["status"] == "pending")
    done = sum(1 for task in task_bank if task["status"] == "done")
    return {"pending": pending, "done": done}


if __name__ == "__main__":
    add("Code feature", 3)
    add("Fix bug", 1)
    set_done("Code feature")
    print(summarize())
