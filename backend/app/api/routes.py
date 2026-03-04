from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import db, Analysis
import time
import uuid

bp = Blueprint('api', __name__)


@bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'message': 'Code Clone Detector API is running'}), 200


@bp.route('/languages', methods=['GET'])
def get_languages():
    """List supported languages"""
    return jsonify({'languages': ['python', 'java']}), 200


@bp.route('/analyze', methods=['POST'])
@jwt_required(optional=True)
def analyze_code():
    start_time = time.time()
    current_user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400
    if 'code' not in data:
        return jsonify({'error': 'Missing required field: code'}), 400
    if 'language' not in data:
        return jsonify({'error': 'Missing required field: language'}), 400

    code = data['code']
    language = data['language']
    file_name = data.get('file_name')
    section_name = data.get('section_name')

    if language not in ['java', 'python']:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    if not code or not code.strip():
        return jsonify({'error': 'Empty code provided'}), 400

    try:
        result = _mock_analyze(code, language)
        execution_time_ms = int((time.time() - start_time) * 1000)
        result['execution_time_ms'] = execution_time_ms

        if current_user_id:
            analysis = Analysis(
                user_id=current_user_id,
                language=language,
                code=code,
                clone_percentage=result['clone_percentage'],
                cyclomatic_complexity=result['cyclomatic_complexity'],
                maintainability_index=result['maintainability_index'],
                execution_time_ms=execution_time_ms,
                file_name=file_name,
                section_name=section_name,
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
            db.session.rollback()
        return jsonify({'error': 'Analysis failed', 'details': str(e)}), 500


def _mock_analyze(code, language):
    from app.services.analyzer import CodeAnalyzer
    analyzer = CodeAnalyzer(language)
    return analyzer.analyze(code)


@bp.route('/compare', methods=['POST'])
@jwt_required(optional=True)
def compare_pair():
    """Compare two student submissions using the full TAHD pipeline."""
    start_time = time.time()
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400
    for field in ('code_a', 'code_b', 'language'):
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400

    code_a = data['code_a']
    code_b = data['code_b']
    language = data['language']
    file_a = data.get('file_a', 'submission_a')
    file_b = data.get('file_b', 'submission_b')

    if language not in ['java', 'python']:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    if not code_a or not code_a.strip():
        return jsonify({'error': 'Empty code_a provided'}), 400
    if not code_b or not code_b.strip():
        return jsonify({'error': 'Empty code_b provided'}), 400

    try:
        from app.services.analyzer import CodeAnalyzer
        analyzer = CodeAnalyzer(language)
        result = analyzer.analyze_pair(code_a, code_b, file_a, file_b)
        result['execution_time_ms'] = int((time.time() - start_time) * 1000)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': 'Comparison failed', 'details': str(e)}), 500