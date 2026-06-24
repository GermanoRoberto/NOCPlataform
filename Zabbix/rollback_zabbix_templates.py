import requests
import json
import os

url = "http://rcsfti.ddns.net:8091/zabbix/api_jsonrpc.php"
token = "148077c3327165c2bb76c362a78278b9faf7ff731c9459f0288601e3cd7274fb"

def query_zabbix(method, params):
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "auth": token,
        "id": 1
    }
    resp = requests.post(url, json=payload, timeout=20)
    resp.raise_for_status()
    res = resp.json()
    if "error" in res:
        print(f"Error executing {method}: {res['error']}")
        return None
    return res.get("result", [])

backup_path = r"C:\Users\Germano-TI\.gemini\antigravity\scratch\zabbix_backup_delays.json"
if not os.path.exists(backup_path):
    # fallback to local folder
    backup_path = "zabbix_backup_delays.json"

print(f"Loading backup from {backup_path}...")
with open(backup_path, "r", encoding="utf-8") as f:
    data = json.load(f)

print("\n--- ROLLBACK: Restoring original delays ---")
for item in data.get("items", []):
    print(f"Restoring item '{item['name']}' (ID: {item['itemid']}) to delay '{item['original_delay']}'...")
    res = query_zabbix("item.update", {
        "itemid": item["itemid"],
        "delay": item["original_delay"]
    })
    if res:
        print("Success!")

for proto in data.get("prototypes", []):
    print(f"Restoring prototype '{proto['name']}' (ID: {proto['itemid']}) to delay '{proto['original_delay']}'...")
    res = query_zabbix("itemprototype.update", {
        "itemid": proto["itemid"],
        "delay": proto["original_delay"]
    })
    if res:
        print("Success!")

print("Rollback process finished.")
