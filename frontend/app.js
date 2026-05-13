const API_BASE = "/api";

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
const studentAge = document.querySelector("#studentAge");
const genderInput = document.querySelector("#genderInput");
const genderBoxes = document.querySelectorAll(".gender-box");
const wordCount = document.querySelector("#wordCount");
const resetButton = document.querySelector("#resetButton");
const submitButton = document.querySelector("#submitButton");
const testTimer = document.querySelector("#testTimer");

let testData = null;
let recognition = null;
let isRecording = false;
let recordingStartedAt = 0;
let speakingDuration = 0;
let speakingTimerId = null;
let testTimerId = null;
let secondsLeft = 20 * 60;
let isSubmitting = false;

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
              <input type="radio" name="${question.id}" value="${optionIndex}" required />
              <span>${option}</span>
            </label>
          `
        )
        .join("");

      return `
        <div class="question">
          <div class="question-title">${index + 1}. ${question.question}</div>
          <div class="options">${options}</div>
        </div>
      `;
    })
    .join("");
}

function collectMcqAnswers() {
  return testData.mcq.reduce((answers, question) => {
    const selected = form.querySelector(`input[name="${question.id}"]:checked`);
    answers[question.id] = selected ? Number(selected.value) : null;
    return answers;
  }, {});
}

async function loadTest() {
  const response = await fetch(`${API_BASE}/test`);
  if (!response.ok) throw new Error("Could not load test questions.");

  testData = await response.json();
  renderMcq(testData.mcq);
  writingPrompt.textContent = testData.writing.prompt;
  speakingInstruction.textContent = testData.speaking.instruction;
  speakingPassage.textContent = testData.speaking.passage;
}

function updateTestTimer() {
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  testTimer.textContent = `${minutes}:${seconds}`;
  testTimer.parentElement.classList.toggle("danger", secondsLeft <= 60);
}

function startTestTimer() {
  updateTestTimer();
  testTimerId = window.setInterval(() => {
    secondsLeft -= 1;
    updateTestTimer();

    if (secondsLeft <= 0) {
      window.clearInterval(testTimerId);
      submitTest(true);
    }
  }, 1000);
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    recordingStatus.textContent = "Voice recording works best in Chrome or Edge.";
    recordButton.disabled = true;
    speakingTranscript.placeholder = "Speech recognition is not supported in this browser. Use Chrome or Edge.";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.addEventListener("result", (event) => {
    let transcript = "";
    for (let index = 0; index < event.results.length; index += 1) {
      transcript += event.results[index][0].transcript;
    }
    speakingTranscript.value = transcript.trim();
  });

  recognition.addEventListener("end", () => {
    if (isRecording) {
      recognition.start();
    }
  });

  recognition.addEventListener("error", (event) => {
    recordingStatus.textContent = `Microphone error: ${event.error}`;
    stopRecording();
  });
}

function updateTimer() {
  speakingDuration = Math.max(0, Math.round((Date.now() - recordingStartedAt) / 1000));
  speakingTimer.textContent = `${speakingDuration} seconds`;
}

function startRecording() {
  if (!recognition) return;

  speakingTranscript.value = "";
  speakingDuration = 0;
  recordingStartedAt = Date.now();
  isRecording = true;
  recordButton.disabled = true;
  stopButton.disabled = false;
  recordingStatus.textContent = "Recording...";
  updateTimer();
  speakingTimerId = window.setInterval(updateTimer, 500);
  recognition.start();
}

function stopRecording() {
  isRecording = false;
  recordButton.disabled = false;
  stopButton.disabled = true;
  recordingStatus.textContent = speakingTranscript.value.trim() ? "Recording complete" : "No speech detected";
  window.clearInterval(speakingTimerId);
  updateTimer();

  if (recognition) {
    recognition.stop();
  }
}

writingAnswer.addEventListener("input", () => {
  wordCount.textContent = `${wordsIn(writingAnswer.value)} words`;
});

resetButton.addEventListener("click", () => {
  form.reset();
  genderBoxes.forEach((box) => box.classList.remove("selected"));
  wordCount.textContent = "0 words";
  speakingDuration = 0;
  speakingTimer.textContent = "0 seconds";
  recordingStatus.textContent = "Not recorded yet";
  secondsLeft = 20 * 60;
  updateTestTimer();
});

genderBoxes.forEach((box) => {
  box.addEventListener("click", () => {
    genderBoxes.forEach((item) => item.classList.remove("selected"));
    box.classList.add("selected");
    genderInput.value = box.dataset.gender;
  });
});

recordButton.addEventListener("click", startRecording);
stopButton.addEventListener("click", stopRecording);

async function submitTest(fromTimer = false) {
  if (isSubmitting) return;

  isSubmitting = true;
  if (isRecording) stopRecording();

  if (!genderInput.value) {
    alert("Please select a gender.");
    isSubmitting = false;
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = fromTimer ? "Time is up..." : "Checking...";

  try {
    const response = await fetch(`${API_BASE}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: studentName.value,
        studentAge: studentAge.value,
        gender: genderInput.value,
        mcqAnswers: collectMcqAnswers(),
        writingAnswer: writingAnswer.value,
        speakingTranscript: speakingTranscript.value,
        speakingDuration
      })
    });

    if (!response.ok) throw new Error("Could not submit test.");
    const result = await response.json();
    sessionStorage.setItem("englishTestResult", JSON.stringify(result));
    window.location.href = "result.html";
  } catch (error) {
    alert(error.message);
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "Submit Test";
  } finally {
    window.clearInterval(testTimerId);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitTest(false);
});

loadTest().catch((error) => {
  mcqContainer.innerHTML = `<p class="incorrect">${error.message} Start the backend server first.</p>`;
});

setupSpeechRecognition();
startTestTimer();
