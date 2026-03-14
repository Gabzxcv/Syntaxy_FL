# Name: Janna Therese M. Yu
# Student ID: 2023-10725
# Assignment: To-do list

def parse_command(raw):
    parts = raw.strip().split(" ", 1)
    cmd = parts[0].lower() if parts else ""
    arg = parts[1] if len(parts) > 1 else ""
    return cmd, arg


def run_script(lines):
    todos = []
    for line in lines:
        cmd, arg = parse_command(line)
        if cmd == "add":
            todos.append(arg)
        elif cmd == "drop" and arg in todos:
            todos.remove(arg)
    return todos


if __name__ == "__main__":
    sample = ["add review", "add package", "drop review"]
    print(run_script(sample))
