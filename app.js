// client.js
// Connects to server via socket.io and manages UI interactions

const socket = io(); // assumes socket.io served at same origin

/* UI elements */
const usernameModal = document.getElementById("usernameModal");
const usernameInput = document.getElementById("usernameInput");
const btnChoose = document.getElementById("btnChoose");
const usernameError = document.getElementById("usernameError");
const myUsernameLabel = document.getElementById("myUsername");

const roomsList = document.getElementById("roomsList");
const newRoomInput = document.getElementById("newRoomInput");
const createRoomBtn = document.getElementById("createRoomBtn");

const participantsList = document.getElementById("participantsList");

const currentRoomLabel = document.getElementById("currentRoom");
const roomStatus = document.getElementById("roomStatus");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const messagesEl = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");

/* State */
let myUsername = null;
let currentRoom = null;

/* Helpers */

// sanitize and simple formatting:
// **bold**, *italic*, and auto-links. Simple and safe (no innerHTML injection of raw user HTML).
function formatMessage(text) {
  // escape HTML special chars
  const esc = (s) => s.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let out = esc(text);

  // bold: **text**
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // italic: *text*
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // auto-link URLs
  out = out.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(); // uses browser locale
}

function addMessage({username, text, ts, mine}) {
  const msg = document.createElement("div");
  msg.className = "msg" + (mine ? " mine" : "");
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${username} • ${formatTime(ts)}`;
  const content = document.createElement("div");
  content.className = "content";
  content.innerHTML = formatMessage(text);

  msg.appendChild(meta);
  msg.appendChild(content);
  messagesEl.appendChild(msg);
  // scroll to bottom
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// update room list UI
function renderRooms(rooms, activeRoom) {
  roomsList.innerHTML = "";
  if (rooms.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No rooms. Create one!";
    li.style.opacity = 0.6;
    roomsList.appendChild(li);
    return;
  }
  rooms.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    if (r === activeRoom) li.classList.add("active");
    li.addEventListener("click", () => {
      if (currentRoom === r) return;
      joinRoom(r);
    });
    roomsList.appendChild(li);
  });
}

function renderParticipants(list) {
  participantsList.innerHTML = "";
  list.forEach((u) => {
    const li = document.createElement("li");
    li.textContent = u;
    participantsList.appendChild(li);
  });
}

/* Actions */

// attempt to choose username
btnChoose.addEventListener("click", chooseUsername);
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") chooseUsername();
});

function chooseUsername() {
  const name = (usernameInput.value || "").trim();
  if (!name) {
    usernameError.textContent = "Please enter a username.";
    return;
  }
  // ask server if name is available
  socket.emit("choose_username", name, (resp) => {
    if (resp.ok) {
      myUsername = name;
      myUsernameLabel.textContent = `You: ${myUsername}`;
      usernameModal.style.display = "none";
      // request rooms
      socket.emit("get_rooms");
    } else {
      usernameError.textContent = resp.error || "Unable to use that username.";
    }
  });
}

// create new room
createRoomBtn.addEventListener("click", () => {
  const name = (newRoomInput.value || "").trim();
  if (!name) return;
  socket.emit("create_room", name, (res) => {
    if (!res.ok) {
      alert(res.error || "Could not create room");
    } else {
      newRoomInput.value = "";
      joinRoom(name);
    }
  });
});

// join a room
function joinRoom(roomName) {
  if (!myUsername) {
    alert("Choose a username first.");
    return;
  }
  // ask server to join
  socket.emit("join_room", {room: roomName}, (res) => {
    if (!res.ok) {
      alert(res.error || "Could not join room");
    } else {
      currentRoom = roomName;
      currentRoomLabel.textContent = currentRoom;
      roomStatus.textContent = `Connected to room "${currentRoom}"`;
      messagesEl.innerHTML = ""; // clear message view
      // request participants and history
      socket.emit("get_participants", currentRoom);
      socket.emit("get_history", currentRoom, (hist) => {
        hist.forEach((m) => addMessage({...m, mine: m.username === myUsername}));
      });
    }
  });
}

// send message
messageForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const txt = (messageInput.value || "").trim();
  if (!txt) return;
  if (!currentRoom) {
    alert("Join a room first.");
    return;
  }
  const payload = {room: currentRoom, text: txt};
  socket.emit("send_message", payload, (ack) => {
    if (ack.ok) {
      addMessage({username: myUsername, text: txt, ts: ack.ts, mine: true});
      messageInput.value = "";
    } else {
      alert(ack.error || "Message not delivered");
    }
  });
});

// leave room
leaveRoomBtn.addEventListener("click", () => {
  if (!currentRoom) return;
  socket.emit("leave_room", currentRoom);
  currentRoom = null;
  currentRoomLabel.textContent = "Not in a room";
  roomStatus.textContent = "Join or create a room to start chatting";
  messagesEl.innerHTML = "";
  participantsList.innerHTML = "";
});

/* socket listeners */

// update rooms list
socket.on("rooms_list", (rooms) => {
  renderRooms(rooms, currentRoom);
});

// participants update
socket.on("participants", (list) => {
  renderParticipants(list);
});

// incoming message
socket.on("message", (m) => {
  // if the message belongs to current room show it, else show a small browser notification line
  if (m.room === currentRoom) {
    addMessage({username: m.username, text: m.text, ts: m.ts, mine: m.username === myUsername});
  } else {
    // optionally show an in-app notification (simple)
    const note = document.createElement("div");
    note.className = "msg";
    note.innerHTML = `<div class="meta">${m.room} • ${formatTime(m.ts)}</div><div class="content"><strong>${m.username}:</strong> ${formatMessage(m.text)}</div>`;
    messagesEl.appendChild(note);
  }
});

// username collision (if server forces disconnect)
socket.on("username_taken_disconnect", (msg) => {
  alert(msg || "Your username was taken elsewhere. You will be disconnected.");
  location.reload();
});

// updates when you connect or disconnect
socket.on("connect", () => {
  // nothing yet; wait for username selection
});
socket.on("disconnect", () => {
  // show disconnected state
  roomStatus.textContent = "Disconnected from server.";
});
