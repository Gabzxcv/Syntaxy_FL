# backend/app/api/auth.py (NEW FILE)
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, 
    jwt_required, 
    get_jwt_identity
)
from app.models import db, User, Analysis
from datetime import datetime, timezone

bp = Blueprint('auth', __name__)


@bp.route('/register', methods=['POST'])
def register():
    """
    Register a new user
    
    POST /api/v1/auth/register
    Body: {
        "username": "johndoe",
        "email": "john@example.com",
        "password": "securepass123",
        "full_name": "John Doe"  (optional)
    }
    """
    try:
        data = request.get_json()
        
        # Validation
        required_fields = ['username', 'email', 'password']
        if not data or not all(field in data for field in required_fields):
            return jsonify({
                'error': 'Missing required fields',
                'required': required_fields
            }), 400
        
        username = data['username'].strip().lower()
        email = data['email'].strip().lower()
        password = data['password']
        full_name = data.get('full_name', '').strip()
        
        # Validate username
        if len(username) < 3:
            return jsonify({'error': 'Username must be at least 3 characters'}), 400
        
        # Validate password
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        # Check if user exists
        if User.query.filter_by(username=username).first():
            return jsonify({'error': 'Username already taken'}), 409
        
        if User.query.filter_by(email=email).first():
            return jsonify({'error': 'Email already registered'}), 409
        
        # Create user
        user = User(
            username=username,
            email=email,
            full_name=full_name
        )
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        # Create access token
        access_token = create_access_token(identity=user.id)
        
        return jsonify({
            'message': 'Registration successful',
            'user': user.to_dict(),
            'access_token': access_token
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Registration failed', 'details': str(e)}), 500


@bp.route('/login', methods=['POST'])
def login():
    """
    Login user
    
    POST /api/v1/auth/login
    Body: {
        "username": "johndoe",
        "password": "securepass123"
    }
    """
    try:
        data = request.get_json()
        
        if not data or not all(k in data for k in ['username', 'password']):
            return jsonify({'error': 'Missing username or password'}), 400
        
        username = data['username'].strip().lower()
        password = data['password']
        
        # Find user
        user = User.query.filter_by(username=username).first()
        
        if not user or not user.check_password(password):
            return jsonify({'error': 'Invalid username or password'}), 401
        
        # Update last login
        user.last_login = datetime.now(timezone.utc)
        db.session.commit()
        
        # Create access token
        access_token = create_access_token(identity=user.id)
        
        return jsonify({
            'message': 'Login successful',
            'user': user.to_dict(),
            'access_token': access_token
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Login failed', 'details': str(e)}), 500


@bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """
    Logout user
    
    POST /api/v1/auth/logout
    Headers: Authorization: Bearer <token>
    
    Note: JWT tokens are stateless. Client should delete the token.
    """
    return jsonify({
        'message': 'Logout successful',
        'note': 'Please delete the token from client storage'
    }), 200


@bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """
    Get current user info
    
    GET /api/v1/auth/me
    Headers: Authorization: Bearer <token>
    """
    try:
        current_user_id = get_jwt_identity()
        user = db.session.get(User, current_user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({'user': user.to_dict()}), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get user', 'details': str(e)}), 500


@bp.route('/history', methods=['GET'])
@jwt_required()
def get_analysis_history():
    """
    Get user's analysis history
    
    GET /api/v1/auth/history?limit=10&offset=0
    Headers: Authorization: Bearer <token>
    """
    try:
        current_user_id = get_jwt_identity()
        user = db.session.get(User, current_user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Pagination
        limit = request.args.get('limit', 10, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        # Get analyses
        analyses_query = user.analyses.order_by(Analysis.created_at.desc())
        total = analyses_query.count()
        analyses = analyses_query.limit(limit).offset(offset).all()
        
        return jsonify({
            'analyses': [a.to_dict() for a in analyses],
            'total': total,
            'limit': limit,
            'offset': offset
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get history', 'details': str(e)}), 500


@bp.route('/history/<analysis_id>', methods=['GET'])
@jwt_required()
def get_analysis_detail(analysis_id):
    """
    Get detailed analysis by ID
    
    GET /api/v1/auth/history/<id>
    Headers: Authorization: Bearer <token>
    """
    try:
        current_user_id = get_jwt_identity()
        
        analysis = Analysis.query.filter_by(
            id=analysis_id,
            user_id=current_user_id
        ).first()
        
        if not analysis:
            return jsonify({'error': 'Analysis not found'}), 404
        
        return jsonify({
            'analysis': analysis.to_dict(include_code=True)
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get analysis', 'details': str(e)}), 500