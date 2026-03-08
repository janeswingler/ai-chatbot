
const inputField = document.getElementById("user-input");

const sendBtn = document.getElementById("send-btn");

const messagesContainer = document.getElementById("messages");

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
            botMsg.textContent = `${data.response}: ${data.message}`;
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
