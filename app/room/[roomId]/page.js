"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  db,
  joinRoom,
  signInAnon,
  startGame,
  generateNewWord,
  removePlayer
  // ... other exported functions if needed
} from "../../../lib/firebase";
import { doc, onSnapshot, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import { useTranslations } from 'next-intl';
import ReactConfetti from 'react-confetti';

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const [roomId, setRoomId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [nickname, setNickname] = useState("");
  const [isNicknameSet, setIsNicknameSet] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [word, setWord] = useState("");
  const [gameEnded, setGameEnded] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [wordMatches, setWordMatches] = useState({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [playerCardColors, setPlayerCardColors] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [resultsProcessed, setResultsProcessed] = useState(false);
  const [nextRoundTimer, setNextRoundTimer] = useState(null);
  const [winner, setWinner] = useState(null);
  const [lastRoundScores, setLastRoundScores] = useState([]);
  const [lastRoundWords, setLastRoundWords] = useState([]);
  const t = useTranslations('room');
  const inputRef = useRef(null);
  const [showLastRound, setShowLastRound] = useState(false);
  const beepSound = new Audio("/beep.mp3");
  const soundOnePoint = new Audio("/onepoint.mp3");
  const soundThreePoints = new Audio("/threepoints.mp3");
  const soundZeroPoints = new Audio("/zeropoints.mp3");
  const clappingSound = new Audio("/clapping.mp3");
  const soundOof = new Audio("/oof.mp3");
  const timerSound = useRef(new Audio("/timer.mp3"));
  const hasPlayedSoundRef = useRef(false);
  beepSound.volume = 0.02; // 🔊 Reduce volume to 50%
  soundThreePoints.volume = 0.05;
  soundZeroPoints.volume = 0.05;
  soundOnePoint.volume = 0.05;
  clappingSound.volume = 0.05;
  soundOof.volume = 0.05;
  timerSound.volume = 0.05;

  // New state for language selection (default to "finnish")
  const [language, setLanguage] = useState("finnish");
  const [isScoreboardVisible, setIsScoreboardVisible] = useState(true); // State to control visibility

  // Lisää uusi tila ajastimelle
  const [submissionTimer, setSubmissionTimer] = useState(-1); // -1 tarkoittaa rajoittamatonta
  const [submissionTimeLeft, setSubmissionTimeLeft] = useState(null);

  const [showConfetti, setShowConfetti] = useState(false);
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0
  });

  // Toggle the scoreboard visibility
  const toggleScoreboard = () => {
    setIsScoreboardVisible(!isScoreboardVisible);
  };

  const lastWordPromptRef = useRef("");

  useEffect(() => {
    if (!roomId) return;
    const roomRef = doc(db, "rooms", roomId);
  
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const isNewLastRound = !showLastRound && data.showLastRound;
        
        setLastRoundScores(data.lastRoundScores || []);
        setLastRoundWords(data.lastRoundWords || []);
        setShowLastRound(data.showLastRound || false);
        
        // Aktivoi konfetti ja ääni vain kun peli päättyy ja siirrytään viimeisen kierroksen näkymään
        if (data.gameEnded && !showConfetti && isNewLastRound) {
          setShowConfetti(true);
          clappingSound.play().catch((error) => console.error("🔇 Error playing clapping sound:", error));
          
          // Piilota konfetti 10 sekunnin kuluttua
          setTimeout(() => {
            setShowConfetti(false);
          }, 10000);
        }
  
        // 🔊 Play beep sound only when a new word is generated and game is active
        if (
          data.currentRound?.wordPrompt &&
          data.currentRound.wordPrompt !== lastWordPromptRef.current &&
          data.gameStarted &&
          !data.gameEnded
        ) {
          beepSound.play().catch((error) =>
            console.error("🔇 Error playing sound:", error)
          );
          lastWordPromptRef.current = data.currentRound.wordPrompt;
        }
      }
    });
  
    return () => unsubscribe();
  }, [roomId, showConfetti, showLastRound]);
  

useEffect(() => {
    const handleUnload = () => {
      removePlayer(roomId, userId); // No `await` here
    };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("unload", handleUnload); // Extra safety

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("unload", handleUnload);
    };
  }, [roomId, userId]);



  useEffect(() => {
    if (params?.roomId) {
      setRoomId(params.roomId);
    }
  }, [params]);

  useEffect(() => {
    if (gameStarted && !hasSubmitted) {
      inputRef.current?.focus(); // Focus the input element
    }
  }, [gameStarted, hasSubmitted]);

  useEffect(() => {
    if (!roomId) return;

    const setup = async () => {
      const uid = await signInAnon();
      if (!uid) return;
      setUserId(uid);
      try {
        await joinRoom(roomId, uid);
      } catch (error) {
        alert("Room not found!");
        router.push("/");
      }
      const roomRef = doc(db, "rooms", roomId);
      return onSnapshot(roomRef, (snapshot) => {
        if (snapshot.exists()) {
          const roomData = snapshot.data();
          setRoomData(roomData);
          setPlayers(roomData.players || []);
          setGameStarted(roomData.gameStarted || false);
          setGameEnded(roomData.gameEnded || false);
          setIsHost(roomData.hostId === uid);

          if (roomData.currentRound?.wordsSubmitted) {
            checkWordMatches(roomData.currentRound.wordsSubmitted);
          }
        }
      });
    };


    setup();
  }, [roomId, router]);

  useEffect(() => {
    if (!roomData || !roomData.currentRound) return;

    const totalPlayers = players.length;
    const submittedWords = roomData.currentRound.wordsSubmitted?.length || 0;

    if (submittedWords === totalPlayers && !resultsProcessed) {
      console.log("All words submitted! Showing results...");
      setShowResults(true); // Show submitted words
      processResults(); // Process scores
      setResultsProcessed(true); // Mark results as processed

      setTimeout(() => {
        console.log("Starting new round...");
        setShowResults(false); // Hide results for next round
        setHasSubmitted(false);
        setWordMatches({});
        setPlayerCardColors({});
        setWord(""); // Clear input field
        resetGameState();

        // Reset submitted words by setting an empty array
        setRoomData((prev) => ({
          ...prev,
          currentRound: { ...prev.currentRound, wordsSubmitted: [] },
        }));

        setResultsProcessed(false); // Reset for the next round
      }, 10000); // Wait 10 seconds before resetting
    }
  }, [roomData, players, resultsProcessed]);

  useEffect(() => {
    if (!roomData || !roomData.currentRound) return;
    // If a new round starts, reset submission state
    setHasSubmitted(false);
  }, [roomData?.currentRound?.wordPrompt]);

  // Add window resize listener
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const updateScores = async (newScores) => {
    const roomRef = doc(db, "rooms", roomId);
    
    // Calculate new scores
    const updatedPlayers = players.map((player) => ({
      ...player,
      score: (player.score || 0) + (newScores[player.userId] || 0),
    }));

    // Check for a winner (25+ points)
    const winner = updatedPlayers.find((player) => player.score >= 25);
    if (winner) {
      setGameEnded(true);
      setWinner(winner);
      setLastRoundWords(roomData.currentRound.wordsSubmitted);
      setShowLastRound(true);

      // Store last round scores **before resetting** the Firestore document
      const lastRoundScores = updatedPlayers.map(player => ({
        userId: player.userId,
        nickname: player.nickname,
        score: player.score,
      }));

      // ✅ Save last round scores & words to Firestore
      await updateDoc(roomRef, {
        lastRoundScores: lastRoundScores,
        lastRoundWords: roomData.currentRound.wordsSubmitted,
        players: updatedPlayers.map(p => ({ ...p, score: 0 })),
        gameStarted: false,
        gameEnded: true, // Tämä laukaisee konfetin ja äänen kaikille
        showLastRound: true,
      });

      setTimeout(() => {
        setShowLastRound(false);
        updateDoc(roomRef, {
          showLastRound: false,
          gameEnded: false, // Nollaa voittotila
        });
      }, 10000);

      return;
    }

    // If no winner, update Firestore with new scores
    await updateDoc(roomRef, { players: updatedPlayers });
  };

  const checkWordMatches = (wordsSubmitted) => {
    const wordCount = {};
    const matchResults = {};
    wordsSubmitted.forEach((submission) => {
      const word = submission.word.toLowerCase();
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
    wordsSubmitted.forEach((submission) => {
      const word = submission.word.toLowerCase();
      const count = wordCount[word];
      
      if (word === "-") {
        matchResults[submission.userId] = "black";
      } else if (count === 1) {
        matchResults[submission.userId] = "red";
      } else if (count === 2) {
        matchResults[submission.userId] = "blue";
      } else {
        matchResults[submission.userId] = "green";
      }
    });
    setWordMatches(matchResults);
  };

  const resetGameState = async () => {
    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, {
      "currentRound.wordsSubmitted": [],
    });
    setHasSubmitted(false);
    setShowResults(false);
    setResultsProcessed(false);
    setWinner(null);
    setLastRoundWords([]);
  };

  const handleNicknameSubmit = async () => {
    if (!nickname) {
      alert("Please enter a nickname!");
      return;
    }
    const roomRef = doc(db, "rooms", roomId);
    try {
      const roomSnapshot = await getDoc(roomRef);
      if (!roomSnapshot.exists()) return;
      const roomData = roomSnapshot.data();
      const players = roomData.players || [];
      const playerIndex = players.findIndex((p) => p.userId === userId);
      if (playerIndex !== -1) players[playerIndex].nickname = nickname;
      else players.push({ userId, nickname, score: 0 });
      await updateDoc(roomRef, { players });
      setIsNicknameSet(true);
    } catch (error) {
      console.error("Error setting nickname:", error);
    }
  };

  // Modified handleStartGame now passes the language parameter
  const handleStartGame = async () => {
    if (isHost && !gameStarted) {
      try {
        setIsLoading(true);
        console.log("🎮 Starting game with settings:", {
          roomId,
          language,
          submissionTimer,
          userId
        });

        await startGame(roomId, language, submissionTimer);
        console.log("✅ Game started successfully");
        setIsLoading(false);
        setGameEnded(false);
      } catch (error) {
        console.error("❌ Error in handleStartGame:", error);
        setIsLoading(false);
      }
    }
  };

  const handleSubmitWord = async () => {
    if (word.trim() && !hasSubmitted) {
      const roomRef = doc(db, "rooms", roomId);
      await updateDoc(roomRef, {
        'currentRound.wordsSubmitted': arrayUnion({ userId, word }),
      });
      setHasSubmitted(true);
      setWord("");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !hasSubmitted) {
      handleSubmitWord(); // Call your word submission logic
    }
  };

  const processResults = async () => {
    if (resultsProcessed || !roomData || !roomData.currentRound) return;
    setResultsProcessed(true); // Varmista, että tämä suoritetaan vain kerran kierroksittain
  
    const wordCount = {};
    const newScores = {};
  
    roomData.currentRound.wordsSubmitted.forEach((submission) => {
      const word = submission.word.toLowerCase();
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
  
    roomData.currentRound.wordsSubmitted.forEach((submission) => {
      const playerId = submission.userId;
      const word = submission.word.toLowerCase();
      const count = wordCount[word];

      if (!newScores[playerId]) newScores[playerId] = 0;

      if (word === "-") {
        // Pelaaja on lähettänyt merkin "-"
        newScores[playerId] -= 1; // Vähennä 1 piste
        if (playerId === userId) {
          soundOof.play().catch((error) => console.error("🔇 Error playing oof sound:", error)); // Soita oof-ääni
        }
      } else if (count === 1) {
        // Vain nykyiselle pelaajalle soitetaan ääni
        if (playerId === userId) {
          soundZeroPoints.play().catch((error) => console.error("🔇 Error playing sound:", error));
        }
      } else if (count === 2) {
        newScores[playerId] += 3;
        if (playerId === userId) {
          soundThreePoints.play().catch((error) => console.error("🔇 Error playing sound:", error));
        }
      } else {
        newScores[playerId] += 1;
        if (playerId === userId) {
          soundOnePoint.play().catch((error) => console.error("🔇 Error playing sound:", error));
        }
      }
    });
  
    // Varmista, että vain isäntä päivittää pisteet
    if (roomData.hostId === userId) {
      await updateScores(newScores);
    }
  
    if (roomData.gameEnded) return; // Lopeta, jos peli on päättynyt
  
    let countdown = 10;
    setNextRoundTimer(countdown);
  
    const countdownInterval = setInterval(() => {
      countdown -= 1;
      setNextRoundTimer(countdown);
  
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        setNextRoundTimer(null);
  
        console.log("Starting new round...");
        setShowResults(false);
        setHasSubmitted(false);
        setWordMatches({});
        setPlayerCardColors({});
        setWord("");
        setResultsProcessed(false);
  
        generateNewWord(roomId, userId, language); // Jatka peliä
      }
    }, 1000);
  };

  const allPlayersSubmitted =
    roomData?.currentRound?.wordsSubmitted?.length === players.length;


// Memoize handleAutoSubmit
const handleAutoSubmit = useCallback(async () => {
  if (!hasSubmitted) {
    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, {
      'currentRound.wordsSubmitted': arrayUnion({ userId, word: "-" }),
    });
    setHasSubmitted(true);
    setWord("");
  }
}, [hasSubmitted, roomId, userId, setWord, setHasSubmitted]);

useEffect(() => {
  if (!roomData?.currentRound?.wordPrompt || !gameStarted) return;

  // Reset the sound flag when starting a new round
  hasPlayedSoundRef.current = false;
  
  // Set volume once
  timerSound.current.volume = 0.05;
  
  // Jos ajastin on -1 (rajoittamaton), älä käynnistä ajastinta
  if (roomData.submissionTimer === -1) {
    setSubmissionTimeLeft(null);
    return;
  }
  
  const timerDuration = roomData.submissionTimer * 1000;
  const startTime = Date.now();

  const timer = setInterval(() => {
    const timeLeft = Math.max(0, timerDuration - (Date.now() - startTime));
    setSubmissionTimeLeft(Math.ceil(timeLeft / 1000));

    // Tarkista onko pelaaja lähettänyt sanan
    const hasPlayerSubmitted = roomData?.currentRound?.wordsSubmitted?.some(
      submission => submission.userId === userId
    );

    // Play the timer sound only once when there are 5 seconds left and player hasn't submitted
    if (timeLeft <= 5000 && timeLeft > 0 && !hasPlayerSubmitted && !hasPlayedSoundRef.current && !showResults) {
      timerSound.current.play().catch((error) => 
        console.error("🔇 Error playing timer sound:", error)
      );
      hasPlayedSoundRef.current = true;
    }

    // Stop the sound when the timer runs out or player has submitted
    if (timeLeft <= 0 || hasPlayerSubmitted) {
      timerSound.current.pause();
      timerSound.current.currentTime = 0;
    }

    // Handle auto-submit only when time runs out
    if (timeLeft <= 0) {
      handleAutoSubmit();
      clearInterval(timer);
    }
  }, 100);

  // Cleanup function
  return () => {
    clearInterval(timer);
    timerSound.current.pause();
    timerSound.current.currentTime = 0;
  };
}, [
  roomData?.currentRound?.wordPrompt, 
  gameStarted, 
  roomData?.submissionTimer,
  handleAutoSubmit
]);



  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-white p-6">
      {showConfetti && (
        <ReactConfetti
          width={windowSize.width}
          height={windowSize.height}
          numberOfPieces={200}
          recycle={false}
          colors={['#FFD700', '#FFA500', '#FF69B4', '#00FF00', '#4169E1']}
        />
      )}
      <h1 className="text-4xl font-bold mb-4">{t('roomid')}: {roomId}</h1>
      {/* Scoreboard Section */}
      {lastRoundScores && showLastRound && lastRoundScores.length > 0 ? (
  // Last Round Scoreboard
  <div className="w-full max-w-2xl bg-gray-800 p-4 rounded-lg shadow-lg mb-6 relative">
    {/* Minimize/Maximize Button */}
    <button 
      onClick={toggleScoreboard}
      className="absolute top-2 right-2 bg-gray-600 text-white text-xs rounded-full p-1 hover:bg-gray-500 focus:outline-none"
    >
      {/* Toggle icon based on the current state */}
      {isScoreboardVisible ? '🔽' : '🔼'}
    </button>

    {/* Always visible scoreboard title */}
    <h2 className="text-2xl font-bold text-center mb-4">🏆 Last Round Scoreboard 🏆</h2>
    
    {/* Only show players and scores if isScoreboardVisible is true */}
    {isScoreboardVisible && (
      <div>
        <div className="grid grid-cols-2 border-b border-gray-600 pb-2 text-gray-400">
          <div className="font-semibold">{t('nickname')}</div>
          <div className="font-semibold text-right">{t('points')}</div>
        </div>
        {lastRoundScores
          .slice()
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .map((player, index) => (
            <div
              key={player.userId}
              className={`grid grid-cols-2 py-2 border-b border-gray-700 text-lg
                ${index === 0 ? "text-yellow-400 font-bold" : ""} 
                ${index === 1 ? "text-gray-300 font-semibold" : ""} 
                ${index === 2 ? "text-amber-600" : ""}`}
            >
              <div className="flex items-center">
                {index === 0 && <span className="mr-2">🥇</span>}
                {index === 1 && <span className="mr-2">🥈</span>}
                {index === 2 && <span className="mr-2">🥉</span>}
                {player.nickname}
              </div>
              <div className="text-right">{player.score || 0}</div>
            </div>
          ))}
      </div>
    )}
  </div>
) : (
  // Normal Scoreboard
  <div className="w-full max-w-2xl bg-gray-800 p-4 rounded-lg shadow-lg mb-6 relative">
    {/* Minimize/Maximize Button */}
    <button 
      onClick={toggleScoreboard}
      className="absolute top-2 right-2 bg-gray-600 text-white text-xs rounded-full p-1 hover:bg-gray-500 focus:outline-none"
    >
      {/* Toggle icon based on the current state */}
      {isScoreboardVisible ? '🔽' : '🔼'}
    </button>

    {/* Always visible scoreboard title */}
    <h2 className="text-xl font-semibold text-center mb-4">📜 {t('scoreboard')}</h2>

    {/* Only show players and scores if isScoreboardVisible is true */}
    {isScoreboardVisible && (
      <div>
        <div className="grid grid-cols-2 border-b border-gray-600 pb-2 text-gray-400">
          <div className="font-semibold">{t('nickname')}</div>
          <div className="font-semibold text-right">{t('points')}</div>
        </div>
        {players
          .slice()
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .map((player, index) => (
            <div
              key={player.userId}
              className={`grid grid-cols-2 py-2 border-b border-gray-700 text-lg
                ${index === 0 ? "text-yellow-400 font-bold" : ""} 
                ${index === 1 ? "text-gray-300 font-semibold" : ""} 
                ${index === 2 ? "text-amber-600" : ""}`}
            >
              <div>{player.nickname}</div>
              <div className="text-right">{player.score || 0}</div>
            </div>
          ))}
      </div>
    )}
  </div>
)}






      {/* Player Cards Section */}
      {gameStarted && (
        <div className="w-full max-w-2xl grid grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          {players.map((player) => (
            <div
              key={player.userId}
              className={`bg-gray-800 p-4 rounded-lg shadow-md text-center border-4 w-full
          ${showResults && wordMatches[player.userId] === "red" ? "border-red-500" : ""}
          ${showResults && wordMatches[player.userId] === "blue" ? "border-blue-500" : ""}
          ${showResults && wordMatches[player.userId] === "green" ? "border-green-500" : ""}
          ${showResults && wordMatches[player.userId] === "black" ? "border-black" : ""}`}
            >
              <h3 className="text-lg font-semibold">{player.nickname}</h3>
              <div className="mt-2 p-2 bg-gray-700 rounded-md">
                {!showResults
                  ? roomData?.currentRound?.wordsSubmitted?.some(w => w.userId === player.userId)
                    ? t('submitted')
                    : t('waiting')
                  : roomData?.currentRound?.wordsSubmitted?.find(w => w.userId === player.userId)?.word || t('waiting')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Display Last Round Words Using Player Cards */}
      {showLastRound &&(
        <div className="w-full max-w-2xl grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          {players.map((player) => {
            const lastRoundWord = lastRoundWords.find(w => w.userId === player.userId)?.word;
            return (
              <div
                key={player.userId}
                className={`bg-gray-800 p-4 rounded-lg shadow-md text-center border-4 w-full
          ${showResults && wordMatches[player.userId] === "red" ? "border-red-500" : ""}
          ${showResults && wordMatches[player.userId] === "blue" ? "border-blue-500" : ""}
          ${showResults && wordMatches[player.userId] === "green" ? "border-green-500" : ""}
          ${showResults && wordMatches[player.userId] === "black" ? "border-black" : ""}`}
              >
                <h3 className="text-lg font-semibold">{player.nickname}</h3>
                <div className="mt-2 p-2 bg-gray-700 rounded-md">
                  {lastRoundWord}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nickname Input and Button Section */}
      {!gameStarted && !isNicknameSet && (
        <div className="w-full max-w-2xl flex items-stretch space-x-4 mb-6">
          <div className="flex-grow">
            <div className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t('enter_your_nickname')}
                className="w-full p-2 text-lg border rounded-md text-black"
                maxLength={15}
              />
            </div>
          </div>
          <button
            onClick={handleNicknameSubmit}
            className="bg-blue-500 text-white px-8 text-xl rounded-lg shadow-md hover:bg-blue-600 transition flex items-center justify-center min-w-[200px]"
          >
            {t('set_nickname')}
          </button>
        </div>
      )}

      {/* Language Dropdown and Start Game Button Section */}
      {isHost && !gameStarted && (
        <div className="w-full max-w-2xl flex items-stretch space-x-4 mb-6">
          <div className="flex-grow flex flex-col space-y-4">
            {!winner && (
              <div className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                <span className="text-lg text-gray-300">{t('word_pack_language')}</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="p-2 ml-4 text-lg border rounded-md text-black focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                >
                  <option value="finnish">{t('finnish')}</option>
                  <option value="english">{t('english')}</option>
                  <option value="custom">{t('custom')}</option>
                </select>
              </div>
            )}
            {!winner && (
              <div className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                <span className="text-lg text-gray-300">{t('submission_timer')}</span>
                <select
                  value={submissionTimer}
                  onChange={(e) => setSubmissionTimer(Number(e.target.value))}
                  className="p-2 ml-4 text-lg border rounded-md text-black focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                >
                  <option value="-1">{t('unlimited')}</option>
                  <option value="10">10s</option>
                  <option value="20">20s</option>
                  <option value="30">30s</option>
                  <option value="45">45s</option>
                  <option value="60">60s</option>
                  <option value="90">90s</option>
                  <option value="120">120s</option>
                </select>
              </div>
            )}
          </div>
          {!winner && (
            <button
              onClick={handleStartGame}
              className="bg-green-500 text-white px-8 text-xl rounded-lg shadow-md hover:bg-green-600 transition flex items-center justify-center min-w-[200px]"
              disabled={isLoading}
            >
              {isLoading ? t('starting_game') : t('start_game')}
            </button>
          )}
        </div>
      )}

      {/* Game Round and Word Submission */}
      {gameStarted && (
        <div className="mt-6 text-center">
          <h2 className="text-3xl font-bold text-yellow-500 mb-4 p-2 bg-gray-900 rounded-lg inline-block">
            {t('round_word_is')}
          </h2>
          <h2 className="text-4xl font-bold text-gray-100 mb-6">
            {roomData?.currentRound?.wordPrompt.toLowerCase() || "Word Prompt"}
          </h2>
          {nextRoundTimer !== null && (
            <p className="text-lg text-gray-500 mt-2">
              {t('new_round_starts_in')} {nextRoundTimer} {t('after_seconds')}
            </p>
          )}
          {gameStarted && submissionTimeLeft !== null && !hasSubmitted && (
  <div className="mt-2">
    <p className={`text-xl font-bold ${submissionTimeLeft <= 5 ? 'text-red-500' : 'text-white'}`}>
      {t('time_left')}: {submissionTimeLeft}s
    </p>
  </div>
)}
          <div className="mt-4">
            <input
              ref={inputRef}
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder={t('enter_your_word')}
              className="p-4 text-lg border-2 border-gray-600 rounded-lg bg-gray-800 text-white w-64 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={hasSubmitted}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            onClick={handleSubmitWord}
            className="bg-blue-500 text-white px-6 py-3 text-lg rounded-lg shadow-md hover:bg-blue-600 transition focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          >
            {t('submit_word')}
          </button>
        </div>

      )}
    </div>
  );
}