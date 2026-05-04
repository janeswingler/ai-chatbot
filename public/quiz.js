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
const initializedCalculators = new Set();
const calculators = {};

function logEvent(eventType, elementName) {
  if (!participantID) return;
  fetch('/log-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantID, eventType, elementName, timestamp: new Date() })
  }).catch(() => {});
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

// ============= CALCULATOR (ported from compoundify, see NOTES.md) =============
function extractBraces(str, start) {
  if (str[start] !== '{') return { content: '', end: start };
  let depth = 0, i = start, content = '';
  while (i < str.length) {
    const ch = str[i];
    if (ch === '{') {
      if (depth > 0) content += ch;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return { content, end: i };
      content += ch;
    } else if (depth > 0) {
      content += ch;
    }
    i++;
  }
  return { content, end: i };
}

function extractArg(str, start) {
  let i = start;
  while (i < str.length && /\s/.test(str[i])) i++;
  if (i >= str.length) return { content: '', end: i - 1 };
  if (str[i] === '{') return extractBraces(str, i);
  if (str[i] === '\\') {
    let j = i + 1;
    while (j < str.length && /[a-zA-Z]/.test(str[j])) j++;
    return { content: str.slice(i, j), end: j - 1 };
  }
  return { content: str[i], end: i };
}

function latexToMathJs(latex) {
  let result = '', i = 0;
  const s = latex.trim();
  while (i < s.length) {
    if (s[i] === '\\') {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      const cmd = s.slice(i + 1, j);

      if (cmd === '') { i = j; continue; }

      if (cmd === 'frac') {
        const num = extractArg(s, j); j = num.end + 1;
        const den = extractArg(s, j); j = den.end + 1;
        const numMath = latexToMathJs(num.content);
        const denMath = latexToMathJs(den.content);
        if (!numMath.trim() || !denMath.trim()) throw new Error('Fill in placeholder');
        result += `((${numMath})/(${denMath}))`;
        i = j;
      } else if (cmd === 'sqrt') {
        if (s[j] === '[') {
          const nEnd = s.indexOf(']', j);
          const n = s.slice(j + 1, nEnd); j = nEnd + 1;
          const arg = extractArg(s, j); j = arg.end + 1;
          const argMath = latexToMathJs(arg.content);
          const nMath   = latexToMathJs(n);
          if (!argMath.trim() || !nMath.trim()) throw new Error('Fill in placeholder');
          result += `nthRoot(${argMath},${nMath})`; i = j;
        } else {
          const arg = extractArg(s, j); j = arg.end + 1;
          const argMath = latexToMathJs(arg.content);
          if (!argMath.trim()) throw new Error('Fill in placeholder');
          result += `sqrt(${argMath})`; i = j;
        }
      } else if (cmd === 'placeholder') {
        if (s[j] === '[') { const close = s.indexOf(']', j); j = close === -1 ? j + 1 : close + 1; }
        if (s[j] === '{') { const arg = extractBraces(s, j); j = arg.end + 1; }
        i = j;
      } else if (cmd === 'times' || cmd === 'cdot') { result += '*'; i = j; }
      else if (cmd === 'div') { result += '/';  i = j; }
      else if (cmd === 'left' || cmd === 'right') { i = j; }
      else { throw new Error('Unsupported: \\' + cmd); }
    } else if (s[i] === '^') {
      if (!result.trim()) throw new Error('Fill in placeholder');
      if (s[i + 1] === '{') {
        const arg = extractBraces(s, i + 1);
        const argMath = latexToMathJs(arg.content);
        if (!argMath.trim()) throw new Error('Fill in placeholder');
        result += `^(${argMath})`; i = arg.end + 1;
      } else { result += '^'; i++; }
    } else if (s[i] === '_') {
      if (s[i + 1] === '{') {
        const arg = extractBraces(s, i + 1);
        i = arg.end + 1;
      } else if (i + 1 < s.length) {
        i += 2;
      } else {
        i += 1;
      }
    } else if (s[i] === '{') {
      const arg = extractBraces(s, i);
      result += `(${latexToMathJs(arg.content)})`; i = arg.end + 1;
    } else {
      result += s[i]; i++;
    }
  }
  return result;
}

function findLastAtom(str) {
  if (!str) return '';
  let i = str.length;
  while (i > 0 && /\s/.test(str[i - 1])) i--;
  if (i === 0) return '';
  const last = str[i - 1];
  if (last === ')') {
    let depth = 1, k = i - 1;
    while (k > 0 && depth > 0) {
      k--;
      if (str[k] === ')') depth++;
      else if (str[k] === '(') depth--;
    }
    return str.slice(k, i);
  }
  if (last === '}') {
    let depth = 1, k = i - 1;
    while (k > 0 && depth > 0) {
      k--;
      if (str[k] === '}') depth++;
      else if (str[k] === '{') depth--;
    }
    let cmdStart = k;
    while (cmdStart > 0 && /[a-zA-Z]/.test(str[cmdStart - 1])) cmdStart--;
    if (cmdStart > 0 && str[cmdStart - 1] === '\\') cmdStart--;
    return str.slice(cmdStart, i);
  }
  if (/[0-9a-zA-Z.]/.test(last)) {
    let k = i - 1;
    while (k > 0 && /[0-9a-zA-Z.]/.test(str[k - 1])) k--;
    return str.slice(k, i);
  }
  return '';
}

function symButtonInsert(payload, mathField) {
  if (!payload) return;
  if (!payload.includes('#0')) {
    mathField.insert(payload);
    return;
  }
  const value = mathField.value;
  const atom = findLastAtom(value);
  if (atom) {
    const before = value.slice(0, value.length - atom.length);
    mathField.value = before;
    mathField.executeCommand('moveToMathFieldEnd');
    mathField.insert(payload.replace(/#0/g, atom));
  } else {
    mathField.insert(payload.replace(/#0/g, '#?'));
  }
}

function hideMathLiveToolbar(mathField) {
  if (!mathField.shadowRoot) return;
  if (mathField.shadowRoot.querySelector('#no-vkb')) return;
  const s = document.createElement('style');
  s.id = 'no-vkb';
  s.textContent = `
    .ML__virtual-keyboard-toggle,
    [part="virtual-keyboard-toggle"],
    [part="menu-toggle"],
    .ML__menu-toggle,
    .ML__toolbar { display: none !important; }
  `;
  mathField.shadowRoot.appendChild(s);
}

function initializeCalculator(questionNum) {
  if (initializedCalculators.has(questionNum)) return;
  initializedCalculators.add(questionNum);

  const mathField    = document.getElementById(`math-field-q${questionNum}`);
  const calcBtn      = document.querySelector(`.calc-btn[data-question="q${questionNum}"]`);
  const clearBtn     = document.querySelector(`.clear-btn[data-question="q${questionNum}"]`);
  const resultDiv    = document.getElementById(`math-result-q${questionNum}`);
  const resultValue  = document.getElementById(`math-result-value-q${questionNum}`);
  const panel        = mathField.closest('.math-panel-quiz');
  const container    = document.getElementById(`q${questionNum}-container`);

  let lastResultLatex = '';
  let suppressInputClear = false;

  customElements.whenDefined('math-field').then(() => {
    mathField.mathVirtualKeyboardPolicy = 'off';
    requestAnimationFrame(() => hideMathLiveToolbar(mathField));
    mathField.addEventListener('focus', () => hideMathLiveToolbar(mathField));
  });

  mathField.addEventListener('focusin', () => {
    if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.visible = false;
  });
  mathField.addEventListener('virtual-keyboard-toggle', () => {
    if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.visible = false;
  });

  function showResult(latexOut) {
    lastResultLatex = latexOut;
    resultValue.innerHTML = `\\(${latexOut}\\)`;
    resultDiv.classList.add('active');
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([resultValue]);
  }

  function showError(message) {
    lastResultLatex = '';
    resultValue.textContent = message;
    resultDiv.classList.add('active');
  }

  function runCalculate() {
    const latex = mathField.value;
    if (!latex) return;
    try {
      const expr = latexToMathJs(latex);
      if (!expr.trim()) throw new Error('Fill in placeholder');

      const raw = math.evaluate(expr);
      const formatted = math.format(raw, { precision: 10 });

      let latexOut;
      try {
        latexOut = (raw && typeof raw.toTex === 'function')
          ? raw.toTex({ precision: 10 })
          : math.parse(formatted).toTex({ parenthesis: 'auto' });
      } catch (_) {
        latexOut = String(formatted);
      }
      showResult(latexOut);
    } catch (e) {
      showError((e && e.message) ? e.message : 'Cannot evaluate');
    }
  }

  calcBtn.addEventListener('click', () => {
    logEvent('click', `Math Calculate (q${questionNum})`);
    runCalculate();
  });

  clearBtn.addEventListener('click', () => {
    logEvent('click', `Math Clear (q${questionNum})`);
    mathField.value = '';
    resultDiv.classList.remove('active');
    lastResultLatex = '';
    mathField.focus();
  });

  mathField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      logEvent('keypress', `Math Field Return (q${questionNum})`);
      suppressInputClear = true;
      calcBtn.click();
    }
  });

  mathField.addEventListener('input', () => {
    if (suppressInputClear) {
      suppressInputClear = false;
      return;
    }
    resultDiv.classList.remove('active');
    lastResultLatex = '';
  });

  if (panel) {
    panel.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, .math-symbols-quiz')) return;
      if (e.target === mathField) return;
      mathField.focus();
    });
  }

  const symBtns = container.querySelectorAll('.math-symbols-quiz .sym-btn');
  symBtns.forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const label = btn.textContent.trim();
      logEvent('click', `Math Symbol: ${label} (q${questionNum})`);
      if (btn.dataset.negate) {
        const value = mathField.value;
        const atom = findLastAtom(value);
        if (atom) {
          const before = value.slice(0, value.length - atom.length);
          mathField.value = before + '-' + atom;
          mathField.executeCommand('moveToMathFieldEnd');
        } else {
          mathField.insert('-');
        }
      } else if (btn.dataset.cmd) {
        mathField.executeCommand(btn.dataset.cmd);
      } else if (btn.dataset.latex) {
        symButtonInsert(btn.dataset.latex, mathField);
      }
      mathField.focus();
    });
  });

  calculators[questionNum] = { mathField, resultDiv, clear: () => clearBtn.click() };
}

// Global Option+C clears the active question's math field. Capture phase + e.code
// so we beat MathLive's listener and stay layout-independent on Mac.
function sweepStrayDeadKey(mathField) {
  const v = mathField.value;
  if (v === 'ˆ' || v === 'ç' || v === '˙' || v === 'ø') mathField.value = '';
}
window.addEventListener('keydown', (e) => {
  if (!e.altKey) return;
  if (e.code !== 'KeyC') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const active = calculators[currentQuestion + 1];
  if (!active) return;
  logEvent('keypress', `Math Option+C (q${currentQuestion + 1})`);
  active.clear();
  setTimeout(() => sweepStrayDeadKey(active.mathField), 0);
}, { capture: true });

// ============= QUIZ NAVIGATION =============
const welcomeScreen = document.getElementById('welcome-screen');
const startBtn = document.getElementById('start-quiz-btn');
const counterSpan = document.getElementById('counter');
const progressBar = document.getElementById('progress-bar');
const answerInputs = Array.from({ length: totalQuestions }, (_, index) => document.getElementById(`answer-q${index + 1}`));
const nextQuestionBtns = Array.from(document.querySelectorAll('.quiz-next-question-btn'));

function saveCurrentAnswer() {
  const questionNum = currentQuestion + 1;
  const answerField = document.getElementById(`answer-q${questionNum}`);
  const answer = answerField.value.trim();

  if (!answer) {
    alert('Please enter an answer before continuing.');
    return false;
  }

  answers[`q${questionNum}`] = answer;
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

nextQuestionBtns.forEach((button) => {
  button.addEventListener('click', () => {
    const questionNumber = Number(button.dataset.question);
    if (Number.isFinite(questionNumber) && questionNumber === currentQuestion + 1) {
      advanceQuestion();
    }
  });
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
  document.querySelectorAll('.quiz-question-container').forEach(el => {
    el.classList.remove('active');
  });

  document.getElementById(`q${index + 1}-container`).classList.add('active');

  counterSpan.textContent = `${index + 1} / ${totalQuestions}`;
  const progress = ((index + 1) / totalQuestions) * 100;
  progressBar.style.width = progress + '%';

  // Scroll to top
  document.querySelector('.quiz-content').scrollTop = 0;

  nextQuestionBtns.forEach((button) => {
    const questionNumber = Number(button.dataset.question);
    button.style.display = questionNumber === index + 1 ? 'inline-flex' : 'none';
  });

  const activeAnswer = document.getElementById(`answer-q${index + 1}`);
  if (activeAnswer) {
    requestAnimationFrame(() => activeAnswer.focus());
  }
}

// ============= QUIZ SUBMISSION =============
async function submitQuiz() {
  const finalQuestionNum = currentQuestion + 1;
  const currentAnswer = document.getElementById(`answer-q${finalQuestionNum}`).value.trim();
  if (currentAnswer) {
    answers[`q${finalQuestionNum}`] = currentAnswer;
  }

  // Validate all answers are filled
  const hasInvalid = Object.values(answers).some(value => typeof value !== 'string' || value.trim() === '');
  if (hasInvalid) {
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

    const qs = new URLSearchParams();
    qs.set('participantID', participantID);
    if (systemID) qs.set('systemID', systemID);
    qs.set('completed', 'post-task-quiz');
    qs.set('quizSubmitted', '1');
    qs.set('timeSpent', String(timeSpent));
    qs.set('tabSwitchCount', String(tabSwitchCount));
    if (payload && payload.quizId) qs.set('quizId', String(payload.quizId));

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
