import uuid
import hashlib


def generate_registration_id():
    return f"REG-{uuid.uuid4().hex[:6].upper()}"

def generate_user_id():
    return f"USR-{uuid.uuid4().hex[:6].upper()}"

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()
