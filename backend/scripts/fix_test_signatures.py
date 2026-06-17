import os
import re

test_dirs = [
    r"d:\PivotRadar_Repaired\backend\tests\security",
    r"d:\PivotRadar_Repaired\backend\tests\unit",
]

# Patterns to find and fix
# Example: auth.revoke_refresh_token(refresh_token) -> auth.revoke_refresh_token(db_session, refresh_token)
# Example: login_rate_limit(request) -> login_rate_limit(request, db_session)

replacements = [
    (re.compile(r"auth\.revoke_refresh_token\(([^db][^,]*)\)"), r"auth.revoke_refresh_token(db_session, \1)"),
    (re.compile(r"auth\.is_refresh_token_revoked\(([^db][^,]*)\)"), r"auth.is_refresh_token_revoked(db_session, \1)"),
    (re.compile(r"login_rate_limit\(request\)"), r"login_rate_limit(request, db_session)"),
    (re.compile(r"register_rate_limit\(request\)"), r"register_rate_limit(request, db_session)"),
    (re.compile(r"analyze_rate_limit\(request\)"), r"analyze_rate_limit(request, db_session)"),
]

for d in test_dirs:
    if not os.path.exists(d): continue
    for filename in os.listdir(d):
        if filename.endswith(".py"):
            filepath = os.path.join(d, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            
            new_content = content
            for pattern, repl in replacements:
                new_content = pattern.sub(repl, new_content)
                
            if new_content != content:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(new_content)
                print(f"Fixed signatures in {filename}")
