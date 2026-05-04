const params = new URLSearchParams(window.location.search);
const participantID = params.get('participantID') || localStorage.getItem('participantID');
const systemID = params.get('systemID') || localStorage.getItem('systemID');

if (!participantID) {
  alert('No participant ID found.');
  window.location.href = '/';
}

function logEvent(type, element) {
  fetch('/log-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantID, eventType: type, elementName: element, timestamp: new Date() })
  }).catch(() => {});
}

function redirectToQualtrics(surveyType) {
  // Collect additional embedded fields if present in the current page URL
  const srcParams = new URLSearchParams(window.location.search);
  const extras = {};
  ['completed','quizSubmitted','timeSpent','tabSwitchCount','quizId'].forEach(k => {
    const v = srcParams.get(k);
    if (v !== null) extras[k] = v;
  });

  const body = Object.assign({ participantID, systemID, surveyType }, extras);

  fetch('/redirect-to-survey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
    .then(r => {
      if (!r.ok) return r.text().then(msg => { throw new Error(msg); });
      return r.text();
    })
    .then(url => { logEvent('redirect', surveyType + '-survey'); window.location.href = url; })
    .catch(err => alert('Could not open survey: ' + err.message));
}

const PROGRESS_KEY = `studyProgress_${participantID}`;

function getProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch { return {}; }
}

function markStepComplete(step) {
  const progress = getProgress();
  progress[step] = true;
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  applyStepDone(step);
}

function applyStepDone(step) {
  const li = document.getElementById('step-' + step);
  const badge = document.getElementById('badge-' + step);
  if (li) li.classList.add('step-done');
  if (badge) badge.textContent = '✓ Completed';
}

function restoreProgress() {
  const progress = getProgress();
  Object.keys(progress).forEach(step => { if (progress[step]) applyStepDone(step); });
}

const completedStep = params.get('completed');
if (completedStep) markStepComplete(completedStep);
restoreProgress();

const demographicsBtn = document.getElementById('demographics-btn');
if (demographicsBtn) demographicsBtn.addEventListener('click', () => redirectToQualtrics('demographics'));

const preTaskBtn = document.getElementById('pre-task-btn');
if (preTaskBtn) preTaskBtn.addEventListener('click', () => redirectToQualtrics('pre-task'));

const taskBtn = document.getElementById('task-btn');
if (taskBtn) taskBtn.addEventListener('click', () => {
  markStepComplete('task');
  window.location.href = '/task.html';
});

const prototypeBtn = document.getElementById('prototype-btn');
if (prototypeBtn) {
  prototypeBtn.addEventListener('click', () => {
    markStepComplete('prototype');
    const dest = String(systemID) === '1'
      ? `https://ai-chatbot-fv7e.onrender.com/chat.html?participantID=${encodeURIComponent(participantID)}&systemID=${encodeURIComponent(systemID)}`
      : `https://compoundify.onrender.com/?participantID=${encodeURIComponent(participantID)}&systemID=${encodeURIComponent(systemID)}`;
    window.location.href = dest;
  });
}

const postTaskQuizBtn = document.getElementById('post-task-quiz-btn');
if (postTaskQuizBtn) {
  postTaskQuizBtn.addEventListener('click', () => {
    markStepComplete('post-task-quiz');
    window.location.href = `/quiz.html?participantID=${encodeURIComponent(participantID)}&systemID=${encodeURIComponent(systemID)}`;
  });
}

const postTaskBtn = document.getElementById('post-task-btn');
if (postTaskBtn) postTaskBtn.addEventListener('click', () => redirectToQualtrics('post-task'));

if (document.getElementById('messages')) {

const SESSION_UNLOCK_SECONDS = 10;
const timerEl = document.getElementById('topbar-timer');
const returnBtn = document.getElementById('topbar-return');
const sessionStart = Date.now();
function updateSessionTimer() {
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  timerEl.textContent = `${mm}:${ss}`;
  if (elapsed >= SESSION_UNLOCK_SECONDS && returnBtn.disabled) {
    returnBtn.disabled = false;
  }
}
updateSessionTimer();
setInterval(updateSessionTimer, 1000);

returnBtn.addEventListener('click', () => {
  logEvent('click', 'Return Button');
  const url = `https://ai-chatbot-fv7e.onrender.com/study-workflow.html?participantID=${encodeURIComponent(participantID)}&systemID=${encodeURIComponent(systemID || '')}`;
  window.location.href = url;
});

const RIGHT_W_KEY = 'ai_right_w';
(function restoreColumnWidth() {
  const rw = localStorage.getItem(RIGHT_W_KEY);
  if (rw) document.documentElement.style.setProperty('--right-w', rw);
})();

(function initResizer() {
  const resizer = document.getElementById('resizer-right');
  const root = document.documentElement;
  const MIN = 160, MAX = 600;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startPx = parseInt(getComputedStyle(root).getPropertyValue('--right-w'));
    resizer.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const delta = startX - e.clientX;
      const newW = Math.max(MIN, Math.min(MAX, startPx + delta)) + 'px';
      root.style.setProperty('--right-w', newW);
      localStorage.setItem(RIGHT_W_KEY, newW);
    }
    function onUp() {
      resizer.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  resizer.addEventListener('dblclick', () => {
    root.style.setProperty('--right-w', '260px');
    localStorage.setItem(RIGHT_W_KEY, '260px');
  });
})();

let conversationHistory = [];
let msgCounter = 0;
let notesData = [];
let editingNoteId = null;
let composerMinimized = false;
let composerExpanded = false;

const messagesEl          = document.getElementById('messages');
const userInput           = document.getElementById('user-input');
const sendBtn             = document.getElementById('send-btn');
const typingEl            = document.getElementById('typing-indicator');
const notesList           = document.getElementById('notes-list');
const noteComposer        = document.getElementById('note-composer');
const noteComposerHeader  = document.getElementById('note-composer-header');
const noteComposerTitleEl = document.getElementById('note-composer-title');
const noteComposerTitleInput = document.getElementById('note-composer-title-input');
const noteComposerContent = document.getElementById('note-composer-content');
const noteComposerIsFormula = document.getElementById('note-composer-is-formula');

userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
});

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    logEvent('keypress', 'Enter Key');
    handleSend();
  }
});

const mathPanel      = document.getElementById('math-panel');
const mathField      = document.getElementById('math-field');
const mathToggleBtn  = document.getElementById('math-toggle-btn');
const mathToggleIcon = document.getElementById('math-toggle-icon');
const mathInsertBtn  = document.getElementById('math-insert-btn');

// Inject CSS into the shadow DOM to hide the toggle + menu buttons
function hideMathLiveToolbar() {
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

customElements.whenDefined('math-field').then(() => {
  mathField.mathVirtualKeyboardPolicy = 'off';
  requestAnimationFrame(hideMathLiveToolbar);
  mathField.addEventListener('focus', hideMathLiveToolbar);
});

// If the keyboard somehow opens, force-close it immediately
mathField.addEventListener('focusin', () => {
  if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.visible = false;
});
mathField.addEventListener('virtual-keyboard-toggle', () => {
  if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.visible = false;
});
window.addEventListener('virtual-keyboard-toggle', () => {
  if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.visible = false;
});

// Panel is open by default; chevron points up (minimise). When closed, points down (restore).
const CHEVRON_UP   = `<polyline points="18 15 12 9 6 15"/>`;
const CHEVRON_DOWN = `<polyline points="6 9 12 15 18 9"/>`;

function showMathPanel(show) {
  mathPanel.style.display = show ? 'block' : 'none';
  mathToggleIcon.innerHTML = show ? CHEVRON_UP : CHEVRON_DOWN;
  mathToggleBtn.title = show ? 'Minimise math panel' : 'Show math panel';
  if (show) mathField.focus();
}

mathToggleBtn.addEventListener('click', () => {
  logEvent('click', 'Math Panel Toggle');
  showMathPanel(mathPanel.style.display === 'none');
});

const CLOSE_SVG = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="7" y2="7"/><line x1="7" y1="1" x2="1" y2="7"/></svg>`;

function sanitizeLatex(s) {
  if (!s) return '';
  s = String(s);
  const m = s.match(/\\+$/);
  if (m && m[0].length % 2 === 1) s = s.slice(0, -1);
  return s;
}

function addMathChip(latex) {
  latex = sanitizeLatex(latex);
  if (!latex) return;
  const chipsEl = document.getElementById('math-chips');
  chipsEl.style.display = 'flex';
  const chip = document.createElement('span');
  chip.className = 'math-chip';
  chip.dataset.latex = latex;
  chip.innerHTML = `<span class="math-chip__preview">\\(${latex}\\)</span><button class="math-chip__remove" type="button" title="Remove">${CLOSE_SVG}</button>`;
  chip.querySelector('.math-chip__remove').addEventListener('click', () => {
    chip.remove();
    if (chipsEl.children.length === 0) chipsEl.style.display = 'none';
  });
  chipsEl.appendChild(chip);
  MathJax.typesetPromise([chip]);
}

mathInsertBtn.addEventListener('click', () => {
  logEvent('click', 'Math Insert');
  const latex = lastResultLatex || mathField.value;
  if (!latex) return;
  addMathChip(latex);
  mathField.value = '';
  mathResultEl.style.display = 'none';
  lastResultLatex = '';
  mathField.focus();
});

document.getElementById('math-clear-btn').addEventListener('click', () => {
  logEvent('click', 'Math Clear');
  mathField.value = '';
  mathResultEl.style.display = 'none';
  lastResultLatex = '';
  mathField.focus();
});

let suppressInputClear = false;

mathField.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    logEvent('keypress', 'Math Field Return');
    suppressInputClear = true;
    document.getElementById('math-calc-btn').click();
  }
});


function sweepStrayDeadKey() {
  const v = mathField.value;
  if (v === 'ˆ' || v === 'ç' || v === '˙' || v === 'ø') mathField.value = '';
}
window.addEventListener('keydown', (e) => {
  if (!e.altKey) return;
  if (e.code === 'KeyC') {
    e.preventDefault();
    e.stopImmediatePropagation();
    logEvent('keypress', 'Math Option+C');
    document.getElementById('math-clear-btn').click();
    setTimeout(sweepStrayDeadKey, 0);
  } else if (e.code === 'KeyI') {
    e.preventDefault();
    e.stopImmediatePropagation();
    logEvent('keypress', 'Math Option+I');
    mathInsertBtn.click();
    setTimeout(sweepStrayDeadKey, 0);
  }
}, { capture: true });

mathPanel.addEventListener('mousedown', (e) => {
  if (e.target.closest('button, .math-chip, .math-symbols')) return;
  if (e.target === mathField) return;
  mathField.focus();
});

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

const mathResultEl      = document.getElementById('math-result');
const mathResultValue   = document.getElementById('math-result-value');
let lastResultLatex = '';

document.getElementById('math-calc-btn').addEventListener('click', () => {
  logEvent('click', 'Math Calculate');
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
    latexOut = sanitizeLatex(latexOut);

    lastResultLatex = latexOut;
    mathResultValue.innerHTML = `\\(${latexOut}\\)`;
    mathResultEl.style.display = 'flex';
    MathJax.typesetPromise([mathResultValue]);
  } catch (e) {
    mathResultValue.textContent = (e && e.message) ? e.message : 'Cannot evaluate';
    mathResultEl.style.display = 'flex';
    lastResultLatex = '';
  }
});

mathField.addEventListener('input', () => {
  if (suppressInputClear) {
    suppressInputClear = false;
    return;
  }
  mathResultEl.style.display = 'none';
  lastResultLatex = '';
});

function findLastAtom(str) {
  function start(end) {
    while (end > 0 && /\s/.test(str[end - 1])) end--;
    if (end === 0) return 0;
    const last = str[end - 1];

    if (last === ')') {
      let depth = 1, k = end - 1;
      while (k > 0 && depth > 0) {
        k--;
        if (str[k] === ')') depth++;
        else if (str[k] === '(') depth--;
      }

      let p = k;
      while (p > 0 && /\s/.test(str[p - 1])) p--;
      if (p >= 5 && str.slice(p - 5, p) === '\\left') return p - 5;
      return k;
    }

    if (last === '}' || last === ']') {
      const closing = last;
      const opening = closing === '}' ? '{' : '[';
      let depth = 1, k = end - 1;
      while (k > 0 && depth > 0) {
        k--;
        if (str[k] === closing) depth++;
        else if (str[k] === opening) depth--;
      }

      while (k > 0) {
        let q = k;
        while (q > 0 && /\s/.test(str[q - 1])) q--;
        if (q === 0) break;
        const c2 = str[q - 1];
        if (c2 !== '}' && c2 !== ']') break;
        const o2 = c2 === '}' ? '{' : '[';
        let d2 = 1, kk = q - 1;
        while (kk > 0 && d2 > 0) {
          kk--;
          if (str[kk] === c2) d2++;
          else if (str[kk] === o2) d2--;
        }
        k = kk;
      }

      let cmdStart = k;
      while (cmdStart > 0 && /[a-zA-Z]/.test(str[cmdStart - 1])) cmdStart--;
      if (cmdStart > 0 && str[cmdStart - 1] === '\\') return cmdStart - 1;

      if (k > 0 && (str[k - 1] === '^' || str[k - 1] === '_')) {
        return start(k - 1);
      }
      return k;
    }

    if (/[0-9a-zA-Z.]/.test(last)) {
      let k = end - 1;
      while (k > 0 && /[0-9a-zA-Z.]/.test(str[k - 1])) k--;

      if (k > 0 && str[k - 1] === '\\') return end;

      if (k > 0 && (str[k - 1] === '^' || str[k - 1] === '_')) {
        return start(k - 1);
      }
      return k;
    }

    return end; 
  }

  if (!str) return '';
  let i = str.length;
  while (i > 0 && /\s/.test(str[i - 1])) i--;
  if (i === 0) return '';
  const k = start(i);
  if (k === i) return '';
  return str.slice(k, i);
}


function hasValueOnLeft() {
  return findLastAtom(mathField.value) !== '';
}


function symButtonInsert(payload) {
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

document.querySelectorAll('.sym-btn').forEach(btn => {
  if (btn.id === 'math-negate-btn') return;
  btn.addEventListener('mousedown', e => {
    e.preventDefault();
    logEvent('click', 'Math Symbol: ' + btn.textContent.trim());
    if (btn.dataset.cmd) {
      mathField.executeCommand(btn.dataset.cmd);
    } else {
      symButtonInsert(btn.dataset.latex);
    }
    mathField.focus();
  });
});


document.getElementById('math-negate-btn').addEventListener('mousedown', (e) => {
  e.preventDefault();
  logEvent('click', 'Math Symbol: (-)');
  const value = mathField.value;
  const atom = findLastAtom(value);
  if (atom) {
    const before = value.slice(0, value.length - atom.length);
    mathField.value = before + '-' + atom;
    mathField.executeCommand('moveToMathFieldEnd');
  } else {
    mathField.insert('-');
  }
  mathField.focus();
});

sendBtn.addEventListener('click', () => {
  logEvent('click', 'Send Button');
  handleSend();
});

async function handleSend() {
  const chipsEl = document.getElementById('math-chips');
  const mathParts = [...chipsEl.querySelectorAll('.math-chip')].map(c => `$${c.dataset.latex}$`).join(' ');
  const textPart = userInput.value.trim();
  const message = [textPart, mathParts].filter(Boolean).join(' ');
  if (!message) return;

  chipsEl.innerHTML = '';
  chipsEl.style.display = 'none';
  appendUserMessage(message);
  userInput.value = '';
  userInput.style.height = 'auto';
  showTyping(true);

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history: conversationHistory.slice(-10),
        input: message,
        participantID,
        retrievalMethod: 'semantic'
      })
    });
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    showTyping(false);
    appendBotMessage(data.response, data.retrievedChunks, data.confidence, data.retrievalMethod);
    conversationHistory.push({ role: 'user', content: message });
    conversationHistory.push({ role: 'assistant', content: data.response });
  } catch (err) {
    showTyping(false);
    appendBotMessage('Sorry, something went wrong. Please try again.');
    console.error(err);
  }
}

function appendUserMessage(text) {
  const wrap = document.createElement('div');
  wrap.className = 'message message--user';
  const bubble = document.createElement('div');
  bubble.className = 'message__bubble';
  const mathBlocks = [];
  let protected_ = text
    .replace(/\$\$[\s\S]*?\$\$/g, m => { mathBlocks.push(m); return `%%MATH${mathBlocks.length - 1}%%`; })
    .replace(/\$[^$\n]+\$/g,      m => { mathBlocks.push(m); return `%%MATH${mathBlocks.length - 1}%%`; })
    .replace(/\\\[[\s\S]*?\\\]/g, m => { mathBlocks.push(m); return `%%MATH${mathBlocks.length - 1}%%`; })
    .replace(/\\\([\s\S]*?\\\)/g, m => { mathBlocks.push(m); return `%%MATH${mathBlocks.length - 1}%%`; });
  let escaped = protected_.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  escaped = escaped.replace(/%%MATH(\d+)%%/g, (_, i) => mathBlocks[parseInt(i)]);
  bubble.innerHTML = escaped;
  MathJax.typesetPromise([bubble]);
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollChat();
}

function appendBotMessage(text, retrievedChunks, confidence, retrievalMethodUsed) {
  const wrap = document.createElement('div');
  wrap.className = 'message message--bot';
  wrap.id = `msg-${++msgCounter}`;

  const bubble = document.createElement('div');
  bubble.className = 'message__bubble';
  const mathBlocks = [];
  let protected_ = text
    .replace(/\\\[[\s\S]*?\\\]/g, m => { mathBlocks.push(m); return `%%MATH${mathBlocks.length - 1}%%`; })
    .replace(/\\\([\s\S]*?\\\)/g, m => { mathBlocks.push(m); return `%%MATH${mathBlocks.length - 1}%%`; });
  let rendered = marked.parse(protected_);
  rendered = rendered.replace(/%%MATH(\d+)%%/g, (_, i) => mathBlocks[parseInt(i)]);
  bubble.innerHTML = rendered;
  MathJax.typesetPromise([bubble]);

  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);

  // RAG evidence display
  if (retrievedChunks && retrievedChunks.length > 0) {
    const evidence = document.createElement('div');
    evidence.className = 'rag-evidence';
    const label = document.createElement('div');
    label.className = 'rag-evidence__label';
    label.textContent = `${retrievalMethodUsed || 'semantic'} — top: ${confidence?.topScore?.toFixed(2) ?? 'n/a'}, chunks: ${confidence?.chunkCount ?? 0}`;
    evidence.appendChild(label);
    retrievedChunks.forEach((chunk, i) => {
      const chunkEl = document.createElement('div');
      chunkEl.className = 'rag-evidence__chunk';
      chunkEl.textContent = `[${i + 1}] ${chunk.documentName}: ${chunk.chunkText.slice(0, 80)}…`;
      evidence.appendChild(chunkEl);
    });
    messagesEl.appendChild(evidence);
  }

  scrollChat();
}

const TRASH_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formulaToInlineMath(content) {
  const trimmed = String(content || '').trim();
  if (!trimmed) return '';
  const bare = trimmed
    .replace(/^\$\$([\s\S]+)\$\$$/, '$1')
    .replace(/^\$([\s\S]+)\$$/, '$1')
    .replace(/^\\\(([\s\S]+)\\\)$/, '$1')
    .replace(/^\\\[([\s\S]+)\\\]$/, '$1')
    .trim();
  return `\\(${escapeHtml(bare)}\\)`;
}

async function saveNote(content, isFormula = false, messageRef = null, title = 'Untitled') {
  try {
    const res = await fetch('/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantID,
        title,
        content,
        isFormula,
        messageRef: null,
        isHighlight: false
      })
    });
    const note = await res.json();
    notesData.push(note);
    renderNotesUI();
  } catch (err) {
    console.error('Failed to save note', err);
  }
}

function appendNoteItem(note) {
  const item = document.createElement('div');
  item.className = `note-item${note.isFormula ? ' note-item--formula' : ''}${note.isHighlight ? ' note-item--highlight' : ''}`;
  item.dataset.id = note._id;
  item.title = 'Double-click to edit note';

  const header = document.createElement('div');
  header.className = 'note-header';

  const title = document.createElement('div');
  title.className = 'note-title';
  title.textContent = note.title || 'Untitled';
  header.appendChild(title);

  const del = document.createElement('button');
  del.className = 'note-del';
  del.type = 'button';
  del.title = 'Delete note';
  del.setAttribute('aria-label', 'Delete note');
  del.innerHTML = TRASH_SVG;
  del.addEventListener('click', () => deleteNote(note._id));
  header.appendChild(del);
  item.appendChild(header);

  const text = document.createElement('p');
  text.className = 'note-content';
  if (note.isFormula) {
    text.innerHTML = formulaToInlineMath(note.content);
    MathJax.typesetPromise([text]);
  } else {
    text.textContent = note.content;
  }
  item.appendChild(text);

  item.addEventListener('dblclick', (e) => {
    if (e.target.closest('.note-del')) return;
    openNoteComposer(note);
  });

  notesList.appendChild(item);
}

async function deleteNote(id) {
  try {
    await fetch(`/notes/${id}`, { method: 'DELETE' });
    notesData = notesData.filter(n => n._id !== id);
    renderNotesUI();
  } catch (err) { console.error(err); }
}

async function updateNote(id, payload) {
  try {
    const res = await fetch(`/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return null;
    const updated = await res.json();
    notesData = notesData.map(n => n._id === id ? updated : n);
    renderNotesUI();
    return updated;
  } catch (err) { console.error(err); return null; }
}

async function loadNotes() {
  try {
    const res = await fetch(`/notes/${participantID}`);
    notesData = await res.json();
    renderNotesUI();
  } catch (err) { console.error(err); }
}

function renderNotesUI() {
  notesList.innerHTML = '';
  if (notesData.length === 0) {
    notesList.innerHTML = '<p class="empty-hint">Click "Create note" below to add your own note.</p>';
    appendCreateNoteRow();
    return;
  }
  notesData.forEach(n => appendNoteItem(n));
  appendCreateNoteRow();
  notesList.scrollTop = notesList.scrollHeight;
}

function appendCreateNoteRow() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'note-create-row';
  btn.dataset.action = 'create-note';
  btn.textContent = 'Create note';
  notesList.appendChild(btn);
}

notesList.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="create-note"]')) openNoteComposer();
});

function openNoteComposer(note = null) {
  editingNoteId = note?._id || null;
  setComposerExpanded(false);
  setComposerMinimized(false);
  noteComposer.setAttribute('aria-hidden', 'false');
  noteComposer.style.display = 'flex';
  noteComposerTitleEl.textContent = note ? 'Edit Note' : 'Create Note';
  noteComposerTitleInput.value = note?.title || '';
  noteComposerContent.value = note?.content || '';
  noteComposerIsFormula.checked = !!note?.isFormula;
  noteComposerContent.focus();
}

function closeNoteComposer() {
  noteComposer.style.display = 'none';
  noteComposer.setAttribute('aria-hidden', 'true');
  editingNoteId = null;
  setComposerExpanded(false);
  setComposerMinimized(false);
  noteComposerTitleInput.value = '';
  noteComposerContent.value = '';
  noteComposerIsFormula.checked = false;
}

function setComposerMinimized(minimized) {
  composerMinimized = minimized;
  noteComposer.classList.toggle('note-composer--minimized', minimized);
  document.getElementById('note-composer-min-btn').textContent = minimized ? '▢' : '_';
  document.getElementById('note-composer-min-btn').title = minimized ? 'Restore' : 'Minimise';
}

function setComposerExpanded(expanded) {
  composerExpanded = expanded;
  noteComposer.classList.toggle('note-composer--expanded', expanded);
  document.getElementById('note-composer-expand-btn').textContent = expanded ? '❐' : '□';
  document.getElementById('note-composer-expand-btn').title = expanded ? 'Exit expanded view' : 'Expand';
}

document.getElementById('note-composer-close-btn').addEventListener('click', closeNoteComposer);
document.getElementById('note-composer-cancel-btn').addEventListener('click', closeNoteComposer);
document.getElementById('note-composer-min-btn').addEventListener('click', () => setComposerMinimized(!composerMinimized));
document.getElementById('note-composer-expand-btn').addEventListener('click', () => setComposerExpanded(!composerExpanded));

noteComposerHeader.addEventListener('dblclick', () => {
  if (composerMinimized) { setComposerMinimized(false); return; }
  setComposerExpanded(!composerExpanded);
});

document.getElementById('note-composer-save-btn').addEventListener('click', async () => {
  const content = noteComposerContent.value.trim();
  if (!content) return;
  const title = noteComposerTitleInput.value.trim() || 'Untitled';
  const isFormula = noteComposerIsFormula.checked;
  if (editingNoteId) {
    await updateNote(editingNoteId, { title, content, isFormula });
  } else {
    await saveNote(content, isFormula, null, title);
  }
  closeNoteComposer();
});

document.getElementById('export-notes-btn').addEventListener('click', async () => {
  try {
    const res = await fetch(`/notes/${participantID}`);
    const notes = await res.json();
    if (notes.length === 0) { alert('No notes to export.'); return; }
    let text = `Study Assistant — Notes\nParticipant: ${participantID}\nExported: ${new Date().toLocaleString()}\n\n`;
    notes.forEach(n => {
      text += `[${n.title || 'Untitled'}] ${n.isFormula ? '[FORMULA] ' : ''}${n.content}\n`;
    });
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-notes-${participantID}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) { alert('Export failed.'); }
});

function showTyping(show) {
  typingEl.style.display = show ? 'flex' : 'none';
  if (show) scrollChat();
}

function scrollChat() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Document uploads disabled: upload UI and handlers removed.

if (userInput) {
  userInput.addEventListener('mouseover', () => logEvent('hover', 'User Input'));
  userInput.addEventListener('focus',     () => logEvent('focus', 'User Input'));
}

async function init() {
  await loadNotes();
  try {
    const res = await fetch('/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantID, limit: 5 })
    });
    const data = await res.json();
    if (data.history && data.history.length > 0) {
      data.history.forEach(entry => {
        appendUserMessage(entry.userInput);
        appendBotMessage(entry.botResponse, entry.retrievedChunks, entry.confidence, entry.retrievalMethod);
        conversationHistory.push({ role: 'user', content: entry.userInput });
        conversationHistory.push({ role: 'assistant', content: entry.botResponse });
      });
    } else {
      appendBotMessage('Hi, how can I help you today?');
    }
  } catch (err) {
    console.error(err);
    appendBotMessage('Hi, how can I help you today?');
  }
}

init();

}
