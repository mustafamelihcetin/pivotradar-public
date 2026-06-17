import os
import re

test_dirs = [
    r"d:\PivotRadar_Repaired\backend\tests\security",
    r"d:\PivotRadar_Repaired\backend\tests\unit",
]

# Patterns to find and fix
replacements = [
    (re.compile(r"limiter\.check\(([^,)]+)\)"), r"limiter.check(\1, db_session)"),
    (re.compile(r"def (test_[a-zA-Z0-9_]+)\(self,?\s*\):"), r"def \1(self, db_session):"),
    (re.compile(r"def (test_[a-zA-Z0-9_]+)\(\s*\):"), r"def \1(db_session):"),
]

for d in test_dirs:
    if not os.path.exists(d): continue
    for filename in os.listdir(d):
        if filename.endswith(".py"):
            filepath = os.path.join(d, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            
            new_content = content
            # Only apply if it contains limiter.check or auth calls
            if "limiter.check" in content or "auth.revoke" in content or "auth.is_refresh" in content:
                for pattern, repl in replacements:
                    new_content = pattern.sub(repl, new_content)
                
            if new_content != content:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(new_content)
                print(f"Fixed signatures in {filename}")
