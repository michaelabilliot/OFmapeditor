// --- Web Worker Utility Functions ---

/**
 * Creates a worker and runs a task, returning a Promise that resolves/rejects
 * based on worker messages. Handles 'progress', 'result', and 'error' messages.
 * @param {string} workerPath - Path to the worker script.
 * @param {object} taskData - Data to post to the worker (e.g., { type: 'startTask', ... }).
 * @param {function} [onProgress] - Optional callback function for progress updates: (progressData) => {}.
 * @returns {Promise<object>} - Resolves with the result data from the worker, rejects on error.
 */
export function runWorkerTask(workerPath, taskData, onProgress) {
    return new Promise((resolve, reject) => {
        if (!window.Worker) {
            reject(new Error("Web Workers are not supported in this browser."));
            return;
        }

        console.log(`Starting worker: ${workerPath} with task: ${taskData.type}`);
        const worker = new Worker(workerPath, { type: 'module' }); // Use module type if workers import other modules

        worker.onmessage = (event) => {
            const { type, ...data } = event.data;
            switch (type) {
                case 'progress':
                    // console.log(`Worker ${workerPath} progress:`, data);
                    if (onProgress && typeof onProgress === 'function') {
                        onProgress(data);
                    }
                    break;
                case 'result':
                    console.log(`Worker ${workerPath} finished successfully.`);
                    resolve(data.result); // Assuming result is nested under 'result' key
                    worker.terminate();
                    break;
                case 'error':
                    console.error(`Worker ${workerPath} error:`, data.message);
                    reject(new Error(data.message || 'Unknown worker error'));
                    worker.terminate();
                    break;
                default:
                    console.warn(`Worker ${workerPath} sent unknown message type: ${type}`, data);
                    // Optionally treat unknown messages as errors or ignore
                    // reject(new Error(`Unknown message type from worker: ${type}`));
                    // worker.terminate();
            }
        };

        worker.onerror = (error) => {
            console.error(`Worker ${workerPath} encountered an unhandled error:`, error);
            reject(new Error(`Worker error: ${error.message} (File: ${error.filename}, Line: ${error.lineno})`));
            // Worker might terminate automatically on unhandled errors, but ensure it's cleaned up
            // worker.terminate(); // Avoid terminating if already terminated
        };

        // Start the task
        worker.postMessage(taskData);
    });
}