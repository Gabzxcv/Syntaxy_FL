from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
import os

load_dotenv()

def create_app():
    app = Flask(__name__)

    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///code_clone_detector.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = 86400 * 7

    from app.models import db, bcrypt
    db.init_app(app)
    bcrypt.init_app(app)
    jwt = JWTManager(app)
<<<<<<< HEAD

    # CORS — allow GitHub Pages AND localhost for development
    CORS(app, origins=["http://localhost:3000", "http://localhost:5173", "https://syntaxy-fl.onrender.com"])

=======
    
    # Enable CORS
    CORS(app, origins=["http://localhost:3000", "http://localhost:5173", "https://gabzxcv.github.io"])
    
    # Create database tables
>>>>>>> 34c1aeda1a53b1765a6fa55ea61b9904d7f71747
    with app.app_context():
        db.create_all()
        print("✅ Database initialized")

    from app.api import routes, auth
    app.register_blueprint(routes.bp, url_prefix='/api/v1')
    app.register_blueprint(auth.bp, url_prefix='/api/v1/auth')

    return app