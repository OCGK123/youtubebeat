// 전역 변수
let player = null;
let audioContext;
let audioSource;
let analyzer;
let bassAnalyzer;
let midAnalyzer;
let trebleAnalyzer;
let dataArray;
let bassDataArray;
let midDataArray;
let trebleDataArray;
let isPaused = true;
let isGameStarted = false;
let notes = [];
let score = 0;
let combo = 0;
let totalNotes = 0;
let hitNotes = 0;
let noteSpeed = 3; // 노트가 상단에서 하단까지 이동하는 시간(초)
let lastBeatTime = 0;
let calibrationOffset = 0; // 싱크 조정을 위한 밀리초 단위 오프셋
let audioStartTime = 0;
let beatHistory = [];
let energyThreshold = 0.3; // 비트 감지 임계값
let beatDetectionSensitivity = 1.0; // 비트 감지 민감도
let beatInterval = 0.2; // 최소 비트 간격(초)

// 레인별 키 매핑
const laneKeys = ['d', 'f', 'j', 'k'];

// 오디오 주파수 대역
const BASS_RANGE = [20, 250];
const MID_RANGE = [250, 2000];
const TREBLE_RANGE = [2000, 20000];

// FFT 크기 및 분석 매개변수
const FFT_SIZE = 2048;
const SMOOTHING_TIME_CONSTANT = 0.8;

// 난이도 설정
const DIFFICULTY_SETTINGS = {
    easy: {
        noteSpeed: 4,
        energyThreshold: 0.35,
        beatInterval: 0.3,
        beatDetectionSensitivity: 0.8
    },
    normal: {
        noteSpeed: 3,
        energyThreshold: 0.3,
        beatInterval: 0.2,
        beatDetectionSensitivity: 1.0
    },
    hard: {
        noteSpeed: 2,
        energyThreshold: 0.25,
        beatInterval: 0.1,
        beatDetectionSensitivity: 1.2
    }
};

// 초기화 함수 - 페이지 로드 시 호출
function initializeGame() {
    console.log("게임 초기화 시작");
    
    // 버튼과 이벤트 리스너 설정
    const loadBtn = document.getElementById('load-btn');
    const startBtn = document.getElementById('start-btn');
    const difficultySelect = document.getElementById('difficulty');
    
    loadBtn.addEventListener('click', loadVideo);
    startBtn.addEventListener('click', startGame);
    difficultySelect.addEventListener('change', updateDifficulty);
    
    // 키 가이드에 키 활성화 이벤트 추가
    setupKeyGuide();
    
    // 초기 난이도 설정 적용
    updateDifficulty();
    
    // YouTube API 로드
    if (!window.YT) {
        // API가 아직 로드되지 않은 경우
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        console.log("YouTube API 스크립트 로드 중...");
    } else if (window.YT && window.YT.Player) {
        // API가 이미 로드된 경우
        console.log("YouTube API 이미 로드됨");
        setupPlayer();
    }
}

// YouTube API 준비 완료 시 호출되는 함수 (YouTube API에서 자동 호출)
window.onYouTubeIframeAPIReady = function() {
    console.log("YouTube IFrame API 준비 완료");
    setupPlayer();
};

// YouTube 플레이어 설정
function setupPlayer() {
    console.log("YouTube 플레이어 설정 중...");
    
    // 이미 생성된 플레이어가 있는지 확인
    if (player !== null) {
        console.log("플레이어가 이미 생성되어 있습니다.");
        return;
    }
    
    // 플레이어 영역 확인
    const playerContainer = document.getElementById('youtube-player');
    if (!playerContainer) {
        console.error("'youtube-player' 요소를 찾을 수 없습니다.");
        return;
    }
    
    try {
        player = new YT.Player('youtube-player', {
            height: '100%',
            width: '100%',
            videoId: 'M7lc1UVf-VE', // 기본 데모 비디오
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'disablekb': 1,
                'showinfo': 0,
                'rel': 0,
                'iv_load_policy': 3,
                'fs': 0,
                'origin': window.location.origin
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError
            }
        });
        
        console.log("플레이어 인스턴스 생성 완료");
    } catch (error) {
        console.error("플레이어 생성 중 오류 발생:", error);
    }
}

// 플레이어 오류 처리
function onPlayerError(event) {
    console.error("YouTube 플레이어 오류:", event.data);
    alert("YouTube 영상을 로드하는 중 오류가 발생했습니다. 코드: " + event.data);
}

// 플레이어 준비 완료 이벤트
function onPlayerReady(event) {
    console.log("플레이어 준비 완료, 사용 가능한 메서드:", Object.keys(player));
    document.getElementById('load-btn').disabled = false;
}

// 플레이어 상태 변경 이벤트
function onPlayerStateChange(event) {
    console.log("플레이어 상태 변경:", event.data);
    
    if (event.data === YT.PlayerState.PLAYING && isPaused) {
        console.log("영상 재생 시작");
        isPaused = false;
        audioStartTime = Date.now();
        setupAudioAnalysis();
    } else if (event.data === YT.PlayerState.PAUSED) {
        console.log("영상 일시 정지");
        isPaused = true;
    } else if (event.data === YT.PlayerState.ENDED) {
        console.log("영상 종료");
        endGame();
    }
}

// 유튜브 비디오 로드
function loadVideo() {
    console.log("비디오 로드 함수 호출됨");
    
    const urlInput = document.getElementById('youtube-url');
    const url = urlInput.value;
    
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
    
    console.log("로드할 비디오 ID:", videoId);
    
    // 플레이어 객체 확인
    if (!player) {
        console.error("유효한 YouTube 플레이어가 없습니다.");
        alert("YouTube 플레이어를 초기화하는 중 오류가 발생했습니다. 페이지를 새로고침해 주세요.");
        return;
    }
    
    try {
        // 플레이어 메서드 확인 및 비디오 로드
        if (typeof player.cueVideoById === 'function') {
            console.log("cueVideoById 메서드 사용");
            player.cueVideoById(videoId);
        } else if (typeof player.loadVideoById === 'function') {
            console.log("loadVideoById 메서드 사용");
            player.loadVideoById(videoId);
        } else if (typeof player.cueVideoByUrl === 'function') {
            console.log("cueVideoByUrl 메서드 사용");
            player.cueVideoByUrl('https://www.youtube.com/watch?v=' + videoId);
        } else {
            // 메서드가 없는 경우 플레이어 재생성
            console.log("대체 방법으로 플레이어 재생성");
            recreatePlayer(videoId);
            return;
        }
        
        // 비디오 일시 정지
        if (typeof player.pauseVideo === 'function') {
            player.pauseVideo();
        }
        
        document.getElementById('start-btn').disabled = false;
    } catch (error) {
        console.error("비디오 로드 중 오류 발생:", error);
        alert("비디오를 로드하는 중 오류가 발생했습니다.");
    }
}

// 플레이어 재생성
function recreatePlayer(videoId) {
    console.log("플레이어 재생성 중...");
    
    const playerContainer = document.getElementById('youtube-player');
    
    // 기존 iframe 제거
    while (playerContainer.firstChild) {
        playerContainer.removeChild(playerContainer.firstChild);
    }
    
    // 새 플레이어 컨테이너 생성
    const newPlayerDiv = document.createElement('div');
    newPlayerDiv.id = 'youtube-player';
    playerContainer.appendChild(newPlayerDiv);
    
    // 새 플레이어 인스턴스 생성
    player = new YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
            'playsinline': 1,
            'controls': 0,
            'disablekb': 1,
            'showinfo': 0,
            'rel': 0,
            'iv_load_policy': 3,
            'fs': 0,
            'origin': window.location.origin
        },
        events: {
            'onReady': function(event) {
                console.log("새 플레이어 준비 완료");
                event.target.pauseVideo();
                document.getElementById('start-btn').disabled = false;
            },
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

// 유튜브 URL에서 비디오 ID 추출
function extractVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
        return match[2];
    }
    return null;
}

// 키 가이드 설정
function setupKeyGuide() {
    const keyGuideElements = document.querySelectorAll('.key');
    
    // 키 다운/업 이벤트 리스너 추가
    window.addEventListener('keydown', function(event) {
        const key = event.key.toLowerCase();
        const index = laneKeys.indexOf(key);
        
        if (index !== -1) {
            keyGuideElements[index].classList.add('key-active');
            
            // 게임이 시작된 경우에만 키 입력 처리
            if (isGameStarted && !isPaused) {
                checkNoteHit(index);
                showLaneHitEffect(index);
            }
        }
    });
    
    window.addEventListener('keyup', function(event) {
        const key = event.key.toLowerCase();
        const index = laneKeys.indexOf(key);
        
        if (index !== -1) {
            keyGuideElements[index].classList.remove('key-active');
        }
    });
}

// 레인 타격 효과 표시
function showLaneHitEffect(laneIndex) {
    const lane = document.getElementById(`lane-${laneIndex + 1}`);
    
    const effect = document.createElement('div');
    effect.className = 'hit-effect';
    lane.appendChild(effect);
    
    // 애니메이션 종료 후 요소 제거
    setTimeout(() => {
        effect.remove();
    }, 300);
}

// 난이도 설정 업데이트
function updateDifficulty() {
    const difficultySelect = document.getElementById('difficulty');
    const difficulty = difficultySelect.value;
    const settings = DIFFICULTY_SETTINGS[difficulty];
    
    noteSpeed = settings.noteSpeed;
    energyThreshold = settings.energyThreshold;
    beatInterval = settings.beatInterval;
    beatDetectionSensitivity = settings.beatDetectionSensitivity;
    
    console.log("난이도 변경:", difficulty, settings);
}

// 게임 시작
function startGame() {
    console.log("게임 시작 함수 호출됨");
    
    if (!player) {
        console.error("유효한 YouTube 플레이어가 없습니다.");
        alert("YouTube 플레이어가 초기화되지 않았습니다. 페이지를 새로고침해 주세요.");
        return;
    }
    
    resetGame();
    
    // 카운트다운 시작
    let count = 3;
    const countdownEl = document.createElement('div');
    countdownEl.className = 'countdown';
    countdownEl.textContent = count;
    document.querySelector('.game-container').appendChild(countdownEl);
    
    const countdown = setInterval(() => {
        count--;
        if (count > 0) {
            countdownEl.textContent = count;
        } else {
            clearInterval(countdown);
            countdownEl.remove();
            
            // 게임 시작 시 영상 재생
            if (typeof player.playVideo === 'function') {
                player.playVideo();
                isGameStarted = true;
                console.log("카운트다운 완료, 게임 시작");
            } else {
                console.error("playVideo 메서드를 찾을 수 없습니다.");
                alert("비디오를 재생할 수 없습니다. 페이지를 새로고침해 주세요.");
            }
        }
    }, 1000);
}

// 게임 종료
function endGame() {
    console.log("게임 종료");
    
    isGameStarted = false;
    isPaused = true;
    
    // 최종 점수 및 정확도 표시
    const accuracy = totalNotes > 0 ? Math.round((hitNotes / totalNotes) * 100) : 0;
    document.getElementById('accuracy').textContent = accuracy;
    
    // 모든 노트 제거
    notes.forEach(note => {
        if (note.element && note.element.parentNode) {
            note.element.remove();
        }
    });
    notes = [];
}

// 게임 초기화
function resetGame() {
    console.log("게임 리셋");
    
    notes = [];
    score = 0;
    combo = 0;
    totalNotes = 0;
    hitNotes = 0;
    beatHistory = [];
    
    document.getElementById('score').textContent = score;
    document.getElementById('combo').textContent = combo;
    document.getElementById('accuracy').textContent = '0';
    
    const lanes = document.querySelectorAll('.lane');
    lanes.forEach(lane => {
        lane.innerHTML = '';
        
        // 레인 표시기 추가
        const laneIndex = parseInt(lane.id.replace('lane-', '')) - 1;
        const indicator = document.createElement('div');
        indicator.className = 'lane-indicator';
        indicator.textContent = laneKeys[laneIndex].toUpperCase();
        lane.appendChild(indicator);
    });
}

// 오디오 분석 설정
function setupAudioAnalysis() {
    console.log("오디오 분석 설정");
    
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 다양한 주파수 대역에 대한 분석기 생성
            analyzer = audioContext.createAnalyser();
            analyzer.fftSize = FFT_SIZE;
            analyzer.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
            
            bassAnalyzer = audioContext.createAnalyser();
            bassAnalyzer.fftSize = FFT_SIZE;
            bassAnalyzer.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
            
            midAnalyzer = audioContext.createAnalyser();
            midAnalyzer.fftSize = FFT_SIZE;
            midAnalyzer.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
            
            trebleAnalyzer = audioContext.createAnalyser();
            trebleAnalyzer.fftSize = FFT_SIZE;
            trebleAnalyzer.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
            
            // 각 분석기에 대한 버퍼 배열 생성
            const bufferLength = analyzer.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            bassDataArray = new Uint8Array(bufferLength);
            midDataArray = new Uint8Array(bufferLength);
            trebleDataArray = new Uint8Array(bufferLength);
            
            console.log("오디오 컨텍스트 및 분석기 생성 완료");
        } catch (error) {
            console.error("오디오 컨텍스트 생성 중 오류 발생:", error);
        }
    }
    
    // 오디오 분석 시작
    requestAnimationFrame(analyzeAudio);
}

// 오디오 분석
function analyzeAudio() {
    if (isPaused || !isGameStarted) {
        requestAnimationFrame(analyzeAudio);
        return;
    }
    
    // 유튜브 영상의 현재 재생 시간
    let currentTime = 0;
    try {
        if (player && typeof player.getCurrentTime === 'function') {
            currentTime = player.getCurrentTime();
        }
    } catch (error) {
        console.error("getCurrentTime 호출 중 오류:", error);
    }
    
    const elapsedTimeMs = Date.now() - audioStartTime + calibrationOffset;
    
    // 주파수 데이터 시뮬레이션 (실제 구현에서는 실제 오디오 데이터를 분석)
    simulateFrequencyData(currentTime);
    
    // 시뮬레이션된 데이터를 사용하여 비트 감지
    detectBeats(currentTime, elapsedTimeMs);
    
    // 기존 노트 업데이트
    updateNotes();
    
    // 루프 계속
    requestAnimationFrame(analyzeAudio);
}

// 주파수 데이터 시뮬레이션
function simulateFrequencyData(currentTime) {
    // 이 함수는 데모 목적으로 주파수 데이터를 시뮬레이션합니다.
    // 실제 구현에서는 실제 오디오에서 데이터를 가져옵니다.
    
    // 베이스 주파수 시뮬레이션 (리듬에 적합)
    const bassPulse = Math.sin(currentTime * 2) * 0.5 + 0.5;
    const baseRandom = Math.random() * 0.3;
    const bassValue = Math.round((bassPulse + baseRandom) * 255);
    
    // 중간 주파수 시뮬레이션 (멜로디에 적합)
    const midPulse = Math.sin(currentTime * 4) * 0.5 + 0.5;
    const midRandom = Math.random() * 0.3;
    const midValue = Math.round((midPulse + midRandom) * 255);
    
    // 고음 주파수 시뮬레이션 (하이햇, 심벌즈에 적합)
    const treblePulse = Math.sin(currentTime * 8) * 0.5 + 0.5;
    const trebleRandom = Math.random() * 0.3;
    const trebleValue = Math.round((treblePulse + trebleRandom) * 255);
    
    // 시뮬레이션된 데이터 배열 채우기
    for (let i = 0; i < 1024; i++) { // 기본 길이로 1024 사용
        // 각 범위에 대한 다양한 주파수 분포
        if (i < 204) { // 베이스 범위 (약 20%)
            bassDataArray[i] = bassValue;
            midDataArray[i] = Math.round(midValue * 0.3);
            trebleDataArray[i] = Math.round(trebleValue * 0.1);
        } else if (i < 614) { // 중간 범위 (약 40%)
            bassDataArray[i] = Math.round(bassValue * 0.3);
            midDataArray[i] = midValue;
            trebleDataArray[i] = Math.round(trebleValue * 0.4);
        } else { // 고음 범위 (약 40%)
            bassDataArray[i] = Math.round(bassValue * 0.1);
            midDataArray[i] = Math.round(midValue * 0.4);
            trebleDataArray[i] = trebleValue;
        }
        
        // 전체 주파수 데이터
        dataArray[i] = Math.max(
            bassDataArray[i] * 0.4,
            midDataArray[i] * 0.4,
            trebleDataArray[i] * 0.2
        );
    }
}

// 비트 감지
function detectBeats(currentTime, elapsedTimeMs) {
    // 다양한 주파수 대역의 에너지 레벨 계산
    const bassEnergy = calculateEnergy(bassDataArray) * beatDetectionSensitivity;
    const midEnergy = calculateEnergy(midDataArray) * beatDetectionSensitivity;
    const trebleEnergy = calculateEnergy(trebleDataArray) * beatDetectionSensitivity;
    
    // 더 정확한 비트 감지를 위한 에너지 히스토리 추적
    beatHistory.push({
        time: currentTime,
        elapsedMs: elapsedTimeMs,
        bass: bassEnergy,
        mid: midEnergy,
        treble: trebleEnergy
    });
    
    // 메모리 효율성을 위해 히스토리를 최근 50개 샘플로 제한
    if (beatHistory.length > 50) {
        beatHistory.shift();
    }
    
    // 히스토리에 대한 평균 에너지 계산
    const avgBass = calculateAverageEnergy(beatHistory, 'bass');
    const avgMid = calculateAverageEnergy(beatHistory, 'mid');
    const avgTreble = calculateAverageEnergy(beatHistory, 'treble');
    
    // 특정 임계값을 초과하는 에너지가 감지될 때 비트 감지
    const timeSinceLastBeat = currentTime - lastBeatTime;
    
    if (bassEnergy > avgBass * (1 + energyThreshold) && timeSinceLastBeat > beatInterval) {
        // 베이스 비트 감지 - 레인 0 또는 1에 노트 생성
        const lane = Math.floor(Math.random() * 2); // 0 또는 1
        createNote(lane, currentTime, elapsedTimeMs);
        lastBeatTime = currentTime;
    }
    
    if (midEnergy > avgMid * (1 + energyThreshold) && timeSinceLastBeat > beatInterval * 0.8) {
        // 중간 주파수 비트 감지 - 레인 1 또는 2에 노트 생성
        const lane = Math.floor(Math.random() * 2) + 1; // 1 또는 2
        createNote(lane, currentTime, elapsedTimeMs);
        lastBeatTime = currentTime;
    }
    
    if (trebleEnergy > avgTreble * (1 + energyThreshold) && timeSinceLastBeat > beatInterval * 0.6) {
        // 고음 비트 감지 - 레인 2 또는 3에 노트 생성
        const lane = Math.floor(Math.random() * 2) + 2; // 2 또는 3
        createNote(lane, currentTime, elapsedTimeMs);
        lastBeatTime = currentTime;
    }
}

// 에너지 계산
function calculateEnergy(dataArray) {
    let sum = 0;
    const length = Math.min(dataArray.length, 1024); // 안전을 위해 최대 길이 제한
    
    for (let i = 0; i < length; i++) {
        sum += dataArray[i] * dataArray[i];
    }
    return sum / length;
}

// 평균 에너지 계산
function calculateAverageEnergy(history, type) {
    if (history.length === 0) return 0;
    return history.reduce((sum, item) => sum + item[type], 0) / history.length;
}

// 노트 생성
function createNote(laneIndex, videoTime, elapsedTimeMs) {
    const lane = document.getElementById(`lane-${laneIndex + 1}`);
    if (!lane) {
        console.error(`레인 요소를 찾을 수 없음: lane-${laneIndex + 1}`);
        return;
    }
    
    const note = document.createElement('div');
    note.className = 'note';
    note.style.animationDuration = `${noteSpeed}s`;
    
    // 싱크를 위한 타이밍 정보가 포함된 노트 데이터 저장
    const noteData = {
        element: note,
        lane: laneIndex,
        videoTime: videoTime,
        createdAt: elapsedTimeMs,
        startTime: Date.now(),
        expectedHitTime: Date.now() + (noteSpeed * 1000), // 노트가 타격 영역에 도달해야 하는 시간
        hit: false
    };
    
    notes.push(noteData);
    lane.appendChild(note);
    totalNotes++;
}

// 노트 업데이트
function updateNotes() {
    const currentTime = Date.now();
    const hitZone = document.querySelector('.hit-zone');
    if (!hitZone) {
        console.error("히트존 요소를 찾을 수 없음");
        return;
    }
    
    const hitZonePosition = hitZone.offsetTop;
    
    // 각 노트 업데이트
    notes.forEach((note, index) => {
        if (note.hit) return;
        
        // 노트가 아직 DOM에 존재하는지 확인
        if (!note.element || !note.element.parentNode) {
            note.hit = true;
            return;
        }
        
        // 경과 시간을 기준으로 노트 위치 계산
        const elapsedTime = (currentTime - note.startTime) / 1000; // 초 단위
        const gameCanvas = document.getElementById('game-canvas');
        if (!gameCanvas) {
            console.error("게임 캔버스 요소를 찾을 수 없음");
            return;
        }
        
        const notePosition = (elapsedTime / noteSpeed) * gameCanvas.offsetHeight;
        
        // 노트가 타격 영역을 통과했는지 확인
        if (notePosition >= hitZonePosition + 50) { // +50은 노트 높이를 고려
            // 놓친 노트
            note.hit = true;
            if (note.element && note.element.parentNode) {
                note.element.remove();
            }
            combo = 0;
            document.getElementById('combo').textContent = combo;
            showHitFeedback(note.lane, 'miss');
        }
    });
    
    // 배열에서 타격된 노트 제거
    notes = notes.filter(note => !note.hit);
}

// 키 입력 처리
function checkNoteHit(laneIndex) {
    const hitZone = document.querySelector('.hit-zone');
    if (!hitZone) {
        console.error("히트존 요소를 찾을 수 없음");
        return;
    }
    
    const hitZonePosition = hitZone.offsetTop;
    const hitZoneHeight = hitZone.offsetHeight;
    
    // 누른 레인에서 가장 가까운 노트 찾기
    let closestNote = null;
    let closestDistance = Infinity;
    
    notes.forEach(note => {
        if (note.lane === laneIndex && !note.hit) {
            // 노트가 아직 DOM에 존재하는지 확인
            if (!note.element || !note.element.parentNode) {
                note.hit = true;
                return;
            }
            
            const noteElement = note.element;
            const notePosition = noteElement.offsetTop + (noteElement.offsetHeight / 2);
            const distance = Math.abs(notePosition - (hitZonePosition + (hitZoneHeight / 2)));
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestNote = note;
            }
        }
    });
    
    // 노트가 발견되었고 타격 범위 내에 있는지 확인
    if (closestNote && closestDistance < 50) { // 필요에 따라 타격 창 조정
        closestNote.hit = true;
        if (closestNote.element && closestNote.element.parentNode) {
            closestNote.element.remove();
        }
        hitNotes++;
        
        // 타격 품질 결정 및 점수 부여
        let hitType;
        if (closestDistance < 15) {
            // 완벽한 타격
            score += 100;
            combo++;
            hitType = 'perfect';
            
            // 싱크 보정을 위해 완벽한 타격 사용
            const actualHitTime = Date.now();
            const timingDifference = actualHitTime - closestNote.expectedHitTime;
            
            // 급격한 변화를 피하기 위해 가중 평균을 사용하여 보정 오프셋 조정
            calibrationOffset = calibrationOffset * 0.9 + timingDifference * 0.1;
        } else {
            // 좋은 타격
            score += 50;
            combo++;
            hitType = 'good';
        }
        
        // 점수 및 콤보 표시 업데이트
        document.getElementById('score').textContent = score;
        document.getElementById('combo').textContent = combo;
        
        // 정확도 업데이트
        const accuracy = Math.round((hitNotes / totalNotes) * 100);
        document.getElementById('accuracy').textContent = accuracy;
        
        // 타격 피드백 표시
        showHitFeedback(laneIndex, hitType);
    } else {
        // 놓침 (범위 내 노트 없음)
        combo = 0;
        document.getElementById('combo').textContent = combo;
        showHitFeedback(laneIndex, 'miss');
    }
}

// 타격 피드백 표시
function showHitFeedback(laneIndex, hitType) {
    const lane = document.getElementById(`lane-${laneIndex + 1}`);
    if (!lane) {
        console.error(`레인 요소를 찾을 수 없음: lane-${laneIndex + 1}`);
        return;
    }
    
    const feedback = document.createElement('div');
    feedback.className = `hit-${hitType}`;
    
    // 피드백 텍스트 설정
    if (hitType === 'perfect') {
        feedback.textContent = '완벽!';
    } else if (hitType === 'good') {
        feedback.textContent = '좋음!';
    } else {
        feedback.textContent = '놓침!';
    }
    
    lane.appendChild(feedback);
    
    // 애니메이션 완료 후 피드백 요소 제거
    setTimeout(() => {
        feedback.remove();
    }, 300);
}

// 페이지 로드 시 초기화
window.addEventListener('DOMContentLoaded', function() {
    console.log("DOM 로드 완료, 게임 초기화");
    initializeGame();
});
