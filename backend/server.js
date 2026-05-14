const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { MongoClient } = require("mongodb");

require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const MONGODB_URI = process.env.MONGODB_URI;

const MONGODB_DB =
  process.env.MONGODB_DB || "english_ai_test";

const LOCAL_DATA_FILE = path.join(
  __dirname,
  "data",
  "submissions.json"
);

let mongoClient;

let databaseReady = false;

app.use(cors());

app.use(express.json({ limit: "1mb" }));

app.use(
  express.static(
    path.join(__dirname, "../frontend")
  )
);

async function getSubmissionsCollection() {
  if (!MONGODB_URI) return null;

  if (!mongoClient) {
    mongoClient = new MongoClient(
      MONGODB_URI,
      {
        serverSelectionTimeoutMS: 5000
      }
    );

    await mongoClient.connect();
  }

  const collection = mongoClient
    .db(MONGODB_DB)
    .collection("submissions");

  if (!databaseReady) {
    await collection.createIndex({
      createdAt: -1
    });

    await collection.createIndex({
      "student.name": 1
    });

    await collection.createIndex({
      "result.level": 1
    });

    await collection.updateMany(
      { student: { $exists: false } },
      [
        {
          $set: {
            schemaVersion: 2,

            student: {
              name: {
                $ifNull: [
                  "$studentName",
                  "$result.studentName"
                ]
              },

              age: {
                $ifNull: [
                  "$result.studentAge",
                  null
                ]
              },

              gender: {
                $ifNull: [
                  "$result.gender",
                  ""
                ]
              }
            }
          }
        }
      ]
    );

    databaseReady = true;
  }

  return collection;
}

async function readLocalSubmissions() {
  try {
    const content = await fs.readFile(
      LOCAL_DATA_FILE,
      "utf8"
    );

    return JSON.parse(content);

  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function saveSubmission(submission) {
  const record = {
    ...submission,
    createdAt: new Date().toISOString()
  };

  const collection =
    await getSubmissionsCollection();

  if (collection) {
    const result =
      await collection.insertOne(record);

    return {
      ...record,
      id: result.insertedId.toString(),
      storage: "mongodb"
    };
  }

  await fs.mkdir(
    path.dirname(LOCAL_DATA_FILE),
    { recursive: true }
  );

  const submissions =
    await readLocalSubmissions();

  const localRecord = {
    ...record,
    id: crypto.randomUUID(),
    storage: "local-json"
  };

  submissions.push(localRecord);

  await fs.writeFile(
    LOCAL_DATA_FILE,
    JSON.stringify(submissions, null, 2)
  );

  return localRecord;
}

async function listSubmissions() {
  const collection =
    await getSubmissionsCollection();

  if (collection) {
    const submissions =
      await collection
        .find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();

    return submissions.map((submission) => ({
      ...submission,
      id: submission._id?.toString()
    }));
  }

  const submissions =
    await readLocalSubmissions();

  return submissions
    .reverse()
    .slice(0, 100);
}

const questions = {
  mcq: [
    {
      id: "mcq1",
      question:
        "Choose the sentence with correct grammar.",

      options: [
        "1. She go to school every day.",
        "2. She goes to school every day.",
        "3. She going to school every day.",
        "4. She gone to school every day."
      ],

      answer: 1
    },

    {
      id: "mcq2",

      question:
        "Which word is closest in meaning to 'brief'?",

      options: [
        "1. Long",
        "2. Short",
        "3. Difficult",
        "4. Careless"
      ],

      answer: 1
    }
  ],

  speaking: {
    passage:
      "Maya joined the community library as a volunteer because she wanted younger students to enjoy reading. At first, only a few children came to her Saturday story sessions. Instead of giving up, Maya asked the children what kinds of stories they liked. She added mystery books, adventure stories, and short plays. Within a month, the room was full every Saturday, and several children began borrowing books to read at home.",

    instruction:
      "Press record and read the paragraph aloud as clearly as you can."
  },

  writing: {
    prompt:
      "Write a short essay about why learning English is useful. Include at least two reasons and one example (minimum 50 words)."
  }
};

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function uniqueKeywordHits(
  text,
  keywords
) {
  const lower = String(text || "")
    .toLowerCase();

  return keywords.filter((word) =>
    lower.includes(word)
  ).length;
}

function normalizeWords(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreWriting(text) {
  const answer =
    String(text || "").trim();

  const words = countWords(answer);

  const sentences = answer
    .split(/[.!?]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const lower = answer.toLowerCase();

  let score = 0;

  const feedback = [];

  if (words >= 80) score += 4;
  else if (words >= 50) score += 3;
  else if (words >= 30) score += 2;
  else if (words >= 15) score += 1;
  else {
    feedback.push(
      "Write more detail. Aim for at least 50 words."
    );
  }

  const reasonWords = [
    "because",
    "reason",
    "first",
    "second",
    "also",
    "another",
    "important",
    "useful"
  ];

  const reasonHits =
    uniqueKeywordHits(
      lower,
      reasonWords
    );

  if (reasonHits >= 3) score += 3;
  else if (reasonHits >= 1) score += 2;
  else {
    feedback.push(
      "Include clear reasons for your opinion."
    );
  }

  const exampleWords = [
    "example",
    "for instance",
    "such as",
    "school",
    "work",
    "travel",
    "communication",
    "internet"
  ];

  const exampleHits =
    uniqueKeywordHits(
      lower,
      exampleWords
    );

  if (exampleHits >= 2) score += 2;
  else if (exampleHits === 1) score += 1;
  else {
    feedback.push(
      "Add a real example to support your answer."
    );
  }

  if (
    sentences.length >= 4 &&
    /^[A-Z]/.test(answer) &&
    /[.!?]$/.test(answer)
  ) {
    score += 1;
  } else {
    feedback.push(
      "Use complete sentences with correct capitalization and punctuation."
    );
  }

  return {
    score: Math.min(score, 10),
    max: 10,
    words,

    feedback: feedback.length
      ? feedback
      : [
          "Strong response with enough detail, reasons, and an example."
        ]
  };
}

function scoreSpeaking(
  transcript,
  durationSeconds = 0
) {
  const cleanTranscript =
    String(transcript || "").trim();

  const cleanDuration =
    Number(durationSeconds) || 0;

  if (
    !cleanTranscript ||
    cleanDuration < 3
  ) {
    return {
      score: 0,
      max: 10,

      transcript: cleanTranscript,

      wordsSpoken:
        countWords(cleanTranscript),

      wordsPerMinute: 0,

      accuracy: 0,

      feedback: [
        "No valid voice recording was submitted. Press record, read the paragraph aloud, then stop recording."
      ]
    };
  }

  const expectedWords =
    normalizeWords(
      questions.speaking.passage
    );

  const spokenWords =
    normalizeWords(cleanTranscript);

  const expectedSet =
    new Set(expectedWords);

  const spokenSet =
    new Set(spokenWords);

  const matchedWords =
    [...expectedSet].filter((word) =>
      spokenSet.has(word)
    ).length;

  const accuracy =
    expectedSet.size
      ? matchedWords / expectedSet.size
      : 0;

  const completion =
    expectedWords.length
      ? Math.min(
          spokenWords.length /
            expectedWords.length,
          1
        )
      : 0;

  const wordsPerMinute =
    cleanDuration > 0
      ? Math.round(
          (spokenWords.length /
            cleanDuration) *
            60
        )
      : 0;

  const paceScore =
    wordsPerMinute >= 85 &&
    wordsPerMinute <= 170
      ? 1
      : wordsPerMinute >= 60 &&
          wordsPerMinute <= 200
        ? 0.7
        : 0.35;

  const score = Math.round(
    (
      accuracy * 0.6 +
      completion * 0.25 +
      paceScore * 0.15
    ) * 10
  );

  const feedback = [];

  if (accuracy < 0.7) {
    feedback.push(
      "Pronunciation or clarity needs practice. Many words were not recognized correctly."
    );
  }

  if (completion < 0.75) {
    feedback.push(
      "Try to read the full paragraph before submitting."
    );
  }

  if (
    wordsPerMinute &&
    (
      wordsPerMinute < 60 ||
      wordsPerMinute > 200
    )
  ) {
    feedback.push(
      "Work on a steady speaking pace."
    );
  }

  if (!spokenWords.length) {
    feedback.push(
      "No speech was detected. Check microphone permission and record again."
    );
  }

  return {
    score,
    max: 10,

    transcript: cleanTranscript,

    wordsSpoken:
      spokenWords.length,

    wordsPerMinute,

    accuracy: Math.round(
      accuracy * 100
    ),

    feedback: feedback.length
      ? feedback
      : [
          "Clear reading with good coverage of the paragraph and a steady pace."
        ]
  };
}

function getStudentLevel(
  percentage
) {
  if (percentage >= 80)
    return "Advanced";

  if (percentage >= 50)
    return "Intermediate";

  return "Basic";
}

function cleanStudentProfile({
  studentName = "",
  studentAge = "",
  gender = ""
}) {
  const age = Number(studentAge);

  const normalizedGender =
    String(gender || "").trim();

  return {
    name:
      String(studentName || "Student")
        .trim() || "Student",

    age:
      Number.isInteger(age) &&
      age > 0 &&
      age <= 120
        ? age
        : null,

    gender: ["Male", "Female"].includes(
      normalizedGender
    )
      ? normalizedGender
      : ""
  };
}

app.get("/api/test", (req, res) => {
  res.json(questions);
});

app.get(
  "/api/submissions",
  async (req, res) => {
    try {
      const submissions =
        await listSubmissions();

      res.json(submissions);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Could not retrieve submissions."
      });
    }
  }
);

app.post(
  "/api/submit",
  async (req, res) => {
    const {
      mcqAnswers = {},
      writingAnswer = "",
      speakingTranscript = "",
      speakingDuration = 0,
      studentName = "",
      studentAge = "",
      gender = ""
    } = req.body;

    const student =
      cleanStudentProfile({
        studentName,
        studentAge,
        gender
      });

    let mcqScore = 0;

    const mcqResults =
      questions.mcq.map(
        (question) => {
          const selected = Number(
            mcqAnswers[question.id]
          );

          const correct =
            selected === question.answer;

          if (correct) {
            mcqScore += 1;
          }

          return {
            id: question.id,
            question:
              question.question,

            selected,

            correctAnswer:
              question.answer,

            correct
          };
        }
      );

    const mcqMax =
      questions.mcq.length;

    const writing =
      scoreWriting(writingAnswer);

    const speaking =
      scoreSpeaking(
        speakingTranscript,
        Number(speakingDuration)
      );

    const total =
      mcqScore +
      writing.score +
      speaking.score;

    const maxTotal =
      mcqMax +
      writing.max +
      speaking.max;

    const percentage =
      Math.round(
        (total / maxTotal) * 100
      );

    const level =
      getStudentLevel(percentage);

    const response = {
      studentName: student.name,
      studentAge: student.age,
      gender: student.gender,

      total,
      maxTotal,
      percentage,
      level,

      grade:
        percentage >= 85
          ? "Excellent"
          : percentage >= 70
            ? "Good"
            : percentage >= 50
              ? "Pass"
              : "Needs Practice",

      sections: {
        mcq: {
          score: mcqScore,
          max: mcqMax,
          results: mcqResults
        },

        writing,

        speaking
      }
    };

    try {
      const saved =
        await saveSubmission({
          schemaVersion: 2,

          student,

          studentName:
            response.studentName,

          answers: {
            mcq: mcqAnswers,

            writing:
              writingAnswer,

            speakingTranscript,

            speakingDuration:
              Number(
                speakingDuration
              )
          },

          result: response
        });

      res.json({
        ...response,

        submissionId:
          saved.id,

        storage:
          saved.storage
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Could not save submission."
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(
    `English AI Test running at http://localhost:${PORT}`
  );
});
