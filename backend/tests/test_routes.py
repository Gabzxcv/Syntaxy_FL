"""
Tests for API routes

Tests cover:
- Health check endpoint
- Languages endpoint
"""

import pytest
from app import create_app
from app.models import db


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


class TestHealthEndpoint:
    """Test health check endpoint"""

    def test_health_check_returns_200(self, client):
        """Should return 200 OK"""
        response = client.get('/api/v1/health')
        assert response.status_code == 200

    def test_health_check_returns_correct_json(self, client):
        """Should return healthy status with correct message"""
        response = client.get('/api/v1/health')
        data = response.get_json()
        assert data['status'] == 'healthy'
        assert data['message'] == 'Code Clone Detector API is running'


class TestLanguagesEndpoint:
    """Test languages endpoint"""

    def test_languages_returns_200(self, client):
        """Should return 200 OK"""
        response = client.get('/api/v1/languages')
        assert response.status_code == 200

    def test_languages_returns_correct_list(self, client):
        """Should return supported languages"""
        response = client.get('/api/v1/languages')
        data = response.get_json()
        assert 'languages' in data
        assert isinstance(data['languages'], list)
        assert 'python' in data['languages']
        assert 'java' in data['languages']
