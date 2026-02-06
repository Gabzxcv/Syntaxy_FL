# backend/app/models/__init__.py
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from datetime import datetime, timezone
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
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_login = db.Column(db.DateTime)
    
    # Relationships
    analyses = db.relationship('Analysis', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
    
    def check_password(self, password):
        """Verify password"""
        return bcrypt.check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'full_name': self.full_name,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'total_analyses': self.analyses.count()
        }


class Analysis(db.Model):
    """Code analysis record"""
    __tablename__ = 'analyses'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    
    # Input data
    language = db.Column(db.String(20), nullable=False)
    code = db.Column(db.Text, nullable=False)
    
    # Results
    clone_percentage = db.Column(db.Float)
    cyclomatic_complexity = db.Column(db.Float)
    maintainability_index = db.Column(db.Float)
    execution_time_ms = db.Column(db.Integer)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    
    # Stored JSON results
    clones_json = db.Column(db.Text)  # Store full clone data as JSON
    suggestions_json = db.Column(db.Text)  # Store suggestions as JSON
    
    def to_dict(self, include_code=False):
        """Convert to dictionary"""
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