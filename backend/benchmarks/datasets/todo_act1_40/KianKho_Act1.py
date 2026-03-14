# Name: Kian Paulo S. Kho
# Student ID: 2023-10726
# Assignment: To-do list

def group_by_tag(entries):
    grouped = {}
    for title, tag in entries:
        grouped.setdefault(tag, []).append({"title": title, "done": False})
    return grouped


def close_tag(grouped, tag):
    if tag not in grouped:
        return 0
    count = 0
    for item in grouped[tag]:
        if not item["done"]:
            item["done"] = True
            count += 1
    return count


if __name__ == "__main__":
    pool = group_by_tag([("Quiz prep", "school"), ("Laundry", "home")])
    print(close_tag(pool, "school"))
