const video = document.getElementById('video');
const toggleCam = document.getElementById('toggleCam');
const exportJson = document.getElementById('exportJson');

let camMode = false;
let intervalId = null; // Store the interval ID globally

// open or create a indexedDB database called 'predictionDB'
const openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('predictionDB', 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('predictions')) {
                db.createObjectStore('predictions', { autoIncrement: true });
            }
        }

        request.onsuccess = (event) => {
            resolve(event.target.result);
        }

        request.onerror = (event) => {
            reject(event.target.error);
        }
    });
};

const savePredictionToDB = async (predictedClass) => {
    const db = await openDB();
    const transaction = db.transaction("predictions", "readwrite");
    const store = transaction.objectStore("predictions");

    const timestamp = new Date().toISOString(); // Store current time in ISO format
    const predictionData = { time: timestamp, predictedClass };

    store.add(predictionData); // Add the data to the store

    transaction.oncomplete = () => {
        console.log("Prediction saved to IndexedDB.");
    };

    transaction.onerror = (event) => {
        console.error("Error saving prediction:", event.target.error);
    };
};


async function loadModels() {
    const modelURL = 'model/model.json';
    const model = await tf.loadLayersModel(modelURL);
    console.log('Model loaded!');
    return model;
}

async function predict(model) {
    const img = tf.browser.fromPixels(video).resizeNearestNeighbor([224, 224]).toFloat().expandDims(0);
    const prediction = await model.predict(img);

    // Extract the result (assuming it's a 1x2 tensor for binary classification)
    prediction.array().then(result => {
        const class1Probability = result[0][0]; // Probability for Class 1
        const class2Probability = result[0][1]; // Probability for Class 2

        console.log(`Class 1 Probability: ${class1Probability}`);
        console.log(`Class 2 Probability: ${class2Probability}`);

        // Interpret the result
        const predictedClass = class1Probability > class2Probability ? 'Class 1' : 'Class 2';
        console.log('Prediction: ' + predictedClass);

        // Save the prediction to IndexedDB
        savePredictionToDB(predictedClass);
    }).catch(error => {
        console.error("Error processing prediction:", error);
    });
}



// running the whole thing
loadModels().then(model => {
    toggleCam.addEventListener('click', () => {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                camMode = !camMode; // Toggle camMode
                if (camMode) {
                    video.srcObject = stream;
                    video.play();
                    video.onloadeddata = () => {
                        // Clear any existing interval before starting a new one
                        if (intervalId) {
                            clearInterval(intervalId);
                        }
                        intervalId = setInterval(() => {
                            if (!camMode) {
                                clearInterval(intervalId); // Stop predictions when camMode is off
                                intervalId = null; // Reset intervalId
                            } else {
                                predict(model);
                            }
                        }, 2000); // Call predict every 2 seconds
                    };
                } else {
                    // Stop the video stream and clear the interval
                    video.srcObject = null;
                    if (intervalId) {
                        clearInterval(intervalId);
                        intervalId = null; // Reset intervalId
                    }
                }
            })
            .catch(error => {
                console.error("Error accessing the camera:", error);
            });
    });
});

exportJson.addEventListener('click', async () => {
    // export the data from indexedDB as JSON file
    const db = await openDB();
    const transaction = db.transaction("predictions", "readonly");
    const store = transaction.objectStore("predictions");
    const request = store.getAll();

    request.onsuccess = () => {
        const predictions = request.result;
        const json = JSON.stringify(predictions, null, 2);

        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'predictions.json';
        a.click();

        URL.revokeObjectURL(url);
    }
});