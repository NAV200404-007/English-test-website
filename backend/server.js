const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const multer = require("multer");
const { MongoClient } = require("mongodb");

require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME =
  process.env.ADMIN_USERNAME || "teacher";
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "password";

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
let mongoUnavailable = false;
const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  path.join(__dirname, "uploads");
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, UPLOAD_DIR);
    },
    filename(req, file, cb) {
      const extension =
        path.extname(file.originalname) || ".webm";
      cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
    }
  }),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

app.use(cors());

app.use(express.json({ limit: "1mb" }));

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    const [username, password] = Buffer.from(
      encoded,
      "base64"
    )
      .toString("utf8")
      .split(":");

    if (
      username === ADMIN_USERNAME &&
      password === ADMIN_PASSWORD
    ) {
      return next();
    }
  }

  res.set(
    "WWW-Authenticate",
    'Basic realm="Teacher Access"'
  );
  return res.status(401).send("Teacher access required.");
}

app.get("/admin.html", requireAdmin, (req, res) => {
  res.sendFile(
    path.join(__dirname, "../frontend/admin.html")
  );
});

app.use(
  express.static(
    path.join(__dirname, "../frontend")
  )
);

app.use(
  "/uploads",
  requireAdmin,
  express.static(UPLOAD_DIR)
);

async function getSubmissionsCollection() {
  if (!MONGODB_URI || mongoUnavailable) return null;

  try {
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
  } catch (error) {
    mongoUnavailable = true;
    console.warn(
      "MongoDB unavailable. Falling back to local JSON storage:",
      error.message
    );
    return null;
  }
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
    },

    {
      id: "mcq3",
      question: "Select the correct punctuation.",
      options: [
        "1. Although it was raining we played outside.",
        "2. Although it was raining, we played outside.",
        "3. Although, it was raining we played outside.",
        "4. Although it was raining we, played outside."
      ],
      answer: 1
    },

    {
      id: "mcq4",
      question:
        "Choose the correct form: 'By next year, I _____ English for five years.'",
      options: [
        "1. study",
        "2. studied",
        "3. will have studied",
        "4. am studying"
      ],
      answer: 2
    },

    {
      id: "mcq5",
      question:
        "Which sentence uses an adjective correctly?",
      options: [
        "1. The quick runner finished first.",
        "2. The runner quick finished first.",
        "3. The runner finished quick first.",
        "4. The runner first quick finished."
      ],
      answer: 0
    },

    {
      id: "mcq6",
      question: "Which sentence is correct?",
      options: [
        "1. Neither of the boys are late.",
        "2. Neither of the boys were late.",
        "3. Neither of the boys is late.",
        "4. Neither of the boys have been late."
      ],
      answer: 2
    },

    {
      id: "mcq7",
      question: "Which word is a noun?",
      options: [
        "1. Quickly",
        "2. Beautiful",
        "3. Happiness",
        "4. Softly"
      ],
      answer: 2
    },

    {
      id: "mcq8",
      question:
        "Fill in the blank: They ______ football yesterday.",
      options: [
        "1. play",
        "2. played",
        "3. playing",
        "4. plays"
      ],
      answer: 1
    },

    {
      id: "mcq9",
      question: "Choose the correct punctuation.",
      options: [
        "1. Wow that is amazing!",
        "2. Wow, that is amazing!",
        "3. Wow that, is amazing!",
        "4. Wow that is, amazing!"
      ],
      answer: 1
    },

    {
      id: "mcq10",
      question:
        "Identify the adjective in the sentence: \"The tall boy won the race.\"",
      options: [
        "1. boy",
        "2. won",
        "3. tall",
        "4. race"
      ],
      answer: 2
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
      "Write a short essay about why learning English is useful. Include at least two clear reasons, one specific example, and a conclusion (minimum 80 words)."
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

  if (words >= 120) score += 2;
  else if (words >= 90) score += 1.5;
  else if (words >= 80) score += 1;
  else {
    feedback.push(
      "Write more detail. The essay must be at least 80 words."
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
    "useful",
    "helps",
    "improves"
  ];

  const reasonHits =
    uniqueKeywordHits(
      lower,
      reasonWords
    );

  if (reasonHits >= 4) score += 2;
  else if (reasonHits >= 2) score += 1;
  else {
    feedback.push(
      "Include at least two clear reasons for your opinion."
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
    "internet",
    "job",
    "career",
    "university"
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
      "Add one specific example, not only a general statement."
    );
  }

  const hasConclusion =
    /\b(in conclusion|to conclude|overall|therefore|finally)\b/.test(lower);
  const paragraphCount =
    answer.split(/\n\s*\n|\r\n\s*\r\n/).filter((part) => part.trim()).length;

  if (
    sentences.length >= 5 &&
    paragraphCount >= 2 &&
    hasConclusion
  ) {
    score += 2;
  } else {
    feedback.push(
      "Use essay structure: at least two paragraphs, five sentences, and a clear conclusion."
    );
  }

  const startsWithCapital = /^[A-Z]/.test(answer);
  const endsWithPunctuation = /[.!?]$/.test(answer);
  const sentenceStarts = sentences.filter((sentence) =>
    /^[A-Z]/.test(sentence)
  ).length;
  const sentenceCapitalRatio =
    sentences.length ? sentenceStarts / sentences.length : 0;
  const averageSentenceLength =
    sentences.length ? words / sentences.length : 0;

  if (
    startsWithCapital &&
    endsWithPunctuation &&
    sentenceCapitalRatio >= 0.8 &&
    averageSentenceLength >= 8 &&
    averageSentenceLength <= 28
  ) {
    score += 2;
  } else {
    feedback.push(
      "Check grammar basics: capitalization, punctuation, and complete sentence length."
    );
  }

  return {
    score: Math.min(Math.round(score), 10),
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
  durationSeconds = 0,
  voiceMetrics = {}
) {
  const cleanTranscript =
    String(transcript || "").trim();

  const cleanDuration =
    Number(durationSeconds) || 0;
  const voiceSeconds =
    Number(voiceMetrics.voiceSeconds) || 0;
  const averageVolume =
    Number(voiceMetrics.averageVolume) || 0;
  const peakVolume =
    Number(voiceMetrics.peakVolume) || 0;
  const silenceRatio =
    Number(voiceMetrics.silenceRatio) || 1;
  const audioBytes =
    Number(voiceMetrics.audioBytes) || 0;
  const hasVoiceActivity =
    cleanDuration >= 5 &&
    (
      audioBytes >= 1500 ||
      (
        voiceSeconds >= 1.5 &&
        averageVolume > 0.004 &&
        peakVolume > 0.012
      )
    );

  if (
    !cleanTranscript ||
    cleanDuration < 3
  ) {
    if (hasVoiceActivity) {
      let fallbackScore = 3;
      const feedback = [
        "Speech was detected, but the browser could not create a transcript. Use Chrome or Edge and speak clearly near the microphone for a more accurate pronunciation score."
      ];

      if (cleanDuration >= 45 || voiceSeconds >= 20) fallbackScore += 2;
      else if (cleanDuration >= 20 || voiceSeconds >= 8) fallbackScore += 1;

      if (silenceRatio <= 0.7) fallbackScore += 1;
      else {
        feedback.push(
          "There were long silent gaps. Try to read continuously."
        );
      }

      return {
        score: Math.min(fallbackScore, 6),
        max: 10,
        transcript: cleanTranscript,
        wordsSpoken: 0,
        wordsPerMinute: 0,
        accuracy: 0,
        audioBytes,
        voiceSeconds: Math.round(voiceSeconds),
        averageVolume: Number(averageVolume.toFixed(3)),
        silenceRatio: Number(silenceRatio.toFixed(2)),
        feedback
      };
    }

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

    voiceSeconds: Math.round(voiceSeconds),
    averageVolume: Number(averageVolume.toFixed(3)),
    silenceRatio: Number(silenceRatio.toFixed(2)),

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
  requireAdmin,
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
  "/api/audio",
  async (req, res, next) => {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    next();
  },
  upload.single("audio"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "No audio file uploaded."
      });
    }

    res.json({
      audioUrl: `/uploads/${req.file.filename}`,
      audioFilename: req.file.filename,
      audioSize: req.file.size
    });
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
      speakingMetrics = {},
      speakingAudio = null,
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
        Number(speakingDuration),
        speakingMetrics
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
              ),

            speakingMetrics,

            speakingAudio
          },

          speakingAudio,
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
