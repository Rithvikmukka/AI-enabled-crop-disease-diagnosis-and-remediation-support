// ============================================================================
// IMPORTS
// ============================================================================
import { saveSubmission as dbSave, getPendingSubmissions, updateStatus } from './db';
import { v4 as uuidv4 } from 'uuid';  // UUID library for generating unique IDs

const BACKEND_URL = 'http://localhost:5000/api/sync';

// ============================================================================
// SAVE SUBMISSION TO LOCAL QUEUE
// ============================================================================
// This function is called when a user captures a crop image and submits it
// It creates a submission object with a unique ID and saves it to IndexedDB
// The submission will be synced to the backend when the device is online
// ============================================================================
export const saveSubmission = async (data, imageFile = null) => {
    const submission = {
        // ====================================================================
        // UUID GENERATION - This is the KEY to deduplication!
        // ====================================================================
        // Each submission gets a unique UUID (Universally Unique Identifier)
        // Example: "a3f5c8d2-4b7e-4c1a-9f2e-8d3a5b6c7e9f"
        // This ID is generated ONCE when the submission is created
        // The SAME ID is used for ALL sync attempts (retries, offline queue, etc.)
        // The backend uses this ID to detect and skip duplicate submissions
        // ====================================================================
        id: uuidv4(),

        data: data,  // Form data (farmer name, location, crop type, etc.)
        image: imageFile,  // Blob/File object (the actual crop photo)
        // IndexedDB can store binary data like images
        createdAt: new Date().toISOString(),  // Timestamp when created
        status: 'queued',  // Lifecycle: queued → uploading → synced
        response: null  // Will store the server response after successful sync
    };

    // Save to IndexedDB (local browser database)
    // This allows the app to work offline and queue submissions
    await dbSave(submission);
    return submission;
};

// ============================================================================
// SYNC QUEUE TO BACKEND
// ============================================================================
// This function processes all queued submissions and sends them to the backend
// It's called when:
// 1. The app detects it's back online after being offline
// 2. User manually triggers a sync
// 3. Periodically in the background (if implemented)
//
// Key Features:
// - Processes submissions serially (one at a time) to avoid overwhelming the server
// - Handles both image uploads (FormData) and text-only (JSON) submissions
// - Implements retry logic: failed submissions stay in queue for next sync
// - Tracks sync status in IndexedDB for user feedback
// ============================================================================
export const syncQueue = async () => {
    // Fetch all submissions that haven't been synced yet
    const queue = await getPendingSubmissions();
    console.log("🔍 [SYNC] Queue retrieved:", queue.length, "items");

    if (queue.length === 0) return { synced: 0 };

    console.log("🚀 [SYNC] Attempting to sync...", queue.length, "items serially");
    let syncedCount = 0;

    // ========================================================================
    // PROCESS EACH SUBMISSION SERIALLY
    // ========================================================================
    // We use a for loop instead of Promise.all() to avoid:
    // - Overwhelming the server with concurrent requests
    // - Network congestion on slow connections
    // - Complex error handling with parallel requests
    // ========================================================================
    for (const item of queue) {
        console.log(`📦 [SYNC] Processing item ${item.id}`, {
            hasImage: !!item.image,
            imageType: item.image?.type,
            imageSize: item.image?.size
        });

        try {
            // ================================================================
            // STEP 1: Mark as uploading (for UI feedback)
            // ================================================================
            await updateStatus(item.id, 'uploading');
            console.log(`⏫ [SYNC] Marked ${item.id} as uploading`);

            let response;

            // ================================================================
            // BRANCH 1: Submission WITH Image (Use FormData)
            // ================================================================
            // When sending files, we must use FormData
            // The browser automatically sets Content-Type to multipart/form-data
            // ================================================================
            if (item.image) {
                console.log(`🖼️ [SYNC] Item has image, using FormData`);
                const formData = new FormData();

                // Add the image file to FormData
                // The backend will receive this as request.files['image']
                formData.append('image', item.image);

                // ============================================================
                // Create clean submission metadata (without image blob)
                // ============================================================
                // We can't send the image blob in JSON, so we separate it
                // The metadata goes as a JSON string in the 'submission' field
                // The backend will parse this JSON to get the submission details
                // ============================================================
                const submissionData = {
                    id: item.id,  // ← This is the UUID used for deduplication!
                    data: item.data,
                    createdAt: item.createdAt,
                    status: item.status
                };
                formData.append('submission', JSON.stringify(submissionData));

                console.log(`📤 [SYNC] Sending FormData to ${BACKEND_URL}`);

                // ============================================================
                // IMPORTANT: Do NOT set Content-Type header manually!
                // ============================================================
                // The browser needs to set it automatically to include the
                // multipart boundary (e.g., "multipart/form-data; boundary=...")
                // If we set it manually, the backend won't be able to parse it
                // ============================================================
                response = await fetch(BACKEND_URL, {
                    method: 'POST',
                    // No Content-Type header! Browser sets multipart/form-data + boundary automatically
                    body: formData
                });

                console.log(`📥 [SYNC] Response status: ${response.status}`);
            }
            // ================================================================
            // BRANCH 2: Submission WITHOUT Image (Use JSON)
            // ================================================================
            // For text-only submissions, we can use simple JSON
            // This is the legacy path, mainly for testing or future features
            // ================================================================
            else {
                console.log(`📝 [SYNC] Text-only item, using JSON`);
                response = await fetch(BACKEND_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ submissions: [item] })
                });
                console.log(`📥 [SYNC] Response status: ${response.status}`);
            }

            // ================================================================
            // STEP 2: Handle Response
            // ================================================================
            if (response.ok) {
                const result = await response.json();
                console.log(`✅ [SYNC] Success for ${item.id}:`, result);

                // Mark as synced in IndexedDB
                // This removes it from the pending queue
                await updateStatus(item.id, 'synced', {
                    syncedAt: new Date().toISOString(),
                    serverMessage: result.message
                });
                syncedCount++;
            } else {
                // ============================================================
                // RETRY LOGIC: Revert to 'queued' status
                // ============================================================
                // If the sync fails (network error, server error, etc.),
                // we revert the status back to 'queued'
                // This allows the submission to be retried on the next sync
                // ============================================================
                const errorText = await response.text();
                console.error(`❌ [SYNC] Failed for item ${item.id}`, response.status, errorText);
                await updateStatus(item.id, 'queued');
            }
        } catch (error) {
            // ================================================================
            // ERROR HANDLING: Network failures, timeouts, etc.
            // ================================================================
            console.error(`💥 [SYNC] Network error for item ${item.id}:`, error);
            await updateStatus(item.id, 'queued'); // Revert status on error
        }
    }

    console.log(`🏁 [SYNC] Complete. Synced ${syncedCount}/${queue.length} items`);
    return { synced: syncedCount };
};
