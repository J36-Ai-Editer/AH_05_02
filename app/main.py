import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from tortoise import connections

from app.apis.v1 import v1_routers
from app.core import config
from app.core.db.databases import initialize_tortoise
from app.core.redis import close_redis, redis_client
from app.middleware.challenge_upload_limit import ChallengeUploadLimit


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not config.DEMO_MODE:
        await redis_client.ping()
    from app.services.challenge_v2_retention import retention_loop

    retention = asyncio.create_task(retention_loop())
    try:
        yield
    finally:
        retention.cancel()
        with suppress(asyncio.CancelledError):
            await retention
    if not config.DEMO_MODE:
        await close_redis()


app = FastAPI(
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
initialize_tortoise(app)
app.add_middleware(ChallengeUploadLimit)

app.include_router(v1_routers)

FRONTEND_DIR = Path(__file__).resolve().parents[1] / "src" / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/", include_in_schema=False)
async def home(
    intro: str | None = Query(default=None),
    auth: str | None = Query(default=None),
) -> FileResponse:
    """Serve the retro cover by default; retain the current MVP at ?intro=original."""
    # Login and signup are part of the current retro entry. Sending auth query
    # routes to the legacy index made users returning from the forest see the
    # retired screen.
    page = "index.html" if intro == "original" else "intro-retro.html"
    response = FileResponse(FRONTEND_DIR / page)
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


@app.get("/forest", include_in_schema=False)
async def carrot_forest() -> FileResponse:
    response = FileResponse(FRONTEND_DIR / "forest.html")
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


@app.get("/service", include_in_schema=False)
async def suin_service() -> FileResponse:
    """Namespaced September 7 frontend; shares the forest's host-only session."""
    response = FileResponse(FRONTEND_DIR / "suin" / "index.html")
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


@app.get("/manifest.webmanifest", include_in_schema=False)
async def forest_manifest() -> FileResponse:
    response = FileResponse(
        FRONTEND_DIR / "forest.webmanifest",
        media_type="application/manifest+json",
    )
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/forest-sw.js", include_in_schema=False)
async def forest_service_worker() -> FileResponse:
    response = FileResponse(FRONTEND_DIR / "forest-sw.js", media_type="text/javascript")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["Service-Worker-Allowed"] = "/forest"
    return response


@app.get("/health", tags=["Health"])
async def liveness() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/health", tags=["Health"])
@app.get("/api/v1/health", tags=["Health"])
async def health() -> dict[str, str]:
    if not config.DEMO_MODE:
        await redis_client.ping()
    await connections.get("default").execute_query("SELECT 1")
    return {
        "status": "ok",
        "database": "ok",
        "redis": "embedded-demo" if config.DEMO_MODE else "ok",
    }


@app.get("/api/v1/ready", tags=["Health"])
async def ready() -> dict[str, object]:
    if not config.DEMO_MODE:
        await redis_client.ping()
    await connections.get("default").execute_query("SELECT 1")
    from app.prediction.contracts import ACTIVE_MODEL

    return {
        "status": "ready",
        "dependencies": {
            "database": "ready",
            "redis": "embedded-demo" if config.DEMO_MODE else "ready",
            "prediction_provider": "configured",
        },
        "active_model": {
            "model_key": ACTIVE_MODEL.model_key,
            "version": ACTIVE_MODEL.version,
            "promotion_status": ACTIVE_MODEL.promotion_status,
        },
    }
