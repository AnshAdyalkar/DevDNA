"""DevDNA intelligence service — FastAPI application entry point."""
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.routes import analysis, analysis_pipeline, growth, health
from .config import get_settings

settings = get_settings()

app = FastAPI(
    title="DevDNA Intelligence Service",
    description="Analysis engine: skill scoring, complexity, behavior analytics, DNA generation.",
    version="0.1.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def verify_internal_key(
    request: Request,
    call_next: Callable[[Request], Awaitable[Any]],
) -> Any:
    """Only the Node API (and docs on localhost) may call analysis endpoints.

    Requests must carry the shared internal key in `x-internal-key`.
    """
    if request.url.path.startswith(("/analyze", "/api/intelligence", "/api/growth")):
        expected = settings.internal_key
        provided = request.headers.get("x-internal-key", "")
        if not expected or provided != expected:
            return JSONResponse(
                status_code=403,
                content={"detail": "Invalid internal service key"},
            )
    return await call_next(request)


app.include_router(health.router)
app.include_router(analysis.router)
app.include_router(analysis_pipeline.router)
app.include_router(growth.router)


@app.get("/ready")
async def ready() -> Response:
    """Readiness: configuration + MongoDB connectivity (§4)."""
    from .services import mongodb

    settings = get_settings()
    problems: list[str] = []
    if not settings.internal_key:
        problems.append("internal key not configured")
    if not settings.mongodb_uri:
        problems.append("MongoDB URI not configured")
    elif not await mongodb.ping():
        problems.append("MongoDB unreachable")
    if problems:
        return JSONResponse(status_code=503, content={"status": "not_ready", "problems": problems})
    return JSONResponse(content={"status": "ready"})
