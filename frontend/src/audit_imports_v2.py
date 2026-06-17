import os
import re

FRONTEND_SRC = r'd:\PivotRadar_Repaired\frontend\src'

# We want to find variables that are USED but not IMPORTED or DEFINED locally
# We focus on the ones that caused issues previously
CORE_STORES = ['useAuthStore', 'useScanStore', 'useFeatureFlags']
CORE_UTILS = ['api', 'cn', 'motion']

def analyze_file(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    issues = []
    
    for item in CORE_STORES + CORE_UTILS:
        # 1. Check if the variable is used. 
        # Pattern: not preceded by "import", not followed by ":", not inside a string, not in a comment.
        # Simple heuristic: look for "item(" or "item." or " item " or "(item" or "item)" or "{item" or "item}"
        # while excluding lines that start with import or // or *
        
        used = False
        lines = content.splitlines()
        for line in lines:
            stripped = line.strip()
            if stripped.startswith('import ') or stripped.startswith('//') or stripped.startswith('*'):
                continue
            
            # Look for item usage (not assignment as a property in an object literal like label: item)
            # Use regex for word boundary
            if re.search(r'\b' + item + r'\b', line):
                # Check if it's an assignment like "const item =" or "function item" or "item ="
                if not re.search(r'(const|let|var|function)\s+' + item + r'\b', line) and \
                   not re.search(r'\b' + item + r'\s*[:=]', line):
                    # It's likely used
                    # But exclude strings (rough check)
                    # if it's inside quotes, skip
                    matches = re.finditer(r'\b' + item + r'\b', line)
                    for match in matches:
                        start = match.start()
                        # check if preceded by quote or followed by quote on the same line
                        before = line[:start]
                        after = line[match.end():]
                        if (before.count("'") % 2 != 0) or (before.count('"') % 2 != 0) or (before.count('`') % 2 != 0):
                            continue
                        used = True
                        break
            if used: break

        if used:
            # 2. Check if it's IMPORTED or DEFINED
            is_imported = re.search(r'import\s+.*?\b' + item + r'\b', content) or \
                          re.search(r'import\s+\{\s*.*?\b' + item + r'\b.*?\s*\}', content) or \
                          re.search(r'const\s+\{?.*?\b' + item + r'\b.*?\}?\s*=\s*import', content)
            
            is_defined = re.search(r'(const|let|var|function)\s+\{?.*?\b' + item + r'\b.*?\}?\s*=', content) or \
                         re.search(r'function\s+' + item + r'\b', content)
            
            if not is_imported and not is_defined:
                issues.append(f"Missing import/definition for: {item}")
                
    return issues

results = {}
for root, dirs, files in os.walk(FRONTEND_SRC):
    for file in files:
        if file.endswith('.jsx') or file.endswith('.js'):
            path = os.path.join(root, file)
            file_issues = analyze_file(path)
            if file_issues:
                results[path] = file_issues

print("--- REFINED AUDIT RESULTS ---")
for path, issues in results.items():
    print(f"\nFile: {path}")
    for issue in issues:
        print(f"  [!] {issue}")
