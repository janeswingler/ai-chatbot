
const inputField = document.getElementById("user-input");

const sendBtn = document.getElementById("send-btn");

const messagesContainer = document.getElementById("messages");
const retrievalMethod = document.getElementById("retrieval-method");


// Read the query string from the current page URL so we can extract values like participantID and systemID
const params = new URLSearchParams(window.location.search);

// Retrieve participantID and system ID from localStorage
const participantID = params.get('participantID') || localStorage.getItem('participantID');
const systemID = params.get('systemID');

document.getElementById('prototype-btn').addEventListener('click', () => {
  window.location.href = `/chat.html?participantID=${participantID}&systemID=${systemID}`;
});

document.getElementById('task-btn').addEventListener('click', () => {
  alert('Add your task instructions here or link this button to a task page.');
});

// Alert and prompt if no participantID
if (!participantID) {
alert('Please enter a participant ID.');
// Redirect to login if no participantID is set
window.location.href = '/';
}

const MAX_INTERACTIONS = 5;
const conversationHistory = [];

const sendMessage = async () => {
    const message = inputField.value.trim();
    if (message !== null && message !== "") {
        const selectedMethod = retrievalMethod.value;
        const msg = document.createElement("div");
        msg.classList.add("message", "message--user");
        const userBubble = document.createElement("div");
        userBubble.classList.add("message__bubble");
        userBubble.textContent = message;
        msg.appendChild(userBubble);
        messagesContainer.appendChild(msg);
        inputField.value = "";
        messagesContainer.scrollTop = messagesContainer.scrollHeight; //auto scroll

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    history: conversationHistory.slice(-10),
                    input: message,
                    participantID,
                    systemID,
                    retrievalMethod: selectedMethod
                })
            });

            if (!response.ok) {
                throw new Error('Server error');
            }
            const data = await response.json();
            console.log('Server response:', data);

            // Bot response — protect math blocks before marked processes them
            const mathBlocks = [];
            let protectedText = data.response
                .replace(/\\\[[\s\S]*?\\\]/g, match => { mathBlocks.push(match); return `%%MATH${mathBlocks.length - 1}%%`; })
                .replace(/\\\([\s\S]*?\\\)/g, match => { mathBlocks.push(match); return `%%MATH${mathBlocks.length - 1}%%`; });
            let rendered = marked.parse(protectedText);
            rendered = rendered.replace(/%%MATH(\d+)%%/g, (_, i) => mathBlocks[parseInt(i)]);

            const botWrapper = document.createElement("div");
            botWrapper.classList.add("message", "message--bot");
            const botBubble = document.createElement("div");
            botBubble.classList.add("message__bubble");
            botBubble.innerHTML = rendered;
            botWrapper.appendChild(botBubble);
            messagesContainer.appendChild(botWrapper);
            MathJax.typesetPromise([botBubble]);

            conversationHistory.push({ role: 'user', content: message });
            conversationHistory.push({ role: 'assistant', content: data.response });

            // RAG evidence
            if (data.retrievedChunks && data.retrievedChunks.length > 0) {
                const evidence = document.createElement("div");
                evidence.classList.add("rag-evidence");

                const label = document.createElement("div");
                label.classList.add("rag-evidence__label");
                label.textContent = `${data.retrievalMethod} retrieval — top score: ${data.confidence?.topScore?.toFixed(2) ?? 'n/a'}, chunks: ${data.confidence?.chunkCount ?? 0}`;
                evidence.appendChild(label);

                data.retrievedChunks.forEach((chunk, i) => {
                    const chunkEl = document.createElement("div");
                    chunkEl.classList.add("rag-evidence__chunk");
                    chunkEl.textContent = `[${i + 1}] (${chunk.score?.toFixed(3) ?? '?'}) ${chunk.documentName}: ${chunk.chunkText.slice(0, 100)}...`;
                    evidence.appendChild(chunkEl);
                });

                messagesContainer.appendChild(evidence);
            }

            messagesContainer.scrollTop = messagesContainer.scrollHeight; //auto scroll
        } catch (error) {
            console.error('Failed to send message', error);
        }
    } else {
        alert("Please enter a message");
    }
};

sendBtn.addEventListener("click", sendMessage);
inputField.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        logEvent('keypress', 'Enter Key');
        sendMessage();
    }
});


const uploadBtn = document.getElementById("upload-btn").addEventListener('click', redirectToQualtrics);

function redirectToQualtrics() {
  fetch('/redirect-to-survey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantID })
  })
    .then(response => response.text())
    .then(url => {
      logEvent('redirect', 'Qualtrics Survey');
      window.location.href = url;
    })
    .catch(error => {
      console.error('Error redirecting to survey:', error);
      alert('There was an error redirecting to the survey. Please try again.');
    });
}

async function loadConversationHistory() {
    const res = await fetch('/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantID, limit: MAX_INTERACTIONS })
    });
    const data = await res.json();

    if (data.history && data.history.length > 0) {
        data.history.forEach(entry => {
            const userWrapper = document.createElement('div');
            userWrapper.classList.add('message', 'message--user');
            const userBubble = document.createElement('div');
            userBubble.classList.add('message__bubble');
            userBubble.textContent = entry.userInput;
            userWrapper.appendChild(userBubble);
            messagesContainer.appendChild(userWrapper);

            const botWrapper = document.createElement('div');
            botWrapper.classList.add('message', 'message--bot');
            const botBubble = document.createElement('div');
            botBubble.classList.add('message__bubble');
            botBubble.textContent = entry.botResponse;
            botWrapper.appendChild(botBubble);
            messagesContainer.appendChild(botWrapper);

            conversationHistory.push({ role: 'user', content: entry.userInput });
            conversationHistory.push({ role: 'assistant', content: entry.botResponse });
        });
    }
}

window.onload = loadConversationHistory;


// Function to log events to the server
function logEvent(type, element) {
    fetch('/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantID, eventType: type, elementName: element, timestamp: new Date() })
    });
}

if (sendBtn) {
    sendBtn.addEventListener('click', () =>
        logEvent('click', 'Send Button'));
}

if (inputField) {
    inputField.addEventListener('mouseover', () =>
        logEvent('hover', 'User Input'));
    inputField.addEventListener('focus', () =>
        logEvent('focus', 'User Input'));
}

// File upload handling
uploadBtn.addEventListener("click", async () => {
    const fileInput = document.getElementById("file-input");
    const file = fileInput.files[0];
    if (!file) return alert("Please select a file first.");
    const formData = new FormData();
    formData.append("document", file);
    try {
        const res = await fetch("/upload-document", {
            method: "POST",
            body: formData  // No Content-Type header — browser sets it automatically
        });
        const data = await res.json();
        if (res.ok) {
            alert(`Uploaded: ${data.filename} (${data.chunkCount} chunks)`);
            loadDocuments(); // Refresh the list
        } else {
            alert("Upload failed: " + data.error);
        }
    } catch (err) {
        console.error("Upload error:", err);
        alert("Upload failed.");
    }
});

// Load and display uploaded documents
async function loadDocuments() {
    const response = await fetch("/documents");
    const docs = await response.json();
    const uploadedDocsEl = document.getElementById("uploaded-docs");
    if (docs.length === 0) {
        uploadedDocsEl.textContent = "No documents uploaded yet";
        return;
    }
    uploadedDocsEl.innerHTML = "";
    const list = document.createElement("ul");
    docs.forEach(doc => {
        const item = document.createElement("li");
        item.textContent = `${doc.filename} — ${doc.processingStatus}`;
        list.appendChild(item);
    });
    uploadedDocsEl.appendChild(list);
}

// Load documents on page load
loadDocuments();