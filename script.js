// 전역 변수
let player = null;
let audioContext = null;
let analyser = null;
let audioSource = null;
let frequencyData = null;
let energyHistory = [];
let beatDetector = null;
let gameMode = 'waiting'; // waiting, playing, paused, result
let notes = [];
let score = 0;
let combo = 0;
let maxCombo = 0;
let accuracy = 0;
let totalNotes = 0;
let hitNotes = 0;
let judgments = {
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0
};

// 게임 설정
const config = {
    noteSpeed: 1.0,
    difficulty: 'normal',
    syncOffset: 0
};

// 난이도 설정
const DIFFICULTY_SETTINGS = {
    easy: {
        energyThreshold: 1.6,
        minInterval: 300,  // 노트 생성 최소 간격 (ms)
        longNoteChance: 0.2 // 롱노트 확률
    },
    normal: {
        energyThreshold: 1.4,
        minInterval: 200,
        longNoteChance: 0.3
    },
    hard: {
        energyThreshold: 1.2,
        minInterval: 100,
        longNoteChance: 0.4
    }
};

// 오디오 주파수 범위 설정
const FREQUENCY_RANGES = {
    bass: [20, 200],    // 저음역 (드럼, 베이스 기타)
    midLow: [200, 800], // 중저음역 (보컬 베이스, 기타)
    midHigh: [800, 2500], // 중고음역 (보컬 메인, 신스)
    high: [2500, 10000] // 고음역 (하이햇, 심벌즈, 키보드)
};

// 판정 윈도우 (밀리초)
const JUDGMENT_WINDOWS = {
    perfect: 60,
    great: 120,
    good: 180
};

// 키 매핑
const KEYS = ['d', 'f', 'j', 'k'];

// 판정별 점수
const JUDGMENT_SCORES = {
    perfect: 1000,
    great: 500,
    good: 100,
    miss: 0
};

// 노트 생성 제어 변수
let lastBeatTime = {
    bass: 0,
    midLow: 0,
    midHigh: 0,
    high: 0
};

// 현재 누르고 있는 키 트래킹
let pressedKeys = {
    d: false,
    f: false,
    j: false, 
    k: false
};

// 게임 타이머
let gameStartTime = 0;
let audioAnalysisTimer = null;
let gameUpdateTimer = null;

// 진행 중인 롱노트
let activeHoldNotes = [null, null, null, null];

// DOM 요소 참조 캐싱
let gameCanvas;
let lanes = [];
let judgmentDisplay;
let keyIndicators = [];

// 오디오 변수
const FFT_SIZE = 2048;
const SMOOTHING = 0.8;
const HISTORY_SIZE = 30; // 약 0.5초 분량의 히스토리

// 디버그 모드
const DEBUG_MODE = false;
let debugElement = null;

// YouTube API 로드
function loadYouTubeAPI() {
    if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        console.log("YouTube API 스크립트 로드 중");
    } else {
        console.log("YouTube API 이미 로드됨");
        onYouTubeIframeAPIReady();
    }
}

// YouTube API 준비 완료 콜백
window.onYouTubeIframeAPIReady = function() {
    console.log("YouTube API 준비 완료");
    initializeYouTubePlayer();
};

// YouTube 플레이어 초기화
function initializeYouTubePlayer() {
    // 플레이어 컨테이너 확인
    const playerContainer = document.getElementById('youtube-player');
    if (!playerContainer) return;
    
    try {
        player = new YT.Player('youtube-player', {
            height: '100%',
            width: '100%',
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'disablekb': 1,
                'rel': 0,
                'fs': 0,
                'modestbranding': 1,
                'origin': window.location.origin
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError
            }
        });
        
        console.log("YouTube 플레이어 초기화됨");
    } catch (error) {
        console.error("플레이어 초기화 오류:", error);
    }
}

// 플레이어 준비 완료
function onPlayerReady(event) {
    console.log("YouTube 플레이어 준비 완료");
    document.getElementById('load-btn').disabled = false;
}

// 플레이어 상태 변경
function onPlayerStateChange(event) {
    // 상태: -1(미시작), 0(종료), 1(재생), 2(일시정지), 3(버퍼링), 5(큐)
    if (event.data === YT.PlayerState.PLAYING && gameMode === 'playing') {
        console.log("비디오 재생 중");
        if (!audioContext) {
            setupAudioAnalysis();
        }
    } else if (event.data === YT.PlayerState.PAUSED && gameMode === 'playing') {
        console.log("비디오 일시정지");
        pauseGame();
    } else if (event.data === YT.PlayerState.ENDED && gameMode === 'playing') {
        console.log("비디오 종료");
        endGame();
    }
}

// 플레이어 오류
function onPlayerError(event) {
    console.error("YouTube 플레이어 오류:", event.data);
    
    const errorCodes = {
        2: "요청에 잘못된 매개변수가 포함되어 있습니다.",
        5: "요청한 콘텐츠를 HTML5 플레이어에서 재생할 수 없습니다.",
        100: "요청한 비디오를 찾을 수 없습니다.",
        101: "요청한 비디오의 소유자가 임베드를 허용하지 않습니다.",
        150: "요청한 비디오의 소유자가 임베드를 허용하지 않습니다."
    };
    
    alert("YouTube 오류: " + (errorCodes[event.data] || "알 수 없는 오류가 발생했습니다."));
}

// 오디오 분석 설정
async function setupAudioAnalysis() {
    console.log("오디오 분석 설정 시작");
    
    try {
        // 오디오 컨텍스트 생성
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 오디오 소스 생성 시도
        try {
            // 시스템 사운드 캡처 시도
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'browser',
                    width: 1,
                    height: 1
                },
                audio: true
            });
            
            // 캡처한 스트림에서 오디오 소스 생성
            audioSource = audioContext.createMediaStreamSource(stream);
            console.log("오디오 캡처 성공");
            
            // 비디오 트랙 정지 (오디오만 필요)
            stream.getVideoTracks().forEach(track => track.stop());
            
            // 알림 표시
            showMessage("오디오 캡처 성공! 실제 오디오 분석이 작동합니다.", "success");
        } catch (err) {
            console.warn("시스템 오디오 캡처 실패:", err);
            showMessage("오디오 캡처 권한이 필요합니다. 시뮬레이션 모드로 작동합니다.", "warning");
            
            // 권한 없음 - 오실레이터 소스 생성 (시뮬레이션용)
            const oscillator = audioContext.createOscillator();
            oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
            audioSource = oscillator;
            oscillator.start();
        }
        
        // 분석기 노드 생성
        analyser = audioContext.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = SMOOTHING;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -30;
        
        // 오디오 소스를 분석기에 연결
        audioSource.connect(analyser);
        
        // 주파수 데이터 배열 생성
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        
        // 비트 감지기 초기화
        initBeatDetector();
        
        // 오디오 분석 시작
        startAudioAnalysis();
        
        console.log("오디오 분석 설정 완료");
    } catch (error) {
        console.error("오디오 분석 설정 오류:", error);
        showMessage("오디오 분석을 설정할 수 없습니다. 기본 모드로 작동합니다.", "error");
    }
}

// 알림 메시지 표시
function showMessage(message, type = "info") {
    // 이미 존재하는 메시지 제거
    const existingMsg = document.querySelector('.game-message');
    if (existingMsg) {
        existingMsg.remove();
    }
    
    // 새 메시지 생성
    const msgElement = document.createElement('div');
    msgElement.className = `game-message ${type}`;
    msgElement.textContent = message;
    document.body.appendChild(msgElement);
    
    // 일정 시간 후 제거
    setTimeout(() => {
        if (msgElement.parentNode) {
            msgElement.remove();
        }
    }, 5000);
}

// 비트 감지기 초기화
function initBeatDetector() {
    beatDetector = {
        energyThreshold: DIFFICULTY_SETTINGS[config.difficulty].energyThreshold,
        energyHistory: {
            bass: [],
            midLow: [],
            midHigh: [],
            high: []
        },
        beatCount: 0
    };
}

// 오디오 분석 시작
function startAudioAnalysis() {
    // 타이머 초기화
    if (audioAnalysisTimer) {
        clearTimeout(audioAnalysisTimer);
    }
    
    // 첫 분석 호출
    analyzeAudio();
}

// 오디오 분석 루프
function analyzeAudio() {
    if (gameMode !== 'playing') {
        return;
    }
    
    // 주파수 데이터 가져오기
    if (analyser) {
        analyser.getByteFrequencyData(frequencyData);
        
        // 비트 감지
        detectBeats();
        
        // 디버그 정보 업데이트
        if (DEBUG_MODE) {
            updateDebugInfo();
        }
    }
    
    // 다음 분석 예약 (약 60fps)
    audioAnalysisTimer = setTimeout(analyzeAudio, 16);
}

// 비트 감지 및 노트 생성
function detectBeats() {
    const currentTime = Date.now();
    const settings = DIFFICULTY_SETTINGS[config.difficulty];
    
    // 주파수 범위별 에너지 계산
    const energies = {
        bass: calculateFrequencyRangeEnergy(FREQUENCY_RANGES.bass[0], FREQUENCY_RANGES.bass[1]),
        midLow: calculateFrequencyRangeEnergy(FREQUENCY_RANGES.midLow[0], FREQUENCY_RANGES.midLow[1]),
        midHigh: calculateFrequencyRangeEnergy(FREQUENCY_RANGES.midHigh[0], FREQUENCY_RANGES.midHigh[1]),
        high: calculateFrequencyRangeEnergy(FREQUENCY_RANGES.high[0], FREQUENCY_RANGES.high[1])
    };
    
    // 에너지 히스토리 업데이트
    Object.keys(energies).forEach(range => {
        beatDetector.energyHistory[range].push(energies[range]);
        
        // 히스토리 크기 제한
        if (beatDetector.energyHistory[range].length > HISTORY_SIZE) {
            beatDetector.energyHistory[range].shift();
        }
    });
    
    // 주파수 범위별 평균 에너지 계산
    const avgEnergies = {
        bass: calculateAverageEnergy(beatDetector.energyHistory.bass),
        midLow: calculateAverageEnergy(beatDetector.energyHistory.midLow),
        midHigh: calculateAverageEnergy(beatDetector.energyHistory.midHigh),
        high: calculateAverageEnergy(beatDetector.energyHistory.high)
    };
    
    // 주파수 범위별 비트 감지 및 노트 생성
    const threshold = settings.energyThreshold;
    
    // 저음역 비트 (레인 0)
    if (energies.bass > avgEnergies.bass * threshold && 
        currentTime - lastBeatTime.bass > settings.minInterval) {
        
        // 저음역 노트 생성 (레인 0, 왼쪽 첫 번째)
        createNote(0, Math.random() < settings.longNoteChance, 
                   Math.random() < 0.5 ? 500 : 0); // 50% 확률로 롱노트
        
        lastBeatTime.bass = currentTime;
    }
    
    // 중저음역 비트 (레인 1)
    if (energies.midLow > avgEnergies.midLow * threshold && 
        currentTime - lastBeatTime.midLow > settings.minInterval) {
        
        // 중저음역 노트 생성 (레인 1, 왼쪽 두 번째)
        createNote(1, Math.random() < settings.longNoteChance, 
                   Math.random() < 0.5 ? 400 : 0);
        
        lastBeatTime.midLow = currentTime;
    }
    
    // 중고음역 비트 (레인 2)
    if (energies.midHigh > avgEnergies.midHigh * threshold && 
        currentTime - lastBeatTime.midHigh > settings.minInterval) {
        
        // 중고음역 노트 생성 (레인 2, 오른쪽 첫 번째)
        createNote(2, Math.random() < settings.longNoteChance, 
                   Math.random() < 0.4 ? 300 : 0); // 40% 확률로 롱노트
        
        lastBeatTime.midHigh = currentTime;
    }
    
    // 고음역 비트 (레인 3)
    if (energies.high > avgEnergies.high * threshold && 
        currentTime - lastBeatTime.high > settings.minInterval) {
        
        // 고음역 노트 생성 (레인 3, 오른쪽 두 번째)
        createNote(3, Math.random() < settings.longNoteChance * 0.7, 
                   Math.random() < 0.3 ? 200 : 0); // 30% 확률로 롱노트
        
        lastBeatTime.high = currentTime;
    }
    
    // 특정 주파수 대역의 동시 에너지 변화 감지 (복합 패턴)
    const allRanges = ['bass', 'midLow', 'midHigh', 'high'];
    let activeBands = allRanges.filter(range => 
        energies[range] > avgEnergies[range] * threshold);
    
    // 여러 주파수 대역이 동시에 활성화되면 특수 패턴 생성
    if (activeBands.length >= 3) {
        createSpecialPattern(activeBands, currentTime);
    }
}

// 특수 패턴 생성
function createSpecialPattern(activeBands, currentTime) {
    // 마지막 특수 패턴 생성으로부터 최소 800ms 지났는지 확인 (과도한 노트 방지)
    const lastSpecialTime = Math.max(
        lastBeatTime.bass, lastBeatTime.midLow,
        lastBeatTime.midHigh, lastBeatTime.high
    );
    
    if (currentTime - lastSpecialTime < 800) {
        return; // 최소 간격이 지나지 않았으면 무시
    }
    
    // 패턴 유형 선택 (4가지 중 하나)
    const patternType = Math.floor(Math.random() * 4);
    
    switch (patternType) {
        case 0: // 계단식 패턴
            for (let i = 0; i < 4; i++) {
                setTimeout(() => {
                    if (gameMode === 'playing') {
                        createNote(i, false, 0);
                    }
                }, i * 150);
            }
            break;
            
        case 1: // 동시 노트 (2개)
            createNote(0, false, 0);
            createNote(3, false, 0);
            break;
            
        case 2: // 교차 롱노트
            createNote(1, true, 500);
            setTimeout(() => {
                if (gameMode === 'playing') {
                    createNote(2, true, 500);
                }
            }, 250);
            break;
            
        case 3: // 동시 롱노트 + 일반 노트
            createNote(0, true, 800);
            createNote(3, true, 800);
            
            setTimeout(() => {
                if (gameMode === 'playing') {
                    createNote(1, false, 0);
                    createNote(2, false, 0);
                }
            }, 400);
            break;
    }
    
    // 모든 주파수 대역의 마지막 비트 시간 업데이트
    const newTime = currentTime;
    lastBeatTime.bass = newTime;
    lastBeatTime.midLow = newTime;
    lastBeatTime.midHigh = newTime;
    lastBeatTime.high = newTime;
}

// 주파수 범위 에너지 계산
function calculateFrequencyRangeEnergy(minFreq, maxFreq) {
    if (!frequencyData || !audioContext) return 0;
    
    const nyquist = audioContext.sampleRate / 2;
    const binCount = frequencyData.length;
    
    // 주파수 인덱스 계산
    const minBin = Math.floor((minFreq / nyquist) * binCount);
    const maxBin = Math.floor((maxFreq / nyquist) * binCount);
    
    let sum = 0;
    let count = 0;
    
    // 해당 범위의 주파수 에너지 합산
    for (let i = minBin; i <= maxBin && i < binCount; i++) {
        sum += frequencyData[i];
        count++;
    }
    
    // 평균 에너지 반환
    return count > 0 ? sum / count : 0;
}

// 히스토리 기반 평균 에너지 계산
function calculateAverageEnergy(history) {
    if (!history || history.length === 0) return 0;
    
    // 상위 10% 값을 제외한 평균 계산 (이상치 제거)
    const sortedHistory = [...history].sort((a, b) => a - b);
    const cutoffIndex = Math.floor(sortedHistory.length * 0.9);
    const validValues = sortedHistory.slice(0, cutoffIndex);
    
    const sum = validValues.reduce((total, value) => total + value, 0);
    return validValues.length > 0 ? sum / validValues.length : 0;
}

// 디버그 정보 업데이트
function updateDebugInfo() {
    if (!debugElement) {
        debugElement = document.createElement('div');
        debugElement.className = 'debug-panel';
        document.body.appendChild(debugElement);
    }
    
    // 주파수 에너지 정보 계산
    const bassEnergy = calculateFrequencyRangeEnergy(FREQUENCY_RANGES.bass[0], FREQUENCY_RANGES.bass[1]);
    const midLowEnergy = calculateFrequencyRangeEnergy(FREQUENCY_RANGES.midLow[0], FREQUENCY_RANGES.midLow[1]);
    const midHighEnergy = calculateFrequencyRangeEnergy(FREQUENCY_RANGES.midHigh[0], FREQUENCY_RANGES.midHigh[1]);
    const highEnergy = calculateFrequencyRangeEnergy(FREQUENCY_RANGES.high[0], FREQUENCY_RANGES.high[1]);
    
    // 평균 에너지
    const avgBassEnergy = calculateAverageEnergy(beatDetector.energyHistory.bass);
    const avgMidLowEnergy = calculateAverageEnergy(beatDetector.energyHistory.midLow);
    const avgMidHighEnergy = calculateAverageEnergy(beatDetector.energyHistory.midHigh);
    const avgHighEnergy = calculateAverageEnergy(beatDetector.energyHistory.high);
    
    // 디버그 패널 업데이트
    debugElement.innerHTML = `
        <h3>오디오 분석 데이터</h3>
        <div>Bass: ${bassEnergy.toFixed(1)} / ${avgBassEnergy.toFixed(1)} (${(bassEnergy/avgBassEnergy).toFixed(2)})</div>
        <div>Mid-Low: ${midLowEnergy.toFixed(1)} / ${avgMidLowEnergy.toFixed(1)} (${(midLowEnergy/avgMidLowEnergy).toFixed(2)})</div>
        <div>Mid-High: ${midHighEnergy.toFixed(1)} / ${avgMidHighEnergy.toFixed(1)} (${(midHighEnergy/avgMidHighEnergy).toFixed(2)})</div>
        <div>High: ${highEnergy.toFixed(1)} / ${avgHighEnergy.toFixed(1)} (${(highEnergy/avgHighEnergy).toFixed(2)})</div>
        <div>임계값: ${DIFFICULTY_SETTINGS[config.difficulty].energyThreshold.toFixed(1)}</div>
        <div>활성 노트: ${notes.length}</div>
    `;
}

// 유튜브 URL에서 비디오 ID 추출
function extractVideoId(url) {
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^/?]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^/?]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([^/?]+)/i
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    
    return null;
}

// 유튜브 비디오 로드
function loadVideo() {
    const urlInput = document.getElementById('youtube-url');
    const url = urlInput.value.trim();
    
    if (!url) {
        alert("유튜브 URL을 입력해주세요.");
        return;
    }
    
    const videoId = extractVideoId(url);
    if (!videoId) {
        alert("유효한 유튜브 URL이 아닙니다.");
        return;
    }
    
    console.log("비디오 ID:", videoId);
    
    // 플레이어 상태 확인
    if (!player) {
        console.error("플레이어가 초기화되지 않았습니다.");
        return;
    }
    
    try {
        // 비디오 로드
        player.cueVideoById(videoId);
        document.getElementById('start-btn').disabled = false;
    } catch (error) {
        console.error("비디오 로드 중 오류:", error);
        alert("비디오를 로드할 수 없습니다. 다시 시도해 주세요.");
    }
}

// 게임 설정 업데이트
function updateGameSettings() {
    // 난이도 설정
    const difficultySelect = document.getElementById('difficulty');
    config.difficulty = difficultySelect.value;
    
    // 노트 속도 설정
    const speedSelect = document.getElementById('speed');
    config.noteSpeed = parseFloat(speedSelect.value);
    
    console.log("게임 설정 업데이트:", config);
    
    // 비트 감지기 임계값 업데이트
    if (beatDetector) {
        beatDetector.energyThreshold = DIFFICULTY_SETTINGS[config.difficulty].energyThreshold;
    }
}

// 싱크 조정
function adjustSyncOffset(direction) {
    const step = 10; // 10ms 단위로 조정
    config.syncOffset += direction === 'plus' ? step : -step;
    
    // UI 업데이트
    document.getElementById('offset-value').textContent = `${config.syncOffset}ms`;
}

// 게임 시작
function startGame() {
    if (!player || gameMode === 'playing') return;
    
    updateGameSettings();
    
    // 게임 초기화
    resetGame();
    
    // 카운트다운 시작
    startCountdown();
}

// 카운트다운
function startCountdown() {
    const countdownElement = document.getElementById('countdown');
    countdownElement.textContent = '3';
    countdownElement.classList.remove('hidden');
    
    let count = 3;
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownElement.textContent = count.toString();
        } else {
            clearInterval(interval);
            countdownElement.classList.add('hidden');
            
            // 실제 게임 시작
            beginGameplay();
        }
    }, 1000);
}

// 실제 게임 플레이 시작
function beginGameplay() {
    gameMode = 'playing';
    
    // 비디오 시작
    player.seekTo(0);
    player.playVideo();
    
    // 게임 시작 시간 기록
    gameStartTime = Date.now();
    
    // 키 이벤트 리스너 등록
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // ESC 키 이벤트 추가
    window.addEventListener('keydown', handleEscKey);
    
    // 게임 루프 시작
    startGameLoop();
}

// 키 다운 이벤트 처리
function handleKeyDown(e) {
    if (gameMode !== 'playing') return;
    
    const key = e.key.toLowerCase();
    const laneIndex = KEYS.indexOf(key);
    
    if (laneIndex !== -1 && !pressedKeys[key]) {
        // 이미 누른 키가 아닌 경우에만 처리
        pressedKeys[key] = true;
        
        // 키 활성화 시각 효과
        keyIndicators[laneIndex].setAttribute('data-active', 'true');
        
        // 노트 시작 판정
        judgeNoteHit(laneIndex);
    }
}

// 키 업 이벤트 처리
function handleKeyUp(e) {
    const key = e.key.toLowerCase();
    const laneIndex = KEYS.indexOf(key);
    
    if (laneIndex !== -1 && pressedKeys[key]) {
        pressedKeys[key] = false;
        
        // 키 비활성화
        keyIndicators[laneIndex].setAttribute('data-active', 'false');
        
        // 롱노트 종료 판정
        judgeNoteRelease(laneIndex);
    }
}

// ESC 키 이벤트 처리
function handleEscKey(e) {
    if (e.key === 'Escape' && gameMode === 'playing') {
        pauseGame();
    }
}

// 노트 생성
function createNote(lane, isLongNote = false, duration = 0) {
    // 레인 확인
    if (lane < 0 || lane >= lanes.length) return;
    
    const note = document.createElement('div');
    note.className = isLongNote ? 'note long-note' : 'note';
    
    // 노트 속도 계산 (CSS 애니메이션 속도)
    const animationDuration = 2 / config.noteSpeed;
    note.style.animationDuration = `${animationDuration}s`;
    
    // 롱노트인 경우 길이 설정
    if (isLongNote && duration > 0) {
        // 노트 길이 계산 (애니메이션 속도 기준)
        const longNoteDuration = duration / 1000; // 초 단위로 변환
        const longNoteHeight = (longNoteDuration / animationDuration) * 100;
        
        // 롱노트 스타일 설정
        note.style.height = `${Math.max(20, longNoteHeight)}px`; // 최소 높이 20px
        
        // 롱노트 내부 요소 추가
        const noteBody = document.createElement('div');
        noteBody.className = 'note-body';
        noteBody.style.height = '100%';
        note.appendChild(noteBody);
        
        // 노트 끝 표시
        const noteEnd = document.createElement('div');
        noteEnd.className = 'note-end';
        note.appendChild(noteEnd);
    }
    
    // 노트 데이터 저장
    const noteData = {
        element: note,
        lane: lane,
        createdAt: Date.now(),
        expectedHitTime: Date.now() + (animationDuration * 1000),
        isLongNote: isLongNote,
        duration: duration,
        expectedEndTime: isLongNote ? Date.now() + (animationDuration * 1000) + duration : 0,
        hit: false,         // 시작 부분 히트
        endHit: !isLongNote, // 롱노트가 아니면 끝 부분은 자동으로 히트
        holdActive: false,   // 롱노트 홀드 중 여부
        judgment: null
    };
    
    // 노트 배열에 추가
    notes.push(noteData);
    
    // DOM에 노트 추가
    lanes[lane].appendChild(note);
    
    // 총 노트 수 증가
    totalNotes++;
}

// 게임 루프 시작
function startGameLoop() {
    if (gameUpdateTimer) {
        clearTimeout(gameUpdateTimer);
    }
    
    // 게임 업데이트 함수 호출
    updateGame();
}

// 게임 업데이트
function updateGame() {
    if (gameMode !== 'playing') return;
    
    // 각 노트 업데이트
    updateNotes();
    
    // 다음 프레임 예약
    gameUpdateTimer = setTimeout(updateGame, 16); // 약 60fps
}

// 노트 업데이트
function updateNotes() {
    const currentTime = Date.now() + config.syncOffset;
    
    // 각 노트 검사
    for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        
        // 홀드 중인 롱노트 업데이트
        if (note.isLongNote && note.hit && !note.endHit && note.holdActive) {
            // 홀드 중인 롱노트의 시각 효과
            if (note.element) {
                note.element.classList.add('holding');
            }
            
            // 롱노트 종료 시간이 지났는지 확인
            if (currentTime >= note.expectedEndTime) {
                // 롱노트 성공적으로 홀드 완료
                note.endHit = true;
                
                // 추가 점수 부여
                score += JUDGMENT_SCORES.perfect / 2;
                
                // 롱노트 홀드 효과 제거
                if (note.element) {
                    note.element.classList.remove('holding');
                    note.element.remove();
                }
                
                // 롱노트 성공 효과
                showLongNoteCompleteEffect(note.lane);
                
                // 액티브 홀드 노트 해제
                activeHoldNotes[note.lane] = null;
                
                // 노트 배열에서 제거
                notes.splice(i, 1);
                
                // 게임 상태 업데이트
                updateGameStats();
                continue;
            }
        }
        
        // 노트 놓침 판정
        if (!note.hit && currentTime > note.expectedHitTime + JUDGMENT_WINDOWS.good) {
            // 노트 놓침
            note.hit = true;
            note.judgment = 'miss';
            judgments.miss++;
            
            // 롱노트인 경우 끝 부분도 놓침 처리
            if (note.isLongNote) {
                note.endHit = true;
            }
            
            // 콤보 초기화
            combo = 0;
            
            // 노트 제거
            if (note.element && note.element.parentNode) {
                note.element.remove();
            }
            
            // 미스 판정 표시
            showJudgment('miss');
            
            // 노트 배열에서 제거
            notes.splice(i, 1);
            
            // 게임 상태 업데이트
            updateGameStats();
        }
        
        // 롱노트 홀드 실패 판정
        else if (note.isLongNote && note.hit && !note.endHit && !note.holdActive && 
                currentTime > note.expectedHitTime + 200) { // 키를 때린 후 200ms 이상 지났으면 홀드 실패
            // 롱노트 홀드 실패
            note.endHit = true;
            judgments.miss++;
            
            // 콤보 초기화
            combo = 0;
            
            // 노트 제거
            if (note.element && note.element.parentNode) {
                note.element.remove();
            }
            
            // 미스 판정 표시
            showJudgment('miss');
            
            // 액티브 홀드 노트 해제
            activeHoldNotes[note.lane] = null;
            
            // 노트 배열에서 제거
            notes.splice(i, 1);
            
            // 게임 상태 업데이트
            updateGameStats();
        }
    }
}

// 노트 시작 판정
function judgeNoteHit(laneIndex) {
    const currentTime = Date.now() + config.syncOffset;
    let closestNote = null;
    let closestDistance = Infinity;
    let closestIndex = -1;
    
    // 해당 레인의 가장 가까운 노트 찾기
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        
        if (note.lane === laneIndex && !note.hit) {
            const distance = Math.abs(currentTime - note.expectedHitTime);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestNote = note;
                closestIndex = i;
            }
        }
    }
    
    // 가장 가까운 노트가 판정 범위 내인지 확인
    if (closestNote && closestDistance <= JUDGMENT_WINDOWS.good) {
        let judgment;
        
        // 판정 결과 결정
        if (closestDistance <= JUDGMENT_WINDOWS.perfect) {
            judgment = 'perfect';
            score += JUDGMENT_SCORES.perfect;
            judgments.perfect++;
        } else if (closestDistance <= JUDGMENT_WINDOWS.great) {
            judgment = 'great';
            score += JUDGMENT_SCORES.great;
            judgments.great++;
        } else {
            judgment = 'good';
            score += JUDGMENT_SCORES.good;
            judgments.good++;
        }
        
        // 노트 시작 부분 처리
        closestNote.hit = true;
        closestNote.judgment = judgment;
        hitNotes++;
        
        // 롱노트인 경우 홀드 상태 설정
        if (closestNote.isLongNote) {
            closestNote.holdActive = true;
            
            // 액티브 홀드 노트 설정
            activeHoldNotes[laneIndex] = closestNote;
            
            // 홀드 시작 시각 효과
            if (closestNote.element) {
                closestNote.element.classList.add('holding');
            }
        } else {
            // 일반 노트는 완전히 처리
            
            // 노트 제거
            if (closestNote.element && closestNote.element.parentNode) {
                closestNote.element.remove();
            }
            
            // 노트 배열에서 제거
            notes.splice(closestIndex, 1);
        }
        
        // 콤보 증가
        combo++;
        if (combo > maxCombo) {
            maxCombo = combo;
        }
        
        // 콤보 보너스 점수
        const comboBonus = Math.floor(combo / 10) * 100;
        score += comboBonus;
        
        // 타격 효과 표시
        showHitEffect(laneIndex, judgment);
        
        // 판정 표시
        showJudgment(judgment);
        
        // 게임 상태 업데이트
        updateGameStats();
    }
}

// 롱노트 키 릴리즈 판정
function judgeNoteRelease(laneIndex) {
    // 해당 레인의 활성화된 롱노트 확인
    const activeNote = activeHoldNotes[laneIndex];
    
    // 활성화된 롱노트가 있으면 홀드 상태 해제
    if (activeNote) {
        activeNote.holdActive = false;
        
        // 홀드 중 클래스 제거
        if (activeNote.element) {
            activeNote.element.classList.remove('holding');
        }
        
        // 예상 종료 시간과 현재 시간 비교
        const currentTime = Date.now() + config.syncOffset;
        const timeToEnd = activeNote.expectedEndTime - currentTime;
        
        // 종료 시간이 거의 다 되었으면 (100ms 이내) 성공으로 처리
        if (timeToEnd <= 100) {
            // 롱노트 성공
            const index = notes.indexOf(activeNote);
            if (index !== -1) {
                activeNote.endHit = true;
                
                // 추가 점수 부여
                score += JUDGMENT_SCORES.perfect / 2;
                
                // 롱노트 성공 효과
                showLongNoteCompleteEffect(laneIndex);
                
                // 노트 제거
                if (activeNote.element && activeNote.element.parentNode) {
                    activeNote.element.remove();
                }
                
                // 노트 배열에서 제거
                notes.splice(index, 1);
                
                // 게임 상태 업데이트
                updateGameStats();
            }
        }
        
        // 액티브 홀드 노트 해제
        activeHoldNotes[laneIndex] = null;
    }
}

// 롱노트 완료 효과
function showLongNoteCompleteEffect(laneIndex) {
    const lane = lanes[laneIndex];
    
    // 효과 요소 생성
    const effect = document.createElement('div');
    effect.className = 'long-note-complete';
    
    // 레인에 추가
    lane.appendChild(effect);
    
    // 애니메이션 완료 후 제거
    setTimeout(() => {
        if (effect.parentNode) {
            effect.parentNode.removeChild(effect);
        }
    }, 500);
}

// 타격 효과 표시
function showHitEffect(laneIndex, judgment) {
    const lane = lanes[laneIndex];
    
    // 효과 요소 생성
    const effect = document.createElement('div');
    effect.className = `hit-effect ${judgment}`;
    
    // 레인에 추가
    lane.appendChild(effect);
    
    // 애니메이션 완료 후 제거
    setTimeout(() => {
        if (effect.parentNode) {
            effect.parentNode.removeChild(effect);
        }
    }, 300);
}

// 판정 표시
function showJudgment(judgment) {
    judgmentDisplay.textContent = judgment.toUpperCase();
    judgmentDisplay.className = '';
    judgmentDisplay.classList.add(judgment);
    judgmentDisplay.classList.add('show');
    
    // 애니메이션 타이머
    setTimeout(() => {
        judgmentDisplay.classList.remove('show');
    }, 500);
}

// 게임 통계 업데이트
function updateGameStats() {
    // 점수 및 콤보 업데이트
    document.getElementById('score').textContent = score;
    document.getElementById('combo').textContent = combo;
    
    // 정확도 계산
    if (totalNotes > 0) {
        // 가중치 적용 정확도 (더 정확한 판정에 더 높은 가중치)
        const weightedScore = 
            judgments.perfect * 100 + 
            judgments.great * 70 + 
            judgments.good * 40;
        
        const maxPossibleScore = totalNotes * 100;
        accuracy = Math.round((weightedScore / maxPossibleScore) * 100);
        
        document.getElementById('accuracy').textContent = `${accuracy}%`;
    }
}

// 게임 일시정지
function pauseGame() {
    if (gameMode !== 'playing') return;
    
    gameMode = 'paused';
    
    // 비디오 일시정지
    player.pauseVideo();
    
    // 타이머 정지
    if (audioAnalysisTimer) {
        clearTimeout(audioAnalysisTimer);
    }
    
    if (gameUpdateTimer) {
        clearTimeout(gameUpdateTimer);
    }
    
    // 일시정지 메뉴 표시
    document.getElementById('pause-menu').classList.remove('hidden');
}

// 게임 재개
function resumeGame() {
    if (gameMode !== 'paused') return;
    
    // 일시정지 메뉴 숨기기
    document.getElementById('pause-menu').classList.add('hidden');
    
    // 게임 상태 업데이트
    gameMode = 'playing';
    
    // 비디오 재생
    player.playVideo();
    
    // 게임 타이머 재시작
    startAudioAnalysis();
    startGameLoop();
}

// 게임 재시작
function restartGame() {
    // 일시정지 메뉴 & 결과 화면 숨기기
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    
    // 오디오 정리
    cleanupAudio();
    
    // 게임 시작
    startGame();
}

// 게임 나가기
function quitGame() {
    // 일시정지 메뉴 & 결과 화면 숨기기
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    
    // 비디오 정지
    player.stopVideo();
    
    // 오디오 정리
    cleanupAudio();
    
    // 게임 모드 업데이트
    gameMode = 'waiting';
}

// 오디오 정리
function cleanupAudio() {
    // 오디오 스트림 중지
    if (audioSource && typeof audioSource.mediaStream !== 'undefined') {
        try {
            audioSource.mediaStream.getTracks().forEach(track => track.stop());
        } catch (e) {
            console.warn("오디오 스트림 정리 중 오류:", e);
        }
    }
    
    // 타이머 정지
    if (audioAnalysisTimer) {
        clearTimeout(audioAnalysisTimer);
        audioAnalysisTimer = null;
    }
    
    if (gameUpdateTimer) {
        clearTimeout(gameUpdateTimer);
        gameUpdateTimer = null;
    }
    
    // 오디오 컨텍스트 닫기
    if (audioContext) {
        try {
            audioContext.close().then(() => {
                audioContext = null;
                analyser = null;
                audioSource = null;
                frequencyData = null;
            }).catch(() => {
                // 오류 무시
            });
        } catch (e) {
            audioContext = null;
            analyser = null;
            audioSource = null;
            frequencyData = null;
        }
    }
}

// 게임 종료
function endGame() {
    if (gameMode !== 'playing') return;
    
    gameMode = 'result';
    
    // 타이머 정지
    if (audioAnalysisTimer) {
        clearTimeout(audioAnalysisTimer);
        audioAnalysisTimer = null;
    }
    
    if (gameUpdateTimer) {
        clearTimeout(gameUpdateTimer);
        gameUpdateTimer = null;
    }
    
    // 오디오 정리
    cleanupAudio();
    
    // 남은 노트 제거
    notes.forEach(note => {
        if (note.element && note.element.parentNode) {
            note.element.parentNode.removeChild(note.element);
        }
    });
    notes = [];
    
    // 결과 화면 데이터 설정
    document.getElementById('final-score').textContent = score;
    document.getElementById('max-combo').textContent = maxCombo;
    document.getElementById('final-accuracy').textContent = `${accuracy}%`;
    
    document.getElementById('perfect-count').textContent = judgments.perfect;
    document.getElementById('great-count').textContent = judgments.great;
    document.getElementById('good-count').textContent = judgments.good;
    document.getElementById('miss-count').textContent = judgments.miss;
    
    // 결과 화면 표시
    document.getElementById('result-screen').classList.remove('hidden');
    
    // 키 이벤트 리스너 제거
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('keydown', handleEscKey);
}

// 게임 리셋
function resetGame() {
    // 게임 변수 초기화
    notes = [];
    score = 0;
    combo = 0;
    maxCombo = 0;
    accuracy = 0;
    totalNotes = 0;
    hitNotes = 0;
    judgments = {
        perfect: 0,
        great: 0,
        good: 0,
        miss: 0
    };
    
    lastBeatTime = {
        bass: 0,
        midLow: 0,
        midHigh: 0,
        high: 0
    };
    
    pressedKeys = {
        d: false,
        f: false,
        j: false, 
        k: false
    };
    
    activeHoldNotes = [null, null, null, null];
    
    // 타이머 정지
    if (audioAnalysisTimer) {
        clearTimeout(audioAnalysisTimer);
        audioAnalysisTimer = null;
    }
    
    if (gameUpdateTimer) {
        clearTimeout(gameUpdateTimer);
        gameUpdateTimer = null;
    }
    
    // UI 초기화
    document.getElementById('score').textContent = '0';
    document.getElementById('combo').textContent = '0';
    document.getElementById('accuracy').textContent = '0%';
    
    // 레인 초기화
    lanes.forEach(lane => {
        lane.innerHTML = '';
    });
    
    // 키 인디케이터 초기화
    keyIndicators.forEach(indicator => {
        indicator.setAttribute('data-active', 'false');
    });
    
    // 판정 표시 초기화
    judgmentDisplay.className = '';
    judgmentDisplay.textContent = '';
    
    // 오디오 컨텍스트 초기화
    cleanupAudio();
    
    // 비트 감지기 초기화
    initBeatDetector();
}

// 문서 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM 로드 완료");
    
    // DOM 요소 참조 캐싱
    gameCanvas = document.getElementById('game-canvas');
    lanes = Array.from(document.querySelectorAll('.lane'));
    judgmentDisplay = document.getElementById('judgment-display');
    keyIndicators = Array.from(document.querySelectorAll('.key-indicator'));
    
    // 버튼 이벤트 리스너
    document.getElementById('load-btn').addEventListener('click', loadVideo);
    document.getElementById('start-btn').addEventListener('click', startGame);
    
    document.getElementById('offset-plus').addEventListener('click', () => adjustSyncOffset('plus'));
    document.getElementById('offset-minus').addEventListener('click', () => adjustSyncOffset('minus'));
    
    // 일시정지 메뉴 버튼
    document.getElementById('resume-btn').addEventListener('click', resumeGame);
    document.getElementById('restart-btn').addEventListener('click', restartGame);
    document.getElementById('quit-btn').addEventListener('click', quitGame);
    
    // 결과 화면 버튼
    document.getElementById('retry-btn').addEventListener('click', restartGame);
    document.getElementById('home-btn').addEventListener('click', quitGame);
    
    // 디버그 모드 활성화 (Shift + D 키 조합)
    window.addEventListener('keydown', function(e) {
        if (e.shiftKey && e.key.toLowerCase() === 'd') {
            DEBUG_MODE = !DEBUG_MODE;
            
            if (!DEBUG_MODE && debugElement) {
                debugElement.remove();
                debugElement = null;
            }
            
            showMessage(DEBUG_MODE ? "디버그 모드 활성화" : "디버그 모드 비활성화", "info");
        }
    });
    
    // YouTube API 로드
    loadYouTubeAPI();
});
