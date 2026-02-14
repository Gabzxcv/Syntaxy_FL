from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import time
import uuid

bp = Blueprint('api', __name__)

# ... keep existing health and languages endpoints ...

@bp.route('/analyze', methods=['POST'])
@jwt_required(optional=True)  # Optional auth
def analyze_code():
    """
    Analyze code (auth optional - saves to DB if logged in)
    """
    start_time = time.time()
    
    # Get current user if authenticated
    current_user_id = get_jwt_identity()
    
    # Validation (keep existing code)
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400
    
    if 'code' not in data:
        return jsonify({'error': 'Missing required field: code'}), 400
    
    if 'language' not in data:
        return jsonify({'error': 'Missing required field: language'}), 400
    
    code = data['code']
    language = data['language']
    
    if language not in ['java', 'python']:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    
    if not code or not code.strip():
        return jsonify({'error': 'Empty code provided'}), 400
    
    try:
        # Analyze code (still mock)
        result = _mock_analyze(code, language)
        
        # Add execution time
        execution_time_ms = int((time.time() - start_time) * 1000)
        result['execution_time_ms'] = execution_time_ms
        
        # Save to database if authenticated
        if current_user_id:
            from app.models import db, Analysis
            
            analysis = Analysis(
                user_id=current_user_id,
                language=language,
                code=code,
                clone_percentage=result['clone_percentage'],
                cyclomatic_complexity=result['cyclomatic_complexity'],
                maintainability_index=result['maintainability_index'],
                execution_time_ms=execution_time_ms
            )
            
            db.session.add(analysis)
            db.session.commit()
            
            result['analysis_id'] = analysis.id
            result['saved'] = True
        else:
            result['analysis_id'] = str(uuid.uuid4())
            result['saved'] = False
        
        return jsonify(result), 200
        
    except Exception as e:
        if current_user_id:
            from app.models import db
            db.session.rollback()
        return jsonify({'error': 'Analysis failed', 'details': str(e)}), 500


def _mock_analyze(code, language):
    """Generate mock analysis results using the CodeAnalyzer service."""
    from app.services.analyzer import CodeAnalyzer
    analyzer = CodeAnalyzer(language)
    return analyzer.analyze(code)