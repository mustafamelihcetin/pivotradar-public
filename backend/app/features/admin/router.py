# backend/app/features/admin/router.py
from fastapi import APIRouter
from .routers import ml, stats, predictions, monitoring, scanner, users, logs, settings, database, backtest

router = APIRouter()
router.include_router(ml.router)
router.include_router(stats.router)
router.include_router(predictions.router)
router.include_router(monitoring.router)
router.include_router(scanner.router)
router.include_router(users.router)
router.include_router(logs.router)
router.include_router(settings.router)
router.include_router(database.router)
router.include_router(backtest.router)
