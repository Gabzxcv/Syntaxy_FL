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
            'password': 'Password1',
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
            'password': 'Password1'
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

    def test_register_invalid_username_format(self, client):
        """Should reject usernames with invalid characters"""
        response = client.post('/api/v1/auth/register', json={
            'username': 'test user!',
            'email': 'test@example.com',
            'password': 'password123'
        })
        assert response.status_code == 400
        assert 'Username' in response.get_json()['error']

    def test_register_username_too_long(self, client):
        """Should reject usernames longer than 30 characters"""
        response = client.post('/api/v1/auth/register', json={
            'username': 'a' * 31,
            'email': 'test@example.com',
            'password': 'password123'
        })
        assert response.status_code == 400

    def test_register_invalid_email(self, client):
        """Should reject obviously invalid email addresses"""
        response = client.post('/api/v1/auth/register', json={
            'username': 'testuser',
            'email': 'not-an-email',
            'password': 'password123'
        })
        assert response.status_code == 400
        assert 'email' in response.get_json()['error'].lower()

    def test_register_duplicate_username(self, client):
        """Should reject duplicate usernames"""
        user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'Password1'
        }
        client.post('/api/v1/auth/register', json=user_data)
        response = client.post('/api/v1/auth/register', json={
            'username': 'testuser',
            'email': 'other@example.com',
            'password': 'Password1'
        })
        assert response.status_code == 409


class TestLogin:
    """Test user login endpoint"""

    def test_login_success(self, client):
        """Should login with valid credentials"""
        client.post('/api/v1/auth/register', json={
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'Password1'
        })
        response = client.post('/api/v1/auth/login', json={
            'username': 'testuser',
            'password': 'Password1'
        })
        assert response.status_code == 200
        data = response.get_json()
        assert data['message'] == 'Login successful'
        assert 'access_token' in data

    def test_login_with_email(self, client):
        """Should login using email address instead of username"""
        client.post('/api/v1/auth/register', json={
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'Password1'
        })
        response = client.post('/api/v1/auth/login', json={
            'username': 'test@example.com',
            'password': 'Password1'
        })
        assert response.status_code == 200
        data = response.get_json()
        assert data['message'] == 'Login successful'
        assert 'access_token' in data

    def test_login_case_insensitive_username(self, client, app):
        """Old accounts stored with mixed-case username should still be able to login"""
        # Simulate an old account stored with mixed-case username (e.g. 'Allen')
        with app.app_context():
            user = User(username='Allen', email='allen@example.com', role='instructor')
            user.set_password('11111')
            db.session.add(user)
            db.session.commit()
        # Login should succeed regardless of the case the user types
        for typed_username in ['Allen', 'allen', 'ALLEN']:
            response = client.post('/api/v1/auth/login', json={
                'username': typed_username,
                'password': '11111'
            })
            assert response.status_code == 200, f"Login failed for username '{typed_username}'"
            assert response.get_json()['message'] == 'Login successful'

    def test_login_wrong_password(self, client):
        """Should reject invalid password"""
        client.post('/api/v1/auth/register', json={
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'Password1'
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
            'password': 'Password1'
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

    def test_logout_revokes_token(self, client):
        """Token should be rejected after logout"""
        reg_response = client.post('/api/v1/auth/register', json={
            'username': 'logoutuser',
            'email': 'logout@example.com',
            'password': 'Password1'
        })
        token = reg_response.get_json()['access_token']
        auth_headers = {'Authorization': f'Bearer {token}'}

        # Token should work before logout
        assert client.get('/api/v1/auth/me', headers=auth_headers).status_code == 200

        # Logout revokes the token
        logout_resp = client.post('/api/v1/auth/logout', headers=auth_headers)
        assert logout_resp.status_code == 200

        # Token should be rejected after logout
        assert client.get('/api/v1/auth/me', headers=auth_headers).status_code == 401