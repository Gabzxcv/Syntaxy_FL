# Name: Gio Rafael P. Sy
# Student ID: 2023-10722
# Assignment: To-do list

from dataclasses import dataclass


@dataclass
class Task:
    title: str
    done: bool = False


class TodoList:
    def __init__(self):
        self.data = []

    def add(self, title):
        self.data.append(Task(title=title))

    def mark(self, title):
        for task in self.data:
            if task.title == title:
                task.done = True

    def export_open(self):
        return [task.title for task in self.data if not task.done]


if __name__ == "__main__":
    app = TodoList()
    app.add("Study graphs")
    app.add("Run tests")
    app.mark("Study graphs")
    print(app.export_open())
