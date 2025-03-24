// 전역 변수 설정
let player = null;
let previewPlayer = null;
let audioContext = null;
let audioSource = null;
let analyser = null;
let frequencyData = null;
let isPaused = true;
let isGameStarted = false;
let gameMode = 'wait'; // 'wait', 'play', 'pause', 'result'

// 오디오 분석 변수
const FFT_SIZE = 1024;
const MAX_FREQUENCY = 16000;
const FREQUENCY_BINS = FFT_SIZE / 2;

// 게임 변수
let notes = [];
let score = 0;
let combo = 0;
let maxCombo = 0;
let accuracy = 0;
let totalNotes = 0;
let hitNotes = 0;
let judgements = {
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0
};
let gameConfig = {
    noteSpeed: 1.0,
    difficulty: 'normal',
    syncOffset: 0,
    beatDetectionSensitivity: 1.0
};

// 난이도 설정
const DIFFICULTY_SETTINGS = {
    easy: {
        bassBeatThreshold: 1.5,
        midBeatThreshold: 1.7,
        highBeatThreshold: 1.9,
        beatHistory: 10,
        noteProbability: 0.7,
        beatDetectionSensitivity: 0.8
    },
    normal: {
        bassBeatThreshold: 1.4,
        midBeatThreshold: 1.6,
        highBeatThreshold: 1.8,
        beatHistory: 8,
        noteProbability: 0.85,
        beatDetectionSensitivity: 1.0
    },
    hard: {
        bassBeatThreshold: 1.3,
        midBeatThreshold: 1.5,
        highBeatThreshold: 1.7,
        beatHistory: 6,
        noteProbability: 0.95,
        beatDetectionSensitivity: 1.2
    },
    extreme: {
        bassBeatThreshold: 1.2,
        midBeatThreshold: 1.4,
        highBeatThreshold: 1.6,
        beatHistory: 4,
        noteProbability: 1.0,
        beatDetectionSensitivity: 1.5
    }
};

// 주파수 범위 정의
const FREQUENCY_RANGES = {
    bass: [20, 250],
    mid: [250, 2000],
    high: [2000, MAX_FREQUENCY]
};

// 키 매핑
const LANE_KEYS = ['s', 'd', 'f', 'j', 'k', 'l'];

// 판정 기준 (ms)
const JUDGEMENT_WINDOWS = {
    perfect: 50,  // ±50ms
    great: 100,   // ±100ms
    good: 150     // ±150ms
};

// 점수 가중치
const SCORE_WEIGHTS = {
    perfect: 100,
    great: 80,
    good: 50,
    miss: 0
};

// 콤보 보너스 임계값
const COMBO_THRESHOLDS = [10, 30, 50, 100, 200];

// 타이밍 히스토리 (그래프용)
let timingHistory = [];

// 비트 탐지 히스토리
let beatHistory = {
    bass: [],
    mid: [],
    high: []
};

// 애니메이션 요청 ID
let animationFrameId = null;

// 비주얼라이저 변수
let visualizerCanvas = null;
let visualizerCtx = null;
let visualizerMode = 'frequency'; // 'frequency', 'waveform', 'circular'

// 게임 시작 시간
let gameStartTime = 0;

// 마지막 노트 생성 시간
let lastNoteTime = {
    bass: 0,
    mid: 0,
    high: 0
};

// 최소 노트 간격 (초)
const MIN_NOTE_INTERVAL = {
    bass: 0.3,
    mid: 0.25,
    high: 0.2
};

// YouTube API 로드
function loadYouTubeAPI() {
    if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        console.log("YouTube API 스크립트 로드 중...");
    } else {
        console.log("YouTube API 이미 로드됨");
        setupPlayers();
    }
}

// YouTube API 준비 완료 콜백
window.onYouTubeIframeAPIReady = function() {
    console.log("YouTube API 준비 완료");
    setupPlayers();
};

// 플레이어 설정
function setupPlayers() {
    // 프리뷰 플레이어 설정
    if (!previewPlayer && document.getElementById('preview-player')) {
        previewPlayer = new YT.Player('preview-player', {
            height: '100%',
            width: '100%',
            videoId: 'dQw4w9WgXcQ', // 기본 비디오
            playerVars: {
                'playsinline': 1,
                'controls': 1,
                'disablekb': 0,
                'rel': 0,
                'modestbranding': 1,
                'origin': window.location.origin
            },
            events: {
                'onReady': onPreviewPlayerReady
            }
        });
    }
    
    // 메인 플레이어 컨테이너 생성
    const mainPlayerContainer = document.getElementById('youtube-player');
    if (mainPlayerContainer) {
        mainPlayerContainer.innerHTML = '';
    }
}

// 프리뷰 플레이어 준비 완료
function onPreviewPlayerReady(event) {
    console.log("프리뷰 플레이어 준비 완료");
    document.getElementById('load-btn').disabled = false;
}

// 게임 플레이어 생성 (비디오 ID로)
function createGamePlayer(videoId) {
    const playerContainer = document.getElementById('youtube-player');
    if (!playerContainer) return false;
    
    console.log("게임 플레이어 생성 - 비디오 ID:", videoId);
    
    // 이전 플레이어 정리
    if (player) {
        player.destroy();
        player = null;
    }
    
    // 새 플레이어 컨테이너
    playerContainer.innerHTML = '';
    const playerDiv = document.createElement('div');
    playerDiv.id = 'youtube-player-inner';
    playerContainer.appendChild(playerDiv);
    
    // 플레이어 생성
    try {
        player = new YT.Player('youtube-player-inner', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'disablekb': 1,
                'rel': 0,
                'showinfo': 0,
                'modestbranding': 1,
                'origin': window.location.origin
            },
            events: {
                'onReady': onGamePlayerReady,
                'onStateChange': onGamePlayerStateChange,
                'onError': onGamePlayerError
            }
        });
        return true;
    } catch (error) {
        console.error("게임 플레이어 생성 중 오류:", error);
        return false;
    }
}

// 게임 플레이어 준비 완료
function onGamePlayerReady(event) {
    console.log("게임 플레이어 준비 완료");
    document.getElementById('start-btn').disabled = false;
    
    // 비디오 정보 가져오기
    const videoData = player.getVideoData();
    document.getElementById('song-title').textContent = videoData.title || "알 수 없는 제목";
    document.getElementById('artist-name').textContent = "YouTube";
    
    // 볼륨 조정
    player.setVolume(80);
}

// 게임 플레이어 상태 변경
function onGamePlayerStateChange(event) {
    // YT.PlayerState: UNSTARTED(-1), ENDED(0), PLAYING(1), PAUSED(2), BUFFERING(3), CUED(5)
    console.log("플레이어 상태 변경:", event.data);
    
    if (event.data === YT.PlayerState.PLAYING) {
        if (gameMode === 'play' && isPaused) {
            isPaused = false;
            console.log("비디오 재생 시작/재개");
            
            // 첫 시작인 경우에만 오디오 분석 초기화
            if (!audioContext) {
                setupAudioAnalysis();
            }
        }
    } else if (event.data === YT.PlayerState.PAUSED && gameMode === 'play') {
        isPaused = true;
        console.log("비디오 일시 정지");
        
        // 게임 일시 정지 메뉴 표시
        showPauseMenu();
    } else if (event.data === YT.PlayerState.ENDED && gameMode === 'play') {
        console.log("비디오 종료");
        endGame();
    } else if (event.data === YT.PlayerState.BUFFERING && gameMode === 'play') {
        console.log("비디오 버퍼링 중");
        // 버퍼링 중 메시지 표시 (필요시)
    }
}

// 게임 플레이어 오류
function onGamePlayerError(event) {
    console.error("플레이어 오류:", event.data);
    
    // 오류 코드별 메시지
    const errorMessages = {
        2: "요청에 잘못된 매개변수가 포함되어 있습니다.",
        5: "요청한 콘텐츠를 HTML5 플레이어에서 재생할 수 없습니다.",
        100: "요청한 비디오를 찾을 수 없습니다.",
        101: "요청한 비디오의 소유자가 다른 웹사이트에서의 재생을 허용하지 않습니다.",
        150: "요청한 비디오의 소유자가 다른 웹사이트에서의 재생을 허용하지 않습니다."
    };
    
    const errorMessage = errorMessages[event.data] || "알 수 없는 오류가 발생했습니다.";
    alert("YouTube 비디오 로드 중 오류: " + errorMessage);
}

// 유튜브 URL에서 비디오 ID 추출
function extractVideoId(url) {
    // 다양한 YouTube URL 형식 지원
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&]+)/i,   // 일반 유튜브 URL
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^?]+)/i,     // 임베드 URL
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([^?]+)/i,         // 구버전 임베드
        /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^?]+)/i,               // 짧은 URL
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([^?]+)/i     // YouTube 쇼츠
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            console.log("추출된 비디오 ID:", match[1]);
            return match[1];
        }
    }
    
    console.error("URL에서 비디오 ID를 추출할 수 없음:", url);
    return null;
}

// 비디오 로드
function loadVideo() {
    const urlInput = document.getElementById('youtube-url');
    const url = urlInput.value.trim();
    
    if (!url) {
        alert('유튜브 URL을 입력해주세요.');
        return;
    }
    
    // URL에서 비디오 ID 추출
    const videoId = extractVideoId(url);
    if (!videoId) {
        alert('유효하지 않은 유튜브 URL입니다.');
        return;
    }
    
    // 프리뷰 플레이어에 비디오 로드
    if (previewPlayer && typeof previewPlayer.loadVideoById === 'function') {
        previewPlayer.loadVideoById(videoId);
        previewPlayer.pauseVideo();
        
        // 게임 플레이어도 미리 생성
        if (createGamePlayer(videoId)) {
            document.getElementById('start-btn').disabled = false;
        } else {
            document.getElementById('start-btn').disabled = true;
        }
    } else {
        alert("YouTube 플레이어가 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
    }
}

// 게임 설정 업데이트
function updateGameSettings() {
    // 난이도 설정
    const difficultySelect = document.getElementById('difficulty');
    gameConfig.difficulty = difficultySelect.value;
    
    // 노트 속도 설정
    const speedSelect = document.getElementById('speed');
    gameConfig.noteSpeed = parseFloat(speedSelect.value);
    
    // 비트 감지 감도 설정
    gameConfig.beatDetectionSensitivity = DIFFICULTY_SETTINGS[gameConfig.difficulty].beatDetectionSensitivity;
    
    console.log("게임 설정 업데이트:", gameConfig);
}

// 싱크 조정
function adjustSync(direction) {
    const amount = direction === 'plus' ? 10 : -10;
    gameConfig.syncOffset += amount;
    document.getElementById('sync-value').textContent = `${gameConfig.syncOffset}ms`;
}

// 게임 시작
function startGame() {
    console.log("게임 시작 준비");
    
    if (!player) {
        alert("YouTube 플레이어가 준비되지 않았습니다.");
        return;
    }
    
    // 게임 설정 업데이트
    updateGameSettings();
    
    // 시작 화면 숨기기, 게임 화면 표시
    document.getElementById('start-screen').style.opacity = '0';
    document.getElementById('start-screen').style.pointerEvents = 'none';
    
    document.getElementById('game-screen').style.opacity = '1';
    document.getElementById('game-screen').style.pointerEvents = 'auto';
    
    // 게임 초기화
    resetGame();
    
    // 비주얼라이저 설정
    setupVisualizer();
    
    // 카운트다운 시작
    startCountdown();
}

// 카운트다운
function startCountdown() {
    // 카운트다운 요소 생성
    const countdownElement = document.createElement('div');
    countdownElement.className = 'countdown';
    countdownElement.textContent = '3';
    document.querySelector('.gameplay-container').appendChild(countdownElement);
    
    let count = 3;
    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownElement.textContent = count.toString();
        } else {
            clearInterval(countdownInterval);
            countdownElement.remove();
            
            // 게임 실제 시작
            beginGameplay();
        }
    }, 1000);
}

// 실제 게임 플레이 시작
function beginGameplay() {
    console.log("게임 플레이 시작");
    
    // 게임 상태 설정
    gameMode = 'play';
    isGameStarted = true;
    isPaused = false;
    
    // 비디오 시작부터 재생
    player.seekTo(0, true);
    player.playVideo();
    
    // 게임 시작 시간 기록
    gameStartTime = Date.now();
    
    // 이벤트 리스너 설정
    setupGameEventListeners();
}

// 게임 이벤트 리스너 설정
function setupGameEventListeners() {
    // 키보드 이벤트
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // ESC 키로 일시 정지
    window.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && gameMode === 'play' && !isPaused) {
            pauseGame();
        }
    });
    
    // 일시 정지 메뉴 버튼
    document.getElementById('resume-btn').addEventListener('click', resumeGame);
    document.getElementById('restart-btn').addEventListener('click', restartGame);
    document.getElementById('return-btn').addEventListener('click', returnToMainMenu);
    
    // 결과 화면 버튼
    document.getElementById('retry-btn').addEventListener('click', restartGame);
    document.getElementById('home-btn').addEventListener('click', returnToMainMenu);
}

// 키 다운 이벤트 처리
function handleKeyDown(event) {
    if (gameMode !== 'play' || isPaused) return;
    
    const key = event.key.toLowerCase();
    const laneIndex = LANE_KEYS.indexOf(key);
    
    if (laneIndex !== -1) {
        // 키 활성화 표시
        const keyIndicator = document.querySelector(`.key-indicator[data-key="${key}"]`);
        if (keyIndicator) {
            keyIndicator.setAttribute('data-active', 'true');
        }
        
        // 노트 판정
        judgeNoteHit(laneIndex);
    }
}

// 키 업 이벤트 처리
function handleKeyUp(event) {
    const key = event.key.toLowerCase();
    const laneIndex = LANE_KEYS.indexOf(key);
    
    if (laneIndex !== -1) {
        // 키 비활성화
        const keyIndicator = document.querySelector(`.key-indicator[data-key="${key}"]`);
        if (keyIndicator) {
            keyIndicator.setAttribute('data-active', 'false');
        }
    }
}

// 오디오 분석 설정
function setupAudioAnalysis() {
    console.log("오디오 분석 설정");
    
    try {
        // 오디오 컨텍스트 생성
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 분석기 노드 생성
        analyser = audioContext.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.85;
        
        // 더미 오디오 소스 생성 (실제 오디오는 YouTube에서 재생됨)
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.connect(analyser);
        oscillator.start();
        
        // 주파수 데이터 배열 생성
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        
        // 애니메이션 프레임 시작
        animationFrameId = requestAnimationFrame(analyzeAudio);
        
        console.log("오디오 분석 설정 완료");
    } catch (error) {
        console.error("오디오 컨텍스트 설정 중 오류:", error);
    }
}

// 오디오 분석
function analyzeAudio() {
    if (gameMode !== 'play' || isPaused) {
        animationFrameId = requestAnimationFrame(analyzeAudio);
        return;
    }
    
    // 주파수 데이터 가져오기
    analyser.getByteFrequencyData(frequencyData);
    
    // 비주얼라이저 업데이트
    updateVisualizer(frequencyData);
    
    // 비트 감지 및 노트 생성
    detectBeatsAndGenerateNotes(frequencyData);
    
    // 노트 업데이트
    updateNotes();
    
    // 진행 표시줄 업데이트
    updateProgressBar();
    
    // 다음 프레임 요청
    animationFrameId = requestAnimationFrame(analyzeAudio);
}

// 비주얼라이저 설정
function setupVisualizer() {
    visualizerCanvas = document.getElementById('visualizer');
    if (!visualizerCanvas) return;
    
    visualizerCtx = visualizerCanvas.getContext('2d');
    
    // 캔버스 크기 설정
    resizeVisualizer();
    
    // 창 크기 변경 시 대응
    window.addEventListener('resize', resizeVisualizer);
}

// 비주얼라이저 크기 조정
function resizeVisualizer() {
    if (!visualizerCanvas || !visualizerCtx) return;
    
    const container = visualizerCanvas.parentElement;
    visualizerCanvas.width = container.clientWidth;
    visualizerCanvas.height = container.clientHeight;
}

// 비주얼라이저 업데이트
function updateVisualizer(frequencyData) {
    if (!visualizerCanvas || !visualizerCtx) return;
    
    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    
    // 배경 지우기
    visualizerCtx.clearRect(0, 0, width, height);
    
    // 주파수 기반 시각화 (바 그래프)
    const barCount = 64; // 바 개수
    const barWidth = width / barCount;
    const frequencyStep = Math.floor(frequencyData.length / barCount);
    
    for (let i = 0; i < barCount; i++) {
        // 주파수 범위별 색상 설정
        let barColor;
        if (i < barCount * 0.25) {
            // 저음역 (빨간색 계열)
            barColor = `rgb(${200 + Math.floor(55 * (i / (barCount * 0.25)))}, 20, 100)`;
        } else if (i < barCount * 0.75) {
            // 중음역 (보라색 계열)
            const normalizedIndex = (i - barCount * 0.25) / (barCount * 0.5);
            barColor = `rgb(${200 - Math.floor(150 * normalizedIndex)}, ${20 + Math.floor(130 * normalizedIndex)}, ${100 + Math.floor(155 * normalizedIndex)})`;
        } else {
            // 고음역 (파란색 계열)
            const normalizedIndex = (i - barCount * 0.75) / (barCount * 0.25);
            barColor = `rgb(50, ${150 + Math.floor(105 * normalizedIndex)}, 255)`;
        }
        
        // 주파수 값 가져오기
        const frequencyValue = frequencyData[i * frequencyStep];
        
        // 바 높이 계산 (로그 스케일링)
        const barHeight = (Math.log(frequencyValue + 1) / Math.log(256)) * height * 0.8;
        
        // 바 그리기
        visualizerCtx.fillStyle = barColor;
        visualizerCtx.fillRect(
            i * barWidth, 
            height - barHeight, 
            barWidth - 1, 
            barHeight
        );
        
        // 반사 효과
        const gradientHeight = barHeight * 0.3;
        const gradient = visualizerCtx.createLinearGradient(
            0, height - barHeight, 
            0, height - barHeight + gradientHeight
        );
        gradient.addColorStop(0, barColor);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        visualizerCtx.fillStyle = gradient;
        visualizerCtx.fillRect(
            i * barWidth, 
            height - barHeight, 
            barWidth - 1, 
            gradientHeight
        );
    }
    
    // 글로우 효과 오버레이
    visualizerCtx.fillStyle = 'rgba(90, 0, 200, 0.1)';
    visualizerCtx.fillRect(0, 0, width, height);
}

// 주파수 범위 에너지 계산
function calculateFrequencyRangeEnergy(frequencyData, minFreq, maxFreq) {
    const frequencyStep = MAX_FREQUENCY / FREQUENCY_BINS;
    const minIndex = Math.floor(minFreq / frequencyStep);
    const maxIndex = Math.min(Math.floor(maxFreq / frequencyStep), FREQUENCY_BINS - 1);
    
    let energy = 0;
    let count = 0;
    
    for (let i = minIndex; i <= maxIndex; i++) {
        energy += frequencyData[i] * frequencyData[i];
        count++;
    }
    
    return count > 0 ? energy / count : 0;
}

// 주파수 대역별 평균 에너지 계산
function calculateAverageEnergy(history) {
    if (history.length === 0) return 0;
    return history.reduce((sum, value) => sum + value, 0) / history.length;
}

// 비트 감지 및 노트 생성
function detectBeatsAndGenerateNotes(frequencyData) {
    const currentTime = player.getCurrentTime();
    const elapsedTime = (Date.now() - gameStartTime) / 1000;
    
    // 주파수 대역별 에너지 계산
    const bassEnergy = calculateFrequencyRangeEnergy(
        frequencyData, 
        FREQUENCY_RANGES.bass[0], 
        FREQUENCY_RANGES.bass[1]
    ) * gameConfig.beatDetectionSensitivity;
    
    const midEnergy = calculateFrequencyRangeEnergy(
        frequencyData, 
        FREQUENCY_RANGES.mid[0], 
        FREQUENCY_RANGES.mid[1]
    ) * gameConfig.beatDetectionSensitivity;
    
    const highEnergy = calculateFrequencyRangeEnergy(
        frequencyData, 
        FREQUENCY_RANGES.high[0], 
        FREQUENCY_RANGES.high[1]
    ) * gameConfig.beatDetectionSensitivity;
    
    // 에너지 히스토리 업데이트
    beatHistory.bass.push(bassEnergy);
    beatHistory.mid.push(midEnergy);
    beatHistory.high.push(highEnergy);
    
    // 히스토리 크기 제한
    const historySize = DIFFICULTY_SETTINGS[gameConfig.difficulty].beatHistory;
    if (beatHistory.bass.length > historySize) beatHistory.bass.shift();
    if (beatHistory.mid.length > historySize) beatHistory.mid.shift();
    if (beatHistory.high.length > historySize) beatHistory.high.shift();
    
    // 평균 에너지 계산
    const avgBassEnergy = calculateAverageEnergy(beatHistory.bass);
    const avgMidEnergy = calculateAverageEnergy(beatHistory.mid);
    const avgHighEnergy = calculateAverageEnergy(beatHistory.high);
    
    // 비트 감지 임계값
    const settings = DIFFICULTY_SETTINGS[gameConfig.difficulty];
    const bassBeatThreshold = settings.bassBeatThreshold;
    const midBeatThreshold = settings.midBeatThreshold;
    const highBeatThreshold = settings.highBeatThreshold;
    
    // 저음역 비트 감지 및 노트 생성
    if (bassEnergy > avgBassEnergy * bassBeatThreshold && 
        currentTime - lastNoteTime.bass > MIN_NOTE_INTERVAL.bass) {
        // 노트 생성 확률
        if (Math.random() < settings.noteProbability) {
            // 레인 0, 1에 노트 생성 (S, D 키)
            const lane = Math.floor(Math.random() * 2);
            createNote(lane, currentTime, elapsedTime);
        }
        lastNoteTime.bass = currentTime;
    }
    
    // 중음역 비트 감지 및 노트 생성
    if (midEnergy > avgMidEnergy * midBeatThreshold && 
        currentTime - lastNoteTime.mid > MIN_NOTE_INTERVAL.mid) {
        // 노트 생성 확률
        if (Math.random() < settings.noteProbability) {
            // 레인 2, 3에 노트 생성 (F, J 키)
            const lane = Math.floor(Math.random() * 2) + 2;
            createNote(lane, currentTime, elapsedTime);
        }
        lastNoteTime.mid = currentTime;
    }
    
    // 고음역 비트 감지 및 노트 생성
    if (highEnergy > avgHighEnergy * highBeatThreshold && 
        currentTime - lastNoteTime.high > MIN_NOTE_INTERVAL.high) {
        // 노트 생성 확률
        if (Math.random() < settings.noteProbability) {
            // 레인 4, 5에 노트 생성 (K, L 키)
            const lane = Math.floor(Math.random() * 2) + 4;
            createNote(lane, currentTime, elapsedTime);
        }
        lastNoteTime.high = currentTime;
    }
}

// 노트 생성
function createNote(laneIndex, videoTime, elapsedTime) {
    // 레인 확인
    const lane = document.getElementById(`lane-${laneIndex + 1}`);
    if (!lane) return;
    
    // 노트 요소 생성
    const note = document.createElement('div');
    note.className = 'note';
    
    // 노트 실제 속도 조정 (CSS 애니메이션 기반)
    const animationDuration = 2.0 / gameConfig.noteSpeed;
    note.style.animationDuration = `${animationDuration}s`;
    
    // 노트 정보 저장
    const noteData = {
        element: note,
        lane: laneIndex,
        videoTime: videoTime,
        createdAt: elapsedTime,
        expectedHitTime: elapsedTime + animationDuration,
        hit: false,
        judgement: null
    };
    
    // 노트 배열에 추가
    notes.push(noteData);
    
    // DOM에 노트 추가
    lane.appendChild(note);
    
    // 총 노트 수 증가
    totalNotes++;
}

// 노트 업데이트
function updateNotes() {
    if (gameMode !== 'play' || isPaused) return;
    
    const currentTime = (Date.now() - gameStartTime) / 1000;
    const judgementLinePosition = document.querySelector('.judgement-line').offsetTop;
    
    // 모든 노트 검사
    notes.forEach(note => {
        if (note.hit) return;
        
        // 노트가 판정선을 지났는지 확인
        const elapsedTime = currentTime - note.createdAt;
        const notePosition = elapsedTime / (2.0 / gameConfig.noteSpeed);
        const missThreshold = note.expectedHitTime + (JUDGEMENT_WINDOWS.good / 1000); // 놓친 노트 판정 임계값
        
        // 노트를 놓친 경우
        if (currentTime > missThreshold && !note.hit) {
            note.hit = true;
            note.judgement = 'miss';
            
            // 노트 제거
            if (note.element && note.element.parentNode) {
                note.element.remove();
            }
            
            // 콤보 초기화 및 결과 업데이트
            combo = 0;
            judgements.miss++;
            updateGameStats();
            showJudgement('miss');
        }
    });
    
    // 히트된 노트 필터링
    notes = notes.filter(note => !note.hit || Date.now() - note.hitTime < 300);
}

// 노트 판정
function judgeNoteHit(laneIndex) {
    // 현재 시간
    const currentTime = (Date.now() - gameStartTime) / 1000;
    
    // 해당 레인의 가장 가까운 노트 찾기
    let closestNote = null;
    let closestDistance = Infinity;
    
    notes.forEach(note => {
        if (note.lane === laneIndex && !note.hit) {
            // 시간 차이 계산 (밀리초)
            const timeDiff = Math.abs(note.expectedHitTime - currentTime) * 1000;
            
            if (timeDiff < closestDistance) {
                closestDistance = timeDiff;
                closestNote = note;
            }
        }
    });
    
    // 판정
    if (closestNote && closestDistance <= JUDGEMENT_WINDOWS.good) {
        closestNote.hit = true;
        closestNote.hitTime = Date.now();
        
        // 판정 결과
        let judgement;
        if (closestDistance <= JUDGEMENT_WINDOWS.perfect) {
            judgement = 'perfect';
            score += SCORE_WEIGHTS.perfect;
            judgements.perfect++;
        } else if (closestDistance <= JUDGEMENT_WINDOWS.great) {
            judgement = 'great';
            score += SCORE_WEIGHTS.great;
            judgements.great++;
        } else {
            judgement = 'good';
            score += SCORE_WEIGHTS.good;
            judgements.good++;
        }
        
        closestNote.judgement = judgement;
        
        // 타이밍 기록 (그래프용)
        const timingError = (closestNote.expectedHitTime - currentTime) * 1000;
        timingHistory.push({
            time: currentTime,
            error: timingError,
            judgement: judgement
        });
        
        // 콤보 증가
        combo++;
        if (combo > maxCombo) {
            maxCombo = combo;
        }
        
        // 콤보 보너스 점수
        const comboBonus = getComboBonus(combo);
        score += comboBonus;
        
        // 콤보 이펙트 (특정 콤보 달성 시)
        if (COMBO_THRESHOLDS.includes(combo)) {
            showComboEffect(combo);
        }
        
        // 히트 이펙트 표시
        showHitEffect(laneIndex, judgement);
        
        // 판정 표시
        showJudgement(judgement);
        
        // 노트 제거
        if (closestNote.element && closestNote.element.parentNode) {
            closestNote.element.remove();
        }
        
        // 정확도 계산 및 결과 업데이트
        hitNotes++;
        updateGameStats();
    } else {
        // 노트가 없거나 판정 범위 밖인 경우
        combo = 0;
        updateGameStats();
    }
}

// 콤보 보너스 계산
function getComboBonus(combo) {
    if (combo >= 200) return 50;
    if (combo >= 100) return 30;
    if (combo >= 50) return 20;
    if (combo >= 30) return 10;
    if (combo >= 10) return 5;
    return 0;
}

// 게임 통계 업데이트
function updateGameStats() {
    // 점수, 콤보 표시
    document.getElementById('score').textContent = score.toString();
    document.getElementById('combo').textContent = combo.toString();
    
    // 정확도 계산 및 표시
    if (hitNotes > 0) {
        const weightedAccuracy = 
            (judgements.perfect * SCORE_WEIGHTS.perfect + 
             judgements.great * SCORE_WEIGHTS.great + 
             judgements.good * SCORE_WEIGHTS.good) / 
            ((judgements.perfect + judgements.great + judgements.good + judgements.miss) * SCORE_WEIGHTS.perfect);
        
        accuracy = Math.round(weightedAccuracy * 100);
        document.getElementById('accuracy').textContent = accuracy + '%';
    }
}

// 진행 표시줄 업데이트
function updateProgressBar() {
    if (!player) return;
    
    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();
    
    if (duration > 0) {
        const progress = (currentTime / duration) * 100;
        document.getElementById('progress-bar').style.width = `${progress}%`;
    }
}

// 판정 표시
function showJudgement(judgement) {
    const judgementDisplay = document.getElementById('judgement-display');
    const judgementText = judgementDisplay.querySelector('.judgement-text');
    
    // 기존 클래스 제거
    judgementText.className = 'judgement-text';
    
    // 새 판정 설정
    judgementText.textContent = judgement.toUpperCase();
    judgementText.setAttribute('data-judgement', judgement);
    
    // 애니메이션을 위한 리플로우
    void judgementText.offsetWidth;
    
    // 표시 애니메이션
    judgementText.classList.add('show');
    
    // 일정 시간 후 제거
    setTimeout(() => {
        judgementText.classList.remove('show');
    }, 500);
}

// 타격 효과 표시
function showHitEffect(laneIndex, judgement) {
    const lane = document.getElementById(`lane-${laneIndex + 1}`);
    if (!lane) return;
    
    // 효과 요소 생성
    const effect = document.createElement('div');
    effect.className = `note-hit-effect note-hit-${judgement}`;
    
    // 레인에 추가
    lane.appendChild(effect);
    
    // 애니메이션 완료 후 제거
    setTimeout(() => {
        if (effect.parentNode) {
            effect.remove();
        }
    }, 300);
}

// 콤보 효과 표시
function showComboEffect(comboCount) {
    const gameCanvas = document.getElementById('game-canvas');
    if (!gameCanvas) return;
    
    // 효과 요소 생성
    const effect = document.createElement('div');
    effect.className = 'combo-effect';
    effect.textContent = `${comboCount} COMBO!`;
    
    // 캔버스에 추가
    gameCanvas.appendChild(effect);
    
    // 애니메이션 완료 후 제거
    setTimeout(() => {
        if (effect.parentNode) {
            effect.remove();
        }
    }, 500);
}

// 게임 일시 정지
function pauseGame() {
    if (gameMode !== 'play' || isPaused) return;
    
    isPaused = true;
    player.pauseVideo();
    
    // 일시 정지 메뉴 표시
    showPauseMenu();
}

// 일시 정지 메뉴 표시
function showPauseMenu() {
    const pauseMenu = document.getElementById('pause-menu');
    pauseMenu.classList.add('show');
}

// 게임 재개
function resumeGame() {
    if (gameMode !== 'play') return;
    
    // 일시 정지 메뉴 숨기기
    const pauseMenu = document.getElementById('pause-menu');
    pauseMenu.classList.remove('show');
    
    // 잠시 후 재개 (UI 애니메이션을 위해)
    setTimeout(() => {
        isPaused = false;
        player.playVideo();
    }, 100);
}

// 게임 재시작
function restartGame() {
    // 일시 정지 메뉴 숨기기
    const pauseMenu = document.getElementById('pause-menu');
    pauseMenu.classList.remove('show');
    
    // 결과 화면 숨기기
    const resultScreen = document.getElementById('result-screen');
    resultScreen.classList.remove('show');
    
    // 게임 초기화 및 다시 시작
    resetGame();
    startCountdown();
}

// 메인 메뉴로 돌아가기
function returnToMainMenu() {
    // 게임 종료
    endGame(false);
    
    // 일시 정지 메뉴 숨기기
    const pauseMenu = document.getElementById('pause-menu');
    pauseMenu.classList.remove('show');
    
    // 결과 화면 숨기기
    const resultScreen = document.getElementById('result-screen');
    resultScreen.classList.remove('show');
    
    // 게임 화면 숨기기, 시작 화면 표시
    document.getElementById('game-screen').style.opacity = '0';
    document.getElementById('game-screen').style.pointerEvents = 'none';
    
    document.getElementById('start-screen').style.opacity = '1';
    document.getElementById('start-screen').style.pointerEvents = 'auto';
    
    // 비디오 정지
    if (player) {
        player.stopVideo();
    }
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
    judgements = {
        perfect: 0,
        great: 0,
        good: 0,
        miss: 0
    };
    timingHistory = [];
    beatHistory = {
        bass: [],
        mid: [],
        high: []
    };
    lastNoteTime = {
        bass: 0,
        mid: 0,
        high: 0
    };
    
    // 게임 상태 초기화
    gameMode = 'wait';
    isGameStarted = false;
    isPaused = true;
    
    // UI 초기화
    document.getElementById('score').textContent = '0';
    document.getElementById('combo').textContent = '0';
    document.getElementById('accuracy').textContent = '0%';
    document.getElementById('progress-bar').style.width = '0%';
    
    // 레인 초기화
    const lanes = document.querySelectorAll('.lane');
    lanes.forEach(lane => {
        lane.innerHTML = '';
    });
    
    // 키 인디케이터 초기화
    const keyIndicators = document.querySelectorAll('.key-indicator');
    keyIndicators.forEach(indicator => {
        indicator.setAttribute('data-active', 'false');
    });
    
    // 판정 표시 초기화
    const judgementText = document.querySelector('#judgement-display .judgement-text');
    if (judgementText) {
        judgementText.className = 'judgement-text';
        judgementText.textContent = '';
    }
}

// 게임 종료
function endGame(showResults = true) {
    console.log("게임 종료");
    
    // 게임 상태 변경
    gameMode = 'result';
    isGameStarted = false;
    isPaused = true;
    
    // 애니메이션 프레임 중지
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // 모든 노트 제거
    notes.forEach(note => {
        if (note.element && note.element.parentNode) {
            note.element.remove();
        }
    });
    notes = [];
    
    // 결과 표시
    if (showResults) {
        // 결과 데이터 설정
        document.getElementById('result-score').textContent = score.toString();
        document.getElementById('result-max-combo').textContent = maxCombo.toString();
        document.getElementById('result-accuracy').textContent = accuracy + '%';
        
        document.getElementById('perfect-count').textContent = judgements.perfect.toString();
        document.getElementById('great-count').textContent = judgements.great.toString();
        document.getElementById('good-count').textContent = judgements.good.toString();
        document.getElementById('miss-count').textContent = judgements.miss.toString();
        
        // 퍼포먼스 그래프 그리기
        drawPerformanceGraph();
        
        // 결과 화면 표시
        const resultScreen = document.getElementById('result-screen');
        resultScreen.classList.add('show');
    }
}

// 퍼포먼스 그래프 그리기
function drawPerformanceGraph() {
    const canvas = document.getElementById('performance-graph');
    if (!canvas || timingHistory.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // 캔버스 초기화
    ctx.clearRect(0, 0, width, height);
    
    // 배경 그리기
    ctx.fillStyle = 'rgba(20, 20, 40, 0.5)';
    ctx.fillRect(0, 0, width, height);
    
    // 중앙 선 (완벽한 타이밍)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // 판정 영역 표시
    const perfectWindow = (JUDGEMENT_WINDOWS.perfect / 200) * height;
    const greatWindow = (JUDGEMENT_WINDOWS.great / 200) * height;
    const goodWindow = (JUDGEMENT_WINDOWS.good / 200) * height;
    
    // 판정 영역 그리기
    ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.fillRect(0, height / 2 - perfectWindow, width, perfectWindow * 2);
    
    ctx.fillStyle = 'rgba(0, 255, 127, 0.1)';
    ctx.fillRect(0, height / 2 - greatWindow, width, greatWindow * 2);
    
    ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
    ctx.fillRect(0, height / 2 - goodWindow, width, goodWindow * 2);
    
    // 타이밍 히스토리 그리기
    if (timingHistory.length > 0) {
        const maxTime = timingHistory[timingHistory.length - 1].time;
        const minTime = Math.max(0, maxTime - 60); // 최대 60초 표시
        
        timingHistory.forEach(entry => {
            // x 좌표 (시간)
            const x = ((entry.time - minTime) / (maxTime - minTime)) * width;
            
            // y 좌표 (타이밍 오차)
            const y = height / 2 - (entry.error / 200) * height;
            
            // 판정에 따른 색상
            let color;
            switch (entry.judgement) {
                case 'perfect':
                    color = 'rgba(0, 255, 255, 0.8)';
                    break;
                case 'great':
                    color = 'rgba(0, 255, 127, 0.8)';
                    break;
                case 'good':
                    color = 'rgba(255, 255, 0, 0.8)';
                    break;
                default:
                    color = 'rgba(255, 0, 0, 0.8)';
            }
            
            // 포인트 그리기
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // 그림자 효과
            ctx.shadowColor = color;
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        });
        
        // 그림자 효과 초기화
        ctx.shadowBlur = 0;
    }
}

// 초기화
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM 로드 완료");
    
    // 시작 화면 버튼 이벤트
    document.getElementById('load-btn').addEventListener('click', loadVideo);
    document.getElementById('start-btn').addEventListener('click', startGame);
    
    // 싱크 조정 버튼
    document.getElementById('sync-plus').addEventListener('click', () => adjustSync('plus'));
    document.getElementById('sync-minus').addEventListener('click', () => adjustSync('minus'));
    
    // YouTube API 로드
    loadYouTubeAPI();
});
