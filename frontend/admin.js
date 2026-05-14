const submissionsTable = document.querySelector("#submissionsTable");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSubmissions(submissions) {
  if (!submissions.length) {
    submissionsTable.textContent = "No submissions have been saved yet.";
    return;
  }

  const rows = submissions
    .map((submission) => {
      const result = submission.result || submission;
      const student = submission.student || {};
      const sections = result.sections;
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
          <td>${escapeHtml(student.age ?? result.studentAge ?? "")}</td>
          <td>${escapeHtml(student.gender || result.gender || "")}</td>
          <td>${escapeHtml(sections.mcq.score)}/${escapeHtml(sections.mcq.max)}</td>
          <td>${escapeHtml(sections.writing.score)}/${escapeHtml(sections.writing.max)}</td>
          <td>${escapeHtml(sections.speaking.score)}/${escapeHtml(sections.speaking.max)}</td>
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

fetch("/api/submissions")
  .then((response) => {
    if (!response.ok) throw new Error("Could not load submissions.");
    return response.json();
  })
  .then(renderSubmissions)
  .catch((error) => {
    submissionsTable.innerHTML = `<p class="incorrect">${error.message}</p>`;
  });
