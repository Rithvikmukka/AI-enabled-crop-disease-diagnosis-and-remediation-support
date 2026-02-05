from flask import Flask, request, jsonify
from flask_cors import CORS
import time

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend integration

# In-memory storage for deduplication and "database"
# In a real app, this would be PostgreSQL/Redis
received_ids = set()
submissions = []

@app.route('/api/sync', methods=['POST'])
def sync_data():
    """
    Receives a batch of submissions.
    Expected Payload: { "submissions": [ { "id": "uuid", "data": ... } ] }
    """
    data = request.json
    incoming_submissions = data.get('submissions', [])
    
    processed_count = 0
    skipped_count = 0
    
    for sub in incoming_submissions:
        sub_id = sub.get('id')
        
        if not sub_id:
            continue
            
        if sub_id in received_ids:
            skipped_count += 1
            print(f"[DEDUPE] Skipped duplicate submission: {sub_id}")
            continue
            
        # "Save" the data
        received_ids.add(sub_id)
        # Add server-side metadata
        sub['received_at'] = time.time()
        sub['server_status'] = "diagnosis_pending" 
        submissions.append(sub)
        processed_count += 1
        print(f"[RECV] New submission: {sub_id}")

    response = {
        "status": "success",
        "processed": processed_count,
        "skipped": skipped_count,
        "message": "Data synced successfully. Diagnosis is pending."
    }
    
    return jsonify(response), 200

@app.route('/api/submissions', methods=['GET'])
def get_submissions():
    """Debug endpoint to see what we have stored."""
    return jsonify(submissions), 200

if __name__ == '__main__':
    print("Starting Offline Sync Backend on port 5000...")
    app.run(debug=True, port=5000)
