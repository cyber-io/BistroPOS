import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wifi, Copy, Check, Sparkles, Trophy, RotateCcw, 
  Gamepad2, X, Timer, HelpCircle, Award, Star
} from 'lucide-react';
import { api } from '../../services/api';

const triviaQuestions = [
  {
    question: 'Which country is traditionally credited with inventing Espresso?',
    options: ['Italy', 'France', 'Brazil', 'Colombia'],
    answer: 0,
    fact: 'Espresso was pioneered in Milan, Italy in the early 20th century!'
  },
  {
    question: 'What is the signature herb used in authentic Pesto alla Genovese?',
    options: ['Cilantro', 'Sweet Basil', 'Oregano', 'Parsley'],
    answer: 1,
    fact: 'Fresh Genovese sweet basil leaves combined with pine nuts, parmesan, and garlic give pesto its iconic aroma.'
  },
  {
    question: 'Which spice is derived from Crocus sativus and is the world’s most precious spice?',
    options: ['Cardamom', 'Vanilla', 'Saffron', 'Cinnamon'],
    answer: 2,
    fact: 'It requires over 75,000 saffron blossoms to produce just a single pound of saffron threads!'
  },
  {
    question: 'In traditional Indian cuisine, which clarified butter is celebrated for deep richness?',
    options: ['Margarine', 'Desi Ghee', 'Olive oil', 'Sesame oil'],
    answer: 1,
    fact: 'Desi Ghee has been prized for millennia in Indian gastronomy and Ayurvedic traditions.'
  },
  {
    question: 'What gives authentic Neapolitan pizza crust its signature blistered, airy puff?',
    options: ['Baking powder', 'Wood-fire oven at 450°C+', 'Cornstarch', 'Extra yeast'],
    answer: 1,
    fact: 'Wood-fired ovens operating at over 450°C (850°F) flash-cook Neapolitan pizza in 60-90 seconds!'
  }
];

const culinaryPairs = [
  { foodId: 'pizza', icon: '🍕', name: 'Pizza' },
  { foodId: 'burger', icon: '🍔', name: 'Burger' },
  { foodId: 'sushi', icon: '🍣', name: 'Sushi' },
  { foodId: 'taco', icon: '🌮', name: 'Taco' },
  { foodId: 'icecream', icon: '🍨', name: 'Ice Cream' },
  { foodId: 'coffee', icon: '☕', name: 'Coffee' }
];

function generateShuffledMemoryCards() {
  const deck = [];
  culinaryPairs.forEach((item, index) => {
    deck.push({ id: `c-${index}-a`, foodId: item.foodId, icon: item.icon, name: item.name });
    deck.push({ id: `c-${index}-b`, foodId: item.foodId, icon: item.icon, name: item.name });
  });
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export default function WifiAndEntertainmentCard({ 
  isOpen = true, 
  onClose, 
  tableNumber = 'A9', 
  lang = 'en' 
}) {
  // Tabs: 'WIFI' | 'TRIVIA' | 'MEMORY' | 'LEADERBOARD'
  const [activeSubTab, setActiveSubTab] = useState('WIFI');

  // Wi-Fi State
  const [wifiData, setWifiData] = useState({
    ssid: 'Bistro_Bloom_Guest',
    password: 'BloomGuest@2026',
    enabled: true
  });
  const [copied, setCopied] = useState(false);

  // Trivia Quiz State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [triviaScore, setTriviaScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // Memory Game State
  const [memoryCards, setMemoryCards] = useState(() => generateShuffledMemoryCards());
  const [flippedCards, setFlippedCards] = useState([]); // Array of card ids currently turned
  const [matchedCardIds, setMatchedCardIds] = useState([]); // Array of matched card ids
  const [memoryMoves, setMemoryMoves] = useState(0);
  const [isMemoryChecking, setIsMemoryChecking] = useState(false);
  const [memoryBonusPoints, setMemoryBonusPoints] = useState(0);

  // Load Wi-Fi credentials from backend if available
  useEffect(() => {
    let mounted = true;
    api.getRestaurantWifi?.()
      .then(res => {
        if (mounted && res) {
          setWifiData({
            ssid: res.wifiSsid || 'Bistro_Bloom_Guest',
            password: res.wifiPassword || 'BloomGuest@2026',
            enabled: res.wifiEnabled !== false
          });
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const handleCopyPassword = () => {
    if (!wifiData.password) return;
    navigator.clipboard?.writeText(wifiData.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Trivia Handlers
  const handleSelectOption = (index) => {
    if (isAnswered) return;
    setSelectedAnswer(index);
    setIsAnswered(true);
    if (index === triviaQuestions[currentQuestionIndex].answer) {
      setTriviaScore(prev => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex + 1 < triviaQuestions.length) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
    } else {
      setQuizFinished(true);
    }
  };

  const handleRestartQuiz = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setTriviaScore(0);
    setQuizFinished(false);
  };

  // Memory Handlers
  const handleCardClick = (card) => {
    if (isMemoryChecking) return;
    if (matchedCardIds.includes(card.id)) return;
    if (flippedCards.length === 1 && flippedCards[0].id === card.id) return;

    const newFlipped = [...flippedCards, card];
    setFlippedCards(newFlipped);

    if (newFlipped.length === 2) {
      setMemoryMoves(m => m + 1);
      const [first, second] = newFlipped;
      if (first.foodId === second.foodId) {
        // Matched!
        setMatchedCardIds(prev => {
          const updated = [...prev, first.id, second.id];
          if (updated.length === 12) {
            setMemoryBonusPoints(prevPts => prevPts + 150);
          }
          return updated;
        });
        setFlippedCards([]);
      } else {
        // Not matched - flip back after short delay
        setIsMemoryChecking(true);
        setTimeout(() => {
          setFlippedCards([]);
          setIsMemoryChecking(false);
        }, 750);
      }
    }
  };

  const handleRestartMemory = () => {
    setMemoryCards(generateShuffledMemoryCards());
    setFlippedCards([]);
    setMatchedCardIds([]);
    setMemoryMoves(0);
    setIsMemoryChecking(false);
  };

  const currentQ = triviaQuestions[currentQuestionIndex];
  const matchedPairsCount = Math.floor(matchedCardIds.length / 2);
  const totalUserPoints = 200 + (triviaScore * 30) + memoryBonusPoints;

  if (!isOpen) return null;

  // The modal wrapper
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div 
        className="bg-[#1c2028] text-white w-full max-w-md rounded-[28px] shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[92vh] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header matching Screenshot 1 & 2 */}
        <div className="p-4 sm:p-5 flex items-center justify-between pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0">
              <Gamepad2 size={22} />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight">
                {lang === 'hi' ? 'मनोरंजन एवं टेबल लाउंज' : 'Entertainment & Table Lounge'}
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">
                {lang === 'hi' ? 'खेलें, अन्य टेबलों से मुकाबला करें और जुड़े रहें' : 'Play, compete with other tables & stay connected'}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* 4 Tabs Row matching Screenshots */}
        <div className="px-4 sm:px-5 border-b border-white/10 flex items-center gap-5 sm:gap-6 overflow-x-auto no-scrollbar text-xs font-semibold">
          {/* Tab 1: Restaurant Wi-Fi */}
          <button
            type="button"
            onClick={() => setActiveSubTab('WIFI')}
            className={`pb-2.5 flex items-center gap-1.5 whitespace-nowrap transition-colors relative ${
              activeSubTab === 'WIFI' ? 'text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi size={14} />
            <span>Restaurant Wi-Fi</span>
            {activeSubTab === 'WIFI' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
            )}
          </button>

          {/* Tab 2: Food Trivia Quiz */}
          <button
            type="button"
            onClick={() => setActiveSubTab('TRIVIA')}
            className={`pb-2.5 flex items-center gap-1.5 whitespace-nowrap transition-colors relative ${
              activeSubTab === 'TRIVIA' ? 'text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles size={14} />
            <span>Food Trivia Quiz</span>
            {activeSubTab === 'TRIVIA' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
            )}
          </button>

          {/* Tab 3: Culinary Memory */}
          <button
            type="button"
            onClick={() => setActiveSubTab('MEMORY')}
            className={`pb-2.5 flex items-center gap-1.5 whitespace-nowrap transition-colors relative ${
              activeSubTab === 'MEMORY' ? 'text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Timer size={14} />
            <span>Culinary Memory</span>
            {activeSubTab === 'MEMORY' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
            )}
          </button>

          {/* Tab 4: Leaderboard */}
          <button
            type="button"
            onClick={() => setActiveSubTab('LEADERBOARD')}
            className={`pb-2.5 flex items-center gap-1.5 whitespace-nowrap transition-colors relative ${
              activeSubTab === 'LEADERBOARD' ? 'text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trophy size={14} />
            <span>Leaderboard</span>
            {activeSubTab === 'LEADERBOARD' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
            )}
          </button>
        </div>

        {/* Tab Body Contents */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          
          {/* TAB 1: RESTAURANT WI-FI (Screenshot 2) */}
          {activeSubTab === 'WIFI' && (
            <div className="space-y-3 animate-fadeIn">
              {/* Deep Navy Card */}
              <div className="bg-gradient-to-br from-[#12192e] via-[#151c33] to-[#0d1222] border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-inner">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#082622] border border-teal-500/30 text-teal-400 flex items-center justify-center shrink-0">
                      <Wifi size={22} className="text-[#2dd4bf]" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300 block">
                        COMPLIMENTARY DINING WI-FI
                      </span>
                      <strong className="text-base sm:text-lg font-bold text-white tracking-wide block">
                        {wifiData.ssid}
                      </strong>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#0a2e28] border border-teal-500/30 text-[#2dd4bf] text-[11px] font-bold shrink-0">
                    High Speed 5G
                  </span>
                </div>

                {/* Password Box */}
                <div className="bg-[#192138] rounded-xl p-3 sm:p-3.5 border border-blue-900/40 flex items-center justify-between mt-4">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block">PASSWORD</span>
                    <span className="font-mono text-sm sm:text-base font-bold text-white tracking-wide select-all">
                      {wifiData.password}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className="px-3.5 py-1.5 rounded-lg bg-[#2b3452] hover:bg-[#364166] text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs"
                  >
                    {copied ? (
                      <>
                        <Check size={14} className="text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} className="text-slate-300" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                  Enjoy seamless browsing, streaming, and ordering while our chefs prepare your delicacies.
                </p>
              </div>

              {/* Bottom Teaser Card */}
              <div className="bg-[#20242e] border border-white/5 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Gamepad2 size={16} className="text-slate-300" />
                  <span>Play & Compete While You Wait!</span>
                </div>
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                  Test your foodie knowledge or challenge other tables to top the live restaurant leaderboard! Tap the tabs above to begin.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: FOOD TRIVIA QUIZ */}
          {activeSubTab === 'TRIVIA' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Sparkles size={14} />
                  </div>
                  <span className="text-xs font-bold text-slate-200">
                    {lang === 'hi' ? 'पाक-कला ट्रिविया' : 'Culinary Food Trivia'}
                  </span>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {quizFinished ? `Score: ${triviaScore}/${triviaQuestions.length}` : `Q ${currentQuestionIndex + 1} of ${triviaQuestions.length}`}
                </span>
              </div>

              {quizFinished ? (
                <div className="text-center py-6 space-y-3.5 bg-[#20242e] rounded-2xl p-5 border border-white/5">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                    <Trophy size={28} />
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-bold text-base text-white">
                      {triviaScore >= 4 ? '🎉 Culinary Connoisseur!' : triviaScore >= 2 ? '👏 Good Effort, Foodie!' : '🍽️ Keep Exploring Flavors!'}
                    </h5>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      You answered <strong className="text-white">{triviaScore}</strong> out of <strong className="text-white">{triviaQuestions.length}</strong> questions correctly! (+{triviaScore * 30} pts)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRestartQuiz}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-all active:scale-95 shadow-sm"
                  >
                    <RotateCcw size={14} /> Play Again
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <p className="text-sm font-bold text-white leading-snug">
                    {currentQ.question}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {currentQ.options.map((opt, idx) => {
                      let btnStyle = 'bg-[#252934] border-slate-700/60 text-slate-200 hover:bg-[#2e3442] hover:border-slate-600';
                      if (isAnswered) {
                        if (idx === currentQ.answer) {
                          btnStyle = 'bg-emerald-950/70 border-emerald-500 text-emerald-200 font-bold ring-1 ring-emerald-500';
                        } else if (idx === selectedAnswer) {
                          btnStyle = 'bg-rose-950/70 border-rose-500 text-rose-200 ring-1 ring-rose-500';
                        } else {
                          btnStyle = 'bg-[#252934]/40 border-slate-800 text-slate-500 opacity-50';
                        }
                      }
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectOption(idx)}
                          disabled={isAnswered}
                          className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all flex items-center justify-between min-h-[44px] ${btnStyle}`}
                        >
                          <span>{opt}</span>
                          {isAnswered && idx === currentQ.answer && <Check size={14} className="text-emerald-400 shrink-0 ml-1.5" />}
                        </button>
                      );
                    })}
                  </div>

                  {isAnswered && (
                    <div className="bg-[#1b253b] border border-blue-900/60 p-3.5 rounded-xl text-xs text-blue-200 space-y-2.5 animate-fadeIn">
                      <div className="flex items-start gap-2">
                        <HelpCircle size={15} className="text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed text-blue-200 font-medium">
                          {currentQ.fact}
                        </p>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleNextQuestion}
                          className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors shadow-xs"
                        >
                          <span>{currentQuestionIndex + 1 < triviaQuestions.length ? 'Next Question →' : 'See Results 🏆'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CULINARY MEMORY (Screenshot 1) */}
          {activeSubTab === 'MEMORY' && (
            <div className="space-y-3 animate-fadeIn">
              {/* Moves & Matches row matching Screenshot 1 */}
              <div className="flex items-center justify-between px-1 text-slate-300 text-xs sm:text-sm font-semibold">
                <span>Moves: {memoryMoves}</span>
                <span>Matches: {matchedPairsCount} / 6</span>
              </div>

              {/* 3x4 Grid (12 Cards with red ? unflipped) */}
              <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
                {memoryCards.map((card) => {
                  const isFlipped = flippedCards.some(c => c.id === card.id);
                  const isMatched = matchedCardIds.includes(card.id);

                  if (isMatched) {
                    return (
                      <div
                        key={card.id}
                        className="bg-emerald-950/60 border-2 border-emerald-500/80 rounded-2xl aspect-square flex flex-col items-center justify-center text-3xl shadow-md transition-all select-none animate-fadeIn"
                      >
                        <span>{card.icon}</span>
                      </div>
                    );
                  }

                  if (isFlipped) {
                    return (
                      <div
                        key={card.id}
                        className="bg-slate-800 border-2 border-amber-400 rounded-2xl aspect-square flex flex-col items-center justify-center text-3xl shadow-lg transition-all select-none"
                      >
                        <span>{card.icon}</span>
                      </div>
                    );
                  }

                  // Unflipped Card matching Screenshot 1: Dark gray with bold red '?'
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => handleCardClick(card)}
                      className="bg-[#282c35] hover:bg-[#323742] active:scale-95 border border-slate-700/60 rounded-2xl aspect-square flex items-center justify-center transition-all shadow-sm"
                      aria-label="Memory Card"
                    >
                      <span className="text-rose-500 font-extrabold text-2xl sm:text-3xl select-none leading-none">
                        ?
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Victory state */}
              {matchedPairsCount === 6 && (
                <div className="bg-[#182a20] border border-emerald-500/50 rounded-2xl p-4 text-center space-y-2 mt-3 animate-fadeIn">
                  <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Trophy size={20} />
                  </div>
                  <h5 className="font-bold text-sm text-emerald-200">
                    🎉 Outstanding! All 6 Pairs Matched!
                  </h5>
                  <p className="text-xs text-slate-300">
                    Completed in <strong className="text-white">{memoryMoves} moves</strong>! Added <strong className="text-emerald-400">+150 pts</strong> to Table {tableNumber}!
                  </p>
                  <button
                    type="button"
                    onClick={handleRestartMemory}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all active:scale-95 shadow-sm mt-1"
                  >
                    <RotateCcw size={13} /> Play Again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LEADERBOARD */}
          {activeSubTab === 'LEADERBOARD' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="bg-[#20242e] border border-white/5 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy size={16} className="text-amber-400" />
                    <span className="font-bold text-sm text-white">Live Table Standings</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                    ● Live
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Compete with fellow tables while waiting for your order.
                </p>
              </div>

              {/* Standings List */}
              <div className="space-y-2 text-xs">
                {/* 1st */}
                <div className="bg-[#232834] p-3 rounded-xl border border-amber-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🥇</span>
                    <div>
                      <span className="font-bold text-white block">Table B2</span>
                      <span className="text-[10px] text-amber-400 font-semibold">Grand Master</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-amber-300">420 pts</span>
                </div>

                {/* 2nd - Current User Table */}
                <div className="bg-[#1e2436] p-3 rounded-xl border-2 border-purple-500/70 shadow-md flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🥈</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white">Table {tableNumber || 'A9'}</span>
                        <span className="px-1.5 py-0.2 rounded-md bg-purple-600 text-[9px] font-black uppercase text-white">
                          You
                        </span>
                      </div>
                      <span className="text-[10px] text-purple-300 font-semibold">Foodie Connoisseur</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-purple-300">{totalUserPoints} pts</span>
                </div>

                {/* 3rd */}
                <div className="bg-[#232834] p-3 rounded-xl border border-slate-700/60 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🥉</span>
                    <div>
                      <span className="font-bold text-slate-200 block">Table C1</span>
                      <span className="text-[10px] text-slate-400 font-semibold">Trivia Enthusiast</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-slate-300">280 pts</span>
                </div>

                {/* 4th */}
                <div className="bg-[#232834] p-3 rounded-xl border border-slate-700/40 flex items-center justify-between text-slate-400">
                  <div className="flex items-center gap-3">
                    <span className="font-bold pl-1.5 text-slate-500">4</span>
                    <div>
                      <span className="font-bold text-slate-300 block">Table A3</span>
                      <span className="text-[10px] text-slate-500 font-semibold">Appetizer Explorer</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-slate-400">190 pts</span>
                </div>

                {/* 5th */}
                <div className="bg-[#232834] p-3 rounded-xl border border-slate-700/40 flex items-center justify-between text-slate-400">
                  <div className="flex items-center gap-3">
                    <span className="font-bold pl-1.5 text-slate-500">5</span>
                    <div>
                      <span className="font-bold text-slate-300 block">Table D4</span>
                      <span className="text-[10px] text-slate-500 font-semibold">Snack Tactician</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-slate-400">140 pts</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
