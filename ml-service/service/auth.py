"""TheftGuard AI — Phase 1: Supabase Backend JWT Verification.

Provides authoritative, stateless token verification for Supabase Auth:
- Validates cryptographic signature using configured symmetric (HS256) secret
  or asymmetric (RS256 / ES256) public key.
- Rejects untrusted algorithms (including 'none').
- Validates expiration, audience, issuer, and subject UUID.
- Returns an AuthenticatedUser identity object with verified UUID.
- Returns HTTP 401 with standard WWW-Authenticate Bearer challenges on failure.
- Never logs tokens, keys, or passwords.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv

    _ml_service_root = Path(__file__).resolve().parents[1]
    for _candidate in [_ml_service_root / ".env", Path.cwd() / ".env"]:
        if _candidate.is_file():
            load_dotenv(dotenv_path=_candidate)
            break
    else:
        load_dotenv()
except ImportError:
    pass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .v1_handlers import error_body

ENV_SUPABASE_JWT_SECRET = "SUPABASE_JWT_SECRET"
ENV_SUPABASE_JWT_PUBLIC_KEY = "SUPABASE_JWT_PUBLIC_KEY"
ENV_SUPABASE_URL = "SUPABASE_URL"
ENV_SUPABASE_JWT_ISSUER = "SUPABASE_JWT_ISSUER"
ENV_SUPABASE_JWT_AUDIENCE = "SUPABASE_JWT_AUDIENCE"
ENV_SUPABASE_JWT_ALGORITHMS = "SUPABASE_JWT_ALGORITHMS"

DEFAULT_AUDIENCE = "authenticated"
DISALLOWED_ALGORITHMS = {"none", "NONE", ""}


class AuthConfigurationError(Exception):
    """Raised when Supabase authentication settings or signing keys are missing or invalid."""
    pass


class AuthError(Exception):
    """Raised when token authentication fails (missing, expired, invalid, malformed)."""

    def __init__(self, code: str, message: str, challenge: Optional[str] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.challenge = challenge


@dataclass(frozen=True)
class AuthenticatedUser:
    """Immutable representation of a cryptographically verified Supabase user."""

    user_id: uuid.UUID
    email: Optional[str] = None
    role: str = "authenticated"
    claims: Dict[str, Any] = field(default_factory=dict)


_jwks_clients: Dict[str, Any] = {}


def get_jwks_client(jwks_url: str):
    """Retrieves or instantiates a cached PyJWKClient for Supabase JWKS public keys."""
    from jwt import PyJWKClient

    if jwks_url not in _jwks_clients:
        _jwks_clients[jwks_url] = PyJWKClient(jwks_url, cache_keys=True, max_cached_keys=16, lifespan=3600)
    return _jwks_clients[jwks_url]


def reset_jwks_clients() -> None:
    """Clears cached JWKS clients (primarily for testing)."""
    _jwks_clients.clear()


def get_auth_config() -> Dict[str, Any]:
    """Retrieves and normalizes Supabase JWT verification configuration from environment.

    Never logs secret values.
    """
    secret = os.getenv(ENV_SUPABASE_JWT_SECRET)
    secret = secret.strip() if secret and secret.strip() else None

    public_key = os.getenv(ENV_SUPABASE_JWT_PUBLIC_KEY)
    if public_key and public_key.strip():
        public_key = public_key.strip()
        if (public_key.startswith('"') and public_key.endswith('"')) or (public_key.startswith("'") and public_key.endswith("'")):
            public_key = public_key[1:-1]
        if "\\n" in public_key and "\n" not in public_key:
            public_key = public_key.replace("\\n", "\n")
        public_key = public_key.strip() if public_key.strip() else None
    else:
        public_key = None

    supabase_url = os.getenv(ENV_SUPABASE_URL)
    supabase_url = supabase_url.strip() if supabase_url and supabase_url.strip() else None

    # Derive or read issuer
    issuer = os.getenv(ENV_SUPABASE_JWT_ISSUER)
    if issuer and issuer.strip():
        issuer = issuer.strip()
    elif supabase_url:
        issuer = f"{supabase_url.rstrip('/')}/auth/v1"
    else:
        issuer = None

    audience = os.getenv(ENV_SUPABASE_JWT_AUDIENCE)
    audience = audience.strip() if audience and audience.strip() else DEFAULT_AUDIENCE

    # Derive allowed algorithms
    custom_algos = os.getenv(ENV_SUPABASE_JWT_ALGORITHMS)
    if custom_algos and custom_algos.strip():
        algorithms = [a.strip() for a in custom_algos.split(",") if a.strip()]
    elif secret and public_key:
        algorithms = ["HS256", "RS256", "ES256"]
    elif public_key:
        algorithms = ["RS256", "ES256"]
    elif secret:
        algorithms = ["HS256"]
    elif supabase_url:
        algorithms = ["ES256", "RS256", "HS256"]
    else:
        algorithms = []

    # Enforce disallowance of 'none'
    algorithms = [a for a in algorithms if a.lower() not in DISALLOWED_ALGORITHMS]

    return {
        "secret": secret,
        "public_key": public_key,
        "supabase_url": supabase_url,
        "issuer": issuer,
        "audience": audience,
        "algorithms": algorithms,
    }


def is_auth_configured() -> bool:
    """Returns True if at least one valid signing key or Supabase URL is configured."""
    cfg = get_auth_config()
    return bool(cfg["secret"] or cfg["public_key"] or cfg.get("supabase_url")) and bool(cfg["algorithms"])


def verify_token(
    token: str,
    *,
    secret: Optional[str] = None,
    public_key: Optional[str] = None,
    algorithms: Optional[List[str]] = None,
    issuer: Optional[str] = None,
    audience: Optional[str] = None,
) -> AuthenticatedUser:
    """Cryptographically verifies a Supabase JWT token.

    Parameters can be passed directly (for testing/dependency injection)
    or defaulted from the environment.
    """
    if not token or not isinstance(token, str) or not token.strip():
        raise AuthError("unauthorized", "Authentication token is missing or empty.")

    token = token.strip()
    cfg = get_auth_config()

    eff_secret = secret if secret is not None else cfg["secret"]
    eff_pub_key = public_key if public_key is not None else cfg["public_key"]
    eff_supabase_url = cfg.get("supabase_url")
    eff_algos = algorithms if algorithms is not None else cfg["algorithms"]
    eff_issuer = issuer if issuer is not None else cfg["issuer"]
    eff_audience = audience if audience is not None else cfg["audience"]

    # Reject 'none' algorithm unconditionally
    eff_algos = [a for a in (eff_algos or []) if a.lower() not in DISALLOWED_ALGORITHMS]

    if not (eff_secret or eff_pub_key or eff_supabase_url) or not eff_algos:
        raise AuthConfigurationError("Supabase JWT signing configuration is not available.")

    # Inspect token header without signature verification to select key and reject 'none'
    try:
        header = jwt.get_unverified_header(token)
    except Exception as exc:
        raise AuthError(
            "invalid_token",
            "Malformed authentication token header.",
            challenge='error="invalid_token", error_description="Malformed token header"',
        ) from exc

    token_alg = header.get("alg")
    if not token_alg or token_alg.lower() in DISALLOWED_ALGORITHMS:
        raise AuthError(
            "invalid_token",
            "Disallowed or missing signing algorithm.",
            challenge='error="invalid_token", error_description="Disallowed algorithm"',
        )

    if token_alg not in eff_algos:
        raise AuthError(
            "invalid_token",
            f"Unsupported algorithm '{token_alg}'.",
            challenge='error="invalid_token", error_description="Algorithm not permitted"',
        )

    # Select appropriate signing key based on algorithm family
    if token_alg.startswith("HS"):
        if not eff_secret:
            raise AuthConfigurationError("HMAC secret is not configured for HS algorithm.")
        key = eff_secret
    elif token_alg.startswith(("RS", "ES")):
        if eff_pub_key:
            key = eff_pub_key
        elif eff_supabase_url:
            try:
                jwks_url = f"{eff_supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
                jwks_client = get_jwks_client(jwks_url)
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                key = signing_key.key
            except Exception as exc:
                raise AuthConfigurationError(f"Failed to retrieve signing key from Supabase JWKS: {exc}") from exc
        else:
            raise AuthConfigurationError("Public key is not configured for asymmetric algorithm.")
    else:
        raise AuthError(
            "invalid_token",
            f"Unsupported token algorithm family '{token_alg}'.",
            challenge='error="invalid_token", error_description="Unsupported algorithm family"',
        )

    decode_options = {
        "verify_signature": True,
        "verify_exp": True,
        "verify_aud": bool(eff_audience),
        "verify_iss": bool(eff_issuer),
        "require": ["exp", "sub"],
    }

    try:
        payload = jwt.decode(
            token,
            key=key,
            algorithms=[token_alg],
            audience=eff_audience if eff_audience else None,
            issuer=eff_issuer if eff_issuer else None,
            options=decode_options,
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError(
            "token_expired",
            "Authentication token has expired.",
            challenge='error="invalid_token", error_description="The token has expired"',
        ) from exc
    except jwt.InvalidSignatureError as exc:
        raise AuthError(
            "invalid_token",
            "Invalid token signature.",
            challenge='error="invalid_token", error_description="Signature verification failed"',
        ) from exc
    except jwt.InvalidAudienceError as exc:
        raise AuthError(
            "invalid_token",
            "Invalid token audience.",
            challenge='error="invalid_token", error_description="Audience mismatch"',
        ) from exc
    except jwt.InvalidIssuerError as exc:
        raise AuthError(
            "invalid_token",
            "Invalid token issuer.",
            challenge='error="invalid_token", error_description="Issuer mismatch"',
        ) from exc
    except jwt.DecodeError as exc:
        raise AuthError(
            "invalid_token",
            "Malformed authentication token.",
            challenge='error="invalid_token", error_description="Token payload decode failed"',
        ) from exc
    except Exception as exc:
        raise AuthError(
            "invalid_token",
            "Authentication token validation failed.",
            challenge='error="invalid_token", error_description="Token validation failed"',
        ) from exc

    # Validate that subject is a valid UUID
    sub_raw = payload.get("sub")
    if not sub_raw:
        raise AuthError(
            "invalid_token",
            "Missing subject claim 'sub'.",
            challenge='error="invalid_token", error_description="Missing subject"',
        )

    try:
        user_uuid = uuid.UUID(str(sub_raw))
    except (ValueError, TypeError, AttributeError) as exc:
        raise AuthError(
            "invalid_token",
            "Subject claim 'sub' is not a valid UUID.",
            challenge='error="invalid_token", error_description="Subject must be a valid UUID"',
        ) from exc

    email = payload.get("email")
    role = str(payload.get("role", "authenticated"))

    return AuthenticatedUser(
        user_id=user_uuid,
        email=str(email) if email else None,
        role=role,
        claims=payload,
    )


# FastAPI Security Scheme for dependency injection
_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> AuthenticatedUser:
    """FastAPI dependency: extracts and cryptographically verifies Bearer token.

    Returns AuthenticatedUser on success.
    Raises HTTPException(401) with standard WWW-Authenticate challenge on failure.
    Raises HTTPException(503) if authentication service is not configured.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_body("unauthorized", "Authentication required. Bearer token is missing."),
            headers={"WWW-Authenticate": "Bearer"},
        )

    if (credentials.scheme or "").lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_body("unauthorized", "Invalid authentication scheme. 'Bearer' required."),
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return verify_token(credentials.credentials)
    except AuthConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=error_body("auth_unavailable", "Authentication service is misconfigured or unavailable."),
        ) from exc
    except AuthError as exc:
        challenge_header = f'Bearer {exc.challenge}' if exc.challenge else "Bearer"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_body(exc.code, exc.message),
            headers={"WWW-Authenticate": challenge_header},
        ) from exc
