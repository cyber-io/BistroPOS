import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Dices, RotateCcw, Trophy, Crown, Bot, Users, Sparkles, 
  ChevronRight, ArrowRight, Shield, Zap, Volume2, VolumeX
} from 'lucide-react';

// --- LUDO CONSTANTS & TRACK GEOMETRY (MATCHING USER REFERENCE IMAGE) ---
// 15x15 board coordinate system (each cell = 100x100 in 1500x1500 viewBox)
// Top-Left: BLUE, Top-Right: RED, Bottom-Left: YELLOW, Bottom-Right: GREEN
// Clockwise 52-step outer perimeter track starting at RED START: [8, 1]
const TRACK_COORDINATES = [
  /*  0 - 4  (Top Arm down col 8)    */ [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  /*  5 - 10 (Right Arm right row 6) */ [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  /* 11      (Turn right at edge)    */ [14, 7],
  /* 12 - 17 (Right Arm left row 8)  */ [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  /* 18 - 23 (Bottom Arm down col 8) */ [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  /* 24      (Turn bottom at edge)   */ [7, 14],
  /* 25 - 30 (Bottom Arm up col 6)   */ [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  /* 31 - 36 (Left Arm left row 8)   */ [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  /* 37      (Turn left at edge)     */ [0, 7],
  /* 38 - 43 (Left Arm right row 6)  */ [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  /* 44 - 49 (Top Arm up col 6)      */ [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  /* 50      (Top Arm entrance)      */ [7, 0],
  /* 51      (Top Arm corner cell)   */ [8, 0]
];

// Home run paths (5 colored steps leading directly into the center triangles)
const HOME_PATHS = {
  RED: [
    [7, 1], [7, 2], [7, 3], [7, 4], [7, 5]
  ],
  GREEN: [
    [13, 7], [12, 7], [11, 7], [10, 7], [9, 7]
  ],
  YELLOW: [
    [7, 13], [7, 12], [7, 11], [7, 10], [7, 9]
  ],
  BLUE: [
    [1, 7], [2, 7], [3, 7], [4, 7], [5, 7]
  ]
};

// Safe squares indices on the 52-step track (colored start squares & key positions)
const SAFE_TRACK_INDICES = [
  0,  // Red Start: [8, 1]
  8,  // Star in right arm
  13, // Green Start: [13, 8]
  21, // Star in bottom arm
  26, // Yellow Start: [6, 13]
  34, // Star in left arm
  39, // Blue Start: [1, 6]
  47  // Star in top arm
];

// Base token positions inside home quadrants (exact center of the 4 square pedestals)
const BASE_SLOTS_4 = {
  RED: [
    [10.5, 1.5], [12.5, 1.5],
    [10.5, 3.5], [12.5, 3.5]
  ],
  GREEN: [
    [10.5, 10.5], [12.5, 10.5],
    [10.5, 12.5], [12.5, 12.5]
  ],
  YELLOW: [
    [1.5, 10.5], [3.5, 10.5],
    [1.5, 12.5], [3.5, 12.5]
  ],
  BLUE: [
    [1.5, 1.5], [3.5, 1.5],
    [1.5, 3.5], [3.5, 3.5]
  ]
};

const BASE_SLOTS_2 = {
  RED: [
    [10.5, 1.5], [12.5, 3.5]
  ],
  GREEN: [
    [10.5, 10.5], [12.5, 12.5]
  ]
};

// Native Web Audio Synthesizer
function playLudoSound(type, soundEnabled = true) {
  if (!soundEnabled || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'roll') {
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220 + Math.random() * 300, now + i * 0.05);
        gain.gain.setValueAtTime(0.15, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.04);
      }
    } else if (type === 'move') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(460, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'capture') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.25);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (type === 'six') {
      [523.25, 659.25, 783.99].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.08);
        gain.gain.setValueAtTime(0.25, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.25);
      });
    } else if (type === 'victory') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.3, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.45);
      });
    }
  } catch {}
}

// 3D Realistic Die Component
function DieFace3D({ value, isRolling, onClick }) {
  const dots = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]]
  };

  const currentDots = dots[value] || dots[1];

  return (
    <div 
      onClick={onClick}
      role="button"
      tabIndex={0}
      title="Tap to roll dice"
      className={`relative w-15 h-15 sm:w-16 sm:h-16 rounded-2xl cursor-pointer select-none transition-all duration-200 transform-gpu ${
        isRolling 
          ? 'animate-bounce rotate-180 scale-110 shadow-2xl ring-4 ring-amber-400' 
          : 'hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl'
      }`}
      style={{
        background: 'linear-gradient(145deg, #ffffff 0%, #f1f5f9 60%, #e2e8f0 100%)',
        boxShadow: '0 8px 20px -4px rgba(0,0,0,0.25), inset 0 2px 3px rgba(255,255,255,0.9), inset 0 -3px 5px rgba(0,0,0,0.1)'
      }}
    >
      <div className="absolute inset-0 rounded-2xl border-2 border-white/80 pointer-events-none" />
      <svg viewBox="0 0 100 100" className="w-full h-full p-2.5">
        <defs>
          <radialGradient id="pipGlow" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </radialGradient>
          <radialGradient id="pipRed" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fca5a5" />
            <stop offset="50%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#991b1b" />
          </radialGradient>
        </defs>

        {currentDots.map(([cx, cy], i) => {
          const isCenterRed = value === 1 || (value === 3 && cx === 50 && cy === 50) || (value === 5 && cx === 50 && cy === 50);
          return (
            <g key={i}>
              <circle cx={cx} cy={cy + 1} r={value === 1 ? 16 : 9} fill="rgba(0,0,0,0.18)" />
              <circle 
                cx={cx} 
                cy={cy} 
                r={value === 1 ? 15 : 8.5} 
                fill={isCenterRed ? 'url(#pipRed)' : 'url(#pipGlow)'} 
                stroke={isCenterRed ? '#b91c1c' : '#334155'}
                strokeWidth="0.8"
              />
              <circle cx={cx - (value === 1 ? 4 : 2.5)} cy={cy - (value === 1 ? 4 : 2.5)} r={value === 1 ? 4 : 2} fill="#ffffff" opacity="0.6" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Falling Confetti Particle Effect on Win
function ConfettiOverlay() {
  const pieces = useMemo(() => {
    const colors = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6'];
    return Array.from({ length: 36 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: Math.random() * 8 + 6,
      color: colors[i % colors.length],
      duration: Math.random() * 1.5 + 1.2,
      delay: Math.random() * 0.6,
      rotate: Math.random() * 360
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-30">
      {pieces.map(p => (
        <span
          key={p.id}
          className="absolute top-0 opacity-90 rounded-xs"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * 1.4}px`,
            backgroundColor: p.color,
            animation: `confettiFall ${p.duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${p.delay}s infinite`,
            transform: `rotate(${p.rotate}deg)`
          }}
        />
      ))}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(380px) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default function LudoGame({ 
  tableNumber = 'A9', 
  onAddLeaderboardPoints = () => {},
  isDarkMode = false
}) {
  // Sanitize table name so it never prints "Table Table A1"
  const cleanTable = useMemo(() => {
    return String(tableNumber || 'A1').replace(/^Table\s*/i, '').trim() || 'A1';
  }, [tableNumber]);

  // Game Settings: RED (Table Diner) vs GREEN (Chef Bot)
  const [gameMode, setGameMode] = useState('AI'); // 'AI' | 'PASS_AND_PLAY'
  const [pawnCount, setPawnCount] = useState(2); // 2 Pawns (Fast diner match) or 4 (Classic)
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Initialize Pawns
  const initializeTokens = (count) => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({ id: `R${i}`, player: 'RED', tokenIndex: i, step: -1 });
      arr.push({ id: `G${i}`, player: 'GREEN', tokenIndex: i, step: -1 });
    }
    return arr;
  };

  const [tokens, setTokens] = useState(() => initializeTokens(2));
  const [currentTurn, setCurrentTurn] = useState('RED'); // RED starts
  const [diceValue, setDiceValue] = useState(6);
  const [isRolling, setIsRolling] = useState(false);
  const [hasRolled, setHasRolled] = useState(false);
  const [winner, setWinner] = useState(null);
  const [hoveredTokenId, setHoveredTokenId] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Tap "Roll Dice" to roll against Chef Bot!');

  // Reset Game
  const handleResetGame = (mode = gameMode, count = pawnCount) => {
    setGameMode(mode);
    setPawnCount(count);
    setTokens(initializeTokens(count));
    setCurrentTurn('RED');
    setDiceValue(6);
    setIsRolling(false);
    setHasRolled(false);
    setWinner(null);
    setHoveredTokenId(null);
    setStatusMessage(`New match! Table ${cleanTable} rolls first.`);
    playLudoSound('roll', soundEnabled);
  };

  // Convert logical step of a token to physical [gx, gy] on the 15x15 board
  const getTokenBoardCoord = useCallback((token) => {
    const { player, step, tokenIndex } = token;
    const baseMap = pawnCount === 2 ? BASE_SLOTS_2 : BASE_SLOTS_4;

    if (step === -1) {
      return baseMap[player]?.[tokenIndex] || (player === 'RED' ? [10.5, 1.5] : [10.5, 10.5]);
    }
    if (step >= 56) {
      // Reached final goal center
      return player === 'RED' ? [7.5, 6.7] : [8.3, 7.5];
    }
    if (step >= 51) {
      // In player home path
      const homeIndex = step - 51;
      return HOME_PATHS[player][homeIndex] || [7.5, 7.5];
    }
    // On the 52-step outer track (RED starts at 0, GREEN starts at 13)
    const startIdx = player === 'RED' ? 0 : 13;
    const trackIndex = (startIdx + step) % 52;
    return TRACK_COORDINATES[trackIndex];
  }, [pawnCount]);

  // Target landing calculation for preview
  const getDestinationCoord = useCallback((token, roll) => {
    if (token.step === -1) {
      if (roll !== 6) return null;
      const startIdx = token.player === 'RED' ? 0 : 13;
      return TRACK_COORDINATES[startIdx];
    }
    const targetStep = token.step + roll;
    if (targetStep > 56) return null;
    return getTokenBoardCoord({ ...token, step: targetStep });
  }, [getTokenBoardCoord]);

  // Get movable tokens for the active player with current diceValue
  const getMovableTokens = useCallback((player, roll, currentTokens) => {
    return currentTokens.filter(token => {
      if (token.player !== player) return false;
      if (token.step === -1) return roll === 6;
      if (token.step >= 56) return false;
      return token.step + roll <= 56;
    });
  }, []);

  // Handle Token Move
  const handleMoveToken = useCallback((token) => {
    if (!hasRolled || isRolling || winner) return;
    if (token.player !== currentTurn) return;

    const movable = getMovableTokens(currentTurn, diceValue, tokens);
    const canMove = movable.some(m => m.id === token.id);
    if (!canMove) return;

    playLudoSound('move', soundEnabled);

    let newStep;
    if (token.step === -1) {
      newStep = 0;
    } else {
      newStep = token.step + diceValue;
    }

    let isCapture = false;
    let capturedTokenId = null;

    // Check if newStep captures opponent on outer track
    if (newStep < 51) {
      const myStartIdx = token.player === 'RED' ? 0 : 13;
      const myTrackIdx = (myStartIdx + newStep) % 52;
      const isSafeSquare = SAFE_TRACK_INDICES.includes(myTrackIdx);

      if (!isSafeSquare) {
        const opponentPlayer = token.player === 'RED' ? 'GREEN' : 'RED';
        const opponentTokens = tokens.filter(t => t.player === opponentPlayer && t.step >= 0 && t.step < 51);

        for (const opp of opponentTokens) {
          const oppStartIdx = opp.player === 'RED' ? 0 : 13;
          const oppTrackIdx = (oppStartIdx + opp.step) % 52;
          if (oppTrackIdx === myTrackIdx) {
            isCapture = true;
            capturedTokenId = opp.id;
            break;
          }
        }
      }
    }

    // Apply token move
    const updatedTokens = tokens.map(t => {
      if (t.id === token.id) return { ...t, step: newStep };
      if (capturedTokenId && t.id === capturedTokenId) return { ...t, step: -1 };
      return t;
    });

    setTokens(updatedTokens);
    setHasRolled(false);
    setHoveredTokenId(null);

    const playerName = token.player === 'RED' ? `Table ${cleanTable}` : 'Chef Bot';

    if (isCapture) {
      playLudoSound('capture', soundEnabled);
      setStatusMessage(`💥 ${playerName} captured an opponent piece! Bonus roll awarded!`);
      return;
    }

    // Check Win Condition
    const playerTokens = updatedTokens.filter(t => t.player === currentTurn);
    const allHome = playerTokens.every(t => t.step >= 56);

    if (allHome) {
      setWinner(currentTurn);
      playLudoSound('victory', soundEnabled);
      const isRedWin = currentTurn === 'RED';
      setStatusMessage(isRedWin ? `🏆 Victory! Table ${cleanTable} won Table Ludo!` : `Chef Bot took the win! Rematch?`);
      if (isRedWin) {
        onAddLeaderboardPoints(250);
      }
      return;
    }

    // Extra turn if rolled 6
    if (diceValue === 6) {
      playLudoSound('six', soundEnabled);
      setStatusMessage(`🎲 ${playerName} rolled a 6! Roll again.`);
      return;
    }

    // Switch Turn
    const nextTurn = currentTurn === 'RED' ? 'GREEN' : 'RED';
    setCurrentTurn(nextTurn);
    setStatusMessage(`${nextTurn === 'RED' ? `Table ${cleanTable} (You)` : (gameMode === 'AI' ? 'Chef Bot 👨‍🍳' : 'Player 2')}'s Turn to Roll`);
  }, [hasRolled, isRolling, winner, currentTurn, diceValue, tokens, getMovableTokens, cleanTable, gameMode, soundEnabled, onAddLeaderboardPoints]);

  // Handle Dice Roll
  const handleRollDice = () => {
    if (isRolling || hasRolled || winner) return;

    setIsRolling(true);
    playLudoSound('roll', soundEnabled);

    let rollCount = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      rollCount++;
      if (rollCount > 7) {
        clearInterval(interval);
        const finalValue = Math.floor(Math.random() * 6) + 1;
        setDiceValue(finalValue);
        setIsRolling(false);
        setHasRolled(true);

        const activePlayer = currentTurn;
        const movable = getMovableTokens(activePlayer, finalValue, tokens);

        if (finalValue === 6) {
          playLudoSound('six', soundEnabled);
        }

        if (movable.length === 0) {
          setStatusMessage(`Rolled ${finalValue}. No movable pieces.`);
          setTimeout(() => {
            if (finalValue === 6) {
              setStatusMessage('Rolled a 6! You get another roll.');
              setHasRolled(false);
            } else {
              const nextTurn = activePlayer === 'RED' ? 'GREEN' : 'RED';
              setCurrentTurn(nextTurn);
              setHasRolled(false);
              setStatusMessage(`${nextTurn === 'RED' ? `Table ${cleanTable}` : (gameMode === 'AI' ? 'Chef Bot 👨‍🍳' : 'Player 2')}'s Turn.`);
            }
          }, 850);
        } else if (movable.length === 1 && activePlayer === 'RED') {
          setStatusMessage(`Rolled ${finalValue}! Tap your pawn to advance.`);
        } else {
          setStatusMessage(`Rolled ${finalValue}! Select a pawn to move.`);
        }
      }
    }, 60);
  };

  // AI (Chef Bot) automated turn logic
  useEffect(() => {
    if (gameMode !== 'AI' || currentTurn !== 'GREEN' || winner || isRolling) return;

    if (!hasRolled) {
      const rollTimer = setTimeout(() => {
        handleRollDice();
      }, 700);
      return () => clearTimeout(rollTimer);
    }

    const aiTimer = setTimeout(() => {
      const movable = getMovableTokens('GREEN', diceValue, tokens);
      if (movable.length === 0) return;

      let bestToken = movable[0];
      let bestScore = -100;

      for (const t of movable) {
        let score = 0;
        const targetStep = t.step === -1 ? 0 : t.step + diceValue;

        // Prioritize Capture
        if (targetStep < 51) {
          const trackIdx = (13 + targetStep) % 52;
          const isSafe = SAFE_TRACK_INDICES.includes(trackIdx);
          if (!isSafe) {
            const redTokens = tokens.filter(r => r.player === 'RED' && r.step >= 0 && r.step < 51);
            for (const red of redTokens) {
              const redTrackIdx = (0 + red.step) % 52;
              if (redTrackIdx === trackIdx) score += 500;
            }
          }
        }

        // Reaching home goal
        if (targetStep === 56) score += 300;
        else if (targetStep >= 51) score += 150;

        // Opening from base on a 6
        if (t.step === -1) score += 120;

        // Advancing furthest
        score += targetStep;

        if (score > bestScore) {
          bestScore = score;
          bestToken = t;
        }
      }

      handleMoveToken(bestToken);
    }, 900);

    return () => clearTimeout(aiTimer);
  }, [gameMode, currentTurn, hasRolled, isRolling, diceValue, tokens, winner, getMovableTokens, handleMoveToken]);

  // Which tokens can be clicked right now?
  const movableIds = (hasRolled && !isRolling && !winner)
    ? getMovableTokens(currentTurn, diceValue, tokens).map(t => t.id)
    : [];

  // Destination preview coordinate
  const destinationCoord = useMemo(() => {
    if (!hasRolled || isRolling || winner) return null;
    const targetToken = tokens.find(t => t.id === hoveredTokenId && movableIds.includes(t.id)) ||
                        (movableIds.length === 1 ? tokens.find(t => t.id === movableIds[0]) : null);
    if (!targetToken) return null;
    return getDestinationCoord(targetToken, diceValue);
  }, [hasRolled, isRolling, winner, hoveredTokenId, movableIds, tokens, diceValue, getDestinationCoord]);

  return (
    <div className="space-y-3.5 animate-fadeIn">
      {/* Top Lounge Bar: Game Mode & Sound Controls */}
      <div className={`border rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 transition-colors ${
        isDarkMode ? 'bg-[#181d26] border-white/10' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-red-500 to-amber-500 text-white shadow-xs">
            <Dices size={18} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className={`text-xs font-black tracking-wide ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                CLASSIC LUDO
              </h4>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Live Match
              </span>
            </div>
            <p className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {pawnCount === 2 ? '⚡ 2-Pawn Quick Diner Match' : '🏆 4-Pawn Classic Match'}
            </p>
          </div>
        </div>

        {/* Options Row */}
        <div className="flex items-center gap-1.5 text-xs">
          {/* AI / 2-Player Toggle */}
          <button
            type="button"
            onClick={() => handleResetGame(gameMode === 'AI' ? 'PASS_AND_PLAY' : 'AI', pawnCount)}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 transition-all active:scale-95 ${
              isDarkMode 
                ? 'bg-[#222836] hover:bg-[#2c3345] text-slate-200 border-white/10' 
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
            }`}
            title="Toggle Bot or 2 Players"
          >
            {gameMode === 'AI' ? <Bot size={13} className="text-emerald-500" /> : <Users size={13} className="text-blue-500" />}
            <span>{gameMode === 'AI' ? 'vs Chef Bot' : '2 Players'}</span>
          </button>

          {/* 2 / 4 Pawns Switch */}
          <button
            type="button"
            onClick={() => handleResetGame(gameMode, pawnCount === 2 ? 4 : 2)}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 transition-all active:scale-95 ${
              isDarkMode 
                ? 'bg-[#222836] hover:bg-[#2c3345] text-slate-200 border-white/10' 
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
            }`}
            title="Switch 2 or 4 Pawns"
          >
            <Zap size={12} className="text-amber-500" />
            <span>{pawnCount}P</span>
          </button>

          {/* Sound Mute Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1.5 rounded-xl border transition-all active:scale-95 ${
              soundEnabled
                ? (isDarkMode ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-600')
                : (isDarkMode ? 'bg-[#222836] text-slate-500 border-white/10' : 'bg-white text-slate-400 border-slate-200')
            }`}
            title={soundEnabled ? 'Mute Sounds' : 'Enable Sounds'}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>

          {/* Restart Button */}
          <button
            type="button"
            onClick={() => handleResetGame(gameMode, pawnCount)}
            className={`p-1.5 rounded-xl border transition-all active:scale-95 ${
              isDarkMode 
                ? 'bg-[#222836] hover:bg-[#2c3345] text-slate-300 border-white/10' 
                : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200 shadow-2xs'
            }`}
            title="Restart Match"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* LUDO BOARD MATCHING USER REFERENCE IMAGE EXACTLY */}
      <div className="relative mx-auto w-full max-w-[370px] aspect-square rounded-2xl border-4 border-black overflow-hidden select-none bg-white shadow-2xl">
        {winner && <ConfettiOverlay />}

        <svg 
          viewBox="0 0 1500 1500" 
          className="w-full h-full select-none"
        >
          <defs>
            {/* Authentic Feathered Arrow definition matching reference image */}
            <g id="featheredArrow">
              <line x1="-30" y1="0" x2="20" y2="0" stroke="#000000" strokeWidth="4.5" strokeLinecap="round" />
              <polygon points="32,0 16,-12 20,0 16,12" fill="#000000" />
              <path d="M -22,-13 L -14,0 L -22,13" stroke="#000000" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M -30,-13 L -22,0 L -30,13" stroke="#000000" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </g>

            {/* Red Pawn Radial Gradient */}
            <radialGradient id="pawnRed3D" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#fca5a5" />
              <stop offset="45%" stopColor="#ef4444" />
              <stop offset="85%" stopColor="#b91c1c" />
              <stop offset="100%" stopColor="#7f1d1d" />
            </radialGradient>

            {/* Green Pawn Radial Gradient */}
            <radialGradient id="pawnGreen3D" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#86efac" />
              <stop offset="45%" stopColor="#22c55e" />
              <stop offset="85%" stopColor="#15803d" />
              <stop offset="100%" stopColor="#14532d" />
            </radialGradient>
          </defs>

          {/* Base Background */}
          <rect x="0" y="0" width="1500" height="1500" fill="#f8fafc" />

          {/* 1. TOP-LEFT: BLUE HOME BASE (0..600, 0..600) */}
          <rect x="0" y="0" width="600" height="600" fill="#1e3a8a" stroke="#000000" strokeWidth="4" />
          <rect x="100" y="100" width="400" height="400" fill="#ffffff" stroke="#000000" strokeWidth="4" />
          {/* 4 Blue Square Pedestals */}
          <rect x="140" y="140" width="120" height="120" fill="#1e3a8a" stroke="#000000" strokeWidth="4" />
          <rect x="340" y="140" width="120" height="120" fill="#1e3a8a" stroke="#000000" strokeWidth="4" />
          <rect x="140" y="340" width="120" height="120" fill="#1e3a8a" stroke="#000000" strokeWidth="4" />
          <rect x="340" y="340" width="120" height="120" fill="#1e3a8a" stroke="#000000" strokeWidth="4" />

          {/* 2. TOP-RIGHT: RED HOME BASE (900..1500, 0..600) */}
          <rect x="900" y="0" width="600" height="600" fill="#dc2626" stroke="#000000" strokeWidth="4" />
          <rect x="1000" y="100" width="400" height="400" fill="#ffffff" stroke="#000000" strokeWidth="4" />
          {/* 4 Red Square Pedestals */}
          <rect x="1040" y="140" width="120" height="120" fill="#dc2626" stroke="#000000" strokeWidth="4" />
          <rect x="1240" y="140" width="120" height="120" fill="#dc2626" stroke="#000000" strokeWidth="4" />
          <rect x="1040" y="340" width="120" height="120" fill="#dc2626" stroke="#000000" strokeWidth="4" />
          <rect x="1240" y="340" width="120" height="120" fill="#dc2626" stroke="#000000" strokeWidth="4" />

          {/* 3. BOTTOM-LEFT: YELLOW HOME BASE (0..600, 900..1500) */}
          <rect x="0" y="900" width="600" height="600" fill="#eab308" stroke="#000000" strokeWidth="4" />
          <rect x="100" y="1000" width="400" height="400" fill="#ffffff" stroke="#000000" strokeWidth="4" />
          {/* 4 Yellow Square Pedestals */}
          <rect x="140" y="1040" width="120" height="120" fill="#eab308" stroke="#000000" strokeWidth="4" />
          <rect x="340" y="1040" width="120" height="120" fill="#eab308" stroke="#000000" strokeWidth="4" />
          <rect x="140" y="1240" width="120" height="120" fill="#eab308" stroke="#000000" strokeWidth="4" />
          <rect x="340" y="1240" width="120" height="120" fill="#eab308" stroke="#000000" strokeWidth="4" />

          {/* 4. BOTTOM-RIGHT: GREEN HOME BASE (900..1500, 900..1500) */}
          <rect x="900" y="900" width="600" height="600" fill="#16a34a" stroke="#000000" strokeWidth="4" />
          <rect x="1000" y="1000" width="400" height="400" fill="#ffffff" stroke="#000000" strokeWidth="4" />
          {/* 4 Green Square Pedestals */}
          <rect x="1040" y="1040" width="120" height="120" fill="#16a34a" stroke="#000000" strokeWidth="4" />
          <rect x="1240" y="1040" width="120" height="120" fill="#16a34a" stroke="#000000" strokeWidth="4" />
          <rect x="1040" y="1240" width="120" height="120" fill="#16a34a" stroke="#000000" strokeWidth="4" />
          <rect x="1240" y="1240" width="120" height="120" fill="#16a34a" stroke="#000000" strokeWidth="4" />

          {/* GRID PATH CELLS (3 Columns / Rows on Each Arm) */}

          {/* TOP ARM (cols: 6, 7, 8; rows: 0..5) */}
          {Array.from({ length: 6 }).map((_, r) => {
            const y = r * 100;
            return (
              <g key={`top-arm-${r}`}>
                {/* Col 6 (Left) */}
                <rect x="600" y={y} width="100" height="100" fill="#ffffff" stroke="#000000" strokeWidth="3.5" />
                {/* Col 7 (Middle - Red Home Column) */}
                <rect 
                  x="700" 
                  y={y} 
                  width="100" 
                  height="100" 
                  fill={r > 0 ? '#dc2626' : '#ffffff'} 
                  stroke="#000000" 
                  strokeWidth="3.5" 
                />
                {/* Col 8 (Right - Red Start at row 1) */}
                <rect 
                  x="800" 
                  y={y} 
                  width="100" 
                  height="100" 
                  fill={r === 1 ? '#dc2626' : '#ffffff'} 
                  stroke="#000000" 
                  strokeWidth="3.5" 
                />
              </g>
            );
          })}

          {/* RIGHT ARM (cols: 9..14; rows: 6, 7, 8) */}
          {Array.from({ length: 6 }).map((_, c) => {
            const x = 900 + c * 100;
            return (
              <g key={`right-arm-${c}`}>
                {/* Row 6 (Top) */}
                <rect x={x} y="600" width="100" height="100" fill="#ffffff" stroke="#000000" strokeWidth="3.5" />
                {/* Row 7 (Middle - Green Home Row) */}
                <rect 
                  x={x} 
                  y="700" 
                  width="100" 
                  height="100" 
                  fill={c < 5 ? '#16a34a' : '#ffffff'} 
                  stroke="#000000" 
                  strokeWidth="3.5" 
                />
                {/* Row 8 (Bottom - Green Start at col index 4, i.e. x=1300) */}
                <rect 
                  x={x} 
                  y="800" 
                  width="100" 
                  height="100" 
                  fill={c === 4 ? '#16a34a' : '#ffffff'} 
                  stroke="#000000" 
                  strokeWidth="3.5" 
                />
              </g>
            );
          })}

          {/* BOTTOM ARM (cols: 6, 7, 8; rows: 9..14) */}
          {Array.from({ length: 6 }).map((_, r) => {
            const y = 900 + r * 100;
            return (
              <g key={`bottom-arm-${r}`}>
                {/* Col 6 (Left - Yellow Start at row index 4, i.e. y=1300) */}
                <rect 
                  x="600" 
                  y={y} 
                  width="100" 
                  height="100" 
                  fill={r === 4 ? '#eab308' : '#ffffff'} 
                  stroke="#000000" 
                  strokeWidth="3.5" 
                />
                {/* Col 7 (Middle - Yellow Home Column) */}
                <rect 
                  x="700" 
                  y={y} 
                  width="100" 
                  height="100" 
                  fill={r < 5 ? '#eab308' : '#ffffff'} 
                  stroke="#000000" 
                  strokeWidth="3.5" 
                />
                {/* Col 8 (Right) */}
                <rect x="800" y={y} width="100" height="100" fill="#ffffff" stroke="#000000" strokeWidth="3.5" />
              </g>
            );
          })}

          {/* LEFT ARM (cols: 0..5; rows: 6, 7, 8) */}
          {Array.from({ length: 6 }).map((_, c) => {
            const x = c * 100;
            return (
              <g key={`left-arm-${c}`}>
                {/* Row 6 (Top - Blue Start at col index 1, i.e. x=100) */}
                <rect 
                  x={x} 
                  y="600" 
                  width="100" 
                  height="100" 
                  fill={c === 1 ? '#1e3a8a' : '#ffffff'} 
                  stroke="#000000" 
                  strokeWidth="3.5" 
                />
                {/* Row 7 (Middle - Blue Home Row) */}
                <rect 
                  x={x} 
                  y="700" 
                  width="100" 
                  height="100" 
                  fill={c > 0 ? '#1e3a8a' : '#ffffff'} 
                  stroke="#000000" 
                  strokeWidth="3.5" 
                />
                {/* Row 8 (Bottom) */}
                <rect x={x} y="800" width="100" height="100" fill="#ffffff" stroke="#000000" strokeWidth="3.5" />
              </g>
            );
          })}

          {/* CENTER 3x3 GOAL (4 TRIANGLES MEETING AT CENTER 750, 750) */}
          {/* Top Triangle: RED */}
          <polygon points="600,600 900,600 750,750" fill="#dc2626" stroke="#000000" strokeWidth="3.5" />
          {/* Right Triangle: GREEN */}
          <polygon points="900,600 900,900 750,750" fill="#16a34a" stroke="#000000" strokeWidth="3.5" />
          {/* Bottom Triangle: YELLOW */}
          <polygon points="900,900 600,900 750,750" fill="#eab308" stroke="#000000" strokeWidth="3.5" />
          {/* Left Triangle: BLUE */}
          <polygon points="600,900 600,600 750,750" fill="#1e3a8a" stroke="#000000" strokeWidth="3.5" />

          {/* 4 ENTRANCE FEATHERED ARROWS (Matching Reference Image) */}
          {/* Top Entrance: pointing down */}
          <use href="#featheredArrow" x="750" y="50" transform="rotate(90, 750, 50)" />
          {/* Right Entrance: pointing left */}
          <use href="#featheredArrow" x="1450" y="750" transform="rotate(180, 1450, 750)" />
          {/* Bottom Entrance: pointing up */}
          <use href="#featheredArrow" x="750" y="1450" transform="rotate(270, 750, 1450)" />
          {/* Left Entrance: pointing right */}
          <use href="#featheredArrow" x="50" y="750" transform="rotate(0, 50, 750)" />

          {/* 4 DIAGONAL CORNER FEATHERED ARROWS AT CENTER (Matching Reference Image) */}
          {/* Top-Left: pointing 45° towards center */}
          <use href="#featheredArrow" x="600" y="600" transform="rotate(45, 600, 600)" />
          {/* Top-Right: pointing 135° towards center */}
          <use href="#featheredArrow" x="900" y="600" transform="rotate(135, 900, 600)" />
          {/* Bottom-Right: pointing 225° towards center */}
          <use href="#featheredArrow" x="900" y="900" transform="rotate(225, 900, 900)" />
          {/* Bottom-Left: pointing 315° towards center */}
          <use href="#featheredArrow" x="600" y="900" transform="rotate(315, 600, 900)" />

          {/* TARGET LANDING PREVIEW HALO */}
          {destinationCoord && (
            <g className="animate-pulse">
              <circle 
                cx={destinationCoord[0] * 100 + 50} 
                cy={destinationCoord[1] * 100 + 50} 
                r="44" 
                fill="none" 
                stroke="#000000" 
                strokeWidth="6"
                strokeDasharray="8 6"
              />
              <circle 
                cx={destinationCoord[0] * 100 + 50} 
                cy={destinationCoord[1] * 100 + 50} 
                r="34" 
                fill="rgba(0, 0, 0, 0.15)" 
              />
            </g>
          )}

          {/* 3D AUTHENTIC LUDO PAWNS */}
          {tokens.map((token) => {
            const [gx, gy] = getTokenBoardCoord(token);
            let cx = gx * 100 + 50;
            let cy = gy * 100 + 50;

            // Offset when multiple tokens share the exact same cell
            const sharingTokens = tokens.filter(t => {
              if (t.id === token.id) return false;
              if (t.step === -1 && token.step === -1) return false;
              const [ogx, ogy] = getTokenBoardCoord(t);
              return Math.abs(ogx - gx) < 0.2 && Math.abs(ogy - gy) < 0.2;
            });
            if (sharingTokens.length > 0) {
              const isFirst = token.id < sharingTokens[0].id;
              cx += isFirst ? -14 : 14;
              cy += isFirst ? -12 : 12;
            }

            const isRed = token.player === 'RED';
            const isMovable = movableIds.includes(token.id);
            const isAtHome = token.step >= 56;

            return (
              <g 
                key={token.id} 
                className={`transition-transform duration-300 ${isMovable ? 'cursor-pointer hover:scale-105' : ''}`}
                onClick={() => isMovable && handleMoveToken(token)}
                onMouseEnter={() => setHoveredTokenId(token.id)}
                onMouseLeave={() => setHoveredTokenId(null)}
              >
                {/* Movable Pulsing Ring */}
                {isMovable && (
                  <circle
                    cx={cx}
                    cy={cy + 8}
                    r="46"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="6"
                    className="animate-ping opacity-90"
                  />
                )}

                {/* 3D Contact Shadow */}
                <ellipse
                  cx={cx}
                  cy={cy + 22}
                  rx="30"
                  ry="12"
                  fill="rgba(0,0,0,0.38)"
                />

                {/* 3D Pawn Base Skirt */}
                <ellipse
                  cx={cx}
                  cy={cy + 12}
                  rx="26"
                  ry="10"
                  fill={isRed ? '#991b1b' : '#14532d'}
                  stroke="#000000"
                  strokeWidth="2"
                />

                {/* 3D Pawn Body / Cone */}
                <path
                  d={`M ${cx - 22} ${cy + 10} Q ${cx - 8} ${cy - 8} ${cx - 10} ${cy - 22} L ${cx + 10} ${cy - 22} Q ${cx + 8} ${cy - 8} ${cx + 22} ${cy + 10} Z`}
                  fill={isRed ? 'url(#pawnRed3D)' : 'url(#pawnGreen3D)'}
                  stroke="#000000"
                  strokeWidth="2"
                />

                {/* Golden Collar Ring */}
                <ellipse
                  cx={cx}
                  cy={cy - 22}
                  rx="14"
                  ry="5"
                  fill="#f59e0b"
                  stroke="#000000"
                  strokeWidth="1.5"
                />

                {/* 3D Pawn Spherical Head */}
                <circle
                  cx={cx}
                  cy={cy - 36}
                  r="20"
                  fill={isRed ? 'url(#pawnRed3D)' : 'url(#pawnGreen3D)'}
                  stroke="#000000"
                  strokeWidth="2.5"
                  className={isMovable ? 'drop-shadow-md' : ''}
                />

                {/* Head Specular Highlight */}
                <ellipse
                  cx={cx - 6}
                  cy={cy - 43}
                  rx="6"
                  ry="3.5"
                  fill="#ffffff"
                  opacity="0.8"
                />

                {/* Reached Goal Badge */}
                {isAtHome && (
                  <text x={cx} y={cy - 30} fontSize="20" fontWeight="900" textAnchor="middle" fill="#ffffff">
                    ✓
                  </text>
                )}
              </g>
            );
          })}

          {/* Outer Perimeter Board Border matching Reference Image */}
          <rect x="0" y="0" width="1500" height="1500" fill="none" stroke="#000000" strokeWidth="8" />
        </svg>

        {/* Victory Celebration Overlay inside board */}
        {winner && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center p-6 text-center animate-scaleIn z-40">
            <div className="w-18 h-18 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center mb-3 shadow-2xl ring-4 ring-amber-400/40">
              <Trophy size={42} />
            </div>
            <h3 className="text-xl font-black text-white tracking-wide">
              {winner === 'RED' ? `🎉 TABLE ${cleanTable} WINS!` : 'CHEF BOT WINS!'}
            </h3>
            <p className="text-xs text-slate-300 mt-1.5 max-w-xs leading-relaxed">
              {winner === 'RED' 
                ? `Sensational match! +250 dining points added to Table ${cleanTable} on the live lounge leaderboard!`
                : 'Great battle! Roll again for table points and glory.'
              }
            </p>
            <button
              type="button"
              onClick={() => handleResetGame(gameMode, pawnCount)}
              className="mt-4 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-white font-black text-xs shadow-xl active:scale-95 transition-all flex items-center gap-2"
            >
              <RotateCcw size={15} /> Play Again
            </button>
          </div>
        )}
      </div>

      {/* Interactive Controls & 3D Dice Area */}
      <div className={`border rounded-2xl p-3.5 space-y-3 transition-colors ${
        isDarkMode ? 'bg-[#181d26] border-white/10' : 'bg-slate-50 border-slate-200'
      }`}>
        {/* Active Player Status Banner with Glow Pill */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className={`w-3.5 h-3.5 rounded-full transition-all ${
              currentTurn === 'RED' 
                ? 'bg-red-500 ring-4 ring-red-500/35 shadow-sm' 
                : 'bg-emerald-500 ring-4 ring-emerald-500/35 shadow-sm'
            }`} />
            <div>
              <span className={`text-[10px] uppercase font-bold tracking-wider block ${
                isDarkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                CURRENT TURN
              </span>
              <strong className={`text-sm font-bold flex items-center gap-1.5 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                <span>
                  {currentTurn === 'RED' 
                    ? `Table ${cleanTable} (You - Red)` 
                    : (gameMode === 'AI' ? 'Chef Bot 👨‍🍳 (Green)' : 'Player 2 (Green)')
                  }
                </span>
                {currentTurn === 'GREEN' && gameMode === 'AI' && (
                  <span className="text-[10px] font-normal text-emerald-400 animate-pulse">
                    thinking…
                  </span>
                )}
              </strong>
            </div>
          </div>

          {/* Tokens Home Count */}
          <div className="flex items-center gap-3 text-[11px] font-bold">
            <span className="flex items-center gap-1 text-red-600">
              🔴 {tokens.filter(t => t.player === 'RED' && t.step >= 56).length}/{pawnCount} Home
            </span>
            <span className="text-slate-400">•</span>
            <span className="flex items-center gap-1 text-emerald-600">
              🟢 {tokens.filter(t => t.player === 'GREEN' && t.step >= 56).length}/{pawnCount} Home
            </span>
          </div>
        </div>

        {/* Dice Action Box */}
        <div className={`rounded-xl p-3 border flex items-center justify-between gap-3 transition-colors ${
          isDarkMode ? 'bg-[#12151d] border-white/5' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-3">
            <DieFace3D 
              value={diceValue} 
              isRolling={isRolling} 
              onClick={() => {
                if (!isRolling && !hasRolled && (currentTurn === 'RED' || gameMode === 'PASS_AND_PLAY') && !winner) {
                  handleRollDice();
                }
              }} 
            />
            <div>
              <p className={`text-xs font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {isRolling ? 'Rolling dice…' : `Rolled a ${diceValue}`}
              </p>
              <p className={`text-[11px] mt-0.5 line-clamp-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {statusMessage}
              </p>
            </div>
          </div>

          {/* Big Vibrant Roll Button */}
          <button
            type="button"
            onClick={handleRollDice}
            disabled={isRolling || hasRolled || (gameMode === 'AI' && currentTurn === 'GREEN') || Boolean(winner)}
            className={`px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
              !hasRolled && !isRolling && (currentTurn === 'RED' || gameMode === 'PASS_AND_PLAY')
                ? 'bg-gradient-to-r from-red-500 via-amber-500 to-orange-500 hover:opacity-95 text-white shadow-amber-500/25 ring-2 ring-amber-400/40'
                : (isDarkMode ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5' : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200')
            }`}
          >
            <Dices size={16} />
            <span>Roll Dice</span>
          </button>
        </div>

        {/* Quick Tips */}
        <div className={`flex items-center justify-between text-[10px] px-1 font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          <span>💡 Roll a <b>6</b> to open pawn from base</span>
          <span>🎯 Opposing bases: Red vs Green</span>
        </div>
      </div>
    </div>
  );
}
