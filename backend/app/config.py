from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
import os


class Settings(BaseSettings):
    # Environment
    ENVIRONMENT: str = "development"  # development | production
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://pumc:pumc123@localhost:5432/pumc_mll"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24h

    # DeepSeek LLM
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    # Upload
    UPLOAD_DIR: str = "uploads"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


def get_settings() -> Settings:
    """Get settings based on ENVIRONMENT variable."""
    env = os.environ.get("ENVIRONMENT", "development")
    if env == "production":
        return Settings(_env_file=".env.prod", ENVIRONMENT="production", DEBUG=False)
    return Settings()
