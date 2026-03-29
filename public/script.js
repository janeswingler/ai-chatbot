
const inputField = document.getElementById("user-input");

const sendBtn = document.getElementById("send-btn");

const messagesContainer = document.getElementById("messages");

const participantID = localStorage.getItem('participantID');

// If none found, send back to index.html
if (!participantID) {
    window.location.href = 'index.html';
}

const sendMessage = async () => {
    const message = inputField.value.trim();
    if (message !== null && message !== "") {
        const selectedMethod = retrievalMethod.value;
        const msg = document.createElement("div");
        msg.textContent = message;
        msg.style.textAlign = "right";
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
                    participantID,
                    message,
                    retrievalMethod: selectedMethod
                })
            });

            if (!response.ok) {
                throw new Error('Server error');
            }

            const data = await response.json();
            console.log('Server response:', data);
            const botMsg = document.createElement("div");
            botMsg.textContent = data.response;
            messagesContainer.appendChild(botMsg);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
        sendMessage();
    }
});

const retrievalMethod = document.getElementById("retrieval-method");

retrievalMethod.addEventListener("change", () => {
    console.log("Retrieval method: ", retrievalMethod.value);
})

const uploadBtn = document.getElementById("upload-btn");

uploadBtn.addEventListener("click", () => {
    const fileInput = document.getElementById("file-input");
    console.log("Selected files: ", fileInput.files[fileInput.files.length - 1].name.toString().trim());
});

// Load chat history on page load
(async () => {
    const res = await fetch('/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantID })
    });
    const data = await res.json();

    // Loop through history and display each message pair
    data.history.forEach(entry => {
        const userMsg = document.createElement('div');
        userMsg.textContent = entry.userInput;
        userMsg.style.textAlign = 'right';
        messagesContainer.appendChild(userMsg);

        const botMsg = document.createElement('div');
        botMsg.textContent = entry.botResponse;
        messagesContainer.appendChild(botMsg);
    });
})();

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