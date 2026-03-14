# Name: Adrian Paul N. Malik
# Student ID: 2023-10716
# Assignment: To-do list

items = []


def add_task(text, points=1):
    items.append({"text": text, "points": points, "done": False})


def complete_task(text):
    for row in items:
        if row["text"].lower() == text.lower():
            row["done"] = True
            break


def remaining_points():
    total = 0
    for row in items:
        if not row["done"]:
            total += row["points"]
    return total


if __name__ == "__main__":
    add_task("Read docs", 2)
    add_task("Write code", 4)
    complete_task("Read docs")
    print(remaining_points())
