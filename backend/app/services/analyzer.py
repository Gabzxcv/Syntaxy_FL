import uuid
import random
import ast

SUPPORTED_LANGUAGES = {"python", "java"}


def validate_syntax(code: str, language: str) -> bool:
    """
    Validate syntax for the given language.

    - For Python: try to parse with ast.parse; return True on success,
      raise SyntaxError on parse errors.
    - For Java: stub that always returns True (tests expect a stub).
    - For unsupported languages: raise ValueError.
    """
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language: {language}")

    if language == "python":
        if not isinstance(code, str):
            raise SyntaxError("Code must be a string")
        try:
            ast.parse(code)
            return True
        except SyntaxError:
            # Propagate the SyntaxError so callers/tests can catch it
            raise
    elif language == "java":
        # Stub implementation for Java: assume valid
        return True

    # Defensive fallback
    return True


class CodeAnalyzer:
    def __init__(self, language: str):
        if language not in SUPPORTED_LANGUAGES:
            raise ValueError("Unsupported language")
        self.language = language
        # Tests expect this attribute to exist and be None at creation
        self.code = None

    def analyze(self, code: str) -> dict:
        """
        Perform a mocked analysis and return a dictionary containing:
        - analysis_id
        - language
        - lines_of_code
        - clone_percentage
        - clones (list)
        - cyclomatic_complexity
        - maintainability_index
        - refactoring_suggestions (list)
        """
        # Basic validation
        if not isinstance(code, str):
            raise ValueError("code must be a string")

        # Set stored code (tests may expect analyzer.code to be set after analyze)
        self.code = code

        # Lines of code: tests expect empty string to count as 1 line
        raw_lines = code.splitlines()
        lines_of_code = max(1, len(raw_lines))

        # Mock metrics
        analysis = {
            "analysis_id": str(uuid.uuid4()),
            "language": self.language,
            "lines_of_code": lines_of_code,
            "clone_percentage": round(random.uniform(0.0, 50.0), 1),
            "clones": _generate_mock_clones(lines_of_code),
            "cyclomatic_complexity": round(random.uniform(1.0, 30.0), 1),
            "maintainability_index": round(random.uniform(20.0, 100.0), 1),
            "refactoring_suggestions": _generate_mock_suggestions(lines_of_code),
        }

        return analysis


def _generate_mock_clones(num_lines: int) -> list:
    """Return mock clone entries; short code should return empty list."""
    if num_lines < 6:
        return []

    return [
        {
            "clone_id": str(uuid.uuid4()),
            "type": 2,
            "similarity": round(random.uniform(0.85, 0.98), 2),
            "locations": [
                {"start_line": max(1, num_lines // 4), "end_line": max(5, num_lines // 4 + 5)},
                {"start_line": max(1, num_lines // 2), "end_line": max(5, num_lines // 2 + 5)},
            ],
            "code_snippet": "\n".join(["// mock snippet"] * min(5, num_lines)),
        }
    ]


def _generate_mock_suggestions(num_lines: int) -> list:
    """Return mock refactoring suggestions. Return empty list for very short code."""
    if num_lines < 4:
        return []

    return [
        {
            "suggestion_id": str(uuid.uuid4()),
            "priority": 1,
            "priority_score": round(random.uniform(0.7, 0.95), 2),
            "refactoring_type": "Extract Method",
            "affected_clone_id": str(uuid.uuid4()),
            "explanation": {
                "remember": "You have duplicated this code 2 times",
                "understand": "Code duplication makes bugs hard to fix because changes must be made in multiple places",
                "apply": "Extract this into a reusable method called processData()",
            },
            "before_code": "// Mock before code\nif (x > 0) {\n    result = x * 2;\n}",
            "after_code": "// Mock after code\nint processData(int x) {\n    return x * 2;\n}\n\nif (x > 0) {\n    result = processData(x);\n}",
        }
    ]