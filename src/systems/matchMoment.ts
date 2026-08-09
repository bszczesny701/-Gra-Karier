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
    // Krótki tap = anuluj; wyraźne naciągnięcie zawsze odpala lot
    if (power < 8) {
      ball = action === 'clear' ? { x: threat.x, y: threat.y } : { ...origin }
      return
    }
    // Min. prędkość — bez tego miękki strzał „zamiera” w apogeum
    const speed = Math.max(7.5, Math.min(19 - difficulty * 2, power / 3.4))
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
    // Linie boiska — czytelniejszy kontekst
    ctx.strokeStyle = 'rgba(244,247,245,0.18)'
    ctx.lineWidth = 2
    ctx.strokeRect(10, 10, w - 20, h - 20)
    ctx.beginPath()
    ctx.moveTo(10, h * 0.5)
    ctx.lineTo(w - 10, h * 0.5)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(w / 2, h * 0.5, Math.min(42, w * 0.12), 0, Math.PI * 2)
    ctx.stroke()
  }

  function drawGoal(): void {
    const g = goalRect()
    ctx.fillStyle = 'rgba(244,247,245,0.12)'
    ctx.fillRect(g.x, g.y, g.w, g.h)
    ctx.strokeStyle = 'rgba(244,247,245,0.7)'
    ctx.lineWidth = 3
    ctx.strokeRect(g.x, g.y, g.w, g.h)
  }

  /** Prosta sylwetka piłkarza (widok z góry): głowa + koszulka + nogi w biegu */
  function drawFootballer(
    x: number,
    y: number,
    opts: {
      kit: string
      shorts?: string
      skin?: string
      scale?: number
      facing?: number
      walk?: number
      label?: string
      gk?: boolean
    },
  ): void {
    const scale = opts.scale ?? 1
    const facing = opts.facing ?? 1
    const walk = opts.walk ?? 0
    const skin = opts.skin ?? '#e8c4a2'
    const shorts = opts.shorts ?? '#1a2332'
    const kit = opts.kit
    const legSwing = Math.sin(walk) * 5 * scale

    ctx.save()
    ctx.translate(x, y)
    ctx.scale(facing < 0 ? -1 : 1, 1)

    // Cień
    ctx.beginPath()
    ctx.ellipse(0, 10 * scale, 11 * scale, 4.5 * scale, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.fill()

    // Nogi
    ctx.fillStyle = shorts
    ctx.fillRect(-7 * scale - legSwing * 0.15, 2 * scale, 5.5 * scale, 11 * scale)
    ctx.fillRect(1.5 * scale + legSwing * 0.15, 2 * scale, 5.5 * scale, 11 * scale)
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(-7 * scale - legSwing * 0.15, 11 * scale, 5.5 * scale, 3 * scale)
    ctx.fillRect(1.5 * scale + legSwing * 0.15, 11 * scale, 5.5 * scale, 3 * scale)

    // Tułów / koszulka
    ctx.fillStyle = kit
    roundRect(-9 * scale, -10 * scale, 18 * scale, 14 * scale, 4 * scale)
    ctx.fill()
    if (opts.gk) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(-9 * scale, -2 * scale, 18 * scale, 3 * scale)
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, -8 * scale)
      ctx.lineTo(0, 2 * scale)
      ctx.stroke()
    }

    // Ręce
    ctx.fillStyle = kit
    ctx.fillRect(-13 * scale, -6 * scale, 4 * scale, 8 * scale)
    ctx.fillRect(9 * scale, -6 * scale, 4 * scale, 8 * scale)
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.arc(-11 * scale, 3 * scale, 2.4 * scale, 0, Math.PI * 2)
    ctx.arc(11 * scale, 3 * scale, 2.4 * scale, 0, Math.PI * 2)
    ctx.fill()

    // Głowa
    ctx.beginPath()
    ctx.arc(0, -15 * scale, 6.2 * scale, 0, Math.PI * 2)
    ctx.fillStyle = skin
    ctx.fill()
    ctx.fillStyle = '#2c2118'
    ctx.beginPath()
    ctx.ellipse(0, -17 * scale, 6 * scale, 3.2 * scale, 0, Math.PI, Math.PI * 2)
    ctx.fill()

    ctx.restore()

    if (opts.label) {
      ctx.fillStyle = 'rgba(242,246,243,0.92)'
      ctx.font = '600 11px "Source Sans 3", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(opts.label, x, y + 22 * scale)
    }
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }

  function drawBall(x: number, y: number, r = 11): void {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = '#f4f7f5'
    ctx.fill()
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y - r * 0.15, r * 0.28, 0, Math.PI * 2)
    ctx.fillStyle = '#1a1a1a'
    ctx.fill()
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 1
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(x, y - r * 0.15)
      ctx.lineTo(x + Math.cos(a) * r * 0.85, y - r * 0.15 + Math.sin(a) * r * 0.85)
      ctx.stroke()
    }
  }

  function draw(): void {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const t = performance.now() / 140
    ctx.clearRect(0, 0, w, h)
    drawPitch(w, h)

    for (const d of defenders) {
      const moving = Math.abs(d.vx) > 0.05 && !dragging
      drawFootballer(d.x, d.y, {
        kit: '#3d5a80',
        shorts: '#243447',
        scale: 0.95 + d.r / 40,
        facing: d.vx >= 0 ? 1 : -1,
        walk: moving ? t * Math.abs(d.vx) : 0,
      })
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
      drawFootballer(keeperX, g.y + g.h + 6, {
        kit: '#ff9f43',
        shorts: '#2a2a2a',
        scale: 1 + difficulty * 0.15,
        facing: keeperDir,
        walk: t * keeperSpeed * 0.8,
        gk: true,
        label: 'BR',
      })
      // Ty — przy piłce (gdy nie leci jeszcze)
      if (!flying?.active) {
        drawFootballer(origin.x, origin.y + 18, {
          kit: '#c8f560',
          shorts: '#1a2332',
          scale: 1.05,
          facing: 1,
          walk: dragging ? t * 2 : 0,
          label: 'Ty',
        })
      }
    } else if (action === 'pass') {
      const tm = teammate()
      ctx.beginPath()
      ctx.arc(tm.x, tm.y, tm.r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(200,245,96,0.16)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(200,245,96,0.55)'
      ctx.lineWidth = 2
      ctx.stroke()
      drawFootballer(tm.x, tm.y, {
        kit: '#c8f560',
        shorts: '#1a2332',
        scale: 1,
        facing: -1,
        walk: t * 0.6,
        label: 'Kolega',
      })
      if (!flying?.active) {
        drawFootballer(origin.x, origin.y + 18, {
          kit: '#e8f5a0',
          shorts: '#1a2332',
          scale: 1.05,
          facing: 1,
          walk: dragging ? t * 2 : 0,
          label: 'Ty',
        })
      }
    } else if (action === 'tackle') {
      drawFootballer(threat.x, threat.y, {
        kit: '#ff7a6e',
        shorts: '#3a1f1c',
        scale: 1.05,
        facing: threat.vx >= 0 ? 1 : -1,
        walk: t * Math.abs(threat.vx),
        label: 'Rywal',
      })
      // Piłka przy rywalu (dopóki nie oddajesz wślizgu)
      if (!flying?.active && !dragging) {
        drawBall(threat.x + (threat.vx >= 0 ? 14 : -14), threat.y + 2, 8)
      }
      drawFootballer(origin.x, origin.y, {
        kit: '#c8f560',
        shorts: '#1a2332',
        scale: 1.05,
        facing: Math.sign(threat.x - origin.x) || 1,
        walk: dragging ? t * 2.4 : 0,
        label: 'Ty',
      })
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
      drawFootballer(origin.x, origin.y, {
        kit: '#c8f560',
        shorts: '#1a2332',
        scale: 1.05,
        facing: 1,
        walk: dragging ? t * 2 : 0,
        label: 'Ty',
      })
    }

    if (dragging) {
      const from = action === 'clear' ? { x: threat.x, y: threat.y } : origin
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(ball.x, ball.y)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // W clear piłka jest przy threat — rysuj zawsze; w tackle tylko gdy lecisz / ciągniesz
    if (action !== 'tackle' || flying?.active || dragging) {
      drawBall(ball.x, ball.y, action === 'clear' && !flying?.active ? 9 : 11)
    }

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
      // Nie kończ po „prawie zerowej” prędkości — przy strzale w górę apogeum
      // chwilowo ma ~0 i piłka wyglądała jakby stała w miejscu.
      const out = ball.x < 8 || ball.x > w - 8 || ball.y < 8 || ball.y > h - 8
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
