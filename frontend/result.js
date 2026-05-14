const RESULT_STORAGE_KEY = "englishTestResult";  // FIX: use constant, not raw string

const resultPanel = document.querySelector("#resultPanel");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMissingResult() {
  resultPanel.innerHTML = `
    <div class="result-top">
      <div>
        <p class="eyebrow">No Result Found</p>
        <h2>Please complete the test first.</h2>
      </div>
    </div>
  `;
}

function renderResults(result) {
  const sections = result.sections || {};
  const writing = sections.writing || { score: 0, max: 10, feedback: [] };
  const speaking = sections.speaking || { score: 0, max: 10, feedback: [] };

  const writingFeedback = (writing.feedback || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  const speakingFeedback = (speaking.feedback || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  resultPanel.innerHTML = `
    <div class="result-top">
      <div>
        <p class="eyebrow">Result for ${escapeHtml(result.studentName)}</p>
        <h2>${escapeHtml(result.level)} Level</h2>
        <p>${escapeHtml(result.grade)} performance</p>
      </div>
      <div class="result-score">${escapeHtml(result.total)}/${escapeHtml(result.maxTotal)}</div>
    </div>

    <h2 class="feedback-heading">Feedback</h2>
    <ul class="feedback">
      ${writingFeedback}
      ${speakingFeedback}
    </ul>
  `;
}

const storedResult = sessionStorage.getItem(RESULT_STORAGE_KEY);

if (storedResult) {
  try {
    renderResults(JSON.parse(storedResult));
  } catch {
    // FIX: Corrupt JSON in sessionStorage no longer crashes — show friendly message
    renderMissingResult();
  }
} else {
  renderMissingResult();
}
