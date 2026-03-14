/* ── student.js ────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const socket = io();

  const screens = {
    name:    document.getElementById('screen-name'),
    waiting: document.getElementById('screen-waiting'),
    test:    document.getElementById('screen-test'),
    result:  document.getElementById('screen-result'),
  };

  function show(name) {
    Object.values(screens).forEach(s => s.style.display = 'none');
    screens[name].style.display = '';
  }

  const inputName = document.getElementById('student-name');
  const btnJoin   = document.getElementById('btn-join');

  btnJoin.addEventListener('click', joinSession);
  inputName.addEventListener('keydown', e => { if (e.key === 'Enter') joinSession(); });

  function joinSession() {
    const name = inputName.value.trim();
    if (!name) { inputName.focus(); return; }
    btnJoin.disabled = true;
    socket.emit('student_join', { name });
    document.getElementById('waiting-name-display').textContent = 'Joined as: ' + name;
    show('waiting');
  }

  let test       = null;
  let timerTotal = 0;
  let timerLeft  = 0;
  let timerInt   = null;
  let submitted  = false;

  socket.on('test_start', (data) => {
    test = data;
    submitted = false;
    timerTotal = (data.duration || 60) * 60;
    timerLeft  = timerTotal;
    renderTest();
    show('test');
  });

  socket.on('test_reset', () => {
    clearInterval(timerInt);
    show('name');
    inputName.value = '';
    btnJoin.disabled = false;
  });

  // ── Render test
  function renderTest() {
    // Reading passage
    const readingSection = document.getElementById('reading-section');
    if (test.type === 'reading' && test.readingText) {
      readingSection.style.display = '';
      document.getElementById('reading-text').textContent = test.readingText;
    } else {
      readingSection.style.display = 'none';
    }

    // Audio section — show immediately, questions also shown immediately
    const audioSection = document.getElementById('audio-section');
    if (test.type === 'listening' && test.audioUrl) {
      audioSection.style.display = '';
      startAudio();
    } else {
      audioSection.style.display = 'none';
    }

    // Questions always shown immediately
    document.getElementById('questions-section').style.display = '';
    renderQuestions();
    startTimer();
    updateQProgress();
  }

  // ── Audio
  function startAudio() {
    const player    = document.getElementById('audio-player');
    const progress  = document.getElementById('audio-progress-bar');
    const statusTxt = document.getElementById('audio-status-text');

    player.src = test.audioUrl;
    player.controls = false;

    // Block seeking
    let lastTime = 0;
    player.addEventListener('timeupdate', () => {
      if (Math.abs(player.currentTime - lastTime) > 2) {
        player.currentTime = lastTime;
      } else {
        lastTime = player.currentTime;
      }
      if (player.duration) {
        progress.style.width = (player.currentTime / player.duration * 100) + '%';
      }
    });

    player.addEventListener('ended', () => {
      statusTxt.textContent = 'Audio finished. Complete your answers.';
      document.getElementById('audio-playing-banner').style.background = 'var(--green)';
    });

    player.play().catch(() => {
      statusTxt.textContent = 'Click below to start audio.';
      const playBtn = document.createElement('button');
      playBtn.className = 'btn btn-outline';
      playBtn.style.cssText = 'color:#fff;border-color:#fff;margin-top:12px;';
      playBtn.textContent = 'Start Audio';
      playBtn.onclick = () => { player.play(); playBtn.remove(); statusTxt.textContent = 'Audio is playing...'; };
      document.getElementById('audio-playing-banner').appendChild(playBtn);
    });
  }

  // ── Render questions
  function renderQuestions() {
    const list = document.getElementById('questions-list');
    list.innerHTML = '';
    (test.questions || []).forEach((q, i) => {
      const block = document.createElement('div');
      block.className = 'question-block';
      block.id = 'qblock-' + i;

      let inner = '<div class="question-text"><span class="question-num">Q' + (i+1) + '</span>';

      switch (q.qtype) {
        case 'mc1':
          inner += q.text + '</div><div class="options-list" id="opts-' + i + '">';
          (q.options || []).forEach((opt, j) => {
            inner += '<label class="option-label" id="optlbl-' + i + '-' + j + '">' +
              '<input type="radio" name="q' + i + '" value="' + j + '" />' +
              '<span>' + String.fromCharCode(65+j) + '. ' + esc(opt) + '</span></label>';
          });
          inner += '</div>';
          break;

        case 'mc2':
          inner += q.text + '</div>' +
            '<div class="alert alert-info" style="font-size:13px;margin-bottom:10px;">Choose TWO answers</div>' +
            '<div class="options-list" id="opts-' + i + '">';
          (q.options || []).forEach((opt, j) => {
            inner += '<label class="option-label" id="optlbl-' + i + '-' + j + '">' +
              '<input type="checkbox" name="q' + i + '" value="' + j + '" />' +
              '<span>' + String.fromCharCode(65+j) + '. ' + esc(opt) + '</span></label>';
          });
          inner += '</div>';
          break;

        case 'matching':
          inner += q.instruction + '</div>';
          inner += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">';
          // Right items list
          inner += '<div style="background:var(--gray50);border-radius:8px;padding:12px;">';
          inner += '<div style="font-size:12px;font-weight:700;color:var(--gray600);margin-bottom:8px;text-transform:uppercase;">Answer Options</div>';
          (q.rightItems || []).forEach((r, k) => {
            inner += '<div style="padding:4px 0;font-size:14px;"><strong>' + String.fromCharCode(65+k) + '.</strong> ' + esc(r) + '</div>';
          });
          inner += '</div>';
          // Left items with dropdowns
          inner += '<div>';
          inner += '<div style="font-size:12px;font-weight:700;color:var(--gray600);margin-bottom:8px;text-transform:uppercase;">Match each item</div>';
          (q.leftItems || []).forEach((l, j) => {
            const opts = (q.rightItems || []).map((r, k) =>
              '<option value="' + k + '">' + String.fromCharCode(65+k) + '</option>'
            ).join('');
            inner += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
              '<span style="font-size:14px;flex:1;">' + (j+1) + '. ' + esc(l) + '</span>' +
              '<select class="match-select" data-qi="' + i + '" data-j="' + j + '" style="width:70px;padding:6px;">' +
              '<option value="">--</option>' + opts + '</select></div>';
          });
          inner += '</div></div>';
          break;

        case 'sentence': {
          const parts = (q.sentence || '').split('___');
          inner += 'Complete the sentence:</div>';
          inner += '<div style="font-size:15px;line-height:2;margin-top:8px;">';
          if (parts.length >= 2) {
            inner += esc(parts[0]) +
              '<input type="text" class="sentence-input" data-qi="' + i + '" ' +
              'style="border:none;border-bottom:2px solid var(--blue);outline:none;font-size:15px;width:160px;text-align:center;background:var(--skylt);padding:2px 8px;" />' +
              esc(parts[1]);
          } else {
            inner += esc(q.sentence) +
              '<input type="text" class="sentence-input" data-qi="' + i + '" ' +
              'style="border:none;border-bottom:2px solid var(--blue);outline:none;font-size:15px;width:160px;text-align:center;background:var(--skylt);padding:2px 8px;" />';
          }
          inner += '</div>';
          break;
        }

        case 'summary': {
          inner += 'Complete the summary:</div>';
          let summaryText = esc(q.text || '');
          let gapIdx = 0;
          summaryText = summaryText.replace(/\{(\d+)\}/g, (match, num) => {
            const idx = parseInt(num) - 1;
            return '<input type="text" class="summary-input" data-qi="' + i + '" data-gapidx="' + idx + '" ' +
              'style="border:none;border-bottom:2px solid var(--blue);outline:none;font-size:15px;width:140px;text-align:center;background:var(--skylt);padding:2px 8px;" />';
          });
          inner += '<div style="font-size:15px;line-height:2.2;margin-top:8px;">' + summaryText + '</div>';
          break;
        }

        default:
          inner += (q.text || '') + '</div>';
      }

      block.innerHTML = inner;
      list.appendChild(block);

      // Attach change listeners for progress tracking
      block.querySelectorAll('input[type="radio"], input[type="checkbox"], select, input[type="text"]').forEach(el => {
        el.addEventListener('change', updateQProgress);
        el.addEventListener('input', updateQProgress);
      });

      // Option label selection highlight
      block.querySelectorAll('.option-label input').forEach(inp => {
        inp.addEventListener('change', () => {
          const parent = inp.closest('.options-list');
          if (!parent) return;
          if (inp.type === 'radio') {
            parent.querySelectorAll('.option-label').forEach(l => l.classList.remove('selected'));
          }
          inp.closest('.option-label').classList.toggle('selected', inp.checked);
          updateQProgress();
        });
      });
    });
  }

  function updateQProgress() {
    const total = (test?.questions || []).length;
    let answered = 0;
    (test?.questions || []).forEach((q, i) => {
      switch (q.qtype) {
        case 'mc1':
          if (document.querySelector('input[name="q' + i + '"]:checked')) answered++;
          break;
        case 'mc2':
          if (document.querySelectorAll('input[name="q' + i + '"]:checked').length > 0) answered++;
          break;
        case 'matching':
          const selects = document.querySelectorAll('.match-select[data-qi="' + i + '"]');
          if (selects.length && Array.from(selects).every(s => s.value !== '')) answered++;
          break;
        case 'sentence':
          const sinp = document.querySelector('.sentence-input[data-qi="' + i + '"]');
          if (sinp && sinp.value.trim()) answered++;
          break;
        case 'summary':
          const sumInps = document.querySelectorAll('.summary-input[data-qi="' + i + '"]');
          if (sumInps.length && Array.from(sumInps).every(s => s.value.trim())) answered++;
          break;
      }
    });
    document.getElementById('q-progress-count').textContent = answered + ' / ' + total;
  }

  // ── Timer
  function startTimer() {
    clearInterval(timerInt);
    renderTimer();
    timerInt = setInterval(() => {
      timerLeft--;
      renderTimer();
      if (timerLeft <= 0) { clearInterval(timerInt); autoSubmit(); }
    }, 1000);
  }

  function renderTimer() {
    const el = document.getElementById('timer-display');
    const min = Math.floor(timerLeft / 60);
    const sec = timerLeft % 60;
    el.textContent = String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
    const pct = timerTotal > 0 ? (timerLeft / timerTotal) * 100 : 0;
    document.getElementById('timer-progress').style.width = pct + '%';
    el.className = 'timer-value';
    if (timerLeft <= 60)       el.classList.add('danger');
    else if (timerLeft <= 300) el.classList.add('warning');
  }

  // ── Collect answers
  function collectAnswers() {
    const answers = [];
    (test?.questions || []).forEach((q, i) => {
      switch (q.qtype) {
        case 'mc1': {
          const checked = document.querySelector('input[name="q' + i + '"]:checked');
          answers.push({ qtype: 'mc1', value: checked ? parseInt(checked.value) : -1 });
          break;
        }
        case 'mc2': {
          const checked = Array.from(document.querySelectorAll('input[name="q' + i + '"]:checked')).map(c => parseInt(c.value));
          answers.push({ qtype: 'mc2', value: checked });
          break;
        }
        case 'matching': {
          const pairs = {};
          document.querySelectorAll('.match-select[data-qi="' + i + '"]').forEach((sel, j) => {
            pairs[j] = sel.value !== '' ? parseInt(sel.value) : -1;
          });
          answers.push({ qtype: 'matching', value: pairs });
          break;
        }
        case 'sentence': {
          const inp = document.querySelector('.sentence-input[data-qi="' + i + '"]');
          answers.push({ qtype: 'sentence', value: inp ? inp.value.trim() : '' });
          break;
        }
        case 'summary': {
          const inps = Array.from(document.querySelectorAll('.summary-input[data-qi="' + i + '"]'));
          const vals = inps.map(el => el.value.trim());
          answers.push({ qtype: 'summary', value: vals });
          break;
        }
        default:
          answers.push({ qtype: 'mc1', value: -1 });
      }
    });
    return answers;
  }

  document.getElementById('btn-submit').addEventListener('click', submitAnswers);

  function autoSubmit() { if (!submitted) submitAnswers(); }

  function submitAnswers() {
    if (submitted) return;
    submitted = true;
    clearInterval(timerInt);
    document.getElementById('btn-submit').disabled = true;
    const answers = collectAnswers();
    socket.emit('submit_answers', { answers });
  }

  // ── Results
  socket.on('your_result', (data) => {
    renderResultScreen(data);
  });

  function renderResultScreen(data) {
    document.getElementById('result-score').textContent   = data.score + '/' + data.total;
    document.getElementById('result-percent').textContent = data.percent + '%';

    let emoji = '🎉', msg = '';
    if (data.percent >= 80)      { emoji = '🏆'; msg = 'Excellent! Outstanding performance.'; }
    else if (data.percent >= 60) { emoji = '👍'; msg = 'Good job! Keep practising.'; }
    else if (data.percent >= 40) { emoji = '📚'; msg = 'Some room to improve. Keep studying!'; }
    else                          { emoji = '💪'; msg = "Don't give up — practice makes perfect."; }

    document.getElementById('result-emoji').textContent   = emoji;
    document.getElementById('result-message').textContent = msg;

    // Render review
    renderReview(data.review);
    show('result');
  }

  function renderReview(review) {
    const container = document.getElementById('result-review');
    if (!review || !review.length) { container.style.display = 'none'; return; }
    container.style.display = '';
    container.innerHTML = '<h3 style="margin-bottom:16px;font-size:17px;">Answer Review</h3>';

    review.forEach((r, i) => {
      const div = document.createElement('div');
      div.style.cssText = 'margin-bottom:16px;padding:16px;border-radius:8px;border:1.5px solid ' +
        (r.correct ? 'var(--green)' : 'var(--red)') + ';background:' +
        (r.correct ? 'var(--greenlt)' : 'var(--redlt)') + ';';

      let html = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<span style="font-size:18px;">' + (r.correct ? '✅' : '❌') + '</span>' +
        '<span style="font-weight:700;color:var(--navy);">Question ' + (i+1) + '</span>' +
        '<span style="font-size:12px;color:var(--gray600);background:var(--white);padding:2px 8px;border-radius:10px;">' + formatQType(r.qtype) + '</span>' +
        '</div>';

      switch (r.qtype) {
        case 'mc1':
        case 'mc2':
          html += '<div style="font-size:14px;margin-bottom:6px;"><strong>Q:</strong> ' + esc(r.questionText) + '</div>';
          (r.options || []).forEach((opt, j) => {
            const isStudentAnswer = Array.isArray(r.studentAnswer) ? r.studentAnswer.includes(j) : r.studentAnswer === j;
            const isCorrect = Array.isArray(r.correctAnswer) ? r.correctAnswer.includes(j) : r.correctAnswer === j;
            let style = 'padding:6px 10px;border-radius:5px;font-size:13px;margin-bottom:4px;';
            if (isCorrect)      style += 'background:var(--greenlt);border:1px solid var(--green);';
            else if (isStudentAnswer) style += 'background:var(--redlt);border:1px solid var(--red);';
            else                style += 'background:var(--white);border:1px solid var(--gray200);';
            html += '<div style="' + style + '">' + String.fromCharCode(65+j) + '. ' + esc(opt) +
              (isCorrect ? ' <strong style="color:var(--green);">✔ Correct</strong>' : '') +
              (isStudentAnswer && !isCorrect ? ' <strong style="color:var(--red);">✗ Your answer</strong>' : '') +
              '</div>';
          });
          break;

        case 'matching':
          html += '<div style="font-size:14px;margin-bottom:8px;"><strong>' + esc(r.instruction) + '</strong></div>';
          (r.leftItems || []).forEach((left, j) => {
            const studentPick = r.studentAnswer[j];
            const correctPick = r.correctAnswer[j];
            const isPairCorrect = studentPick == correctPick;
            html += '<div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:4px;">' +
              '<span style="flex:1;">' + (j+1) + '. ' + esc(left) + '</span>' +
              '<span style="padding:3px 10px;border-radius:5px;background:var(--white);border:1px solid var(--gray200);">→ ' +
              (studentPick !== undefined && studentPick !== -1 ? String.fromCharCode(65 + parseInt(studentPick)) : '—') + '</span>' +
              (isPairCorrect ? '<span style="color:var(--green);">✔</span>' :
                '<span style="color:var(--red);">✗ should be ' + String.fromCharCode(65 + correctPick) + '</span>') +
              '</div>';
          });
          break;

        case 'sentence':
          html += '<div style="font-size:14px;margin-bottom:6px;">' + esc(r.sentence) + '</div>' +
            '<div style="font-size:13px;">Your answer: <strong>' + esc(r.studentAnswer || '—') + '</strong></div>' +
            (!r.correct ? '<div style="font-size:13px;color:var(--green);">Correct answer: <strong>' + esc(r.correctAnswer) + '</strong></div>' : '');
          break;

        case 'summary':
          html += '<div style="font-size:14px;margin-bottom:8px;">Summary gaps:</div>';
          (r.correctAnswer || []).forEach((ans, j) => {
            const studentAns = r.studentAnswer[j] || '';
            const gapCorrect = studentAns.toLowerCase().trim() === ans.toLowerCase().trim();
            html += '<div style="font-size:13px;margin-bottom:4px;">' +
              '{' + (j+1) + '} Your answer: <strong>' + esc(studentAns || '—') + '</strong>' +
              (gapCorrect ? ' <span style="color:var(--green);">✔</span>' :
                ' <span style="color:var(--red);">✗</span> Correct: <strong style="color:var(--green);">' + esc(ans) + '</strong>') +
              '</div>';
          });
          break;
      }

      div.innerHTML = html;
      container.appendChild(div);
    });
  }

  function formatQType(qtype) {
    const map = { mc1:'Multiple Choice', mc2:'Multiple Choice (×2)', matching:'Matching', sentence:'Sentence Completion', summary:'Summary Completion' };
    return map[qtype] || qtype;
  }

  function esc(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

})();
