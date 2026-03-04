"""
Shared Flask extensions — instantiated here so they can be imported
in both create_app() and route modules without circular imports.
"""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
)
