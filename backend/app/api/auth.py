# backend/app/api/auth.py (NEW FILE)
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, 
    jwt_required, 
    get_jwt_identity
)
from app.models import db, User, Analysis, Section, Student, HistoryEntry, UploadedFile
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
        "full_name": "John Doe"  (optional),
        "role": "instructor" (optional, defaults to instructor)
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
        role = data.get('role', 'instructor').strip().lower()
        
        # Validate role (admin accounts cannot be created via registration)
        if role not in ('instructor', 'student'):
            role = 'instructor'
        
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
            full_name=full_name,
            role=role
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


@bp.route('/me', methods=['PUT'])
@jwt_required()
def update_current_user():
    """Update current user's account info"""
    try:
        current_user_id = get_jwt_identity()
        user = db.session.get(User, current_user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        if 'full_name' in data:
            user.full_name = data['full_name'].strip()
        if 'email' in data:
            new_email = data['email'].strip().lower()
            existing = User.query.filter(User.email == new_email, User.id != user.id).first()
            if existing:
                return jsonify({'error': 'Email already in use'}), 409
            user.email = new_email

        db.session.commit()
        return jsonify({'message': 'Account updated', 'user': user.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Update failed', 'details': str(e)}), 500


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


# ===== SECTIONS ENDPOINTS =====

@bp.route('/sections', methods=['GET'])
@jwt_required()
def get_sections():
    """Get all sections for the current instructor"""
    try:
        current_user_id = get_jwt_identity()
        sections = Section.query.filter_by(instructor_id=current_user_id).all()
        return jsonify({'sections': [s.to_dict() for s in sections]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/sections', methods=['POST'])
@jwt_required()
def create_section():
    """Create a new section"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        if not data or not data.get('name'):
            return jsonify({'error': 'Section name is required'}), 400

        section = Section(name=data['name'].strip(), instructor_id=current_user_id)
        db.session.add(section)
        db.session.commit()
        return jsonify({'section': section.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/sections/<section_id>', methods=['DELETE'])
@jwt_required()
def delete_section(section_id):
    """Delete a section"""
    try:
        current_user_id = get_jwt_identity()
        section = Section.query.filter_by(id=section_id, instructor_id=current_user_id).first()
        if not section:
            return jsonify({'error': 'Section not found'}), 404
        db.session.delete(section)
        db.session.commit()
        return jsonify({'message': 'Section deleted'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ===== STUDENTS ENDPOINTS =====

@bp.route('/sections/<section_id>/students', methods=['POST'])
@jwt_required()
def add_student(section_id):
    """Add a student to a section"""
    try:
        current_user_id = get_jwt_identity()
        section = Section.query.filter_by(id=section_id, instructor_id=current_user_id).first()
        if not section:
            return jsonify({'error': 'Section not found'}), 404

        data = request.get_json()
        if not data or not data.get('name') or not data.get('email'):
            return jsonify({'error': 'Name and email are required'}), 400

        student = Student(
            name=data['name'].strip(),
            email=data['email'].strip(),
            section_id=section_id
        )
        db.session.add(student)
        db.session.commit()
        return jsonify({'student': student.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/students/<student_id>', methods=['DELETE'])
@jwt_required()
def delete_student(student_id):
    """Delete a student"""
    try:
        student = Student.query.get(student_id)
        if not student:
            return jsonify({'error': 'Student not found'}), 404
        db.session.delete(student)
        db.session.commit()
        return jsonify({'message': 'Student deleted'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ===== ACTIVITY HISTORY ENDPOINTS =====

@bp.route('/activity', methods=['GET'])
@jwt_required()
def get_activity():
    """Get activity history"""
    try:
        current_user_id = get_jwt_identity()
        limit = request.args.get('limit', 50, type=int)
        entries = HistoryEntry.query.filter_by(user_id=current_user_id)\
            .order_by(HistoryEntry.created_at.desc()).limit(limit).all()
        return jsonify({'history': [e.to_dict() for e in entries]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/activity', methods=['POST'])
@jwt_required()
def add_activity():
    """Add an activity history entry"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        if not data or not data.get('type') or not data.get('description'):
            return jsonify({'error': 'Type and description are required'}), 400

        entry = HistoryEntry(
            user_id=current_user_id,
            entry_type=data['type'],
            description=data['description'],
            status=data.get('status', 'success')
        )
        db.session.add(entry)
        db.session.commit()
        return jsonify({'entry': entry.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ===== FILE METADATA ENDPOINTS =====

@bp.route('/files', methods=['GET'])
@jwt_required()
def get_files():
    """Get all uploaded files for the current user"""
    try:
        current_user_id = get_jwt_identity()
        files = UploadedFile.query.filter_by(user_id=current_user_id)\
            .order_by(UploadedFile.created_at.desc()).all()
        return jsonify({'files': [f.to_dict() for f in files]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/files', methods=['POST'])
@jwt_required()
def upload_file_meta():
    """Save uploaded file metadata + content"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        if not data or not data.get('name'):
            return jsonify({'error': 'File name is required'}), 400

        uploaded = UploadedFile(
            user_id=current_user_id,
            name=data['name'],
            size=data.get('size', 0),
            file_type=data.get('file_type', 'text'),
            content=data.get('content', '')
        )
        db.session.add(uploaded)
        db.session.commit()
        return jsonify({'file': uploaded.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/files/<file_id>', methods=['GET'])
@jwt_required()
def get_file(file_id):
    """Get a file's content for scanning"""
    try:
        current_user_id = get_jwt_identity()
        f = UploadedFile.query.filter_by(id=file_id, user_id=current_user_id).first()
        if not f:
            return jsonify({'error': 'File not found'}), 404
        return jsonify({'file': f.to_dict(include_content=True)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/files/<file_id>', methods=['DELETE'])
@jwt_required()
def delete_file(file_id):
    """Delete a file"""
    try:
        current_user_id = get_jwt_identity()
        f = UploadedFile.query.filter_by(id=file_id, user_id=current_user_id).first()
        if not f:
            return jsonify({'error': 'File not found'}), 404
        db.session.delete(f)
        db.session.commit()
        return jsonify({'message': 'File deleted'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ===== ADMIN ENDPOINTS =====

@bp.route('/admin/users', methods=['GET'])
@jwt_required()
def admin_list_users():
    """Admin: list all users"""
    try:
        current_user_id = get_jwt_identity()
        user = db.session.get(User, current_user_id)
        if not user or user.role != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        users = User.query.all()
        return jsonify({'users': [u.to_dict() for u in users]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/registered-students', methods=['GET'])
@jwt_required()
def list_registered_students():
    """List all registered student accounts - available to instructors and admins"""
    try:
        current_user_id = get_jwt_identity()
        user = db.session.get(User, current_user_id)
        if not user or user.role not in ('admin', 'instructor'):
            return jsonify({'error': 'Instructor or admin access required'}), 403
        students = User.query.filter_by(role='student').all()
        return jsonify({'users': [u.to_dict() for u in students]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/change-password', methods=['PUT'])
@jwt_required()
def change_password():
    """Change current user's password"""
    try:
        current_user_id = get_jwt_identity()
        user = db.session.get(User, current_user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json()
        if not data or not data.get('current_password') or not data.get('new_password'):
            return jsonify({'error': 'Current password and new password are required'}), 400

        if not user.check_password(data['current_password']):
            return jsonify({'error': 'Current password is incorrect'}), 401

        if len(data['new_password']) < 6:
            return jsonify({'error': 'New password must be at least 6 characters'}), 400

        user.set_password(data['new_password'])
        db.session.commit()
        return jsonify({'message': 'Password changed successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Password change failed', 'details': str(e)}), 500


@bp.route('/admin/users/<user_id>', methods=['DELETE'])
@jwt_required()
def admin_delete_user(user_id):
    """Admin: delete a user account"""
    try:
        current_user_id = get_jwt_identity()
        admin = db.session.get(User, current_user_id)
        if not admin or admin.role != 'admin':
            return jsonify({'error': 'Admin access required'}), 403

        if user_id == current_user_id:
            return jsonify({'error': 'Cannot delete your own account'}), 400

        target = db.session.get(User, user_id)
        if not target:
            return jsonify({'error': 'User not found'}), 404

        db.session.delete(target)
        db.session.commit()
        return jsonify({'message': f'User {target.username} deleted'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/admin/users/<user_id>/role', methods=['PUT'])
@jwt_required()
def admin_change_role(user_id):
    """Admin: change a user's role"""
    try:
        current_user_id = get_jwt_identity()
        admin = db.session.get(User, current_user_id)
        if not admin or admin.role != 'admin':
            return jsonify({'error': 'Admin access required'}), 403

        data = request.get_json()
        if not data or not data.get('role'):
            return jsonify({'error': 'Role is required'}), 400

        new_role = data['role'].strip().lower()
        if new_role not in ('student', 'instructor', 'admin'):
            return jsonify({'error': 'Invalid role'}), 400

        target = db.session.get(User, user_id)
        if not target:
            return jsonify({'error': 'User not found'}), 404

        target.role = new_role
        db.session.commit()
        return jsonify({'message': f'Role updated to {new_role}', 'user': target.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/admin/theme', methods=['GET'])
def get_theme():
    """Get the global UI theme color (public endpoint)"""
    try:
        import json, os
        theme_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'theme.json')
        if os.path.exists(theme_file):
            with open(theme_file, 'r') as f:
                data = json.load(f)
                return jsonify(data), 200
        return jsonify({'accentColor': '#6366f1'}), 200
    except Exception:
        return jsonify({'accentColor': '#6366f1'}), 200


@bp.route('/admin/theme', methods=['PUT'])
@jwt_required()
def set_theme():
    """Admin: set the global UI theme color"""
    try:
        current_user_id = get_jwt_identity()
        admin = db.session.get(User, current_user_id)
        if not admin or admin.role != 'admin':
            return jsonify({'error': 'Admin access required'}), 403

        data = request.get_json()
        if not data or not data.get('accentColor'):
            return jsonify({'error': 'accentColor is required'}), 400

        import json, os, re
        color = data['accentColor'].strip()
        if not re.match(r'^#[0-9a-fA-F]{6}$', color):
            return jsonify({'error': 'Invalid color format'}), 400

        theme_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'theme.json')
        with open(theme_file, 'w') as f:
            json.dump({'accentColor': color}, f)

        return jsonify({'message': 'Theme updated', 'accentColor': color}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500