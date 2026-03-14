# Name: Milo Vincent R. Tiu
# Student ID: 2023-10728
# Assignment: To-do list

from datetime import date, timedelta


def schedule():
    return {
        "today": [],
        "tomorrow": [],
        "later": [],
    }


def add(s, title, due):
    bucket = "later"
    if due <= date.today():
        bucket = "today"
    elif due <= date.today() + timedelta(days=1):
        bucket = "tomorrow"
    s[bucket].append({"title": title, "due": due.isoformat()})


if __name__ == "__main__":
    data = schedule()
    add(data, "Fix lint", date.today())
    print(data)
