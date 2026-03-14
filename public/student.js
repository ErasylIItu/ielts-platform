/* ── student.js ────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const socket = io();

  // ── Screens
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

  // ── Name entry
  const inputName   = document.getElementById('student-name');
  const btnJoin     = document.getElementById('btn-join');
  const waitingName = document.getElementById('waiting-name-display');

  btnJoin.addEventListener('click', joinSession);
  inputName.addEventListener('keydown', e => { if (e.key === 'Enter') joinSession(); });

  function joinSession() {
    const name = inputName.value.trim();
    if (!name) { inputName.focus(); return; }
    btnJoin.disabled = true;
    socket.emit('student_join', { name });
    waitingName.textContent = 'Joined as: ' + name;
    show('waiting');
  }

  // ── Test state
  let test         = null;
  let timerTotal   = 0;
  let timerLeft    = 0;
  let timerInt     = null;
  let submitted    = false;

  // ── Receive test start
  socket.on('test_start', (data) => {
    test = data;
    submitted = false;
    timerTotal = (data.duration || 60) * 60;
    timerLeft  = timerTotal;
    renderTest();
    show('test');
  });

  socket.on('status_update', (data) => {
    if (data.status === 'waiting' && screens.waiting.style.display === 'none') {
      // already in waiting
    }
  });

  socket.on('test_reset', () => {
    clearInterval(timerInt);
    show('name');
    inputName.value = '';
    btnJoin.disabled = false;
  });

  // ── Render test
  function renderTest() {
    // Reading section
    const readingSection = document.getElementById('reading-section');
    if (test.type === 'reading' && test.readingText) {
      readingSection.style.display = '';
      document.getElementById('reading-text').textContent = test.readingText;
    } else {
      readingSection.style.display = 'none';
    }

    // Audio section
    const audioSection = document.getElementById('audio-section');
    if (test.type === 'listening' && test.audioUrl) {
      audioSection.style.display = '';
      document.getElementById('questions-section').style.display = 'none';
      startAudio();
    } else {
      audioSection.style.display = 'none';
      document.getElementById('questions-section').style.display = '';
      renderQuestions();
    }

    startTimer();
    updateQProgress();
  }

  // ── Audio
  function startAudio() {
    const player   = document.getElementById('audio-player');
    const progress = document.getElementById('audio-progress-bar');
    const statusTxt = document.getElementById('audio-status-text');

    player.src = test.audioUrl;
    player.controls = false;

    // Prevent user control
    player.addEventListener('seeking', () => { player.currentTime = player.currentTime; });

    player.addEventListener('timeupdate', () => {
      if (player.duration) {
        const pct = (player.currentTime / player.duration) * 100;
        progress.style.width = pct + '%';
      }
    });

    player.addEventListener('ended', () => {
      statusTxt.textContent = 'Audio finished. Please answer the questions below.';
      document.getElementById('audio-playing-banner').style.background = 'var(--green)';
      document.getElementById('questions-section').style.display = '';
      renderQuestions();
    });

    player.play().catch(() => {
      // Autoplay blocked — show message
      statusTxt.textContent = 'Click below to start audio.';
      const playBtn = document.createElement('button');
      playBtn.className = 'btn btn-outline mt-16';
      playBtn.style.color = '#fff';
      playBtn.style.borderColor = '#fff';
      playBtn.textContent = '▶ Start Audio';
      playBtn.onclick = () => {
        player.play();
        playBtn.remove();
        statusTxt.textContent = 'Audio is playing — listen carefully.';
      };
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
      block.innerHTML = `
        <div class="question-text">
          <span class="question-num">Q${i + 1}</span>${q.text}
        </div>
        <div class="options-list" id="opts-${i}"></div>
      `;
      const optsList = block.querySelector(`#opts-${i}`);
      (q.options || []).forEach((opt, j) => {
        const lbl = document.createElement('label');
        lbl.className = 'option-label';
        lbl.innerHTML = `
          <input type="radio" name="q${i}" value="${j}" />
          <span>${String.fromCharCode(65 + j)}. ${opt}</span>
        `;
        lbl.querySelector('input').addEventListener('change', () => {
          optsList.querySelectorAll('.option-label').forEach(l => l.classList.remove('selected'));
          lbl.classList.add('selected');
          updateQProgress();
        });
        optsList.appendChild(lbl);
      });
      list.appendChild(block);
    });
    updateQProgress();
  }

  // ── Q progress
  function updateQProgress() {
    const total = (test?.questions || []).length;
    const answered = document.querySelectorAll('.options-list input[type="radio"]:checked').length;
    document.getElementById('q-progress-count').textContent = answered + ' / ' + total;
    document.getElementById('q-progress-label').textContent = 'Answered';
  }

  // ── Timer
  function startTimer() {
    clearInterval(timerInt);
    renderTimer();
    timerInt = setInterval(() => {
      timerLeft--;
      renderTimer();
      if (timerLeft <= 0) {
        clearInterval(timerInt);
        autoSubmit();
      }
    }, 1000);
  }

  function renderTimer() {
    const el = document.getElementById('timer-display');
    const min = Math.floor(timerLeft / 60);
    const sec = timerLeft % 60;
    el.textContent = String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    const pct = timerTotal > 0 ? (timerLeft / timerTotal) * 100 : 0;
    document.getElementById('timer-progress').style.width = pct + '%';

    el.className = 'timer-value';
    if (timerLeft <= 60)       el.classList.add('danger');
    else if (timerLeft <= 300) el.classList.add('warning');
  }

  // ── Submit
  document.getElementById('btn-submit').addEventListener('click', submitAnswers);

  function autoSubmit() {
    if (!submitted) submitAnswers();
  }

  function submitAnswers() {
    if (submitted) return;
    submitted = true;
    clearInterval(timerInt);
    document.getElementById('btn-submit').disabled = true;

    const answers = [];
    (test?.questions || []).forEach((_, i) => {
      const checked = document.querySelector(`input[name="q${i}"]:checked`);
      answers.push(checked ? parseInt(checked.value) : -1);
    });
    socket.emit('submit_answers', { answers });
  }

  // ── Results
  socket.on('your_result', (data) => {
    document.getElementById('result-score').textContent   = data.score + '/' + data.total;
    document.getElementById('result-percent').textContent = data.percent + '%';

    let emoji = '🎉', msg = '';
    if (data.percent >= 80)      { emoji = '🏆'; msg = 'Excellent work! Outstanding performance.'; }
    else if (data.percent >= 60) { emoji = '👍'; msg = 'Good job! Keep practising.'; }
    else if (data.percent >= 40) { emoji = '📚'; msg = 'Some room to improve. Keep studying!'; }
    else                          { emoji = '💪'; msg = 'Don\'t give up — practice makes perfect.'; }

    document.getElementById('result-emoji').textContent   = emoji;
    document.getElementById('result-message').textContent = msg;
    show('result');
  });

})();
