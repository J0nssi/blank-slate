import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase,  ref, set, onDisconnect, remove, onValue } from "firebase/database";
import { finnishWords } from "../app/finnishWords";
import { englishWords } from "../app/englishWords";

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
    players: [{ userId, nickname: "Player " + userId }],
    gameStarted: false,
    gameEnded: false,
    usedWords: [],
    currentRound: {
      timer: 10,
      wordPrompt: "",
      wordsSubmitted: []
    }
  });

  return { roomId, userId };
};

// ✅ Start Game
const startGame = async (roomId, language = "finnish") => {
  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) throw new Error("Room not found");

  const roomData = roomSnap.data();
  const usedWords = roomData.usedWords || [];

  const wordPack = language === "english" ? englishWords : finnishWords;

  // Filter out words that have already been used
  const availableWords = wordPack.filter(
    (wordObj) => !usedWords.includes(wordObj.word)
  );

  if (availableWords.length === 0) {
    console.log("All words have been used. Resetting word list.");
    await updateDoc(roomRef, { usedWords: [] }); // Reset the used words list
    return startGame(roomId); // Restart the game with a fresh word list
  }

  // Pick a random word from the available words
  const randomWordObj =
    availableWords[Math.floor(Math.random() * availableWords.length)];

  // Generate the word prompt based on the blank position
  let wordPrompt;
  if (randomWordObj.blankPosition === "left") {
    wordPrompt = `_____ ${randomWordObj.word}`;
  } else if (randomWordObj.blankPosition === "right") {
    wordPrompt = `${randomWordObj.word} _____`;
  } else {
    wordPrompt =
      Math.random() < 0.5
        ? `_____ ${randomWordObj.word}`
        : `${randomWordObj.word} _____`;
  }

  // Start the game and update the database
  await updateDoc(roomRef, {
    gameStarted: true,
    gameEnded: false,
    usedWords: [...usedWords, randomWordObj.word], // Add the word to usedWords
    currentRound: {
      timer: 10,
      wordPrompt,
      wordsSubmitted: [],
    },
  });

  console.log(`New round started with word: ${randomWordObj.word}`);
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
      players: [...players, { userId, nickname: "Player " + userId }],
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

const generateNewWord = async (roomId, language = "finnish") => {
  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error("Room not found");

  const usedWords = roomSnap.data().usedWords || [];
  const wordPack = language === "english" ? englishWords : finnishWords;
  const availableWords = wordPack.filter(
    (wordObj) => !usedWords.includes(wordObj.word)
  );

  if (availableWords.length === 0) {
    throw new Error("No more words available!");
  }

  // Pick a random new word
  const randomWordObj =
    availableWords[Math.floor(Math.random() * availableWords.length)];

  // Generate word prompt
  let wordPrompt;
  if (randomWordObj.blankPosition === "left") {
    wordPrompt = `_____ ${randomWordObj.word}`;
  } else if (randomWordObj.blankPosition === "right") {
    wordPrompt = `${randomWordObj.word} _____`;
  } else {
    wordPrompt =
      Math.random() < 0.5
        ? `_____ ${randomWordObj.word}`
        : `${randomWordObj.word} _____`;
  }

  // Update Firebase with new word and reset round
  await updateDoc(roomRef, {
    usedWords: [...usedWords, randomWordObj.word],
    currentRound: {
      timer: 10,
      wordPrompt,
      wordsSubmitted: [],
    },
  });
};

// ✅ Submit a word during the round
const submitWord = async (roomId, userId, word) => {
  const roomRef = doc(db, "rooms", roomId);

  await updateDoc(roomRef, {
    "currentRound.wordsSubmitted": arrayUnion({ userId, word }),
  });
};

// ✅ End the game
const endGame = async (roomId) => {
  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, {
    gameEnded: true, // Set the game as ended
    usedWords: [],   // Reset used words for the next game
  });
};

const getAvailableRooms = async () => {
  const roomsRef = collection(db, "rooms");
  const q = query(roomsRef, where("gameStarted", "==", false)); // Fetch only rooms that haven't started yet

  try {
    const querySnapshot = await getDocs(q);
    const availableRooms = querySnapshot.docs.map(doc => ({
      roomId: doc.id,
      ...doc.data()
    }));

    return availableRooms;
  } catch (error) {
    console.error("Error fetching available rooms:", error);
    return [];
  }
};


export { db, auth, signInAnon, createRoom, joinRoom, startGame, updateNickname, submitWord, endGame, generateNewWord };
