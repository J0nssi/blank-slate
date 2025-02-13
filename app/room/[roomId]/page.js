"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  db,
  joinRoom,
  signInAnon,
  startGame,
  generateNewWord,
  // ... other exported functions if needed
} from "../../../lib/firebase";
import { doc, onSnapshot, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import { useTranslations } from 'next-intl';

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

  // New state for language selection (default to "finnish")
  const [language, setLanguage] = useState("finnish");

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
  
      // Show last round scoreboard
      setShowLastRound(true);
  
      // Store last round scores **before resetting** the Firestore document
      setLastRoundScores(updatedPlayers.map(player => ({
        userId: player.userId,
        nickname: player.nickname,
        score: player.score, // Save scores before reset
      })));
  
      // Update Firestore to reset scores & return to lobby
      await updateDoc(roomRef, {
        players: updatedPlayers.map(p => ({ ...p, score: 0 })), // Reset scores
        gameStarted: false, // Return to lobby
        gameEnded: true,
      });
  
      // Hide last round scoreboard after 10 seconds
      setTimeout(() => {
        setGameEnded(false);
        setShowLastRound(false); // Switch back to normal scoreboard
        setWinner(null);
        setLastRoundWords([]);
        setLastRoundScores([]); // Clear after 10s
        setShowResults(false);
        setResultsProcessed(false);
        setHasSubmitted(false);
        setWordMatches({});
        setPlayerCardColors({});
        setWord("");
        resetGameState();
      }, 10000); // Wait 10 seconds before resetting UI
  
      return; // Stop further updates
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
      const count = wordCount[submission.word.toLowerCase()];
      if (count === 1) matchResults[submission.userId] = "red";
      else if (count === 2) matchResults[submission.userId] = "blue";
      else matchResults[submission.userId] = "green";
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
      setIsLoading(true);
      console.log("🔍 Starting game with userId:", userId);  // Ensure this logs the correct userId

      await startGame(roomId, language);
      setIsLoading(false);
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
    if (resultsProcessed) return;

    const wordCount = {};
    const newScores = {};

    roomData?.currentRound?.wordsSubmitted.forEach((submission) => {
      const word = submission.word.toLowerCase();
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    roomData?.currentRound?.wordsSubmitted.forEach((submission) => {
      const userId = submission.userId;
      const word = submission.word.toLowerCase();
      const count = wordCount[word];

      if (count === 1) {
        newScores[userId] = (newScores[userId] || 0);
      } else if (count === 2) {
        newScores[userId] = (newScores[userId] || 0) + 3;
      } else {
        newScores[userId] = (newScores[userId] || 0) + 1;
      }
    });

    await updateScores(newScores);

    if (roomData.gameEnded) return; // Stop if game has ended

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
        
        generateNewWord(roomId, userId, language); // Keep the game going
      }
    }, 1000);
  };

  const allPlayersSubmitted =
    roomData?.currentRound?.wordsSubmitted?.length === players.length;

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-4xl font-bold mb-4">{t('roomid')}: {roomId}</h1>

      {/* Scoreboard Section */}
{showLastRound ? (
  // Last Round Scoreboard
  <div className="w-full max-w-2xl bg-gray-800 p-4 rounded-lg shadow-lg mb-6">
    <h2 className="text-3xl font-bold text-center mb-8">
      🎉 <span className="text-yellow-400">{winner?.nickname}</span> wins with {winner?.score} points! 🎉
    </h2>
    <h2 className="text-2xl font-bold text-center mb-4">🏆 Last Round Scoreboard 🏆</h2>
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
) : (
  // Normal Scoreboard
  <div className="w-full max-w-2xl bg-gray-800 p-4 rounded-lg shadow-lg mb-6">
    <h2 className="text-xl font-semibold text-center mb-4">📜 {t('scoreboard')}</h2>
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

      {/* Player Cards Section */}
      {gameStarted && (
        <div className="w-full max-w-2xl grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          {players.map((player) => (
            <div
              key={player.userId}
              className={`bg-gray-800 p-4 rounded-lg shadow-md text-center border-4 w-full
          ${showResults && wordMatches[player.userId] === "red" ? "border-red-500" : ""}
          ${showResults && wordMatches[player.userId] === "blue" ? "border-blue-500" : ""}
          ${showResults && wordMatches[player.userId] === "green" ? "border-green-500" : ""}`}
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
      {gameEnded && winner && (
        <div className="w-full max-w-2xl grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          {players.map((player) => {
            const lastRoundWord = lastRoundWords.find(w => w.userId === player.userId)?.word;
            return (
              <div
                key={player.userId}
                className={`bg-gray-800 p-4 rounded-lg shadow-md text-center border-4 w-full
          ${showResults && wordMatches[player.userId] === "red" ? "border-red-500" : ""}
          ${showResults && wordMatches[player.userId] === "blue" ? "border-blue-500" : ""}
          ${showResults && wordMatches[player.userId] === "green" ? "border-green-500" : ""}`}
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
        <div className="w-full max-w-2xl mb-6 flex items-center justify-between space-x-4">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={t('enter_your_nickname')}
            className="w-2/3 p-2 text-lg border rounded-md text-black"
            maxLength={15}
          />
          <button
            onClick={handleNicknameSubmit}
            className="w-1/3 bg-blue-500 text-white px-4 py-2 text-lg rounded-lg shadow-md hover:bg-blue-600 transition"
          >
            {t('set_nickname')}
          </button>
        </div>
      )}

      {/* Language Dropdown and Start Game Button Section */}
      {isHost && !gameStarted && !winner && (
        <div className="w-full max-w-2xl flex flex-col md:flex-row items-center justify-between space-x-0 md:space-x-4 mb-6">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
            <span className="text-lg text-gray-300">{t('word_pack_language')}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="p-2 text-lg border rounded-md text-black focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              <option value="finnish">{t('finnish')}</option>
              <option value="english">{t('english')}</option>
            </select>
          </div>
          <button
            onClick={handleStartGame}
            className="bg-green-500 text-white px-8 py-4 text-xl rounded-lg shadow-md hover:bg-green-600 transition w-full md:w-auto"
            disabled={isLoading}
          >
            {isLoading ? t('starting_game') : t('start_game')}
          </button>
        </div>
      )}

      {/* Game Round and Word Submission */}
      {gameStarted && (
        <div className="mt-6 text-center">
          <h2 className="text-3xl font-bold text-yellow-500 mb-4 p-2 bg-gray-900 rounded-lg inline-block">
            {t('round_word_is')}
          </h2>
          <h2 className="text-4xl font-bold text-gray-100 mb-6">
            {roomData?.currentRound?.wordPrompt || "Word Prompt"}
          </h2>
          {nextRoundTimer !== null && (
            <p className="text-lg text-gray-500 mt-2">
              {t('new_round_starts_in')} {nextRoundTimer} {t('after_seconds')}
            </p>
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