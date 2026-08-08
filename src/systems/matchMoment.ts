import type { MatchAction } from '../state/types'

export interface MomentOptions {
  /** 0 = łatwy przeciwnik, 1 = top Ekstraklasa */
  difficulty?: number
}

export function actionLabel(action: MatchAction): string {
  if (action === 'shoot') return 'Strzał'
  if (action === 'pass') return 'Podanie'
  if (action === 'tackle') return 'Odbiór'
  return 'Wybicie'
}

/**
 * Mini-gry meczowe wg pozycji:
 * NP — strzał, POM — podanie, ŚO — odbiór, OB — wybicie.
 */
export function mountMatchMoment(
  canvas: HTMLCanvasElement,
  action: MatchAction,
  onFinished: (score: number) => void,
  options: MomentOptions = {},
): () => void {
  const maybeCtx = canvas.getContext('2d')
  if (!maybeCtx) return () => undefined
  const ctx = maybeCtx

  const difficulty = Math.max(0, Math.min(1, options.difficulty ?? 0.35))
  const defenderCount = difficulty < 0.25 ? 1 : difficulty < 0.55 ? 2 : 3
  const keeperSpeed = 1.2 + difficulty * 2.4
  const keeperReach = 22 + difficulty * 18
  const passRadius = 30 - difficulty * 14
  const scoreScale = 1 - difficulty * 0.28

  let dragging = false
  let ball = { x: 0, y: 0 }
  let origin = { x: 0, y: 0 }
  let flying: { vx: number; vy: number; active: boolean } | null = null
  let settled = false
  let raf = 0
  let keeperX = 0
  let keeperDir = 1
  let message = defaultMessage(action, difficulty)

  /** Piłka rywala (odbiór) / groźna w polu (wybicie) */
  let threat = { x: 0, y: 0, vx: 0, vy: 0, r: 14 }
  let safeZones: Array<{ x: number; y: number; r: number; label: string }> = []

  type Defender = { x: number; y: number; vx: number; r: number }
  let defenders: Defender[] = []

  function defaultMessage(a: MatchAction, d: number): string {
    const lvl = Math.round(d * 100)
    if (a === 'shoot') return `Strzał — omijaj bramkarza i obrońców (poziom ${lvl}%)`
    if (a === 'pass') return `Podanie — znajdź kolegę między obrońcami (poziom ${lvl}%)`
    if (a === 'tackle') return `Odbiór — traf w piłkę rywala (poziom ${lvl}%)`
    return `Wybicie — wyślij piłkę w bezpieczną strefę (poziom ${lvl}%)`
  }

  function spawnDefenders(w: number, h: number): void {
    defenders = []
    if (action === 'tackle' || action === 'clear') return
    for (let i = 0; i < defenderCount; i++) {
      const lane = 0.28 + (i / Math.max(1, defenderCount - 1 || 1)) * 0.35
      defenders.push({
        x: w * (0.2 + Math.random() * 0.6),
        y: h * lane,
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.7 + difficulty * 1.8 + Math.random()),
        r: 14 + difficulty * 6,
      })
    }
  }

  function setupThreat(w: number, h: number): void {
    if (action === 'tackle') {
      threat = {
        x: w * (0.15 + Math.random() * 0.2),
        y: h * (0.32 + Math.random() * 0.2),
        vx: (1.4 + difficulty * 2.2) * (Math.random() < 0.5 ? 1 : -1),
        vy: 0.15 + Math.random() * 0.25,
        r: 13,
      }
      if (threat.vx < 0) threat.x = w * (0.65 + Math.random() * 0.2)
    } else if (action === 'clear') {
      threat = {
        x: w * (0.35 + Math.random() * 0.3),
        y: h * (0.22 + Math.random() * 0.12),
        vx: (Math.random() - 0.5) * difficulty * 1.2,
        vy: 0.2 + difficulty * 0.35,
        r: 13,
      }
      safeZones = [
        { x: w * 0.18, y: h * 0.55, r: 36 - difficulty * 8, label: 'Lewa' },
        { x: w * 0.82, y: h * 0.55, r: 36 - difficulty * 8, label: 'Prawa' },
        { x: w * 0.5, y: h * 0.72, r: 40 - difficulty * 10, label: 'Środek' },
      ]
    }
  }

  function resize(): void {
    const parent = canvas.parentElement
    const w = Math.min(480, parent?.clientWidth ?? 360)
    const h = Math.round(w * 1.05)
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    origin = { x: w / 2, y: h * (action === 'clear' || action === 'tackle' ? 0.78 : 0.82) }
    keeperX = w / 2
    if (!flying?.active) {
      if (action === 'clear') {
        ball = { x: threat.x || origin.x, y: threat.y || h * 0.28 }
      } else {
        ball = { ...origin }
      }
    }
    if (defenders.length !== defenderCount && action !== 'tackle' && action !== 'clear') {
      spawnDefenders(w, h)
    }
    if ((action === 'tackle' || action === 'clear') && threat.r === 0) setupThreat(w, h)
  }

  function pointerPos(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function goalRect(): { x: number; y: number; w: number; h: number } {
    const w = canvas.clientWidth
    const shrink = difficulty * 0.12
    return { x: w * (0.22 + shrink / 2), y: 28, w: w * (0.56 - shrink), h: 56 }
  }

  function teammate(): { x: number; y: number; r: number } {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    return { x: w * 0.72, y: h * 0.38, r: Math.max(12, passRadius) }
  }

  function hitDefender(): boolean {
    return defenders.some((d) => dist(ball, d) <= d.r + 12)
  }

  function scoreShot(): number {
    if (hitDefender()) return (18 + Math.random() * 14) * scoreScale
    const g = goalRect()
    const inGoal =
      ball.x >= g.x && ball.x <= g.x + g.w && ball.y >= g.y && ball.y <= g.y + g.h + 20
    if (!inGoal) {
      const cx = g.x + g.w / 2
      const cy = g.y + g.h / 2
      const d = Math.hypot(ball.x - cx, ball.y - cy)
      return Math.max(5, (50 - d / 3) * scoreScale)
    }
    const saved = Math.abs(ball.x - keeperX) < keeperReach
    if (saved) return (22 + Math.random() * 14) * scoreScale
    const center = g.x + g.w / 2
    const accuracy = 100 - (Math.abs(ball.x - center) / (g.w / 2)) * (35 + difficulty * 20)
    return Math.max(55, Math.min(100, accuracy)) * scoreScale
  }

  function scorePass(): number {
    if (hitDefender()) return (15 + Math.random() * 12) * scoreScale
    const t = teammate()
    const d = dist(ball, t)
    if (d <= t.r) return (82 + Math.random() * 14) * scoreScale
    if (d <= t.r * 2) return (55 + Math.random() * 15) * scoreScale
    return Math.max(8, (48 - d / 2.2) * scoreScale)
  }

  function scoreTackle(): number {
    const d = dist(ball, threat)
    if (d <= threat.r + 16) return (78 + Math.random() * 18) * scoreScale
    if (d <= threat.r + 32) return (52 + Math.random() * 16) * scoreScale
    return Math.max(6, (42 - d / 2.5) * scoreScale)
  }

  function scoreClear(): number {
    const g = goalRect()
    const intoOwnGoal =
      ball.x >= g.x && ball.x <= g.x + g.w && ball.y >= g.y && ball.y <= g.y + g.h + 24
    if (intoOwnGoal) return (8 + Math.random() * 12) * scoreScale

    let best = 999
    for (const z of safeZones) {
      best = Math.min(best, dist(ball, z))
    }
    if (best <= 28) return (80 + Math.random() * 16) * scoreScale
    if (best <= 48) return (58 + Math.random() * 14) * scoreScale
    // Wyżej / dalej od bramki = lepiej niż wrzutka w pole
    if (ball.y > canvas.clientHeight * 0.55) return (48 + Math.random() * 12) * scoreScale
    return Math.max(10, (40 - best / 3) * scoreScale)
  }

  function finish(): void {
    if (settled) return
    settled = true
    let raw = 40
    if (action === 'shoot') raw = scoreShot()
    else if (action === 'pass') raw = scorePass()
    else if (action === 'tackle') raw = scoreTackle()
    else raw = scoreClear()
    const score = Math.max(3, Math.min(100, raw))
    message = `Wynik akcji: ${Math.round(score)}%`
    flying = null
    window.setTimeout(() => onFinished(score), 500)
  }

  function dragTarget(): { x: number; y: number } {
    return action === 'clear' ? ball : origin
  }

  function onDown(e: PointerEvent): void {
    if (flying?.active || settled) return
    const p = pointerPos(e)
    const t = action === 'clear' ? ball : ball
    if (dist(p, t) > 48) return
    dragging = true
    canvas.setPointerCapture(e.pointerId)
  }

  function onMove(e: PointerEvent): void {
    if (!dragging) return
    const p = pointerPos(e)
    const base = action === 'clear' ? { x: threat.x, y: threat.y } : origin
    const dx = p.x - base.x
    const dy = p.y - base.y
    const maxPull = 95 - difficulty * 12
    const len = Math.hypot(dx, dy) || 1
    const scale = len > maxPull ? maxPull / len : 1
    ball = { x: base.x + dx * scale, y: base.y + dy * scale }
  }

  function onUp(e: PointerEvent): void {
    if (!dragging) return
    dragging = false
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const base = action === 'clear' ? { x: threat.x, y: threat.y } : origin
    const pullX = base.x - ball.x
    const pullY = base.y - ball.y
    const power = Math.hypot(pullX, pullY)
    if (power < 12) {
      ball = action === 'clear' ? { x: threat.x, y: threat.y } : { ...origin }
      return
    }
    const speed = Math.min(18.5 - difficulty * 2, power / 4)
    flying = {
      vx: (pullX / power) * speed,
      vy: (pullY / power) * speed,
      active: true,
    }
  }

  function drawPitch(w: number, h: number): void {
    const grd = ctx.createLinearGradient(0, 0, 0, h)
    grd.addColorStop(0, '#1f6b4a')
    grd.addColorStop(1, '#0b3d2e')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, w, h)
  }

  function drawGoal(): void {
    const g = goalRect()
    ctx.fillStyle = 'rgba(244,247,245,0.12)'
    ctx.fillRect(g.x, g.y, g.w, g.h)
    ctx.strokeStyle = 'rgba(244,247,245,0.7)'
    ctx.lineWidth = 3
    ctx.strokeRect(g.x, g.y, g.w, g.h)
  }

  function draw(): void {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    ctx.clearRect(0, 0, w, h)
    drawPitch(w, h)

    for (const d of defenders) {
      ctx.beginPath()
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
      ctx.fillStyle = '#3d5a80'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    if (action === 'shoot') {
      drawGoal()
      const g = goalRect()
      ctx.strokeStyle = 'rgba(244,247,245,0.2)'
      ctx.lineWidth = 1
      for (let i = 1; i < 4; i++) {
        const x = g.x + (g.w * i) / 4
        ctx.beginPath()
        ctx.moveTo(x, g.y)
        ctx.lineTo(x, g.y + g.h)
        ctx.stroke()
      }
      ctx.fillStyle = '#ff7a6e'
      const kw = 28 + difficulty * 10
      ctx.fillRect(keeperX - kw / 2, g.y + g.h - 8, kw, 14)
      ctx.beginPath()
      ctx.arc(keeperX, g.y + g.h - 14, 10 + difficulty * 3, 0, Math.PI * 2)
      ctx.fill()
    } else if (action === 'pass') {
      const t = teammate()
      ctx.beginPath()
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(200,245,96,0.25)'
      ctx.fill()
      ctx.strokeStyle = '#c8f560'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#c8f560'
      ctx.font = '700 12px "Source Sans 3", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Kolega', t.x, t.y + 4)
    } else if (action === 'tackle') {
      // Rywal z piłką
      ctx.beginPath()
      ctx.arc(threat.x, threat.y, 16, 0, Math.PI * 2)
      ctx.fillStyle = '#ff7a6e'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(threat.x + 10, threat.y - 4, threat.r, 0, Math.PI * 2)
      ctx.fillStyle = '#f4f7f5'
      ctx.fill()
      ctx.fillStyle = 'rgba(242,246,243,0.9)'
      ctx.font = '600 12px "Source Sans 3", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Rywal', threat.x, threat.y + 28)
      // Twój „tackle” = biała piłka / wślizg z origin
      ctx.beginPath()
      ctx.arc(origin.x, origin.y, 10, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(200,245,96,0.35)'
      ctx.fill()
    } else if (action === 'clear') {
      drawGoal()
      ctx.fillStyle = 'rgba(255,122,110,0.15)'
      const g = goalRect()
      ctx.fillRect(g.x - 8, g.y, g.w + 16, g.h + 40)
      for (const z of safeZones) {
        ctx.beginPath()
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(200,245,96,0.18)'
        ctx.fill()
        ctx.strokeStyle = '#c8f560'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#c8f560'
        ctx.font = '700 11px "Source Sans 3", sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(z.label, z.x, z.y + 4)
      }
    }

    if (dragging) {
      const base = dragTarget()
      const from = action === 'clear' ? { x: threat.x, y: threat.y } : origin
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(ball.x, ball.y)
      ctx.stroke()
      ctx.setLineDash([])
      void base
    }

    ctx.beginPath()
    ctx.arc(ball.x, ball.y, 15, 0, Math.PI * 2)
    ctx.fillStyle = '#f4f7f5'
    ctx.fill()
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = 'rgba(242,246,243,0.95)'
    ctx.font = '600 13px "Source Sans 3", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(message, w / 2, h - 18)
  }

  function tick(): void {
    const w = canvas.clientWidth
    const h = canvas.clientHeight

    if (!settled && !dragging) {
      for (const d of defenders) {
        d.x += d.vx
        if (d.x < 24 || d.x > w - 24) d.vx *= -1
        if (difficulty > 0.4 && flying?.active) {
          d.x += Math.sign(ball.x - d.x) * difficulty * 0.35
        }
      }
    }

    if (!settled && action === 'tackle' && !flying?.active) {
      threat.x += threat.vx
      threat.y += threat.vy
      if (threat.x < 30 || threat.x > w - 30) threat.vx *= -1
      if (threat.y > h * 0.62 || threat.y < h * 0.22) threat.vy *= -1
      // Ucieczka — jeśli nie odbierzesz w czasie
      if (Math.abs(threat.x - w / 2) > w * 0.42 && !settled) {
        message = 'Rywal uciekł!'
        finish()
      }
    }

    if (!settled && action === 'clear' && !flying?.active && !dragging) {
      threat.x += threat.vx
      threat.y += threat.vy
      ball = { x: threat.x, y: threat.y }
      const g = goalRect()
      if (threat.y <= g.y + g.h) {
        message = 'Za późno — piłka w polu karnym!'
        finish()
      }
    }

    if (!settled && action === 'shoot' && !dragging) {
      const g = goalRect()
      keeperX += keeperDir * keeperSpeed
      if (keeperX > g.x + g.w - 20) keeperDir = -1
      if (keeperX < g.x + 20) keeperDir = 1
      if (flying?.active && difficulty > 0.35) {
        keeperX += Math.sign(ball.x - keeperX) * difficulty * 0.9
      }
    }

    if (flying?.active) {
      ball.x += flying.vx
      ball.y += flying.vy
      flying.vy += 0.16 + difficulty * 0.04
      flying.vx *= 0.995
      const g = goalRect()
      const hitGoalLine = action === 'shoot' && ball.y <= g.y + g.h && ball.y >= g.y - 10
      const hitTeammate = action === 'pass' && dist(ball, teammate()) <= teammate().r + 8
      const hitThreat =
        action === 'tackle' && dist(ball, threat) <= threat.r + 18
      const hitSafe =
        action === 'clear' && safeZones.some((z) => dist(ball, z) <= z.r + 10)
      const blocked = action !== 'tackle' && action !== 'clear' && hitDefender()
      const out =
        ball.x < 8 ||
        ball.x > w - 8 ||
        ball.y < 8 ||
        ball.y > h - 8 ||
        Math.hypot(flying.vx, flying.vy) < 0.65
      if (blocked) {
        message = 'Zablokowane przez obrońcę!'
        finish()
      } else if (hitThreat) {
        message = 'Czysty odbiór!'
        finish()
      } else if (hitSafe) {
        message = 'Wybite w bezpieczną strefę!'
        finish()
      } else if (hitGoalLine || hitTeammate || out) finish()
    }

    draw()
    if (!settled) raf = requestAnimationFrame(tick)
    else draw()
  }

  resize()
  spawnDefenders(canvas.clientWidth, canvas.clientHeight)
  setupThreat(canvas.clientWidth, canvas.clientHeight)
  if (action === 'clear') ball = { x: threat.x, y: threat.y }
  window.addEventListener('resize', resize)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  raf = requestAnimationFrame(tick)

  return () => {
    settled = true
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
  }
}
