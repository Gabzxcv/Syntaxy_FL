# Name: Oscar Vincent R. Dominguez
# Student ID: 2023-10704
# Assignment: To-do list

items = []


def add_item(name, level="normal"):
    row = {
        "name": name.strip(),
        "level": level,
        "done": False,
    }
    items.append(row)


def finish_item(position):
    if position < 0 or position >= len(items):
        return False
    items[position]["done"] = True
    return True


def remove_item(position):
    if position < 0 or position >= len(items):
        return False
    items.pop(position)
    return True


def show_items():
    output = []
    for idx, row in enumerate(items, start=1):
        mark = "x" if row["done"] else " "
        text = row["name"]
        lvl = row["level"]
        output.append(f"{idx}. [{mark}] {text} ({lvl})")
    return output


if __name__ == "__main__":
    add_item("Submit zip", "high")
    add_item("Warm-up problem", "low")
    finish_item(0)
    for line in show_items():
        print(line)
