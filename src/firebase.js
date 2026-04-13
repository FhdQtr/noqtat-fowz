import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue, push, remove, update, onDisconnect } from "firebase/database";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "firebase/auth";

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
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// ─── Auth Functions ────────────────────────────────────────────────────────

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ─── Player Profile Functions ──────────────────────────────────────────────

const RANKS = [
  { name: "مبتدئ", icon: "⚪", min: 0 },
  { name: "برونزي", icon: "🥉", min: 100 },
  { name: "فضي", icon: "🥈", min: 300 },
  { name: "ذهبي", icon: "🥇", min: 600 },
  { name: "ماسي", icon: "💎", min: 1000 },
  { name: "أسطوري", icon: "👑", min: 2000 },
];

export function getRank(xp) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

export function getNextRank(xp) {
  for (let i = 0; i < RANKS.length; i++) {
    if (xp < RANKS[i].min) return RANKS[i];
  }
  return null; // Already max rank
}

export { RANKS };

// Create or update player profile
export async function savePlayerProfile(uid, data) {
  const profileRef = ref(db, `players/${uid}`);
  const snap = await get(profileRef);
  if (snap.exists()) {
    // Update existing
    await update(profileRef, data);
  } else {
    // Create new
    await set(profileRef, {
      name: data.name || "لاعب",
      photo: data.photo || "",
      xp: 0,
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
      streak: 0,
      bestStreak: 0,
      lastPlayedDate: "",
      gems: 0,
      achievements: [],
      joinedAt: Date.now(),
      ...data,
    });
  }
}

// Get player profile
export async function getPlayerProfile(uid) {
  const snap = await get(ref(db, `players/${uid}`));
  return snap.exists() ? snap.val() : null;
}

// Update XP and check streak after a game
export async function updatePlayerAfterGame(uid, won) {
  const profile = await getPlayerProfile(uid);
  if (!profile) return;

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  let newStreak = profile.streak || 0;
  let bestStreak = profile.bestStreak || 0;

  // Streak logic
  if (profile.lastPlayedDate === today) {
    // Already played today, streak stays
  } else if (profile.lastPlayedDate === yesterday) {
    // Played yesterday, streak continues
    newStreak += 1;
  } else {
    // Streak broken, start fresh
    newStreak = 1;
  }

  if (newStreak > bestStreak) bestStreak = newStreak;

  const xpGain = won ? 10 : 3;

  await update(ref(db, `players/${uid}`), {
    xp: (profile.xp || 0) + xpGain,
    wins: (profile.wins || 0) + (won ? 1 : 0),
    losses: (profile.losses || 0) + (won ? 0 : 1),
    gamesPlayed: (profile.gamesPlayed || 0) + 1,
    streak: newStreak,
    bestStreak: bestStreak,
    lastPlayedDate: today,
  });

  return {
    xpGain,
    newXP: (profile.xp || 0) + xpGain,
    streak: newStreak,
    bestStreak,
    rank: getRank((profile.xp || 0) + xpGain),
  };
}

// Get leaderboard
export async function getLeaderboard(limit = 20) {
  const snap = await get(ref(db, "players"));
  if (!snap.exists()) return [];
  const players = [];
  snap.forEach((child) => {
    const d = child.val();
    players.push({ uid: child.key, name: d.name, photo: d.photo, xp: d.xp || 0, wins: d.wins || 0, streak: d.streak || 0 });
  });
  return players.sort((a, b) => b.xp - a.xp).slice(0, limit);
}

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

// ─── Online Lobby & Invite System ──────────────────────────────────────────

// Join the online lobby (visible to other players)
export async function joinLobby(playerName, matchType, xp) {
  const playerId = generatePlayerId();
  await set(ref(db, `lobby/${playerId}`), {
    name: playerName,
    matchType,
    xp: xp || 0,
    status: "available",
    timestamp: Date.now(),
  });
  return playerId;
}

// Listen to lobby changes (see who's online)
export function listenToLobby(callback) {
  return onValue(ref(db, "lobby"), (snapshot) => {
    callback(snapshot.val());
  });
}

// Leave the lobby
export async function leaveLobby(playerId) {
  await remove(ref(db, `lobby/${playerId}`));
}

// Send invite to a player
export async function sendInvite(targetPlayerId, fromName, fromPlayerId, matchType) {
  await set(ref(db, `invites/${targetPlayerId}`), {
    from: fromName,
    fromId: fromPlayerId,
    matchType,
    status: "pending", // pending | accepted | declined
    timestamp: Date.now(),
  });
}

// Listen for invites sent to me
export function listenToMyInvites(myPlayerId, callback) {
  return onValue(ref(db, `invites/${myPlayerId}`), (snapshot) => {
    callback(snapshot.val());
  });
}

// Respond to an invite
export async function respondToInvite(myPlayerId, accepted, roomCode) {
  if (accepted) {
    await update(ref(db, `invites/${myPlayerId}`), { status: "accepted", roomCode });
  } else {
    await update(ref(db, `invites/${myPlayerId}`), { status: "declined" });
  }
}

// Listen for invite response (sender watches)
export function listenToInviteResponse(targetPlayerId, callback) {
  return onValue(ref(db, `invites/${targetPlayerId}`), (snapshot) => {
    callback(snapshot.val());
  });
}

// Clear invite
export async function clearInvite(playerId) {
  await remove(ref(db, `invites/${playerId}`));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generatePlayerId() {
  return "p_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now().toString(36);
}

export { db, ref, onValue, update, set, get };
