from flask import Blueprint, request, jsonify
from app.api.errors import ValidationError, AnalysisError
from app.services.analyzer import CodeAnalyzer, validate_syntax
import time
import uuid
import random

# Create a Blueprint
bp = Blueprint('api', __name__)

@bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'version': '1.0.0',
        'timestamp': time.time()
    }), 200


@bp.route('/languages', methods=['GET'])
def get_languages():
    """Get list of supported programming languages"""
    return jsonify({
        'languages': [
            {
                'code': 'java',
                'name': 'Java',
                'versions': ['8', '11', '17']
            },
            {
                'code': 'python',
                'name': 'Python',
                'versions': ['3.7', '3.8', '3.9', '3.10', '3.11']
            }
        ]
    }), 200


@bp.route('/analyze', methods=['POST'])
def analyze_code():
    """Analyze code for clones and quality metrics"""
    start_time = time.time()

    data = request.get_json()
    if not data:
        return jsonify({
            'error': 'No JSON data provided',
            'details': 'Request body must be valid JSON'
        }), 400

    # Required fields
    code = data.get('code')
    language = data.get('language')

    # Optional fields
    user_id = data.get('user_id')
    assignment_id = data.get('assignment_id')

    if not code or not code.strip():
        return jsonify({
            'error': 'Missing required field: code',
            'details': 'Request must include "code" field with source code'
        }), 400

    if not language:
        return jsonify({
            'error': 'Missing required field: language',
            'details': 'Request must include "language" field (java or python)'
        }), 400

    if language not in ['java', 'python']:
        return jsonify({
            'error': f'Unsupported language: {language}',
            'details': 'Supported languages: java, python'
        }), 400

    try:
        # Validate syntax first (validate_syntax should raise SyntaxError if invalid)
        validate_syntax(code, language)

        # Create analyzer and run analysis
        analyzer = CodeAnalyzer(language)
        result = analyzer.analyze(code)

        # Add metadata
        result['execution_time_ms'] = int((time.time() - start_time) * 1000)
        if user_id:
            result['user_id'] = user_id
        if assignment_id:
            result['assignment_id'] = assignment_id

        return jsonify(result), 200

    except SyntaxError as e:
        return jsonify({
            'error': 'Syntax error in code',
            'details': str(e)
        }), 400
    except ValidationError as e:
        # If you have a ValidationError class, return its message
        return jsonify({
            'error': 'Validation error',
            'details': str(e)
        }), getattr(e, 'status_code', 400)
    except Exception as e:
        return jsonify({
            'error': 'Analysis failed',
            'details': f'Unexpected error: {str(e)}'
        }), 500