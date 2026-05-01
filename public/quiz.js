const params = new URLSearchParams(window.location.search);
const participantID = params.get('participantID') || localStorage.getItem('participantID');
const systemID = params.get('systemID') || localStorage.getItem('systemID');

if (!participantID) {
  alert('No participant ID found.');
  window.location.href = '/';
}

// ============= STATE =============
let currentQuestion = 0;
const totalQuestions = 6;
let tabSwitchCount = 0;
let tabSwitches = [];
let quizStartTime = null;
let answers = { q1: null, q2: null, q3: null, q4: null, q5: null, q6: null };
let mathStates = {};
const initializedCalculators = new Set();

function normalizeMathExpression(rawExpression) {
  let expression = String(rawExpression || '').trim();

  expression = expression
    .replace(/\\cdot|·/g, '*')
    .replace(/\\div|÷/g, '/')
    .replace(/\\left|\\right/g, '')
    .replace(/\s+/g, '');

  while (/\\sqrt\{([^{}]+)\}/.test(expression)) {
    expression = expression.replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');
  }

  while (/\\frac\{([^{}]+)\}\{([^{}]+)\}/.test(expression)) {
    expression = expression.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
  }

  expression = expression.replace(/\^\{([^{}]+)\}/g, '^($1)');

  return expression;
}

// ============= TAB-SWITCHING DETECTION =============
const tabWarning = document.getElementById('tab-warning');

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    tabSwitchCount++;
    tabSwitches.push({ timestamp: new Date().toISOString(), action: 'tab_lost_focus' });
  } else {
    if (tabSwitchCount > 0) {
      tabSwitches.push({ timestamp: new Date().toISOString(), action: 'tab_regained_focus' });
      showTabWarning();
    }
  }
});

function showTabWarning() {
  tabWarning.style.display = 'block';
  setTimeout(() => {
    tabWarning.style.display = 'none';
  }, 4000);
}

// ============= CALCULATOR FOR EACH QUESTION =============
function initializeCalculator(questionNum) {
  if (initializedCalculators.has(questionNum)) {
    return;
  }
  initializedCalculators.add(questionNum);

  const mathField = document.getElementById(`math-field-q${questionNum}`);
  const calcBtn = document.querySelector(`.calc-btn[data-question="q${questionNum}"]`);
  const clearBtn = document.querySelector(`.clear-btn[data-question="q${questionNum}"]`);
  const resultDiv = document.getElementById(`math-result-q${questionNum}`);
  const resultValue = document.getElementById(`math-result-value-q${questionNum}`);

  function hideMathLiveToolbar() {
    if (!mathField.shadowRoot) return;
    if (mathField.shadowRoot.querySelector('#no-vkb')) return;
    const style = document.createElement('style');
    style.id = 'no-vkb';
    style.textContent = `
      .ML__virtual-keyboard-toggle,
      [part="virtual-keyboard-toggle"],
      [part="menu-toggle"],
      .ML__menu-toggle,
      .ML__toolbar { display: none !important; }
    `;
    mathField.shadowRoot.appendChild(style);
  }

  // Initialize math field state
  if (!mathStates[questionNum]) {
    mathStates[questionNum] = { expression: '', result: null };
  }

  customElements.whenDefined('math-field').then(() => {
    mathField.mathVirtualKeyboardPolicy = 'manual';
    requestAnimationFrame(hideMathLiveToolbar);
    mathField.addEventListener('focus', hideMathLiveToolbar);
  });

  mathField.addEventListener('focusin', () => {
    if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.visible = false;
  });
  mathField.addEventListener('virtual-keyboard-toggle', () => {
    if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.visible = false;
  });
  window.addEventListener('virtual-keyboard-toggle', () => {
    if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.visible = false;
  });

  calcBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // Prefer MathLive's LaTeX output when available, otherwise use the field value
    let rawValue = mathField && typeof mathField.getValue === 'function'
      ? mathField.getValue('latex')
      : (mathField.value || '');

    // Strip common LaTeX delimiters if present
    rawValue = rawValue.replace(/^\$+/, '').replace(/\$+$/, '');
    rawValue = rawValue.replace(/^\\\(|\\\)$/, '');

    // Normalize the MathLive output to a math.js-friendly expression
    let expression = normalizeMathExpression(rawValue);
    if (!expression) return;

    // Additional unicode replacements
    expression = expression
      .replace(/√\s*([0-9.()]+)/g, 'sqrt($1)')
      .replace(/[×✕✖]/g, '*')
      .replace(/[−–—]/g, '-')
      .replace(/²/g, '^2')
      .replace(/³/g, '^3')
      .replace(/\u2062/g, '*'); // invisible times

    // Debug: log raw and normalized expression for troubleshooting
    console.log('[quiz] calc raw:', rawValue, '-> normalized:', expression);

    try {
      const result = math.evaluate(expression);
      const formatted = math.format(result, { precision: 10 });
      mathStates[questionNum].result = formatted;
      resultValue.textContent = formatted;
      resultDiv.classList.add('active');
    } catch (err) {
      // Try a looser fallback: strip non-ascii and re-evaluate
      try {
        const alt = expression.replace(/[^\x00-\x7F]/g, ''); // strip remaining non-ascii
        console.log('[quiz] fallback alt:', alt);
        const result = math.evaluate(alt);
        const formatted = math.format(result, { precision: 10 });
        mathStates[questionNum].result = formatted;
        resultValue.textContent = formatted;
        resultDiv.classList.add('active');
      } catch (err2) {
        // Sqrt-specific fallback: if expression is sqrt(number)
        try {
          const m = expression.match(/^\s*sqrt\(([^)]+)\)\s*$/i);
          if (m) {
            const n = parseFloat(m[1]);
            if (!Number.isNaN(n)) {
              const r = Math.sqrt(n);
              const formatted = math.format(r, { precision: 10 });
              mathStates[questionNum].result = formatted;
              resultValue.textContent = formatted;
              resultDiv.classList.add('active');
              return;
            }
          }
        } catch (err3) {
          console.warn('[quiz] sqrt fallback error', err3);
        }

        console.warn('[quiz] calc errors', err, err2);
        resultValue.textContent = 'Error in calculation';
        resultDiv.classList.add('active');
      }
    }
  });

  clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    mathField.value = '';
    mathStates[questionNum].expression = '';
    mathStates[questionNum].result = null;
    resultDiv.classList.remove('active');
  });

  // Keyboard support: Enter to calculate
  mathField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      calcBtn.click();
    }
  });

  // Symbol button handling - insert LaTeX into math field
  const questionContainer = document.getElementById(`q${questionNum}-container`);
  const symBtns = questionContainer.querySelectorAll('.sym-btn');
  symBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const latex = btn.dataset.latex;
      if (latex) {
        mathField.insert(latex);
        mathField.focus();
      }
    });
  });
}

// ============= QUIZ NAVIGATION =============
const welcomeScreen = document.getElementById('welcome-screen');
const startBtn = document.getElementById('start-quiz-btn');
const counterSpan = document.getElementById('counter');
const progressBar = document.getElementById('progress-bar');
const answerInputs = Array.from({ length: totalQuestions }, (_, index) => document.getElementById(`answer-q${index + 1}`));

function saveCurrentAnswer() {
  const answerField = document.getElementById(`answer-q${currentQuestion + 1}`);
  const answer = answerField.value.trim();

  if (!answer) {
    alert('Please enter an answer before continuing.');
    return false;
  }

  const parsedAnswer = parseFloat(answer);
  if (!Number.isFinite(parsedAnswer)) {
    alert('Please enter a valid number before continuing.');
    return false;
  }

  answers[`q${currentQuestion + 1}`] = parsedAnswer;
  return true;
}

function advanceQuestion() {
  if (!saveCurrentAnswer()) {
    return;
  }

  if (currentQuestion < totalQuestions - 1) {
    currentQuestion++;
    showQuestion(currentQuestion);
    initializeCalculator(currentQuestion + 1);
    document.getElementById(`answer-q${currentQuestion + 1}`).focus();
  } else {
    submitQuiz();
  }
}

startBtn.addEventListener('click', () => {
  quizStartTime = new Date();
  welcomeScreen.style.display = 'none';
  showQuestion(0);
  initializeCalculator(1);
  document.getElementById('answer-q1').focus();
});

answerInputs.forEach((input, index) => {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();

      if (index === currentQuestion) {
        advanceQuestion();
      }
    }
  });
});

function showQuestion(index) {
  // Hide all questions
  document.querySelectorAll('.quiz-question-container').forEach(el => {
    el.classList.remove('active');
  });

  // Show current question
  document.getElementById(`q${index + 1}-container`).classList.add('active');

  // Update counter and progress bar
  counterSpan.textContent = `${index + 1} / ${totalQuestions}`;
  const progress = ((index + 1) / totalQuestions) * 100;
  progressBar.style.width = progress + '%';

  // Scroll to top
  document.querySelector('.quiz-content').scrollTop = 0;

  const activeAnswer = document.getElementById(`answer-q${index + 1}`);
  if (activeAnswer) {
    requestAnimationFrame(() => activeAnswer.focus());
  }
}

// ============= QUIZ SUBMISSION =============
async function submitQuiz() {
  const currentAnswer = document.getElementById(`answer-q${currentQuestion + 1}`).value.trim();
  if (currentAnswer) {
    const parsedAnswer = parseFloat(currentAnswer);
    if (!Number.isFinite(parsedAnswer)) {
      alert('Please enter a valid number before submitting.');
      return;
    }
    answers[`q${currentQuestion + 1}`] = parsedAnswer;
  }

  // Validate all answers are filled
  const invalidAnswers = Object.values(answers).filter(v => v === null || !Number.isFinite(v)).length;
  if (invalidAnswers > 0) {
    alert('Please answer all questions before submitting.');
    return;
  }

  const timeSpent = Math.round((new Date() - quizStartTime) / 1000);

  try {
    const res = await fetch('/submit-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantID,
        systemID,
        answers,
        tabSwitchCount,
        tabSwitches,
        timeSpent,
      })
    });

    if (!res.ok) {
      throw new Error('Failed to submit quiz');
    }

    const payload = await res.json().catch(() => ({}));

    // Log event
    await fetch('/log-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantID,
        eventType: 'quiz_completed',
        elementName: 'post_task_quiz',
        timestamp: new Date()
      })
    }).catch(() => {});

    // Redirect back to the study workflow and pass embedded data so the workflow
    // can mark the quiz step complete and receive metadata about the quiz.
    const qs = new URLSearchParams();
    qs.set('participantID', participantID);
    if (systemID) qs.set('systemID', systemID);
    qs.set('completed', 'post-task-quiz');
    qs.set('quizSubmitted', '1');
    qs.set('timeSpent', String(timeSpent));
    qs.set('tabSwitchCount', String(tabSwitchCount));
    if (payload && payload.quizId) qs.set('quizId', String(payload.quizId));

    // Use replace to avoid back-button confusion
    window.location.replace(`/study-workflow.html?${qs.toString()}`);
  } catch (err) {
    console.error('Quiz submission error:', err);
    alert('Failed to submit quiz. Please try again.');
  }
}

function redirectToQualtrics(surveyType) {
  fetch('/redirect-to-survey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantID, systemID, surveyType })
  })
    .then(r => {
      if (!r.ok) return r.text().then(msg => { throw new Error(msg); });
      return r.text();
    })
    .then(url => {
      window.location.href = url;
    })
    .catch(err => alert('Could not redirect to survey: ' + err.message));
}
