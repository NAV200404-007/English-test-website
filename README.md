# English AI Test

A simple website for testing English skills with:

- 5 multiple-choice questions
- 1 short essay writing question
- 1 speaking question where the student records their voice while reading a paragraph
- 20-minute test timer
- marks, grade, and feedback on a separate result page after submission

## Project Structure

```text
english-ai-test/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── backend/
│   ├── server.js
│   ├── package.json
│   └── .env
└── README.md
```

## Run The Website

Open PowerShell and run:

```powershell
cd D:\english-ai-test\backend
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

When the student submits, or when the 20-minute timer ends, the website redirects to:

```text
http://localhost:3000/result.html
```

## View Stored Student Submissions

Open:

```text
http://localhost:3000/admin.html
```

This page shows the latest saved submissions with student name, section marks, total marks, and level.

## Database Setup

The backend supports MongoDB. In `D:\english-ai-test\backend\.env`, add your MongoDB connection string:

```env
PORT=3000
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR_CLUSTER.mongodb.net/
MONGODB_DB=english_ai_test
```

Then restart the server:

```powershell
cd D:\english-ai-test\backend
npm.cmd start
```

If `MONGODB_URI` is empty, submissions are saved locally at:

```text
D:\english-ai-test\backend\data\submissions.json
```

## How Marking Works

- MCQ: exact answer checking, 5 marks total.
- Writing: scored out of 10 using word count, reasons, examples, and sentence basics.
- Speaking: scored out of 10 by comparing the recognized speech transcript with the paragraph, completion, and speaking pace.

## Student Levels

- Advanced: 80% and above
- Intermediate: 50% to 79%
- Basic: below 50%

The app does not require an external AI API key. Voice recognition uses the browser microphone feature, so use Chrome or Edge for the recording section.
