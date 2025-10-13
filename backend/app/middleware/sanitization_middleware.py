"""
Input Sanitization Middleware

Blocks XSS, SQL injection, command injection, and path traversal attacks.
"""

import json
import re
from typing import Callable, Optional
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime, timezone
from ..constants.status_constants import STATUS_BLOCKED


class SanitizationMiddleware(BaseHTTPMiddleware):
    """Sanitizes incoming requests and blocks malicious patterns."""
    
    # Malicious patterns to detect
    XSS_PATTERNS = [
        r'<script[^>]*>.*?</script>',  # <script> tags
        r'javascript:',                 # javascript: protocol
        r'on\w+\s*=',                  # Event handlers (onclick, onerror, etc.)
        r'<iframe[^>]*>',              # <iframe> tags
        r'<object[^>]*>',              # <object> tags
        r'<embed[^>]*>',               # <embed> tags
        r'<img[^>]*onerror',           # <img> with onerror
        r'eval\s*\(',                  # eval() function
        r'expression\s*\(',            # CSS expression()
        r'vbscript:',                  # vbscript: protocol
        r'<svg[^>]*onload',            # SVG with onload
    ]
    
    SQL_INJECTION_PATTERNS = [
        r'(\bOR\b|\bAND\b)\s+[\w\'"]+\s*=\s*[\w\'\"]+',  # OR 1=1, AND 1=1
        r'UNION\s+SELECT',              # UNION SELECT
        r';\s*DROP\s+TABLE',            # DROP TABLE
        r';\s*DELETE\s+FROM',           # DELETE FROM
        r';\s*INSERT\s+INTO',           # INSERT INTO
        r';\s*UPDATE\s+\w+\s+SET',     # UPDATE SET
        r'--\s*$',                      # SQL comments
        r'/\*.*?\*/',                   # /* */ comments
        r'xp_cmdshell',                 # SQL Server command execution
        r'exec\s*\(',                   # EXEC command
        r'BENCHMARK\s*\(',              # MySQL benchmark
        r'SLEEP\s*\(',                  # SQL SLEEP
    ]
    
    COMMAND_INJECTION_PATTERNS = [
        r';\s*\w+',                     # Command chaining with ;
        r'\|\s*\w+',                    # Pipe commands
        r'&&\s*\w+',                    # AND commands
        r'\$\([^)]+\)',                 # Command substitution
        r'`[^`]+`',                     # Backtick execution
        r'>\s*/dev/',                   # File redirection
        r'\.\./\.\.',                   # Path traversal
    ]
    
    NOSQL_INJECTION_PATTERNS = [
        r'\$where',                     # MongoDB $where
        r'\$ne',                        # Not equal
        r'\$gt',                        # Greater than
        r'\$regex',                     # Regex injection
        r'\{\s*\$',                     # MongoDB operators
    ]
    
    def __init__(self, app):
        super().__init__(app)
        # Compile patterns for performance
        self.xss_regex = [re.compile(pattern, re.IGNORECASE) for pattern in self.XSS_PATTERNS]
        self.sql_regex = [re.compile(pattern, re.IGNORECASE) for pattern in self.SQL_INJECTION_PATTERNS]
        self.cmd_regex = [re.compile(pattern, re.IGNORECASE) for pattern in self.COMMAND_INJECTION_PATTERNS]
        self.nosql_regex = [re.compile(pattern, re.IGNORECASE) for pattern in self.NOSQL_INJECTION_PATTERNS]
    
    async def dispatch(self, request: Request, call_next: Callable):
        """
        Intercept ALL requests and sanitize inputs
        """
        # Skip sanitization for static files and health check
        if request.url.path.startswith("/static") or request.url.path == "/health":
            return await call_next(request)
        
        # Only sanitize requests with body (POST, PUT, PATCH)
        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                # Read and parse body
                body = await request.body()
                
                if body:
                    try:
                        data = json.loads(body)
                        
                        # Check for malicious content
                        threat = self._detect_threats(data)
                        
                        if threat:
                            from ..constants.error_codes import ERROR_CODES
                            return JSONResponse(
                                status_code=400,
                                content={
                                    "error_code": ERROR_CODES["SECURITY_MALICIOUS_CONTENT"],
                                    "message": f"Malicious content detected: {threat['type']}",
                                    "status": STATUS_BLOCKED,
                                    "threat_type": threat['type'],
                                    "threat_pattern": threat['pattern'],
                                    "timestamp": datetime.now(timezone.utc).isoformat(),
                                    "compliance_note": "Request blocked for security compliance (HIPAA/FDA)"
                                }
                            )
                        
                        # Restore body for next middleware
                        request._body = body
                        
                    except json.JSONDecodeError:
                        # Not JSON, skip sanitization
                        pass
            
            except Exception as e:
                # Don't block request if sanitization fails
                pass
        
        # Sanitization passed, continue to next middleware
        response = await call_next(request)
        return response
    
    def _detect_threats(self, data: dict, path: str = "") -> Optional[dict]:
        """
        Recursively scan dictionary for malicious patterns
        
        Returns:
            dict with threat details if found, None otherwise
        """
        if isinstance(data, dict):
            for key, value in data.items():
                current_path = f"{path}.{key}" if path else key
                
                # Check key for malicious content
                threat = self._check_string(str(key), current_path)
                if threat:
                    return threat
                
                # Recursively check values
                if isinstance(value, (dict, list)):
                    threat = self._detect_threats(value, current_path)
                    if threat:
                        return threat
                elif isinstance(value, str):
                    threat = self._check_string(value, current_path)
                    if threat:
                        return threat
        
        elif isinstance(data, list):
            for i, item in enumerate(data):
                current_path = f"{path}[{i}]"
                if isinstance(item, (dict, list)):
                    threat = self._detect_threats(item, current_path)
                    if threat:
                        return threat
                elif isinstance(item, str):
                    threat = self._check_string(item, current_path)
                    if threat:
                        return threat
        
        return None
    
    def _check_string(self, value: str, field: str) -> Optional[dict]:
        """
        Check a string value against all malicious patterns
        
        Returns:
            dict with threat details if found, None otherwise
        """
        # XSS Detection
        for pattern in self.xss_regex:
            if pattern.search(value):
                return {
                    "type": "XSS (Cross-Site Scripting)",
                    "pattern": pattern.pattern,
                    "field": field,
                    "value_snippet": value[:50] + "..." if len(value) > 50 else value
                }
        
        # SQL Injection Detection
        for pattern in self.sql_regex:
            if pattern.search(value):
                return {
                    "type": "SQL Injection",
                    "pattern": pattern.pattern,
                    "field": field,
                    "value_snippet": value[:50] + "..." if len(value) > 50 else value
                }
        
        # Command Injection Detection
        for pattern in self.cmd_regex:
            if pattern.search(value):
                return {
                    "type": "Command Injection",
                    "pattern": pattern.pattern,
                    "field": field,
                    "value_snippet": value[:50] + "..." if len(value) > 50 else value
                }
        
        # NoSQL Injection Detection
        for pattern in self.nosql_regex:
            if pattern.search(value):
                return {
                    "type": "NoSQL Injection",
                    "pattern": pattern.pattern,
                    "field": field,
                    "value_snippet": value[:50] + "..." if len(value) > 50 else value
                }
        
        return None

