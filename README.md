# Heart Rate Monitor

A web-based heart rate and breathing rate monitor using your webcam.

## Features
- Real-time heart rate detection using rPPG (remote photoplethysmography)
- Breathing rate detection
- Multiple facial region analysis (forehead, under-eye areas, nose bridge)
- 4 different detection algorithms (FFT, Peak Detection, Autocorrelation, Wavelet)
- Live visualization with optional overlays
- Full session history tracking
- CSV export functionality
- Dual-column responsive layout

## Usage
1. Open `index.html` in a modern web browser
2. Click "Start Monitoring"
3. Allow camera access
4. Position your face in the camera view
5. Wait 10-15 seconds for accurate readings

## Requirements
- Modern web browser with webcam support
- Good lighting conditions
- Stable camera position

## Technologies
- JavaScript (vanilla)
- face-api.js for face detection
- Chart.js for data visualization
- Canvas API for video processing

## How it Works
The app uses remote photoplethysmography (rPPG) to detect subtle color changes in facial skin caused by blood flow. Multiple algorithms analyze these changes to extract heart rate and breathing patterns.