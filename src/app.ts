import {
  getClub,
  getLeague,
  formatStars,
} from './data/clubs'
import {
  assignSlot,
  autoPickLineup,
  confirmLineupAndPlay,
  confirmManagerName,
  dismissMatchResult,
  openLineup,
  playNextMatchFromHub,
  polishLeagues,
  resolveMomentChoice,
  resolveMomentMinigame,
  selectClub,
  setFormation,
  setStyle,
  standingsAroundPlayer,
  playerTablePosition,
  startManagerCreate,
  startNextSeason,
  finalizeSeason,
} from './systems/managerCareer'
import { nextRoundFixtures, yourFixtureInRound } from './systems/leagueSim'
import { averageStarterOvr, starters } from './systems/squadGen'
import { actionLabel, mountMatchMoment } from './systems/matchMoment'
import { clearSave, hasSave, loadState, saveState } from './state/gameState'
import type {
  Formation,
  GameState,
  MatchAction,
  TacticalStyle,
} from './state/types'
import {
  createEmptyState,
  formationPlan,
  formArrowHtml,
  ROLE_FULL,
  styleLabel,
} from './state/types'

export class App {
  private root: HTMLElement
  private state: GameState
  private cleanupMoment: (() => void) | null = null
  private pickLeagueId: string | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.state = hasSave() ? loadState() : createEmptyState()
    if (!this.state.manager || !this.state.team) this.state.screen = 'home'
  }

  start(): void {
    this.render()
  }

  private persist(): void {
    if (this.state.manager && this.state.team) saveState(this.state)
  }

  private go(mutate: () => void): void {
    this.cleanupMoment?.()
    this.cleanupMoment = null
    mutate()
    this.persist()
    this.render()
  }

  private shell(body: string, title: string, wide = false): string {
    return `
      <div class="app-shell${wide ? ' wide' : ''}">
        <header class="topbar">
          <div class="brand">GRA TRENERA</div>
          <div class="topbar-title">${title}</div>
        </header>
        <main class="content">${body}</main>
      </div>`
  }

  private render(): void {
    switch (this.state.screen) {
      case 'home':
        this.root.innerHTML = this.homeHtml()
        this.bindHome()
        break
      case 'createManager':
        this.root.innerHTML = this.createManagerHtml()
        this.bindCreateManager()
        break
      case 'pickClub':
        this.root.innerHTML = this.pickClubHtml()
        this.bindPickClub()
        break
      case 'hub':
        this.root.innerHTML = this.hubHtml()
        this.bindHub()
        break
      case 'lineup':
        this.root.innerHTML = this.lineupHtml()
        this.bindLineup()
        break
      case 'matchMoment':
        this.root.innerHTML = this.matchMomentHtml()
        this.bindMatchMoment()
        break
      case 'matchResult':
        this.root.innerHTML = this.matchResultHtml()
        this.bindMatchResult()
        break
      case 'seasonReport':
        this.root.innerHTML = this.seasonReportHtml()
        this.bindSeasonReport()
        break
      default:
        this.state.screen = 'home'
        this.render()
    }
  }

  private homeHtml(): string {
    const canContinue = hasSave()
    return this.shell(
      `
      <section class="hero-panel">
        <h1>Prowadź zespół</h1>
        <p class="muted">Wybierz klub, ustaw skład i taktykę, graj sezon ligowy mecz po meczu.</p>
        <div class="actions">
          ${canContinue ? `<button class="btn primary" id="btn-continue">Kontynuuj</button>` : ''}
          <button class="btn ${canContinue ? 'ghost' : 'primary'}" id="btn-new">Nowa kariera</button>
        </div>
      </section>`,
      'Menu',
    )
  }

  private bindHome(): void {
    this.root.querySelector('#btn-continue')?.addEventListener('click', () => {
      this.state = loadState()
      if (!this.state.manager) this.state.screen = 'home'
      else if (this.state.screen === 'home') this.state.screen = 'hub'
      this.render()
    })
    this.root.querySelector('#btn-new')?.addEventListener('click', () => {
      clearSave()
      this.state = createEmptyState()
      this.go(() => startManagerCreate(this.state))
    })
  }

  private createManagerHtml(): string {
    return this.shell(
      `
      <section class="panel">
        <h2>Twój profil</h2>
        <p class="muted">Jak masz na imię, trenerze?</p>
        <label class="field">
          <span>Imię i nazwisko</span>
          <input id="mgr-name" maxlength="32" placeholder="np. Adam Nawałka" value="${this.state.draftManagerName}" />
        </label>
        <div class="actions">
          <button class="btn primary" id="btn-mgr-next">Dalej — wybór klubu</button>
        </div>
      </section>`,
      'Trener',
    )
  }

  private bindCreateManager(): void {
    this.root.querySelector('#btn-mgr-next')?.addEventListener('click', () => {
      const name =
        this.root.querySelector<HTMLInputElement>('#mgr-name')?.value ?? 'Trener'
      this.go(() => confirmManagerName(this.state, name))
    })
  }

  private pickClubHtml(): string {
    const leagues = polishLeagues()
    if (!this.pickLeagueId) this.pickLeagueId = leagues[0]?.id ?? null
    const league = leagues.find((l) => l.id === this.pickLeagueId) ?? leagues[0]
    const tabs = leagues
      .map(
        (l) =>
          `<button class="btn ghost tab ${l.id === league?.id ? 'active' : ''}" data-league="${l.id}">${l.name}</button>`,
      )
      .join('')
    const clubs = (league?.clubIds ?? [])
      .map((id) => {
        const c = getClub(id)
        return `<button class="club-pick" data-club="${id}">
          <strong>${c.name}</strong>
          <span class="muted">${formatStars(c.stars)} · siła ${c.strength}</span>
        </button>`
      })
      .join('')
    return this.shell(
      `
      <section class="panel">
        <h2>Wybierz klub</h2>
        <p class="muted">Dowolny klub z lig polskich. Później awansujesz lub spadniesz z zespołem.</p>
        <div class="league-tabs">${tabs}</div>
        <div class="club-list">${clubs}</div>
      </section>`,
      'Klub',
    )
  }

  private bindPickClub(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-league]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.pickLeagueId = btn.dataset.league!
        this.render()
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-club]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => selectClub(this.state, btn.dataset.club!))
      })
    })
  }

  private hubHtml(): string {
    const m = this.state.manager!
    const team = this.state.team!
    const s = this.state.season!
    const club = getClub(s.clubId)
    const league = getLeague(s.leagueId)
    const place = playerTablePosition(s)
    const around = standingsAroundPlayer(s, 3)
    const round = nextRoundFixtures(s)
    const yourFix = round ? yourFixtureInRound(s, round) : null
    const chem = Math.round(team.teamChemistry)
    const xiOvr = Math.round(averageStarterOvr(team))

    const tableRows = [
      around.showTopEllipsis ? `<tr class="ellipsis"><td colspan="3">…</td></tr>` : '',
      ...around.rows.map((row, i) => {
        const pos = around.from + i + 1
        const you = row.clubId === s.clubId
        return `<tr class="${you ? 'you' : ''}"><td>${pos}</td><td>${getClub(row.clubId).short}${you ? ' · Ty' : ''}</td><td>${row.points}</td></tr>`
      }),
      around.showBottomEllipsis ? `<tr class="ellipsis"><td colspan="3">…</td></tr>` : '',
    ].join('')

    const nextLine = yourFix
      ? `<p class="meta">Kolejka ${s.roundIndex + 1}/${s.rounds.length}: <strong>${getClub(yourFix.homeId).name}</strong> vs <strong>${getClub(yourFix.awayId).name}</strong></p>`
      : s.phase === 'done'
        ? `<p class="muted">Sezon zakończony.</p>`
        : `<p class="muted">Brak Twojego meczu w tej kolejce.</p>`

    const log = this.state.log
      .slice(0, 5)
      .map((l) => `<li>${l}</li>`)
      .join('')

    const topXi = starters(team)
      .slice(0, 5)
      .map((p) => `${p.name.split(' ').pop()} ${p.overall}`)
      .join(' · ')

    return this.shell(
      `
      <section class="panel player-card">
        <div class="player-head">
          <div>
            <h2>${club.name}</h2>
            <p class="muted">${m.name} · ${league.name} · sezon ${s.year}</p>
          </div>
          <div class="money">${formatStars(club.stars)}</div>
        </div>
        <p class="meta">Miejsce <strong>${place}.</strong> · bilans ${s.record.won}-${s.record.drawn}-${s.record.lost} · chemia <strong>${chem}</strong> · XI ≈ <strong>${xiOvr}</strong> OVR</p>
        <p class="muted">Taktyka: ${team.tactics.formation} · ${styleLabel(team.tactics.style)}</p>
        <p class="muted">XI: ${topXi}…</p>
      </section>

      <section class="panel">
        <h3>${league.name}</h3>
        ${nextLine}
        <table class="mini-table">
          <thead><tr><th>#</th><th>Klub</th><th>Pkt</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div class="actions" style="margin-top:14px">
          ${
            s.phase === 'playing'
              ? `<button class="btn primary" id="btn-match">Skład i mecz</button>
                 <button class="btn ghost" id="btn-lineup">Tylko skład</button>`
              : `<button class="btn primary" id="btn-end">Podsumowanie sezonu</button>`
          }
        </div>
      </section>

      <section class="panel">
        <h3>Dziennik</h3>
        <ul class="log">${log || '<li class="muted">Brak wpisów</li>'}</ul>
        <div class="actions"><button class="btn ghost danger" id="btn-reset">Nowa gra</button></div>
      </section>`,
      club.short,
      true,
    )
  }

  private bindHub(): void {
    this.root.querySelector('#btn-match')?.addEventListener('click', () => {
      this.go(() => playNextMatchFromHub(this.state))
    })
    this.root.querySelector('#btn-lineup')?.addEventListener('click', () => {
      this.go(() => openLineup(this.state))
    })
    this.root.querySelector('#btn-end')?.addEventListener('click', () => {
      this.go(() => finalizeSeason(this.state))
    })
    this.root.querySelector('#btn-reset')?.addEventListener('click', () => {
      if (!confirm('Na pewno zacząć od nowa?')) return
      clearSave()
      this.state = createEmptyState()
      this.state.screen = 'home'
      this.render()
    })
  }

  private lineupHtml(): string {
    const team = this.state.team!
    const plan = formationPlan(team.tactics.formation)
    const map = new Map(team.squad.map((p) => [p.id, p]))
    const formations: Formation[] = ['4-4-2', '4-3-3', '3-5-2']
    const styles: TacticalStyle[] = ['attack', 'balanced', 'defend']

    const pitchPlayers = team.startingIds
      .map((id, i) => {
        const p = map.get(id)!
        const slot = plan[i]!
        const mismatch = p.position !== slot.base
        const short = p.name.split(' ').pop() ?? p.name
        return `<div class="pitch-player ${mismatch ? 'mismatch' : ''}" draggable="true" data-drag="slot" data-slot="${i}" data-id="${id}" style="left:${slot.x}%;top:${slot.y}%" title="${p.name} · ${slot.role} (${ROLE_FULL[slot.role]}) · OVR ${p.overall}">
          <span class="pitch-role">${slot.role}</span>
          <span class="pitch-ovr">${p.overall}</span>
          ${formArrowHtml(p.form)}
          <span class="pitch-name">${short}</span>
        </div>`
      })
      .join('')

    const renderBenchBtn = (id: string, dim = false) => {
      const p = map.get(id)!
      return `<div class="bench-chip ${dim ? 'dim' : ''}" draggable="true" data-drag="bench" data-id="${id}" title="${p.name} · ${p.position}">
        <span class="slot-pos">${p.position}</span>
        <span class="bench-chip-body">
          <strong>${p.name.split(' ').pop()}</strong>
          <span class="muted">${p.overall} ${formArrowHtml(p.form)}</span>
        </span>
      </div>`
    }

    const bench = team.benchIds.map((id) => renderBenchBtn(id)).join('')
    const rest = team.squad
      .filter((p) => !team.startingIds.includes(p.id) && !team.benchIds.includes(p.id))
      .map((p) => renderBenchBtn(p.id, true))
      .join('')

    return this.shell(
      `
      <section class="panel lineup-panel">
        <div class="lineup-toolbar">
          <div>
            <h2>Skład i taktyka</h2>
            <p class="muted">Przeciągnij zawodników · LP = lewy pomocnik, ŚN = środkowy napastnik itd.</p>
          </div>
          <div class="lineup-toolbar-actions">
            <div class="tactics-row">
              ${formations
                .map(
                  (f) =>
                    `<button class="btn ghost ${team.tactics.formation === f ? 'active' : ''}" data-form="${f}">${f}</button>`,
                )
                .join('')}
            </div>
            <div class="tactics-row">
              ${styles
                .map(
                  (st) =>
                    `<button class="btn ghost ${team.tactics.style === st ? 'active' : ''}" data-style="${st}">${styleLabel(st)}</button>`,
                )
                .join('')}
            </div>
            <div class="actions compact">
              <button class="btn ghost" id="btn-auto">Auto</button>
              <button class="btn ghost" id="btn-back-hub">Wróć</button>
              <button class="btn primary" id="btn-play">Graj mecz</button>
            </div>
          </div>
        </div>
        <div class="lineup-layout">
          <div class="pitch" aria-label="Formacja ${team.tactics.formation}">
            <div class="pitch-markings"></div>
            ${pitchPlayers}
          </div>
          <aside class="bench-panel">
            <h3>Ławka</h3>
            <div class="bench-strip vertical" data-drop="bench">${bench}${rest}</div>
          </aside>
        </div>
      </section>`,
      'Skład',
      true,
    )
  }

  private bindLineup(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-form]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => setFormation(this.state, btn.dataset.form as Formation))
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => setStyle(this.state, btn.dataset.style as TacticalStyle))
      })
    })

    let dragPayload: { kind: 'slot' | 'bench'; slot?: number; id: string } | null = null

    const onDragStart = (el: HTMLElement, e: DragEvent) => {
      const kind = el.dataset.drag as 'slot' | 'bench'
      const id = el.dataset.id!
      const slot = el.dataset.slot != null ? Number(el.dataset.slot) : undefined
      dragPayload = { kind, id, slot }
      el.classList.add('dragging')
      e.dataTransfer?.setData('text/plain', id)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    }

    const onDragEnd = (el: HTMLElement) => {
      el.classList.remove('dragging')
      dragPayload = null
      this.root.querySelectorAll('.drag-over').forEach((n) => n.classList.remove('drag-over'))
    }

    this.root.querySelectorAll<HTMLElement>('[data-drag]').forEach((el) => {
      el.addEventListener('dragstart', (e) => onDragStart(el, e))
      el.addEventListener('dragend', () => onDragEnd(el))
    })

    this.root.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      el.addEventListener('dragover', (e) => {
        e.preventDefault()
        el.classList.add('drag-over')
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      })
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'))
      el.addEventListener('drop', (e) => {
        e.preventDefault()
        el.classList.remove('drag-over')
        const targetSlot = Number(el.dataset.slot)
        if (!dragPayload || Number.isNaN(targetSlot)) return
        if (dragPayload.kind === 'slot' && dragPayload.slot === targetSlot) return
        this.go(() => {
          if (dragPayload!.kind === 'slot' && dragPayload!.slot != null) {
            const team = this.state.team!
            const a = dragPayload!.slot
            const b = targetSlot
            const tmp = team.startingIds[a]!
            team.startingIds[a] = team.startingIds[b]!
            team.startingIds[b] = tmp
          } else {
            assignSlot(this.state, targetSlot, dragPayload!.id)
          }
        })
      })
    })

    const benchDrop = this.root.querySelector<HTMLElement>('[data-drop="bench"]')
    benchDrop?.addEventListener('dragover', (e) => {
      e.preventDefault()
      benchDrop.classList.add('drag-over')
    })
    benchDrop?.addEventListener('dragleave', () => benchDrop.classList.remove('drag-over'))
    benchDrop?.addEventListener('drop', (e) => {
      e.preventDefault()
      benchDrop.classList.remove('drag-over')
      if (!dragPayload || dragPayload.kind !== 'slot' || dragPayload.slot == null) return
      const fromSlot = dragPayload.slot
      const fromId = dragPayload.id
      this.go(() => {
        const team = this.state.team!
        const benchId = team.benchIds[0]
        if (!benchId) return
        assignSlot(this.state, fromSlot, benchId)
        // assignSlot puts fromId on bench; ensure order
        void fromId
      })
    })

    this.root.querySelector('#btn-auto')?.addEventListener('click', () => {
      this.go(() => autoPickLineup(this.state))
    })
    this.root.querySelector('#btn-back-hub')?.addEventListener('click', () => {
      this.go(() => {
        this.state.screen = 'hub'
      })
    })
    this.root.querySelector('#btn-play')?.addEventListener('click', () => {
      this.go(() => {
        const err = confirmLineupAndPlay(this.state)
        if (err) {
          pushTempAlert(err)
          this.state.screen = 'lineup'
        }
      })
    })
  }

  private matchMomentHtml(): string {
    const moment = this.state.season!.pendingMoment!
    if (moment.kind === 'choice') {
      const choices = (moment.choices ?? [])
        .map(
          (c) =>
            `<button class="chat-reply" data-choice="${c.id}"><span class="chat-reply-text">${c.label}</span><span class="chat-reply-hint">${c.hint}</span></button>`,
        )
        .join('')
      return this.shell(
        `
        <section class="panel">
          <h2>${moment.label}</h2>
          <p>${moment.description}</p>
          <p class="meta">${getClub(moment.homeId).short} ${moment.homeGoals}:${moment.awayGoals} ${getClub(moment.awayId).short}</p>
          <div class="chat-replies">${choices}</div>
        </section>`,
        'Decyzja',
      )
    }
    return this.shell(
      `
      <section class="panel">
        <h2>${moment.label}</h2>
        <p class="muted">${moment.description}</p>
        <p class="meta">${actionLabel(moment.action as MatchAction)} · ${getClub(moment.homeId).short} ${moment.homeGoals}:${moment.awayGoals} ${getClub(moment.awayId).short}</p>
        <canvas id="moment-canvas" width="480" height="320" class="moment-canvas"></canvas>
      </section>`,
      'Moment',
    )
  }

  private bindMatchMoment(): void {
    const moment = this.state.season!.pendingMoment!
    if (moment.kind === 'choice') {
      this.root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.go(() => resolveMomentChoice(this.state, btn.dataset.choice!))
        })
      })
      return
    }
    const canvas = this.root.querySelector<HTMLCanvasElement>('#moment-canvas')
    if (!canvas || !moment.action) return
    const opp = getClub(moment.opponentId)
    const diff = Math.min(1, Math.max(0, (opp.strength - 40) / 45))
    this.cleanupMoment = mountMatchMoment(
      canvas,
      moment.action,
      (score) => {
        this.go(() => resolveMomentMinigame(this.state, score))
      },
      { difficulty: diff },
    )
  }

  private matchResultHtml(): string {
    const r = this.state.season!.lastMatch!
    const ratings = r.keyRatings
      .map((x) => `<li>${x.name}: <strong>${x.rating}</strong></li>`)
      .join('')
    return this.shell(
      `
      <section class="panel">
        <h2>${getClub(r.homeId).short} ${r.homeGoals}:${r.awayGoals} ${getClub(r.awayId).short}</h2>
        <p>${r.narrative}</p>
        <p class="meta">Chemia: ${Math.round(r.chemistryAfter)}</p>
        <ul class="log">${ratings}</ul>
        <div class="actions">
          <button class="btn primary" id="btn-next">Dalej</button>
        </div>
      </section>`,
      'Wynik',
    )
  }

  private bindMatchResult(): void {
    this.root.querySelector('#btn-next')?.addEventListener('click', () => {
      this.go(() => dismissMatchResult(this.state))
    })
  }

  private seasonReportHtml(): string {
    const r = this.state.seasonReport!
    const league = getLeague(r.leagueId)
    const next =
      r.nextLeagueId && r.nextLeagueId !== r.leagueId
        ? getLeague(r.nextLeagueId).name
        : league.name
    return this.shell(
      `
      <section class="panel">
        <h2>Sezon ${r.year}</h2>
        <p class="meta">${league.name} · <strong>${r.place}.</strong> miejsce · ${r.points} pkt</p>
        <p>Bilans: ${r.record.won}-${r.record.drawn}-${r.record.lost} · bramki ${r.record.goalsFor}:${r.record.goalsAgainst}</p>
        <p>${r.narrative}</p>
        ${
          r.promotion
            ? `<p class="meta up">Awans → ${next}</p>`
            : r.relegation
              ? `<p class="meta down">Spadek → ${next}</p>`
              : `<p class="muted">Kolejny sezon: ${next}</p>`
        }
        <div class="actions">
          <button class="btn primary" id="btn-next-season">Nowy sezon</button>
        </div>
      </section>`,
      'Raport',
    )
  }

  private bindSeasonReport(): void {
    this.root.querySelector('#btn-next-season')?.addEventListener('click', () => {
      this.go(() => startNextSeason(this.state))
    })
  }
}

function pushTempAlert(msg: string): void {
  window.alert(msg)
}