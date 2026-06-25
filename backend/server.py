from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse, Response as FastAPIResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import io
import csv
import secrets
import hashlib
import base64
import httpx
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import pandas as pd

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'budgetwise_jwt_secret_key_2026')
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 168  # 7 days

GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')

CATEGORIES = [
    "Salary", "Freelance", "Investments", "Business", "Gifts",
    "Rent/Mortgage", "Food & Dining", "Transportation", "Groceries",
    "Entertainment", "Shopping", "Utilities", "Healthcare", "Education",
    "Insurance", "Travel", "Subscriptions", "Personal Care", "Other"
]

CURRENCIES = [
    {"code": "INR", "symbol": "\u20b9", "name": "Indian Rupee"},
    {"code": "USD", "symbol": "$", "name": "US Dollar"},
    {"code": "EUR", "symbol": "\u20ac", "name": "Euro"},
    {"code": "GBP", "symbol": "\u00a3", "name": "British Pound"},
    {"code": "JPY", "symbol": "\u00a5", "name": "Japanese Yen"},
    {"code": "AUD", "symbol": "A$", "name": "Australian Dollar"},
    {"code": "CAD", "symbol": "C$", "name": "Canadian Dollar"},
]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ─── Pydantic Models ───
class UserRegister(BaseModel):
    name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    user_id: str
    name: str
    email: str
    picture: Optional[str] = None
    currency: str = "INR"

class TransactionCreate(BaseModel):
    type: str  # "income" or "expense"
    amount: float = Field(gt=0, le=1e10, description="Must be greater than 0")
    category: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=500)
    date: Optional[str] = None
    account_id: Optional[str] = None

class TransactionUpdate(BaseModel):
    type: Optional[str] = None
    amount: Optional[float] = Field(default=None, gt=0, le=1e10)
    category: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, min_length=1, max_length=500)
    date: Optional[str] = None
    account_id: Optional[str] = None

class BudgetGoalCreate(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    limit_amount: float = Field(gt=0, le=1e10)
    period: str = "monthly"  # monthly, weekly

class BudgetGoalUpdate(BaseModel):
    category: Optional[str] = Field(default=None, min_length=1, max_length=100)
    limit_amount: Optional[float] = None
    period: Optional[str] = None

class SettingsUpdate(BaseModel):
    currency: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
RESET_TOKEN_EXPIRY_MINUTES = 30
IS_DEV = os.environ.get('ENVIRONMENT', 'development').lower() != 'production'


# ─── Account Models ───
ACCOUNT_TYPES = ["bank", "cash", "credit_card", "wallet", "savings", "investment"]

class AccountCreate(BaseModel):
    name: str
    account_type: str  # bank, cash, credit_card, wallet, savings, investment
    balance: float = 0.0
    color: Optional[str] = "#818cf8"
    icon: Optional[str] = "wallet"

class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[str] = None
    balance: Optional[float] = None
    color: Optional[str] = None
    icon: Optional[str] = None


# ─── Auth Helpers ───
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_jwt(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    # Check cookie first
    token = request.cookies.get("session_token")
    # Then check Authorization header
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Try JWT first
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if user_id:
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            if user:
                return user
    except jwt.ExpiredSignatureError:
        pass
    except jwt.InvalidTokenError:
        pass

    # Try session token (Google OAuth)
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at and expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if user:
            return user

    raise HTTPException(status_code=401, detail="Invalid or expired token")


# ─── Auth Routes ───
@api_router.post("/auth/register")
async def register(data: UserRegister, response: Response):
    email = data.email.strip().lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "name": data.name,
        "email": email,
        "password": hash_password(data.password),
        "picture": None,
        "currency": "INR",
        "auth_type": "jwt",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_login": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_jwt(user_id)
    response.set_cookie(
        key="session_token", value=token, httponly=True,
        secure=True, samesite="none", path="/",
        max_age=JWT_EXPIRY_HOURS * 3600
    )
    return {"token": token, "user": {"user_id": user_id, "name": data.name, "email": email, "currency": "INR"}}

@api_router.post("/auth/login")
async def login(data: UserLogin, response: Response):
    email = data.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_jwt(user["user_id"])
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    response.set_cookie(
        key="session_token", value=token, httponly=True,
        secure=True, samesite="none", path="/",
        max_age=JWT_EXPIRY_HOURS * 3600
    )
    return {"token": token, "user": {
        "user_id": user["user_id"], "name": user["name"],
        "email": user["email"], "currency": user.get("currency", "INR"),
        "picture": user.get("picture")
    }}

@api_router.post("/auth/session")
async def process_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    async with httpx.AsyncClient() as client_http:
        resp = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = resp.json()
    email = data.get("email")
    name = data.get("name")
    picture = data.get("picture")
    session_token = data.get("session_token")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "name": name, "email": email,
            "picture": picture, "currency": "INR", "auth_type": "google",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    response.set_cookie(
        key="session_token", value=session_token, httponly=True,
        secure=True, samesite="none", path="/", max_age=7*24*3600
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    safe_user = {k: v for k, v in user.items() if k != "password"}
    return {"user": safe_user, "token": session_token}

@api_router.get("/auth/me")
async def auth_me(request: Request):
    user = await get_current_user(request)
    safe_user = {k: v for k, v in user.items() if k != "password"}
    return safe_user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_many({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out"}


# ─── Password Recovery (Mock Email Mode) ───
# Tokens stored hashed (sha256) with TTL & one-time-use semantics.
# To swap in Resend/SendGrid later, replace _send_reset_email() body.

def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

async def _send_reset_email(email: str, reset_link: str, user_name: str = "User"):
    """Mock email dispatcher. Currently logs to console.
    Swap this implementation with Resend/SendGrid by replacing the body.
    """
    logger.info("=" * 70)
    logger.info("[MOCK EMAIL] Password Reset Request")
    logger.info(f"  To: {email}")
    logger.info("  Subject: Reset your BudgetWise password")
    logger.info(f"  Hi {user_name},")
    logger.info(f"  Click the link below to reset your password (expires in {RESET_TOKEN_EXPIRY_MINUTES} min):")
    logger.info(f"  {reset_link}")
    logger.info("=" * 70)

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, request: Request):
    """Initiate password recovery. Always returns success (prevents email enumeration).
    In dev mode (IS_DEV=true), returns the reset link so portfolio demos work without email.
    """
    email = data.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})

    generic_response = {
        "message": "If an account exists with that email, a password reset link has been sent."
    }

    if not user:
        # Do not leak existence — return generic success
        return generic_response

    if user.get("auth_type") == "google" and not user.get("password"):
        # Google-only users have no local password
        return generic_response

    # Generate cryptographically-secure raw token (sent to user) + hashed token (stored)
    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_EXPIRY_MINUTES)

    # Invalidate older tokens for this user
    await db.password_reset_tokens.delete_many({"user_id": user["user_id"]})

    await db.password_reset_tokens.insert_one({
        "user_id": user["user_id"],
        "email": email,
        "token_hash": token_hash,
        "expires_at": expires_at,
        "used": False,
        "created_at": datetime.now(timezone.utc),
    })

    # Build absolute reset link. Prefer the explicit FRONTEND_URL env var when it's
    # configured for production; otherwise (e.g. when running with the dev default)
    # fall back to the incoming request's Origin so portfolio/preview hosts work
    # automatically without needing to re-edit .env.
    if FRONTEND_URL and not FRONTEND_URL.startswith("http://localhost"):
        frontend_host = FRONTEND_URL.rstrip("/")
    else:
        frontend_host = (request.headers.get("origin") or FRONTEND_URL).rstrip("/")
    reset_link = f"{frontend_host}/reset-password?token={raw_token}"
    await _send_reset_email(email, reset_link, user.get("name", "User"))

    response_payload = dict(generic_response)
    # In dev / portfolio mode, expose the link so the user can complete the flow without a real inbox
    if IS_DEV:
        response_payload["dev_reset_link"] = reset_link
        response_payload["dev_token"] = raw_token
        response_payload["expires_in_minutes"] = RESET_TOKEN_EXPIRY_MINUTES
    return response_payload

@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Consume a reset token & set a new password (one-time use)."""
    if not data.token or not data.new_password:
        raise HTTPException(status_code=400, detail="Token and new password are required")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    token_hash = _hash_token(data.token)
    record = await db.password_reset_tokens.find_one({"token_hash": token_hash})
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    if record.get("used"):
        raise HTTPException(status_code=400, detail="This reset link has already been used")

    expires_at = record.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This reset link has expired")

    user = await db.users.find_one({"user_id": record["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password": new_hash, "auth_type": user.get("auth_type", "jwt")}}
    )
    await db.password_reset_tokens.update_one(
        {"_id": record["_id"]},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc)}}
    )
    # Invalidate any sessions
    await db.user_sessions.delete_many({"user_id": user["user_id"]})

    return {"message": "Password updated successfully. Please sign in with your new password."}


# ─── Google OAuth (Direct) ───
@api_router.get("/auth/google/url")
async def google_auth_url(redirect_uri: str):
    """Returns the Google OAuth authorization URL"""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return {"url": f"https://accounts.google.com/o/oauth2/v2/auth?{query}"}

@api_router.post("/auth/google/callback")
async def google_auth_callback(request: Request, response: Response):
    """Exchange Google auth code for tokens and create/login user"""
    body = await request.json()
    code = body.get("code")
    redirect_uri = body.get("redirect_uri")
    if not code or not redirect_uri:
        raise HTTPException(status_code=400, detail="code and redirect_uri required")
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    # Exchange code for tokens
    async with httpx.AsyncClient() as http_client:
        token_resp = await http_client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    if token_resp.status_code != 200:
        logger.error(f"Google token exchange failed: {token_resp.text}")
        raise HTTPException(status_code=401, detail="Failed to authenticate with Google")

    tokens = token_resp.json()
    access_token = tokens.get("access_token")

    # Get user info from Google
    async with httpx.AsyncClient() as http_client:
        userinfo_resp = await http_client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if userinfo_resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Failed to get user info from Google")

    guser = userinfo_resp.json()
    email = guser.get("email")
    name = guser.get("name", email)
    picture = guser.get("picture")

    if not email:
        raise HTTPException(status_code=400, detail="No email from Google")

    # Create or update user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "name": name, "picture": picture,
            "last_login": datetime.now(timezone.utc).isoformat()
        }})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "name": name, "email": email,
            "picture": picture, "currency": "INR", "auth_type": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_login": datetime.now(timezone.utc).isoformat()
        })

    # Create JWT
    token = create_jwt(user_id)
    response.set_cookie(
        key="session_token", value=token, httponly=True,
        secure=True, samesite="none", path="/",
        max_age=JWT_EXPIRY_HOURS * 3600
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    safe_user = {k: v for k, v in user.items() if k != "password"}
    return {"token": token, "user": safe_user}


# ─── Settings ───
@api_router.get("/settings")
async def get_settings(request: Request):
    user = await get_current_user(request)
    return {"currency": user.get("currency", "INR")}

@api_router.put("/settings")
async def update_settings(data: SettingsUpdate, request: Request):
    user = await get_current_user(request)
    updates = {}
    if data.currency:
        updates["currency"] = data.currency
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    return {"message": "Settings updated", "currency": data.currency or user.get("currency", "INR")}

@api_router.get("/currencies")
async def get_currencies():
    return CURRENCIES

@api_router.get("/categories")
async def get_categories():
    return CATEGORIES


# ─── Transactions CRUD ───
@api_router.post("/transactions")
async def create_transaction(data: TransactionCreate, request: Request):
    user = await get_current_user(request)
    txn_id = f"txn_{uuid.uuid4().hex[:12]}"
    txn_date = data.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = {
        "txn_id": txn_id,
        "user_id": user["user_id"],
        "type": data.type,
        "amount": data.amount,
        "category": data.category,
        "description": data.description,
        "date": txn_date,
        "account_id": data.account_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.transactions.insert_one(doc)
    # Update account balance if account_id is provided
    if data.account_id:
        balance_change = data.amount if data.type == "income" else -data.amount
        await db.accounts.update_one(
            {"account_id": data.account_id, "user_id": user["user_id"]},
            {"$inc": {"balance": balance_change}}
        )
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.get("/transactions")
async def get_transactions(
    request: Request,
    type: Optional[str] = None,
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    account_id: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    search: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
):
    user = await get_current_user(request)
    query = {"user_id": user["user_id"]}
    if type and type != "all":
        query["type"] = type
    if category and category != "all":
        query["category"] = category
    if account_id:
        query["account_id"] = account_id
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = end_date
        query["date"] = date_filter
    if min_amount is not None or max_amount is not None:
        amt_filter = {}
        if min_amount is not None:
            amt_filter["$gte"] = min_amount
        if max_amount is not None:
            amt_filter["$lte"] = max_amount
        query["amount"] = amt_filter
    if search:
        # Case-insensitive search across description and category
        safe = search.strip()
        if safe:
            query["$or"] = [
                {"description": {"$regex": safe, "$options": "i"}},
                {"category": {"$regex": safe, "$options": "i"}},
            ]
    txns = await db.transactions.find(query, {"_id": 0}).sort("date", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.transactions.count_documents(query)
    return {"transactions": txns, "total": total}

@api_router.put("/transactions/{txn_id}")
async def update_transaction(txn_id: str, data: TransactionUpdate, request: Request):
    user = await get_current_user(request)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    result = await db.transactions.update_one(
        {"txn_id": txn_id, "user_id": user["user_id"]}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    updated = await db.transactions.find_one({"txn_id": txn_id}, {"_id": 0})
    return updated

@api_router.delete("/transactions/{txn_id}")
async def delete_transaction(txn_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.transactions.delete_one({"txn_id": txn_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"message": "Transaction deleted"}

@api_router.get("/transactions/export")
async def export_transactions(
    request: Request,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    type: Optional[str] = None,
    category: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    search: Optional[str] = None,
):
    user = await get_current_user(request)
    query = {"user_id": user["user_id"]}
    if type and type != "all":
        query["type"] = type
    if category and category != "all":
        query["category"] = category
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = end_date
        query["date"] = date_filter
    if min_amount is not None or max_amount is not None:
        amt_filter = {}
        if min_amount is not None:
            amt_filter["$gte"] = min_amount
        if max_amount is not None:
            amt_filter["$lte"] = max_amount
        query["amount"] = amt_filter
    if search:
        safe = search.strip()
        if safe:
            query["$or"] = [
                {"description": {"$regex": safe, "$options": "i"}},
                {"category": {"$regex": safe, "$options": "i"}},
            ]
    txns = await db.transactions.find(query, {"_id": 0, "user_id": 0}).sort("date", -1).to_list(10000)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["txn_id", "type", "amount", "category", "description", "date", "account_id", "created_at"])
    writer.writeheader()
    for t in txns:
        writer.writerow(t)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"}
    )


# ─── Accounts CRUD ───
@api_router.post("/accounts")
async def create_account(data: AccountCreate, request: Request):
    user = await get_current_user(request)
    if data.account_type not in ACCOUNT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid account type. Must be one of: {ACCOUNT_TYPES}")
    account_id = f"acc_{uuid.uuid4().hex[:12]}"
    doc = {
        "account_id": account_id,
        "user_id": user["user_id"],
        "name": data.name,
        "account_type": data.account_type,
        "balance": data.balance,
        "color": data.color or "#818cf8",
        "icon": data.icon or "wallet",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.accounts.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.get("/accounts")
async def get_accounts(request: Request):
    user = await get_current_user(request)
    accounts = await db.accounts.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(50)
    return accounts

@api_router.get("/accounts/{account_id}")
async def get_account(account_id: str, request: Request):
    user = await get_current_user(request)
    account = await db.accounts.find_one({"account_id": account_id, "user_id": user["user_id"]}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account

@api_router.put("/accounts/{account_id}")
async def update_account(account_id: str, data: AccountUpdate, request: Request):
    user = await get_current_user(request)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    result = await db.accounts.update_one(
        {"account_id": account_id, "user_id": user["user_id"]}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    updated = await db.accounts.find_one({"account_id": account_id}, {"_id": 0})
    return updated

@api_router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.accounts.delete_one({"account_id": account_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    # Unlink transactions from this account
    await db.transactions.update_many(
        {"account_id": account_id, "user_id": user["user_id"]},
        {"$set": {"account_id": None}}
    )
    return {"message": "Account deleted"}

@api_router.get("/account-types")
async def get_account_types():
    return ACCOUNT_TYPES


# ─── Budget Goals CRUD ───
@api_router.post("/budget-goals")
async def create_budget_goal(data: BudgetGoalCreate, request: Request):
    user = await get_current_user(request)
    # Prevent duplicates per (user, category, period)
    existing = await db.budget_goals.find_one({
        "user_id": user["user_id"],
        "category": data.category,
        "period": data.period,
    }, {"_id": 0})
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A {data.period} budget for {data.category} already exists. Edit it instead."
        )
    goal_id = f"goal_{uuid.uuid4().hex[:12]}"
    doc = {
        "goal_id": goal_id,
        "user_id": user["user_id"],
        "category": data.category,
        "limit_amount": data.limit_amount,
        "period": data.period,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.budget_goals.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.get("/budget-goals")
async def get_budget_goals(request: Request):
    user = await get_current_user(request)
    goals = await db.budget_goals.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    # Calculate spent amount per goal
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1).strftime("%Y-%m-%d")
    end_of_month = now.strftime("%Y-%m-%d")
    for goal in goals:
        pipeline = [
            {"$match": {
                "user_id": user["user_id"],
                "type": "expense",
                "category": goal["category"],
                "date": {"$gte": start_of_month, "$lte": end_of_month}
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        result = await db.transactions.aggregate(pipeline).to_list(1)
        goal["spent"] = result[0]["total"] if result else 0
    return goals

@api_router.put("/budget-goals/{goal_id}")
async def update_budget_goal(goal_id: str, data: BudgetGoalUpdate, request: Request):
    user = await get_current_user(request)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    # If category or period is changing, ensure no duplicate exists
    if "category" in updates or "period" in updates:
        current = await db.budget_goals.find_one({"goal_id": goal_id, "user_id": user["user_id"]}, {"_id": 0})
        if not current:
            raise HTTPException(status_code=404, detail="Goal not found")
        new_cat = updates.get("category", current["category"])
        new_period = updates.get("period", current["period"])
        if new_cat != current["category"] or new_period != current["period"]:
            dupe = await db.budget_goals.find_one({
                "user_id": user["user_id"],
                "category": new_cat,
                "period": new_period,
                "goal_id": {"$ne": goal_id},
            }, {"_id": 0})
            if dupe:
                raise HTTPException(
                    status_code=409,
                    detail=f"A {new_period} budget for {new_cat} already exists."
                )
    result = await db.budget_goals.update_one(
        {"goal_id": goal_id, "user_id": user["user_id"]}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    updated = await db.budget_goals.find_one({"goal_id": goal_id}, {"_id": 0})
    return updated

@api_router.delete("/budget-goals/{goal_id}")
async def delete_budget_goal(goal_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.budget_goals.delete_one({"goal_id": goal_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"message": "Goal deleted"}


# ─── Analytics (Python/Pandas) ───
@api_router.get("/analytics/summary")
async def analytics_summary(request: Request, period: str = "month"):
    user = await get_current_user(request)
    now = datetime.now(timezone.utc)
    if period == "month":
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    elif period == "year":
        start_date = now.replace(month=1, day=1).strftime("%Y-%m-%d")
    elif period == "week":
        start_date = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
    else:
        start_date = "2000-01-01"
    end_date = now.strftime("%Y-%m-%d")

    txns = await db.transactions.find(
        {"user_id": user["user_id"], "date": {"$gte": start_date, "$lte": end_date}},
        {"_id": 0}
    ).to_list(10000)

    if not txns:
        return {
            "total_income": 0, "total_expenses": 0, "net_balance": 0,
            "income_count": 0, "expense_count": 0, "total_transactions": 0,
            "status": "No Data"
        }

    df = pd.DataFrame(txns)
    income_df = df[df["type"] == "income"]
    expense_df = df[df["type"] == "expense"]
    total_income = float(income_df["amount"].sum()) if not income_df.empty else 0
    total_expenses = float(expense_df["amount"].sum()) if not expense_df.empty else 0
    net_balance = total_income - total_expenses

    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "net_balance": net_balance,
        "income_count": len(income_df),
        "expense_count": len(expense_df),
        "total_transactions": len(df),
        "status": "Surplus" if net_balance >= 0 else "Deficit"
    }

@api_router.get("/analytics/spending-by-category")
async def spending_by_category(request: Request, period: str = "month"):
    user = await get_current_user(request)
    now = datetime.now(timezone.utc)
    if period == "month":
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    elif period == "year":
        start_date = now.replace(month=1, day=1).strftime("%Y-%m-%d")
    elif period == "week":
        start_date = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
    else:
        start_date = "2000-01-01"

    txns = await db.transactions.find(
        {"user_id": user["user_id"], "type": "expense", "date": {"$gte": start_date, "$lte": now.strftime("%Y-%m-%d")}},
        {"_id": 0}
    ).to_list(10000)

    if not txns:
        return []

    df = pd.DataFrame(txns)
    grouped = df.groupby("category")["amount"].sum().reset_index()
    grouped.columns = ["category", "amount"]
    grouped = grouped.sort_values("amount", ascending=False)
    return grouped.to_dict(orient="records")

@api_router.get("/analytics/income-vs-expenses")
async def income_vs_expenses(request: Request, period: str = "month"):
    user = await get_current_user(request)
    now = datetime.now(timezone.utc)
    if period == "month":
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    elif period == "year":
        start_date = now.replace(month=1, day=1).strftime("%Y-%m-%d")
    elif period == "week":
        start_date = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
    else:
        start_date = "2000-01-01"

    txns = await db.transactions.find(
        {"user_id": user["user_id"], "date": {"$gte": start_date, "$lte": now.strftime("%Y-%m-%d")}},
        {"_id": 0}
    ).to_list(10000)

    if not txns:
        return {"income": 0, "expenses": 0}

    df = pd.DataFrame(txns)
    income = float(df[df["type"] == "income"]["amount"].sum())
    expenses = float(df[df["type"] == "expense"]["amount"].sum())
    return {"income": income, "expenses": expenses}

@api_router.get("/analytics/monthly-trends")
async def monthly_trends(request: Request, months: int = 6):
    user = await get_current_user(request)
    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=months * 30)).strftime("%Y-%m-%d")

    txns = await db.transactions.find(
        {"user_id": user["user_id"], "date": {"$gte": start_date}},
        {"_id": 0}
    ).to_list(10000)

    if not txns:
        return []

    df = pd.DataFrame(txns)
    df["month"] = pd.to_datetime(df["date"]).dt.to_period("M").astype(str)
    income_by_month = df[df["type"] == "income"].groupby("month")["amount"].sum()
    expense_by_month = df[df["type"] == "expense"].groupby("month")["amount"].sum()

    all_months = sorted(set(income_by_month.index) | set(expense_by_month.index))
    result = []
    for m in all_months:
        result.append({
            "month": m,
            "income": float(income_by_month.get(m, 0)),
            "expenses": float(expense_by_month.get(m, 0)),
        })
    return result

@api_router.get("/analytics/top-expenses")
async def top_expenses(request: Request, period: str = "month", limit: int = 5):
    user = await get_current_user(request)
    now = datetime.now(timezone.utc)
    if period == "month":
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    elif period == "year":
        start_date = now.replace(month=1, day=1).strftime("%Y-%m-%d")
    else:
        start_date = "2000-01-01"

    txns = await db.transactions.find(
        {"user_id": user["user_id"], "type": "expense", "date": {"$gte": start_date, "$lte": now.strftime("%Y-%m-%d")}},
        {"_id": 0}
    ).sort("amount", -1).limit(limit).to_list(limit)
    return txns


# ─── Period helpers for insights / comparison ───
def _month_bounds(year: int, month: int):
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        next_start = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_start = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    end = next_start - timedelta(days=1)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


async def _aggregate_period(user_id: str, start_date: str, end_date: str):
    """Return totals + per-category expense breakdown for given window.

    Uses a single MongoDB $facet aggregation so the entire computation happens
    in-DB (no docs streamed into Python). Scales to millions of transactions.
    """
    pipeline = [
        {"$match": {
            "user_id": user_id,
            "date": {"$gte": start_date, "$lte": end_date},
        }},
        {"$facet": {
            "totals": [
                {"$group": {
                    "_id": "$type",
                    "total": {"$sum": "$amount"},
                    "count": {"$sum": 1},
                }},
            ],
            "expenseByCategory": [
                {"$match": {"type": "expense"}},
                {"$group": {
                    "_id": {"$ifNull": ["$category", "Other"]},
                    "total": {"$sum": "$amount"},
                }},
            ],
        }},
    ]
    cursor = db.transactions.aggregate(pipeline)
    result = await cursor.to_list(1)
    if not result:
        return {"income": 0.0, "expenses": 0.0, "net": 0.0, "by_category": {}, "count": 0}

    doc = result[0]
    income = 0.0
    expenses = 0.0
    count = 0
    for row in doc.get("totals", []):
        amt = float(row.get("total") or 0)
        count += int(row.get("count") or 0)
        if row["_id"] == "income":
            income = amt
        elif row["_id"] == "expense":
            expenses = amt
    by_category = {
        row["_id"]: float(row.get("total") or 0)
        for row in doc.get("expenseByCategory", [])
        if row.get("_id") is not None
    }
    return {
        "income": income,
        "expenses": expenses,
        "net": income - expenses,
        "by_category": by_category,
        "count": count,
    }


@api_router.get("/analytics/monthly-comparison")
async def monthly_comparison(request: Request):
    """Compare current month vs previous month: income, expenses, savings, growth %."""
    user = await get_current_user(request)
    now = datetime.now(timezone.utc)
    cur_start, cur_end = _month_bounds(now.year, now.month)
    prev_year, prev_month = (now.year - 1, 12) if now.month == 1 else (now.year, now.month - 1)
    prev_start, prev_end = _month_bounds(prev_year, prev_month)

    cur = await _aggregate_period(user["user_id"], cur_start, cur_end)
    prev = await _aggregate_period(user["user_id"], prev_start, prev_end)

    def pct_change(curr_val: float, prev_val: float) -> Optional[float]:
        if prev_val == 0:
            return None if curr_val == 0 else 100.0
        return round(((curr_val - prev_val) / prev_val) * 100, 1)

    return {
        "current": {
            "label": now.strftime("%b %Y"),
            "income": cur["income"],
            "expenses": cur["expenses"],
            "net_savings": cur["net"],
        },
        "previous": {
            "label": datetime(prev_year, prev_month, 1).strftime("%b %Y"),
            "income": prev["income"],
            "expenses": prev["expenses"],
            "net_savings": prev["net"],
        },
        "growth": {
            "income_pct": pct_change(cur["income"], prev["income"]),
            "expenses_pct": pct_change(cur["expenses"], prev["expenses"]),
            "savings_pct": pct_change(cur["net"], prev["net"]),
        },
    }


@api_router.get("/analytics/insights")
async def analytics_insights(request: Request):
    """Generate data-driven financial insights from current vs previous month."""
    user = await get_current_user(request)
    now = datetime.now(timezone.utc)
    cur_start, cur_end = _month_bounds(now.year, now.month)
    prev_year, prev_month = (now.year - 1, 12) if now.month == 1 else (now.year, now.month - 1)
    prev_start, prev_end = _month_bounds(prev_year, prev_month)

    cur = await _aggregate_period(user["user_id"], cur_start, cur_end)
    prev = await _aggregate_period(user["user_id"], prev_start, prev_end)

    insights: List[dict] = []

    # Per-category growth/trend insights (top 5 changes)
    all_cats = set(cur["by_category"].keys()) | set(prev["by_category"].keys())
    cat_changes = []
    for cat in all_cats:
        c = cur["by_category"].get(cat, 0)
        p = prev["by_category"].get(cat, 0)
        if p == 0 and c == 0:
            continue
        if p == 0:
            pct = None  # new category this month
            delta = c
        else:
            pct = round(((c - p) / p) * 100, 1)
            delta = c - p
        cat_changes.append({"category": cat, "current": c, "previous": p, "pct": pct, "delta": delta})

    cat_changes.sort(key=lambda x: abs(x["pct"]) if x["pct"] is not None else 999, reverse=True)

    for change in cat_changes[:4]:
        cat = change["category"]
        pct = change["pct"]
        if pct is None:
            insights.append({
                "type": "trend",
                "direction": "new",
                "category": cat,
                "message": f"New spending in {cat} this month: \u20b9{change['current']:,.0f}",
                "icon": "sparkles",
            })
        elif pct >= 10:
            insights.append({
                "type": "trend",
                "direction": "up",
                "category": cat,
                "message": f"{cat} spending increased by {abs(pct):.0f}% compared to last month",
                "icon": "trending-up",
            })
        elif pct <= -10:
            insights.append({
                "type": "trend",
                "direction": "down",
                "category": cat,
                "message": f"{cat} expenses decreased by {abs(pct):.0f}%",
                "icon": "trending-down",
            })

    # Savings insight
    savings_delta = cur["net"] - prev["net"]
    if prev["net"] != 0:
        savings_pct = round(((cur["net"] - prev["net"]) / abs(prev["net"])) * 100, 1)
    else:
        savings_pct = None
    if savings_delta > 0:
        msg = f"You saved \u20b9{savings_delta:,.0f} more than last month"
        if savings_pct is not None:
            msg += f" (+{abs(savings_pct):.0f}%)"
        insights.append({
            "type": "savings", "direction": "up",
            "message": msg, "icon": "piggy-bank",
        })
    elif savings_delta < 0:
        insights.append({
            "type": "savings", "direction": "down",
            "message": f"Your savings dropped by \u20b9{abs(savings_delta):,.0f} vs last month",
            "icon": "alert-circle",
        })

    # Highest and lowest category this month
    if cur["by_category"]:
        top_cat = max(cur["by_category"].items(), key=lambda x: x[1])
        low_cat = min(cur["by_category"].items(), key=lambda x: x[1])
        insights.append({
            "type": "category",
            "direction": "neutral",
            "message": f"Highest spending category: {top_cat[0]} (\u20b9{top_cat[1]:,.0f})",
            "icon": "award",
        })
        if top_cat[0] != low_cat[0]:
            insights.append({
                "type": "category",
                "direction": "neutral",
                "message": f"Lowest spending category: {low_cat[0]} (\u20b9{low_cat[1]:,.0f})",
                "icon": "leaf",
            })

    # Budget utilization recommendations
    goals = await db.budget_goals.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    for goal in goals:
        spent = cur["by_category"].get(goal["category"], 0)
        limit = goal.get("limit_amount", 0)
        if limit <= 0:
            continue
        pct = (spent / limit) * 100
        if pct >= 100:
            insights.append({
                "type": "recommendation",
                "direction": "down",
                "message": f"You have exceeded your {goal['category']} budget by \u20b9{spent - limit:,.0f}",
                "icon": "alert-triangle",
            })
        elif pct >= 80:
            insights.append({
                "type": "recommendation",
                "direction": "warning",
                "message": f"You're close to exceeding your {goal['category']} budget ({pct:.0f}% used)",
                "icon": "alert-circle",
            })

    # Savings rate insight
    if cur["income"] > 0:
        rate = (cur["net"] / cur["income"]) * 100
        if rate >= 20:
            insights.append({
                "type": "recommendation", "direction": "up",
                "message": f"Great! Your savings rate is {rate:.0f}% this month",
                "icon": "thumbs-up",
            })
        elif rate < 10 and cur["expenses"] > 0:
            insights.append({
                "type": "recommendation", "direction": "warning",
                "message": f"Savings rate is only {rate:.0f}% \u2014 consider cutting non-essentials",
                "icon": "lightbulb",
            })

    if not insights:
        insights.append({
            "type": "info", "direction": "neutral",
            "message": "Add more transactions to unlock personalized insights",
            "icon": "info",
        })

    return {"insights": insights[:8]}


@api_router.get("/analytics/dashboard-kpis")
async def dashboard_kpis(request: Request):
    """KPI summary for dashboard: income, expenses, savings, savings rate, top category."""
    user = await get_current_user(request)
    now = datetime.now(timezone.utc)
    cur_start, cur_end = _month_bounds(now.year, now.month)
    cur = await _aggregate_period(user["user_id"], cur_start, cur_end)

    income = cur["income"]
    expenses = cur["expenses"]
    net = cur["net"]
    rate = round((net / income) * 100, 1) if income > 0 else 0.0

    top_category = None
    if cur["by_category"]:
        cat_name, cat_amt = max(cur["by_category"].items(), key=lambda x: x[1])
        top_category = {"category": cat_name, "amount": cat_amt}

    return {
        "total_income": income,
        "total_expenses": expenses,
        "net_savings": net,
        "savings_rate": rate,
        "top_category": top_category,
        "transaction_count": cur["count"],
    }


# ─── PDF Financial Report ───
def _generate_chart_pie(category_data: List[dict]) -> str:
    """Generate base64-encoded PNG pie chart for expense categories."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    if not category_data:
        return ""
    fig, ax = plt.subplots(figsize=(5, 4), dpi=120)
    labels = [c["category"] for c in category_data[:8]]
    sizes = [c["amount"] for c in category_data[:8]]
    colors = ['#818cf8', '#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#fb923c', '#f87171', '#22d3ee']
    wedges, _, autotexts = ax.pie(
        sizes, labels=labels, colors=colors[:len(sizes)],
        autopct='%1.1f%%', startangle=90,
        textprops={'fontsize': 9, 'color': '#334155'},
        wedgeprops={'edgecolor': 'white', 'linewidth': 2}
    )
    for t in autotexts:
        t.set_color('white')
        t.set_fontweight('bold')
    ax.set_title('Expense Breakdown', fontsize=13, fontweight='bold', color='#0f172a', pad=14)
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')


def _generate_chart_trends(trends: List[dict], currency_symbol: str) -> str:
    """Generate base64-encoded PNG line chart for monthly trends."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    if not trends:
        return ""
    fig, ax = plt.subplots(figsize=(7, 3.5), dpi=120)
    months = [t["month"] for t in trends]
    incomes = [t["income"] for t in trends]
    expenses = [t["expenses"] for t in trends]
    ax.plot(months, incomes, marker='o', color='#10b981', linewidth=2.5, label='Income', markersize=6)
    ax.plot(months, expenses, marker='o', color='#ef4444', linewidth=2.5, label='Expenses', markersize=6)
    ax.fill_between(months, incomes, alpha=0.12, color='#10b981')
    ax.fill_between(months, expenses, alpha=0.12, color='#ef4444')
    ax.set_title('Monthly Trends', fontsize=13, fontweight='bold', color='#0f172a', pad=14)
    ax.set_xlabel('Month', fontsize=10, color='#64748b')
    ax.set_ylabel(f'Amount ({currency_symbol})', fontsize=10, color='#64748b')
    ax.legend(loc='upper left', frameon=False)
    ax.grid(True, linestyle='--', alpha=0.3)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    plt.xticks(rotation=30, ha='right', fontsize=9)
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')


def _build_report_html(ctx: dict) -> str:
    """Build the HTML template for the PDF financial report."""
    sym = ctx["currency_symbol"]
    def fmt(v):
        return f"{sym}{v:,.0f}"

    summary = ctx["summary"]
    user_info = ctx["user"]
    insights = ctx["insights"]
    goals = ctx["goals"]
    transactions = ctx["transactions"]
    top_category = ctx["top_category"]
    pie_b64 = ctx["pie_b64"]
    trends_b64 = ctx["trends_b64"]
    generated_at = ctx["generated_at"]

    insights_html = ""
    if insights:
        for ins in insights[:6]:
            insights_html += f'<li class="insight-item">{ins.get("message", "")}</li>'
    else:
        insights_html = '<li class="insight-item muted">Add more transactions to unlock personalized insights.</li>'

    goals_html = ""
    if goals:
        for g in goals[:8]:
            spent = g.get("spent", 0)
            limit = g.get("limit_amount", 0)
            pct = (spent / limit * 100) if limit > 0 else 0
            bar_color = "#10b981" if pct < 80 else ("#f59e0b" if pct < 100 else "#ef4444")
            bar_width = min(pct, 100)
            goals_html += f"""
            <tr>
              <td>{g.get('category', '')}</td>
              <td class="num">{fmt(spent)} / {fmt(limit)}</td>
              <td class="num">{pct:.0f}%</td>
              <td>
                <div class="bar-wrap"><div class="bar" style="width:{bar_width}%;background:{bar_color}"></div></div>
              </td>
            </tr>"""
    else:
        goals_html = '<tr><td colspan="4" class="muted">No budget goals set.</td></tr>'

    txn_rows = ""
    if transactions:
        for t in transactions[:15]:
            cls = "income" if t.get("type") == "income" else "expense"
            sign = "+" if t.get("type") == "income" else "-"
            txn_rows += f"""
            <tr>
              <td>{t.get('date', '')}</td>
              <td>{t.get('description', '')}</td>
              <td>{t.get('category', '')}</td>
              <td class="num {cls}">{sign}{fmt(t.get('amount', 0))}</td>
            </tr>"""
    else:
        txn_rows = '<tr><td colspan="4" class="muted">No transactions in this period.</td></tr>'

    top_cat_html = ""
    if top_category:
        top_cat_html = f'<div class="kpi-mini"><div class="label">Top Spending Category</div><div class="value">{top_category["category"]} — {fmt(top_category["amount"])}</div></div>'

    pie_img = f'<img class="chart" src="data:image/png;base64,{pie_b64}"/>' if pie_b64 else '<p class="muted">No expense data to chart.</p>'
    trend_img = f'<img class="chart wide" src="data:image/png;base64,{trends_b64}"/>' if trends_b64 else '<p class="muted">No monthly trend data.</p>'

    savings_rate = summary["savings_rate"]
    rate_color = "#10b981" if savings_rate >= 20 else ("#f59e0b" if savings_rate >= 10 else "#ef4444")

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>BudgetWise Financial Report</title>
<style>
  @page {{ size: A4; margin: 18mm 14mm; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Helvetica', 'Arial', sans-serif; color: #1e293b; line-height: 1.5; font-size: 11pt; margin: 0; }}
  .header {{ border-bottom: 3px solid #6366f1; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }}
  .brand {{ font-size: 26pt; font-weight: 800; color: #6366f1; letter-spacing: -0.5px; }}
  .brand-sub {{ font-size: 10pt; color: #64748b; margin-top: 2px; }}
  .meta {{ text-align: right; font-size: 9pt; color: #64748b; }}
  .meta strong {{ color: #1e293b; }}
  h1 {{ font-size: 18pt; color: #0f172a; margin: 24px 0 8px; }}
  h2 {{ font-size: 13pt; color: #0f172a; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }}
  .user-card {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; }}
  .user-card .name {{ font-weight: 700; font-size: 12pt; color: #0f172a; }}
  .user-card .email {{ color: #64748b; font-size: 10pt; margin-top: 2px; }}
  .kpi-grid {{ display: flex; gap: 10px; margin: 14px 0 4px; }}
  .kpi {{ flex: 1; border-radius: 8px; padding: 14px; border: 1px solid #e2e8f0; background: #fff; }}
  .kpi.income {{ border-left: 4px solid #10b981; }}
  .kpi.expense {{ border-left: 4px solid #ef4444; }}
  .kpi.net {{ border-left: 4px solid #8b5cf6; }}
  .kpi.rate {{ border-left: 4px solid #6366f1; }}
  .kpi .label {{ font-size: 8pt; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 600; }}
  .kpi .value {{ font-size: 16pt; font-weight: 800; margin-top: 4px; color: #0f172a; }}
  .kpi.income .value {{ color: #059669; }}
  .kpi.expense .value {{ color: #dc2626; }}
  .kpi.net .value {{ color: #7c3aed; }}
  .kpi-mini {{ background: linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%); border-radius: 8px; padding: 12px 16px; margin: 12px 0; }}
  .kpi-mini .label {{ font-size: 8pt; text-transform: uppercase; letter-spacing: 0.6px; color: #92400e; font-weight: 600; }}
  .kpi-mini .value {{ font-size: 13pt; font-weight: 700; color: #78350f; margin-top: 2px; }}
  .charts-row {{ display: flex; gap: 14px; margin: 12px 0; align-items: flex-start; }}
  .chart-card {{ flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: #fff; }}
  .chart {{ max-width: 100%; height: auto; display: block; margin: 0 auto; }}
  .chart.wide {{ width: 100%; }}
  ul.insights {{ list-style: none; padding: 0; margin: 8px 0; }}
  .insight-item {{ padding: 8px 12px; background: #eef2ff; border-left: 3px solid #6366f1; margin-bottom: 6px; border-radius: 4px; font-size: 10pt; color: #312e81; }}
  .insight-item.muted {{ background: #f8fafc; border-left-color: #94a3b8; color: #64748b; font-style: italic; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9.5pt; }}
  th {{ text-align: left; background: #f1f5f9; color: #475569; font-weight: 600; padding: 8px 10px; border-bottom: 2px solid #e2e8f0; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.4px; }}
  td {{ padding: 7px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }}
  td.num {{ font-family: 'Courier New', monospace; text-align: right; font-weight: 600; }}
  td.income {{ color: #059669; }}
  td.expense {{ color: #dc2626; }}
  td.muted {{ text-align: center; color: #94a3b8; font-style: italic; }}
  .bar-wrap {{ background: #f1f5f9; height: 8px; border-radius: 4px; overflow: hidden; width: 100%; }}
  .bar {{ height: 100%; border-radius: 4px; }}
  .muted {{ color: #94a3b8; }}
  .footer {{ margin-top: 28px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 8pt; color: #94a3b8; }}
  .rate-pill {{ display: inline-block; padding: 3px 10px; border-radius: 12px; font-weight: 700; color: white; background: {rate_color}; font-size: 10pt; }}
</style></head>
<body>
  <div class="header">
    <div>
      <div class="brand">BudgetWise</div>
      <div class="brand-sub">Personal Financial Report</div>
    </div>
    <div class="meta">
      <div><strong>Generated:</strong> {generated_at}</div>
      <div><strong>Period:</strong> {ctx['period_label']}</div>
    </div>
  </div>

  <div class="user-card">
    <div class="name">{user_info['name']}</div>
    <div class="email">{user_info['email']}</div>
  </div>

  <h2>Financial Summary</h2>
  <div class="kpi-grid">
    <div class="kpi income"><div class="label">Total Income</div><div class="value">{fmt(summary['total_income'])}</div></div>
    <div class="kpi expense"><div class="label">Total Expenses</div><div class="value">{fmt(summary['total_expenses'])}</div></div>
    <div class="kpi net"><div class="label">Net Savings</div><div class="value">{fmt(summary['net_savings'])}</div></div>
    <div class="kpi rate"><div class="label">Savings Rate</div><div class="value"><span class="rate-pill">{savings_rate:.1f}%</span></div></div>
  </div>

  {top_cat_html}

  <h2>AI Financial Insights</h2>
  <ul class="insights">{insights_html}</ul>

  <h2>Budget Goals</h2>
  <table>
    <thead><tr><th>Category</th><th class="num">Spent / Limit</th><th class="num">Usage</th><th>Progress</th></tr></thead>
    <tbody>{goals_html}</tbody>
  </table>

  <h2>Charts</h2>
  <div class="charts-row">
    <div class="chart-card">{pie_img}</div>
  </div>
  <div class="chart-card">{trend_img}</div>

  <h2>Recent Transactions</h2>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr></thead>
    <tbody>{txn_rows}</tbody>
  </table>

  <div class="footer">
    BudgetWise &middot; AI-Powered Personal Finance Management &middot; This report is generated for your personal use only.
  </div>
</body></html>"""


@api_router.get("/reports/pdf")
async def generate_pdf_report(request: Request):
    """Generate a professional PDF financial report for the current month."""
    user = await get_current_user(request)
    user_id = user["user_id"]
    currency = user.get("currency", "INR")
    sym = next((c["symbol"] for c in CURRENCIES if c["code"] == currency), "\u20B9")

    now = datetime.now(timezone.utc)
    cur_start, cur_end = _month_bounds(now.year, now.month)
    cur = await _aggregate_period(user_id, cur_start, cur_end)
    income = cur["income"]
    expenses = cur["expenses"]
    net = cur["net"]
    rate = round((net / income) * 100, 1) if income > 0 else 0.0
    top_category = None
    if cur["by_category"]:
        cat_name, cat_amt = max(cur["by_category"].items(), key=lambda x: x[1])
        top_category = {"category": cat_name, "amount": cat_amt}

    # Spending by category (sorted desc)
    category_data = [{"category": k, "amount": float(v)} for k, v in cur["by_category"].items()]
    category_data.sort(key=lambda x: x["amount"], reverse=True)

    # Monthly trends (last 6 months)
    six_months_ago = (now - timedelta(days=180)).strftime("%Y-%m-%d")
    raw_txns = await db.transactions.find(
        {"user_id": user_id, "date": {"$gte": six_months_ago}}, {"_id": 0}
    ).to_list(20000)
    trends = []
    if raw_txns:
        df = pd.DataFrame(raw_txns)
        df["month"] = pd.to_datetime(df["date"]).dt.to_period("M").astype(str)
        im = df[df["type"] == "income"].groupby("month")["amount"].sum()
        em = df[df["type"] == "expense"].groupby("month")["amount"].sum()
        all_months = sorted(set(im.index) | set(em.index))
        trends = [{"month": m, "income": float(im.get(m, 0)), "expenses": float(em.get(m, 0))} for m in all_months]

    # Recent transactions (current month)
    recent_txns = await db.transactions.find(
        {"user_id": user_id, "date": {"$gte": cur_start, "$lte": cur_end}}, {"_id": 0}
    ).sort("date", -1).limit(15).to_list(15)

    # Insights
    insights_resp = await analytics_insights(request)
    insights = insights_resp.get("insights", [])

    # Budget goals
    goals = await db.budget_goals.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    for g in goals:
        g["spent"] = float(cur["by_category"].get(g["category"], 0))

    pie_b64 = _generate_chart_pie(category_data)
    trends_b64 = _generate_chart_trends(trends, sym)

    ctx = {
        "user": {"name": user.get("name", "User"), "email": user.get("email", "")},
        "currency_symbol": sym,
        "summary": {
            "total_income": income,
            "total_expenses": expenses,
            "net_savings": net,
            "savings_rate": rate,
        },
        "top_category": top_category,
        "insights": insights,
        "goals": goals,
        "transactions": recent_txns,
        "pie_b64": pie_b64,
        "trends_b64": trends_b64,
        "generated_at": now.strftime("%d %b %Y, %H:%M UTC"),
        "period_label": now.strftime("%B %Y"),
    }

    html = _build_report_html(ctx)

    # Render PDF with WeasyPrint (HTML/CSS -> PDF, charts embedded as base64 PNGs)
    try:
        from weasyprint import HTML
        pdf_bytes = HTML(string=html).write_pdf()
    except Exception as e:
        logger.exception("PDF generation failed")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

    filename = f"BudgetWise_Report_{now.strftime('%Y-%m')}.pdf"
    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        }
    )


# Include router and middleware
app.include_router(api_router)

# CORS: browsers require an explicit echoed origin (NOT "*") when credentials are sent.
# - If CORS_ORIGINS is "*" (or unset), match any origin via regex (origin will be echoed back).
# - Otherwise use the explicit comma-separated whitelist.
_cors_env = os.environ.get('CORS_ORIGINS', '*').strip()
if _cors_env == '*' or _cors_env == '':
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origin_regex=".*",
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=[o.strip() for o in _cors_env.split(',') if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.on_event("startup")
async def ensure_indexes():
    """Create indexes for fast user-scoped queries & analytics aggregations."""
    try:
        await db.transactions.create_index([("user_id", 1), ("date", -1)])
        await db.transactions.create_index([("user_id", 1), ("type", 1), ("category", 1)])
        await db.budget_goals.create_index([("user_id", 1), ("category", 1), ("period", 1)])
        await db.users.create_index("email", unique=True)
        # TTL index — password reset tokens auto-delete at expires_at
        await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
        await db.password_reset_tokens.create_index("token_hash")
        logger.info("MongoDB indexes ensured")
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Index creation skipped: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
