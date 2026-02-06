"""
Tests for authentication endpoints

Tests cover:
- User registration
- User login
- Protected endpoints
- Input validation
"""

import pytest
from app import create_app
from app.models import db, User


@pytest.fixture
def app():
    """Create a test Flask application."""
    app = create_app()
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'  # in-memory
    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()


@pytest.fixture
def client(app):
    """Create a test client."""
    return app.test_client()


class TestRegistration:
    """Test user registration endpoint"""

    def test_register_success(self, client):
        """Should register a new user successfully"""
        response = client.post('/api/v1/auth/register', json={
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'password123',
            'full_name': 'Test User'
        })
        assert response.status_code == 201
        data = response.get_json()
        assert data['message'] == 'Registration successful'
        assert 'access_token' in data
        assert data['user']['username'] == 'testuser'

    def test_register_missing_fields(self, client):
        """Should reject registration with missing fields"""
        response = client.post('/api/v1/auth/register', json={
            'username': 'testuser'
        })
        assert response.status_code == 400

    def test_register_short_username(self, client):
        """Should reject short usernames"""
        response = client.post('/api/v1/auth/register', json={
            'username': 'ab',
            'email': 'test@example.com',
            'password': 'password123'
        })
        assert response.status_code == 400

    def test_register_short_password(self, client):
        """Should reject short passwords"""
        response = client.post('/api/v1/auth/register', json={
            'username': 'testuser',
            'email': 'test@example.com',
            'password': '123'
        })
        assert response.status_code == 400

    def test_register_duplicate_username(self, client):
        """Should reject duplicate usernames"""
        user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'password123'
        }
        client.post('/api/v1/auth/register', json=user_data)
        response = client.post('/api/v1/auth/register', json={
            'username': 'testuser',
            'email': 'other@example.com',
            'password': 'password123'
        })
        assert response.status_code == 409


class TestLogin:
    """Test user login endpoint"""

    def test_login_success(self, client):
        """Should login with valid credentials"""
        client.post('/api/v1/auth/register', json={
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'password123'
        })
        response = client.post('/api/v1/auth/login', json={
            'username': 'testuser',
            'password': 'password123'
        })
        assert response.status_code == 200
        data = response.get_json()
        assert data['message'] == 'Login successful'
        assert 'access_token' in data

    def test_login_wrong_password(self, client):
        """Should reject invalid password"""
        client.post('/api/v1/auth/register', json={
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'password123'
        })
        response = client.post('/api/v1/auth/login', json={
            'username': 'testuser',
            'password': 'wrongpassword'
        })
        assert response.status_code == 401

    def test_login_missing_fields(self, client):
        """Should reject login with missing fields"""
        response = client.post('/api/v1/auth/login', json={
            'username': 'testuser'
        })
        assert response.status_code == 400


class TestProtectedEndpoints:
    """Test JWT-protected endpoints"""

    def test_get_current_user(self, client):
        """Should return current user with valid token"""
        reg_response = client.post('/api/v1/auth/register', json={
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'password123'
        })
        token = reg_response.get_json()['access_token']
        response = client.get('/api/v1/auth/me', headers={
            'Authorization': f'Bearer {token}'
        })
        assert response.status_code == 200
        assert response.get_json()['user']['username'] == 'testuser'

    def test_me_without_token(self, client):
        """Should reject request without token"""
        response = client.get('/api/v1/auth/me')
        assert response.status_code == 401