const API_BASE = "/api";

const startScreen = document.querySelector("#startScreen");
const testShell = document.querySelector("#testShell");
const detailsForm = document.querySelector("#detailsForm");
const form = document.querySelector("#testForm");
const mcqContainer = document.querySelector("#mcqContainer");
const writingPrompt = document.querySelector("#writingPrompt");
const writingAnswer = document.querySelector("#writingAnswer");

const speakingInstruction = document.querySelector("#speakingInstruction");
const speakingPassage = document.querySelector("#speakingPassage");
const speakingTranscript = document.querySelector("#speakingTranscript");

const recordButton = document.querySelector("#recordButton");
const stopButton = document.querySelector("#stopButton");

const recordingStatus = document.querySelector("#recordingStatus");
const speakingTimer = document.querySelector("#speakingTimer");

const studentName = document.querySelector("#studentName");
const studentEmail = document.querySelector("#studentEmail");
const studentAge = document.querySelector("#studentAge");

const genderInput = document.querySelector("#genderInput");
const genderBoxes = document.querySelectorAll(".gender-box");

const wordCount = document.querySelector("#wordCount");

const resetButton = document.querySelector("#resetButton");
const submitButton = document.querySelector("#submitButton");

const testTimer = document.querySelector("#testTimer");
const totalMarks = document.querySelector("#totalMarks");
const TEST_DURATION_SECONDS = 20 * 60;
const TIMER_DEADLINE_KEY = "englishTestTimerDeadline";
const TEST_STARTED_KEY = "englishTestStarted";
const STUDENT_DETAILS_KEY = "englishTestStudentDetails";

let testData = null;

let recognition = null;
let micStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let recordedAudioBytes = 0;
let recordingStopPromise = Promise.resolve();
let audioContext = null;
let analyser = null;
let volumeSamples = [];
let voiceSamples = 0;
let isRecording = false;
let recordingStartedAt = 0;
let speakingDuration = 0;

let speakingTimerId = null;
let testTimerId = null;

let secondsLeft = TEST_DURATION_SECONDS;

let isSubmitting = false;
let testStarted = false;
let writingStartedAt = 0;
let writingLastInputAt = 0;
let writingInputEvents = 0;
let writingKeystrokes = 0;
let writingBackspaces = 0;
let writingPasteAttempts = 0;
let writingBlockedPasteCharacters = 0;
let writingMaxTextJump = 0;
let writingPreviousLength = 0;

function wordsIn(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function renderMcq(questions) {
  mcqContainer.innerHTML = questions
    .map((question, index) => {
      const options = question.options
        .map(
          (option, optionIndex) => `
            <label class="option">
              <input
                type="radio"
                name="${question.id}"
                value="${optionIndex}"
                required
              />
              <span>${option}</span>
            </label>
          `
        )
        .join("");

      return `
        <div class="question">
          <div class="question-title">
            ${index + 1}. ${question.level ? `${question.level}: ` : ""}${question.question}
          </div>

          <div class="options">
            ${options}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderSpeakingPassage(passage) {
  const lines = Array.isArray(passage)
    ? passage
    : String(passage || "").split(/\n+/);

  speakingPassage.innerHTML = lines
    .filter((line) => line.trim())
    .map((line, index) => {
      const tag = index === 0 ? "h3" : "p";

      return `<${tag}>${escapeHtml(line.trim())}</${tag}>`;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function collectMcqAnswers() {
  return testData.mcq.reduce((answers, question) => {
    const selected = form.querySelector(
      `input[name="${question.id}"]:checked`
    );

    answers[question.id] = selected
      ? Number(selected.value)
      : null;

    return answers;
  }, {});
}

async function loadTest() {
  const response = await fetch(`${API_BASE}/test/`);

  if (!response.ok) {
    throw new Error("Could not load test questions.");
  }

  testData = await response.json();

  renderMcq(testData.mcq);

  totalMarks.textContent = "100";

  writingPrompt.textContent =
    testData.writing.prompt;

  speakingInstruction.textContent =
    testData.speaking.instruction;

  renderSpeakingPassage(testData.speaking.passage);
}

function updateTestTimer() {
  const savedDeadline = Number(
    sessionStorage.getItem(TIMER_DEADLINE_KEY)
  );

  if (savedDeadline) {
    secondsLeft = Math.max(
      0,
      Math.ceil((savedDeadline - Date.now()) / 1000)
    );
  }

  const minutes = String(
    Math.floor(secondsLeft / 60)
  ).padStart(2, "0");

  const seconds = String(
    secondsLeft % 60
  ).padStart(2, "0");

  testTimer.textContent = `${minutes}:${seconds}`;

  testTimer.parentElement.classList.toggle(
    "danger",
    secondsLeft <= 60
  );
}

function startTestTimer() {
  if (testTimerId) {
    window.clearInterval(testTimerId);
  }

  let deadline = Number(
    sessionStorage.getItem(TIMER_DEADLINE_KEY)
  );

  if (!deadline) {
    deadline =
      Date.now() + TEST_DURATION_SECONDS * 1000;

    sessionStorage.setItem(
      TIMER_DEADLINE_KEY,
      String(deadline)
    );
  } else if (deadline <= Date.now()) {
    secondsLeft = 0;
    updateTestTimer();
    submitTest(true);
    return;
  }

  updateTestTimer();

  testTimerId = window.setInterval(() => {
    updateTestTimer();

    if (secondsLeft <= 0) {
      window.clearInterval(testTimerId);

      submitTest(true);
    }
  }, 1000);
}

function setupSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    recordingStatus.textContent =
      "Transcript works best in Chrome or Edge. Mic activity will still be checked.";

    speakingTranscript.placeholder =
      "No speech transcript support in this browser. The app will score voice activity only.";

    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.addEventListener("result", (event) => {
    let transcript = "";

    for (
      let index = 0;
      index < event.results.length;
      index += 1
    ) {
      transcript +=
        event.results[index][0].transcript;
    }

    speakingTranscript.value =
      transcript.trim();
  });

  recognition.addEventListener("end", () => {
    if (isRecording) {
      recognition.start();
    }
  });

  recognition.addEventListener("error", (event) => {
    recordingStatus.textContent =
      `Microphone error: ${event.error}`;

    stopRecording();
  });
}

function resetVoiceMetrics() {
  volumeSamples = [];
  voiceSamples = 0;
  audioChunks = [];
  recordedAudioBlob = null;
  recordedAudioBytes = 0;
  recordingStopPromise = Promise.resolve();
}

function collectVoiceSample() {
  if (!analyser) return;

  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);

  let total = 0;

  data.forEach((value) => {
    const centered = (value - 128) / 128;
    total += centered * centered;
  });

  const volume = Math.sqrt(total / data.length);
  volumeSamples.push(volume);

  if (volume > 0.008) {
    voiceSamples += 1;
  }

  if (isRecording && volume > 0.015) {
    recordingStatus.textContent =
      "Recording... voice detected";
  }
}

function cleanAgeInput() {
  studentAge.value = studentAge.value
    .replace(/[^\d]/g, "")
    .replace(/^0+(\d)/, "$1");
}

function getStudentDetails() {
  return {
    studentName: studentName.value.trim(),
    studentEmail: studentEmail.value.trim(),
    studentAge: studentAge.value.trim(),
    gender: genderInput.value
  };
}

function saveStudentDetails() {
  sessionStorage.setItem(
    STUDENT_DETAILS_KEY,
    JSON.stringify(getStudentDetails())
  );
}

function restoreStudentDetails() {
  const saved = sessionStorage.getItem(STUDENT_DETAILS_KEY);

  if (!saved) return;

  try {
    const details = JSON.parse(saved);

    studentName.value = details.studentName || "";
    studentEmail.value = details.studentEmail || "";
    studentAge.value = details.studentAge || "";
    genderInput.value = details.gender || "";

    genderBoxes.forEach((box) => {
      const selected = box.dataset.gender === genderInput.value;

      box.classList.toggle("selected", selected);
      box.setAttribute(
        "aria-pressed",
        selected ? "true" : "false"
      );
    });
  } catch {
    sessionStorage.removeItem(STUDENT_DETAILS_KEY);
  }
}

function validateStudentDetails() {
  if (!studentName.value.trim()) {
    alert("Please enter your full name as in passport.");
    studentName.focus();
    return false;
  }

  if (!studentEmail.validity.valid) {
    alert("Please enter a valid email address.");
    studentEmail.focus();
    return false;
  }

  const age = Number(studentAge.value);

  if (
    !Number.isInteger(age) ||
    age < 1 ||
    age > 120
  ) {
    alert("Please enter a valid age between 1 and 120.");
    studentAge.focus();
    return false;
  }

  if (!genderInput.value) {
    alert("Please select a gender.");
    return false;
  }

  return true;
}

function showStartScreen() {
  testStarted = false;
  startScreen.classList.remove("hidden");
  testShell.classList.add("hidden");
  window.clearInterval(testTimerId);
  sessionStorage.removeItem(TEST_STARTED_KEY);
  sessionStorage.removeItem(TIMER_DEADLINE_KEY);
}

function showTestScreen() {
  testStarted = true;
  startScreen.classList.add("hidden");
  testShell.classList.remove("hidden");
}

function beginTest() {
  if (!validateStudentDetails()) return;

  saveStudentDetails();
  sessionStorage.setItem(TEST_STARTED_KEY, "true");
  showTestScreen();
  startTestTimer();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function markWritingStarted() {
  if (!writingStartedAt) {
    writingStartedAt = Date.now();
  }

  writingLastInputAt = Date.now();
}

function resetWritingMetrics() {
  writingStartedAt = 0;
  writingLastInputAt = 0;
  writingInputEvents = 0;
  writingKeystrokes = 0;
  writingBackspaces = 0;
  writingPasteAttempts = 0;
  writingBlockedPasteCharacters = 0;
  writingMaxTextJump = 0;
  writingPreviousLength = 0;
}

function getWritingMetrics() {
  const words = wordsIn(writingAnswer.value);
  const elapsedSeconds =
    writingStartedAt && writingLastInputAt
      ? Math.max(
          1,
          Math.round(
            (writingLastInputAt - writingStartedAt) / 1000
          )
        )
      : 0;

  return {
    elapsedSeconds,
    inputEvents: writingInputEvents,
    keystrokes: writingKeystrokes,
    backspaces: writingBackspaces,
    pasteAttempts: writingPasteAttempts,
    blockedPasteCharacters: writingBlockedPasteCharacters,
    maxTextJump: writingMaxTextJump,
    words,
    wordsPerMinute:
      elapsedSeconds > 0
        ? Math.round((words / elapsedSeconds) * 60)
        : 0
  };
}

function getVoiceMetrics() {
  const sampleCount = volumeSamples.length;
  const totalVolume = volumeSamples.reduce(
    (total, value) => total + value,
    0
  );
  const peakVolume = sampleCount
    ? Math.max(...volumeSamples)
    : 0;

  return {
    sampleCount,
    voiceSeconds: voiceSamples * 0.5,
    averageVolume: sampleCount
      ? totalVolume / sampleCount
      : 0,
    peakVolume,
    silenceRatio: sampleCount
      ? 1 - voiceSamples / sampleCount
      : 1,
    audioBytes: recordedAudioBytes
  };
}

function updateTimer() {
  speakingDuration = Math.max(
    0,
    Math.round(
      (Date.now() - recordingStartedAt) / 1000
    )
  );

  speakingTimer.textContent =
    `${speakingDuration} seconds`;

  collectVoiceSample();
}

async function startRecording() {
  try {
    micStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    audioContext =
      new (window.AudioContext ||
        window.webkitAudioContext)();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const source =
      audioContext.createMediaStreamSource(
        micStream
      );

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    if (window.MediaRecorder) {
      mediaRecorder = new MediaRecorder(micStream);
      recordingStopPromise = new Promise((resolve) => {
        mediaRecorder.addEventListener(
          "stop",
          () => {
            recordedAudioBytes = audioChunks.reduce(
              (total, chunk) => total + chunk.size,
              0
            );
            recordedAudioBlob = new Blob(audioChunks, {
              type:
                mediaRecorder.mimeType ||
                "audio/webm"
            });

            updateRecordingStatus();
            resolve();
          },
          { once: true }
        );
      });

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
          recordedAudioBytes += event.data.size;
        }
      });
    } else {
      mediaRecorder = null;
    }
  } catch (error) {
    console.error(error);

    recordingStatus.textContent =
      "Microphone access denied";

    return;
  }

  speakingTranscript.value = "";
  speakingDuration = 0;
  resetVoiceMetrics();
  recordingStartedAt = Date.now();
  isRecording = true;

  recordButton.disabled = true;
  stopButton.disabled = false;

  recordingStatus.textContent =
    "Recording...";

  updateTimer();

  speakingTimerId = window.setInterval(
    updateTimer,
    500
  );

  if (recognition) {
    recognition.start();
  }

  if (mediaRecorder) {
    mediaRecorder.start(500);
  }
}

function updateRecordingStatus() {
  const metrics = getVoiceMetrics();
  const detectedRecording =
    metrics.audioBytes > 1500 ||
    metrics.voiceSeconds >= 1 ||
    metrics.peakVolume > 0.015;

  recordingStatus.textContent =
    speakingTranscript.value.trim()
      ? "Recording complete"
      : detectedRecording
        ? "Audio recorded. Transcript may be limited."
        : "No speech detected";
}

async function stopRecording() {
  isRecording = false;

  recordButton.disabled = false;
  stopButton.disabled = true;

  window.clearInterval(speakingTimerId);

  updateTimer();

  updateRecordingStatus();

  if (recognition) {
    recognition.stop();
  }

  if (
    mediaRecorder &&
    mediaRecorder.state !== "inactive"
  ) {
    mediaRecorder.stop();
    await recordingStopPromise;
  }

  if (micStream) {
    micStream
      .getTracks()
      .forEach((track) => track.stop());
  }

  if (audioContext) {
    audioContext.close();
  }

  micStream = null;
  mediaRecorder = null;
  audioContext = null;
  analyser = null;
}

writingAnswer.addEventListener("keydown", (event) => {
  if (event.key.length === 1) {
    writingKeystrokes += 1;
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    writingBackspaces += 1;
  }
});

writingAnswer.addEventListener("paste", (event) => {
  event.preventDefault();

  writingPasteAttempts += 1;
  writingBlockedPasteCharacters +=
    event.clipboardData?.getData("text")?.length || 0;

  markWritingStarted();
});

writingAnswer.addEventListener("drop", (event) => {
  event.preventDefault();
  writingPasteAttempts += 1;
});

writingAnswer.addEventListener("beforeinput", (event) => {
  if (
    event.inputType === "insertFromPaste" ||
    event.inputType === "insertFromDrop"
  ) {
    event.preventDefault();
    writingPasteAttempts += 1;
  }
});

writingAnswer.addEventListener("input", () => {
  markWritingStarted();

  writingInputEvents += 1;
  writingMaxTextJump = Math.max(
    writingMaxTextJump,
    Math.abs(
      writingAnswer.value.length - writingPreviousLength
    )
  );
  writingPreviousLength = writingAnswer.value.length;

  wordCount.textContent =
    `${wordsIn(writingAnswer.value)} words`;
});

studentAge.addEventListener("keydown", (event) => {
  if (["e", "E", "+", "-", "."].includes(event.key)) {
    event.preventDefault();
  }
});

studentAge.addEventListener("input", cleanAgeInput);

detailsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  beginTest();
});

resetButton.addEventListener("click", () => {
  form.reset();

  wordCount.textContent = "0 words";
  resetWritingMetrics();

  speakingDuration = 0;
  resetVoiceMetrics();

  speakingTimer.textContent = "0 seconds";

  speakingTranscript.value = "";

  recordingStatus.textContent =
    "Not recorded yet";

  secondsLeft = TEST_DURATION_SECONDS;

  sessionStorage.setItem(
    TIMER_DEADLINE_KEY,
    String(Date.now() + TEST_DURATION_SECONDS * 1000)
  );

  updateTestTimer();
});

genderBoxes.forEach((box) => {
  box.addEventListener("click", () => {
    genderBoxes.forEach((item) => {
      item.classList.remove("selected");
      item.setAttribute("aria-pressed", "false");
    });

    box.classList.add("selected");
    box.setAttribute("aria-pressed", "true");

    genderInput.value = box.dataset.gender;
    saveStudentDetails();
  });
});

recordButton.addEventListener(
  "click",
  startRecording
);

stopButton.addEventListener(
  "click",
  stopRecording
);

async function uploadSpeakingAudio() {
  if (!recordedAudioBlob || recordedAudioBlob.size < 500) {
    return null;
  }

  const formData = new FormData();
  formData.append(
    "audio",
    recordedAudioBlob,
    "speaking-recording.webm"
  );

  const response = await fetch(`${API_BASE}/audio`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error("Could not upload speaking audio.");
  }

  return response.json();
}

async function submitTest(fromTimer = false) {
  if (!testStarted && !fromTimer) {
    beginTest();
    return;
  }

  if (isSubmitting) return;

  isSubmitting = true;

  if (isRecording) {
    await stopRecording();
  }

  if (!genderInput.value) {
    alert("Please select a gender.");

    isSubmitting = false;

    return;
  }

  const age = Number(studentAge.value);

  if (
    !Number.isInteger(age) ||
    age < 1 ||
    age > 120
  ) {
    alert("Please enter a valid age between 1 and 120.");

    isSubmitting = false;

    return;
  }

  if (!speakingTranscript.value.trim()) {
    alert(
      "Please complete Section C. Press Start Recording, read the passage aloud, and make sure speech is detected before submitting."
    );

    isSubmitting = false;

    return;
  }

  submitButton.disabled = true;

  submitButton.textContent =
    fromTimer
      ? "Time is up..."
      : "Checking...";

  try {
    const speakingAudio =
      await uploadSpeakingAudio();

    const response = await fetch(
      `${API_BASE}/submit`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          studentName: studentName.value,
          studentEmail: studentEmail.value,
          studentAge: studentAge.value,
          gender: genderInput.value,

          mcqAnswers: collectMcqAnswers(),

          writingAnswer: writingAnswer.value,
          writingMetrics:
            getWritingMetrics(),

          speakingTranscript:
            speakingTranscript.value,

          speakingDuration,

          speakingMetrics:
            getVoiceMetrics(),

          speakingAudio
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        "Could not submit test."
      );
    }

    const result = await response.json();

    sessionStorage.setItem(
      "englishTestResult",
      JSON.stringify(result)
    );

    sessionStorage.removeItem(TIMER_DEADLINE_KEY);
    sessionStorage.removeItem(TEST_STARTED_KEY);
    sessionStorage.removeItem(STUDENT_DETAILS_KEY);

    window.location.href = "result.html";

  } catch (error) {
    console.error(error);

    alert(error.message);

    isSubmitting = false;

    submitButton.disabled = false;

    submitButton.textContent =
      "Submit Test";

  } finally {
    window.clearInterval(testTimerId);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  submitTest(false);
});

loadTest().catch((error) => {
  mcqContainer.innerHTML = `
    <p class="incorrect">
      ${error.message}
      Start the backend server first.
    </p>
  `;
});

setupSpeechRecognition();
restoreStudentDetails();

if (sessionStorage.getItem(TEST_STARTED_KEY) === "true") {
  showTestScreen();
  startTestTimer();
} else {
  showStartScreen();
  updateTestTimer();
}
