import uuid
from passlib.context import CryptContext

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")



def generate_user_id():
    return f"USR-{uuid.uuid4().hex[:6].upper()}"

def hash_password(password: str) -> str:
    """Hash a password with bcrypt length handling"""
    # Ensure password is a string and truncate if too long for bcrypt
    if isinstance(password, bytes):
        password = password.decode('utf-8')
    
    # Bcrypt has a 72-byte limit, so truncate if necessary
    if len(password.encode('utf-8')) > 72:
        password = password[:72]
    
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
