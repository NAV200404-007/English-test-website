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
  (process.env.VERCEL ? "/tmp/uploads" : null) ||
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

const MCQ_MARKS_PER_QUESTION = 3;
const WRITING_MAX_MARKS = 25;
const SPEAKING_MAX_MARKS = 30;

const questions = {
  mcq: [
    {
      id: "mcq1",
      //level: "Basic",
      question: "Choose the correct sentence.",

      options: [
        "A) She go to school every day.",
        "B) She goes to school every day.",
        "C) She going to school every day.",
        "D) She gone to school every day."
      ],

      answer: 1
    },

    {
      id: "mcq2",
      //level: "Basic",
      question: "Which word is a noun?",

      options: [
        "A) Quickly",
        "B) Beautiful",
        "C) Teacher",
        "D) Run"
      ],

      answer: 2
    },

    {
      id: "mcq3",
      //level: "Basic",
      question: "Fill in the blank: I ___ a football yesterday.",
      options: [
        "A) buy",
        "B) bought",
        "C) buying",
        "D) buys"
      ],
      answer: 1
    },

    {
      id: "mcq4",
      //level: "Basic",
      question: "Choose the correct spelling.",
      options: [
        "A) Frend",
        "B) Frind",
        "C) Friend",
        "D) Freind"
      ],
      answer: 2
    },

    {
      id: "mcq5",
      //level: "Basic",
      question: "What is the opposite of \"hot\"?",
      options: [
        "A) Warm",
        "B) Cold",
        "C) Boiling",
        "D) Dry"
      ],
      answer: 1
    },

    {
      id: "mcq6",
      //level: "Intermediate",
      question: "Which sentence is correct?",
      options: [
        "A) Neither of the boys were late.",
        "B) Neither of the boys was late.",
        "C) Neither of the boys are late.",
        "D) Neither of the boys have been late."
      ],
      answer: 1
    },

    {
      id: "mcq7",
      //level: "Intermediate",
      question:
        "Fill in the blank: If I ___ more time, I would learn Spanish.",
      options: [
        "A) have",
        "B) had",
        "C) has",
        "D) having"
      ],
      answer: 1
    },

    {
      id: "mcq8",
      //level: "Intermediate",
      question:
        "Identify the adjective in the sentence: \"The tall building overlooks the city.\"",
      options: [
        "A) Building",
        "B) Overlooks",
        "C) Tall",
        "D) City"
      ],
      answer: 2
    },

    {
      id: "mcq9",
      //level: "Intermediate",
      question:
        "Choose the sentence with correct punctuation.",
      options: [
        "A) Lets eat grandma!",
        "B) Let's eat grandma!",
        "C) Let's eat, grandma!",
        "D) Lets eat, grandma!"
      ],
      answer: 2
    },

    {
      id: "mcq10",
      //level: "Intermediate",
      question:
        "What does the idiom \"break the ice\" mean?",
      options: [
        "A) To destroy something",
        "B) To start a conversation comfortably",
        "C) To feel cold",
        "D) To get angry"
      ],
      answer: 1
    },

    {
      id: "mcq11",
      //level: "Hard",
      question:
        "Choose the grammatically correct sentence.",
      options: [
        "A) Had I knew, I would have helped.",
        "B) Had I known, I would have helped.",
        "C) Had I know, I would have helped.",
        "D) Had I knowing, I would have helped."
      ],
      answer: 1
    },

    {
      id: "mcq12",
      //level: "Hard",
      question:
        "Which sentence uses the passive voice?",
      options: [
        "A) The chef cooked the meal.",
        "B) The meal was cooked by the chef.",
        "C) The chef is cooking the meal.",
        "D) The chef cooks daily."
      ],
      answer: 1
    },

    {
      id: "mcq13",
      //level: "Hard",
      question:
        "Fill in the blank with the correct word: The manager insisted ___ reviewing the report again.",
      options: [
        "A) in",
        "B) at",
        "C) on",
        "D) for"
      ],
      answer: 2
    },

    {
      id: "mcq14",
      //level: "Hard",
      question:
        "What is the meaning of the word \"meticulous\"?",
      options: [
        "A) Careless",
        "B) Extremely careful and detailed",
        "C) Angry",
        "D) Confused"
      ],
      answer: 1
    },

    {
      id: "mcq15",
      //level: "Hard",
      question:
        "Identify the sentence with correct subject-verb agreement.",
      options: [
        "A) The list of items are on the table.",
        "B) The list of items were on the table.",
        "C) The list of items is on the table.",
        "D) The list of items have been on the table."
      ],
      answer: 2
    }
  ],

  speaking: {
  passage: [
    "I HAVE A DREAM",
    "THAT ONE DAY THIS NATION WILL RISE UP",
    "AND LIVE OUT THE TRUE MEANING OF ITS CREED",
    "WE HOLD THESE TRUTHS TO BE SELF-EVIDENT",
    "THAT ALL MEN ARE CREATED EQUAL.",
    "I HAVE A DREAM TODAY.",
    "A DREAM OF FREEDOM, JUSTICE, AND UNITY",
    "WHERE PEOPLE WILL NOT BE JUDGED BY THEIR DIFFERENCES",
    "BUT BY THEIR CHARACTER AND HUMANITY.",
  ],

  instruction:
    "Press record and read the passage aloud as clearly and confidently as you can."
},

  writing: {
    prompt:
      "How can effective public speaking skills help a person become a better leader? Use real-life examples to support your answer. (MINIMUM 50 WORDS)"
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
  const value = Array.isArray(text)
    ? text.join(" ")
    : String(text || "");

  return value
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

  if (words >= 180) score += 3;
  else if (words >= 140) score += 2.5;
  else if (words >= 110) score += 2;
  else if (words >= 80) score += 1;
  else if (words >= 50) score += 0.5;
  else {
    feedback.push(
      "Write more detail. Section B requires at least 50 words, with stronger answers around 110 to 180 words."
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
    "helps",
    "improves",
    "confidence",
    "influence",
    "motivate",
    "trust",
    "team",
    "leader",
    "leadership"
  ];

  const reasonHits =
    uniqueKeywordHits(
      lower,
      reasonWords
    );

  if (reasonHits >= 6) score += 5;
  else if (reasonHits >= 4) score += 4;
  else if (reasonHits >= 2) score += 2;
  else {
    feedback.push(
      "Explain clearly how public speaking helps leadership, such as building confidence, trust, influence, and teamwork."
    );
  }

  const exampleWords = [
    "example",
    "for instance",
    "such as",
    "school",
    "work",
    "speech",
    "presentation",
    "meeting",
    "project",
    "campaign",
    "captain",
    "prefect",
    "manager",
    "teacher",
    "job",
    "career"
  ];

  const exampleHits =
    uniqueKeywordHits(
      lower,
      exampleWords
    );

  if (exampleHits >= 3) score += 5;
  else if (exampleHits >= 2) score += 3;
  else if (exampleHits === 1) score += 1;
  else {
    feedback.push(
      "Add real-life examples, such as a school presentation, team project, meeting, campaign, or workplace situation."
    );
  }

  const promptFocusHits =
    uniqueKeywordHits(lower, [
      "public speaking",
      "speaking",
      "communicate",
      "communication",
      "leader",
      "leadership",
      "audience",
      "message",
      "listen",
      "persuade",
      "inspire"
    ]);

  if (promptFocusHits >= 5) score += 4;
  else if (promptFocusHits >= 3) score += 2.5;
  else if (promptFocusHits >= 1) score += 1;
  else {
    feedback.push(
      "Stay focused on the question: connect public speaking directly to becoming a better leader."
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
    score += 4;
  } else if (
    sentences.length >= 4 &&
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
    score += 4;
  } else if (
    startsWithCapital &&
    endsWithPunctuation &&
    sentenceCapitalRatio >= 0.6
  ) {
    score += 2;
  } else {
    feedback.push(
      "Check grammar basics: capitalization, punctuation, and complete sentence length."
    );
  }

  return {
    score: Math.min(Math.round(score), WRITING_MAX_MARKS),
    max: WRITING_MAX_MARKS,
    words,

    feedback: feedback.length
      ? feedback
      : [
          "Strong response with clear leadership focus, real-life examples, structure, and language control."
        ]
  };
}

function analyzeWritingIntegrity(
  text,
  metrics = {}
) {
  const words = countWords(text);
  const elapsedSeconds =
    Number(metrics.elapsedSeconds) || 0;
  const keystrokes =
    Number(metrics.keystrokes) || 0;
  const pasteAttempts =
    Number(metrics.pasteAttempts) || 0;
  const maxTextJump =
    Number(metrics.maxTextJump) || 0;
  const inputEvents =
    Number(metrics.inputEvents) || 0;
  const backspaces =
    Number(metrics.backspaces) || 0;
  const wordsPerMinute =
    elapsedSeconds > 0
      ? Math.round((words / elapsedSeconds) * 60)
      : Number(metrics.wordsPerMinute) || 0;

  let riskScore = 0;
  const reasons = [];

  if (pasteAttempts > 0) {
    riskScore += 3;
    reasons.push(
      "Paste or drag-and-drop attempt was blocked in the essay field."
    );
  }

  if (words >= 80 && elapsedSeconds > 0 && elapsedSeconds < 180) {
    riskScore += 2;
    reasons.push(
      "Essay was completed unusually quickly for its length."
    );
  }

  if (wordsPerMinute > 65 && words >= 80) {
    riskScore += 2;
    reasons.push(
      "Essay typing speed was unusually high."
    );
  }

  if (maxTextJump > 80) {
    riskScore += 2;
    reasons.push(
      "A large amount of essay text appeared in one input event."
    );
  }

  if (words >= 100 && keystrokes < words * 3) {
    riskScore += 2;
    reasons.push(
      "The essay has many words compared with the number of recorded keystrokes."
    );
  }

  if (
    words >= 120 &&
    backspaces <= 1 &&
    inputEvents <= words / 2
  ) {
    riskScore += 1;
    reasons.push(
      "Very little editing behavior was recorded for a long essay."
    );
  }

  const risk =
    riskScore >= 5
      ? "High"
      : riskScore >= 3
        ? "Medium"
        : "Low";

  return {
    risk,
    riskScore,
    reasons,
    metrics: {
      elapsedSeconds,
      keystrokes,
      backspaces,
      pasteAttempts,
      blockedPasteCharacters:
        Number(metrics.blockedPasteCharacters) || 0,
      inputEvents,
      maxTextJump,
      words,
      wordsPerMinute
    }
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
      let fallbackScore = 9;
      const feedback = [
        "Speech was detected, but the browser could not create a transcript. Use Chrome or Edge and speak clearly near the microphone for a more accurate pronunciation score."
      ];

      if (cleanDuration >= 60 || voiceSeconds >= 35) fallbackScore += 6;
      else if (cleanDuration >= 35 || voiceSeconds >= 20) fallbackScore += 4;
      else if (cleanDuration >= 20 || voiceSeconds >= 8) fallbackScore += 2;

      if (silenceRatio <= 0.7) fallbackScore += 3;
      else {
        feedback.push(
          "There were long silent gaps. Try to read continuously."
        );
      }

      return {
        score: Math.min(fallbackScore, 18),
        max: SPEAKING_MAX_MARKS,
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
      max: SPEAKING_MAX_MARKS,

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
    ) * SPEAKING_MAX_MARKS
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
    max: SPEAKING_MAX_MARKS,

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
  studentEmail = "",
  gender = ""
}) {
  const age = Number(studentAge);

  const normalizedGender =
    String(gender || "").trim();
  const email =
    String(studentEmail || "")
      .trim()
      .toLowerCase();

  return {
    name:
      String(studentName || "Student")
        .trim() || "Student",

    email,

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
      writingMetrics = {},
      speakingTranscript = "",
      speakingDuration = 0,
      speakingMetrics = {},
      speakingAudio = null,
      studentName = "",
      studentAge = "",
      studentEmail = "",
      gender = ""
    } = req.body;

    const student =
      cleanStudentProfile({
        studentName,
        studentAge,
        studentEmail,
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
            mcqScore += MCQ_MARKS_PER_QUESTION;
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
      questions.mcq.length * MCQ_MARKS_PER_QUESTION;

    const writing =
      scoreWriting(writingAnswer);
    const writingIntegrity =
      analyzeWritingIntegrity(
        writingAnswer,
        writingMetrics
      );

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
      studentEmail: student.email,
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
          marksPerQuestion:
            MCQ_MARKS_PER_QUESTION,
          results: mcqResults
        },

        writing,
        writingIntegrity,

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

          studentEmail:
            response.studentEmail,

          answers: {
            mcq: mcqAnswers,

            writing:
              writingAnswer,

            writingMetrics:
              writingIntegrity.metrics,

            writingIntegrity,

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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `English AI Test running at http://localhost:${PORT}`
    );
  });
}

module.exports = app;
