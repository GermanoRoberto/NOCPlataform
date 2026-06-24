import os
import sqlite3
import zipfile
import logging
import requests
from datetime import datetime

# Configuração de Logs
log_file = r"D:\NOC\backup_debug.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler()
    ]
)

def load_env(env_path):
    env_vars = {}
    if not os.path.exists(env_path):
        logging.error(f"Arquivo .env não encontrado em: {env_path}")
        return env_vars
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, val = line.split('=', 1)
                env_vars[key.strip()] = val.strip().strip('"').strip("'")
    return env_vars

def main():
    logging.info("=== Iniciando Rotina de Backup no Supabase ===")
    
    # 1. Carregar configurações
    env_path = r"D:\NOC\.env"
    env = load_env(env_path)
    
    supabase_url = env.get("SUPABASE_URL")
    supabase_key = env.get("SUPABASE_KEY")
    supabase_bucket = env.get("SUPABASE_BUCKET", "noc-backups")
    
    if not supabase_url or not supabase_key:
        logging.error("Configurações do Supabase (URL ou KEY) ausentes no arquivo .env!")
        return
        
    db_path = r"D:\NOC\noc_telemetry.db"
    backup_dir = r"D:\NOC\backups"
    os.makedirs(backup_dir, exist_ok=True)
    
    if not os.path.exists(db_path):
        logging.error(f"Banco de dados local não encontrado em: {db_path}")
        return
        
    # 2. Fazer cópia consistente do SQLite (Hot Copy)
    temp_db_path = os.path.join(backup_dir, "noc_telemetry_temp.db")
    try:
        logging.info("Realizando cópia consistente do banco de dados (Hot Copy)...")
        src_conn = sqlite3.connect(db_path)
        dest_conn = sqlite3.connect(temp_db_path)
        src_conn.backup(dest_conn)
        dest_conn.close()
        src_conn.close()
        logging.info("Cópia consistente concluída com sucesso.")
    except Exception as e:
        logging.error(f"Falha ao realizar cópia quente do SQLite: {e}")
        if os.path.exists(temp_db_path):
            os.remove(temp_db_path)
        return

    # 3. Compactar em ZIP
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_name = f"noc_telemetry_{timestamp}.zip"
    zip_path = os.path.join(backup_dir, zip_name)
    
    try:
        logging.info(f"Compactando banco em ZIP: {zip_name}...")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            zipf.write(temp_db_path, arcname="noc_telemetry.db")
        logging.info("Compactação concluída.")
    except Exception as e:
        logging.error(f"Falha ao compactar arquivo ZIP: {e}")
        return
    finally:
        # Sempre apagar a cópia não compactada temporária
        if os.path.exists(temp_db_path):
            os.remove(temp_db_path)

    # 4. Upload para o Supabase Storage via REST API
    # Endpoint de Storage do Supabase: /storage/v1/object/<bucket>/<path>
    upload_url = f"{supabase_url.rstrip('/')}/storage/v1/object/{supabase_bucket}/{zip_name}"
    headers = {
        "Authorization": f"Bearer {supabase_key}",
        "apikey": supabase_key,
        "Content-Type": "application/zip"
    }
    
    try:
        logging.info(f"Enviando backup para o Supabase Storage ({upload_url})...")
        with open(zip_path, "rb") as f:
            resp = requests.post(upload_url, headers=headers, data=f, timeout=60)
            
        logging.info(f"Resposta HTTP do Supabase: {resp.status_code}")
        if resp.status_code == 200 or resp.status_code == 201:
            logging.info("Upload realizado com sucesso para o Supabase!")
        else:
            logging.error(f"Falha no upload! Status Code: {resp.status_code} | Resposta: {resp.text}")
            logging.error("IMPORTANTE: Verifique se o bucket 'noc-backups' foi criado no painel do Supabase e se as políticas do Storage permitem upload.")
    except Exception as e:
        logging.error(f"Erro na conexão de rede para upload: {e}")

    # 5. Limpeza de backups locais antigos (manter apenas os 3 mais recentes)
    try:
        all_zips = [os.path.join(backup_dir, f) for f in os.listdir(backup_dir) if f.endswith(".zip")]
        all_zips.sort(key=os.path.getmtime, reverse=True) # mais recentes primeiro
        
        if len(all_zips) > 3:
            for old_zip in all_zips[3:]:
                os.remove(old_zip)
                logging.info(f"Backup local antigo removido: {os.path.basename(old_zip)}")
    except Exception as e:
        logging.warning(f"Erro ao limpar backups locais antigos: {e}")

    logging.info("=== Rotina de Backup Finalizada ===\n")

if __name__ == "__main__":
    main()
