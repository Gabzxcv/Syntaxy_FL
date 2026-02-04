from flask import Blueprint, request, jsonify
from app.api.errors import ValidationError, AnalysisError
import time
import uuid

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


from flask import Blueprint, request, jsonify
from app.api.errors import ValidationError, AnalysisError
from app.services.analyzer import CodeAnalyzer, validate_syntax
import time

# ... (keep existing code) ...

@bp.route('/analyze', methods=['POST'])
def analyze_code():
    """Analyze code for clones and quality metrics"""
    start_time = time.time()
    
    # ... (keep existing validation code) ...
    
    try:
        # Validate syntax first
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
        raise AnalysisError(
            'Syntax error in code',
            status_code=400,
            details=str(e)
        )
    except Exception as e:
        raise AnalysisError(
            'Analysis failed',
            details=f'Unexpected error: {str(e)}'
        )

# ========== SERVICES/ANALYZER.PY ==========

def _generate_mock_clones(num_lines):
    """Generate mock clone data"""
    if num_lines < 10:
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
            'code_snippet': 'Mock code snippet here...'
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