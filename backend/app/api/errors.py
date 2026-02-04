"""
Custom error handlers for the API
Provides consistent error response format
"""

from flask import jsonify
from werkzeug.exceptions import HTTPException


class APIError(Exception):
    """Base class for API errors"""
    status_code = 400
    
    def __init__(self, message, status_code=None, details=None):
        super().__init__()
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.details = details
    
    def to_dict(self):
        """Convert error to JSON-serializable dict"""
        rv = {
            'error': self.message
        }
        if self.details:
            rv['details'] = self.details
        return rv


class ValidationError(APIError):
    """Raised when request validation fails"""
    status_code = 400


class AnalysisError(APIError):
    """Raised when code analysis fails"""
    status_code = 500


def register_error_handlers(app):
    """Register error handlers with Flask app"""
    
    @app.errorhandler(APIError)
    def handle_api_error(error):
        """Handle custom API errors"""
        response = jsonify(error.to_dict())
        response.status_code = error.status_code
        return response
    
    @app.errorhandler(404)
    def handle_not_found(error):
        """Handle 404 errors"""
        return jsonify({
            'error': 'Endpoint not found',
            'details': 'The requested URL was not found on the server'
        }), 404
    
    @app.errorhandler(405)
    def handle_method_not_allowed(error):
        """Handle 405 errors"""
        return jsonify({
            'error': 'Method not allowed',
            'details': 'The method is not allowed for the requested URL'
        }), 405
    
    @app.errorhandler(500)
    def handle_internal_error(error):
        """Handle 500 errors"""
        return jsonify({
            'error': 'Internal server error',
            'details': 'An unexpected error occurred'
        }), 500