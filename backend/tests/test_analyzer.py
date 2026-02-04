"""
Tests for CodeAnalyzer service
"""

import pytest
from backend.utils.analyzer import CodeAnalyzer
from backend.utils.exceptions import InvalidCodeException, AnalysisException


class TestCodeAnalyzer:
    """Tests for CodeAnalyzer"""
    
    def test_analyzer_initialization_python(self):
        """Should initialize analyzer for Python"""
        analyzer = CodeAnalyzer('python')
        
        assert analyzer.language == 'python'
    
    def test_analyzer_initialization_java(self):
        """Should initialize analyzer for Java"""
        analyzer = CodeAnalyzer('java')
        
        assert analyzer.language == 'java'
    
    def test_analyzer_unsupported_language(self):
        """Should raise exception for unsupported language"""
        with pytest.raises(AnalysisException):
            CodeAnalyzer('javascript')
    
    def test_analyze_valid_python_code(self):
        """Should analyze valid Python code"""
        analyzer = CodeAnalyzer('python')
        code = '''
def hello():
    print("hello")

def greet():
    print("hello")
'''
        
        result = analyzer.analyze(code)
        
        assert 'analysis_id' in result
        assert 'clones' in result
        assert 'refactoring_suggestions' in result
        assert result['language'] == 'python'
    
    def test_analyze_invalid_python_syntax(self):
        """Should raise InvalidCodeException for syntax errors"""
        analyzer = CodeAnalyzer('python')
        code = 'def broken( print("invalid")'
        
        with pytest.raises(InvalidCodeException):
            analyzer.analyze(code)
    
    def test_analyze_returns_metrics(self):
        """Should return code quality metrics"""
        analyzer = CodeAnalyzer('python')
        code = 'def test(): return 1'
        
        result = analyzer.analyze(code)
        
        assert 'clone_percentage' in result
        assert 'cyclomatic_complexity' in result
        assert 'maintainability_index' in result
        assert isinstance(result['clone_percentage'], (int, float))
    
    def test_analyze_returns_execution_time(self):
        """Should track analysis execution time"""
        analyzer = CodeAnalyzer('python')
        code = 'def test(): pass'
        
        result = analyzer.analyze(code)
        
        assert 'analysis_time_ms' in result
        assert result['analysis_time_ms'] > 0