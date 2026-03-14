# Name: Lia Camille A. Go
# Student ID: 2023-10727
# Assignment: To-do list

def add_task(container, title):
    return container + ((title, False),)


def complete_task(container, title):
    updated = []
    for row in container:
        if row[0] == title:
            updated.append((row[0], True))
        else:
            updated.append(row)
    return tuple(updated)


def open_tasks(container):
    return [title for title, done in container if not done]


if __name__ == "__main__":
    state = tuple()
    state = add_task(state, "Watch lecture")
    state = complete_task(state, "Watch lecture")
    print(open_tasks(state))
