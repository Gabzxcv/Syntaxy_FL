from flask import Flask
from flask_cors import CORS
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
    app.config['DEBUG'] = os.getenv('FLASK_ENV') == 'development'
    
    # Enable CORS (Cross-Origin Resource Sharing)
    # This allows React (running on localhost:3000) to call our API
    CORS(app, origins=["http://localhost:3000", "http://localhost:5173"])
    
    # Register blueprints (routes)
    from app.api import routes
    app.register_blueprint(routes.bp, url_prefix='/api/v1')
    
    return app