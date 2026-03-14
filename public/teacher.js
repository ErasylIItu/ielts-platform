/* ── teacher.js ────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const socket = io();
  socket.emit('teacher_join');

  // ── State
  let currentType     = 'listening';
  let uploadedAudioUrl = '';
  let questions        = [];    // [{ text, options:[str,str,str,str], correct:0-3 }]
  let testSaved        = false;

  // ── Type tabs
  window.setType = function (type) {
    currentType = type;
    document.getElementById('tab-listening').classList.toggle('active', type === 'listening');
    document.getElementById('tab-reading').classList.toggle('active', type === 'reading');
    document.getElementById('section-listening').style.display = type === 'listening' ? '' : 'none';
    document.getElementById('section-reading').style.display   = type === 'reading'   ? '' : 'none';
  };

  // ── Audio upload
  document.getElementById('audio-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('audio-name-display').textContent = 'Uploading: ' + file.name + '…';

    const fd = new FormData();
    fd.append('audio', file);
    try {
      const res  = await fetch('/api/upload-audio', { method: 'POST', body: fd });
      const data = await res.json();
      uploadedAudioUrl = data.url;
      document.getElementById('audio-upload-status').style.display = '';
      document.getElementById('audio-name-display').textContent = '📁 ' + file.name;
    } catch (err) {
      document.getElementById('audio-name-display').textContent = '❌ Upload failed. Try again.';
    }
  });

  // ── Questions builder
  window.addQuestion = function () {
    questions.push({ text: '', options: ['', '', '', ''], correct: 0 });
    renderBuilder();
  };

  window.removeQuestion = function (i) {
    questions.splice(i, 1);
    renderBuilder();
  };

  function renderBuilder() {
    const container = document.getElementById('questions-builder');
    const noMsg     = document.getElementById('no-questions-msg');
    container.innerHTML = '';
    noMsg.style.display = questions.length ? 'none' : '';

    questions.forEach((q, i) => {
      const div = document.createElement('div');
      div.className = 'builder-question';
      div.innerHTML = `
        <div class="builder-question-header">
          <span class="builder-question-num">Question ${i + 1}</span>
          <button class="btn btn-danger btn-sm" onclick="removeQuestion(${i})">Remove</button>
        </div>
        <div class="form-group">
          <label>Question Text</label>
          <input type="text" value="${esc(q.text)}" placeholder="Enter question…" 
                 oninput="questions[${i}].text=this.value" />
        </div>
        <div style="margin-top:4px;">
          <label style="margin-bottom:8px;">Options &nbsp;<span style="color:var(--green);font-size:11px;">✔ mark correct</span></label>
          ${q.options.map((opt, j) => `
            <div class="option-row">
              <input type="radio" name="correct_${i}" value="${j}" ${q.correct === j ? 'checked' : ''}
                     oninput="questions[${i}].correct=${j}" title="Mark as correct" />
              <input type="text" value="${esc(opt)}" placeholder="Option ${String.fromCharCode(65+j)}"
                     oninput="questions[${i}].options[${j}]=this.value" />
              <span class="correct-radio-label" style="${q.correct===j?'':'visibility:hidden'}">✔</span>
            </div>
          `).join('')}
        </div>
      `;
      // Update ✔ visibility live
      div.querySelectorAll(`input[name="correct_${i}"]`).forEach(radio => {
        radio.addEventListener('change', () => {
          renderBuilder();
        });
      });
      container.appendChild(div);
    });
  }

  function esc(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

// ── Save test
  window.saveTest = async function () {
    // Sync from DOM before validation
    document.querySelectorAll('.builder-question').forEach((block, i) => {
      const inputs = block.querySelectorAll('input[type="text"]');
      questions[i].text = inputs[0].value;
      questions[i].options = [inputs[1].value, inputs[2].value, inputs[3].value, inputs[4].value];
    });

    // Validation
    if (currentType === 'listening' && !uploadedAudioUrl) {
      setStatus('save-status', 'error', 'Please upload an audio file first.');
      return;
    }
    if (currentType === 'reading' && !document.getElementById('reading-text-input').value.trim()) {
      setStatus('save-status', 'error', 'Please enter a reading passage.');
      return;
    }
    if (questions.length === 0) {
      setStatus('save-status', 'error', 'Please add at least one question.');
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) { setStatus('save-status', 'error', `Question ${i+1} has no text.`); return; }
      if (q.options.some(o => !o.trim())) { setStatus('save-status', 'error', `Question ${i+1} has empty options.`); return; }
    }

    const duration = parseInt(document.getElementById('duration-input').value) || 60;
    const payload  = {
      type:        currentType,
      readingText: document.getElementById('reading-text-input').value,
      audioUrl:    uploadedAudioUrl,
      questions,
      duration
    };
    
    try {
      const res  = await fetch('/api/save-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await res.json();
      testSaved = true;
      setStatus('save-status', 'success', '✅ Test saved! Students can now join.');
      updateStatusBadge('waiting');
      document.getElementById('btn-start').disabled = false;
      document.getElementById('start-hint').textContent = 'Start the test when all students have joined.';
    } catch {
      setStatus('save-status', 'error', '❌ Failed to save test. Try again.');
    }
  };

  // ── Start test
  window.startTest = function () {
    socket.emit('start_test');
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-save-test').disabled = true;
    updateStatusBadge('active');
    document.getElementById('start-hint').textContent = 'Test is running!';
  };

  // ── Reset
  window.resetTest = function () {
    if (!confirm('Reset and clear all results? Students will be returned to the name screen.')) return;
    socket.emit('reset_test');
    questions        = [];
    uploadedAudioUrl = '';
    testSaved        = false;
    document.getElementById('audio-file-input').value = '';
    document.getElementById('audio-upload-status').style.display = 'none';
    document.getElementById('audio-name-display').textContent = '';
    document.getElementById('reading-text-input').value = '';
    document.getElementById('duration-input').value = '60';
    renderBuilder();
    setType('listening');
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-save-test').disabled = false;
    document.getElementById('start-hint').textContent = 'Save the test first, then students can join.';
    document.getElementById('save-status').innerHTML = '';
    updateStatusBadge('idle');
    document.getElementById('panel-results').style.display = 'none';
    document.getElementById('results-tbody').innerHTML = '';
  };

  // ── Socket events
  socket.on('waiting_students', (students) => {
    renderStudentList(students);
  });

  socket.on('student_submitted', ({ name }) => {
    // update list chip
  });

  socket.on('student_left', ({ name }) => {
    // handled via waiting_students refresh
  });

  socket.on('results', (results) => {
    if (results.length > 0) {
      renderResults(results);
    }
  });

  socket.on('status_update', ({ status }) => {
    updateStatusBadge(status);
    if (status === 'finished') {
      document.getElementById('panel-results').style.display = '';
    }
  });

  socket.on('test_saved', () => { /* acknowledged */ });

  // ── Render student list
  function renderStudentList(students) {
    const list  = document.getElementById('student-list');
    const count = document.getElementById('student-count');
    count.textContent = students.length;

    if (students.length === 0) {
      list.innerHTML = '<div class="empty-state">No students connected yet.</div>';
      return;
    }
    list.innerHTML = '';
    students.forEach(s => {
      const div = document.createElement('div');
      div.className = 'student-chip';
      const initials = s.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      div.innerHTML = `
        <div class="avatar">${initials}</div>
        <span class="sname">${esc(s.name)}</span>
        <span class="chip-status ${s.submitted ? 'done' : 'waiting'}">${s.submitted ? 'Done' : 'Waiting'}</span>
      `;
      list.appendChild(div);
    });
  }

  // ── Render results table
  function renderResults(results) {
    const tbody   = document.getElementById('results-tbody');
    const summary = document.getElementById('results-summary');

    tbody.innerHTML = '';
    results.forEach((r, i) => {
      const pctClass = r.percent >= 70 ? 'high' : r.percent >= 50 ? 'mid' : 'low';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td><strong>${esc(r.name)}</strong></td>
        <td>${r.score}</td>
        <td>${r.total}</td>
        <td><span class="score-badge ${pctClass}">${r.percent}%</span></td>
      `;
      tbody.appendChild(tr);
    });

    const avg = results.length
      ? Math.round(results.reduce((a, r) => a + r.percent, 0) / results.length)
      : 0;
    summary.textContent = `${results.length} student(s) completed · Class average: ${avg}%`;
    document.getElementById('panel-results').style.display = '';
  }

  // ── Status badge
  function updateStatusBadge(status) {
    const el = document.getElementById('status-badge');
    const map = {
      idle:     ['alert-warn',    '⏳ No test saved yet'],
      waiting:  ['alert-info',    '✅ Test ready — waiting for students'],
      active:   ['alert-success', '🚀 Test in progress'],
      finished: ['alert-success', '🏁 Test complete — see results below'],
    };
    const [cls, txt] = map[status] || map.idle;
    el.className = 'alert ' + cls;
    el.textContent = txt;
  }

  // ── Helpers
  function setStatus(elId, type, msg) {
    const el = document.getElementById(elId);
    el.innerHTML = `<div class="alert alert-${type === 'success' ? 'success' : 'error'}">${msg}</div>`;
  }

  // Init
  renderBuilder();

})();
