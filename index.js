const video = document.getElementById('video');
const exportJson = document.getElementById('exportJson');
const camDevices = document.getElementById('camDevices');
const startStopBtn = document.getElementById('startStop');
const clearDataBtn = document.getElementById('clearData');

let camMode = false;
// let intervalId = null; // Store the interval ID globally

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

const savePredictionToDB = async (predictedClass, exactProbabilities) => {
    const db = await openDB();
    const transaction = db.transaction("predictions", "readwrite");
    const store = transaction.objectStore("predictions");

    const timestamp = new Date().toISOString(); // Store current time in ISO format
    const predictionData = { time: timestamp, predictedClass, exactProbabilities: exactProbabilities };

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

        // console.log(`Class 1 Probability: ${class1Probability}`);
        // console.log(`Class 2 Probability: ${class2Probability}`);

        // Interpret the result
        const exactProbabilities = { class1Probability, class2Probability };
        const predictedClass = class1Probability > class2Probability ? 'Class 1' : 'Class 2';
        // console.log('Prediction: ' + predictedClass);

        // Save the prediction to IndexedDB
        savePredictionToDB(predictedClass, exactProbabilities);
    }).catch(error => {
        console.error("Error processing prediction:", error);
    });
}

// Request media permissions and list available devices
async function listCameras() {
    try {
        // Request access to the camera to populate device labels
        await navigator.mediaDevices.getUserMedia({ video: true });

        // Enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        camDevices.innerHTML = ''; // Clear existing options

        devices.forEach(device => {
            if (device.kind === 'videoinput') {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${camDevices.length + 1}`;
                camDevices.appendChild(option);
            }
        });

        if (camDevices.options.length === 0) {
            const option = document.createElement('option');
            option.text = 'No cameras found';
            camDevices.appendChild(option);
        }
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Unable to access camera. Please check permissions or use HTTPS.');
    }
}


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

clearDataBtn.addEventListener('click', async () => {

    if (!confirm('Are you sure you want to clear all data?')) {
        return
    }

    // Clear all data from the indexedDB
    const db = await openDB();
    const transaction = db.transaction("predictions", "readwrite");
    const store = transaction.objectStore("predictions");
    const request = store.clear();

    request.onsuccess = () => {
        alert('Data cleared from database.');
    }
});

async function startCamera(model) {
    constraints = {
        video: {
            deviceId: camDevices.value ? { exact: camDevices.value } : undefined
        },
        audio: false
    }

    console.log('Starting camera with constraints:', constraints.video);

    if (constraints.video.deviceId === undefined) {
        alert('Please select a camera device.');
        return;
    }

    camMode = !camMode;
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        if (camMode) {
            startStopBtn.innerText = 'Stop Camera';
            camDevices.disabled = true;
            video.srcObject = stream;
            video.play();
            video.onloadeddata = () => {
                setInterval(() => {
                    predict(model);
                }, 2000);
            };
        } else {
            startStopBtn.innerText = 'Start Camera';
            video.srcObject = null;
            camDevices.disabled = false;
        }
    })

};

listCameras();
loadModels().then(model => {
    startStopBtn.innerText = 'Start Camera';
    startStopBtn.addEventListener('click', () => {
        startCamera(model);
    });
});