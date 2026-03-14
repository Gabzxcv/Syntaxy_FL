# Name: Bea Katrina T. Ilagan
# Student ID: 2023-10717
# Assignment: To-do list

items = []


def add_task(text, points=1, owner="self"):
    items.append({"text": text.strip(), "points": int(points), "owner": owner, "done": False})


def complete_task(text):
    for row in items:
        if row["text"].lower() == text.lower() and not row["done"]:
            row["done"] = True
            return True
    return False


def remaining_points(owner=None):
    total = 0
    for row in items:
        same_owner = owner is None or row["owner"] == owner
        if same_owner and not row["done"]:
            total += row["points"]
    return total


if __name__ == "__main__":
    add_task("Read docs", 2, "self")
    add_task("Write code", 4, "self")
    complete_task("Read docs")
    print(remaining_points("self"))
