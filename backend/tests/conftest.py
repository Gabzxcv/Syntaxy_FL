import os
import sys

HERE = os.path.dirname(__file__)
# backend/ (so backend/app can be imported as top-level 'app')
BACKEND_DIR = os.path.abspath(os.path.join(HERE, ".."))
# repository root (parent of backend) so 'backend' package is importable
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# Insert backend first (so imports like `import app` resolve to backend/app),
# then repo root (so imports like `import backend` work).
for path in (BACKEND_DIR, REPO_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)