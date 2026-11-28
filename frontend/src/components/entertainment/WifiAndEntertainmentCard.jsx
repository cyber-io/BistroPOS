import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wifi, Copy, Check, Sparkles, Trophy, RotateCcw, 
  Gamepad2, X, Timer, HelpCircle, Award, Star, Dices
} from 'lucide-react';
import { api } from '../../services/api';
import LudoGame from './LudoGame';

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
  tableNumber = 'Table 1', 
  lang = 'en' 
}) {
  // Tabs: 'WIFI' | 'LUDO' | 'MEMORY' | 'TRIVIA' | 'LEADERBOARD'
  const [activeSubTab, setActiveSubTab] = useState('WIFI');

  // Match QR Dine-In Menu light theme
  const isDarkMode = false;

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
  const [ludoBonusPoints, setLudoBonusPoints] = useState(0);

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
  const totalUserPoints = 200 + (triviaScore * 30) + memoryBonusPoints + ludoBonusPoints;

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
        className={`w-full max-w-md rounded-[28px] shadow-2xl border overflow-hidden flex flex-col max-h-[92vh] animate-scaleIn transition-colors ${
          isDarkMode 
            ? 'bg-[#1c2028] text-white border-white/10' 
            : 'bg-white text-slate-900 border-slate-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header matching Screenshot 1 & 2 */}
        <div className="p-4 sm:p-5 flex items-center justify-between pb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isDarkMode 
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-500' 
                : 'bg-amber-50 border-amber-200 text-amber-600'
            }`}>
              <Gamepad2 size={22} />
            </div>
            <div>
              <h3 className={`font-bold text-base leading-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {lang === 'hi' ? 'मनोरंजन एवं टेबल लाउंज' : 'Entertainment & Table Lounge'}
              </h3>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {lang === 'hi' ? 'खेलें, अन्य टेबलों से मुकाबला करें और जुड़े रहें' : 'Play, compete with other tables & stay connected'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  isDarkMode 
                    ? 'text-slate-400 hover:text-white hover:bg-white/10' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Tabs Row */}
        <div
          className="px-4 sm:px-5 py-2.5 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs font-semibold bg-slate-50/70"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {[
            { id: 'WIFI', label: 'Wi-Fi', Icon: Wifi },
            { id: 'LUDO', label: 'Table Ludo', Icon: Dices, badge: 'NEW' },
            { id: 'MEMORY', label: 'Memory', Icon: Timer },
            { id: 'TRIVIA', label: 'Food Trivia', Icon: Sparkles },
            { id: 'LEADERBOARD', label: 'Leaderboard', Icon: Trophy },
          ].map(({ id, label, Icon, badge }) => {
            const isActive = activeSubTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSubTab(id)}
                className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs font-bold'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={13} className={isActive && id === 'LUDO' ? 'text-amber-400' : ''} />
                <span>{label}</span>
                {badge && (
                  <span className={`px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase ${
                    isActive
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Body Contents */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          
          {/* TAB 1: RESTAURANT WI-FI (Screenshot 2) */}
          {activeSubTab === 'WIFI' && (
            <div className="space-y-3 animate-fadeIn">
              {/* Wi-Fi Card */}
              <div className={`border rounded-2xl p-4 sm:p-5 shadow-sm transition-colors ${
                isDarkMode 
                  ? 'bg-gradient-to-br from-[#12192e] via-[#151c33] to-[#0d1222] border-blue-900/40 text-white shadow-inner' 
                  : 'bg-gradient-to-br from-blue-50/70 via-white to-slate-50 border-blue-100 text-slate-900'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
                      isDarkMode 
                        ? 'bg-[#082622] border-teal-500/30 text-teal-400' 
                        : 'bg-teal-50 border-teal-200 text-teal-600'
                    }`}>
                      <Wifi size={22} className={isDarkMode ? 'text-[#2dd4bf]' : 'text-teal-600'} />
                    </div>
                    <div>
                      <span className={`text-[10px] uppercase font-bold tracking-wider block ${
                        isDarkMode ? 'text-slate-300' : 'text-slate-500'
                      }`}>
                        COMPLIMENTARY DINING WI-FI
                      </span>
                      <strong className={`text-base sm:text-lg font-bold tracking-wide block ${
                        isDarkMode ? 'text-white' : 'text-slate-900'
                      }`}>
                        {wifiData.ssid}
                      </strong>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full border text-[11px] font-bold shrink-0 ${
                    isDarkMode 
                      ? 'bg-[#0a2e28] border-teal-500/30 text-[#2dd4bf]' 
                      : 'bg-teal-50 border-teal-200 text-teal-700'
                  }`}>
                    High Speed 5G
                  </span>
                </div>

                {/* Password Box */}
                <div className={`rounded-xl p-3 sm:p-3.5 border flex items-center justify-between mt-4 transition-colors ${
                  isDarkMode 
                    ? 'bg-[#192138] border-blue-900/40' 
                    : 'bg-slate-100/80 border-slate-200'
                }`}>
                  <div>
                    <span className={`text-[9px] uppercase font-bold tracking-wider block ${
                      isDarkMode ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      PASSWORD
                    </span>
                    <span className={`font-mono text-sm sm:text-base font-bold tracking-wide select-all ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}>
                      {wifiData.password}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs ${
                      isDarkMode 
                        ? 'bg-[#2b3452] hover:bg-[#364166] text-slate-200 hover:text-white' 
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check size={14} className="text-emerald-500" />
                        <span className="text-emerald-500">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} className={isDarkMode ? 'text-slate-300' : 'text-slate-600'} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <p className={`text-xs mt-3 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Enjoy seamless browsing, streaming, and ordering while our chefs prepare your delicacies.
                </p>
              </div>

              {/* Bottom Teaser Card */}
              <div className={`border rounded-2xl p-4 space-y-2.5 transition-colors ${
                isDarkMode ? 'bg-[#20242e] border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-2 font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    <Gamepad2 size={16} className="text-amber-500" />
                    <span>Play & Compete While You Wait!</span>
                  </div>
                  <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full border ${
                    isDarkMode 
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}>
                    🎲 Ludo Live
                  </span>
                </div>
                <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Roll the dice in Table Ludo against Chef Bot, test foodie trivia, or challenge other tables on the live restaurant leaderboard!
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('LUDO')}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                  >
                    <Dices size={14} />
                    <span>Play Table Ludo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('MEMORY')}
                    className={`px-3 py-1.5 rounded-xl font-semibold text-xs active:scale-95 transition-all ${
                      isDarkMode 
                        ? 'bg-[#2b3345] hover:bg-[#343e54] text-slate-200' 
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                    }`}
                  >
                    Culinary Memory
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: TABLE LUDO (User Feature Request) */}
          {activeSubTab === 'LUDO' && (
            <LudoGame 
              tableNumber={tableNumber} 
              onAddLeaderboardPoints={(pts) => setLudoBonusPoints(p => p + pts)} 
              isDarkMode={isDarkMode}
            />
          )}

          {/* TAB 2: FOOD TRIVIA QUIZ */}
          {activeSubTab === 'TRIVIA' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="space-y-2.5 border-b border-slate-200 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-100 text-amber-600">
                      <Sparkles size={14} />
                    </div>
                    <span className="text-xs font-bold text-slate-800">
                      {lang === 'hi' ? 'पाक-कला ट्रिविया' : 'Culinary Food Trivia'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      {triviaScore * 30} pts
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-purple-100 text-purple-700 border-purple-200">
                      {quizFinished ? `Score: ${triviaScore}/${triviaQuestions.length}` : `Q ${currentQuestionIndex + 1} of ${triviaQuestions.length}`}
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-purple-600 rounded-full transition-all duration-300"
                    style={{ width: `${quizFinished ? 100 : ((currentQuestionIndex + 1) / triviaQuestions.length) * 100}%` }}
                  />
                </div>
              </div>

              {quizFinished ? (
                <div className={`text-center py-6 space-y-3.5 rounded-2xl p-5 border ${
                  isDarkMode ? 'bg-[#20242e] border-white/5' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className={`w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center ${
                    isDarkMode ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-600 border-amber-200'
                  }`}>
                    <Trophy size={28} />
                  </div>
                  <div className="space-y-1">
                    <h5 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      {triviaScore >= 4 ? '🎉 Culinary Connoisseur!' : triviaScore >= 2 ? '👏 Good Effort, Foodie!' : '🍽️ Keep Exploring Flavors!'}
                    </h5>
                    <p className={`text-xs max-w-xs mx-auto ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      You answered <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{triviaScore}</strong> out of <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{triviaQuestions.length}</strong> questions correctly! (+{triviaScore * 30} pts)
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
                  <p className={`text-sm font-bold leading-snug ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {currentQ.question}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {currentQ.options.map((opt, idx) => {
                      let btnStyle = isDarkMode 
                        ? 'bg-[#252934] border-slate-700/60 text-slate-200 hover:bg-[#2e3442] hover:border-slate-600'
                        : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100 hover:border-slate-300';
                      if (isAnswered) {
                        if (idx === currentQ.answer) {
                          btnStyle = isDarkMode
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold ring-1 ring-emerald-500'
                            : 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold ring-1 ring-emerald-500';
                        } else if (idx === selectedAnswer) {
                          btnStyle = isDarkMode
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300 ring-1 ring-rose-500'
                            : 'bg-rose-50 border-rose-500 text-rose-800 ring-1 ring-rose-500';
                        } else {
                          btnStyle = isDarkMode 
                            ? 'bg-[#252934]/40 border-slate-800 text-slate-500 opacity-50'
                            : 'bg-slate-100 border-slate-200 text-slate-400 opacity-50';
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
                          <span className="flex items-center gap-2.5">
                            <span className="w-5 h-5 rounded-md bg-white border border-slate-200 text-slate-600 text-[10px] font-black flex items-center justify-center shrink-0">
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span>{opt}</span>
                          </span>
                          {isAnswered && idx === currentQ.answer && <Check size={14} className="text-emerald-500 shrink-0 ml-1.5" />}
                        </button>
                      );
                    })}
                  </div>

                  {isAnswered && (
                    <div className={`p-3.5 rounded-xl text-xs space-y-2.5 animate-fadeIn border ${
                      isDarkMode 
                        ? 'bg-[#1b253b] border-blue-900/60 text-blue-200' 
                        : 'bg-blue-50 border-blue-200 text-blue-900'
                    }`}>
                      <div className="flex items-start gap-2">
                        <HelpCircle size={15} className={`shrink-0 mt-0.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                        <p className={`text-[11px] leading-relaxed font-medium ${isDarkMode ? 'text-blue-200' : 'text-blue-900'}`}>
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

          {/* TAB 3: CULINARY MEMORY */}
          {activeSubTab === 'MEMORY' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700">
                <div className="flex items-center gap-3">
                  <span>Moves: <strong className="text-slate-900">{memoryMoves}</strong></span>
                  <span className="text-slate-300">•</span>
                  <span>Matches: <strong className="text-emerald-700">{matchedPairsCount} / 6</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleRestartMemory}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-bold transition-all active:scale-95"
                >
                  <RotateCcw size={12} /> Restart
                </button>
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
                        className={`rounded-2xl aspect-square flex flex-col items-center justify-center text-3xl shadow-md transition-all select-none animate-fadeIn border-2 ${
                          isDarkMode 
                            ? 'bg-emerald-950/60 border-emerald-500/80' 
                            : 'bg-emerald-50 border-emerald-500'
                        }`}
                      >
                        <span>{card.icon}</span>
                      </div>
                    );
                  }

                  if (isFlipped) {
                    return (
                      <div
                        key={card.id}
                        className={`rounded-2xl aspect-square flex flex-col items-center justify-center text-3xl shadow-lg transition-all select-none border-2 ${
                          isDarkMode 
                            ? 'bg-slate-800 border-amber-400' 
                            : 'bg-white border-amber-500'
                        }`}
                      >
                        <span>{card.icon}</span>
                      </div>
                    );
                  }

                  // Unflipped Card
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => handleCardClick(card)}
                      className="active:scale-95 border border-amber-200/90 bg-gradient-to-br from-amber-50 via-orange-50/70 to-rose-50/70 hover:border-amber-300 hover:shadow-md rounded-2xl aspect-square flex flex-col items-center justify-center transition-all shadow-xs"
                      aria-label="Memory Card"
                    >
                      <span className="w-9 h-9 rounded-xl bg-white/90 border border-amber-200/80 shadow-2xs flex items-center justify-center text-rose-500 font-black text-xl select-none leading-none">
                        ?
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Victory state */}
              {matchedPairsCount === 6 && (
                <div className={`border rounded-2xl p-4 text-center space-y-2 mt-3 animate-fadeIn ${
                  isDarkMode 
                    ? 'bg-[#182a20] border-emerald-500/50' 
                    : 'bg-emerald-50 border-emerald-300'
                }`}>
                  <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                    <Trophy size={20} />
                  </div>
                  <h5 className={`font-bold text-sm ${isDarkMode ? 'text-emerald-200' : 'text-emerald-900'}`}>
                    🎉 Outstanding! All 6 Pairs Matched!
                  </h5>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Completed in <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{memoryMoves} moves</strong>! Added <strong className={isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}>+150 pts</strong> to Table {tableNumber}!
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
              <div className={`border rounded-2xl p-4 space-y-2 ${
                isDarkMode ? 'bg-[#20242e] border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy size={16} className="text-amber-500" />
                    <span className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Live Table Standings</span>
                  </div>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                    isDarkMode 
                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30' 
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}>
                    ● Live
                  </span>
                </div>
                <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Compete with fellow tables while waiting for your order.
                </p>
              </div>

              {/* Standings List (sorted by score descending) */}
              <div className="space-y-2 text-xs">
                {(() => {
                  const rawLabel = String(tableNumber || 'A1').trim();
                  const currentTableLabel = /^table\b/i.test(rawLabel) ? rawLabel : `Table ${rawLabel}`;
                  const standings = [
                    { id: 'B2', name: 'Table B2', title: 'Grand Master', points: 420, isYou: false },
                    { id: 'YOU', name: currentTableLabel, title: 'Foodie Connoisseur', points: totalUserPoints, isYou: true },
                    { id: 'C1', name: 'Table C1', title: 'Trivia Enthusiast', points: 280, isYou: false },
                    { id: 'T3', name: 'Table 3', title: 'Appetizer Explorer', points: 190, isYou: false },
                    { id: 'D4', name: 'Table D4', title: 'Snack Tactician', points: 140, isYou: false },
                  ].sort((a, b) => b.points - a.points);

                  const rankIcons = ['🥇', '🥈', '🥉'];
                  return standings.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className={`p-3 rounded-xl flex items-center justify-between ${
                        entry.isYou
                          ? 'border-2 bg-purple-50/70 border-purple-400 shadow-sm'
                          : idx === 0
                          ? 'border bg-amber-50/60 border-amber-200 shadow-xs'
                          : 'border bg-white border-slate-200 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {idx < 3 ? (
                          <span className="text-lg">{rankIcons[idx]}</span>
                        ) : (
                          <span className="font-bold w-5 text-center text-slate-400">{idx + 1}</span>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{entry.name}</span>
                            {entry.isYou && (
                              <span className="px-1.5 py-0.2 rounded-md bg-purple-600 text-[9px] font-black uppercase text-white">
                                You
                              </span>
                            )}
                          </div>
                          <span className={`text-[10px] font-semibold ${
                            entry.isYou ? 'text-purple-700' : idx === 0 ? 'text-amber-700' : 'text-slate-500'
                          }`}>
                            {entry.title}
                          </span>
                        </div>
                      </div>
                      <span className={`font-mono font-bold ${
                        entry.isYou ? 'text-purple-700' : idx === 0 ? 'text-amber-700' : 'text-slate-700'
                      }`}>
                        {entry.points} pts
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
