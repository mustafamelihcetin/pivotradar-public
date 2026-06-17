import requests
import json
import time

# Correcting to POST and /api/scan/analyze based on router.py L768
URL = "http://localhost/api/scan/analyze"

def check_scores():
    payload = {
        "profile_name": "DENGELI",
        "top_n": 20,
        "expert_overrides": {}
    }
    
    try:
        print(f"Requesting POST {URL} ...")
        resp = requests.post(URL, json=payload, timeout=30)
        
        if resp.status_code != 200:
            print(f"Error: Received status {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            return

        try:
            data = resp.json()
        except Exception:
            print(f"Error: Response is not JSON. Content snippet: {resp.text[:200]}")
            return
        
        results = data.get("results", [])
        if not results:
            print("No results found in response.")
            return

        print(f"Found {len(results)} symbols.")
        plateau_count = 0
        for r in results:
            qrs = r.get("yzdsh") or r.get("QRS")
            symbol = r.get("symbol")
            ml = r.get("ml_score")
            quality = r.get("quality_label")
            is_div = r.get("is_divergent")
            
            # Print first 20 or any in plateau
            if results.index(r) < 20 or qrs in (28.1, 20.6, 7.6):
                print(f"{symbol:8} | QRS: {float(qrs):5.1f} | ML: {ml} | Div: {is_div} | {quality}")
            
            if qrs in (28.1, 20.6, 7.6):
                plateau_count += 1
        
        if plateau_count > 0:
            print(f"!!! ALERT: {plateau_count} symbols still in plateau values !!!")
        else:
            print("--- SUCCESS: No plateau values (28.1/20.6/7.6) found ---")
            
    except Exception as e:
        print(f"Error during request: {e}")

if __name__ == "__main__":
    check_scores()
