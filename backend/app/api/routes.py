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

    if language not in ['java', 'python']:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    if not code or not code.strip():
        return jsonify({'error': 'Empty code provided'}), 400

    try:
        result = _mock_analyze(code, language)
        execution_time_ms = int((time.time() - start_time) * 1000)
        result['execution_time_ms'] = execution_time_ms
        result['comparative_mode'] = 'single_file_non_comparative'
        result['plagiarism_verdict_available'] = False
        result['analysis_scope'] = 'intra_submission_only'
        result['instructor_guidance'] = (
            'Single-file analysis highlights internal duplication and quality risks only. '
            'Use Batch/Class compare with multiple submissions for plagiarism evidence.'
        )

        if current_user_id:
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
    corpus_codes = data.get('corpus_codes')
    corpus_common_ngram_ratio = data.get('corpus_common_ngram_ratio', 0.60)
    confidence_floor = data.get('confidence_floor', 0.0)
    enable_pool_suppression = data.get('enable_pool_suppression', False)
    pool_confidence_floor = data.get('pool_confidence_floor', 0.0)
    pool_confidence_mode = data.get('pool_confidence_mode', 'max')
    auto_tune_filters = data.get('auto_tune_filters', False)

    if language not in ['java', 'python']:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    if not code_a or not code_a.strip():
        return jsonify({'error': 'Empty code_a provided'}), 400
    if not code_b or not code_b.strip():
        return jsonify({'error': 'Empty code_b provided'}), 400
    if corpus_codes is not None and not isinstance(corpus_codes, list):
        return jsonify({'error': 'corpus_codes must be a list of code strings'}), 400
    try:
        corpus_common_ngram_ratio = float(corpus_common_ngram_ratio)
    except (TypeError, ValueError):
        return jsonify({'error': 'corpus_common_ngram_ratio must be numeric'}), 400
    try:
        confidence_floor = float(confidence_floor)
    except (TypeError, ValueError):
        return jsonify({'error': 'confidence_floor must be numeric'}), 400
    if not 0.0 <= confidence_floor <= 1.0:
        return jsonify({'error': 'confidence_floor must be between 0.0 and 1.0'}), 400

    if not isinstance(enable_pool_suppression, bool):
        return jsonify({'error': 'enable_pool_suppression must be boolean'}), 400
    try:
        pool_confidence_floor = float(pool_confidence_floor)
    except (TypeError, ValueError):
        return jsonify({'error': 'pool_confidence_floor must be numeric'}), 400
    if not 0.0 <= pool_confidence_floor <= 1.0:
        return jsonify({'error': 'pool_confidence_floor must be between 0.0 and 1.0'}), 400
    if pool_confidence_mode not in ('max', 'mean'):
        return jsonify({'error': 'pool_confidence_mode must be one of [max, mean]'}), 400
    if not isinstance(auto_tune_filters, bool):
        return jsonify({'error': 'auto_tune_filters must be boolean'}), 400

    try:
        from app.services.analyzer import CodeAnalyzer
        analyzer = CodeAnalyzer(language)
        result = analyzer.analyze_pair(
            code_a,
            code_b,
            file_a,
            file_b,
            corpus_codes=corpus_codes,
            corpus_common_ngram_ratio=corpus_common_ngram_ratio,
            confidence_floor=confidence_floor,
            enable_pool_suppression=enable_pool_suppression,
            pool_confidence_floor=pool_confidence_floor,
            pool_confidence_mode=pool_confidence_mode,
            auto_tune_filters=auto_tune_filters,
        )
        result['execution_time_ms'] = int((time.time() - start_time) * 1000)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': 'Comparison failed', 'details': str(e)}), 500


@bp.route('/compare-batch', methods=['POST'])
@jwt_required(optional=True)
def compare_batch():
    """Compare all submission pairs in one request with shared corpus weighting."""
    start_time = time.time()
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400
    for field in ('language', 'submissions'):
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400

    language = data['language']
    submissions = data['submissions']
    corpus_common_ngram_ratio = data.get('corpus_common_ngram_ratio', 0.60)
    max_suggestions = data.get('max_suggestions', 5)
    confidence_floor = data.get('confidence_floor', 0.0)
    enable_pool_suppression = data.get('enable_pool_suppression', True)
    pool_confidence_floor = data.get('pool_confidence_floor', 0.0)
    pool_confidence_mode = data.get('pool_confidence_mode', 'max')
    auto_tune_filters = data.get('auto_tune_filters', True)

    if language not in ['java', 'python']:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    if not isinstance(submissions, list) or len(submissions) < 2:
        return jsonify({'error': 'submissions must be a list with at least two items'}), 400
    try:
        corpus_common_ngram_ratio = float(corpus_common_ngram_ratio)
    except (TypeError, ValueError):
        return jsonify({'error': 'corpus_common_ngram_ratio must be numeric'}), 400

    try:
        max_suggestions = int(max_suggestions)
    except (TypeError, ValueError):
        return jsonify({'error': 'max_suggestions must be an integer'}), 400
    try:
        confidence_floor = float(confidence_floor)
    except (TypeError, ValueError):
        return jsonify({'error': 'confidence_floor must be numeric'}), 400
    if not 0.0 <= confidence_floor <= 1.0:
        return jsonify({'error': 'confidence_floor must be between 0.0 and 1.0'}), 400

    if not isinstance(enable_pool_suppression, bool):
        return jsonify({'error': 'enable_pool_suppression must be boolean'}), 400
    try:
        pool_confidence_floor = float(pool_confidence_floor)
    except (TypeError, ValueError):
        return jsonify({'error': 'pool_confidence_floor must be numeric'}), 400
    if not 0.0 <= pool_confidence_floor <= 1.0:
        return jsonify({'error': 'pool_confidence_floor must be between 0.0 and 1.0'}), 400
    if pool_confidence_mode not in ('max', 'mean'):
        return jsonify({'error': 'pool_confidence_mode must be one of [max, mean]'}), 400
    if not isinstance(auto_tune_filters, bool):
        return jsonify({'error': 'auto_tune_filters must be boolean'}), 400

    try:
        from app.services.analyzer import CodeAnalyzer
        analyzer = CodeAnalyzer(language)
        result = analyzer.analyze_batch(
            submissions,
            max_suggestions=max_suggestions,
            corpus_common_ngram_ratio=corpus_common_ngram_ratio,
            confidence_floor=confidence_floor,
            enable_pool_suppression=enable_pool_suppression,
            pool_confidence_floor=pool_confidence_floor,
            pool_confidence_mode=pool_confidence_mode,
            auto_tune_filters=auto_tune_filters,
        )
        result['execution_time_ms'] = int((time.time() - start_time) * 1000)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': 'Batch comparison failed', 'details': str(e)}), 500