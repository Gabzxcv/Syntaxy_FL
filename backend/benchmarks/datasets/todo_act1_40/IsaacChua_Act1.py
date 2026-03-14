# Name: Isaac Miguel D. Chua
# Student ID: 2023-10724
# Assignment: To-do list

import heapq


queue = []
counter = 0


def push_task(name, priority):
    global counter
    counter += 1
    heapq.heappush(queue, (-priority, counter, {"name": name, "done": False}))


def pop_next():
    if not queue:
        return None
    _, _, task = heapq.heappop(queue)
    return task


def list_names():
    return [row[2]["name"] for row in queue]


if __name__ == "__main__":
    push_task("Patch endpoint", 3)
    push_task("Write report", 1)
    print(list_names())
