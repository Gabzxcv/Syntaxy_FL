# Name: Paula Andrea L. Delos Reyes
# Student ID: 2023-10705
# Assignment: To-do list

entries = []


def create_entry(label, priority="normal"):
    row = {
        "label": label.strip(),
        "priority": priority,
        "completed": False,
    }
    entries.append(row)


def mark_entry_done(position):
    if position < 0 or position >= len(entries):
        return False
    entries[position]["completed"] = True
    return True


def delete_entry(position):
    if position < 0 or position >= len(entries):
        return False
    entries.pop(position)
    return True


def display_entries():
    output = []
    for idx, row in enumerate(entries, start=1):
        mark = "x" if row["completed"] else " "
        text = row["label"]
        lvl = row["priority"]
        output.append(f"{idx}. [{mark}] {text} ({lvl})")
    return output


if __name__ == "__main__":
    create_entry("Submit zip", "high")
    create_entry("Warm-up problem", "low")
    mark_entry_done(0)
    for line in display_entries():
        print(line)
