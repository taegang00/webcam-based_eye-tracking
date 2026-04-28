/**********************
 * 1. USER-EDITABLE TEXT PAGES
 **********************/
// 여기에 실험에 사용할 텍스트를 마음껏 수정해서 넣으세요. 
// \n은 줄바꿈을 의미합니다.
const TEXT_PAGES = [
  {
    title: "The Urban Renovation - Part 1",
    text: `Designing a modern city involves more than just steel and concrete; it requires a deep understanding of visual aesthetics. For instance, choosing the right **color** scheme for public spaces can influence the mood of thousands of citizens every day. Recently, the local planning committee decided to renovate the old **theater** in the heart of the district to attract more tourists.`
  },
  {
    title: "The Urban Renovation - Part 2",
    text: `The building is located exactly at the city **center**, a place where history and modernity often collide. The officials had to **organize** numerous public hearings to ensure that every resident's voice was heard. Many experts who were **traveling** from abroad provided valuable insights into how other global metropolises managed similar projects.`
  },
  {
    title: "The Urban Renovation - Part 3",
    text: `However, as the project moved forward, some architects began to **realize** that the budget was tighter than expected. They had to reconsider the expensive materials they initially planned to use. In a surprising turn, a famous European designer suggested a completely different **colour** palette that utilized local, sustainable materials instead.`
  },
  {
    title: "The Urban Renovation - Part 4",
    text: `The new design transformed the space into a grand **theatre** that rivaled those found in the historical **centre** of London. The team had to **organise** their tasks meticulously to meet the grand opening deadline. They worked day and night, ensuring that every detail of the interior reflected the designer's original, bold vision.`
  },
  {
    title: "The Urban Renovation - Part 5",
    text: `By the time a group of international journalists was **travelling** through the city to cover the event, the renovation was complete. It didn't take long for the public to **realise** that this project was not just about a building, but about revitalizing the entire community spirit through thoughtful and inclusive urban design.`
  }
];

/**********************
 * 2. SETTINGS
 **********************/
const CALIBRATION_POINTS = [
  [10, 10], [50, 10], [90, 10],
  [10, 50], [50, 50], [90, 50],
  [10, 90], [50, 90], [90, 90]
];

const VALIDATION_POINTS = [
  [15, 15], [50, 15], [85, 15],
  [15, 50], [50, 50], [85, 50],
  [15, 85], [50, 85], [85, 85]
];

const REQUIRED_CLICKS_PER_CALIB_POINT = 5;
const VALIDATION_SAMPLE_MS = 1000;
const GAZE_PLOT_POINT_RADIUS = 3; // 기본 반지름

// *** NEW SETTINGS ***
const SMOOTHING_WINDOW_SIZE = 5; // 보정(평균값)에 사용할 샘플 수
const GAZE_BUBBLE_MAX_RADIUS = 30; // Heatmap 스타일 군집 원의 최대 크기
const GAZE_BUBBLE_COLOR = "rgba(255, 69, 0, 0.4)"; // 원 색상 (주황빛 빨강)
const FIXATION_CLUSTER_RADIUS = 40; // 군집으로 묶을 거리 기준 (pixel)
const MIN_FIXATION_SAMPLES = 5;    // 최소 5개 이상의 샘플이 모여야 하나의 '점'으로 인정

/**********************
 * 3. STATE
 **********************/
const state = {
  phase: "intro",
  latestGaze: null,
  latestElapsedTime: null,
  
  // *** NEW: 시선 좌표 보정용 버퍼 ***
  gazeBufferX: [], 
  gazeBufferY: [],

  calibrationPointClicks: {},
  calibrationPointsCompleted: 0,

  validationIndex: 0,
  validationResults: [],

  currentPageIndex: -1,
  pageStartTime: null,
  pageDurations: [],
  gazeLog: [],

  readingStarted: false,
  readingSampleCountCurrentPage: 0,
  
  // *** NEW: 단어 분석용 데이터 ***
  currentPageSpans: [] 
};

/**********************
 * 4. DOM
 **********************/
const introScreen = document.getElementById("introScreen");
const calibrationScreen = document.getElementById("calibrationScreen");
const validationScreen = document.getElementById("validationScreen");
const readingScreen = document.getElementById("readingScreen");
const resultScreen = document.getElementById("resultScreen");

const startBtn = document.getElementById("startBtn");
const calibrationInstruction = document.getElementById("calibrationInstruction");
const validationInstruction = document.getElementById("validationInstruction");
const validationProgress = document.getElementById("validationProgress");

const pageTitle = document.getElementById("pageTitle");
const readingText = document.getElementById("readingText");

const gazeDot = document.getElementById("gazeDot");
const statusBar = document.getElementById("statusBar");

const resultSummary = document.getElementById("resultSummary");
const pageSelect = document.getElementById("pageSelect");
// (drawPlotBtn은 필요 없어서 제거했습니다. 페이지 선택 시 자동 드로잉)
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const gazeCanvas = document.getElementById("gazeCanvas");
const ctx = gazeCanvas.getContext("2d");

// *** NEW: 단어 분석 DOM ***
const wordAnalyzerContainer = document.getElementById("wordAnalyzerContainer");
const wordStatsDisplay = document.getElementById("wordStatsDisplay");
const statWord = document.getElementById("statWord");
const statCount = document.getElementById("statCount");
const statTime = document.getElementById("statTime");


/**********************
 * 5. HELPERS
 **********************/
function showScreen(screenEl) {
  [introScreen, calibrationScreen, validationScreen, readingScreen, resultScreen]
    .forEach(el => el.classList.remove("active"));
  screenEl.classList.add("active");
}

function setStatus(msg) {
  statusBar.textContent = msg;
}

function clearPhaseDots(className) {
  document.querySelectorAll("." + className).forEach(el => el.remove());
}

function viewportPointFromPercent(xPercent, yPercent) {
  return {
    x: window.innerWidth * (xPercent / 100),
    y: window.innerHeight * (yPercent / 100)
  };
}

function average(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function distance(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// *** NEW: 시선 좌표 보정(Smoothing) 함수 ***
function getSmoothedGaze(rawX, rawY) {
  state.gazeBufferX.push(rawX);
  state.gazeBufferY.push(rawY);
  
  // 버퍼 크기 유지
  if (state.gazeBufferX.length > SMOOTHING_WINDOW_SIZE) {
    state.gazeBufferX.shift();
    state.gazeBufferY.shift();
  }
  
  // 평균값 계산
  return {
    x: average(state.gazeBufferX),
    y: average(state.gazeBufferY)
  };
}

function downloadTextFile(content, filename, mimeType = "text/plain") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**********************
 * 6. WEBGAZER INIT
 **********************/
window.saveDataAcrossSessions = false;
webgazer.params.faceMeshSolutionPath = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh";

webgazer
  .setTracker("TFFacemesh")
  .setRegression("ridge")
  .setGazeListener((data, elapsedTime) => {
    if (!data) {
      // setStatus(`Phase: ${state.phase} | gaze data = null`);
      return;
    }
    
    // 1. raw 데이터 가져오기
    const rawX = data.x;
    const rawY = data.y;
    
    // 2. *** NEW: 보정된 데이터 계산 ***
    const smoothed = getSmoothedGaze(rawX, rawY);
    state.latestGaze = smoothed;
    state.latestElapsedTime = elapsedTime;

    // 3. *** NEW: 리딩 페이즈에 따른 빨간 점 가시성 완벽 제어 ***
    if (state.phase === "reading") {
      gazeDot.style.display = "none"; // 리딩 중엔 무조건 숨김
    } else {
      gazeDot.style.display = "block"; // 다른 페이즈에선 보임 (디버깅용)
      gazeDot.style.left = smoothed.x + "px";
      gazeDot.style.top = smoothed.y + "px";
    }

    if (state.phase === "reading" && state.readingStarted) {
      state.gazeLog.push({
        phase: "reading",
        pageIndex: state.currentPageIndex,
        pageTitle: TEXT_PAGES[state.currentPageIndex].title,
        x: smoothed.x, // 보정된 x 사용
        y: smoothed.y, // 보정된 y 사용
        elapsedTime,
        pageTime: performance.now() - state.pageStartTime,
        timestampISO: new Date().toISOString()
      });

      state.readingSampleCountCurrentPage += 1;
      setStatus(
        `Phase: reading | page=${state.currentPageIndex + 1} | samples=${state.readingSampleCountCurrentPage} | x=${smoothed.x.toFixed(1)} y=${smoothed.y.toFixed(1)}`
      );
    } else {
      setStatus(`Phase: ${state.phase} | x=${smoothed.x.toFixed(1)} y=${smoothed.y.toFixed(1)} t=${Math.round(elapsedTime)}ms`);
    }
  })
  .begin()
  .then(() => {
    console.log("webgazer initialized");
    webgazer.showVideoPreview(true);
    webgazer.showPredictionPoints(false);
    webgazer.showFaceOverlay(true);
    webgazer.showFaceFeedbackBox(true);
  })
  .catch(err => {
    console.error("webgazer init error:", err);
    setStatus("Initialization error: " + err.message);
  });


/**********************
 * 7. CALIBRATION
 **********************/
function startCalibration() {
  state.phase = "calibration";
  state.calibrationPointClicks = {};
  state.calibrationPointsCompleted = 0;
  
  // 보정 버퍼 초기화
  state.gazeBufferX = [];
  state.gazeBufferY = [];

  showScreen(calibrationScreen);
  createCalibrationDots();
}

function createCalibrationDots() {
  clearPhaseDots("calib-dot");

  CALIBRATION_POINTS.forEach(([xp, yp], index) => {
    state.calibrationPointClicks[index] = 0;

    const dot = document.createElement("div");
    dot.className = "calib-dot";
    dot.style.left = `${xp}vw`;
    dot.style.top = `${yp}vh`;

    dot.addEventListener("click", () => {
      state.calibrationPointClicks[index] += 1;

      const n = state.calibrationPointClicks[index];
      const remaining = REQUIRED_CLICKS_PER_CALIB_POINT - n;

      if (remaining > 0) {
        calibrationInstruction.textContent =
          `Calibration point ${index + 1}: ${n}/${REQUIRED_CLICKS_PER_CALIB_POINT} clicks recorded. Keep looking at the same point and click ${remaining} more time(s).`;
        dot.style.opacity = String(1 - (n / (REQUIRED_CLICKS_PER_CALIB_POINT + 1)));
      } else {
        dot.remove();
        state.calibrationPointsCompleted += 1;

        calibrationInstruction.textContent =
          `Calibration progress: ${state.calibrationPointsCompleted}/${CALIBRATION_POINTS.length} points completed.`;

        if (state.calibrationPointsCompleted === CALIBRATION_POINTS.length) {
          calibrationInstruction.textContent =
            "Calibration completed. Validation will begin in 1 second.";
          setTimeout(startValidation, 1000);
        }
      }
    });

    calibrationScreen.appendChild(dot);
  });
}

/**********************
 * 8. VALIDATION
 **********************/
function startValidation() {
  state.phase = "validation";
  state.validationIndex = 0;
  state.validationResults = [];
  showScreen(validationScreen);
  runValidationPoint();
}

function runValidationPoint() {
  clearPhaseDots("val-dot");

  if (state.validationIndex >= VALIDATION_POINTS.length) {
    finishValidation();
    return;
  }

  const [xp, yp] = VALIDATION_POINTS[state.validationIndex];

  const dot = document.createElement("div");
  dot.className = "val-dot";
  dot.style.left = `${xp}vw`;
  dot.style.top = `${yp}vh`;
  validationScreen.appendChild(dot);

  validationInstruction.textContent =
    `Validation ${state.validationIndex + 1}/${VALIDATION_POINTS.length}: Look at the green dot and press SPACEBAR.`;

  validationProgress.textContent =
    `Completed points: ${state.validationIndex}/${VALIDATION_POINTS.length}`;
}

function collectValidationSample() {
  const [xp, yp] = VALIDATION_POINTS[state.validationIndex];
  const pixelTarget = viewportPointFromPercent(xp, yp);

  const samples = [];
  const start = performance.now();

  return new Promise(resolve => {
    function sampler() {
      const now = performance.now();

      if (state.latestGaze) {
        samples.push({
          x: state.latestGaze.x,
          y: state.latestGaze.y
        });
      }

      if (now - start < VALIDATION_SAMPLE_MS) {
        requestAnimationFrame(sampler);
      } else {
        const meanX = average(samples.map(s => s.x));
        const meanY = average(samples.map(s => s.y));
        const err = (meanX !== null && meanY !== null)
          ? distance(meanX, meanY, pixelTarget.x, pixelTarget.y)
          : null;

        state.validationResults.push({
          pointIndex: state.validationIndex,
          targetX: pixelTarget.x,
          targetY: pixelTarget.y,
          meanX,
          meanY,
          errorPx: err,
          nSamples: samples.length
        });

        validationProgress.textContent =
          `Point ${state.validationIndex + 1}: ${samples.length} samples collected` +
          (err !== null ? ` | error = ${err.toFixed(1)} px` : ` | error = N/A`);

        resolve();
      }
    }

    sampler();
  });
}

function finishValidation() {
  clearPhaseDots("val-dot");

  const validErrors = state.validationResults
    .map(v => v.errorPx)
    .filter(v => v !== null);

  const avgError = validErrors.length ? average(validErrors) : null;
  const totalSamples = state.validationResults.reduce((sum, v) => sum + v.nSamples, 0);

  validationInstruction.textContent =
    avgError !== null
      ? `Validation completed. Mean error: ${avgError.toFixed(1)} px. Total validation samples: ${totalSamples}. Reading will begin in 2 seconds.`
      : `Validation completed, but no valid gaze sample was collected. Reading will begin in 2 seconds.`;

  setTimeout(() => {
    startReading();
  }, 2000);
}

/**********************
 * 9. READING TASK
 **********************/
function startReading() {
  state.phase = "reading";
  state.currentPageIndex = 0;
  state.pageDurations = [];
  state.readingStarted = true;
  
  // 1. *** NEW: 리딩 중 UI 완벽 숨기기 ***
  showScreen(readingScreen);
  document.body.style.cursor = "none"; // 마우스 커서 숨김
  gazeDot.style.display = "none";      // 빨간 점 숨김 (CSS로도 제어)
  statusBar.style.display = "none";   // 우측 상단 상태바 숨김
  
  // WebGazer 관련 미리보기 모두 숨기기
  webgazer.showVideoPreview(false);
  webgazer.showPredictionPoints(false);
  webgazer.showFaceOverlay(false);
  webgazer.showFaceFeedbackBox(false);

  showReadingPage(state.currentPageIndex);
}

function showReadingPage(pageIndex) {
  // 1. 상태 업데이트
  state.phase = "reading";
  state.currentPageIndex = pageIndex;
  state.readingStarted = true;
  
  // 2. 화면 표시 및 텍스트 설정
  const page = TEXT_PAGES[pageIndex];
  pageTitle.textContent = page.title;
  
  // Bold 적용 로직
  readingText.innerHTML = page.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // 3. WebGazer 상태 관리 (가장 안전한 방식)
  if (window.webgazer) {
    webgazer.resume(); 
    // 에러를 유발하던 getRegressions() 등을 모두 삭제했습니다.
    // 대신 콘솔에 현재 상태를 찍어 정상 작동을 확인합니다.
    console.log("Reading Page Started:", pageIndex + 1);
  }

  // 4. 시간 측정 시작
  state.pageStartTime = performance.now();
  state.readingSampleCountCurrentPage = 0;
  
  // 5. [중요] Initializing 문구를 지우고 현재 상태 표시
  setStatus(`Reading: Page ${pageIndex + 1}`);
}

function advanceReadingPage() {
  const now = performance.now();
  const duration = now - state.pageStartTime;

  state.pageDurations.push({
    pageIndex: state.currentPageIndex,
    pageTitle: TEXT_PAGES[state.currentPageIndex].title,
    durationMs: duration,
    sampleCount: state.readingSampleCountCurrentPage
  });

  if (state.currentPageIndex < TEXT_PAGES.length - 1) {
    state.currentPageIndex += 1;
    showReadingPage(state.currentPageIndex);
  } else {
    finishExperiment();
  }
}

/**********************
 * 10. RESULTS
 **********************/
function finishExperiment() {
  state.phase = "results";
  state.readingStarted = false;
  
  // 2. *** NEW: 결과창에서 UI 다시 복구 ***
  document.body.style.cursor = "default";
  statusBar.style.display = "block";
  gazeDot.style.display = "none"; // 결과창에선 빨간 점 필요 없음

  showScreen(resultScreen);
  buildResults();
}

function buildResults() {
  const totalReadingMs = state.pageDurations.reduce((sum, p) => sum + p.durationMs, 0);

  const validErrors = state.validationResults
    .map(v => v.errorPx)
    .filter(v => v !== null);

  const avgValidationError = validErrors.length ? average(validErrors) : null;

  let html = "";
  html += `<strong>Total pages:</strong> ${TEXT_PAGES.length}<br>`;
  html += `<strong>Total reading time:</strong> ${(totalReadingMs / 1000).toFixed(2)} seconds<br>`;
  html += `<strong>Total gaze samples during reading:</strong> ${state.gazeLog.length}<br>`;
  html += `<strong>Mean validation error:</strong> ${avgValidationError !== null ? avgValidationError.toFixed(1) + " px" : "N/A"}<br><br>`;

  html += `<br><strong>Page-level reading times</strong><br>`;
  state.pageDurations.forEach(p => {
    html += `Page ${p.pageIndex + 1} (${p.pageTitle}): ${(p.durationMs / 1000).toFixed(2)} seconds | samples = ${p.sampleCount}<br>`;
  });

  resultSummary.innerHTML = html;

  pageSelect.innerHTML = "";
  TEXT_PAGES.forEach((page, i) => {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = `Page ${i + 1}: ${page.title}`;
    pageSelect.appendChild(option);
  });
  
  // *** NEW: 드롭다운 변경 시 플롯 그리기 ***
  pageSelect.addEventListener("change", () => {
    drawFixationHeatmap(Number(pageSelect.value));
    setupWordAnalyzer(Number(pageSelect.value)); // 단어 분석기 업데이트
  });

  // 초기 페이지 드로잉
  drawFixationHeatmap(0);
  setupWordAnalyzer(0);
}

// *** NEW: Heatmap 스타일의 Fixation Clustering 그리기 ***
// 요청하신 '동그라미가 커지는 효과'를 구현합니다.
// *** 수정된 함수: 배경에 텍스트를 그리고 그 위에 시선 데이터를 표시 ***
function drawFixationHeatmap(pageIndex) {
  // 1. 캔버스 초기화 (배경은 투명하게)
  ctx.clearRect(0, 0, gazeCanvas.width, gazeCanvas.height);
  
  // 2. [핵심] 실제 지문 HTML을 결과창 배경 레이어로 그대로 복사
  const sourceHTML = readingText.innerHTML; // Bold 등이 포함된 원본 HTML
  const resultBg = document.getElementById("resultTextBackground");
  if (resultBg) {
    resultBg.innerHTML = sourceHTML;
  }

  // 3. 시선 데이터 가져오기
  const samples = state.gazeLog.filter(d => d.pageIndex === pageIndex);
  if (!samples.length) return;

  const xScale = gazeCanvas.width / window.innerWidth;
  const yScale = gazeCanvas.height / window.innerHeight;

  // 보정 계수 (이전과 동일하게 유지하여 좌표 정밀도 확보)
  const Y_SHIFT = -110; 
  const X_STRETCH = 1.35;
  const canvasCenterX = gazeCanvas.width / 2;

  // 4. Gaze Path 그리기
  ctx.beginPath();
  ctx.strokeStyle = "rgba(30, 102, 245, 0.25)";
  ctx.lineWidth = 2;
  samples.forEach((s, i) => {
    let sx = s.x * xScale;
    let sy = (s.y * yScale) + Y_SHIFT;
    sx = canvasCenterX + (sx - canvasCenterX) * X_STRETCH;

    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.stroke();

  // 5. Fixation Clustering (원) 계산 및 그리기
  let fixations = [];
  let currentFix = { samples: [], count: 0 };

  samples.forEach(s => {
    let sx = s.x * xScale;
    let sy = (s.y * yScale) + Y_SHIFT;
    sx = canvasCenterX + (sx - canvasCenterX) * X_STRETCH;

    if (currentFix.samples.length > 0) {
      const lx = average(currentFix.samples.map(p => p.x));
      const ly = average(currentFix.samples.map(p => p.y));
      if (distance(lx, ly, sx, sy) < 40) { // 군집 범위를 40으로 확대
        currentFix.samples.push({x: sx, y: sy});
        currentFix.count++;
      } else {
        // [필터링] 최소 5개 이상의 샘플이 모인 유의미한 지점만 원으로 표시 (노이즈 제거)
        if (currentFix.count >= 5) {
          fixations.push({ x: lx, y: ly, count: currentFix.count });
        }
        currentFix = { samples: [{x: sx, y: sy}], count: 1 };
      }
    } else {
      currentFix = { samples: [{x: sx, y: sy}], count: 1 };
    }
  });

  ctx.fillStyle = GAZE_BUBBLE_COLOR; 
  ctx.strokeStyle = "rgba(0,0,0,0.1)";
  fixations.forEach(f => {
    ctx.beginPath();
    // 데이터 양에 따라 원 크기 조절
    const radius = Math.min(30, 5 + Math.sqrt(f.count) * 2.5);
    ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}


// 캔버스 텍스트 줄바꿈 도우미 함수 (이 함수도 app.js 어딘가에 있어야 합니다)
function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = context.measureText(testLine);
    let testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      context.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  context.fillText(line, x, y);
}

// *** NEW: 단어 분석을 위해 텍스트를 단어 단위로 분할하여 HTML 생성 ***
// 이 함수는 '결과 배경 텍스트'를 시뮬레이션합니다.
function setupWordAnalyzer(pageIndex) {
  const page = TEXT_PAGES[pageIndex];
  wordAnalyzerContainer.innerHTML = ""; // 기존 내용 초기화
  
  // 텍스트를 줄바꿈 단위로 먼저 분할
  const lines = page.text.split('\n');
  state.currentPageSpans = [];

  lines.forEach((line) => {
    // 각 줄을 다시 단어 단위로 분할 (\s+는 공백 문자 기준)
    const words = line.split(/(\s+)/);
    
    words.forEach(word => {
      if (word.trim().length > 0) {
        // 텍스트가 있는 단어는 span으로 감쌈
        const span = document.createElement("span");
        span.className = "word-span";
        span.textContent = word;
        
        // 클릭 이벤트 추가 (분석 함수 호출)
        span.addEventListener("click", () => {
          analyzeClickedWord(span, pageIndex);
        });
        
        wordAnalyzerContainer.appendChild(span);
        state.currentPageSpans.push(span);
      } else {
        // 공백은 그대로 추가 (레이아웃 유지)
        wordAnalyzerContainer.appendChild(document.createTextNode(word));
      }
    });
    // 줄바꿈 추가
    wordAnalyzerContainer.appendChild(document.createElement("br"));
  });
}

// *** NEW: 클릭된 단어의 Fixation Count 및 Total Time 계산 ***
// (가장 고난도 기능)
function analyzeClickedWord(spanEl, pageIndex) {
  // 1. 시각적 피드백: 이전에 클릭된 단어 스타일 제거, 현재 단어 스타일 추가
  state.currentPageSpans.forEach(s => s.classList.remove("clicked"));
  spanEl.classList.add("clicked");
  
  // 2. 단어의 화면 좌표(Bounding Box) 가져오기
  // 이 좌표는 뷰포트(window) 기준입니다.
  const rect = spanEl.getBoundingClientRect();
  
  // 3. 해당 페이지의 시선 데이터 가져오기
  const samples = state.gazeLog.filter(d => d.pageIndex === pageIndex);
  
  // 4. 단어 좌표 안에 들어가는 시선 샘플 카운트
  // 약간의 마진(5px)을 주어서 정확도를 보완합니다.
  const margin = 5; 
  const wordSamples = samples.filter(s => {
    return (
      s.x >= rect.left - margin &&
      s.x <= rect.right + margin &&
      s.y >= rect.top - margin &&
      s.y <= rect.bottom + margin
    );
  });
  
  // 5. 결과 계산
  const count = wordSamples.length;
  // total time 계산: (샘플 개수 * 대략적인 샘플링 인터벌)
  // WebGazer 인터벌은 유동적이므로 elapsedTime 차이를 평균 내서 사용합니다.
  let avgInterval = 0;
  if (samples.length > 1) {
    avgInterval = (samples[samples.length - 1].elapsedTime - samples[0].elapsedTime) / (samples.length - 1);
  }
  const totalTime = Math.round(count * avgInterval);

  // 6. 결과 표시
  wordStatsDisplay.classList.remove("hidden");
  statWord.textContent = `"${spanEl.textContent.trim()}"`;
  statCount.textContent = count;
  statTime.textContent = totalTime;
}


/**********************
 * 11. EVENTS
 **********************/
startBtn.addEventListener("click", () => {
  startCalibration();
});

downloadCsvBtn.addEventListener("click", () => {
  downloadCSV();
});

downloadJsonBtn.addEventListener("click", () => {
  downloadJSONSummary();
});

// CSV 다운로드 함수 (보정된 좌표를 받도록 수정)
function downloadCSV() {
  let csv = [
    [
      "phase",
      "pageIndex",
      "pageTitle",
      "smoothedX", // 변경된 컬럼명
      "smoothedY", // 변경된 컬럼명
      "elapsedTimeMs",
      "pageTimeMs",
      "timestampISO"
    ].join(",")
  ];

  state.gazeLog.forEach(row => {
    csv.push([
      row.phase,
      row.pageIndex,
      `"${row.pageTitle.replace(/"/g, '""')}"`,
      row.x.toFixed(2), // 보정된 x
      row.y.toFixed(2), // 보정된 y
      row.elapsedTime,
      row.pageTime,
      row.timestampISO
    ].join(","));
  });

  downloadTextFile(csv.join("\n"), "gaze_log.csv", "text/csv");
}

function downloadJSONSummary() {
  const summary = {
    textPages: TEXT_PAGES,
    validationResults: state.validationResults,
    pageDurations: state.pageDurations,
    totalGazeSamples: state.gazeLog.length,
    gazeSmoothingWindow: SMOOTHING_WINDOW_SIZE,
    exportedAt: new Date().toISOString()
  };

  downloadTextFile(
    JSON.stringify(summary, null, 2),
    "experiment_summary.json",
    "application/json"
  );
}

document.addEventListener("keydown", async (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();

  if (state.phase === "validation") {
    validationInstruction.textContent =
      `Validation ${state.validationIndex + 1}/${VALIDATION_POINTS.length}: recording...`;

    await collectValidationSample();
    state.validationIndex += 1;
    runValidationPoint();
    return;
  }

  if (state.phase === "reading") {
    advanceReadingPage();
  }
});
