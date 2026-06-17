import os
import re

FRONTEND_SRC = r'd:\PivotRadar_Repaired\frontend\src'

CORE_STORES = ['useAuthStore', 'useScanStore', 'useFeatureFlags']
COMMON_UTILS = ['api', 'cn', 'motion']

def analyze_file(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Simple check: if variable is used but not imported
    # This is a bit naive but should catch most obvious cases
    issues = []
    
    # Check core stores
    for store in CORE_STORES:
        # Check if store name appears as a word
        if re.search(r'\b' + store + r'\b', content):
            # Check if it's imported
            if not re.search(r'import.*' + store, content) and not re.search(r'const.*' + store + r'.*=.*import', content) and not re.search(r'const ' + store + r' = create', content):
                issues.append(f"Missing import for {store}")
    
    # Check common utils
    for util in COMMON_UTILS:
        if re.search(r'\b' + util + r'\b', content):
            if not re.search(r'import.*' + util, content) and not re.search(r'const.*' + util + r'.*=.*import', content):
                # Special cases: api and cn are often imported
                # motion is from framer-motion
                if util == 'motion' and 'framer-motion' not in content:
                    issues.append(f"Missing import for {util} (framer-motion)")
                elif util == 'cn' and 'utils/cn' not in content:
                    issues.append(f"Missing import for {util}")
                elif util == 'api' and 'core/api/client' not in content:
                    # check if api is defined locally
                    if not re.search(r'const api = ', content):
                        issues.append(f"Missing import for {util}")
    
    return issues

results = {}
for root, dirs, files in os.walk(FRONTEND_SRC):
    for file in files:
        if file.endswith('.jsx') or file.endswith('.js'):
            path = os.path.join(root, file)
            file_issues = analyze_file(path)
            if file_issues:
                results[path] = file_issues

print("--- AUDIT RESULTS ---")
for path, issues in results.items():
    print(f"\nFile: {path}")
    for issue in issues:
        print(f"  [!] {issue}")
