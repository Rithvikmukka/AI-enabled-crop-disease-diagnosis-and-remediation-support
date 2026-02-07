"""
Unit tests for the Flask backend API

Tests cover:
- Deduplication mechanism
- Multipart/form-data image uploads
- JSON submission handling
- Error cases and validation
"""

import pytest
import json
import io
from app import app, received_ids, submissions

# ============================================================================
# TEST FIXTURES
# ============================================================================

@pytest.fixture
def client():
    """
    Create a test client for the Flask app
    This allows us to make requests to the API without running the server
    """
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

@pytest.fixture(autouse=True)
def reset_state():
    """
    Reset the in-memory storage before each test
    This ensures tests don't interfere with each other
    """
    received_ids.clear()
    submissions.clear()
    yield

# ============================================================================
# TEST: Multipart/Form-Data Image Upload
# ============================================================================

def test_image_upload_success(client):
    """
    Test successful image upload with metadata
    Should accept the submission and return success
    """
    # Create a fake image file
    data = {
        'image': (io.BytesIO(b'fake image data'), 'test.jpg'),
        'submission': json.dumps({
            'id': 'test-uuid-001',
            'data': {
                'farmer_name': 'John Doe',
                'crop_type': 'Tomato',
                'location': 'Farm A'
            },
            'createdAt': '2026-02-06T10:00:00Z',
            'status': 'queued'
        })
    }
    
    response = client.post('/api/sync', 
                          data=data,
                          content_type='multipart/form-data')
    
    assert response.status_code == 200
    assert response.json['status'] == 'success'
    assert 'test-uuid-001' in received_ids
    assert len(submissions) == 1
    assert submissions[0]['has_image'] == True

def test_image_upload_missing_image(client):
    """
    Test multipart request without image file
    Should return 400 error
    """
    data = {
        'submission': json.dumps({
            'id': 'test-uuid-002',
            'data': {'farmer_name': 'Jane Doe'}
        })
    }
    
    response = client.post('/api/sync',
                          data=data,
                          content_type='multipart/form-data')
    
    assert response.status_code == 400
    assert 'No image file' in response.json['message']

def test_image_upload_missing_metadata(client):
    """
    Test multipart request without submission metadata
    Should return 400 error
    """
    data = {
        'image': (io.BytesIO(b'fake image data'), 'test.jpg')
    }
    
    response = client.post('/api/sync',
                          data=data,
                          content_type='multipart/form-data')
    
    assert response.status_code == 400
    assert 'Missing submission metadata' in response.json['message']

def test_image_upload_invalid_json(client):
    """
    Test multipart request with invalid JSON metadata
    Should return 400 error
    """
    data = {
        'image': (io.BytesIO(b'fake image data'), 'test.jpg'),
        'submission': 'invalid json string'
    }
    
    response = client.post('/api/sync',
                          data=data,
                          content_type='multipart/form-data')
    
    assert response.status_code == 400
    assert 'Invalid JSON' in response.json['message']

# ============================================================================
# TEST: Deduplication Mechanism
# ============================================================================

def test_deduplication_with_images(client):
    """
    Test that duplicate image submissions are detected and skipped
    The same UUID should only be processed once
    """
    submission_data = {
        'id': 'duplicate-uuid-001',
        'data': {'farmer_name': 'Test Farmer'},
        'createdAt': '2026-02-06T10:00:00Z',
        'status': 'queued'
    }
    
    data = {
        'image': (io.BytesIO(b'fake image data'), 'test.jpg'),
        'submission': json.dumps(submission_data)
    }
    
    # First submission - should succeed
    response1 = client.post('/api/sync',
                           data=data,
                           content_type='multipart/form-data')
    assert response1.status_code == 200
    assert len(submissions) == 1
    
    # Second submission with same ID - should be deduplicated
    data2 = {
        'image': (io.BytesIO(b'different image data'), 'test2.jpg'),
        'submission': json.dumps(submission_data)
    }
    response2 = client.post('/api/sync',
                           data=data2,
                           content_type='multipart/form-data')
    assert response2.status_code == 200
    # Should still only have 1 submission (duplicate was skipped)
    assert len(submissions) == 1

def test_deduplication_with_json(client):
    """
    Test that duplicate JSON submissions are detected and skipped
    """
    submission = {
        'id': 'duplicate-uuid-002',
        'data': {'farmer_name': 'Test Farmer'},
        'createdAt': '2026-02-06T10:00:00Z',
        'status': 'queued'
    }
    
    # First submission
    response1 = client.post('/api/sync',
                           json={'submissions': [submission]},
                           content_type='application/json')
    assert response1.status_code == 200
    assert response1.json['processed'] == 1
    assert response1.json['skipped'] == 0
    
    # Second submission with same ID
    response2 = client.post('/api/sync',
                           json={'submissions': [submission]},
                           content_type='application/json')
    assert response2.status_code == 200
    assert response2.json['processed'] == 0
    assert response2.json['skipped'] == 1

# ============================================================================
# TEST: JSON Submission Handling
# ============================================================================

def test_json_submission_success(client):
    """
    Test successful JSON submission without images
    """
    data = {
        'submissions': [
            {
                'id': 'json-uuid-001',
                'data': {'farmer_name': 'Alice'},
                'createdAt': '2026-02-06T10:00:00Z',
                'status': 'queued'
            }
        ]
    }
    
    response = client.post('/api/sync',
                          json=data,
                          content_type='application/json')
    
    assert response.status_code == 200
    assert response.json['status'] == 'success'
    assert response.json['processed'] == 1
    assert len(submissions) == 1

def test_json_batch_submission(client):
    """
    Test batch submission of multiple items via JSON
    """
    data = {
        'submissions': [
            {'id': 'batch-001', 'data': {'farmer_name': 'Alice'}},
            {'id': 'batch-002', 'data': {'farmer_name': 'Bob'}},
            {'id': 'batch-003', 'data': {'farmer_name': 'Charlie'}}
        ]
    }
    
    response = client.post('/api/sync',
                          json=data,
                          content_type='application/json')
    
    assert response.status_code == 200
    assert response.json['processed'] == 3
    assert len(submissions) == 3

def test_json_batch_with_duplicates(client):
    """
    Test batch submission with some duplicates
    Should process new ones and skip duplicates
    """
    # First batch
    data1 = {
        'submissions': [
            {'id': 'batch-dup-001', 'data': {'farmer_name': 'Alice'}},
            {'id': 'batch-dup-002', 'data': {'farmer_name': 'Bob'}}
        ]
    }
    response1 = client.post('/api/sync', json=data1)
    assert response1.json['processed'] == 2
    
    # Second batch with one duplicate and one new
    data2 = {
        'submissions': [
            {'id': 'batch-dup-002', 'data': {'farmer_name': 'Bob'}},  # Duplicate
            {'id': 'batch-dup-003', 'data': {'farmer_name': 'Charlie'}}  # New
        ]
    }
    response2 = client.post('/api/sync', json=data2)
    assert response2.json['processed'] == 1
    assert response2.json['skipped'] == 1
    assert len(submissions) == 3

# ============================================================================
# TEST: GET Submissions Endpoint
# ============================================================================

def test_get_submissions_empty(client):
    """
    Test GET /api/submissions when no submissions exist
    """
    response = client.get('/api/submissions')
    assert response.status_code == 200
    assert response.json == []

def test_get_submissions_with_data(client):
    """
    Test GET /api/submissions returns stored submissions
    """
    # Add some submissions first
    data = {
        'submissions': [
            {'id': 'get-001', 'data': {'farmer_name': 'Alice'}},
            {'id': 'get-002', 'data': {'farmer_name': 'Bob'}}
        ]
    }
    client.post('/api/sync', json=data)
    
    # Get submissions
    response = client.get('/api/submissions')
    assert response.status_code == 200
    assert len(response.json) == 2
    assert response.json[0]['id'] == 'get-001'
    assert response.json[1]['id'] == 'get-002'

# ============================================================================
# TEST: Error Cases
# ============================================================================

def test_unsupported_content_type(client):
    """
    Test that unsupported content types return 415 error
    """
    response = client.post('/api/sync',
                          data='plain text data',
                          content_type='text/plain')
    
    assert response.status_code == 415
    assert 'Unsupported Media Type' in response.json['error']

def test_submission_without_id(client):
    """
    Test that submissions without ID are skipped gracefully
    """
    data = {
        'submissions': [
            {'data': {'farmer_name': 'No ID'}},  # Missing ID
            {'id': 'valid-001', 'data': {'farmer_name': 'Valid'}}  # Valid
        ]
    }
    
    response = client.post('/api/sync', json=data)
    assert response.status_code == 200
    # Only the valid submission should be processed
    assert response.json['processed'] == 1
    assert len(submissions) == 1

# ============================================================================
# TEST: Submission Metadata
# ============================================================================

def test_submission_metadata_added(client):
    """
    Test that server adds metadata to submissions
    (received_at, server_status)
    """
    data = {
        'submissions': [
            {'id': 'meta-001', 'data': {'farmer_name': 'Test'}}
        ]
    }
    
    response = client.post('/api/sync', json=data)
    assert response.status_code == 200
    
    # Check that metadata was added
    submission = submissions[0]
    assert 'received_at' in submission
    assert submission['server_status'] == 'diagnosis_pending'
    assert isinstance(submission['received_at'], float)
