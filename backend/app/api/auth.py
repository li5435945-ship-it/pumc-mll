import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta

from app.db import get_db
from app.config import get_settings
from app.redis import get_redis, is_redis_available
from app.api.deps import get_current_user
from app.models import User
from app.schemas import ApiResponse, LoginRequest, LoginResponse, UserOut, ProfileUpdate

router = APIRouter(prefix="/auth", tags=["认证"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()
security = HTTPBearer()


def create_token(user_id: int, role: str) -> str:
    """Create a JWT access token."""
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "role": role, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/login", response_model=ApiResponse[LoginResponse])
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with email + password, receive a JWT token."""
    result = await db.execute(
        select(User).where(User.email == body.email, User.is_active == True)
    )
    user = result.scalar_one_or_none()

    if not user or not pwd_ctx.verify(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
        )

    token = create_token(user.id, user.role)

    # Store session in Redis (if available)
    redis = get_redis()
    if redis:
        session_key = f"session:{user.id}"
        await redis.setex(session_key, settings.JWT_EXPIRE_MINUTES * 60, token)

    return ApiResponse(data=LoginResponse(
        token=token,
        user=UserOut.model_validate(user),
    ))


@router.get("/me", response_model=ApiResponse[UserOut])
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return ApiResponse(data=UserOut.model_validate(current_user))


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """Logout endpoint. Deletes the session from Redis."""
    redis = get_redis()
    if redis:
        session_key = f"session:{current_user.id}"
        await redis.delete(session_key)
    return {"message": "已退出登录"}


@router.put("/profile", response_model=ApiResponse[UserOut])
async def update_profile(
    body: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update nickname and/or avatar_url for the current user."""
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="没有需要更新的字段",
        )

    for field, value in update_data.items():
        setattr(current_user, field, value)

    # Merge the detached instance into the session and flush changes
    db.add(current_user)
    await db.flush()
    await db.refresh(current_user)

    return ApiResponse(data=UserOut.model_validate(current_user))


# Allowed image extensions for avatar upload
AVATAR_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


@router.post("/avatar", response_model=ApiResponse[dict])
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload an avatar image for the current user.

    Validates file type, saves to uploads/avatars/ with a UUID filename,
    and updates the user's avatar_url field.
    """
    # Validate file extension
    original_filename = file.filename or "unknown"
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in AVATAR_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的图片类型: {ext}，仅支持: {', '.join(AVATAR_ALLOWED_EXTENSIONS)}",
        )

    # Create avatars subdirectory under UPLOAD_DIR
    avatar_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(avatar_dir, exist_ok=True)

    # Save file with UUID name
    safe_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(avatar_dir, safe_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    avatar_url = f"/uploads/avatars/{safe_name}"

    # Update user's avatar_url
    current_user.avatar_url = avatar_url
    db.add(current_user)
    await db.flush()
    await db.refresh(current_user)

    return ApiResponse(data={"url": avatar_url})
