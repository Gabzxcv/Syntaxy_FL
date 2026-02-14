"""
Custom exceptions for the Code Clone Detector API

These provide more specific error handling than generic Python exceptions
"""

class CodeCloneDetectorException(Exception):
    """Base exception for all application errors"""
    def __init__(self, message, status_code=500, details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class InvalidCodeException(CodeCloneDetectorException):
    """Raised when submitted code has syntax errors"""
    def __init__(self, message, details=None):
        super().__init__(message, status_code=400, details=details)


class UnsupportedLanguageException(CodeCloneDetectorException):
    """Raised when unsupported programming language is requested"""
    def __init__(self, language, details=None):
        message = f"Unsupported language: {language}"
        super().__init__(message, status_code=400, details=details)


class AnalysisException(CodeCloneDetectorException):
    """Raised when analysis process fails"""
    def __init__(self, message, details=None):
        super().__init__(message, status_code=500, details=details)


class ValidationException(Exception):
    """Raised when request validation fails."""
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message

    def __str__(self):
        return self.message