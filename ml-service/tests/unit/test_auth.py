"""Unit tests for TheftGuard AI Phase 1: Supabase Backend JWT Verification.

Verifies:
- Valid HS256 token verification and UUID extraction
- Missing or empty token handling
- Malformed token rejection
- Invalid signature rejection
- Expired token rejection
- Invalid audience rejection
- Invalid issuer rejection
- Algorithm 'none' attack rejection
- Non-UUID subject claim rejection
- Asymmetric RS256 token verification
- Unconfigured authentication error handling
- FastAPI get_current_user dependency and standard WWW-Authenticate challenge headers
"""

from __future__ import annotations

import asyncio
import json
import time
import unittest
import uuid
from typing import Any, Dict, Optional, Tuple
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi import Depends, FastAPI
from starlette.exceptions import HTTPException as StarletteHTTPException

from service.auth import (
    AuthConfigurationError,
    AuthError,
    AuthenticatedUser,
    get_current_user,
    verify_token,
)
from service.v1_handlers import error_body


TEST_SECRET = "super-secret-supabase-test-key-at-least-32-chars-long"
TEST_USER_ID = uuid.uuid4()
TEST_EMAIL = "auditor@utility.example.com"
TEST_ISSUER = "https://example.supabase.co/auth/v1"
TEST_AUDIENCE = "authenticated"


def make_test_token(
    sub: Any = None,
    secret: str = TEST_SECRET,
    algorithm: str = "HS256",
    exp_offset: int = 3600,
    aud: Any = TEST_AUDIENCE,
    iss: Any = TEST_ISSUER,
    email: Optional[str] = TEST_EMAIL,
    role: str = "authenticated",
    extra_claims: Optional[Dict[str, Any]] = None,
) -> str:
    """Helper to generate signed test JWT tokens without accessing production keys."""
    now = int(time.time())
    payload = {
        "sub": str(sub or TEST_USER_ID),
        "aud": aud,
        "iss": iss,
        "iat": now,
        "exp": now + exp_offset,
        "email": email,
        "role": role,
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, secret, algorithm=algorithm)


# Minimal FastAPI test harness for dependency testing
test_app = FastAPI()


@test_app.exception_handler(StarletteHTTPException)
async def _test_http_error(request, exc):
    from fastapi.responses import JSONResponse
    body = exc.detail if isinstance(exc.detail, dict) else error_body("http_error", str(exc.detail))
    return JSONResponse(body, status_code=exc.status_code, headers=exc.headers)


@test_app.get("/test-protected")
async def _protected_endpoint(user: AuthenticatedUser = Depends(get_current_user)):
    return {
        "status": "ok",
        "user_id": str(user.user_id),
        "email": user.email,
        "role": user.role,
    }


def dispatch_asgi(
    app_instance: FastAPI,
    method: str,
    path: str,
    headers: Optional[list] = None,
) -> Tuple[int, Dict[str, Any], Dict[str, str]]:
    """Helper to dispatch ASGI requests directly through FastAPI app (standard library only)."""
    raw_headers = [[b"content-type", b"application/json"]]
    for k, v in (headers or []):
        raw_headers.append([k.lower().encode(), v.encode()])

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method.upper(),
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
    }

    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": b"", "more_body": False}
        return {"type": "http.disconnect"}

    resp = {"status": 500, "headers": {}}
    chunks = []

    async def send(msg):
        if msg["type"] == "http.response.start":
            resp["status"] = msg["status"]
            for hk, hv in msg.get("headers", []):
                resp["headers"][hk.decode().lower()] = hv.decode()
        elif msg["type"] == "http.response.body":
            chunks.append(msg.get("body", b""))

    asyncio.run(app_instance(scope, receive, send))

    body_bytes = b"".join(chunks)
    data = json.loads(body_bytes.decode()) if body_bytes else {}
    return resp["status"], data, resp["headers"]


class TestSupabaseAuth(unittest.TestCase):
    """Test suite verifying backend Supabase JWT validation."""

    def test_valid_hs256_token(self):
        """Valid token signature, issuer, audience, and exp return verified user."""
        token = make_test_token()
        user = verify_token(
            token,
            secret=TEST_SECRET,
            algorithms=["HS256"],
            issuer=TEST_ISSUER,
            audience=TEST_AUDIENCE,
        )
        self.assertEqual(user.user_id, TEST_USER_ID)
        self.assertEqual(user.email, TEST_EMAIL)
        self.assertEqual(user.role, "authenticated")
        self.assertIn("sub", user.claims)

    def test_missing_or_empty_token(self):
        """Empty or whitespace token raises AuthError."""
        with self.assertRaises(AuthError) as ctx:
            verify_token("", secret=TEST_SECRET, algorithms=["HS256"])
        self.assertEqual(ctx.exception.code, "unauthorized")

        with self.assertRaises(AuthError) as ctx:
            verify_token("   ", secret=TEST_SECRET, algorithms=["HS256"])
        self.assertEqual(ctx.exception.code, "unauthorized")

    def test_malformed_token(self):
        """Corrupted or non-JWT string raises invalid_token."""
        with self.assertRaises(AuthError) as ctx:
            verify_token(
                "not.a.valid.jwt.string",
                secret=TEST_SECRET,
                algorithms=["HS256"],
            )
        self.assertEqual(ctx.exception.code, "invalid_token")

    def test_invalid_signature(self):
        """Token signed with wrong key raises invalid_token."""
        token = make_test_token(secret="wrong-secret-key-that-does-not-match")
        with self.assertRaises(AuthError) as ctx:
            verify_token(
                token,
                secret=TEST_SECRET,
                algorithms=["HS256"],
                issuer=TEST_ISSUER,
                audience=TEST_AUDIENCE,
            )
        self.assertEqual(ctx.exception.code, "invalid_token")
        self.assertIn("Signature verification failed", ctx.exception.challenge)

    def test_expired_token(self):
        """Token with exp in the past raises token_expired."""
        token = make_test_token(exp_offset=-300)  # expired 5 minutes ago
        with self.assertRaises(AuthError) as ctx:
            verify_token(
                token,
                secret=TEST_SECRET,
                algorithms=["HS256"],
                issuer=TEST_ISSUER,
                audience=TEST_AUDIENCE,
            )
        self.assertEqual(ctx.exception.code, "token_expired")
        self.assertIn("The token has expired", ctx.exception.challenge)

    def test_invalid_audience(self):
        """Token with wrong audience raises invalid_token."""
        token = make_test_token(aud="wrong-audience")
        with self.assertRaises(AuthError) as ctx:
            verify_token(
                token,
                secret=TEST_SECRET,
                algorithms=["HS256"],
                issuer=TEST_ISSUER,
                audience=TEST_AUDIENCE,
            )
        self.assertEqual(ctx.exception.code, "invalid_token")
        self.assertIn("Audience mismatch", ctx.exception.challenge)

    def test_invalid_issuer(self):
        """Token with wrong issuer raises invalid_token."""
        token = make_test_token(iss="https://malicious-idp.com/auth/v1")
        with self.assertRaises(AuthError) as ctx:
            verify_token(
                token,
                secret=TEST_SECRET,
                algorithms=["HS256"],
                issuer=TEST_ISSUER,
                audience=TEST_AUDIENCE,
            )
        self.assertEqual(ctx.exception.code, "invalid_token")
        self.assertIn("Issuer mismatch", ctx.exception.challenge)

    def test_disallowed_none_algorithm(self):
        """Token using 'none' algorithm is strictly rejected."""
        now = int(time.time())
        payload = {
            "sub": str(TEST_USER_ID),
            "aud": TEST_AUDIENCE,
            "iss": TEST_ISSUER,
            "exp": now + 3600,
        }
        # Insecure 'none' token
        insecure_token = jwt.encode(payload, key="", algorithm="none")

        with self.assertRaises(AuthError) as ctx:
            verify_token(
                insecure_token,
                secret=TEST_SECRET,
                algorithms=["HS256"],
                issuer=TEST_ISSUER,
                audience=TEST_AUDIENCE,
            )
        self.assertEqual(ctx.exception.code, "invalid_token")

    def test_invalid_subject_uuid(self):
        """Token with non-UUID subject raises invalid_token."""
        token = make_test_token(sub="not-a-valid-uuid-12345")
        with self.assertRaises(AuthError) as ctx:
            verify_token(
                token,
                secret=TEST_SECRET,
                algorithms=["HS256"],
                issuer=TEST_ISSUER,
                audience=TEST_AUDIENCE,
            )
        self.assertEqual(ctx.exception.code, "invalid_token")
        self.assertIn("UUID", ctx.exception.challenge)

    def test_asymmetric_rs256_token(self):
        """Asymmetric RS256 token validates using public key."""
        # Generate temporary RSA key pair for testing
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode()
        public_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()

        now = int(time.time())
        payload = {
            "sub": str(TEST_USER_ID),
            "aud": TEST_AUDIENCE,
            "iss": TEST_ISSUER,
            "exp": now + 3600,
            "email": TEST_EMAIL,
            "role": "authenticated",
        }
        rs256_token = jwt.encode(payload, private_pem, algorithm="RS256")

        user = verify_token(
            rs256_token,
            public_key=public_pem,
            algorithms=["RS256"],
            issuer=TEST_ISSUER,
            audience=TEST_AUDIENCE,
        )
        self.assertEqual(user.user_id, TEST_USER_ID)
        self.assertEqual(user.email, TEST_EMAIL)

    def test_asymmetric_es256_token(self):
        """Asymmetric ES256 token (used by modern Supabase) validates using EC public key."""
        # Generate temporary EC key pair (P-256 / secp256r1)
        private_key = ec.generate_private_key(ec.SECP256R1())
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode()
        public_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()

        now = int(time.time())
        payload = {
            "sub": str(TEST_USER_ID),
            "aud": TEST_AUDIENCE,
            "iss": TEST_ISSUER,
            "exp": now + 3600,
            "email": TEST_EMAIL,
            "role": "authenticated",
        }
        es256_token = jwt.encode(payload, private_pem, algorithm="ES256")

        user = verify_token(
            es256_token,
            public_key=public_pem,
            algorithms=["ES256"],
            issuer=TEST_ISSUER,
            audience=TEST_AUDIENCE,
        )
        self.assertEqual(user.user_id, TEST_USER_ID)
        self.assertEqual(user.email, TEST_EMAIL)

    def test_es256_token_with_escaped_newlines_in_public_key(self):
        """Verifies that public key with escaped '\\n' strings (e.g. from single-line .env) is normalized."""
        private_key = ec.generate_private_key(ec.SECP256R1())
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode()
        public_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()

        escaped_pem = '"' + public_pem.replace("\n", "\\n") + '"'

        now = int(time.time())
        payload = {
            "sub": str(TEST_USER_ID),
            "aud": TEST_AUDIENCE,
            "iss": TEST_ISSUER,
            "exp": now + 3600,
            "email": TEST_EMAIL,
            "role": "authenticated",
        }
        token = jwt.encode(payload, private_pem, algorithm="ES256")

        with patch.dict("os.environ", {
            "SUPABASE_JWT_PUBLIC_KEY": escaped_pem,
            "SUPABASE_JWT_ALGORITHMS": "ES256",
            "SUPABASE_JWT_ISSUER": TEST_ISSUER,
            "SUPABASE_JWT_AUDIENCE": TEST_AUDIENCE,
        }):
            user = verify_token(token)
            self.assertEqual(user.user_id, TEST_USER_ID)

    def test_jwks_resolution_for_supabase_url(self):
        """Verifies that when SUPABASE_URL is configured without static key, PyJWKClient resolves the key."""
        private_key = ec.generate_private_key(ec.SECP256R1())
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode()
        public_key = private_key.public_key()

        now = int(time.time())
        payload = {
            "sub": str(TEST_USER_ID),
            "aud": TEST_AUDIENCE,
            "iss": "https://testproj.supabase.co/auth/v1",
            "exp": now + 3600,
            "email": TEST_EMAIL,
            "role": "authenticated",
        }
        headers = {"kid": "test-kid-1234"}
        token = jwt.encode(payload, private_pem, algorithm="ES256", headers=headers)

        class MockSigningKey:
            def __init__(self, key):
                self.key = key

        class MockJWKClient:
            def __init__(self, *args, **kwargs):
                pass
            def get_signing_key_from_jwt(self, tok):
                return MockSigningKey(public_key)

        with patch("jwt.PyJWKClient", MockJWKClient):
            with patch.dict("os.environ", {
                "SUPABASE_URL": "https://testproj.supabase.co",
                "SUPABASE_JWT_SECRET": "",
                "SUPABASE_JWT_PUBLIC_KEY": "",
                "SUPABASE_JWT_ALGORITHMS": "ES256",
            }, clear=True):
                user = verify_token(token)
                self.assertEqual(user.user_id, TEST_USER_ID)

    def test_unconfigured_auth_raises_configuration_error(self):
        """Calling verify_token with no secret and no public key raises AuthConfigurationError."""
        with self.assertRaises(AuthConfigurationError):
            verify_token(
                "some-token",
                secret=None,
                public_key=None,
                algorithms=[],
            )


class TestFastApiAuthDependency(unittest.TestCase):
    """Test suite verifying FastAPI dependency injection and challenge headers."""

    def test_missing_authorization_header(self):
        """Missing Authorization header returns 401 with WWW-Authenticate: Bearer."""
        status_code, body, headers = dispatch_asgi(test_app, "GET", "/test-protected")
        self.assertEqual(status_code, 401)
        self.assertEqual(body["error"]["code"], "unauthorized")
        self.assertEqual(headers.get("www-authenticate"), "Bearer")

    def test_invalid_scheme(self):
        """Non-Bearer scheme returns 401."""
        status_code, body, headers = dispatch_asgi(
            test_app,
            "GET",
            "/test-protected",
            headers=[("Authorization", "Basic dXNlcjpwYXNz")],
        )
        self.assertEqual(status_code, 401)
        self.assertEqual(body["error"]["code"], "unauthorized")

    @patch("service.auth.get_auth_config")
    def test_valid_token_returns_200(self, mock_cfg):
        """Valid Bearer token succeeds and returns 200."""
        mock_cfg.return_value = {
            "secret": TEST_SECRET,
            "public_key": None,
            "issuer": TEST_ISSUER,
            "audience": TEST_AUDIENCE,
            "algorithms": ["HS256"],
        }
        token = make_test_token()
        status_code, body, headers = dispatch_asgi(
            test_app,
            "GET",
            "/test-protected",
            headers=[("Authorization", f"Bearer {token}")],
        )
        self.assertEqual(status_code, 200)
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["user_id"], str(TEST_USER_ID))
        self.assertEqual(body["email"], TEST_EMAIL)

    @patch("service.auth.get_auth_config")
    def test_expired_token_returns_401_with_challenge(self, mock_cfg):
        """Expired token returns 401 and challenge description."""
        mock_cfg.return_value = {
            "secret": TEST_SECRET,
            "public_key": None,
            "issuer": TEST_ISSUER,
            "audience": TEST_AUDIENCE,
            "algorithms": ["HS256"],
        }
        token = make_test_token(exp_offset=-60)
        status_code, body, headers = dispatch_asgi(
            test_app,
            "GET",
            "/test-protected",
            headers=[("Authorization", f"Bearer {token}")],
        )
        self.assertEqual(status_code, 401)
        self.assertEqual(body["error"]["code"], "token_expired")
        self.assertIn("error=\"invalid_token\"", headers.get("www-authenticate", ""))
        self.assertIn("The token has expired", headers.get("www-authenticate", ""))

    @patch("service.auth.get_auth_config")
    def test_invalid_signature_returns_401(self, mock_cfg):
        """Invalid signature returns 401."""
        mock_cfg.return_value = {
            "secret": TEST_SECRET,
            "public_key": None,
            "issuer": TEST_ISSUER,
            "audience": TEST_AUDIENCE,
            "algorithms": ["HS256"],
        }
        token = make_test_token(secret="wrong-key-that-is-at-least-32-chars-long")
        status_code, body, headers = dispatch_asgi(
            test_app,
            "GET",
            "/test-protected",
            headers=[("Authorization", f"Bearer {token}")],
        )
        self.assertEqual(status_code, 401)
        self.assertEqual(body["error"]["code"], "invalid_token")
        self.assertIn("Signature verification failed", headers.get("www-authenticate", ""))

    @patch("service.auth.get_auth_config")
    def test_unconfigured_auth_returns_503(self, mock_cfg):
        """Unconfigured auth environment returns 503 auth_unavailable."""
        mock_cfg.return_value = {
            "secret": None,
            "public_key": None,
            "issuer": None,
            "audience": "authenticated",
            "algorithms": [],
        }
        status_code, body, _ = dispatch_asgi(
            test_app,
            "GET",
            "/test-protected",
            headers=[("Authorization", "Bearer some-token")],
        )
        self.assertEqual(status_code, 503)
        self.assertEqual(body["error"]["code"], "auth_unavailable")


if __name__ == "__main__":
    unittest.main()
