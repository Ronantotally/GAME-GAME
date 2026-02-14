import React, { useState, useEffect, useRef, useCallback } from 'react'

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'people', label: 'People', emoji: '👤', color: 'from-pink-500 to-rose-600' },
  { id: 'places', label: 'Places', emoji: '🌍', color: 'from-blue-500 to-cyan-600' },
  { id: 'things', label: 'Things', emoji: '💡', color: 'from-amber-500 to-orange-600' },
  { id: 'events', label: 'Events', emoji: '⚡', color: 'from-purple-500 to-violet-600' },
  { id: 'random', label: 'Random', emoji: '🎲', color: 'from-green-500 to-emerald-600' },
]

const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', description: 'Well-known subjects' },
  { id: 'medium', label: 'Medium', description: 'Broader knowledge' },
  { id: 'hard', label: 'Hard', description: 'Obscure & tricky' },
]

const MAX_CLUES = 20
const POINTS_PER_CLUE = 10
const MAX_POINTS = 200

// ─── Claude API (routed through Vercel serverless proxy) ─────────────────────

async function callClaude(messages, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      if (!response.ok) {
        const err = await response.text()
        throw new Error(`API error ${response.status}: ${err}`)
      }
      const data = await response.json()
      return data.content[0].text
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
}

async function generatePuzzle(category, difficulty, usedAnswers) {
  const categoryInstruction = category === 'random'
    ? 'Pick from any category: people, places, things, or events.'
    : `The subject must be from the "${category}" category.`

  const usedList = usedAnswers.length > 0
    ? `\n\nDo NOT use any of these previously used answers: ${usedAnswers.join(', ')}`
    : ''

  const prompt = `Generate a puzzle for the game "20 Clues". ${categoryInstruction}

Difficulty: ${difficulty}
- Easy: well-known subjects, more generous/helpful clues
- Medium: moderately well-known subjects, clues require broader knowledge
- Hard: obscure subjects, early clues are deliberately vague and misleading

${usedList}

Return ONLY valid JSON with no markdown formatting, no code fences, no preamble:
{
  "answer": "the secret subject",
  "category": "people|places|things|events",
  "clues": ["clue 1 (extremely vague)", "clue 2", ... "clue 20 (almost a giveaway)"],
  "fun_fact": "a surprising/fun fact about the answer"
}

Rules for clues:
- Exactly 20 clues, ordered from vaguest to most specific
- Clue 1 should apply to hundreds of things
- Clue 10 should narrow it to a handful
- Clue 20 should be almost a giveaway
- Each clue is a single sentence
- For people/things/places: use first person ("I am...", "I was...", "I have...")
- For events: use narrative description
- Never include the answer's name in any clue
- Each clue should add new information, not repeat previous clues`

  const text = await callClaude([{ role: 'user', content: prompt }])

  // Parse JSON - handle potential markdown code fences
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const puzzle = JSON.parse(cleaned)

  if (!puzzle.answer || !puzzle.clues || puzzle.clues.length !== 20) {
    throw new Error('Invalid puzzle format received')
  }
  return puzzle
}

async function judgeGuess(guess, correctAnswer) {
  const prompt = `You are a judge for a guessing game. The correct answer is "${correctAnswer}". The player guessed: "${guess}".

Determine if the guess is correct. Be generous with:
- Alternate names (e.g., "NYC" for "New York City")
- Reasonable misspellings (e.g., "Einstien" for "Einstein")
- Partial but sufficient answers (e.g., "Einstein" for "Albert Einstein")
- Common abbreviations or nicknames

But reject answers that are:
- Too vague (e.g., "a city" for "Paris")
- Only partially correct in a misleading way
- A different entity entirely

Return ONLY valid JSON with no markdown formatting, no code fences, no preamble:
{ "correct": true or false, "response": "a short witty/encouraging message (1-2 sentences)" }`

  const text = await callClaude([{ role: 'user', content: prompt }])
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  return JSON.parse(cleaned)
}

// ─── Confetti Component ──────────────────────────────────────────────────────

function Confetti() {
  const colors = ['#EC4899', '#7C3AED', '#2563EB', '#10B981', '#F59E0B', '#F97316', '#EF4444']
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 2,
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
  }))

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * 0.6}px`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Loading Spinner ─────────────────────────────────────────────────────────

function Spinner({ text = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-white/10" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-game-pink animate-spin" />
        <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-game-purple animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
      </div>
      <p className="text-white/70 font-semibold text-lg animate-pulse">{text}</p>
    </div>
  )
}

// ─── Animated Number ─────────────────────────────────────────────────────────

function AnimatedNumber({ value, duration = 600 }) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    const start = prevRef.current
    const end = value
    if (start === end) return
    const startTime = Date.now()
    const tick = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(start + (end - start) * eased))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    prevRef.current = end
  }, [value, duration])

  return <span>{display}</span>
}

// ─── Home Screen ─────────────────────────────────────────────────────────────

function HomeScreen({ onStart, stats }) {
  const [category, setCategory] = useState('random')
  const [difficulty, setDifficulty] = useState('medium')
  const [showHowTo, setShowHowTo] = useState(false)

  return (
    <div className="min-h-screen flex flex-col p-4 max-w-lg mx-auto">
      {/* Title */}
      <div className="text-center pt-8 pb-6 animate-fade-in">
        <h1 className="font-display text-6xl mb-2 bg-gradient-to-r from-game-yellow via-game-pink to-game-purple bg-clip-text text-transparent drop-shadow-lg animate-float">
          20 Clues
        </h1>
        <p className="text-white/70 text-lg font-semibold">How few clues do you need?</p>
      </div>

      {/* Session Stats */}
      {stats.roundsPlayed > 0 && (
        <div className="animate-slide-in bg-white/10 backdrop-blur rounded-2xl p-4 mb-6 border border-white/10">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-game-yellow">
                <AnimatedNumber value={stats.totalScore} />
              </div>
              <div className="text-xs text-white/50 font-semibold">Total Score</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-game-pink">{stats.roundsPlayed}</div>
              <div className="text-xs text-white/50 font-semibold">Rounds</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-game-green">
                {stats.roundsPlayed > 0 ? (stats.totalCluesUsed / stats.roundsPlayed).toFixed(1) : '—'}
              </div>
              <div className="text-xs text-white/50 font-semibold">Avg Clues</div>
            </div>
          </div>
        </div>
      )}

      {/* Category Selection */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">Category</h2>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`relative py-4 px-4 rounded-2xl font-bold text-lg transition-all duration-200 border-2 ${
                category === cat.id
                  ? `bg-gradient-to-br ${cat.color} border-white/40 shadow-lg scale-[1.02]`
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              } ${cat.id === 'random' ? 'col-span-2' : ''}`}
            >
              <span className="mr-2">{cat.emoji}</span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty Selection */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">Difficulty</h2>
        <div className="grid grid-cols-3 gap-3">
          {DIFFICULTIES.map(diff => (
            <button
              key={diff.id}
              onClick={() => setDifficulty(diff.id)}
              className={`py-3 px-3 rounded-xl font-bold transition-all duration-200 border-2 ${
                difficulty === diff.id
                  ? 'bg-gradient-to-br from-game-purple to-game-blue border-white/40 shadow-lg'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <div className="text-base">{diff.label}</div>
              <div className="text-[10px] text-white/50 mt-0.5">{diff.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Play Button */}
      <button
        onClick={() => onStart(category, difficulty)}
        className="glow-button w-full py-5 rounded-2xl font-display text-2xl bg-gradient-to-r from-game-pink via-game-purple to-game-blue shadow-2xl hover:opacity-95 active:scale-[0.98] transition-all duration-150"
      >
        Play!
      </button>

      {/* How to Play */}
      <div className="mt-6 mb-4">
        <button
          onClick={() => setShowHowTo(!showHowTo)}
          className="w-full text-white/40 text-sm font-semibold hover:text-white/60 transition-colors flex items-center justify-center gap-2"
        >
          <span>How to Play</span>
          <span className={`transition-transform ${showHowTo ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showHowTo && (
          <div className="mt-3 bg-white/5 rounded-2xl p-5 text-sm text-white/60 space-y-2 animate-slide-in border border-white/10">
            <p><strong className="text-white/80">1.</strong> Pick a category and difficulty</p>
            <p><strong className="text-white/80">2.</strong> You'll get a mystery subject with 20 clues, from vague to specific</p>
            <p><strong className="text-white/80">3.</strong> Clues are revealed one at a time — guess whenever you're ready</p>
            <p><strong className="text-white/80">4.</strong> The fewer clues you need, the more points you earn!</p>
            <p><strong className="text-white/80">5.</strong> Clue 1 = 200 pts, Clue 20 = 10 pts</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Game Screen ─────────────────────────────────────────────────────────────

function GameScreen({ puzzle, onFinish, sessionScore }) {
  const [revealedCount, setRevealedCount] = useState(1)
  const [guess, setGuess] = useState('')
  const [isJudging, setIsJudging] = useState(false)
  const [wrongShake, setWrongShake] = useState(false)
  const [wrongMessage, setWrongMessage] = useState('')
  const clueListRef = useRef(null)
  const inputRef = useRef(null)

  const currentPoints = MAX_POINTS - (revealedCount - 1) * POINTS_PER_CLUE
  const progress = (revealedCount / MAX_CLUES) * 100

  useEffect(() => {
    if (clueListRef.current) {
      clueListRef.current.scrollTop = clueListRef.current.scrollHeight
    }
  }, [revealedCount])

  const handleRevealNext = () => {
    if (revealedCount < MAX_CLUES) {
      setRevealedCount(prev => prev + 1)
      setWrongMessage('')
    }
  }

  const handleGuess = async () => {
    if (!guess.trim() || isJudging) return
    setIsJudging(true)
    setWrongMessage('')

    try {
      const result = await judgeGuess(guess.trim(), puzzle.answer)
      if (result.correct) {
        onFinish({
          won: true,
          cluesUsed: revealedCount,
          points: currentPoints,
          response: result.response,
        })
      } else {
        setWrongShake(true)
        setWrongMessage(result.response || 'Not quite — try again!')
        setTimeout(() => setWrongShake(false), 500)
        setGuess('')
      }
    } catch {
      setWrongMessage('Error checking guess. Please try again.')
    } finally {
      setIsJudging(false)
    }
  }

  const handleGiveUp = () => {
    onFinish({
      won: false,
      cluesUsed: revealedCount,
      points: 0,
      response: "Better luck next time! Now you've learned something new.",
    })
  }

  const categoryInfo = CATEGORIES.find(c => c.id === puzzle.category) || CATEGORIES[4]

  return (
    <div className="h-screen flex flex-col max-w-lg mx-auto" style={{ height: '100dvh' }}>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${categoryInfo.color}`}>
            {categoryInfo.emoji} {categoryInfo.label}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs text-white/40">Score</div>
          <div className="text-lg font-bold text-game-yellow leading-none">
            <AnimatedNumber value={sessionScore} />
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="px-4 pt-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-sm font-bold text-white/70">Clue {revealedCount} of {MAX_CLUES}</span>
          <span className="text-sm font-bold text-game-yellow">Worth {currentPoints} pts</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full progress-fill bg-gradient-to-r from-game-green via-game-yellow to-game-pink"
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* Dot indicators */}
        <div className="flex justify-between mt-1.5 px-0.5">
          {Array.from({ length: MAX_CLUES }, (_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                i < revealedCount ? 'bg-game-purple scale-110' : 'bg-white/15'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Clue Area */}
      <div className="flex-1 overflow-hidden flex flex-col px-4 py-3 gap-3 min-h-0">
        {/* Previous clues (scrollable) */}
        <div ref={clueListRef} className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {puzzle.clues.slice(0, revealedCount).map((clue, i) => {
            const isCurrent = i === revealedCount - 1
            return (
              <div
                key={i}
                className={`rounded-2xl p-4 transition-all duration-300 ${
                  isCurrent
                    ? 'bg-gradient-to-br from-game-purple/30 to-game-pink/20 border-2 border-game-purple/40 shadow-lg clue-enter'
                    : 'bg-white/5 border border-white/5'
                }`}
              >
                <div className="flex gap-3">
                  <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    isCurrent
                      ? 'bg-game-purple text-white'
                      : 'bg-white/10 text-white/40'
                  }`}>
                    {i + 1}
                  </span>
                  <p className={`text-sm leading-relaxed ${
                    isCurrent ? 'text-white font-semibold' : 'text-white/50'
                  }`}>
                    {clue}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Wrong Message */}
      {wrongMessage && (
        <div className="px-4 pb-2 animate-slide-in">
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-2 text-sm text-red-200 text-center font-semibold">
            {wrongMessage}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className={`px-4 pb-4 pt-2 bg-black/20 backdrop-blur-sm border-t border-white/10 ${wrongShake ? 'wrong-guess' : ''}`}>
        <div className="flex gap-2 mb-2">
          <input
            ref={inputRef}
            type="text"
            value={guess}
            onChange={e => setGuess(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGuess()}
            placeholder="Type your guess..."
            disabled={isJudging}
            className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-game-purple focus:border-transparent font-semibold disabled:opacity-50"
          />
          <button
            onClick={handleGuess}
            disabled={!guess.trim() || isJudging}
            className="px-5 py-3 rounded-xl font-bold bg-gradient-to-r from-game-green to-emerald-600 hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {isJudging ? '...' : 'Guess'}
          </button>
        </div>
        <div className="flex gap-2">
          {revealedCount < MAX_CLUES && (
            <button
              onClick={handleRevealNext}
              disabled={isJudging}
              className="flex-1 py-3 rounded-xl font-bold bg-gradient-to-r from-game-purple to-violet-600 hover:opacity-90 active:scale-95 transition-all animate-pulse-glow disabled:opacity-40"
            >
              Next Clue (-{POINTS_PER_CLUE} pts)
            </button>
          )}
          <button
            onClick={handleGiveUp}
            disabled={isJudging}
            className="py-3 px-4 rounded-xl font-semibold text-white/40 bg-white/5 hover:bg-white/10 hover:text-white/60 transition-all text-sm disabled:opacity-40"
          >
            Give Up
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Results Screen ──────────────────────────────────────────────────────────

function ResultsScreen({ result, puzzle, onPlayAgain, onChangeCategory }) {
  const [showConfetti, setShowConfetti] = useState(result.won)

  useEffect(() => {
    if (result.won) {
      const timer = setTimeout(() => setShowConfetti(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [result.won])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 max-w-lg mx-auto">
      {showConfetti && <Confetti />}

      <div className="w-full space-y-6 animate-bounce-in">
        {/* Result Header */}
        <div className="text-center">
          <div className="text-6xl mb-3">{result.won ? '🎉' : '😅'}</div>
          <h2 className="font-display text-3xl mb-2">
            {result.won ? 'You got it!' : 'Not this time!'}
          </h2>
        </div>

        {/* Answer Reveal */}
        <div className="bg-gradient-to-br from-game-purple/30 to-game-pink/20 rounded-3xl p-6 border-2 border-game-purple/30 text-center">
          <div className="text-sm text-white/50 font-semibold mb-1">The answer was</div>
          <div className="font-display text-3xl text-game-yellow">{puzzle.answer}</div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 rounded-2xl p-4 text-center border border-white/10">
            <div className="text-3xl font-bold text-game-green">
              <AnimatedNumber value={result.points} />
            </div>
            <div className="text-xs text-white/50 font-semibold mt-1">Points Earned</div>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 text-center border border-white/10">
            <div className="text-3xl font-bold text-game-blue">{result.cluesUsed}</div>
            <div className="text-xs text-white/50 font-semibold mt-1">Clues Used</div>
          </div>
        </div>

        {/* Claude's Response */}
        <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
          <div className="text-sm text-white/40 font-semibold mb-2">Claude says:</div>
          <p className="text-white/80 italic font-semibold">"{result.response}"</p>
        </div>

        {/* Fun Fact */}
        <div className="bg-gradient-to-br from-game-blue/20 to-game-green/10 rounded-2xl p-5 border border-game-blue/20">
          <div className="text-sm text-game-blue font-bold mb-2">Fun Fact</div>
          <p className="text-white/70 text-sm leading-relaxed">{puzzle.fun_fact}</p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <button
            onClick={onPlayAgain}
            className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-game-pink via-game-purple to-game-blue hover:opacity-90 active:scale-[0.98] transition-all shadow-lg"
          >
            Play Again
          </button>
          <button
            onClick={onChangeCategory}
            className="w-full py-3 rounded-2xl font-bold text-white/50 bg-white/5 hover:bg-white/10 hover:text-white/70 transition-all border border-white/10"
          >
            Change Category
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Error Screen ────────────────────────────────────────────────────────────

function ErrorScreen({ message, onRetry, onBack }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md w-full space-y-6 animate-fade-in">
        <div className="text-5xl">😵</div>
        <h2 className="font-display text-2xl">Oops!</h2>
        <p className="text-white/60">{message}</p>
        <div className="space-y-3">
          <button
            onClick={onRetry}
            className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-game-purple to-game-pink hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
          <button
            onClick={onBack}
            className="w-full py-3 rounded-xl font-semibold text-white/40 hover:text-white/60 transition-colors"
          >
            Back to Menu
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState('home') // home | loading | game | results | error
  const [puzzle, setPuzzle] = useState(null)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [lastCategory, setLastCategory] = useState('random')
  const [lastDifficulty, setLastDifficulty] = useState('medium')
  const [usedAnswers, setUsedAnswers] = useState([])
  const [stats, setStats] = useState({
    totalScore: 0,
    roundsPlayed: 0,
    totalCluesUsed: 0,
  })

  const startGame = useCallback(async (category, difficulty) => {
    setLastCategory(category)
    setLastDifficulty(difficulty)
    setScreen('loading')
    setErrorMsg('')

    try {
      const p = await generatePuzzle(category, difficulty, usedAnswers)
      setPuzzle(p)
      setScreen('game')
    } catch (err) {
      setErrorMsg(err.message || 'Failed to generate puzzle. Please try again.')
      setScreen('error')
    }
  }, [usedAnswers])

  const handleFinish = useCallback((res) => {
    setResult(res)
    setScreen('results')
    if (puzzle) {
      setUsedAnswers(prev => [...prev, puzzle.answer])
    }
    setStats(prev => ({
      totalScore: prev.totalScore + res.points,
      roundsPlayed: prev.roundsPlayed + 1,
      totalCluesUsed: prev.totalCluesUsed + res.cluesUsed,
    }))
  }, [puzzle])

  const handlePlayAgain = useCallback(() => {
    startGame(lastCategory, lastDifficulty)
  }, [startGame, lastCategory, lastDifficulty])

  const handleChangeCategory = useCallback(() => {
    setScreen('home')
  }, [])

  switch (screen) {
    case 'home':
      return <HomeScreen onStart={startGame} stats={stats} />
    case 'loading':
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Spinner text="Generating your puzzle..." />
        </div>
      )
    case 'game':
      return (
        <GameScreen
          puzzle={puzzle}
          onFinish={handleFinish}
          sessionScore={stats.totalScore}
        />
      )
    case 'results':
      return (
        <ResultsScreen
          result={result}
          puzzle={puzzle}
          onPlayAgain={handlePlayAgain}
          onChangeCategory={handleChangeCategory}
        />
      )
    case 'error':
      return (
        <ErrorScreen
          message={errorMsg}
          onRetry={() => startGame(lastCategory, lastDifficulty)}
          onBack={handleChangeCategory}
        />
      )
    default:
      return null
  }
}
