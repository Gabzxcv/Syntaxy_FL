from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
import os

load_dotenv()

def create_app():
    """
    Application factory pattern
    Creates and configures the Flask app
    """
    app = Flask(__name__)
    
    # Configuration
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///code_clone_detector.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = 86400 * 7  # 7 days
    
    # Initialize extensions
    from app.models import db, bcrypt
    db.init_app(app)
    bcrypt.init_app(app)
    jwt = JWTManager(app)
    
    # Enable CORS
    CORS(app, origins=["http://localhost:3000", "http://localhost:5173"])
    
    # Create database tables
    with app.app_context():
        db.create_all()
        print("✅ Database initialized")
    
    # Register blueprints
    from app.api import routes, auth
    app.register_blueprint(routes.bp, url_prefix='/api/v1')
    app.register_blueprint(auth.bp, url_prefix='/api/v1/auth')
    
    return app