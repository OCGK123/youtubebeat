// 전역 변수
let player = null;
let audioContext = null;
let audioAnalyser = null;
let audioSource = null;
let frequencyData = null;
let timeDomainData = null;
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
        bassTrigger: 1.4,
        midTrigger: 1.5,
        highTrigger: 1.6,
        minInterval: 400, // 최소 노트 간격 (ms)
        longNoteChance: 0.2 // 롱노트 생성 확률
    },
    normal: {
        bassTrigger: 1.3,
        midTrigger: 1.4,
        highTrigger: 1.5,
        minInterval: 300,
        longNoteChance: 0.3
    },
    hard: {
        bassTrigger: 1.2,
        midTrigger: 1.3,
        highTrigger: 1.4,
        minInterval: 200,
        longNoteChance: 0.4
    }
};

// 오디오 분석 설정
const AUDIO_CONFIG = {
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    minDecibels: -100,
    maxDecibels: -30,
    bassRange: [20, 250],    // 베이스 주파수 범위 (Hz)
    midRange: [250, 2000],   // 중간 주파수 범위 (Hz)
    highRange: [2000, 8000]  // 고음 주파수 범위 (Hz)
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

// 오디오 분석용 변수
let energyHistory = {
    bass: [],
    mid: [], 
    high: []
};

// 노트 생성 제어 변수
let lastNoteTime = {
    bass: 0,
    mid: 0,
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

// DOM 요소 참조 캐싱
let gameCanvas;
let lanes = [];
let judgmentDisplay;
let keyIndicators = [];

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
function setupAudioAnalysis() {
    if (audioContext) {
        // 이미 설정된 경우 다시 시작
        console.log("오디오 분석 재시작");
        startAudioAnalysis();
        return;
    }
    
    try {
        console.log("오디오 분석 설정 시작");
        
        // AudioContext 생성
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 유튜브 플레이어 iframe에서 오디오 요소 접근
        const iframe = document.querySelector('iframe');
        if (!iframe) {
            throw new Error("YouTube iframe을 찾을 수 없습니다.");
        }
        
        // iframe 내부의 비디오 요소에 접근
        const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
        if (!iframeDocument) {
            throw new Error("보안 정책으로 인해 iframe 내부에 직접 접근할 수 없습니다.");
            // 이 경우 대체 방법 사용
        }
        
        // 대체 분석 방법 설정
        console.log("대체 오디오 분석 방법 사용");
        
        // 분석기 노드 생성
        audioAnalyser = audioContext.createAnalyser();
        audioAnalyser.fftSize = AUDIO_CONFIG.fftSize;
        audioAnalyser.smoothingTimeConstant = AUDIO_CONFIG.smoothingTimeConstant;
        audioAnalyser.minDecibels = AUDIO_CONFIG.minDecibels;
        audioAnalyser.maxDecibels = AUDIO_CONFIG.maxDecibels;
        
        // 더미 오실레이터 소스 (실제 오디오 분석이 불가능한 경우)
        const oscillator = audioContext.createOscillator();
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.connect(audioAnalyser);
        oscillator.start();
        
        // 주파수 데이터 배열 생성
        const bufferLength = audioAnalyser.frequencyBinCount;
        frequencyData = new Uint8Array(bufferLength);
        timeDomainData = new Uint8Array(bufferLength);
        
        console.log("오디오 분석 설정 완료");
        
        // 오디오 분석 시작
        startAudioAnalysis();
    } catch (error) {
        console.error("오디오 분석 설정 오류:", error);
        
        // 오류 발생 시 시뮬레이션 모드로 전환
        alert("오디오 분석을 설정할 수 없습니다. 비트 감지 시뮬레이션 모드로 진행합니다.");
        setupSimulatedAnalysis();
    }
}

// 시뮬레이션된 오디오 분석 설정
function setupSimulatedAnalysis() {
    console.log("시뮬레이션된 오디오 분석 설정");
    
    // 더미 분석기 생성
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = AUDIO_CONFIG.fftSize;
    
    // 주파수 데이터 배열 생성
    const bufferLength = audioAnalyser.frequencyBinCount;
    frequencyData = new Uint8Array(bufferLength);
    timeDomainData = new Uint8Array(bufferLength);
    
    // 시뮬레이션 시작
    startAudioAnalysis();
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

// 오디오 분석 및 비트 감지
function analyzeAudio() {
    if (gameMode !== 'playing') {
        // 게임이 진행 중이 아니면 분석 중지
        return;
    }
    
    // 현재 비디오 시간
    const currentVideoTime = player.getCurrentTime();
    const currentTime = Date.now();
    
    // 주파수 데이터 가져오기 (또는 시뮬레이션)
    updateAudioData(currentVideoTime);
    
    // 비트 감지 및 노트 생성
    detectBeatsAndCreateNotes(currentTime);
    
    // 다음 분석 예약 (약 60fps)
    audioAnalysisTimer = setTimeout(analyzeAudio, 16);
}

// 오디오 데이터 업데이트 (실제 또는 시뮬레이션)
function updateAudioData(currentVideoTime) {
    if (audioAnalyser) {
        // 주파수 데이터 업데이트
        audioAnalyser.getByteFrequencyData(frequencyData);
        audioAnalyser.getByteTimeDomainData(timeDomainData);
    } else {
        // 시뮬레이션 데이터 생성
        simulateAudioData(currentVideoTime);
    }
}

// 오디오 데이터 시뮬레이션
function simulateAudioData(currentVideoTime) {
    // 시뮬레이션된 주파수 데이터 생성
    const time = currentVideoTime;
    
    // 기본 비트 패턴 (4/4 박자 시뮬레이션)
    const beatIntensity = Math.sin(time * Math.PI * 2) * 0.5 + 0.5;
    
    // 비트 패턴에 따른 변화
    const bassIntensity = beatIntensity * 255;
    const midIntensity = (Math.sin(time * Math.PI * 4) * 0.5 + 0.5) * 200;
    const highIntensity = (Math.sin(time * Math.PI * 8) * 0.5 + 0.5) * 150;
    
    // 주파수 대역별로 데이터 설정
    for (let i = 0; i < frequencyData.length; i++) {
        const normalizedIndex = i / frequencyData.length;
        
        if (normalizedIndex < 0.2) {
            // 저음역 대역
            frequencyData[i] = Math.min(255, bassIntensity + Math.random() * 30);
        } else if (normalizedIndex < 0.6) {
            // 중음역 대역
            frequencyData[i] = Math.min(255, midIntensity + Math.random() * 20);
        } else {
            // 고음역 대역
            frequencyData[i] = Math.min(255, highIntensity + Math.random() * 20);
        }
    }
    
    // 파형 데이터 시뮬레이션 (사인파)
    for (let i = 0; i < timeDomainData.length; i++) {
        const phase = (i / timeDomainData.length) * Math.PI * 2;
        timeDomainData[i] = 128 + Math.sin(phase + time * 10) * 64;
    }
}

// 주파수 범위 에너지 계산
function calculateFrequencyRangeEnergy(minFreq, maxFreq) {
    // 주파수 인덱스 계산
    const nyquist = audioContext.sampleRate / 2;
    const minIndex = Math.floor((minFreq / nyquist) * (frequencyData.length));
    const maxIndex = Math.floor((maxFreq / nyquist) * (frequencyData.length));
    
    let totalEnergy = 0;
    let count = 0;
    
    // 해당 범위의 주파수 에너지 합산
    for (let i = minIndex; i <= maxIndex && i < frequencyData.length; i++) {
        totalEnergy += frequencyData[i] * frequencyData[i];
        count++;
    }
    
    // 평균 에너지 반환
    return count > 0 ? totalEnergy / count : 0;
}

// 히스토리 기반 평균 에너지 계산
function calculateAverageEnergy(history) {
    if (history.length === 0) return 0;
    
    const sum = history.reduce((total, current) => total + current, 0);
    return sum / history.length;
}

// 비트 감지 및 노트 생성
function detectBeatsAndCreateNotes(currentTime) {
    // 각 주파수 범위별 에너지 계산
    const bassEnergy = calculateFrequencyRangeEnergy(AUDIO_CONFIG.bassRange[0], AUDIO_CONFIG.bassRange[1]);
    const midEnergy = calculateFrequencyRangeEnergy(AUDIO_CONFIG.midRange[0], AUDIO_CONFIG.midRange[1]);
    const highEnergy = calculateFrequencyRangeEnergy(AUDIO_CONFIG.highRange[0], AUDIO_CONFIG.highRange[1]);
    
    // 에너지 히스토리 업데이트
    energyHistory.bass.push(bassEnergy);
    energyHistory.mid.push(midEnergy);
    energyHistory.high.push(highEnergy);
    
    // 히스토리 크기 제한 (지난 30프레임)
    const historyLimit = 30;
    if (energyHistory.bass.length > historyLimit) energyHistory.bass.shift();
    if (energyHistory.mid.length > historyLimit) energyHistory.mid.shift();
    if (energyHistory.high.length > historyLimit) energyHistory.high.shift();
    
    // 평균 에너지 계산
    const avgBassEnergy = calculateAverageEnergy(energyHistory.bass);
    const avgMidEnergy = calculateAverageEnergy(energyHistory.mid);
    const avgHighEnergy = calculateAverageEnergy(energyHistory.high);
    
    // 난이도 설정 가져오기
    const settings = DIFFICULTY_SETTINGS[config.difficulty];
    
    // 최소 노트 간격 확인
    const minInterval = settings.minInterval;
    
    // 저음역(베이스) 비트 감지
    if (bassEnergy > avgBassEnergy * settings.bassTrigger && 
        currentTime - lastNoteTime.bass > minInterval) {
        // 베이스 비트에 노트 생성 (0, 1번 레인)
        const lane = Math.floor(Math.random() * 2);
        
        // 롱노트 여부 결정
        const isLongNote = Math.random() < settings.longNoteChance;
        const noteDuration = isLongNote ? (Math.random() * 0.5 + 0.5) * 1000 : 0; // 롱노트 길이: 0.5~1초
        
        createNote(lane, isLongNote, noteDuration);
        lastNoteTime.bass = currentTime;
    }
    
    // 중음역 비트 감지
    if (midEnergy > avgMidEnergy * settings.midTrigger && 
        currentTime - lastNoteTime.mid > minInterval) {
        // 중음역 비트에 노트 생성 (주로 1, 2번 레인)
        const lane = Math.floor(Math.random() * 2) + 1;
        
        // 롱노트 여부 결정
        const isLongNote = Math.random() < settings.longNoteChance;
        const noteDuration = isLongNote ? (Math.random() * 0.5 + 0.5) * 1000 : 0;
        
        createNote(lane, isLongNote, noteDuration);
        lastNoteTime.mid = currentTime;
    }
    
    // 고음역 비트 감지
    if (highEnergy > avgHighEnergy * settings.highTrigger && 
        currentTime - lastNoteTime.high > minInterval) {
        // 고음역 비트에 노트 생성 (주로 2, 3번 레인)
        const lane = Math.floor(Math.random() * 2) + 2;
        
        // 롱노트 여부 결정
        const isLongNote = Math.random() < settings.longNoteChance * 0.7; // 고음역은 롱노트 확률 낮게
        const noteDuration = isLongNote ? (Math.random() * 0.4 + 0.3) * 1000 : 0;
        
        createNote(lane, isLongNote, noteDuration);
        lastNoteTime.high = currentTime;
    }
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
    
    // 오디오 분석 시작
    setupAudioAnalysis();
    
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
    // 해당 레인의 활성화된 롱노트 찾기
    let activeIndex = -1;
    
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        
        if (note.lane === laneIndex && note.isLongNote && note.hit && !note.endHit && note.holdActive) {
            activeIndex = i;
            break;
        }
    }
    
    // 활성화된 롱노트가 있으면 홀드 상태 해제
    if (activeIndex !== -1) {
        const note = notes[activeIndex];
        note.holdActive = false;
        
        // 홀드 중 클래스 제거
        if (note.element) {
            note.element.classList.remove('holding');
        }
        
        // 예상 종료 시간과 현재 시간 비교
        const currentTime = Date.now() + config.syncOffset;
        const timeToEnd = note.expectedEndTime - currentTime;
        
        // 종료 시간이 거의 다 되었으면 (100ms 이내) 성공으로 처리
        if (timeToEnd <= 100) {
            // 롱노트 성공
            note.endHit = true;
            
            // 추가 점수 부여
            score += JUDGMENT_SCORES.perfect / 2;
            
            // 롱노트 성공 효과
            showLongNoteCompleteEffect(note.lane);
            
            // 노트 제거
            if (note.element && note.element.parentNode) {
                note.element.remove();
            }
            
            // 노트 배열에서 제거
            notes.splice(activeIndex, 1);
            
            // 게임 상태 업데이트
            updateGameStats();
        }
        // 그렇지 않으면 홀드 해제만 함 (실패는 updateNotes에서 처리)
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
    
    // 게임 모드 업데이트
    gameMode = 'waiting';
}

// 게임 종료
function endGame() {
    if (gameMode !== 'playing') return;
    
    gameMode = 'result';
    
    // 타이머 정지
    if (audioAnalysisTimer) {
        clearTimeout(audioAnalysisTimer);
    }
    
    if (gameUpdateTimer) {
        clearTimeout(gameUpdateTimer);
    }
    
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
    
    // 오디오 분석 변수 초기화
    energyHistory = {
        bass: [],
        mid: [], 
        high: []
    };
    
    lastNoteTime = {
        bass: 0,
        mid: 0,
        high: 0
    };
    
    pressedKeys = {
        d: false,
        f: false,
        j: false, 
        k: false
    };
    
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
    
    // YouTube API 로드
    loadYouTubeAPI();
});
