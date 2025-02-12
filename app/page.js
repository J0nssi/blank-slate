"use client"; // Required for client-side execution

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "../lib/firebase"; // Adjust path if needed
import {useTranslations} from 'next-intl';
import LanguageSwitcher from "../app/languageSwitcher";

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [roomId, setRoomId] = useState(""); // Store the entered Room ID
  const [isModalOpen, setIsModalOpen] = useState(false); // State for modal
  const t = useTranslations('home');

  // Function to host a new game
  const handleHostGame = async () => {
    try {
      setIsLoading(true);
      const { roomId } = await createRoom(); // Create room and get roomId
      router.push(`/room/${roomId}`); // Redirect to the created room using the roomId
    } catch (error) {
      console.error("Error creating room:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to join an existing game
  const handleJoinGame = () => {
    if (roomId.trim()) {
      router.push(`/room/${roomId}`); // Navigate to the room with the entered ID
    } else {
      alert("Please enter a valid Room ID!");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-5xl font-bold mb-8">{t('title')}</h1>
      
      <div className="space-y-4 w-64">
        <button
          onClick={handleHostGame}
          className="bg-blue-500 text-white px-8 py-4 text-xl rounded-lg shadow-md hover:bg-blue-600 transition w-full"
          disabled={isLoading}
        >
          {isLoading ? "Creating..." : t('hostgame')}
        </button>

        {/* Input for entering Room ID */}
        <input
          type="text"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder={t('enterroom')}
          className="p-3 text-lg border rounded-md text-black w-full"
        />

        <button
          onClick={handleJoinGame}
          className="bg-green-600 text-white px-8 py-4 text-xl rounded-lg shadow-md hover:bg-gray-700 transition w-full"
        >
          {t('joingame')}
        </button>
      </div>

      {/* How the Game Works Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="mt-6 text-lg text-blue-400 hover:underline"
      >
        {t('how')}
      </button>

      <LanguageSwitcher />

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white text-black p-6 rounded-lg shadow-lg w-96">
            <h2 className="text-2xl font-bold mb-4">How to Play</h2>
            <p className="mb-4">{t('step1')}</p>
            <p className="mb-4">{t('step2')}</p>
            <p className="mb-4">{t('step3')}</p>
            <p className="mb-4">{t('step4')}</p>
            <button
              onClick={() => setIsModalOpen(false)}
              className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
