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


class TestBatchCompareEndpoint:
    """Test batch compare endpoint."""

    def test_compare_batch_missing_fields(self, client):
        response = client.post('/api/v1/compare-batch', json={"language": "python"})
        assert response.status_code == 400
        data = response.get_json()
        assert 'error' in data

    def test_compare_batch_success(self, client):
        payload = {
            "language": "python",
            "submissions": [
                {"file": "a.py", "code": "def f(x):\n    return x + 1\n"},
                {"file": "b.py", "code": "def g(y):\n    return y + 1\n"},
                {"file": "c.py", "code": "def h(z):\n    return z * 2\n"},
            ],
        }
        response = client.post('/api/v1/compare-batch', json=payload)
        assert response.status_code == 200
        data = response.get_json()
        assert 'pairs' in data
        assert data['submission_count'] == 3
        assert data['pair_count'] == 3

    def test_compare_batch_defaults_enable_fp_suppression_controls(self, client):
        payload = {
            "language": "python",
            "submissions": [
                {"file": "a.py", "code": "def f(x):\n    return x + 1\n"},
                {"file": "b.py", "code": "def g(y):\n    return y + 1\n"},
                {"file": "c.py", "code": "def h(z):\n    return z * 2\n"},
            ],
        }
        response = client.post('/api/v1/compare-batch', json=payload)
        assert response.status_code == 200
        data = response.get_json()
        assert 'filters_applied' in data
        assert data['filters_applied']['pool_suppression'] is True
        assert data['filters_applied']['auto_tune_filters'] is True

    def test_compare_batch_rejects_invalid_confidence_floor(self, client):
        payload = {
            "language": "python",
            "submissions": [
                {"file": "a.py", "code": "def f(x):\n    return x + 1\n"},
                {"file": "b.py", "code": "def g(y):\n    return y + 1\n"},
            ],
            "confidence_floor": 1.5,
        }
        response = client.post('/api/v1/compare-batch', json=payload)
        assert response.status_code == 400
        data = response.get_json()
        assert 'confidence_floor' in data['error']

    def test_compare_batch_rejects_non_boolean_auto_tune_filters(self, client):
        payload = {
            "language": "python",
            "submissions": [
                {"file": "a.py", "code": "def f(x):\n    return x + 1\n"},
                {"file": "b.py", "code": "def g(y):\n    return y + 1\n"},
            ],
            "auto_tune_filters": "yes",
        }
        response = client.post('/api/v1/compare-batch', json=payload)
        assert response.status_code == 400
        data = response.get_json()
        assert 'auto_tune_filters' in data['error']


class TestPairCompareEndpoint:
    """Test pair compare endpoint with suppression controls."""

    def test_compare_pair_accepts_suppression_controls(self, client):
        payload = {
            "language": "python",
            "code_a": "def add(a, b):\n    return a + b\n",
            "code_b": "def sum_nums(x, y):\n    return x + y\n",
            "confidence_floor": 0.0,
            "enable_pool_suppression": True,
            "pool_confidence_floor": 1.0,
            "pool_confidence_mode": "max",
            "auto_tune_filters": True,
            "corpus_codes": ["def helper(z):\n    return z - 1\n"],
        }
        response = client.post('/api/v1/compare', json=payload)
        assert response.status_code == 200
        data = response.get_json()
        assert 'filters_applied' in data
        assert data['filters_applied']['pool_suppression'] is True
        assert data['filters_applied']['auto_tune_filters'] is True

    def test_compare_pair_rejects_invalid_pool_mode(self, client):
        payload = {
            "language": "python",
            "code_a": "def add(a, b):\n    return a + b\n",
            "code_b": "def sum_nums(x, y):\n    return x + y\n",
            "pool_confidence_mode": "median",
        }
        response = client.post('/api/v1/compare', json=payload)
        assert response.status_code == 400
        data = response.get_json()
        assert 'pool_confidence_mode' in data['error']
