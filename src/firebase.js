import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue, push, remove, update, onDisconnect } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBnMTGZ2_YXNL5cjE4fzYyA3M_XD7ZXKck",
  authDomain: "noqtat-fowz-d13aa.firebaseapp.com",
  databaseURL: "https://noqtat-fowz-d13aa-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "noqtat-fowz-d13aa",
  storageBucket: "noqtat-fowz-d13aa.firebasestorage.app",
  messagingSenderId: "481624442217",
  appId: "1:481624442217:web:f36bc520b71f64ce9aa9f8"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ─── Room Functions ─────────────────────────────────────────────────────────

// Create a new room
export async function createRoom(roomCode, hostName, matchType) {
  const playerId = generatePlayerId();
  const roomRef = ref(db, `rooms/${roomCode}`);
  await set(roomRef, {
    host: hostName,
    matchType,
    status: "waiting",
    players: { [playerId]: { name: hostName, ready: true, score: 0 } },
    createdAt: Date.now(),
  });
  
  return playerId;
}

// Join an existing room
export async function joinRoom(roomCode, playerName) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snapshot = await get(roomRef);
  
  if (!snapshot.exists()) {
    throw new Error("الغرفة مو موجودة");
  }
  
  const room = snapshot.val();
  const playerCount = room.players ? Object.keys(room.players).length : 0;
  const maxPlayers = room.matchType === "2v2" ? 4 : 2;
  
  if (playerCount >= maxPlayers) {
    throw new Error("الغرفة ممتلئة");
  }
  
  if (room.status !== "waiting") {
    throw new Error("المباراة بدأت");
  }
  
  const playerId = generatePlayerId();
  await set(ref(db, `rooms/${roomCode}/players/${playerId}`), {
    name: playerName,
    ready: true,
    score: 0,
  });
  
  return playerId;
}

// Listen to room changes
export function listenToRoom(roomCode, callback) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  return onValue(roomRef, (snapshot) => {
    callback(snapshot.val());
  });
}

// Update room data
export async function updateRoom(roomCode, data) {
  await update(ref(db, `rooms/${roomCode}`), data);
}

// Set game questions and start
export async function startRoomGame(roomCode, questions, gameMode, scoreMode, teams) {
  await update(ref(db, `rooms/${roomCode}`), {
    status: "playing",
    questions,
    gameMode,
    scoreMode,
    teams: teams || null,
    currentQ: 0,
    phase: "question",
    timer: 15,
    answers: {},
  });
}

// Submit answer
export async function submitAnswer(roomCode, playerId, questionIndex, answer, isCorrect, timeLeft) {
  await set(ref(db, `rooms/${roomCode}/answers/${questionIndex}/${playerId}`), {
    answer,
    correct: isCorrect,
    timeLeft,
    timestamp: Date.now(),
  });
}

// Update score
export async function updateScore(roomCode, playerId, newScore) {
  await update(ref(db, `rooms/${roomCode}/players/${playerId}`), { score: newScore });
}

// Move to next question
export async function nextQuestion(roomCode, nextQ) {
  await update(ref(db, `rooms/${roomCode}`), {
    currentQ: nextQ,
    phase: "question",
    timer: 15,
  });
}

// End game
export async function endGame(roomCode) {
  await update(ref(db, `rooms/${roomCode}`), {
    status: "finished",
    phase: "final",
  });
}

// Forfeit
export async function forfeitGame(roomCode, playerId) {
  await update(ref(db, `rooms/${roomCode}`), {
    status: "finished",
    phase: "forfeit",
    forfeitedBy: playerId,
  });
}

// Delete room
export async function deleteRoom(roomCode) {
  await remove(ref(db, `rooms/${roomCode}`));
}

// ─── Matchmaking Functions ──────────────────────────────────────────────────

export async function joinMatchmaking(playerName, matchType) {
  const playerId = generatePlayerId();
  
  await set(ref(db, `matchmaking/${matchType}/${playerId}`), {
    name: playerName,
    timestamp: Date.now(),
  });
  
  return playerId;
}

export function listenToMatchmaking(matchType, callback) {
  const queueRef = ref(db, `matchmaking/${matchType}`);
  return onValue(queueRef, (snapshot) => {
    callback(snapshot.val());
  });
}

export async function removeFromMatchmaking(matchType, playerId) {
  await remove(ref(db, `matchmaking/${matchType}/${playerId}`));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generatePlayerId() {
  return "p_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now().toString(36);
}

export { db, ref, onValue, update, set, get };
