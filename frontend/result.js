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
  // FIX: Guard against missing sections so corrupt/old data doesn't crash the page
  const sections = result.sections || {};
  const writing = sections.writing || { score: 0, max: 10, feedback: [] };
  const speaking = sections.speaking || { score: 0, max: 10, feedback: [] };
  const mcq = sections.mcq || { score: 0, max: 6 };

  const writingFeedback = (writing.feedback || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  const speakingFeedback = (speaking.feedback || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  // FIX: Show score breakdown cards (data was always there, never displayed)
  resultPanel.innerHTML = `
    <div class="result-top">
      <div>
        <p class="eyebrow">Result for ${escapeHtml(result.studentName)}</p>
        <h2>${escapeHtml(result.level)} Level</h2>
        <p>${escapeHtml(result.grade)} performance</p>
      </div>
      <div class="result-score">${escapeHtml(result.total)}/${escapeHtml(result.maxTotal)}</div>
    </div>

    <div class="breakdown">
      <div class="breakdown-card">
        <strong>Multiple Choice</strong>
        <div class="score">${escapeHtml(mcq.score)} / ${escapeHtml(mcq.max)}</div>
      </div>
      <div class="breakdown-card">
        <strong>Writing</strong>
        <div class="score">${escapeHtml(writing.score)} / ${escapeHtml(writing.max)}</div>
        ${writingFeedback ? `<ul class="feedback-list">${writingFeedback}</ul>` : ""}
      </div>
      <div class="breakdown-card">
        <strong>Speaking</strong>
        <div class="score">${escapeHtml(speaking.score)} / ${escapeHtml(speaking.max)}</div>
        ${speakingFeedback ? `<ul class="feedback-list">${speakingFeedback}</ul>` : ""}
      </div>
    </div>
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