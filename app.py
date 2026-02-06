from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from datetime import datetime
import psycopg2
from config import DB_CONFIG

def save_metadata(filename, device_id, language, timestamp, file_path):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO media_uploads
            (filename, device_id, language, uploaded_at, file_path)
            VALUES (%s, %s, %s, %s, %s)
        """, (filename, device_id, language, timestamp, file_path))

        conn.commit()
        cur.close()
        conn.close()

    except Exception as e:
        print("DB Error:", e)

def fetch_all_uploads():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, filename, device_id, language, uploaded_at, file_path
        FROM media_uploads
        ORDER BY uploaded_at DESC
    """)

    rows = cur.fetchall()

    cur.close()
    conn.close()

    uploads = []
    for row in rows:
        uploads.append({
            "id": row[0],
            "filename": row[1],
            "device_id": row[2],
            "language": row[3],
            "uploaded_at": row[4].isoformat() if row[4] else None,
            "file_path": row[5]
        })

    return uploads

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
MAX_FILE_SIZE_MB = 10
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "mp4"}

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route("/api/upload", methods=["POST"])
def upload_media():
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file provided"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"status": "error", "message": "Empty filename"}), 400

    if not allowed_file(file.filename):
        return jsonify({"status": "error", "message": "Invalid file type"}), 400

    file.seek(0, os.SEEK_END)
    size_mb = file.tell() / (1024 * 1024)
    file.seek(0)

    if size_mb > MAX_FILE_SIZE_MB:
        return jsonify({"status": "error", "message": "File too large"}), 400

    timestamp = datetime.utcnow().isoformat()
    device_id = request.form.get("device_id", "unknown")
    language = request.form.get("language", "en")

    safe_filename = f"{int(datetime.utcnow().timestamp())}_{file.filename}"
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], safe_filename)
    file.save(save_path)
    save_metadata(
    filename=safe_filename,
    device_id=device_id,
    language=language,
    timestamp=timestamp,
    file_path=save_path
)

    return jsonify({
        "status": "success",
        "message": "Upload successful",
        "data": {
            "filename": safe_filename,
            "timestamp": timestamp,
            "device_id": device_id,
            "language": language
        }
    }), 200

@app.route("/api/uploads", methods=["GET"])
def get_uploads():
    uploads = fetch_all_uploads()
    return jsonify({
        "status": "success",
        "count": len(uploads),
        "data": uploads
    }), 200

@app.route("/", methods=["GET"])
def health_check():
    return jsonify({
        "status": "Backend running",
        "service": "Media Upload API"
    }), 200

if __name__ == "__main__":
    app.run(debug=True)
