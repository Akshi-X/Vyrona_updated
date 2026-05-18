import pytest

@pytest.fixture
def in_memory_db_url():
    """Default database URL for tests."""
    return "sqlite:///:memory:"
