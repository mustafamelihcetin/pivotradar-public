# backend/app/features/scoring/ml/ai_settings.py
import os
from pathlib import Path

# ML Model Paths
# Standard location: app_root/assets/models/
ML_MODEL_PATH = os.getenv("ML_MODEL_PATH", "ml_latest.joblib")
ML_CALIBRATED = True

# Weighting (Rule + ML + LLM) — reads from env, .env provides PR_W_RULE/PR_W_ML
W_RULE = float(os.getenv("PR_W_RULE", "0.6"))
W_ML = float(os.getenv("PR_W_ML", "0.4"))
W_LLM = float(os.getenv("PR_W_LLM", "0.0"))  # Optional LLM weight

# LLM Configuration (GGUF Mode)
LLM_ENABLED = False
LLM_MODEL = "mistral-7b-instruct-v0.2.Q4_K_M.gguf"
LLM_CTX = 2048
LLM_MAX_TOK = 256
LLM_TEMP = 0.1
LLM_TOP_P = 0.95
