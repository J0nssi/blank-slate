import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, deleteDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase,  ref, set} from "firebase/database";
import { finnishWords } from "../app/finnishWords";
import { englishWords } from "../app/englishWords";
import { funnyWords } from "../app/funnyWords";

// ✅ Firebase Config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const rtdb = getDatabase(app);

// ✅ Sign in Anonymously
const signInAnon = async () => {
  try {
    const userCredential = await signInAnonymously(auth);
    return userCredential.user.uid;
  } catch (error) {
    console.error("Error signing in anonymously:", error);
  }
};

// ✅ Create Room
const createRoom = async () => {
  const userId = await signInAnon();
  if (!userId) {
    throw new Error("Failed to sign in anonymously");
  }

  const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
  const roomRef = doc(db, "rooms", roomId);

  await setDoc(roomRef, {
    hostId: userId,
    players: [{ userId, nickname: "P" + userId.slice(0, 3) }],
    gameStarted: false,
    gameEnded: false,

    usedWords: [],
    currentRound: {
      timer: 10,
      wordPrompt: "",
      wordsSubmitted: [],

    }
  });

  return { roomId, userId };
};

// ✅ Start Game
const startGame = async (roomId, language, submissionTimer) => {
  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) throw new Error("Room not found");

  const roomData = roomSnap.data();
  const usedWords = roomData.usedWords || [];

  // Valitse sanapaketti kielen mukaan
  let wordPack;
  switch(language) {
    case "english":
      wordPack = englishWords;
      break;
    case "custom":
      wordPack = funnyWords;
      break;
    default:
      wordPack = finnishWords;
  }

  // Filter out words that have already been used
  const availableWords = wordPack.filter(
    (word) => !usedWords.includes(word)
  );

  if (availableWords.length === 0) {
    console.log("All words have been used. Resetting word list.");
    await updateDoc(roomRef, { usedWords: [] }); // Reset the used words list
    return startGame(roomId); // Restart the game with a fresh word list
  }

  // Pick a random word from the available words
  const randomWord = availableWords[Math.floor(Math.random() * availableWords.length)];

  // Generate the word prompt based on the blank position
  let wordPrompt = Math.random() < 0.5
    ? `_____ ${randomWord}`
    : `${randomWord} _____`;

  // Start the game and update the database
  await updateDoc(roomRef, {
    gameStarted: true,
    gameEnded: false,
    submissionTimer: submissionTimer || 30,
    usedWords: [...usedWords, randomWord],
    currentRound: {
      timer: 10,
      wordPrompt,
      wordsSubmitted: [],
      startTime: Date.now(),
    },
  });

  console.log(`New round started with word: ${randomWord}`);
};

const removePlayer = async (roomId, userId) => {
  try {
    const roomRef = doc(db, "rooms", roomId);
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) {
      console.error("❌ Room not found");
      return;
    }

    const roomData = roomSnap.data();
    let players = roomData.players || [];

    // Check if player exists in room
    if (!players.some(player => player.userId === userId)) {
      console.warn(`⚠️ Player ${userId} not found in room ${roomId}`);
      return;
    }

    // Remove the player from the players array
    const updatedPlayers = players.filter(player => player.userId !== userId);

    // Check if the leaving player is the host
    const isHostLeaving = roomData.hostId === userId;

    if (updatedPlayers.length === 0) {
      // If no players left, delete the room
      await deleteDoc(roomRef);
      console.log(`🗑️ Room ${roomId} deleted as no players are left.`);
      return;
    }

    let newHostId = roomData.hostId; // Default to current host

    if (isHostLeaving) {
      // If the host leaves and there's only one player left, make them the new host
      if (updatedPlayers.length === 1) {
        newHostId = updatedPlayers[0].userId;
      } else {
        newHostId = updatedPlayers[0].userId; // Assign first available player
      }
      console.log(`👑 New host assigned: ${newHostId}`);
    }

    // Update Firestore
    await updateDoc(roomRef, {
      players: updatedPlayers,
      hostId: newHostId, // Only updates if host left
    });

    console.log(`✅ Player ${userId} removed from room ${roomId}`);

  } catch (error) {
    console.error("❌ Error removing player from Firestore:", error);
  }
};



// ✅ Join Room with Disconnect Handling
const joinRoom = async (roomId, userId) => {
  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) {
    throw new Error("Room not found");
  }

  const gameStarted = roomSnap.data().gameStarted;
  if (gameStarted) {
    throw new Error("The game has already started!");
  }

  const players = roomSnap.data().players;

  // Check if player is already in the room
  const isPlayerInRoom = players.some(player => player.userId === userId);
  if (!isPlayerInRoom) {
    // Add player to the room
    await updateDoc(roomRef, {
      players: [...players, { userId, nickname: "P" + userId.slice(0, 3) }],
    });
  }
  return roomId;
};



// ✅ Update Nickname
const updateNickname = async (roomId, userId, nickname) => {
  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) throw new Error("Room not found");

  const players = roomSnap.data().players.map(player =>
    player.userId === userId ? { ...player, nickname } : player
  );

  await updateDoc(roomRef, { players });
};

const generateNewWord = async (roomId, userId, language) => {
  console.log("🔄 Generating new word...");

  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) {
    console.error("❌ Room not found");
    return;
  }

  const roomData = roomSnap.data();
  console.log("🟢 Room data:", roomData);

  console.log("🔍 Checking hostId:", roomData.hostId);
  console.log("🔍 Checking userId:", userId);

  if (roomData.hostId !== userId) {
    console.warn("⚠️ Only the host can generate a word.");
    return;
  }

  const usedWords = roomData.usedWords || [];
  
  // Valitse sanapaketti kielen mukaan
  let wordPack;
  switch(language) {
    case "english":
      wordPack = englishWords;
      break;
    case "custom":
      wordPack = funnyWords;
      break;
    default:
      wordPack = finnishWords;
  }

  const availableWords = wordPack.filter((word) => !usedWords.includes(word));

  if (availableWords.length === 0) {
    console.warn("⚠️ No more words available!");
    return;
  }

  const randomWord = availableWords[Math.floor(Math.random() * availableWords.length)];
  let wordPrompt = Math.random() < 0.5 ? `_____ ${randomWord}` : `${randomWord} _____`;

  console.log("🆕 New word:", randomWord);

  await updateDoc(roomRef, {
    usedWords: [...usedWords, randomWord],
    currentRound: {
      timer: 10,
      wordPrompt,
      wordsSubmitted: [],
    },
  });

  console.log("✅ Word updated in Firestore!");
};

const submitWord = async (roomId, userId, word) => {
  const roomRef = doc(db, "rooms", roomId);

  await updateDoc(roomRef, {
    "currentRound.wordsSubmitted": arrayUnion({ userId, word }),
  });
};


// ✅ End the game
const endGame = async (roomId) => {
  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) throw new Error("Room not found");

  const players = roomSnap.data().players.map(player => ({
    userId: player.userId,
    nickname: player.nickname || "",
    score: 0, // ✅ Reset scores in Firestore
  }));

  // Reset game state completely
  await setDoc(roomRef, {
    hostId: roomSnap.data().hostId,
    players,
    gameEnded: true, // ✅ UI should react to this
    gameStarted: false,
    usedWords: [],
    currentRound: {
      timer: 10,
      wordPrompt: "",
      wordsSubmitted: [],
    },
  });

  console.log("Game has ended. UI should now reset.");
};


export { db, auth, signInAnon, createRoom, joinRoom, startGame, updateNickname, submitWord, endGame, generateNewWord, removePlayer };
