import type { MatchAction } from '../state/types'

/**
 * Mini-gra w kluczowym meczu: strzał na bramkę albo podanie do partnera.
 * Naciągnij piłkę i puść w stronę celu.
 */
export function mountMatchMoment(
  canvas: HTMLCanvasElement,
  action: MatchAction,
  onFinished: (score: number) => void,
): () => void {
  const maybeCtx = canvas.getContext('2d')
  if (!maybeCtx) return () => undefined
  const ctx = maybeCtx

  let dragging = false
  let ball = { x: 0, y: 0 }
  let origin = { x: 0, y: 0 }
  let flying: { vx: number; vy: number; active: boolean } | null = null
  let launchVx = 0
  let launchVy = 0
  let settled = false
  let raf = 0
  let keeperX = 0
  let keeperDir = 1
  let message =
    action === 'shoot'
      ? 'Naciągnij i strzel w bramkę (omijaj bramkarza)'
      : 'Naciągnij i podaj do kolegi w żółtej strefie'

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
    return { x: w * 0.22, y: 28, w: w * 0.56, h: 56 }
  }

  function teammate(): { x: number; y: number; r: number } {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    return { x: w * 0.72, y: h * 0.38, r: 28 }
  }

  function scoreShot(): number {
    const g = goalRect()
    const inGoal =
      ball.x >= g.x && ball.x <= g.x + g.w && ball.y >= g.y && ball.y <= g.y + g.h + 20
    if (!inGoal) {
      // bliskość do środka bramki
      const cx = g.x + g.w / 2
      const cy = g.y + g.h / 2
      const d = Math.hypot(ball.x - cx, ball.y - cy)
      return Math.max(5, 55 - d / 3)
    }
    const saved = Math.abs(ball.x - keeperX) < 26
    if (saved) return 28 + Math.random() * 12
    const center = g.x + g.w / 2
    const accuracy = 100 - Math.abs(ball.x - center) / (g.w / 2) * 35
    return Math.max(70, Math.min(100, accuracy))
  }

  function scorePass(): number {
    const t = teammate()
    const d = dist(ball, t)
    if (d <= t.r) return 88 + Math.random() * 12
    if (d <= t.r * 2.2) return 65 + Math.random() * 15
    return Math.max(10, 55 - d / 2.5)
  }

  function finish(): void {
    if (settled) return
    settled = true
    const score = action === 'shoot' ? scoreShot() : scorePass()
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
    const maxPull = 95
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
    const speed = Math.min(19, power / 4)
    launchVx = (pullX / power) * speed
    launchVy = (pullY / power) * speed
    flying = { vx: launchVx, vy: launchVy, active: true }
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

    if (action === 'shoot') {
      const g = goalRect()
      ctx.fillStyle = 'rgba(244,247,245,0.12)'
      ctx.fillRect(g.x, g.y, g.w, g.h)
      ctx.strokeStyle = 'rgba(244,247,245,0.7)'
      ctx.lineWidth = 3
      ctx.strokeRect(g.x, g.y, g.w, g.h)
      // siatka
      ctx.strokeStyle = 'rgba(244,247,245,0.2)'
      ctx.lineWidth = 1
      for (let i = 1; i < 4; i++) {
        const x = g.x + (g.w * i) / 4
        ctx.beginPath()
        ctx.moveTo(x, g.y)
        ctx.lineTo(x, g.y + g.h)
        ctx.stroke()
      }
      // bramkarz
      ctx.fillStyle = '#ff7a6e'
      ctx.fillRect(keeperX - 16, g.y + g.h - 8, 32, 14)
      ctx.beginPath()
      ctx.arc(keeperX, g.y + g.h - 14, 10, 0, Math.PI * 2)
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
    ctx.font = '600 14px "Source Sans 3", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(message, w / 2, h - 18)
  }

  function tick(): void {
    if (!settled && action === 'shoot' && !dragging) {
      const g = goalRect()
      keeperX += keeperDir * 1.6
      if (keeperX > g.x + g.w - 20) keeperDir = -1
      if (keeperX < g.x + 20) keeperDir = 1
    }

    if (flying?.active) {
      ball.x += flying.vx
      ball.y += flying.vy
      flying.vy += 0.16
      flying.vx *= 0.995
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const g = goalRect()
      const hitGoalLine = action === 'shoot' && ball.y <= g.y + g.h && ball.y >= g.y - 10
      const hitTeammate = action === 'pass' && dist(ball, teammate()) <= teammate().r + 8
      const out =
        ball.x < 8 || ball.x > w - 8 || ball.y < 8 || ball.y > h - 8 || Math.hypot(flying.vx, flying.vy) < 0.65
      if (hitGoalLine || hitTeammate || out) finish()
    }

    draw()
    if (!settled) raf = requestAnimationFrame(tick)
    else draw()
  }

  resize()
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
