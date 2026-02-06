"""
Database models for Code Clone Detector
"""
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from datetime import datetime
import uuid

db = SQLAlchemy()
bcrypt = Bcrypt()


class User(db.Model):
    """User account model"""
    __tablename__ = 'users'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(120))
    role = db.Column(db.String(20), nullable=False, default='instructor')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    # Relationship to analyses
    analyses = db.relationship('Analysis', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    
    def set_password(self, password):
        """Hash and store password"""
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
    
    def check_password(self, password):
        """Verify password"""
        return bcrypt.check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        """Convert to JSON-serializable dict"""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'full_name': self.full_name,
            'role': self.role,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'total_analyses': self.analyses.count()
        }


class Analysis(db.Model):
    """Code analysis record"""
    __tablename__ = 'analyses'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Input data
    language = db.Column(db.String(20), nullable=False)
    code = db.Column(db.Text, nullable=False)
    
    # Analysis results
    clone_percentage = db.Column(db.Float)
    cyclomatic_complexity = db.Column(db.Float)
    maintainability_index = db.Column(db.Float)
    execution_time_ms = db.Column(db.Integer)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    def to_dict(self, include_code=False):
        """Convert to JSON-serializable dict"""
        result = {
            'id': self.id,
            'language': self.language,
            'clone_percentage': self.clone_percentage,
            'cyclomatic_complexity': self.cyclomatic_complexity,
            'maintainability_index': self.maintainability_index,
            'execution_time_ms': self.execution_time_ms,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        
        if include_code:
            result['code'] = self.code
            
        return result


class Section(db.Model):
    """Class section model"""
    __tablename__ = 'sections'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(200), nullable=False)
    instructor_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    students = db.relationship('Student', backref='section', lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'instructor_id': self.instructor_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'students': [s.to_dict() for s in self.students],
        }


class Student(db.Model):
    """Student record within a section"""
    __tablename__ = 'students'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    section_id = db.Column(db.String(36), db.ForeignKey('sections.id'), nullable=False, index=True)
    submissions = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'section_id': self.section_id,
            'submissions': self.submissions,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class UploadedFile(db.Model):
    """Uploaded file metadata"""
    __tablename__ = 'uploaded_files'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    size = db.Column(db.Integer, nullable=False)
    file_type = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, include_content=False):
        result = {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'size': self.size,
            'file_type': self.file_type,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_content:
            result['content'] = self.content
        return result


class HistoryEntry(db.Model):
    """Activity history record"""
    __tablename__ = 'history_entries'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    entry_type = db.Column(db.String(20), nullable=False)  # analysis, upload, refactoring
    description = db.Column(db.String(500), nullable=False)
    status = db.Column(db.String(20), default='success')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.entry_type,
            'description': self.description,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }