import { getClub, getLeague, starterClubOptions } from './data/clubs'
import {
  acceptTransfer,
  applyBallTrainResult,
  applyDecision,
  continueAfterMatch,
  openWeekDecision,
  playerTablePosition,
  rejectTransfer,
  sortedStandings,
  startNewCareer,
  startNextSeason,
} from './systems/career'
import { mountBallTrain } from './systems/ballTrain'
import { clearSave, hasSave, loadState, saveState } from './state/gameState'
import type { GameState, Position, PreferredFoot } from './state/types'
import { createEmptyState, footLabel } from './state/types'

const POSITIONS: { id: Position; label: string }[] = [
  { id: 'NP', label: 'Napastnik' },
  { id: 'POM', label: 'Pomocnik' },
  { id: 'ŚO', label: 'Środkowy' },
  { id: 'OB', label: 'Obrońca' },
]

export class App {
  private root: HTMLElement
  private state: GameState
  private cleanupBall: (() => void) | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.state = hasSave() ? loadState() : createEmptyState()
    if (!this.state.player || !this.state.season) {
      this.state.screen = 'home'
    }
  }

  start(): void {
    this.render()
  }

  private persist(): void {
    if (this.state.player && this.state.season) saveState(this.state)
  }

  private go(mutate: () => void): void {
    this.cleanupBall?.()
    this.cleanupBall = null
    mutate()
    this.persist()
    this.render()
  }

  private render(): void {
    const { screen } = this.state
    switch (screen) {
      case 'home':
        this.root.innerHTML = this.homeHtml()
        this.bindHome()
        break
      case 'create':
        this.root.innerHTML = this.createHtml()
        this.bindCreate()
        break
      case 'hub':
        this.root.innerHTML = this.hubHtml()
        this.bindHub()
        break
      case 'decision':
        this.root.innerHTML = this.decisionHtml()
        this.bindDecision()
        break
      case 'match':
        this.root.innerHTML = this.matchHtml()
        this.bindMatch()
        break
      case 'transfer':
        this.root.innerHTML = this.transferHtml()
        this.bindTransfer()
        break
      case 'seasonEnd':
        this.root.innerHTML = this.seasonEndHtml()
        this.bindSeasonEnd()
        break
      case 'ballTrain':
        this.root.innerHTML = this.ballTrainHtml()
        this.bindBallTrain()
        break
    }
  }

  private shell(body: string, title?: string): string {
    return `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand">Kariera</div>
          ${title ? `<div class="topbar-title">${title}</div>` : ''}
        </header>
        <main class="content">${body}</main>
      </div>
    `
  }

  private homeHtml(): string {
    const canContinue = hasSave()
    return this.shell(`
      <section class="hero-panel">
        <p class="eyebrow">Symulator piłkarza</p>
        <h1>Twoja kariera zaczyna się tu</h1>
        <p class="lead">Decyzje tygodniowe, trening z piłką, mecze i kontrakty.</p>
        <div class="actions">
          ${canContinue ? `<button class="btn primary" id="btn-continue">Kontynuuj</button>` : ''}
          <button class="btn ${canContinue ? 'ghost' : 'primary'}" id="btn-new">Nowa gra</button>
        </div>
      </section>
    `)
  }

  private bindHome(): void {
    this.root.querySelector('#btn-continue')?.addEventListener('click', () => {
      this.state = loadState()
      if (!this.state.player) this.state.screen = 'create'
      else if (this.state.screen === 'home' || this.state.screen === 'create') this.state.screen = 'hub'
      this.render()
    })
    this.root.querySelector('#btn-new')?.addEventListener('click', () => {
      clearSave()
      this.state = createEmptyState()
      this.state.screen = 'create'
      this.render()
    })
  }

  private createHtml(): string {
    const options = POSITIONS.map(
      (p) => `<option value="${p.id}">${p.label}</option>`,
    ).join('')
    const clubs = starterClubOptions()
      .map(
        (c) =>
          `<option value="${c.clubId}" data-min="${c.minOverall}">${c.label} (min OVR ${c.minOverall})</option>`,
      )
      .join('')

    return this.shell(
      `
      <section class="panel">
        <h2>Nowy zawodnik</h2>
        <p class="muted">Ustaw profil startowy. Wyższy overall otwiera lepsze kluby.</p>

        <label class="field">
          <span>Imię i nazwisko</span>
          <input id="player-name" maxlength="24" placeholder="np. Jan Kowalski" autocomplete="off" />
        </label>

        <label class="field">
          <span>Pozycja</span>
          <select id="player-pos">${options}</select>
        </label>

        <label class="field">
          <span>Noga dominująca</span>
          <select id="player-foot">
            <option value="right">Prawa</option>
            <option value="left">Lewa</option>
            <option value="both">Obunożny</option>
          </select>
        </label>

        <label class="field">
          <span>Wiek: <strong id="age-val">17</strong></span>
          <input id="player-age" type="range" min="16" max="22" value="17" />
        </label>

        <label class="field">
          <span>Overall startowy: <strong id="ovr-val">52</strong></span>
          <input id="player-ovr" type="range" min="45" max="68" value="52" />
        </label>

        <label class="field">
          <span>Klub startowy</span>
          <select id="player-club">${clubs}</select>
        </label>
        <p class="hint" id="club-hint"></p>

        <div class="actions">
          <button class="btn primary" id="btn-start">Rozpocznij karierę</button>
          <button class="btn ghost" id="btn-back">Wróć</button>
        </div>
      </section>
    `,
      'Tworzenie',
    )
  }

  private bindCreate(): void {
    const ageInput = this.root.querySelector('#player-age') as HTMLInputElement
    const ovrInput = this.root.querySelector('#player-ovr') as HTMLInputElement
    const clubSelect = this.root.querySelector('#player-club') as HTMLSelectElement
    const ageVal = this.root.querySelector('#age-val')!
    const ovrVal = this.root.querySelector('#ovr-val')!
    const clubHint = this.root.querySelector('#club-hint')!

    const syncClubAvailability = () => {
      const ovr = Number(ovrInput.value)
      ovrVal.textContent = String(ovr)
      let firstValid: string | null = null
      for (const opt of Array.from(clubSelect.options)) {
        const min = Number(opt.dataset.min || 45)
        const ok = ovr >= min
        opt.disabled = !ok
        if (ok && !firstValid) firstValid = opt.value
      }
      if (clubSelect.selectedOptions[0]?.disabled && firstValid) {
        clubSelect.value = firstValid
      }
      const selected = clubSelect.selectedOptions[0]
      const min = Number(selected?.dataset.min || 45)
      clubHint.textContent =
        ovr < min
          ? 'Podnieś overall, żeby wybrać ten klub.'
          : min >= 58
            ? 'Start w II lidze — trudniejszy początek, lepsze zarobki.'
            : 'Klasyczny start w III lidze regionalnej.'
    }

    ageInput.addEventListener('input', () => {
      ageVal.textContent = ageInput.value
    })
    ovrInput.addEventListener('input', syncClubAvailability)
    clubSelect.addEventListener('change', syncClubAvailability)
    syncClubAvailability()

    this.root.querySelector('#btn-back')?.addEventListener('click', () => {
      this.go(() => {
        this.state.screen = 'home'
      })
    })
    this.root.querySelector('#btn-start')?.addEventListener('click', () => {
      const name = (this.root.querySelector('#player-name') as HTMLInputElement).value
      const position = (this.root.querySelector('#player-pos') as HTMLSelectElement)
        .value as Position
      const preferredFoot = (this.root.querySelector('#player-foot') as HTMLSelectElement)
        .value as PreferredFoot
      const age = Number(ageInput.value)
      const overall = Number(ovrInput.value)
      const clubId = clubSelect.value
      const min = Number(clubSelect.selectedOptions[0]?.dataset.min || 45)
      if (overall < min) {
        clubHint.textContent = 'Ten klub wymaga wyższego overall.'
        return
      }
      this.go(() =>
        startNewCareer(this.state, {
          name,
          position,
          preferredFoot,
          age,
          overall,
          clubId,
        }),
      )
    })
  }

  private hubHtml(): string {
    const p = this.state.player!
    const s = this.state.season!
    const club = getClub(s.clubId)
    const league = getLeague(s.leagueId)
    const place = playerTablePosition(s)
    const trained = s.ballTrainedWeek === s.week
    const table = sortedStandings(s)
      .slice(0, 8)
      .map((row, i) => {
        const c = getClub(row.clubId)
        const mine = row.clubId === s.clubId ? ' mine' : ''
        return `<tr class="${mine}"><td>${i + 1}</td><td>${c.short}</td><td>${row.played}</td><td>${row.points}</td></tr>`
      })
      .join('')

    const attrs = `
      <div class="stat-grid">
        <div><span>OVR</span><strong>${p.overall}</strong></div>
        <div><span>Tempo</span><strong>${p.attrs.pace}</strong></div>
        <div><span>Strzał</span><strong>${p.attrs.shooting}</strong></div>
        <div><span>Podanie</span><strong>${p.attrs.passing}</strong></div>
        <div><span>Obrona</span><strong>${p.attrs.defending}</strong></div>
        <div><span>Kondycja</span><strong>${p.attrs.stamina}</strong></div>
        <div><span>Forma</span><strong>${p.form}</strong></div>
        <div><span>Morale</span><strong>${p.morale}</strong></div>
      </div>
    `

    const log = this.state.log
      .slice(0, 5)
      .map((l) => `<li>${l}</li>`)
      .join('')

    return this.shell(
      `
      <section class="panel player-card">
        <div class="player-head">
          <div>
            <h2>${p.name}</h2>
            <p class="muted">${p.position} · ${footLabel(p.preferredFoot)} · ${p.age} lat · ${club.name}</p>
          </div>
          <div class="money">${p.money} zł</div>
        </div>
        <p class="meta">${league.name} · kolejka ${s.week}/${s.maxWeeks} · miejsce ${place} · reputacja ${p.reputation}</p>
        ${attrs}
      </section>

      <section class="panel">
        <h3>Tydzień ${s.week}</h3>
        <p class="muted">Trening z piłką raz na kolejkę, potem decyzja i mecz.</p>
        <div class="actions">
          <button class="btn ghost" id="btn-ball" ${trained ? 'disabled' : ''}>
            ${trained ? 'Trening z piłką zrobiony' : 'Trening z piłką'}
          </button>
          <button class="btn primary" id="btn-week">Przejdź do decyzji</button>
        </div>
      </section>

      <section class="panel">
        <h3>Tabela</h3>
        <table class="table">
          <thead><tr><th>#</th><th>Klub</th><th>M</th><th>Pkt</th></tr></thead>
          <tbody>${table}</tbody>
        </table>
      </section>

      <section class="panel">
        <h3>Ostatnie wydarzenia</h3>
        <ul class="log">${log || '<li class="muted">Brak wpisów</li>'}</ul>
        <div class="actions">
          <button class="btn ghost danger" id="btn-reset">Nowa gra</button>
        </div>
      </section>
    `,
      club.short,
    )
  }

  private bindHub(): void {
    this.root.querySelector('#btn-week')?.addEventListener('click', () => {
      this.go(() => openWeekDecision(this.state))
    })
    this.root.querySelector('#btn-ball')?.addEventListener('click', () => {
      this.go(() => {
        this.state.screen = 'ballTrain'
      })
    })
    this.root.querySelector('#btn-reset')?.addEventListener('click', () => {
      if (!confirm('Na pewno zacząć od nowa? Zapis zostanie usunięty.')) return
      clearSave()
      this.state = createEmptyState()
      this.state.screen = 'home'
      this.render()
    })
  }

  private ballTrainHtml(): string {
    return this.shell(
      `
      <section class="panel">
        <h2>Trening z piłką</h2>
        <p class="muted">Naciągnij piłkę i puść w kierunku zielonej strzałki. 3 próby.</p>
        <div class="ball-wrap">
          <canvas id="ball-canvas"></canvas>
        </div>
        <div class="actions">
          <button class="btn ghost" id="btn-skip-ball">Pomiń</button>
        </div>
      </section>
    `,
      'Mini-gra',
    )
  }

  private bindBallTrain(): void {
    const canvas = this.root.querySelector('#ball-canvas') as HTMLCanvasElement
    this.cleanupBall = mountBallTrain(canvas, (avg, best, attempts) => {
      this.go(() =>
        applyBallTrainResult(this.state, {
          avgScore: avg,
          bestScore: best,
          attempts,
        }),
      )
    })
    this.root.querySelector('#btn-skip-ball')?.addEventListener('click', () => {
      this.go(() => {
        this.state.screen = 'hub'
      })
    })
  }

  private decisionHtml(): string {
    const d = this.state.pendingDecision!
    const choices = d.choices
      .map(
        (c) => `
        <button class="choice" data-choice="${c.id}">
          <strong>${c.label}</strong>
          <span>${c.hint}</span>
        </button>`,
      )
      .join('')

    return this.shell(
      `
      <section class="panel">
        <h2>${d.title}</h2>
        <p>${d.description}</p>
        <div class="choices">${choices}</div>
      </section>
    `,
      'Decyzja',
    )
  }

  private bindDecision(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.choice!
        this.go(() => applyDecision(this.state, id))
      })
    })
  }

  private matchHtml(): string {
    const m = this.state.lastMatch!
    const home = getClub(m.homeId)
    const away = getClub(m.awayId)
    const s = this.state.season!

    return this.shell(
      `
      <section class="panel match-panel">
        <p class="eyebrow">Kolejka ${s.week}</p>
        <div class="scoreboard">
          <div class="side">
            <span class="club">${home.name}</span>
            <strong>${m.homeGoals}</strong>
          </div>
          <div class="vs">:</div>
          <div class="side">
            <strong>${m.awayGoals}</strong>
            <span class="club">${away.name}</span>
          </div>
        </div>
        <p class="narrative">${m.narrative}</p>
        <div class="stat-grid compact">
          <div><span>Występ</span><strong>${m.playerStarted ? 'Tak' : 'Ławka'}</strong></div>
          <div><span>Ocena</span><strong>${m.playerStarted ? m.playerRating.toFixed(1) : '—'}</strong></div>
          <div><span>Gole</span><strong>${m.playerGoals}</strong></div>
          <div><span>Asysty</span><strong>${m.playerAssists}</strong></div>
        </div>
        <div class="actions">
          <button class="btn primary" id="btn-after-match">Dalej</button>
        </div>
      </section>
    `,
      'Mecz',
    )
  }

  private bindMatch(): void {
    this.root.querySelector('#btn-after-match')?.addEventListener('click', () => {
      this.go(() => continueAfterMatch(this.state))
    })
  }

  private transferHtml(): string {
    const offer = this.state.pendingTransfer!
    const club = getClub(offer.clubId)
    return this.shell(
      `
      <section class="panel">
        <h2>Oferta transferowa</h2>
        <p>${offer.message}</p>
        <div class="offer-card">
          <h3>${club.name}</h3>
          <p>Pensja tygodniowa ok. <strong>${offer.wage} zł</strong></p>
          <p>Premia za podpis: <strong>${offer.signingBonus} zł</strong></p>
        </div>
        <div class="actions">
          <button class="btn primary" id="btn-accept">Akceptuj</button>
          <button class="btn ghost" id="btn-reject">Odrzuć</button>
        </div>
      </section>
    `,
      'Transfer',
    )
  }

  private bindTransfer(): void {
    this.root.querySelector('#btn-accept')?.addEventListener('click', () => {
      this.go(() => acceptTransfer(this.state))
    })
    this.root.querySelector('#btn-reject')?.addEventListener('click', () => {
      this.go(() => rejectTransfer(this.state))
    })
  }

  private seasonEndHtml(): string {
    const s = this.state.season!
    const club = getClub(s.clubId)
    return this.shell(
      `
      <section class="panel">
        <h2>Koniec sezonu</h2>
        <p>${this.state.seasonSummary ?? ''}</p>
        <p class="muted">Następny sezon: ${club.name} (${getLeague(s.leagueId).name}).</p>
        <div class="actions">
          <button class="btn primary" id="btn-next-season">Rozpocznij kolejny sezon</button>
        </div>
      </section>
    `,
      'Sezon',
    )
  }

  private bindSeasonEnd(): void {
    this.root.querySelector('#btn-next-season')?.addEventListener('click', () => {
      this.go(() => startNextSeason(this.state))
    })
  }
}
