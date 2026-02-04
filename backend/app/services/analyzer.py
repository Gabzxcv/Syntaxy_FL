import uuid
import random

def validate_syntax(code: str, language: str):
    """
    Minimal syntax 'validator' for mock purposes.
    Raise SyntaxError when obvious issues are found (very lightweight).
    Replace with a real parser for production.
    """
    if not isinstance(code, str):
        raise SyntaxError("Code must be a string")
    # Very naive check: unmatched parentheses as an example
    if code.count('(') != code.count(')'):
        raise SyntaxError("Unmatched parentheses detected")
    # Add more checks as needed for the chosen language


class CodeAnalyzer:
    def __init__(self, language: str):
        self.language = language

    def analyze(self, code: str) -> dict:
        # Mocked analysis result to match API spec
        lines = [l for l in code.splitlines() if l.strip() != '']
        num_lines = len(lines)

        result = {
            'analysis_id': str(uuid.uuid4()),
            'clone_percentage': round(random.uniform(5.0, 40.0), 1),
            'cyclomatic_complexity': round(random.uniform(1.0, 30.0), 1),
            'maintainability_index': round(random.uniform(30.0, 90.0), 1),
            'clones': _generate_mock_clones(num_lines),
            'refactoring_suggestions': _generate_mock_suggestions()
        }
        return result


def _generate_mock_clones(num_lines):
    """Generate mock clone data"""
    if num_lines < 6:
        return []  # Too small to have clones

    return [
        {
            'clone_id': str(uuid.uuid4()),
            'type': 2,
            'similarity': round(random.uniform(0.85, 0.98), 2),
            'locations': [
                {
                    'start_line': max(1, num_lines // 4),
                    'end_line': max(5, num_lines // 4 + 5)
                },
                {
                    'start_line': max(1, num_lines // 2),
                    'end_line': max(5, num_lines // 2 + 5)
                }
            ],
            'code_snippet': '\n'.join(['// mock snippet'] * min(5, num_lines))
        }
    ]


def _generate_mock_suggestions():
    """Generate mock refactoring suggestions"""
    return [
        {
            'suggestion_id': str(uuid.uuid4()),
            'priority': 1,
            'priority_score': round(random.uniform(0.7, 0.95), 2),
            'refactoring_type': 'Extract Method',
            'affected_clone_id': str(uuid.uuid4()),
            'explanation': {
                'remember': 'You have duplicated this code 2 times',
                'understand': 'Code duplication makes bugs hard to fix because changes must be made in multiple places',
                'apply': 'Extract this into a reusable method called processData()'
            },
            'before_code': '// Mock before code\nif (x > 0) {\n    result = x * 2;\n}',
            'after_code': '// Mock after code\nint processData(int x) {\n    return x * 2;\n}\n\nif (x > 0) {\n    result = processData(x);\n}'
        }
    ]