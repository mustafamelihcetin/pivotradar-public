import os
import re

test_dir = r"d:\PivotRadar_Repaired\backend\tests"

replacements = [
    (re.compile(r"from core import"), "from app.features.market_data.data import"),
    (re.compile(r"from core\."), "from app.core."), # Generic core fallback
    (re.compile(r"from ui import"), "import pytest\n# Skipped legacy UI import\n"),
]

# Specialized mapping for known files
special_mappings = {
    "core.ai_score": "app.features.scoring.ml.ai_score",
    "core.prism_service": "app.features.scoring.prism_service",
    "core.market_data": "app.features.market_data.service",
    "core.universe_db": "app.features.market_data.data.universe_db",
    "core.universe_bist": "app.features.market_data.data.universe_bist",
    "core.yf_client": "app.features.market_data.data.yf_client",
}

for filename in os.listdir(test_dir):
    if filename.endswith(".py"):
        filepath = os.path.join(test_dir, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        
        new_content = content
        for old, new in special_mappings.items():
            new_content = new_content.replace(f"from {old}", f"from {new}")
            new_content = new_content.replace(f"import {old}", f"import {new}")
        
        for pattern, repl in replacements:
            new_content = pattern.sub(repl, new_content)
            
        if new_content != content:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"Fixed imports in {filename}")
