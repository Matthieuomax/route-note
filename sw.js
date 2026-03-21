from flask import Flask, send_from_directory
import ssl
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__, static_folder='.', static_url_path='')

@app.route('/')
def root():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory(BASE_DIR, path)

if __name__ == '__main__':
    cert = BASE_DIR / 'cert.pem'
    key = BASE_DIR / 'key.pem'

    if not cert.exists() or not key.exists():
        print("Certificat absent. Génère-le avec :")
        print("openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes")
        print("Puis relance python3 server.py")
        app.run(host='0.0.0.0', port=4443, debug=True)
    else:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=cert, keyfile=key)
        app.run(host='0.0.0.0', port=4443, debug=True, ssl_context=context)
