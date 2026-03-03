"""
Unit tests for CodeAnalyzer service

Tests cover:
- Analyzer initialization
- Basic analysis flow
- Error handling
- Syntax validation
"""

import pytest
from app.services.analyzer import CodeAnalyzer, validate_syntax


class TestCodeAnalyzerInitialization:
    """Test analyzer initialization"""
    
    def test_create_python_analyzer(self):
        """Should create analyzer for Python"""
        analyzer = CodeAnalyzer('python')
        assert analyzer.language == 'python'
        assert analyzer.code is None
    
    def test_create_java_analyzer(self):
        """Should create analyzer for Java"""
        analyzer = CodeAnalyzer('java')
        assert analyzer.language == 'java'
    
    def test_reject_unsupported_language(self):
        """Should raise error for unsupported language"""
        with pytest.raises(ValueError, match="Unsupported language"):
            CodeAnalyzer('javascript')


class TestCodeAnalysis:
    """Test code analysis functionality"""
    
    def test_analyze_simple_python_code(self):
        """Should analyze simple Python code without errors"""
        code = "def hello():\n    print('hi')"
        analyzer = CodeAnalyzer('python')
        
        result = analyzer.analyze(code)
        
        # Check result structure
        assert 'analysis_id' in result
        assert 'language' in result
        assert 'lines_of_code' in result
        assert 'clone_percentage' in result
        assert 'cyclomatic_complexity' in result
        assert 'maintainability_index' in result
        assert 'clones' in result
        assert 'refactoring_suggestions' in result
    
    def test_analyze_returns_correct_line_count(self):
        """Should count lines correctly"""
        code = "line1\nline2\nline3"
        analyzer = CodeAnalyzer('python')
        
        result = analyzer.analyze(code)
        
        assert result['lines_of_code'] == 3
    
    def test_analyze_empty_code_returns_zero_lines(self):
        """Should handle empty code"""
        analyzer = CodeAnalyzer('python')
        
        result = analyzer.analyze("")
        
        assert result['lines_of_code'] == 1  # Empty string splits to 1 line
    
    def test_analyze_sets_correct_language(self):
        """Should set language in result"""
        analyzer = CodeAnalyzer('java')
        
        result = analyzer.analyze("public class Test {}")
        
        assert result['language'] == 'java'


class TestSyntaxValidation:
    """Test syntax validation"""
    
    def test_valid_python_syntax(self):
        """Should accept valid Python code"""
        code = "def test():\n    return 1"
        assert validate_syntax(code, 'python') is True
    
    def test_invalid_python_syntax(self):
        """Should reject invalid Python syntax"""
        code = "def broken(\n    print('invalid')"
        
        with pytest.raises(SyntaxError):
            validate_syntax(code, 'python')
    
    def test_java_syntax_stub(self):
        """Java validation is stub (always returns True for now)"""
        code = "public class Test { invalid syntax }"
        assert validate_syntax(code, 'java') is True  # Stub returns True


class TestCloneDetection:
    """Test clone detection with TAHD pipeline"""
    
    def test_short_code_returns_no_clones(self):
        """Code without duplicate functions should have no clones"""
        code = "print(1)\nprint(2)"
        analyzer = CodeAnalyzer('python')
        
        result = analyzer.analyze(code)
        
        assert len(result['clones']) == 0
    
    def test_longer_code_may_have_clones(self):
        """Longer code may have clones"""
        code = "\n".join([f"line{i}" for i in range(20)])
        analyzer = CodeAnalyzer('python')
        
        result = analyzer.analyze(code)
        
        assert isinstance(result['clones'], list)

    def test_type1_exact_clone_detected(self):
        """Identical functions should be detected as Type 1 clone"""
        code = (
            "def add(a, b):\n"
            "    result = a + b\n"
            "    return result\n"
            "\n"
            "def add(a, b):\n"
            "    result = a + b\n"
            "    return result\n"
        )
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze(code)

        assert len(result['clones']) == 1
        assert result['clones'][0]['type'] == 1

    def test_type2_renamed_clone_detected(self):
        """Functions with renamed identifiers should be Type 2"""
        code = (
            "def add(a, b):\n"
            "    result = a + b\n"
            "    return result\n"
            "\n"
            "def sum_nums(x, y):\n"
            "    total = x + y\n"
            "    return total\n"
        )
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze(code)

        assert len(result['clones']) == 1
        assert result['clones'][0]['type'] == 2

    def test_no_clone_for_different_functions(self):
        """Structurally different functions should not be clones"""
        code = (
            "def add(a, b):\n"
            "    return a + b\n"
            "\n"
            "def greet(name):\n"
            "    print('hello ' + name)\n"
            "    print('welcome')\n"
            "    return name.upper()\n"
        )
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze(code)

        assert len(result['clones']) == 0


class TestNgramFix:
    """Test _make_ngrams edge cases"""

    def test_short_sequence_returns_single_tuple(self):
        """Tokens shorter than n should return set with one tuple"""
        from app.services.analyzer import _make_ngrams
        result = _make_ngrams(['a', 'b'], n=3)
        assert result == {('a', 'b')}

    def test_empty_sequence_returns_empty_set(self):
        """Empty token list should return empty set"""
        from app.services.analyzer import _make_ngrams
        result = _make_ngrams([], n=3)
        assert result == set()


class TestMetricsCalculation:
    """Test quality metrics (stub for now)"""
    
    def test_clone_percentage_in_valid_range(self):
        """Clone percentage should be 0-100"""
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze("print(1)")
        
        assert 0 <= result['clone_percentage'] <= 100
    
    def test_cyclomatic_complexity_positive(self):
        """Complexity should be positive"""
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze("print(1)")
        
        assert result['cyclomatic_complexity'] > 0
    
    def test_maintainability_index_in_range(self):
        """MI should be 0-100"""
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze("print(1)")
        
        assert 0 <= result['maintainability_index'] <= 100