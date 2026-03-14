# Name: Julia Mae C. Torres
# Student ID: 2023-10699
# Assignment: To-do list

records = []


def add_record(task, label="general"):
    records.append({
        "task": task,
        "label": label,
        "done": False,
    })


def change_label(index, new_label):
    if 0 <= index < len(records):
        records[index]["label"] = new_label
        return True
    return False


def done_ratio():
    if not records:
        return 0.0
    done = sum(1 for rec in records if rec["done"])
    return done / len(records)


def close_by_label(label):
    count = 0
    for rec in records:
        if rec["label"] == label and not rec["done"]:
            rec["done"] = True
            count += 1
    return count


if __name__ == "__main__":
    add_record("Polish slides", "school")
    add_record("Walk dog", "home")
    close_by_label("school")
    print(done_ratio())
