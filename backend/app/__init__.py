from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

def create_app():
    """
    Application factory pattern
    Creates and configures the Flask app
    """
    app = Flask(__name__)
    
    # Configuration
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', app.config['SECRET_KEY'])
    app.config['DEBUG'] = os.getenv('FLASK_ENV') == 'development'
    
    # Database configuration
    basedir = os.path.abspath(os.path.dirname(__file__))
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
        'DATABASE_URL',
        'sqlite:///' + os.path.join(basedir, '..', 'app.db')
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Enable CORS (Cross-Origin Resource Sharing)
    # This allows React (running on localhost:3000) to call our API
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    
    # Initialize extensions
    from app.models import db, bcrypt
    db.init_app(app)
    bcrypt.init_app(app)
    JWTManager(app)
    
    # Create database tables
    with app.app_context():
        db.create_all()
    
    # Register blueprints (routes)
    from app.api import routes
    from app.api import auth
    app.register_blueprint(routes.bp, url_prefix='/api/v1')
    app.register_blueprint(auth.bp, url_prefix='/api/v1/auth')
    
    return app