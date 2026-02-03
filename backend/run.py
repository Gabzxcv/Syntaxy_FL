"""
Main entry point for the Code Clone Detector API

Run this file to start the Flask development server:
    python run.py

The API will be available at:
    http://localhost:5000
"""

from app import create_app

# Create Flask application
app = create_app()

if __name__ == '__main__':
    print("=" * 50)
    print("🚀 Code Clone Detector API Starting...")
    print("=" * 50)
    print("📍 Server: http://localhost:5000")
    print("📍 Health Check: http://localhost:5000/api/v1/health")
    print("📍 API Docs: See API_SPEC.md")
    print("=" * 50)
    
    app.run(
        host='0.0.0.0',  # Accept connections from any IP (needed for Docker later)
        port=5000,
        debug=True  # Auto-reload when code changes
    )