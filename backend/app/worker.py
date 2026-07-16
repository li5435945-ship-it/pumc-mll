"""arq worker configuration for background tasks."""

from arq.connections import RedisSettings
from app.config import get_settings
from app.tasks.index_document import index_document_arq

settings = get_settings()


class WorkerSettings:
    """arq worker settings.

    Start with: arq app.worker.WorkerSettings
    """

    functions = [index_document_arq]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 10
    job_timeout = 300  # 5 minutes per job
    keep_result = 3600  # Keep results for 1 hour
