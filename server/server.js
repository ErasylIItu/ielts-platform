const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);
const PORT   = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, '../uploads');
const dataDir    = path.join(__dirname, '../data');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(dataDir))    fs.mkdirSync(dataDir,    { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, 'audio_' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(uploadsDir));

// ── State
let state = {
  test:     null,
  status:   'idle',
  students: {},
  results:  []
};

function saveState() {
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify(state, null, 2));
}

function loadState() {
  try {
    const raw = fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8');
    state = JSON.parse(raw);
    state.students = {};
    if (state.status === 'active') state.status = 'waiting';
  } catch (_) {}
}
loadState();

// ── Routes
app.get('/',        (req, res) => res.redirect('/student'));
app.get('/student', (req, res) => res.sendFile(path.join(__dirname, '../public/student.html')));
app.get('/teacher', (req, res) => res.sendFile(path.join(__dirname, '../public/teacher.html')));

app.post('/api/upload-audio', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ filename: req.file.filename, url: '/uploads/' + req.file.filename });
});

app.post('/api/save-test', (req, res) => {
  const { type, readingText, audioUrl, questions, duration } = req.body;
  state.test    = { type, readingText: readingText || '', audioUrl: audioUrl || '', questions, duration };
  state.status  = 'waiting';
  state.results = [];
  saveState();
  res.json({ ok: true });
});

app.get('/api/state', (req, res) => {
  res.json({
    status:   state.status,
    students: Object.values(state.students).map(s => ({ name: s.name, submitted: s.submitted })),
    results:  state.results,
    test:     state.test ? { type: state.test.type, duration: state.test.duration, questionCount: (state.test.questions || []).length } : null
  });
});

// ── Grading
function gradeAnswers(questions, answers) {
  let correct = 0;
  const review = [];

  (questions || []).forEach((q, i) => {
    const ans = answers[i] || {};
    let isCorrect = false;
    let reviewItem = { qtype: q.qtype };

    switch (q.qtype) {
      case 'mc1': {
        const studentVal = ans.value !== undefined ? ans.value : -1;
        isCorrect = q.correct.includes(studentVal);
        reviewItem = { ...reviewItem, questionText: q.text, options: q.options, studentAnswer: studentVal, correctAnswer: q.correct[0] };
        break;
      }
      case 'mc2': {
        const studentVals = Array.isArray(ans.value) ? ans.value : [];
        const correctVals = q.correct || [];
        isCorrect = correctVals.length === studentVals.length &&
          correctVals.every(v => studentVals.includes(v));
        reviewItem = { ...reviewItem, questionText: q.text, options: q.options, studentAnswer: studentVals, correctAnswer: correctVals };
        break;
      }
      case 'matching': {
        const studentPairs = ans.value || {};
        const correctPairs = q.correctPairs || {};
        const keys = Object.keys(correctPairs);
        let allCorrect = keys.length > 0;
        keys.forEach(k => {
          if (String(studentPairs[k]) !== String(correctPairs[k])) allCorrect = false;
        });
        isCorrect = allCorrect;
        reviewItem = { ...reviewItem, instruction: q.instruction, leftItems: q.leftItems, rightItems: q.rightItems, studentAnswer: studentPairs, correctAnswer: correctPairs };
        break;
      }
      case 'sentence': {
        const studentAns = String(ans.value || '').trim().toLowerCase();
        const correctAns = String(q.answer || '').trim().toLowerCase();
        isCorrect = studentAns === correctAns;
        reviewItem = { ...reviewItem, sentence: q.sentence, studentAnswer: ans.value || '', correctAnswer: q.answer };
        break;
      }
      case 'summary': {
        const studentVals = Array.isArray(ans.value) ? ans.value : [];
        const correctVals = q.answers || [];
        let allRight = correctVals.length > 0;
        correctVals.forEach((cv, j) => {
          const sv = String(studentVals[j] || '').trim().toLowerCase();
          if (sv !== cv.trim().toLowerCase()) allRight = false;
        });
        isCorrect = allRight;
        reviewItem = { ...reviewItem, text: q.text, studentAnswer: studentVals, correctAnswer: correctVals };
        break;
      }
      default:
        isCorrect = false;
    }

    reviewItem.correct = isCorrect;
    if (isCorrect) correct++;
    review.push(reviewItem);
  });

  return { correct, review };
}

// ── Socket.io
io.on('connection', (socket) => {

  socket.on('teacher_join', () => {
    socket.join('teacher');
    socket.emit('waiting_students', getStudentList());
    socket.emit('status_update', { status: state.status });
    if (state.status === 'finished') socket.emit('results', state.results);
  });

  socket.on('start_test', () => {
    if (!state.test) return;
    state.status = 'active';
    saveState();
    io.to('students').emit('test_start', state.test);
    io.to('teacher').emit('status_update', { status: 'active' });
  });

  socket.on('reset_test', () => {
    state.status  = 'idle';
    state.test    = null;
    state.students = {};
    state.results = [];
    saveState();
    io.to('students').emit('test_reset');
    io.to('teacher').emit('status_update', { status: 'idle' });
    io.to('teacher').emit('waiting_students', []);
    io.to('teacher').emit('results', []);
  });

  socket.on('student_join', ({ name }) => {
    socket.join('students');
    state.students[socket.id] = { name, answers: [], score: 0, submitted: false };
    saveState();
    io.to('teacher').emit('waiting_students', getStudentList());
    if (state.status === 'active' && state.test) {
      socket.emit('test_start', state.test);
    } else {
      socket.emit('status_update', { status: state.status });
    }
  });

  socket.on('submit_answers', ({ answers }) => {
    const student = state.students[socket.id];
    if (!student || student.submitted) return;

    const questions = state.test?.questions || [];
    const { correct, review } = gradeAnswers(questions, answers);

    student.answers   = answers;
    student.score     = correct;
    student.submitted = true;

    const result = {
      name:    student.name,
      score:   correct,
      total:   questions.length,
      percent: questions.length ? Math.round((correct / questions.length) * 100) : 0,
      review
    };
    state.results.push(result);
    saveState();

    socket.emit('your_result', result);
    io.to('teacher').emit('student_submitted', { name: student.name, score: correct, total: questions.length });
    io.to('teacher').emit('results', state.results);

    const allStudents = Object.values(state.students);
    if (allStudents.length > 0 && allStudents.every(s => s.submitted)) {
      state.status = 'finished';
      saveState();
      io.to('teacher').emit('status_update', { status: 'finished' });
    }
  });

  socket.on('disconnect', () => {
    if (state.students[socket.id]) {
      delete state.students[socket.id];
      saveState();
      io.to('teacher').emit('waiting_students', getStudentList());
    }
  });
});

function getStudentList() {
  return Object.values(state.students).map(s => ({ name: s.name, submitted: s.submitted }));
}

server.listen(PORT, () => {
  console.log('IELTS Platform running at http://localhost:' + PORT);
});
