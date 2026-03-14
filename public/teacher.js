/* ── teacher.js ────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const socket = io();
  socket.emit('teacher_join');

  let currentType      = 'listening';
  let uploadedAudioUrl = '';
  let questions        = [];
  let testSaved        = false;

  const Q_TYPES = {
    mc1:      'Multiple Choice (1 answer)',
    mc2:      'Multiple Choice (2 answers)',
    matching: 'Matching',
    sentence: 'Sentence Completion',
    summary:  'Summary / Form Completion',
  };

  function defaultQuestion(qtype) {
    switch (qtype) {
      case 'mc1':      return { qtype, text: '', options: ['','','',''], correct: [0] };
      case 'mc2':      return { qtype, text: '', options: ['','','','',''], correct: [0,1] };
      case 'matching': return { qtype, instruction: '', leftItems: ['','',''], rightItems: ['','','','',''], correctPairs: {0:0,1:1,2:2} };
      case 'sentence': return { qtype, sentence: '', answer: '' };
      case 'summary':  return { qtype, text: '', answers: ['',''] };
      default:         return { qtype: 'mc1', text: '', options: ['','','',''], correct: [0] };
    }
  }

  window.setType = function (type) {
    currentType = type;
    document.getElementById('tab-listening').classList.toggle('active', type === 'listening');
    document.getElementById('tab-reading').classList.toggle('active', type === 'reading');
    document.getElementById('section-listening').style.display = type === 'listening' ? '' : 'none';
    document.getElementById('section-reading').style.display   = type === 'reading'   ? '' : 'none';
  };

  document.getElementById('audio-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('audio-name-display').textContent = 'Uploading: ' + file.name + '...';
    const fd = new FormData();
    fd.append('audio', file);
    try {
      const res  = await fetch('/api/upload-audio', { method: 'POST', body: fd });
      const data = await res.json();
      uploadedAudioUrl = data.url;
      document.getElementById('audio-upload-status').style.display = '';
      document.getElementById('audio-name-display').textContent = 'File: ' + file.name;
    } catch {
      document.getElementById('audio-name-display').textContent = 'Upload failed. Try again.';
    }
  });

  window.addQuestion = function () {
    questions.push(defaultQuestion('mc1'));
    renderBuilder();
  };

  window.removeQuestion = function (i) {
    syncFromDOM();
    questions.splice(i, 1);
    renderBuilder();
  };

  window.changeQType = function (i, newType) {
    syncFromDOM();
    questions[i] = defaultQuestion(newType);
    renderBuilder();
  };

  window.addLeftItem = function (i) {
    syncFromDOM();
    const idx = questions[i].leftItems.length;
    questions[i].leftItems.push('');
    questions[i].correctPairs[idx] = 0;
    renderBuilder();
  };

  window.removeLeftItem = function (i, j) {
    syncFromDOM();
    questions[i].leftItems.splice(j, 1);
    const newPairs = {};
    questions[i].leftItems.forEach((_, k) => { newPairs[k] = questions[i].correctPairs[k] !== undefined ? questions[i].correctPairs[k] : 0; });
    questions[i].correctPairs = newPairs;
    renderBuilder();
  };

  window.addSummaryAnswer = function (i) {
    syncFromDOM();
    questions[i].answers.push('');
    renderBuilder();
  };

  window.removeSummaryAnswer = function (i, j) {
    syncFromDOM();
    questions[i].answers.splice(j, 1);
    renderBuilder();
  };

  function syncFromDOM() {
    document.querySelectorAll('.builder-question').forEach((block, i) => {
      if (!questions[i]) return;
      const q = questions[i];
      switch (q.qtype) {
        case 'mc1':
        case 'mc2': {
          const textEl = block.querySelector('.q-text-input');
          if (textEl) q.text = textEl.value;
          block.querySelectorAll('.opt-input').forEach((el, j) => { q.options[j] = el.value; });
          if (q.qtype === 'mc1') {
            const checked = block.querySelector('input[type="radio"]:checked');
            if (checked) q.correct = [parseInt(checked.value)];
          } else {
            q.correct = [];
            block.querySelectorAll('input[type="checkbox"]').forEach((cb, j) => { if (cb.checked) q.correct.push(j); });
          }
          break;
        }
        case 'matching': {
          const instrEl = block.querySelector('.q-instruction-input');
          if (instrEl) q.instruction = instrEl.value;
          block.querySelectorAll('.left-item-input').forEach((el, j) => { q.leftItems[j] = el.value; });
          block.querySelectorAll('.right-item-input').forEach((el, j) => { q.rightItems[j] = el.value; });
          block.querySelectorAll('.pair-select').forEach((sel, j) => { q.correctPairs[j] = parseInt(sel.value); });
          break;
        }
        case 'sentence': {
          const sentEl = block.querySelector('.q-sentence-input');
          const ansEl  = block.querySelector('.q-answer-input');
          if (sentEl) q.sentence = sentEl.value;
          if (ansEl)  q.answer   = ansEl.value;
          break;
        }
        case 'summary': {
          const textEl = block.querySelector('.q-summary-text');
          if (textEl) q.text = textEl.value;
          block.querySelectorAll('.summary-answer-input').forEach((el, j) => { q.answers[j] = el.value; });
          break;
        }
      }
    });
  }

  function renderBuilder() {
    const container = document.getElementById('questions-builder');
    const noMsg     = document.getElementById('no-questions-msg');
    container.innerHTML = '';
    noMsg.style.display = questions.length ? 'none' : '';

    questions.forEach((q, i) => {
      const div = document.createElement('div');
      div.className = 'builder-question';
      const typeOptions = Object.entries(Q_TYPES).map(([val, label]) =>
        '<option value="' + val + '"' + (q.qtype === val ? ' selected' : '') + '>' + label + '</option>'
      ).join('');

      div.innerHTML =
        '<div class="builder-question-header">' +
          '<span class="builder-question-num">Question ' + (i+1) + '</span>' +
          '<select class="qtype-select" onchange="changeQType(' + i + ', this.value)">' + typeOptions + '</select>' +
          '<button class="btn btn-danger btn-sm" onclick="removeQuestion(' + i + ')">Remove</button>' +
        '</div>' +
        '<div class="qtype-fields" id="qfields-' + i + '"></div>';

      container.appendChild(div);
      renderQFields(div.querySelector('#qfields-' + i), q, i);
    });
  }

  function renderQFields(container, q, i) {
    switch (q.qtype) {
      case 'mc1': renderMC(container, q, i, false); break;
      case 'mc2': renderMC(container, q, i, true);  break;
      case 'matching': renderMatching(container, q, i); break;
      case 'sentence': renderSentence(container, q, i); break;
      case 'summary':  renderSummary(container, q, i);  break;
    }
  }

  function renderMC(container, q, i, isMulti) {
    const numOpts = isMulti ? 5 : 4;
    const opts = q.options.slice(0, numOpts);
    while (opts.length < numOpts) opts.push('');

    let html = '<div class="form-group"><label>Question Text</label>' +
      '<input type="text" class="q-text-input" value="' + esc(q.text) + '" placeholder="Enter question text..." /></div>' +
      '<div><label style="margin-bottom:8px;">Options &nbsp;<span style="color:var(--green);font-size:11px;">' +
      (isMulti ? '☑ check TWO correct answers' : '● select ONE correct answer') + '</span></label>';

    opts.forEach((opt, j) => {
      const letter = String.fromCharCode(65 + j);
      const isCorrect = q.correct.includes(j);
      const inputType = isMulti ? 'checkbox' : 'radio';
      const nameAttr = isMulti ? '' : 'name="correct_' + i + '"';
      html += '<div class="option-row">' +
        '<input type="' + inputType + '" ' + nameAttr + ' value="' + j + '" ' + (isCorrect ? 'checked' : '') + ' />' +
        '<input type="text" class="opt-input" value="' + esc(opt) + '" placeholder="Option ' + letter + '" />' +
        '<span class="correct-radio-label" style="' + (isCorrect ? '' : 'visibility:hidden') + '">✔</span>' +
        '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function renderMatching(container, q, i) {
    let leftRows = q.leftItems.map((item, j) => {
      const pairOpts = q.rightItems.map((r, k) =>
        '<option value="' + k + '"' + (q.correctPairs[j] == k ? ' selected' : '') + '>' + String.fromCharCode(65+k) + '</option>'
      ).join('');
      return '<div class="option-row" style="grid-template-columns:1fr 80px auto;">' +
        '<input type="text" class="left-item-input" value="' + esc(item) + '" placeholder="Item ' + (j+1) + '" />' +
        '<select class="pair-select">' + pairOpts + '</select>' +
        '<button class="btn btn-danger btn-sm" onclick="removeLeftItem(' + i + ',' + j + ')">×</button>' +
        '</div>';
    }).join('');

    let rightRows = q.rightItems.map((item, j) =>
      '<div class="option-row" style="grid-template-columns:24px 1fr;">' +
        '<span style="font-weight:700;color:var(--navy);align-self:center;">' + String.fromCharCode(65+j) + '</span>' +
        '<input type="text" class="right-item-input" value="' + esc(item) + '" placeholder="Answer ' + String.fromCharCode(65+j) + '" />' +
        '</div>'
    ).join('');

    container.innerHTML =
      '<div class="form-group"><label>Instruction</label>' +
      '<input type="text" class="q-instruction-input" value="' + esc(q.instruction) + '" placeholder="e.g. Match the person with the correct statement." /></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        '<div><label>Left items <span style="color:var(--green);font-size:11px;">→ select correct answer</span></label>' +
          leftRows +
          '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="addLeftItem(' + i + ')">+ Add item</button>' +
        '</div>' +
        '<div><label>Answer options (A, B, C...)</label>' + rightRows + '</div>' +
      '</div>';
  }

  function renderSentence(container, q, i) {
    container.innerHTML =
      '<div class="form-group"><label>Sentence with blank (use ___ for the gap)</label>' +
      '<input type="text" class="q-sentence-input" value="' + esc(q.sentence) + '" placeholder="e.g. Water hyacinth originally came from ___." /></div>' +
      '<div class="form-group"><label>Correct Answer</label>' +
      '<input type="text" class="q-answer-input" value="' + esc(q.answer) + '" placeholder="e.g. Latin America" /></div>' +
      '<div class="alert alert-info" style="font-size:13px;">Case-insensitive: "latin america" = "Latin America"</div>';
  }

  function renderSummary(container, q, i) {
    let answerRows = (q.answers || []).map((ans, j) =>
      '<div class="option-row" style="grid-template-columns:32px 1fr auto;">' +
        '<span style="font-weight:700;color:var(--navy);align-self:center;">{' + (j+1) + '}</span>' +
        '<input type="text" class="summary-answer-input" value="' + esc(ans) + '" placeholder="Answer for gap {' + (j+1) + '}" />' +
        '<button class="btn btn-danger btn-sm" onclick="removeSummaryAnswer(' + i + ',' + j + ')">×</button>' +
      '</div>'
    ).join('');

    container.innerHTML =
      '<div class="form-group"><label>Summary text — use {1} {2} {3} for gaps</label>' +
      '<textarea class="q-summary-text" rows="5" placeholder="e.g. Water hyacinth was brought from {1} to Africa in the {2} century.">' + esc(q.text || '') + '</textarea></div>' +
      '<div class="form-group"><label>Correct answers for each gap</label>' +
        '<div>' + answerRows + '</div>' +
        '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="addSummaryAnswer(' + i + ')">+ Add gap</button>' +
      '</div>' +
      '<div class="alert alert-info" style="font-size:13px;">Case-insensitive. Number of {gaps} must match number of answers.</div>';
  }

  window.saveTest = async function () {
    syncFromDOM();

    if (currentType === 'listening' && !uploadedAudioUrl) {
      setStatus('save-status', 'error', 'Please upload an audio file first.'); return;
    }
    if (currentType === 'reading' && !document.getElementById('reading-text-input').value.trim()) {
      setStatus('save-status', 'error', 'Please enter a reading passage.'); return;
    }
    if (questions.length === 0) {
      setStatus('save-status', 'error', 'Please add at least one question.'); return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const num = 'Question ' + (i+1);
      switch (q.qtype) {
        case 'mc1':
        case 'mc2':
          if (!q.text.trim()) { setStatus('save-status','error', num + ': question text is empty.'); return; }
          if (q.options.some(o => !o.trim())) { setStatus('save-status','error', num + ': all options must be filled.'); return; }
          if (!q.correct.length) { setStatus('save-status','error', num + ': mark the correct answer.'); return; }
          if (q.qtype === 'mc2' && q.correct.length < 2) { setStatus('save-status','error', num + ': select at least 2 correct answers.'); return; }
          break;
        case 'matching':
          if (!q.instruction.trim()) { setStatus('save-status','error', num + ': add an instruction.'); return; }
          if (q.leftItems.some(l => !l.trim())) { setStatus('save-status','error', num + ': fill all left items.'); return; }
          if (q.rightItems.some(r => !r.trim())) { setStatus('save-status','error', num + ': fill all right items.'); return; }
          break;
        case 'sentence':
          if (!q.sentence.trim()) { setStatus('save-status','error', num + ': sentence is empty.'); return; }
          if (!q.answer.trim()) { setStatus('save-status','error', num + ': correct answer is empty.'); return; }
          break;
        case 'summary':
          if (!q.text.trim()) { setStatus('save-status','error', num + ': summary text is empty.'); return; }
          if (q.answers.some(a => !a.trim())) { setStatus('save-status','error', num + ': fill all gap answers.'); return; }
          break;
      }
    }

    const duration = parseInt(document.getElementById('duration-input').value) || 60;
    const payload  = {
      type: currentType,
      readingText: document.getElementById('reading-text-input').value,
      audioUrl: uploadedAudioUrl,
      questions,
      duration
    };

    try {
      const res = await fetch('/api/save-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await res.json();
      testSaved = true;
      setStatus('save-status', 'success', 'Test saved! Students can now join.');
      updateStatusBadge('waiting');
      document.getElementById('btn-start').disabled = false;
      document.getElementById('start-hint').textContent = 'Start the test when all students have joined.';
    } catch {
      setStatus('save-status', 'error', 'Failed to save test. Try again.');
    }
  };

  window.startTest = function () {
    socket.emit('start_test');
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-save-test').disabled = true;
    updateStatusBadge('active');
    document.getElementById('start-hint').textContent = 'Test is running!';
  };

  window.resetTest = function () {
    if (!confirm('Reset and clear all results? Students will be returned to the name screen.')) return;
    socket.emit('reset_test');
    questions = []; uploadedAudioUrl = ''; testSaved = false;
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

  socket.on('waiting_students', renderStudentList);
  socket.on('results', (results) => { if (results.length > 0) renderResults(results); });
  socket.on('status_update', ({ status }) => {
    updateStatusBadge(status);
    if (status === 'finished') document.getElementById('panel-results').style.display = '';
  });

  function renderStudentList(students) {
    const list = document.getElementById('student-list');
    document.getElementById('student-count').textContent = students.length;
    if (!students.length) { list.innerHTML = '<div class="empty-state">No students connected yet.</div>'; return; }
    list.innerHTML = '';
    students.forEach(s => {
      const div = document.createElement('div');
      div.className = 'student-chip';
      const initials = s.name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
      div.innerHTML = '<div class="avatar">' + initials + '</div><span class="sname">' + esc(s.name) + '</span><span class="chip-status ' + (s.submitted?'done':'waiting') + '">' + (s.submitted?'Done':'Waiting') + '</span>';
      list.appendChild(div);
    });
  }

  function renderResults(results) {
    const tbody = document.getElementById('results-tbody');
    const summary = document.getElementById('results-summary');
    tbody.innerHTML = '';
    results.forEach((r, i) => {
      const pctClass = r.percent >= 70 ? 'high' : r.percent >= 50 ? 'mid' : 'low';
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + (i+1) + '</td><td><strong>' + esc(r.name) + '</strong></td><td>' + r.score + '</td><td>' + r.total + '</td><td><span class="score-badge ' + pctClass + '">' + r.percent + '%</span></td>';
      tbody.appendChild(tr);
    });
    const avg = results.length ? Math.round(results.reduce((a,r) => a+r.percent, 0) / results.length) : 0;
    summary.textContent = results.length + ' student(s) completed · Class average: ' + avg + '%';
    document.getElementById('panel-results').style.display = '';
  }

  function updateStatusBadge(status) {
    const el = document.getElementById('status-badge');
    const map = {
      idle:     ['alert-warn',    'No test saved yet'],
      waiting:  ['alert-info',    'Test ready - waiting for students'],
      active:   ['alert-success', 'Test in progress'],
      finished: ['alert-success', 'Test complete - see results below'],
    };
    const [cls, txt] = map[status] || map.idle;
    el.className = 'alert ' + cls;
    el.textContent = txt;
  }

  function setStatus(elId, type, msg) {
    document.getElementById(elId).innerHTML = '<div class="alert alert-' + (type==='success'?'success':'error') + '">' + msg + '</div>';
  }

  function esc(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  renderBuilder();
})();
