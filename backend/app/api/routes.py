from flask import Blueprint, request, jsonify
import time
import uuid

# Create a Blueprint (a way to organize routes)
bp = Blueprint('api', __name__)

@bp.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint
    Tests if the API is running
    
    Usage:
        GET http://localhost:5000/api/v1/health
    
    Returns:
        {
            "status": "healthy",
            "version": "1.0.0",
            "timestamp": 1234567890.123
        }
    """
    return jsonify({
        'status': 'healthy',
        'version': '1.0.0',
        'timestamp': time.time()
    }), 200


@bp.route('/languages', methods=['GET'])
def get_languages():
    """
    Get list of supported programming languages
    
    Usage:
        GET http://localhost:5000/api/v1/languages
    
    Returns:
        {
            "languages": [
                {"code": "java", "name": "Java", "versions": ["8", "11", "17"]},
                {"code": "python", "name": "Python", "versions": ["3.7", "3.8", "3.9", "3.10", "3.11"]}
            ]
        }
    """
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
    """
    Analyze code for clones and quality metrics
    
    Usage:
        POST http://localhost:5000/api/v1/analyze
        Content-Type: application/json
        
        Body:
        {
            "code": "def hello():\n    print('hi')\n\ndef hello():\n    print('hi')",
            "language": "python"
        }
    
    Returns:
        {
            "analysis_id": "uuid",
            "clone_percentage": 22.5,
            "clones": [...],
            "refactoring_suggestions": [...]
        }
    """
    start_time = time.time()
    
    # Get JSON data from request body
    data = request.get_json()
    
    # Validate request
    if not data:
        return jsonify({
            'error': 'No JSON data provided',
            'details': 'Request body must be valid JSON'
        }), 400
    
    if 'code' not in data:
        return jsonify({
            'error': 'Missing required field: code',
            'details': 'Request must include "code" field with source code'
        }), 400
    
    if 'language' not in data:
        return jsonify({
            'error': 'Missing required field: language',
            'details': 'Request must include "language" field (java or python)'
        }), 400
    
    code = data['code']
    language = data['language']
    
    # Validate language
    if language not in ['java', 'python']:
        return jsonify({
            'error': f'Unsupported language: {language}',
            'details': 'Supported languages: java, python'
        }), 400
    
    # Validate code is not empty
    if not code or not code.strip():
        return jsonify({
            'error': 'Empty code provided',
            'details': 'Code field cannot be empty'
        }), 400
    
    try:
        # TODO: Replace with real analyzer
        # For now, return mock data so frontend can start working
        result = _mock_analyze(code, language)
        
        # Add execution time
        execution_time_ms = int((time.time() - start_time) * 1000)
        result['execution_time_ms'] = execution_time_ms
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({
            'error': 'Analysis failed',
            'details': str(e)
        }), 500


def _mock_analyze(code, language):
    """
    TEMPORARY: Mock analysis results
    TODO: Replace with real CodeAnalyzer implementation
    """
    import random
    
    # Count lines for basic clone percentage calculation
    lines = code.strip().split('\n')
    num_lines = len(lines)
    
    # Generate mock data
    return {
        'analysis_id': str(uuid.uuid4()),
        'clone_percentage': round(random.uniform(10.0, 35.0), 1),
        'cyclomatic_complexity': round(random.uniform(8.0, 20.0), 1),
        'maintainability_index': round(random.uniform(45.0, 80.0), 1),
        'clones': [
            {
                'clone_id': str(uuid.uuid4()),
                'type': 2,
                'similarity': 0.92,
                'locations': [
                    {'start_line': 1, 'end_line': 5},
                    {'start_line': 10, 'end_line': 14}
                ],
                'code_snippet': lines[0] if lines else ''
            }
        ],
        'refactoring_suggestions': [
            {
                'suggestion_id': str(uuid.uuid4()),
                'priority': 1,
                'priority_score': 0.87,
                'refactoring_type': 'Extract Method',
                'affected_clone_id': 'dummy-clone-id',
                'explanation': {
                    'remember': 'You have duplicated this code 2 times',
                    'understand': 'Code duplication makes bugs hard to fix because changes must be made in multiple places',
                    'apply': 'Extract this into a reusable method'
                },
                'before_code': 'if (score >= 90) { grade = "A"; }',
                'after_code': 'String calculateGrade(int score) {\n    if (score >= 90) return "A";\n    return "F";\n}'
            }
        ]
    }