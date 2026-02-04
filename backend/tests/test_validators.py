"""
Tests for request validators
"""

import pytest
from app.utils.validators import AnalyzeRequestValidator
from app.utils.exceptions import ValidationException


class TestAnalyzeRequestValidator:
    """Tests for AnalyzeRequestValidator"""
    
    def test_valid_python_request(self):
        """Should accept valid Python request"""
        data = {
            'code': 'def hello():\n    print("hello")',
            'language': 'python'
        }
        
        result = AnalyzeRequestValidator.validate(data)
        
        assert result['code'] == data['code']
        assert result['language'] == 'python'
    
    def test_valid_java_request(self):
        """Should accept valid Java request"""
        data = {
            'code': 'public class Test { }',
            'language': 'java'
        }
        
        result = AnalyzeRequestValidator.validate(data)
        
        assert result['language'] == 'java'
    
    def test_missing_code_field(self):
        """Should raise ValidationException if code missing"""
        data = {'language': 'python'}
        
        with pytest.raises(ValidationException) as exc_info:
            AnalyzeRequestValidator.validate(data)
        
        assert 'code' in str(exc_info.value).lower()
    
    def test_missing_language_field(self):
        """Should raise ValidationException if language missing"""
        data = {'code': 'def test(): pass'}
        
        with pytest.raises(ValidationException) as exc_info:
            AnalyzeRequestValidator.validate(data)
        
        assert 'language' in str(exc_info.value).lower()
    
    def test_empty_code(self):
        """Should raise ValidationException for empty code"""
        data = {
            'code': '   ',
            'language': 'python'
        }
        
        with pytest.raises(ValidationException) as exc_info:
            AnalyzeRequestValidator.validate(data)
        
        assert 'empty' in str(exc_info.value).lower()
    
    def test_code_too_short(self):
        """Should raise ValidationException for very short code"""
        data = {
            'code': 'x=1',
            'language': 'python'
        }
        
        with pytest.raises(ValidationException) as exc_info:
            AnalyzeRequestValidator.validate(data)
        
        assert 'short' in str(exc_info.value).lower()
    
    def test_unsupported_language(self):
        """Should raise ValidationException for unsupported language"""
        data = {
            'code': 'console.log("test")',
            'language': 'javascript'
        }
        
        with pytest.raises(ValidationException) as exc_info:
            AnalyzeRequestValidator.validate(data)
        
        assert 'unsupported' in str(exc_info.value).lower()
    
    def test_language_case_insensitive(self):
        """Should accept language in any case"""
        data = {
            'code': 'def test(): pass',
            'language': 'PYTHON'
        }
        
        result = AnalyzeRequestValidator.validate(data)
        
        assert result['language'] == 'python'  # Should be lowercased