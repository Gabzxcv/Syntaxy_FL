# Name: Elio Martin J. Tan
# Student ID: 2023-10720
# Assignment: To-do list

tasks = []


def add_task(text, priority):
    tasks.append({"text": text, "priority": priority, "done": False})


def high_priority_open():
    result = []
    for task in tasks:
        if task["priority"] == "high" and not task["done"]:
            result.append(task)
    return result


def close_first_high():
    for task in tasks:
        if task["priority"] == "high" and not task["done"]:
            task["done"] = True
            return True
    return False


if __name__ == "__main__":
    add_task("Design UI", "high")
    add_task("Clean desk", "low")
    close_first_high()
    print(high_priority_open())
