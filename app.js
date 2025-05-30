class HeartRateMonitor {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.status = document.getElementById('status');
        this.heartRateDisplay = document.getElementById('heartRate');
        this.loading = document.getElementById('loading');
        
        this.isMonitoring = false;
        this.faceDetector = null;
        this.frameBuffer = [];
        this.bufferSize = 300; // 10 seconds at 30fps for better breathing detection
        this.samplingRate = 30;
        this.heartRateHistory = [];
        this.breathingRateHistory = [];
        this.chart = null;
        this.currentHeartRate = 0;
        this.currentBreathingRate = 0;
        
        // Face detection stability
        this.lastDetection = null;
        this.detectionMissCount = 0;
        this.maxMissCount = 10; // Allow up to 10 frames without detection
        this.frameCount = 0;
        this.detectionInterval = 3; // Only detect face every 3 frames for performance
        
        // Smoothing for measurements
        this.heartRateSmoothing = [];
        this.breathingRateSmoothing = [];
        this.smoothingWindow = 5;
        
        this.initializeEventListeners();
        this.initializeChart();
    }
    
    initializeEventListeners() {
        this.startBtn.addEventListener('click', () => this.startMonitoring());
        this.stopBtn.addEventListener('click', () => this.stopMonitoring());
    }
    
    initializeChart() {
        const ctx = document.getElementById('heartRateChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Heart Rate (BPM)',
                    data: [],
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        suggestedMin: 50,
                        suggestedMax: 120,
                        title: {
                            display: true,
                            text: 'BPM'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
    
    async startMonitoring() {
        try {
            this.loading.style.display = 'block';
            this.status.textContent = 'Initializing camera...';
            this.startBtn.disabled = true;
            
            // Load face detection models
            await this.loadModels();
            
            // Get camera stream
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 640,
                    height: 480,
                    facingMode: 'user'
                }
            });
            
            this.video.srcObject = stream;
            
            // Wait for video to be ready
            await new Promise(resolve => {
                this.video.onloadedmetadata = resolve;
            });
            
            // Set canvas size to match video
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            this.canvas.style.width = this.video.clientWidth + 'px';
            this.canvas.style.height = this.video.clientHeight + 'px';
            
            this.isMonitoring = true;
            this.stopBtn.disabled = false;
            this.status.textContent = 'Monitoring heart rate...';
            
            // Start processing frames
            this.processFrames();
            
        } catch (error) {
            console.error('Error starting monitoring:', error);
            this.status.textContent = `Error: ${error.message}`;
            this.startBtn.disabled = false;
            this.loading.style.display = 'none';
        }
    }
    
    async loadModels() {
        this.status.textContent = 'Loading face detection models...';
        await faceapi.nets.tinyFaceDetector.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models');
    }
    
    async processFrames() {
        if (!this.isMonitoring) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Only detect face every few frames for performance
        let detection = null;
        if (this.frameCount % this.detectionInterval === 0) {
            detection = await faceapi.detectSingleFace(
                this.video,
                new faceapi.TinyFaceDetectorOptions({
                    inputSize: 320,
                    scoreThreshold: 0.3
                })
            ).withFaceLandmarks();
            
            if (detection) {
                this.lastDetection = detection;
                this.detectionMissCount = 0;
            } else {
                this.detectionMissCount++;
            }
        }
        
        this.frameCount++;
        
        // Use last detection if available and recent
        if (!detection && this.lastDetection && this.detectionMissCount < this.maxMissCount) {
            detection = this.lastDetection;
        }
        
        if (detection) {
            this.loading.style.display = 'none';
            
            // Get forehead region (area above eyebrows)
            const landmarks = detection.landmarks;
            const leftEyebrow = landmarks.getLeftEyeBrow();
            const rightEyebrow = landmarks.getRightEyeBrow();
            
            // Calculate forehead region
            const foreheadTop = Math.min(...leftEyebrow.concat(rightEyebrow).map(p => p.y)) - 30;
            const foreheadBottom = Math.min(...leftEyebrow.concat(rightEyebrow).map(p => p.y));
            const foreheadLeft = leftEyebrow[0].x;
            const foreheadRight = rightEyebrow[rightEyebrow.length - 1].x;
            const foreheadWidth = foreheadRight - foreheadLeft;
            const foreheadHeight = foreheadBottom - foreheadTop;
            
            // Calculate pulse effect based on current heart rate
            const pulseIntensity = this.currentHeartRate > 0 ? 
                0.02 * (1 + Math.sin((Date.now() * this.currentHeartRate / 60000) * 2 * Math.PI)) : 0;
            
            // Draw pulsating overlay on entire video
            if (this.currentHeartRate > 0) {
                this.ctx.fillStyle = `rgba(255, 0, 0, ${pulseIntensity})`;
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }
            
            // Remove debug background - no longer needed
            
            // Draw forehead region overlay with enhanced visibility
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(foreheadLeft, foreheadTop, foreheadWidth, foreheadHeight);
            
            // Draw face detection box
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.lineWidth = 2;
            const box = detection.detection.box;
            this.ctx.strokeRect(box.x, box.y, box.width, box.height);
            
            // Draw enhanced pulse visualization around detection area
            if (this.currentHeartRate > 0) {
                const pulsePhase = (Date.now() % (60000 / this.currentHeartRate)) / (60000 / this.currentHeartRate);
                const expansion = 5 * Math.sin(pulsePhase * 2 * Math.PI);
                
                this.ctx.strokeStyle = `rgba(231, 76, 60, ${0.5 + 0.5 * Math.sin(pulsePhase * 2 * Math.PI)})`;
                this.ctx.lineWidth = 2 + expansion / 2;
                this.ctx.strokeRect(
                    foreheadLeft - expansion,
                    foreheadTop - expansion,
                    foreheadWidth + expansion * 2,
                    foreheadHeight + expansion * 2
                );
            }
            
            // Draw label
            this.ctx.fillStyle = '#3498db';
            this.ctx.font = '14px Arial';
            this.ctx.fillText('Detection Area', foreheadLeft, foreheadTop - 5);
            
            // Get forehead region for analysis
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = foreheadWidth;
            tempCanvas.height = foreheadHeight;
            tempCtx.drawImage(
                this.video,
                foreheadLeft, foreheadTop, foreheadWidth, foreheadHeight,
                0, 0, foreheadWidth, foreheadHeight
            );
            
            // Get average green channel value
            const imageData = tempCtx.getImageData(0, 0, foreheadWidth, foreheadHeight);
            const greenValue = this.getAverageGreenChannel(imageData);
            
            // Add to buffer
            this.frameBuffer.push({
                value: greenValue,
                timestamp: Date.now()
            });
            
            // Keep buffer size limited
            if (this.frameBuffer.length > this.bufferSize) {
                this.frameBuffer.shift();
            }
            
            // Draw signal visualization
            if (this.frameBuffer.length > 10) {
                this.drawSignalVisualization();
            }
            
            // Update status when face is detected
            this.status.textContent = 'Face detected. Measuring heart rate...';
            
            // Calculate heart rate if we have enough data
            if (this.frameBuffer.length >= this.bufferSize / 2) {
                const rates = this.calculateVitalSigns();
                if (rates.heartRate > 0) {
                    // Smooth the measurements
                    this.heartRateSmoothing.push(rates.heartRate);
                    if (this.heartRateSmoothing.length > this.smoothingWindow) {
                        this.heartRateSmoothing.shift();
                    }
                    this.breathingRateSmoothing.push(rates.breathingRate);
                    if (this.breathingRateSmoothing.length > this.smoothingWindow) {
                        this.breathingRateSmoothing.shift();
                    }
                    
                    // Calculate smoothed values
                    const smoothedHR = Math.round(
                        this.heartRateSmoothing.reduce((a, b) => a + b, 0) / this.heartRateSmoothing.length
                    );
                    const smoothedBR = Math.round(
                        this.breathingRateSmoothing.reduce((a, b) => a + b, 0) / this.breathingRateSmoothing.length
                    );
                    
                    this.currentHeartRate = smoothedHR;
                    this.currentBreathingRate = smoothedBR;
                    this.updateHeartRateDisplay(smoothedHR);
                    this.status.textContent = `HR: ${smoothedHR} BPM | Breathing: ${smoothedBR} BPM`;
                    
                    // Draw vitals on video
                    this.ctx.fillStyle = '#e74c3c';
                    this.ctx.font = 'bold 24px Arial';
                    this.ctx.fillText(`${smoothedHR} BPM`, 20, 40);
                    
                    // Draw breathing rate
                    this.ctx.fillStyle = '#3498db';
                    this.ctx.font = 'bold 20px Arial';
                    this.ctx.fillText(`Breathing: ${smoothedBR}/min`, 20, 70);
                    
                    // Draw enhanced pulse indicator
                    const pulsePhase = (Date.now() % (60000 / rates.heartRate)) / (60000 / rates.heartRate);
                    const pulseSize = 15 + Math.sin(pulsePhase * 2 * Math.PI) * 8;
                    
                    // Outer glow
                    const gradient = this.ctx.createRadialGradient(200, 40, 0, 200, 40, pulseSize * 2);
                    gradient.addColorStop(0, `rgba(231, 76, 60, ${0.8 * Math.sin(pulsePhase * 2 * Math.PI)})`);
                    gradient.addColorStop(1, 'rgba(231, 76, 60, 0)');
                    this.ctx.fillStyle = gradient;
                    this.ctx.beginPath();
                    this.ctx.arc(200, 40, pulseSize * 2, 0, 2 * Math.PI);
                    this.ctx.fill();
                    
                    // Inner circle
                    this.ctx.fillStyle = `rgba(231, 76, 60, ${0.5 + Math.sin(pulsePhase * 2 * Math.PI) * 0.5})`;
                    this.ctx.beginPath();
                    this.ctx.arc(200, 40, pulseSize, 0, 2 * Math.PI);
                    this.ctx.fill();
                }
            }
        } else {
            this.status.textContent = 'No face detected. Please position your face in the camera view.';
        }
        
        // Continue processing
        requestAnimationFrame(() => this.processFrames());
    }
    
    drawSignalVisualization() {
        // Draw mini signal graph in bottom right
        const graphWidth = 200;
        const graphHeight = 60;
        const graphX = this.canvas.width - graphWidth - 20;
        const graphY = this.canvas.height - graphHeight - 20;
        
        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(graphX, graphY, graphWidth, graphHeight);
        
        // Get recent signal values
        const recentFrames = this.frameBuffer.slice(-60);
        if (recentFrames.length < 2) return;
        
        // Normalize values
        const values = recentFrames.map(f => f.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        
        // Draw signal
        this.ctx.strokeStyle = '#2ecc71';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        recentFrames.forEach((frame, i) => {
            const x = graphX + (i / (recentFrames.length - 1)) * graphWidth;
            const normalizedValue = (frame.value - min) / range;
            const y = graphY + graphHeight - (normalizedValue * graphHeight * 0.8) - graphHeight * 0.1;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        });
        
        this.ctx.stroke();
        
        // Label
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px Arial';
        this.ctx.fillText('PPG Signal', graphX + 5, graphY + 15);
    }
    
    getAverageGreenChannel(imageData) {
        const data = imageData.data;
        let sumR = 0, sumG = 0, sumB = 0;
        let count = 0;
        
        // Calculate average RGB values
        for (let i = 0; i < data.length; i += 4) {
            sumR += data[i];
            sumG += data[i + 1];
            sumB += data[i + 2];
            count++;
        }
        
        // Use a combination of channels for better signal
        // Green channel is primary, but red/blue ratio helps
        const avgG = sumG / count;
        const avgR = sumR / count;
        const avgB = sumB / count;
        
        // Chrominance signal (more robust to lighting changes)
        return avgG - 0.3 * avgR - 0.3 * avgB;
    }
    
    calculateVitalSigns() {
        if (this.frameBuffer.length < this.bufferSize / 2) return { heartRate: 0, breathingRate: 0 };
        
        // Extract signal values
        const signal = this.frameBuffer.map(frame => frame.value);
        
        // Detrend the signal
        const detrendedSignal = this.detrend(signal);
        
        // First pass: get initial estimates
        const breathingSignal = this.bandpassFilter(detrendedSignal, 0.1, 0.5, this.samplingRate);
        const initialBreathingRate = this.estimateRateFFT(breathingSignal, this.samplingRate, 0.1, 0.5);
        
        // Use breathing rate to create adaptive notch filter for heart rate
        let heartSignal;
        if (initialBreathingRate > 0 && this.currentBreathingRate > 0) {
            // Remove breathing harmonics from heart rate signal
            const breathingFreq = this.currentBreathingRate / 60;
            const notchedSignal = this.notchFilter(detrendedSignal, breathingFreq, 0.1, this.samplingRate);
            heartSignal = this.bandpassFilter(notchedSignal, 0.75, 4, this.samplingRate);
        } else {
            // Standard bandpass filter
            heartSignal = this.bandpassFilter(detrendedSignal, 0.75, 4, this.samplingRate);
        }
        
        // Get heart rate
        const heartRate = this.estimateRateFFT(heartSignal, this.samplingRate, 0.75, 4);
        
        // Refine breathing rate by removing heart rate harmonics if detected
        let refinedBreathingRate = initialBreathingRate;
        if (heartRate > 0 && this.currentHeartRate > 0) {
            const heartFreq = this.currentHeartRate / 60;
            // Only refine if heart rate is significantly different from breathing
            if (heartFreq > 1.5) {
                const cleanBreathingSignal = this.notchFilter(detrendedSignal, heartFreq, 0.2, this.samplingRate);
                const filteredBreathing = this.bandpassFilter(cleanBreathingSignal, 0.1, 0.5, this.samplingRate);
                refinedBreathingRate = this.estimateRateFFT(filteredBreathing, this.samplingRate, 0.1, 0.5);
            }
        }
        
        return {
            heartRate: heartRate,
            breathingRate: Math.round(refinedBreathingRate)
        };
    }
    
    notchFilter(signal, notchFreq, bandwidth, sampleRate) {
        // Simple notch filter implementation
        const filtered = [];
        const omega = 2 * Math.PI * notchFreq / sampleRate;
        const alpha = Math.sin(omega) * Math.sinh(Math.log(2) / 2 * bandwidth * omega / Math.sin(omega));
        
        const a0 = 1 + alpha;
        const a1 = -2 * Math.cos(omega);
        const a2 = 1 - alpha;
        const b0 = 1;
        const b1 = -2 * Math.cos(omega);
        const b2 = 1;
        
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        
        for (let i = 0; i < signal.length; i++) {
            const x0 = signal[i];
            const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
            
            filtered.push(y0);
            
            x2 = x1;
            x1 = x0;
            y2 = y1;
            y1 = y0;
        }
        
        return filtered;
    }
    
    detrend(signal) {
        const n = signal.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += signal[i];
            sumXY += i * signal[i];
            sumX2 += i * i;
        }
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        return signal.map((value, i) => value - (slope * i + intercept));
    }
    
    bandpassFilter(signal, lowFreq, highFreq, sampleRate) {
        // Simple moving average filter as approximation
        const windowSize = Math.floor(sampleRate / lowFreq);
        const filtered = [];
        
        for (let i = 0; i < signal.length; i++) {
            let sum = 0;
            let count = 0;
            
            for (let j = Math.max(0, i - windowSize); j <= Math.min(signal.length - 1, i + windowSize); j++) {
                sum += signal[j];
                count++;
            }
            
            filtered.push(signal[i] - sum / count);
        }
        
        return filtered;
    }
    
    estimateRateFFT(signal, sampleRate, minFreq, maxFreq) {
        // Simple peak detection in frequency domain
        const fftSize = 256;
        const fft = new Array(fftSize).fill(0);
        
        // Copy signal to FFT array
        for (let i = 0; i < Math.min(signal.length, fftSize); i++) {
            fft[i] = signal[signal.length - fftSize + i] || 0;
        }
        
        // Apply Hamming window
        for (let i = 0; i < fftSize; i++) {
            fft[i] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (fftSize - 1));
        }
        
        // Compute power spectrum (simplified)
        const powerSpectrum = [];
        for (let k = 0; k < fftSize / 2; k++) {
            let real = 0, imag = 0;
            
            for (let n = 0; n < fftSize; n++) {
                const angle = -2 * Math.PI * k * n / fftSize;
                real += fft[n] * Math.cos(angle);
                imag += fft[n] * Math.sin(angle);
            }
            
            powerSpectrum.push(real * real + imag * imag);
        }
        
        // Find peak in specified frequency range
        const minBin = Math.floor(minFreq * fftSize / sampleRate);
        const maxBin = Math.floor(maxFreq * fftSize / sampleRate);
        
        let maxPower = 0;
        let peakBin = minBin;
        
        for (let i = minBin; i < maxBin && i < powerSpectrum.length; i++) {
            if (powerSpectrum[i] > maxPower) {
                maxPower = powerSpectrum[i];
                peakBin = i;
            }
        }
        
        // Convert to BPM/BrPM
        const freq = peakBin * sampleRate / fftSize;
        const rate = freq * 60;
        
        // Validate based on expected ranges
        if (minFreq < 0.6) { // Breathing rate
            if (rate >= 6 && rate <= 30) {
                return Math.round(rate);
            }
        } else { // Heart rate
            if (rate >= 45 && rate <= 180) {
                return Math.round(rate);
            }
        }
        
        return 0;
    }
    
    updateHeartRateDisplay(heartRate) {
        this.heartRateDisplay.textContent = heartRate;
        
        // Update breathing rate display
        const breathingDisplay = document.getElementById('breathingRate');
        if (breathingDisplay && this.currentBreathingRate > 0) {
            breathingDisplay.textContent = this.currentBreathingRate;
        }
        
        // Update pulse animation speeds
        const heartIcon = document.querySelector('.pulse-icon');
        const pulseDuration = 60 / heartRate; // seconds per beat
        heartIcon.style.animationDuration = `${pulseDuration}s`;
        
        // Update breathing animation
        const breathIcon = document.querySelectorAll('.pulse-icon')[1];
        if (breathIcon && this.currentBreathingRate > 0) {
            const breathDuration = 60 / this.currentBreathingRate;
            breathIcon.style.animationDuration = `${breathDuration}s`;
        }
        
        // Add to history
        const now = new Date();
        const timeLabel = now.toLocaleTimeString();
        
        this.heartRateHistory.push({
            time: timeLabel,
            value: heartRate
        });
        
        // Keep only last 30 readings
        if (this.heartRateHistory.length > 30) {
            this.heartRateHistory.shift();
        }
        
        // Update chart
        this.updateChart();
    }
    
    updateChart() {
        this.chart.data.labels = this.heartRateHistory.map(h => h.time);
        this.chart.data.datasets[0].data = this.heartRateHistory.map(h => h.value);
        this.chart.update();
    }
    
    stopMonitoring() {
        this.isMonitoring = false;
        
        // Stop video stream
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
        
        // Reset UI
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.loading.style.display = 'none';
        this.status.textContent = 'Monitoring stopped';
        this.heartRateDisplay.textContent = '--';
        document.getElementById('breathingRate').textContent = '--';
        
        // Clear data
        this.frameBuffer = [];
        this.currentHeartRate = 0;
        this.currentBreathingRate = 0;
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new HeartRateMonitor();
});