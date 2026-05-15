const submissionsTable = document.querySelector("#submissionsTable");
const exportCsvButton = document.querySelector("#exportCsvButton");

let loadedSubmissions = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sectionScore(section) {
  if (!section) return "";

  return `${section.score ?? ""}/${section.max ?? ""}`;
}

function feedbackText(section) {
  const feedback = section?.feedback;

  if (Array.isArray(feedback)) {
    return feedback.join(" ");
  }

  return feedback || "";
}

function csvValue(value) {
  const text = String(value ?? "");

  return `"${text.replaceAll('"', '""')}"`;
}

function submissionToCsvRow(submission) {
  const result = submission.result || submission;
  const student = submission.student || {};
  const answers = submission.answers || {};
  const sections = result.sections || {};
  const audioUrl =
    submission.speakingAudio?.audioUrl ||
    answers.speakingAudio?.audioUrl ||
    "";
  const fullAudioUrl =
    audioUrl && audioUrl.startsWith("/")
      ? `${window.location.origin}${audioUrl}`
      : audioUrl;

  return [
    submission.createdAt || "",
    student.name || result.studentName || "",
    student.email || result.studentEmail || submission.studentEmail || "",
    student.age ?? result.studentAge ?? "",
    student.gender || result.gender || "",
    sectionScore(sections.mcq),
    sectionScore(sections.writing),
    sectionScore(sections.speaking),
    result.total ?? "",
    result.maxTotal ?? "",
    result.percentage ?? "",
    result.level || "",
    result.grade || "",
    sections.writing?.words ?? "",
    sections.speaking?.wordsSpoken ?? "",
    sections.speaking?.wordsPerMinute ?? "",
    sections.speaking?.accuracy ?? "",
    feedbackText(sections.writing),
    feedbackText(sections.speaking),
    answers.writing || "",
    answers.speakingTranscript || "",
    fullAudioUrl,
    JSON.stringify(answers.mcq || {})
  ].map(csvValue);
}

function downloadCsv(submissions) {
  const headers = [
    "Date",
    "Student",
    "Email",
    "Age",
    "Gender",
    "MCQ Score",
    "Writing Score",
    "Speaking Score",
    "Total",
    "Max Total",
    "Percentage",
    "Level",
    "Grade",
    "Writing Words",
    "Speaking Words",
    "Speaking WPM",
    "Speaking Accuracy",
    "Writing Feedback",
    "Speaking Feedback",
    "Writing Answer",
    "Speaking Transcript",
    "Audio URL",
    "MCQ Answers"
  ];

  const csv = [
    headers.map(csvValue).join(","),
    ...submissions.map((submission) =>
      submissionToCsvRow(submission).join(",")
    )
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `english-test-submissions-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderSubmissions(submissions) {
  loadedSubmissions = submissions;
  exportCsvButton.disabled = submissions.length === 0;

  if (!submissions.length) {
    submissionsTable.textContent = "No submissions have been saved yet.";
    return;
  }

  const rows = submissions
    .map((submission) => {
      const result = submission.result || submission;
      const student = submission.student || {};
      const sections = result.sections || {};
      const audioUrl =
        submission.speakingAudio?.audioUrl ||
        submission.answers?.speakingAudio?.audioUrl ||
        "";
      const audioCell = audioUrl
        ? `<audio controls preload="none" src="${escapeHtml(audioUrl)}"></audio>`
        : "No audio";
      return `
        <tr>
          <td>${escapeHtml(submission.createdAt || "")}</td>
          <td>${escapeHtml(student.name || result.studentName)}</td>
          <td>${escapeHtml(student.email || result.studentEmail || submission.studentEmail || "")}</td>
          <td>${escapeHtml(student.age ?? result.studentAge ?? "")}</td>
          <td>${escapeHtml(student.gender || result.gender || "")}</td>
          <td>${escapeHtml(sectionScore(sections.mcq))}</td>
          <td>${escapeHtml(sectionScore(sections.writing))}</td>
          <td>${escapeHtml(sectionScore(sections.speaking))}</td>
          <td>${audioCell}</td>
          <td>${escapeHtml(result.total)}/${escapeHtml(result.maxTotal)}</td>
          <td>${escapeHtml(result.level)}</td>
        </tr>
      `;
    })
    .join("");

  submissionsTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Student</th>
          <th>Email</th>
          <th>Age</th>
          <th>Gender</th>
          <th>MCQ</th>
          <th>Writing</th>
          <th>Speaking</th>
          <th>Audio</th>
          <th>Total</th>
          <th>Level</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

exportCsvButton.addEventListener("click", () => {
  downloadCsv(loadedSubmissions);
});

fetch("/api/submissions")
  .then((response) => {
    if (!response.ok) throw new Error("Could not load submissions.");
    return response.json();
  })
  .then(renderSubmissions)
  .catch((error) => {
    submissionsTable.innerHTML = `<p class="incorrect">${error.message}</p>`;
  });
