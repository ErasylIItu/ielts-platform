const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Directories
const uploadsDir = path.join(__dirname, '../uploads');
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Multer for audio uploads
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, 'audio_' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(uploadsDir));

// ─── State ───────────────────────────────────────────────────────────────────

let state = {
  test: null,          // current test config
  status: 'idle',      // idle | waiting | active | finished
  students: {},        // socketId → { name, answers, score, submitted }
  results: []
};

function saveState() {
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify(state, null, 2));
}

function loadState() {
  try {
    const raw = fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8');
    state = JSON.parse(raw);
    // Reset connected students on restart
    state.students = {};
    if (state.status === 'active') state.status = 'waiting';
  } catch (_) {}
}
loadState();

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.redirect('/student'));
app.get('/student', (req, res) => res.sendFile(path.join(__dirname, '../public/student.html')));
app.get('/teacher', (req, res) => res.sendFile(path.join(__dirname, '../public/teacher.html')));

// Upload audio
app.post('/api/upload-audio', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ filename: req.file.filename, url: '/uploads/' + req.file.filename });
});

// Save test
app.post('/api/save-test', (req, res) => {
  const { type, readingText, audioUrl, questions, duration } = req.body;
  state.test = { type, readingText: readingText || '', audioUrl: audioUrl || '', questions, duration };
  state.status = 'waiting';
  state.results = [];
  saveState();
  io.to('teacher').emit('test_saved', { ok: true });
  res.json({ ok: true });
});

// Get current state (for teacher polling on reload)
app.get('/api/state', (req, res) => {
  res.json({
    status: state.status,
    students: Object.values(state.students).map(s => ({ name: s.name, submitted: s.submitted })),
    results: state.results,
    test: state.test ? { type: state.test.type, duration: state.test.duration, questionCount: state.test.questions?.length || 0 } : null
  });
});

// ─── Socket.io ───────────────────────────────────────────────────────────────

io.on('connection', (socket) => {

  // ── Teacher ──────────────────────────────────────────────
  socket.on('teacher_join', () => {
    socket.join('teacher');
    socket.emit('waiting_students', getStudentList());
    socket.emit('status_update', { status: state.status });
    if (state.status === 'finished') {
      socket.emit('results', state.results);
    }
  });

  socket.on('start_test', () => {
    if (!state.test) return;
    state.status = 'active';
    saveState();
    io.to('students').emit('test_start', state.test);
    io.to('teacher').emit('status_update', { status: 'active' });
  });

  socket.on('reset_test', () => {
    state.status = 'idle';
    state.test = null;
    state.students = {};
    state.results = [];
    saveState();
    io.to('students').emit('test_reset');
    io.to('teacher').emit('status_update', { status: 'idle' });
    io.to('teacher').emit('waiting_students', []);
    io.to('teacher').emit('results', []);
  });

  // ── Student ──────────────────────────────────────────────
  socket.on('student_join', ({ name }) => {
    socket.join('students');
    state.students[socket.id] = { name, answers: [], score: 0, submitted: false };
    saveState();
    io.to('teacher').emit('waiting_students', getStudentList());

    // If test already active, send test immediately
    if (state.status === 'active' && state.test) {
      socket.emit('test_start', state.test);
    } else {
      socket.emit('status_update', { status: state.status });
    }
  });

  socket.on('submit_answers', ({ answers }) => {
    const student = state.students[socket.id];
    if (!student || student.submitted) return;

    // Grade
    const questions = state.test?.questions || [];
    let correct = 0;
    answers.forEach((ans, i) => {
      if (questions[i] && ans === questions[i].correct) correct++;
    });

    student.answers = answers;
    student.score = correct;
    student.submitted = true;

    const result = {
      name: student.name,
      score: correct,
      total: questions.length,
      percent: questions.length ? Math.round((correct / questions.length) * 100) : 0
    };
    state.results.push(result);
    saveState();

    socket.emit('your_result', result);
    io.to('teacher').emit('student_submitted', { name: student.name, score: correct, total: questions.length });
    io.to('teacher').emit('results', state.results);

    // Check if all submitted
    const allStudents = Object.values(state.students);
    if (allStudents.length > 0 && allStudents.every(s => s.submitted)) {
      state.status = 'finished';
      saveState();
      io.to('teacher').emit('status_update', { status: 'finished' });
    }
  });

  socket.on('disconnect', () => {
    if (state.students[socket.id]) {
      const name = state.students[socket.id].name;
      delete state.students[socket.id];
      saveState();
      io.to('teacher').emit('waiting_students', getStudentList());
      io.to('teacher').emit('student_left', { name });
    }
  });
});

function getStudentList() {
  return Object.values(state.students).map(s => ({ name: s.name, submitted: s.submitted }));
}

server.listen(PORT, () => {
  console.log(`✅ IELTS Platform running at http://localhost:${PORT}`);
});
