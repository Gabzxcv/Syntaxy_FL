from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
import os
import sys

load_dotenv()

def create_app():
    app = Flask(__name__)

    flask_env = os.getenv('FLASK_ENV', 'development')

    secret_key = os.getenv('SECRET_KEY')
    jwt_secret_key = os.getenv('JWT_SECRET_KEY')

    if flask_env == 'production':
        if not secret_key:
            sys.exit("FATAL: SECRET_KEY env variable is not set!")
        if not jwt_secret_key:
            sys.exit("FATAL: JWT_SECRET_KEY env variable is not set!")

    app.config['SECRET_KEY'] = secret_key or 'dev-secret-key-change-in-production'
    # SQLAlchemy 2.x requires 'postgresql://' — Render still provides 'postgres://' so we fix it here
    _db_url = os.getenv('DATABASE_URL', 'sqlite:///code_clone_detector.db')
    if _db_url.startswith('postgres://'):
        _db_url = _db_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = _db_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = jwt_secret_key or 'jwt-secret-key-change-in-production'
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = 86400 * 7
    app.config['JWT_BLOCKLIST_ENABLED'] = True
    app.config['JWT_BLOCKLIST_TOKEN_CHECKS'] = ['access']

    from app.models import db, bcrypt
    db.init_app(app)
    bcrypt.init_app(app)
    jwt = JWTManager(app)

    from app.extensions import limiter
    limiter.init_app(app)

    from app.models import RevokedToken

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload['jti']
        return db.session.query(RevokedToken.id).filter_by(jti=jti).first() is not None

    # CORS — allow GitHub Pages, Render, and localhost for development
    CORS(app, origins=[
        "http://localhost:3000", 
        "http://localhost:5173", 
        "https://gabzxcv.github.io", 
        "https://syntaxy-fl.onrender.com"
    ])

    with app.app_context():
        db.create_all()
        print("[OK] Database initialized")

    from app.api import routes, auth
    from app.api.errors import register_error_handlers
    app.register_blueprint(routes.bp, url_prefix='/api/v1')
    app.register_blueprint(auth.bp, url_prefix='/api/v1/auth')
    register_error_handlers(app)

    return app