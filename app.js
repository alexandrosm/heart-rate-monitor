class HeartRateMonitor {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.status = document.getElementById('status');
        this.heartRateDisplay = document.getElementById('heartRate');
        this.loading = document.getElementById('loading');
        
        // Overlay toggles
        this.showRegions = document.getElementById('showRegions');
        this.showAlgorithms = document.getElementById('showAlgorithms');
        this.showHistogram = document.getElementById('showHistogram');
        this.showPulse = document.getElementById('showPulse');
        this.showAlgorithmChart = document.getElementById('showAlgorithmChart');
        
        this.isMonitoring = false;
        this.faceDetector = null;
        this.frameBuffer = [];
        this.bufferSize = 300; // 10 seconds at 30fps for better breathing detection
        this.samplingRate = 30;
        this.heartRateHistory = [];
        this.breathingRateHistory = [];
        this.fullHistory = [];
        this.algorithmHistory = {
            all: {
                FFT: [],
                PeakDetection: [],
                Autocorrelation: [],
                Wavelet: []
            },
            forehead: {
                FFT: [],
                PeakDetection: [],
                Autocorrelation: [],
                Wavelet: []
            },
            leftUnderEye: {
                FFT: [],
                PeakDetection: [],
                Autocorrelation: [],
                Wavelet: []
            },
            rightUnderEye: {
                FFT: [],
                PeakDetection: [],
                Autocorrelation: [],
                Wavelet: []
            },
            noseBridge: {
                FFT: [],
                PeakDetection: [],
                Autocorrelation: [],
                Wavelet: []
            }
        };
        this.chart = null;
        this.fullHistoryChart = null;
        this.algorithmComparisonChart = null;
        this.regionConsensusChart = null;
        this.sessionStartTime = null;
        this.currentHeartRate = 0;
        this.currentBreathingRate = 0;
        
        // Regional consensus tracking
        this.regionConsensusHistory = {
            forehead: [],
            leftUnderEye: [],
            rightUnderEye: [],
            noseBridge: []
        };
        
        // Performance tracking
        this.performanceMetrics = {
            all: { FFT: [], PeakDetection: [], Autocorrelation: [], Wavelet: [] },
            forehead: { FFT: [], PeakDetection: [], Autocorrelation: [], Wavelet: [] },
            leftUnderEye: { FFT: [], PeakDetection: [], Autocorrelation: [], Wavelet: [] },
            rightUnderEye: { FFT: [], PeakDetection: [], Autocorrelation: [], Wavelet: [] },
            noseBridge: { FFT: [], PeakDetection: [], Autocorrelation: [], Wavelet: [] }
        };
        this.regionSignalQuality = {
            forehead: { snr: 0, stability: 0 },
            leftUnderEye: { snr: 0, stability: 0 },
            rightUnderEye: { snr: 0, stability: 0 },
            noseBridge: { snr: 0, stability: 0 }
        };
        
        // Face detection stability
        this.lastDetection = null;
        this.detectionMissCount = 0;
        this.maxMissCount = 10; // Allow up to 10 frames without detection
        this.frameCount = 0;
        this.detectionInterval = 5; // Only detect face every 5 frames for performance
        
        // Smoothing for measurements
        this.heartRateSmoothing = [];
        this.breathingRateSmoothing = [];
        this.smoothingWindow = 5;
        
        // Create offscreen canvas for double buffering
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
        
        // Multi-region detection
        this.regionBuffers = {
            forehead: [],
            leftUnderEye: [],
            rightUnderEye: [],
            noseBridge: []
        };
        this.regionColors = {
            forehead: '#00ff00',
            leftUnderEye: '#ff00ff',
            rightUnderEye: '#00ffff',
            noseBridge: '#ffff00'
        };
        
        // Algorithm selection
        this.algorithms = {
            'FFT': this.estimateRateFFT.bind(this),
            'PeakDetection': this.estimateRatePeakDetection.bind(this),
            'Autocorrelation': this.estimateRateAutocorrelation.bind(this),
            'Wavelet': this.estimateRateWavelet.bind(this)
        };
        
        this.initializeEventListeners();
        this.initializeChart();
    }
    
    initializeEventListeners() {
        this.startBtn.addEventListener('click', () => this.startMonitoring());
        this.stopBtn.addEventListener('click', () => this.stopMonitoring());
        
        // Toggle all overlays button
        const toggleAllBtn = document.getElementById('toggleAll');
        toggleAllBtn.addEventListener('click', () => {
            const checkboxes = [this.showRegions, this.showAlgorithms, this.showHistogram, this.showPulse];
            const anyChecked = checkboxes.some(cb => cb.checked);
            checkboxes.forEach(cb => cb.checked = !anyChecked);
        });
        
        // Export data button
        const exportBtn = document.getElementById('exportData');
        exportBtn.addEventListener('click', () => this.exportData());
        
        // Algorithm chart toggle
        this.showAlgorithmChart.addEventListener('change', (e) => {
            const container = document.getElementById('algorithmChartsContainer');
            container.style.display = e.target.checked ? 'block' : 'none';
            if (e.target.checked && this.algorithmCharts) {
                this.updateAlgorithmComparisonCharts();
            }
        });
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
                        beginAtZero: true,
                        min: 0,
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
        
        // Initialize full history chart
        const fullCtx = document.getElementById('fullHistoryChart').getContext('2d');
        this.fullHistoryChart = new Chart(fullCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Heart Rate (BPM)',
                    data: [],
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.4,
                    fill: false,
                    yAxisID: 'y-heart'
                }, {
                    label: 'Breathing Rate (breaths/min)',
                    data: [],
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.4,
                    fill: false,
                    yAxisID: 'y-breath'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    'y-heart': {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        min: 0,
                        suggestedMax: 120,
                        title: {
                            display: true,
                            text: 'Heart Rate (BPM)',
                            color: '#e74c3c'
                        },
                        ticks: {
                            color: '#e74c3c'
                        }
                    },
                    'y-breath': {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        min: 0,
                        suggestedMax: 30,
                        title: {
                            display: true,
                            text: 'Breathing Rate (breaths/min)',
                            color: '#3498db'
                        },
                        ticks: {
                            color: '#3498db'
                        },
                        grid: {
                            drawOnChartArea: false,
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time (seconds from start)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                }
            }
        });
        
        // Initialize regional consensus chart
        const regionCtx = document.getElementById('regionConsensusChart').getContext('2d');
        this.regionConsensusChart = new Chart(regionCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Forehead',
                        data: [],
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        borderWidth: 2,
                        tension: 0.1,
                        pointRadius: 0
                    },
                    {
                        label: 'Left Under-Eye',
                        data: [],
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        borderWidth: 2,
                        tension: 0.1,
                        pointRadius: 0
                    },
                    {
                        label: 'Right Under-Eye',
                        data: [],
                        borderColor: '#2ecc71',
                        backgroundColor: 'rgba(46, 204, 113, 0.1)',
                        borderWidth: 2,
                        tension: 0.1,
                        pointRadius: 0
                    },
                    {
                        label: 'Nose Bridge',
                        data: [],
                        borderColor: '#f39c12',
                        backgroundColor: 'rgba(243, 156, 18, 0.1)',
                        borderWidth: 2,
                        tension: 0.1,
                        pointRadius: 0
                    },
                    {
                        label: 'Overall Consensus',
                        data: [],
                        borderColor: '#9b59b6',
                        backgroundColor: 'rgba(155, 89, 182, 0.1)',
                        borderWidth: 3,
                        borderDash: [5, 5],
                        tension: 0.1,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        min: 0,
                        suggestedMax: 120,
                        title: {
                            display: true,
                            text: 'Heart Rate (BPM)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time (seconds from start)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                }
            }
        });
        
        // Initialize algorithm comparison charts for each region
        this.algorithmCharts = {};
        const regions = ['all', 'forehead', 'leftUnderEye', 'rightUnderEye', 'noseBridge'];
        
        regions.forEach(region => {
            const chartElement = document.getElementById(`algorithmChart_${region}`);
            if (chartElement) {
                const ctx = chartElement.getContext('2d');
                this.algorithmCharts[region] = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [
                            {
                                label: 'FFT',
                                data: [],
                                borderColor: '#e74c3c',
                                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                                borderWidth: 2,
                                tension: 0.1,
                                pointRadius: 0
                            },
                            {
                                label: 'Peak Detection',
                                data: [],
                                borderColor: '#3498db',
                                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                                borderWidth: 2,
                                tension: 0.1,
                                pointRadius: 0
                            },
                            {
                                label: 'Autocorrelation',
                                data: [],
                                borderColor: '#2ecc71',
                                backgroundColor: 'rgba(46, 204, 113, 0.1)',
                                borderWidth: 2,
                                tension: 0.1,
                                pointRadius: 0
                            },
                            {
                                label: 'Wavelet',
                                data: [],
                                borderColor: '#f39c12',
                                backgroundColor: 'rgba(243, 156, 18, 0.1)',
                                borderWidth: 2,
                                tension: 0.1,
                                pointRadius: 0
                            },
                            {
                                label: 'Consensus',
                                data: [],
                                borderColor: '#9b59b6',
                                backgroundColor: 'rgba(155, 89, 182, 0.1)',
                                borderWidth: 3,
                                borderDash: [5, 5],
                                tension: 0.1,
                                pointRadius: 0
                            }
                        ]
                    },
                    options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        min: 0,
                        suggestedMax: 120,
                        title: {
                            display: true,
                            text: 'Heart Rate (BPM)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time (seconds from start)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                }
            }
                });
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
            
            // Set offscreen canvas size
            this.offscreenCanvas.width = this.canvas.width;
            this.offscreenCanvas.height = this.canvas.height;
            
            this.isMonitoring = true;
            this.stopBtn.disabled = false;
            this.status.textContent = 'Monitoring heart rate...';
            
            // Track session start time
            this.sessionStartTime = Date.now();
            this.fullHistory = [];
            
            // Reset algorithm history and performance metrics
            Object.keys(this.algorithmHistory).forEach(region => {
                Object.keys(this.algorithmHistory[region]).forEach(algo => {
                    this.algorithmHistory[region][algo] = [];
                });
            });
            Object.keys(this.performanceMetrics).forEach(region => {
                Object.keys(this.performanceMetrics[region]).forEach(algo => {
                    this.performanceMetrics[region][algo] = [];
                });
            });
            
            // Reset regional consensus history
            Object.keys(this.regionConsensusHistory).forEach(region => {
                this.regionConsensusHistory[region] = [];
            });
            
            // Show performance analysis div
            document.getElementById('performanceAnalysis').style.display = 'block';
            
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
        
        // Only clear and redraw if we have a detection
        if (detection) {
            // Clear canvas only when drawing
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.loading.style.display = 'none';
            
            // Get facial landmarks
            const landmarks = detection.landmarks;
            const leftEyebrow = landmarks.getLeftEyeBrow();
            const rightEyebrow = landmarks.getRightEyeBrow();
            const nose = landmarks.getNose();
            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();
            const jawline = landmarks.getJawOutline();
            
            // Define multiple regions with boundary checks
            const videoWidth = this.video.videoWidth;
            const videoHeight = this.video.videoHeight;
            
            const regions = {
                forehead: {
                    x: Math.max(0, leftEyebrow[0].x),
                    y: Math.max(0, Math.min(...leftEyebrow.concat(rightEyebrow).map(p => p.y)) - 30),
                    width: Math.min(videoWidth - leftEyebrow[0].x, rightEyebrow[rightEyebrow.length - 1].x - leftEyebrow[0].x),
                    height: Math.min(30, videoHeight - (Math.min(...leftEyebrow.concat(rightEyebrow).map(p => p.y)) - 30))
                },
                leftUnderEye: {
                    x: Math.max(0, leftEye[0].x - 5),
                    y: Math.max(0, Math.max(...leftEye.map(p => p.y)) + 5),
                    width: Math.min(videoWidth - (leftEye[0].x - 5), leftEye[3].x - leftEye[0].x + 10),
                    height: Math.min(25, videoHeight - (Math.max(...leftEye.map(p => p.y)) + 5))
                },
                rightUnderEye: {
                    x: Math.max(0, rightEye[0].x - 5),
                    y: Math.max(0, Math.max(...rightEye.map(p => p.y)) + 5),
                    width: Math.min(videoWidth - (rightEye[0].x - 5), rightEye[3].x - rightEye[0].x + 10),
                    height: Math.min(25, videoHeight - (Math.max(...rightEye.map(p => p.y)) + 5))
                },
                noseBridge: {
                    x: Math.max(0, nose[0].x - 15),
                    y: Math.max(0, nose[0].y - 10),
                    width: Math.min(30, videoWidth - (nose[0].x - 15)),
                    height: Math.min(25, videoHeight - (nose[0].y - 10))
                }
            };
            
            // Process each region
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
            
            for (const [regionName, region] of Object.entries(regions)) {
                // Validate region bounds more strictly
                const validWidth = Math.floor(region.width);
                const validHeight = Math.floor(region.height);
                const validX = Math.max(0, Math.floor(region.x));
                const validY = Math.max(0, Math.floor(region.y));
                
                if (validWidth > 0 && validHeight > 0 && 
                    validX >= 0 && validY >= 0 &&
                    validX + validWidth <= this.video.videoWidth &&
                    validY + validHeight <= this.video.videoHeight) {
                    
                    // Draw region overlay if enabled
                    if (this.showRegions.checked) {
                        this.ctx.strokeStyle = this.regionColors[regionName];
                        this.ctx.lineWidth = 2;
                        this.ctx.strokeRect(validX, validY, validWidth, validHeight);
                        
                        // Draw region label
                        this.ctx.fillStyle = this.regionColors[regionName];
                        this.ctx.font = '12px Arial';
                        this.ctx.fillText(regionName, validX, validY - 5);
                    }
                    
                    // Extract region for analysis
                    tempCanvas.width = validWidth;
                    tempCanvas.height = validHeight;
                    tempCtx.drawImage(
                        this.video,
                        validX, validY, validWidth, validHeight,
                        0, 0, validWidth, validHeight
                    );
                    
                    // Get signal value
                    const imageData = tempCtx.getImageData(0, 0, validWidth, validHeight);
                    const signalValue = this.getAverageGreenChannel(imageData);
                    
                    // Add to region buffer
                    this.regionBuffers[regionName].push({
                        value: signalValue,
                        timestamp: Date.now()
                    });
                    
                    // Keep buffer size limited
                    if (this.regionBuffers[regionName].length > this.bufferSize) {
                        this.regionBuffers[regionName].shift();
                    }
                }
            }
            
            // Use forehead as primary signal for backward compatibility
            if (this.regionBuffers.forehead.length > 0) {
                const latestForehead = this.regionBuffers.forehead[this.regionBuffers.forehead.length - 1];
                this.frameBuffer.push(latestForehead);
                if (this.frameBuffer.length > this.bufferSize) {
                    this.frameBuffer.shift();
                }
            }
            
            // Draw signal visualization
            if (this.frameBuffer.length > 10) {
                this.drawSignalVisualization();
            }
            
            // Update status when face is detected
            this.status.textContent = 'Face detected. Measuring heart rate...';
            
            // Calculate heart rate if we have enough data
            if (this.frameBuffer.length >= this.bufferSize / 2) {
                const rates = this.calculateMultiRegionVitalSigns();
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
                    const confidence = rates.confidence || 0;
                    this.status.textContent = `HR: ${smoothedHR} BPM | Breathing: ${smoothedBR} BPM | Confidence: ${confidence}%`;
                    
                    // Draw vitals on video
                    this.ctx.fillStyle = '#e74c3c';
                    this.ctx.font = 'bold 24px Arial';
                    this.ctx.fillText(`${smoothedHR} BPM`, 20, 40);
                    
                    // Draw breathing rate
                    this.ctx.fillStyle = '#3498db';
                    this.ctx.font = 'bold 20px Arial';
                    this.ctx.fillText(`Breathing: ${smoothedBR}/min`, 20, 70);
                    
                    // Draw simple pulse indicator if enabled
                    if (this.showPulse.checked) {
                        const pulsePhase = (Date.now() % (60000 / smoothedHR)) / (60000 / smoothedHR);
                        const pulseSize = 12 + Math.sin(pulsePhase * 2 * Math.PI) * 4;
                        
                        this.ctx.fillStyle = `rgba(231, 76, 60, ${0.6 + Math.sin(pulsePhase * 2 * Math.PI) * 0.4})`;
                        this.ctx.beginPath();
                        this.ctx.arc(180, 40, pulseSize, 0, 2 * Math.PI);
                        this.ctx.fill();
                    }
                    
                    // Draw confidence indicator
                    this.ctx.font = '14px Arial';
                    this.ctx.fillStyle = confidence > 70 ? '#2ecc71' : confidence > 40 ? '#f39c12' : '#e74c3c';
                    this.ctx.fillText(`Confidence: ${confidence}%`, 20, 95);
                }
            }
        } else {
            // Clear canvas when no face detected
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.status.textContent = 'No face detected. Please position your face in the camera view.';
        }
        
        // Continue processing with throttling
        setTimeout(() => {
            requestAnimationFrame(() => this.processFrames());
        }, 1000 / this.samplingRate); // Maintain consistent frame rate
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
    
    getAlgorithmWeights() {
        const weights = {};
        
        // Initialize default weights
        const algorithms = ['FFT', 'PeakDetection', 'Autocorrelation', 'Wavelet'];
        algorithms.forEach(algo => {
            weights[algo] = 0.25; // Default equal weight
        });
        
        // If we have performance metrics, calculate dynamic weights
        const allMetrics = [];
        
        Object.keys(this.performanceMetrics).forEach(region => {
            Object.keys(this.performanceMetrics[region]).forEach(algorithm => {
                const metrics = this.performanceMetrics[region][algorithm];
                if (metrics.length > 0) {
                    const recent = metrics.slice(-5); // Last 5 measurements
                    const avgMetrics = {
                        variance: recent.reduce((a, m) => a + m.variance, 0) / recent.length,
                        consensusDeviation: recent.reduce((a, m) => a + m.consensusDeviation, 0) / recent.length,
                        snr: recent.reduce((a, m) => a + m.snr, 0) / recent.length,
                        plausibility: recent.reduce((a, m) => a + m.plausibility, 0) / recent.length
                    };
                    
                    // Calculate score (higher is better)
                    const score = (avgMetrics.snr * 0.3) + 
                                 (avgMetrics.plausibility * 100 * 0.3) +
                                 ((1 / (1 + avgMetrics.variance)) * 100 * 0.2) +
                                 ((1 / (1 + avgMetrics.consensusDeviation)) * 100 * 0.2);
                    
                    allMetrics.push({ algorithm, score });
                }
            });
        });
        
        // If we have enough data, calculate weights based on performance
        if (allMetrics.length >= 4) {
            // Group by algorithm and average scores
            const algorithmScores = {};
            algorithms.forEach(algo => {
                const algoMetrics = allMetrics.filter(m => m.algorithm === algo);
                if (algoMetrics.length > 0) {
                    algorithmScores[algo] = algoMetrics.reduce((a, m) => a + m.score, 0) / algoMetrics.length;
                } else {
                    algorithmScores[algo] = 50; // Default score
                }
            });
            
            // Convert scores to weights (normalized to sum to 1)
            const totalScore = Object.values(algorithmScores).reduce((a, b) => a + b, 0);
            if (totalScore > 0) {
                algorithms.forEach(algo => {
                    weights[algo] = algorithmScores[algo] / totalScore;
                });
            }
        }
        
        return weights;
    }
    
    getRegionWeights() {
        const weights = {
            forehead: 0.25,
            leftUnderEye: 0.25,
            rightUnderEye: 0.25,
            noseBridge: 0.25
        };
        
        // Adjust weights based on signal quality
        const qualities = this.regionSignalQuality;
        const totalQuality = Object.values(qualities).reduce((sum, q) => sum + q.stability, 0);
        
        if (totalQuality > 0) {
            Object.keys(weights).forEach(region => {
                if (qualities[region]) {
                    weights[region] = qualities[region].stability / totalQuality;
                }
            });
        }
        
        return weights;
    }
    
    calculateMultiRegionVitalSigns() {
        // Check if we have enough data in multiple regions
        const validRegions = Object.entries(this.regionBuffers)
            .filter(([name, buffer]) => buffer.length >= this.bufferSize / 2);
        
        if (validRegions.length === 0) {
            return { heartRate: 0, breathingRate: 0, confidence: 0 };
        }
        
        // Calculate heart rate for each region using multiple algorithms
        const allResults = [];
        const algorithmResults = {};
        const regionAlgorithmResults = {};
        
        for (const [regionName, buffer] of validRegions) {
            const signal = buffer.map(frame => frame.value);
            const detrendedSignal = this.detrend(signal);
            
            // Get heart rate for this region using each algorithm
            const heartSignal = this.bandpassFilter(detrendedSignal, 0.75, 4, this.samplingRate);
            
            if (!regionAlgorithmResults[regionName]) {
                regionAlgorithmResults[regionName] = {};
            }
            
            for (const [algoName, algoFunc] of Object.entries(this.algorithms)) {
                const heartRate = algoFunc(heartSignal, this.samplingRate, 0.75, 4);
                
                if (heartRate > 0) {
                    allResults.push({
                        region: regionName,
                        algorithm: algoName,
                        heartRate: heartRate
                    });
                    
                    // Track results by algorithm
                    if (!algorithmResults[algoName]) {
                        algorithmResults[algoName] = [];
                    }
                    algorithmResults[algoName].push(heartRate);
                    
                    // Track results by region and algorithm
                    if (!regionAlgorithmResults[regionName][algoName]) {
                        regionAlgorithmResults[regionName][algoName] = [];
                    }
                    regionAlgorithmResults[regionName][algoName].push(heartRate);
                }
            }
        }
        
        if (allResults.length === 0) {
            return { heartRate: 0, breathingRate: 0, confidence: 0 };
        }
        
        // Get dynamic weights based on performance
        const algoWeights = this.getAlgorithmWeights();
        const regionWeights = this.getRegionWeights();
        
        // Calculate weighted consensus using both algorithm and region weights
        let weightedSum = 0;
        let totalWeight = 0;
        
        // Process each result with combined weights
        allResults.forEach(result => {
            const algoWeight = algoWeights[result.algorithm] || 0.25;
            const regionWeight = regionWeights[result.region] || 0.25;
            const combinedWeight = algoWeight * regionWeight;
            
            weightedSum += result.heartRate * combinedWeight;
            totalWeight += combinedWeight;
        });
        
        // Use weighted average as consensus, fallback to median if needed
        const medianHR = totalWeight > 0 ? weightedSum / totalWeight : 
            allResults.map(r => r.heartRate).sort((a, b) => a - b)[Math.floor(allResults.length / 2)];
        
        // Calculate breathing rate (simplified - using FFT only)
        const breathingRate = this.calculateBreathingRate(validRegions[0][1]);
        
        // Calculate confidence based on agreement
        const allHeartRates = allResults.map(r => r.heartRate);
        const hrStdDev = this.calculateStdDev(allHeartRates);
        const confidence = Math.max(0, Math.min(100, 100 - hrStdDev));
        
        // Store algorithm results for chart
        if (this.sessionStartTime) {
            const currentTime = Math.floor((Date.now() - this.sessionStartTime) / 1000);
            
            // Store combined algorithm results
            for (const [algoName, results] of Object.entries(algorithmResults)) {
                if (results.length > 0) {
                    const algoMedian = results.sort((a, b) => a - b)[Math.floor(results.length / 2)];
                    this.algorithmHistory.all[algoName].push({
                        time: currentTime,
                        value: algoMedian
                    });
                }
            }
            
            // Calculate and store regional consensus
            const regionalConsensus = {};
            for (const [regionName, regionAlgos] of Object.entries(regionAlgorithmResults)) {
                const regionResults = [];
                for (const [algoName, results] of Object.entries(regionAlgos)) {
                    if (results.length > 0) {
                        // Apply algorithm weights to each result
                        const algoWeight = algoWeights[algoName] || 0.25;
                        results.forEach(hr => {
                            regionResults.push({ value: hr, weight: algoWeight });
                        });
                    }
                }
                
                if (regionResults.length > 0) {
                    // Calculate weighted consensus for this region
                    const weightedSum = regionResults.reduce((sum, r) => sum + r.value * r.weight, 0);
                    const totalWeight = regionResults.reduce((sum, r) => sum + r.weight, 0);
                    const regionConsensusHR = totalWeight > 0 ? weightedSum / totalWeight : 0;
                    
                    regionalConsensus[regionName] = regionConsensusHR;
                    
                    // Store in history
                    if (this.regionConsensusHistory[regionName]) {
                        this.regionConsensusHistory[regionName].push({
                            time: currentTime,
                            value: Math.round(regionConsensusHR)
                        });
                        
                        // Keep history limited
                        if (this.regionConsensusHistory[regionName].length > 300) {
                            this.regionConsensusHistory[regionName].shift();
                        }
                    }
                }
            }
            
            // Update regional consensus chart
            this.updateRegionalConsensusChart();
            
            // Store region-specific algorithm results
            for (const [regionName, regionAlgos] of Object.entries(regionAlgorithmResults)) {
                for (const [algoName, results] of Object.entries(regionAlgos)) {
                    if (results.length > 0) {
                        const algoMedian = results.sort((a, b) => a - b)[Math.floor(results.length / 2)];
                        if (this.algorithmHistory[regionName] && this.algorithmHistory[regionName][algoName]) {
                            this.algorithmHistory[regionName][algoName].push({
                                time: currentTime,
                                value: algoMedian
                            });
                        }
                    }
                }
            }
            
            // Update algorithm comparison chart if visible
            if (this.showAlgorithmChart.checked) {
                this.updateAlgorithmComparisonCharts();
            }
            
            // Calculate performance metrics every 5 seconds
            if (this.frameCount % (30 * 5) === 0) { // Assuming ~30 fps
                this.calculatePerformanceMetrics();
                this.updatePerformanceDisplay();
            }
        }
        
        // Show algorithm comparison
        this.drawAlgorithmResults(algorithmResults, medianHR);
        
        return {
            heartRate: medianHR,
            breathingRate: breathingRate,
            confidence: Math.round(confidence)
        };
    }
    
    calculateStdDev(values) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(variance);
    }
    
    calculateBreathingRate(buffer) {
        if (!buffer || buffer.length < this.bufferSize / 2) return 0;
        const signal = buffer.map(frame => frame.value);
        const detrendedSignal = this.detrend(signal);
        const breathingSignal = this.bandpassFilter(detrendedSignal, 0.1, 0.5, this.samplingRate);
        return this.estimateRateFFT(breathingSignal, this.samplingRate, 0.1, 0.5);
    }
    
    drawAlgorithmResults(algorithmResults, consensusHR) {
        if (!this.showAlgorithms.checked) return;
        
        // Draw algorithm comparison
        let yPos = 120;
        this.ctx.font = '11px Arial';
        
        // Title
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText('Algorithm Results:', 20, yPos);
        yPos += 15;
        
        for (const [algoName, results] of Object.entries(algorithmResults)) {
            if (results.length > 0) {
                const median = results.sort((a, b) => a - b)[Math.floor(results.length / 2)];
                const deviation = Math.abs(median - consensusHR);
                const isGood = deviation < 5;
                
                this.ctx.fillStyle = isGood ? '#2ecc71' : '#e74c3c';
                this.ctx.fillText(
                    `${algoName}: ${median} BPM (${results.length} samples) ${isGood ? '✓' : '⚠'}`,
                    20, yPos
                );
                yPos += 13;
            }
        }
        
        // Draw mini histogram of all results
        if (this.showHistogram.checked) {
            this.drawMiniHistogram(Object.values(algorithmResults).flat(), consensusHR);
        }
    }
    
    drawMiniHistogram(values, consensus) {
        if (values.length === 0) return;
        
        const histX = this.canvas.width - 220;
        const histY = 120;
        const histWidth = 200;
        const histHeight = 80;
        
        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(histX, histY, histWidth, histHeight);
        
        // Create histogram bins
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const binCount = Math.min(10, values.length);
        const binWidth = range / binCount;
        
        const bins = new Array(binCount).fill(0);
        values.forEach(val => {
            const binIndex = Math.min(Math.floor((val - min) / binWidth), binCount - 1);
            bins[binIndex]++;
        });
        
        const maxCount = Math.max(...bins);
        
        // Draw bins
        this.ctx.fillStyle = '#3498db';
        bins.forEach((count, i) => {
            const x = histX + (i / binCount) * histWidth;
            const barWidth = histWidth / binCount - 2;
            const barHeight = (count / maxCount) * histHeight * 0.8;
            const y = histY + histHeight - barHeight - 10;
            
            this.ctx.fillRect(x, y, barWidth, barHeight);
        });
        
        // Draw consensus line
        const consensusX = histX + ((consensus - min) / range) * histWidth;
        this.ctx.strokeStyle = '#e74c3c';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(consensusX, histY);
        this.ctx.lineTo(consensusX, histY + histHeight);
        this.ctx.stroke();
        
        // Label
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '10px Arial';
        this.ctx.fillText('Distribution', histX + 5, histY + 12);
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
    
    estimateRatePeakDetection(signal, sampleRate, minFreq, maxFreq) {
        // Find peaks in the signal
        const peaks = [];
        const minDistance = Math.floor(sampleRate / maxFreq); // Minimum samples between peaks
        const threshold = this.calculateDynamicThreshold(signal);
        
        for (let i = 1; i < signal.length - 1; i++) {
            // Check if this is a peak
            if (signal[i] > signal[i-1] && signal[i] > signal[i+1] && signal[i] > threshold) {
                // Check minimum distance from last peak
                if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
                    peaks.push(i);
                }
            }
        }
        
        if (peaks.length < 2) return 0;
        
        // Calculate average interval between peaks
        let totalInterval = 0;
        for (let i = 1; i < peaks.length; i++) {
            totalInterval += peaks[i] - peaks[i-1];
        }
        const avgInterval = totalInterval / (peaks.length - 1);
        const freq = sampleRate / avgInterval;
        const rate = freq * 60;
        
        // Validate range
        if (rate >= minFreq * 60 && rate <= maxFreq * 60) {
            return Math.round(rate);
        }
        return 0;
    }
    
    calculateDynamicThreshold(signal) {
        const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
        const stdDev = Math.sqrt(
            signal.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / signal.length
        );
        return mean + stdDev * 0.5;
    }
    
    estimateRateAutocorrelation(signal, sampleRate, minFreq, maxFreq) {
        // Autocorrelation-based frequency detection
        const minLag = Math.floor(sampleRate / maxFreq);
        const maxLag = Math.floor(sampleRate / minFreq);
        
        const autocorr = [];
        for (let lag = minLag; lag <= maxLag && lag < signal.length; lag++) {
            let sum = 0;
            for (let i = 0; i < signal.length - lag; i++) {
                sum += signal[i] * signal[i + lag];
            }
            autocorr.push({ lag: lag, value: sum });
        }
        
        // Find the peak in autocorrelation
        let maxCorr = autocorr[0];
        for (const corr of autocorr) {
            if (corr.value > maxCorr.value) {
                maxCorr = corr;
            }
        }
        
        const freq = sampleRate / maxCorr.lag;
        const rate = freq * 60;
        
        if (rate >= minFreq * 60 && rate <= maxFreq * 60) {
            return Math.round(rate);
        }
        return 0;
    }
    
    estimateRateWavelet(signal, sampleRate, minFreq, maxFreq) {
        // Simplified continuous wavelet transform using Morlet wavelet
        const scales = [];
        const freqs = [];
        
        // Generate scales corresponding to frequencies of interest
        for (let freq = minFreq; freq <= maxFreq; freq += 0.1) {
            const scale = sampleRate / (2 * freq);
            scales.push(scale);
            freqs.push(freq);
        }
        
        const cwt = [];
        for (let i = 0; i < scales.length; i++) {
            const scale = scales[i];
            const waveletCoeffs = this.morletWaveletTransform(signal, scale);
            const power = waveletCoeffs.reduce((sum, coeff) => sum + coeff * coeff, 0);
            cwt.push({ freq: freqs[i], power: power });
        }
        
        // Find frequency with maximum power
        let maxPower = cwt[0];
        for (const point of cwt) {
            if (point.power > maxPower.power) {
                maxPower = point;
            }
        }
        
        const rate = maxPower.freq * 60;
        if (rate >= minFreq * 60 && rate <= maxFreq * 60) {
            return Math.round(rate);
        }
        return 0;
    }
    
    morletWaveletTransform(signal, scale) {
        const coeffs = [];
        const omega0 = 6; // Morlet wavelet parameter
        
        for (let n = 0; n < signal.length; n++) {
            let real = 0, imag = 0;
            
            for (let k = 0; k < signal.length; k++) {
                const t = (k - n) / scale;
                const gaussian = Math.exp(-t * t / 2);
                const sinusoid = Math.cos(omega0 * t);
                real += signal[k] * gaussian * sinusoid / Math.sqrt(scale);
            }
            
            coeffs.push(Math.sqrt(real * real));
        }
        
        return coeffs;
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
        
        // Keep only last 30 readings for the small chart
        if (this.heartRateHistory.length > 30) {
            this.heartRateHistory.shift();
        }
        
        // Add to full history
        if (this.sessionStartTime) {
            const secondsFromStart = Math.floor((Date.now() - this.sessionStartTime) / 1000);
            this.fullHistory.push({
                time: secondsFromStart,
                heartRate: heartRate,
                breathingRate: this.currentBreathingRate
            });
        }
        
        // Update charts
        this.updateChart();
        this.updateFullHistoryChart();
    }
    
    updateChart() {
        this.chart.data.labels = this.heartRateHistory.map(h => h.time);
        this.chart.data.datasets[0].data = this.heartRateHistory.map(h => h.value);
        this.chart.update();
    }
    
    updateRegionalConsensusChart() {
        if (!this.regionConsensusChart) return;
        
        // Get all time points
        const allTimes = new Set();
        Object.values(this.regionConsensusHistory).forEach(history => {
            history.forEach(point => allTimes.add(point.time));
        });
        
        // Also add times from full history for overall consensus
        this.fullHistory.forEach(point => allTimes.add(point.time));
        
        const times = Array.from(allTimes).sort((a, b) => a - b);
        
        if (times.length === 0) return;
        
        // Update each region's data
        const regionNames = ['forehead', 'leftUnderEye', 'rightUnderEye', 'noseBridge'];
        regionNames.forEach((region, index) => {
            const data = times.map(time => {
                const point = this.regionConsensusHistory[region].find(p => p.time === time);
                return point ? point.value : null;
            });
            this.regionConsensusChart.data.datasets[index].data = data;
        });
        
        // Update overall consensus (from full history)
        const overallData = times.map(time => {
            const point = this.fullHistory.find(p => p.time === time);
            return point ? point.heartRate : null;
        });
        this.regionConsensusChart.data.datasets[4].data = overallData;
        
        // Update labels
        this.regionConsensusChart.data.labels = times;
        
        // Update x-axis for longer sessions
        const duration = times[times.length - 1] || 0;
        if (duration > 300) { // More than 5 minutes
            this.regionConsensusChart.options.scales.x.title.text = 'Time (minutes from start)';
            this.regionConsensusChart.data.labels = times.map(t => (t / 60).toFixed(1));
        } else {
            this.regionConsensusChart.options.scales.x.title.text = 'Time (seconds from start)';
        }
        
        this.regionConsensusChart.update();
    }
    
    updateFullHistoryChart() {
        if (!this.fullHistoryChart || this.fullHistory.length === 0) return;
        
        // Show export button when we have data
        document.getElementById('exportData').style.display = 'inline-block';
        
        // Prepare data
        const times = this.fullHistory.map(h => h.time);
        const heartRates = this.fullHistory.map(h => h.heartRate);
        const breathingRates = this.fullHistory.map(h => h.breathingRate);
        
        // Update chart data
        this.fullHistoryChart.data.labels = times;
        this.fullHistoryChart.data.datasets[0].data = heartRates;
        this.fullHistoryChart.data.datasets[1].data = breathingRates;
        
        // Keep y-axes zero-based, no dynamic scaling
        
        // Update x-axis to show time nicely
        const duration = times[times.length - 1] || 0;
        if (duration > 300) { // More than 5 minutes
            this.fullHistoryChart.options.scales.x.title.text = 'Time (minutes from start)';
            this.fullHistoryChart.data.labels = times.map(t => (t / 60).toFixed(1));
        }
        
        this.fullHistoryChart.update();
    }
    
    updateAlgorithmComparisonCharts() {
        if (!this.algorithmCharts) return;
        
        // Update each region's chart
        Object.keys(this.algorithmCharts).forEach(region => {
            this.updateRegionAlgorithmChart(region);
        });
    }
    
    updateRegionAlgorithmChart(region) {
        const chart = this.algorithmCharts[region];
        if (!chart) return;
        
        const regionData = this.algorithmHistory[region];
        if (!regionData) return;
        
        // Get all time points for this region
        const allTimes = new Set();
        Object.values(regionData).forEach(history => {
            history.forEach(point => allTimes.add(point.time));
        });
        const times = Array.from(allTimes).sort((a, b) => a - b);
        
        if (times.length === 0) return;
        
        // Algorithm names for indexing
        const algorithmNames = ['FFT', 'PeakDetection', 'Autocorrelation', 'Wavelet'];
        
        algorithmNames.forEach((algoName, index) => {
            const history = regionData[algoName];
            const data = times.map(time => {
                const point = history.find(p => p.time === time);
                return point ? point.value : null;
            });
            
            chart.data.datasets[index].data = data;
        });
        
        // Add consensus line (from full history for "all", or calculate median for specific region)
        let consensusData;
        if (region === 'all') {
            consensusData = times.map(time => {
                const point = this.fullHistory.find(p => p.time === time);
                return point ? point.heartRate : null;
            });
        } else {
            // Calculate median across algorithms for this region
            consensusData = times.map(time => {
                const values = algorithmNames
                    .map(algoName => {
                        const point = regionData[algoName].find(p => p.time === time);
                        return point ? point.value : null;
                    })
                    .filter(v => v !== null);
                
                if (values.length > 0) {
                    values.sort((a, b) => a - b);
                    return values[Math.floor(values.length / 2)];
                }
                return null;
            });
        }
        chart.data.datasets[4].data = consensusData;
        
        // Update labels
        chart.data.labels = times;
        
        // Update x-axis for longer sessions
        const duration = times[times.length - 1] || 0;
        if (duration > 300) { // More than 5 minutes
            chart.options.scales.x.title.text = 'Time (minutes from start)';
            chart.data.labels = times.map(t => (t / 60).toFixed(1));
        } else {
            chart.options.scales.x.title.text = 'Time (seconds from start)';
        }
        
        chart.update();
    }
    
    calculatePerformanceMetrics() {
        const consensusValues = this.fullHistory.map(h => h.heartRate);
        if (consensusValues.length < 10) return; // Need enough data
        
        // For each region and algorithm
        Object.keys(this.algorithmHistory).forEach(region => {
            Object.keys(this.algorithmHistory[region]).forEach(algorithm => {
                const history = this.algorithmHistory[region][algorithm];
                if (history.length < 10) return;
                
                // Get recent values (last 30 seconds)
                const recentValues = history.slice(-30).map(h => h.value);
                const recentConsensus = consensusValues.slice(-30);
                
                // Calculate metrics
                const metrics = {
                    // Variance (lower is better - more stable)
                    variance: this.calculateVariance(recentValues),
                    
                    // Deviation from consensus (lower is better)
                    consensusDeviation: this.calculateMeanAbsoluteError(recentValues, recentConsensus),
                    
                    // Signal-to-noise ratio estimate (higher is better)
                    snr: this.estimateSNR(recentValues),
                    
                    // Physiological plausibility (% of values in 40-180 BPM range)
                    plausibility: recentValues.filter(v => v >= 40 && v <= 180).length / recentValues.length,
                    
                    // Timestamp for tracking
                    timestamp: Date.now()
                };
                
                // Store metrics
                this.performanceMetrics[region][algorithm].push(metrics);
                
                // Keep only last 100 metric calculations
                if (this.performanceMetrics[region][algorithm].length > 100) {
                    this.performanceMetrics[region][algorithm].shift();
                }
            });
        });
        
        // Calculate region signal quality
        ['forehead', 'leftUnderEye', 'rightUnderEye', 'noseBridge'].forEach(region => {
            const buffer = this.regionBuffers[region];
            if (buffer.length > 20) {
                const values = buffer.slice(-20).map(b => b.value);
                this.regionSignalQuality[region] = {
                    snr: this.estimateSNR(values),
                    stability: 1 / (1 + this.calculateVariance(values) / 100) // 0-1 score
                };
            }
        });
    }
    
    calculateVariance(values) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }
    
    calculateMeanAbsoluteError(predicted, actual) {
        if (predicted.length !== actual.length) return Infinity;
        const errors = predicted.map((p, i) => Math.abs(p - (actual[i] || p)));
        return errors.reduce((a, b) => a + b, 0) / errors.length;
    }
    
    estimateSNR(values) {
        if (values.length < 10) return 0;
        
        // Simple SNR estimate using peak-to-noise ratio
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const mad = sorted.map(v => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
        const noise = mad * 1.4826; // MAD to std deviation
        
        // Use simplified FFT to find dominant frequency magnitude
        const fftSize = Math.min(values.length, 128);
        const powerSpectrum = [];
        
        // Compute power spectrum
        for (let k = 0; k < fftSize / 2; k++) {
            let real = 0, imag = 0;
            
            for (let n = 0; n < fftSize; n++) {
                const angle = -2 * Math.PI * k * n / fftSize;
                const value = n < values.length ? values[n] : 0;
                real += value * Math.cos(angle);
                imag += value * Math.sin(angle);
            }
            
            powerSpectrum.push(Math.sqrt(real * real + imag * imag));
        }
        
        // Find peak magnitude (excluding DC component)
        const signal = Math.max(...powerSpectrum.slice(1));
        
        return noise > 0 && signal > 0 ? 20 * Math.log10(signal / noise) : 0;
    }
    
    updatePerformanceDisplay() {
        // Get recent performance metrics
        const recentMetrics = {};
        const rankings = {
            regions: {},
            algorithms: {},
            combined: []
        };
        
        // Collect recent metrics for each region/algorithm combination
        Object.keys(this.performanceMetrics).forEach(region => {
            Object.keys(this.performanceMetrics[region]).forEach(algorithm => {
                const metrics = this.performanceMetrics[region][algorithm];
                if (metrics.length > 0) {
                    const recent = metrics.slice(-10); // Last 10 measurements
                    const avgMetrics = {
                        variance: recent.reduce((a, m) => a + m.variance, 0) / recent.length,
                        consensusDeviation: recent.reduce((a, m) => a + m.consensusDeviation, 0) / recent.length,
                        snr: recent.reduce((a, m) => a + m.snr, 0) / recent.length,
                        plausibility: recent.reduce((a, m) => a + m.plausibility, 0) / recent.length
                    };
                    
                    // Calculate composite score (higher is better)
                    const score = (avgMetrics.snr * 0.3) + 
                                 (avgMetrics.plausibility * 100 * 0.3) +
                                 ((1 / (1 + avgMetrics.variance)) * 100 * 0.2) +
                                 ((1 / (1 + avgMetrics.consensusDeviation)) * 100 * 0.2);
                    
                    rankings.combined.push({
                        region,
                        algorithm,
                        score,
                        metrics: avgMetrics
                    });
                    
                    // Track by region
                    if (!rankings.regions[region]) rankings.regions[region] = [];
                    rankings.regions[region].push({ algorithm, score });
                    
                    // Track by algorithm
                    if (!rankings.algorithms[algorithm]) rankings.algorithms[algorithm] = [];
                    rankings.algorithms[algorithm].push({ region, score });
                }
            });
        });
        
        // Sort rankings
        rankings.combined.sort((a, b) => b.score - a.score);
        Object.keys(rankings.regions).forEach(region => {
            rankings.regions[region].sort((a, b) => b.score - a.score);
        });
        Object.keys(rankings.algorithms).forEach(algo => {
            rankings.algorithms[algo].sort((a, b) => b.score - a.score);
        });
        
        // Update display
        const performanceDiv = document.getElementById('performanceAnalysis');
        if (!performanceDiv) return;
        
        let html = '<h3>Performance Analysis</h3>';
        
        // Best overall combination
        if (rankings.combined.length > 0) {
            const best = rankings.combined[0];
            html += `<div class="best-combination">
                <strong>Best Performance:</strong> ${best.region} - ${best.algorithm}<br>
                <small>Score: ${best.score.toFixed(1)}, SNR: ${best.metrics.snr.toFixed(1)}dB, 
                Stability: ${(1/(1+best.metrics.variance)*100).toFixed(0)}%</small>
            </div>`;
        }
        
        // Best algorithm per region
        html += '<div class="region-rankings"><strong>Best Algorithm by Region:</strong><ul>';
        Object.entries(rankings.regions).forEach(([region, algos]) => {
            if (algos.length > 0) {
                html += `<li>${region}: ${algos[0].algorithm} (${algos[0].score.toFixed(1)})</li>`;
            }
        });
        html += '</ul></div>';
        
        // Signal quality indicators
        html += '<div class="signal-quality"><strong>Region Signal Quality:</strong><ul>';
        Object.entries(this.regionSignalQuality).forEach(([region, quality]) => {
            const qualityClass = quality.stability > 0.7 ? 'good' : quality.stability > 0.4 ? 'fair' : 'poor';
            html += `<li>${region}: <span class="quality-${qualityClass}">${(quality.stability * 100).toFixed(0)}%</span></li>`;
        });
        html += '</ul></div>';
        
        // Show current weights being used
        const algoWeights = this.getAlgorithmWeights();
        const regionWeights = this.getRegionWeights();
        
        html += '<div class="current-weights"><strong>Current Consensus Weights:</strong>';
        html += '<div style="margin-left: 20px; font-size: 12px;">';
        html += '<div>Algorithm Weights: ';
        Object.entries(algoWeights).forEach(([algo, weight]) => {
            html += `${algo}: ${(weight * 100).toFixed(0)}% `;
        });
        html += '</div>';
        html += '<div>Region Weights: ';
        Object.entries(regionWeights).forEach(([region, weight]) => {
            if (weight > 0.05) { // Only show significant weights
                html += `${region}: ${(weight * 100).toFixed(0)}% `;
            }
        });
        html += '</div></div></div>';
        
        performanceDiv.innerHTML = html;
    }
    
    exportData() {
        if (this.fullHistory.length === 0) return;
        
        // Create CSV content
        let csv = 'Time (seconds),Heart Rate (BPM),Breathing Rate (breaths/min),Timestamp\n';
        
        this.fullHistory.forEach(entry => {
            const timestamp = new Date(this.sessionStartTime + entry.time * 1000).toISOString();
            csv += `${entry.time},${entry.heartRate},${entry.breathingRate},${timestamp}\n`;
        });
        
        // Create download link
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `heart_rate_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
        
        // Clear full history chart
        if (this.fullHistoryChart) {
            this.fullHistoryChart.data.labels = [];
            this.fullHistoryChart.data.datasets[0].data = [];
            this.fullHistoryChart.data.datasets[1].data = [];
            this.fullHistoryChart.update();
        }
        
        // Clear algorithm comparison charts
        if (this.algorithmCharts) {
            Object.values(this.algorithmCharts).forEach(chart => {
                chart.data.labels = [];
                chart.data.datasets.forEach(dataset => {
                    dataset.data = [];
                });
                chart.update();
            });
        }
        
        // Clear regional consensus chart
        if (this.regionConsensusChart) {
            this.regionConsensusChart.data.labels = [];
            this.regionConsensusChart.data.datasets.forEach(dataset => {
                dataset.data = [];
            });
            this.regionConsensusChart.update();
        }
        
        // Clear algorithm history
        Object.keys(this.algorithmHistory).forEach(region => {
            Object.keys(this.algorithmHistory[region]).forEach(algo => {
                this.algorithmHistory[region][algo] = [];
            });
        });
        
        // Hide export button and performance analysis
        document.getElementById('exportData').style.display = 'none';
        document.getElementById('performanceAnalysis').style.display = 'none';
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new HeartRateMonitor();
});