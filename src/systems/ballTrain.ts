/**
 * Mini-gra: naciągnij piłkę (slingshot) i puść w stronę celu.
 * Wynik 0–100 zależy od dokładności kierunku.
 */
export function mountBallTrain(
  canvas: HTMLCanvasElement,
  onFinished: (avgScore: number, bestScore: number, attempts: number) => void,
): () => void {
  const maybeCtx = canvas.getContext('2d')
  if (!maybeCtx) return () => undefined
  const ctx = maybeCtx

  const MAX_ATTEMPTS = 3
  const scores: number[] = []
  let attempt = 0
  let targetAngle = randomTarget()
  let dragging = false
  let ball = { x: 0, y: 0 }
  let origin = { x: 0, y: 0 }
  let flying: { vx: number; vy: number; active: boolean } | null = null
  let launchVx = 0
  let launchVy = 0
  let message = 'Naciągnij piłkę i puść w stronę strzałki'
  let settled = false
  let raf = 0

  function randomTarget(): number {
    const deg = -50 + Math.random() * 100
    return ((-90 + deg) * Math.PI) / 180
  }

  function resize(): void {
    const parent = canvas.parentElement
    const w = Math.min(480, parent?.clientWidth ?? 360)
    const h = Math.round(w * 1.15)
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    origin = { x: w / 2, y: h * 0.78 }
    if (!flying?.active) ball = { ...origin }
  }

  function pointerPos(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function scoreShot(vx: number, vy: number): number {
    const shotAngle = Math.atan2(vy, vx)
    let diff = Math.abs(shotAngle - targetAngle)
    while (diff > Math.PI) diff -= Math.PI * 2
    diff = Math.abs(diff)
    const errorDeg = (diff * 180) / Math.PI
    return Math.max(0, Math.min(100, 100 - errorDeg * 2.2))
  }

  function finishAttempt(score: number): void {
    scores.push(score)
    attempt++
    message = `Próba ${attempt}/${MAX_ATTEMPTS}: ${Math.round(score)}%`
    flying = null
    ball = { ...origin }
    if (attempt >= MAX_ATTEMPTS) {
      settled = true
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      const best = Math.max(...scores)
      message = `Koniec treningu · średnia ${Math.round(avg)}%`
      window.setTimeout(() => onFinished(avg, best, scores.length), 650)
      return
    }
    targetAngle = randomTarget()
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
    const maxPull = 90
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
    const speed = Math.min(18, power / 4.2)
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

    ctx.strokeStyle = 'rgba(244,247,245,0.25)'
    ctx.lineWidth = 2
    ctx.strokeRect(12, 12, w - 24, h - 24)

    const tx = origin.x + Math.cos(targetAngle) * (h * 0.42)
    const ty = origin.y + Math.sin(targetAngle) * (h * 0.42)
    ctx.strokeStyle = '#c8f560'
    ctx.fillStyle = '#c8f560'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(origin.x, origin.y)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(tx - Math.cos(targetAngle - 0.4) * 14, ty - Math.sin(targetAngle - 0.4) * 14)
    ctx.lineTo(tx - Math.cos(targetAngle + 0.4) * 14, ty - Math.sin(targetAngle + 0.4) * 14)
    ctx.closePath()
    ctx.fill()

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
    ctx.arc(ball.x, ball.y, 16, 0, Math.PI * 2)
    ctx.fillStyle = '#f4f7f5'
    ctx.fill()
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
      const px = ball.x + Math.cos(a) * 7
      const py = ball.y + Math.sin(a) * 7
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = '#0b3d2e'
    ctx.fill()

    ctx.fillStyle = 'rgba(242,246,243,0.92)'
    ctx.font = '600 14px "Source Sans 3", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(message, w / 2, 36)
    ctx.fillText(`Próba ${Math.min(attempt + 1, MAX_ATTEMPTS)}/${MAX_ATTEMPTS}`, w / 2, 56)
  }

  function tick(): void {
    if (flying?.active) {
      ball.x += flying.vx
      ball.y += flying.vy
      flying.vy += 0.18
      flying.vx *= 0.995
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const out =
        ball.x < 16 ||
        ball.x > w - 16 ||
        ball.y < 16 ||
        ball.y > h - 16 ||
        Math.hypot(flying.vx, flying.vy) < 0.7
      if (out) finishAttempt(scoreShot(launchVx, launchVy))
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
