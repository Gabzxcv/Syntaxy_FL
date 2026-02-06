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
    
    # Create database tables, migrate schema, and seed admin account
    with app.app_context():
        db.create_all()
        _migrate_db(db)
        _seed_admin(db, bcrypt)
    
    # Register error handlers
    from app.api.errors import register_error_handlers
    register_error_handlers(app)
    
    # Register blueprints (routes)
    from app.api import routes
    from app.api import auth
    app.register_blueprint(routes.bp, url_prefix='/api/v1')
    app.register_blueprint(auth.bp, url_prefix='/api/v1/auth')
    
    return app


def _seed_admin(db, bcrypt):
    """Create the default admin account if it doesn't exist."""
    from app.models import User
    if not User.query.filter_by(username='admin').first():
        admin = User(
            username='admin',
            email='admin@codeclonedetector.local',
            full_name='Administrator',
            role='admin'
        )
        admin.set_password('admin')
        db.session.add(admin)
        db.session.commit()


def _migrate_db(db):
    """Add any missing columns to existing database tables.

    SQLAlchemy's ``create_all`` only creates tables that do not exist; it
    does not add new columns to tables that already exist. This helper
    inspects each table and runs ``ALTER TABLE ... ADD COLUMN`` for any
    column that is missing, preventing the ``no such column`` error when
    the schema evolves.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(db.engine)
    metadata = db.metadata

    for table_name, table in metadata.tables.items():
        if not inspector.has_table(table_name):
            continue

        existing_cols = {c['name'] for c in inspector.get_columns(table_name)}

        for column in table.columns:
            if column.name in existing_cols:
                continue

            # Build a portable column type string
            col_type = column.type.compile(dialect=db.engine.dialect)

            # Determine a sensible DEFAULT for the ALTER statement
            default_clause = ''
            if column.default is not None:
                default_val = column.default.arg
                if callable(default_val):
                    # For callable defaults (uuid, datetime) use a safe
                    # literal; the ORM will supply the real value later.
                    if isinstance(column.type, db.String):
                        default_val = ''
                    else:
                        default_val = None
                if default_val is not None:
                    if isinstance(column.type, (db.Integer, db.Float)):
                        default_clause = f" DEFAULT {default_val}"
                    else:
                        default_clause = f" DEFAULT '{default_val}'"

            nullable = '' if column.nullable else ' NOT NULL'
            # SQLite requires a default when adding a NOT NULL column
            if nullable and not default_clause:
                if isinstance(column.type, db.String):
                    default_clause = " DEFAULT ''"
                elif isinstance(column.type, db.Integer):
                    default_clause = " DEFAULT 0"
                else:
                    default_clause = " DEFAULT ''"

            stmt = f'ALTER TABLE {table_name} ADD COLUMN {column.name} {col_type}{nullable}{default_clause}'
            db.session.execute(text(stmt))

    db.session.commit()