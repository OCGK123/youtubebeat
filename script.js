// 전역 변수
let player = null;
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
        noteFrequency: 0.5,
        beatThreshold: 0.6
    },
    normal: {
        noteFrequency: 0.75,
        beatThreshold: 0.4
    },
    hard: {
        noteFrequency: 1.0,
        beatThreshold: 0.3
    }
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

// 비트 분석용 변수
let beatAnalysisData = {
    lastBeats: [],
    lastBeatTime: 0,
    beatInterval: 500 // 기본 비트 간격 (밀리초)
};

// 게임 타이머
let gameStartTime = 0;
let noteGenerationTimer = null;
let gameUpdateTimer = null;

// 오디오 분석 변수
let beatCounter = 0;
let lastNoteTime = 0;

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
    
    // 노트 생성 시작
    analyzeAndGenerateNotes();
    
    // 게임 루프 시작
    startGameLoop();
}

// 키 다운 이벤트 처리
function handleKeyDown(e) {
    if (gameMode !== 'playing') return;
    
    const key = e.key.toLowerCase();
    const laneIndex = KEYS.indexOf(key);
    
    if (laneIndex !== -1) {
        // 키 활성화 시각 효과
        keyIndicators[laneIndex].setAttribute('data-active', 'true');
        
        // 노트 판정
        judgeNote(laneIndex);
    }
}

// 키 업 이벤트 처리
function handleKeyUp(e) {
    const key = e.key.toLowerCase();
    const laneIndex = KEYS.indexOf(key);
    
    if (laneIndex !== -1) {
        // 키 비활성화
        keyIndicators[laneIndex].setAttribute('data-active', 'false');
    }
}

// ESC 키 이벤트 처리
function handleEscKey(e) {
    if (e.key === 'Escape' && gameMode === 'playing') {
        pauseGame();
    }
}

// 템포 분석 및 노트 생성
function analyzeAndGenerateNotes() {
    if (gameMode !== 'playing') return;
    
    // 비디오 현재 시간 확인 (초 단위)
    const currentTime = player.getCurrentTime();
    const elapsedTime = Date.now() - gameStartTime;
    
    // 기본 비트 간격 (밀리초)
    let beatInterval = 600; // 기본값 (BPM 100 기준)
    
    // 첫 15초 동안은 기본 간격으로 생성
    if (currentTime < 15) {
        // 적응형 비트 감지 구현
        if (beatAnalysisData.lastBeats.length >= 8) {
            const intervals = [];
            for (let i = 1; i < beatAnalysisData.lastBeats.length; i++) {
                intervals.push(beatAnalysisData.lastBeats[i] - beatAnalysisData.lastBeats[i-1]);
            }
            
            // 중앙값 계산 (극단값 제거)
            intervals.sort((a, b) => a - b);
            const medianInterval = intervals[Math.floor(intervals.length / 2)];
            if (medianInterval > 200 && medianInterval < 1500) {
                beatInterval = medianInterval;
                beatAnalysisData.beatInterval = beatInterval;
            }
        }
    }
    
    // 비트 간격 기반으로 비트 발생 여부 결정
    const timeSinceLastBeat = elapsedTime - beatAnalysisData.lastBeatTime;
    
    if (timeSinceLastBeat >= beatInterval) {
        // 비트 발생
        beatAnalysisData.lastBeatTime = elapsedTime;
        beatAnalysisData.lastBeats.push(elapsedTime);
        
        // 최대 20개 비트만 저장
        if (beatAnalysisData.lastBeats.length > 20) {
            beatAnalysisData.lastBeats.shift();
        }
        
        // 노트 생성
        const difficultySettings = DIFFICULTY_SETTINGS[config.difficulty];
        
        // 난이도에 따른 노트 생성 확률
        if (Math.random() < difficultySettings.noteFrequency) {
            // 랜덤 레인 선택
            const lane = Math.floor(Math.random() * 4);
            
            // 노트 생성
            createNote(lane);
            beatCounter++;
            lastNoteTime = elapsedTime;
        }
    }
    
    // 실제 오디오 분석
    analyzeAudioForBeats();
    
    // 노트 생성 계속
    noteGenerationTimer = setTimeout(analyzeAndGenerateNotes, 16);
}

// 오디오 분석을 통한 비트 감지
function analyzeAudioForBeats() {
    if (!player || !player.getPlayerState) return;
    
    // 현재 플레이어 시간
    const currentTime = player.getCurrentTime();
    const elapsedTime = Date.now() - gameStartTime;
    
    // 현재 비디오 위치의 오디오 시뮬레이션
    const currentTimeFraction = currentTime % 60; // 1분 내에서의 위치
    
    // 시각적 베이스라인 비트 생성 (심볼릭 구현)
    const bassPattern = [
        1.0, 0.2, 0.6, 0.2,  // 4/4 비트
        1.0, 0.2, 0.6, 0.2,
        1.0, 0.2, 0.8, 0.2,
        1.0, 0.2, 0.6, 0.2
    ];
    
    const beatIndex = Math.floor((currentTimeFraction * 2) % bassPattern.length);
    const beatStrength = bassPattern[beatIndex];
    
    // 트리거 임계값 설정 (난이도에 따라)
    const threshold = DIFFICULTY_SETTINGS[config.difficulty].beatThreshold;
    
    // 임계값보다 높으면 비트로 간주
    if (beatStrength > threshold && Date.now() - lastNoteTime > 300) {
        // 비트 감지 시 추가 노트 생성
        if (Math.random() < 0.4) { // 40% 확률로 추가 노트
            const lane = Math.floor(Math.random() * 4);
            createNote(lane);
            beatCounter++;
            lastNoteTime = Date.now();
        }
    }
}

// 노트 생성
function createNote(lane) {
    // 레인 확인
    if (lane < 0 || lane >= lanes.length) return;
    
    const note = document.createElement('div');
    note.className = 'note';
    
    // 노트 속도 계산 (CSS 애니메이션 속도)
    const duration = 2 / config.noteSpeed;
    note.style.animationDuration = `${duration}s`;
    
    // 노트 데이터 저장
    const noteData = {
        element: note,
        lane: lane,
        createdAt: Date.now(),
        expectedHitTime: Date.now() + (duration * 1000),
        hit: false,
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
    const currentTime = Date.now();
    
    // 각 노트 검사
    for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        
        // 이미 처리된 노트 건너뛰기
        if (note.hit) continue;
        
        // 노트가 판정선을 지났는지 확인
        if (currentTime > note.expectedHitTime + JUDGMENT_WINDOWS.good) {
            // 노트 놓침
            note.hit = true;
            note.judgment = 'miss';
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

// 노트 판정
function judgeNote(laneIndex) {
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
        
        // 노트 처리
        closestNote.hit = true;
        closestNote.judgment = judgment;
        hitNotes++;
        
        // 콤보 증가
        combo++;
        if (combo > maxCombo) {
            maxCombo = combo;
        }
        
        // 콤보 보너스 점수
        const comboBonus = Math.floor(combo / 10) * 100;
        score += comboBonus;
        
        // 노트 제거
        if (closestNote.element && closestNote.element.parentNode) {
            closestNote.element.remove();
        }
        
        // 타격 효과 표시
        showHitEffect(laneIndex, judgment);
        
        // 판정 표시
        showJudgment(judgment);
        
        // 노트 배열에서 제거
        notes.splice(closestIndex, 1);
        
        // 게임 상태 업데이트
        updateGameStats();
    }
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
    if (noteGenerationTimer) {
        clearTimeout(noteGenerationTimer);
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
    analyzeAndGenerateNotes();
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
    if (noteGenerationTimer) {
        clearTimeout(noteGenerationTimer);
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
    
    // 비트 분석 데이터 초기화
    beatAnalysisData = {
        lastBeats: [],
        lastBeatTime: 0,
        beatInterval: 500
    };
    
    beatCounter = 0;
    lastNoteTime = 0;
    
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
