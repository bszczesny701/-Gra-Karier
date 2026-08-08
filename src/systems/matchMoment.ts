import type { MatchAction } from '../state/types'

export interface MomentOptions {
  /** 0 = łatwy przeciwnik, 1 = top Ekstraklasa */
  difficulty?: number
}

/**
 * Mini-gra w kluczowym meczu: strzał / podanie.
 * Wyższa difficulty = szybszy bramkarz, więcej obrońców, mniejszy cel.
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
  let message =
    action === 'shoot'
      ? `Strzał — omijaj bramkarza i obrońców (poziom ${Math.round(difficulty * 100)}%)`
      : `Podanie — znajdź kolegę między obrońcami (poziom ${Math.round(difficulty * 100)}%)`

  type Defender = { x: number; y: number; vx: number; r: number }
  let defenders: Defender[] = []

  function spawnDefenders(w: number, h: number): void {
    defenders = []
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
    origin = { x: w / 2, y: h * 0.82 }
    keeperX = w / 2
    if (!flying?.active) ball = { ...origin }
    if (defenders.length !== defenderCount) spawnDefenders(w, h)
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

  function finish(): void {
    if (settled) return
    settled = true
    const raw = action === 'shoot' ? scoreShot() : scorePass()
    const score = Math.max(3, Math.min(100, raw))
    message = `Wynik akcji: ${Math.round(score)}%`
    flying = null
    window.setTimeout(() => onFinished(score), 500)
  }

  function onDown(e: PointerEvent): void {
    if (flying?.active || settled) return
    const p = pointerPos(e)
    if (dist(p, ball) > 42) return
    dragging = true
    canvas.setPointerCapture(e.pointerId)
  }

  function onMove(e: PointerEvent): void {
    if (!dragging) return
    const p = pointerPos(e)
    const dx = p.x - origin.x
    const dy = p.y - origin.y
    const maxPull = 95 - difficulty * 12
    const len = Math.hypot(dx, dy) || 1
    const scale = len > maxPull ? maxPull / len : 1
    ball = { x: origin.x + dx * scale, y: origin.y + dy * scale }
  }

  function onUp(e: PointerEvent): void {
    if (!dragging) return
    dragging = false
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const pullX = origin.x - ball.x
    const pullY = origin.y - ball.y
    const power = Math.hypot(pullX, pullY)
    if (power < 12) {
      ball = { ...origin }
      return
    }
    const speed = Math.min(18.5 - difficulty * 2, power / 4)
    flying = {
      vx: (pullX / power) * speed,
      vy: (pullY / power) * speed,
      active: true,
    }
  }

  function draw(): void {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    ctx.clearRect(0, 0, w, h)

    const grd = ctx.createLinearGradient(0, 0, 0, h)
    grd.addColorStop(0, '#1f6b4a')
    grd.addColorStop(1, '#0b3d2e')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, w, h)

    // Obrońcy
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
      const g = goalRect()
      ctx.fillStyle = 'rgba(244,247,245,0.12)'
      ctx.fillRect(g.x, g.y, g.w, g.h)
      ctx.strokeStyle = 'rgba(244,247,245,0.7)'
      ctx.lineWidth = 3
      ctx.strokeRect(g.x, g.y, g.w, g.h)
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
    } else {
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
    }

    if (dragging) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(origin.x, origin.y)
      ctx.lineTo(ball.x, ball.y)
      ctx.stroke()
      ctx.setLineDash([])
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
        // Lekkie „śledzenie” piłki przy wysokiej trudności
        if (difficulty > 0.4 && flying?.active) {
          d.x += Math.sign(ball.x - d.x) * difficulty * 0.35
        }
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
      const blocked = hitDefender()
      const out =
        ball.x < 8 ||
        ball.x > w - 8 ||
        ball.y < 8 ||
        ball.y > h - 8 ||
        Math.hypot(flying.vx, flying.vy) < 0.65
      if (blocked) {
        message = 'Zablokowane przez obrońcę!'
        finish()
      } else if (hitGoalLine || hitTeammate || out) finish()
    }

    draw()
    if (!settled) raf = requestAnimationFrame(tick)
    else draw()
  }

  resize()
  spawnDefenders(canvas.clientWidth, canvas.clientHeight)
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
