import { getClub, getLeague, starterClubOptions } from './data/clubs'
import {
  acceptOffer,
  applyPreseasonDecision,
  openPreseasonDecision,
  openTransferChoice,
  resolveKeyMatch,
  runFullSeason,
  sortedStandings,
  startNewCareer,
  stayAtClub,
} from './systems/career'
import { appearanceChance } from './systems/seasonSim'
import { mountMatchMoment } from './systems/matchMoment'
import { clearSave, hasSave, loadState, saveState } from './state/gameState'
import type { GameState, MatchAction, Position, PreferredFoot } from './state/types'
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
  private cleanupMoment: (() => void) | null = null
  private selectedAction: MatchAction | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.state = hasSave() ? loadState() : createEmptyState()
    if (!this.state.player || !this.state.season) this.state.screen = 'home'
  }

  start(): void {
    this.render()
  }

  private persist(): void {
    if (this.state.player && this.state.season) saveState(this.state)
  }

  private go(mutate: () => void): void {
    this.cleanupMoment?.()
    this.cleanupMoment = null
    mutate()
    this.persist()
    this.render()
  }

  private render(): void {
    switch (this.state.screen) {
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
      case 'keyMatch':
        this.root.innerHTML = this.keyMatchHtml()
        this.bindKeyMatch()
        break
      case 'seasonReport':
        this.root.innerHTML = this.seasonReportHtml()
        this.bindSeasonReport()
        break
      case 'transferChoice':
        this.root.innerHTML = this.transferChoiceHtml()
        this.bindTransferChoice()
        break
      case 'seasonEnd':
        this.state.screen = 'hub'
        this.render()
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
        <h1>Sezon w jeden ruch</h1>
        <p class="lead">Symulujesz cały sezon, oglądasz statystyki, Puchar Polski i króla strzelców. Kluczowe mecze rozgrywasz Ty.</p>
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
    const options = POSITIONS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')
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
        <p class="muted">Ustaw profil. Wyższy overall = I liga / Ekstraklasa.</p>
        <label class="field"><span>Imię i nazwisko</span>
          <input id="player-name" maxlength="24" placeholder="np. Jan Kowalski" autocomplete="off" /></label>
        <label class="field"><span>Pozycja</span><select id="player-pos">${options}</select></label>
        <label class="field"><span>Noga dominująca</span>
          <select id="player-foot">
            <option value="right">Prawa</option>
            <option value="left">Lewa</option>
            <option value="both">Obunożny</option>
          </select></label>
        <label class="field"><span>Wiek: <strong id="age-val">17</strong></span>
          <input id="player-age" type="range" min="16" max="22" value="17" /></label>
        <label class="field"><span>Overall: <strong id="ovr-val">52</strong></span>
          <input id="player-ovr" type="range" min="45" max="68" value="52" /></label>
        <label class="field"><span>Klub startowy</span><select id="player-club">${clubs}</select></label>
        <p class="hint" id="club-hint"></p>
        <div class="actions">
          <button class="btn primary" id="btn-start">Rozpocznij karierę</button>
          <button class="btn ghost" id="btn-back">Wróć</button>
        </div>
      </section>`,
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

    const sync = () => {
      const ovr = Number(ovrInput.value)
      ovrVal.textContent = String(ovr)
      let firstValid: string | null = null
      for (const opt of Array.from(clubSelect.options)) {
        const min = Number(opt.dataset.min || 45)
        opt.disabled = ovr < min
        if (ovr >= min && !firstValid) firstValid = opt.value
      }
      if (clubSelect.selectedOptions[0]?.disabled && firstValid) clubSelect.value = firstValid
      const min = Number(clubSelect.selectedOptions[0]?.dataset.min || 45)
      clubHint.textContent =
        ovr < min
          ? 'Podnieś overall, żeby wybrać ten klub.'
          : min >= 64
            ? 'Start w Ekstraklasie.'
            : min >= 56
              ? 'Start w I lidze.'
              : 'Start w III lidze.'
    }
    ageInput.addEventListener('input', () => {
      ageVal.textContent = ageInput.value
    })
    ovrInput.addEventListener('input', sync)
    clubSelect.addEventListener('change', sync)
    sync()

    this.root.querySelector('#btn-back')?.addEventListener('click', () => {
      this.go(() => {
        this.state.screen = 'home'
      })
    })
    this.root.querySelector('#btn-start')?.addEventListener('click', () => {
      const overall = Number(ovrInput.value)
      const min = Number(clubSelect.selectedOptions[0]?.dataset.min || 45)
      if (overall < min) return
      this.go(() =>
        startNewCareer(this.state, {
          name: (this.root.querySelector('#player-name') as HTMLInputElement).value,
          position: (this.root.querySelector('#player-pos') as HTMLSelectElement).value as Position,
          preferredFoot: (this.root.querySelector('#player-foot') as HTMLSelectElement)
            .value as PreferredFoot,
          age: Number(ageInput.value),
          overall,
          clubId: clubSelect.value,
        }),
      )
    })
  }

  private hubHtml(): string {
    const p = this.state.player!
    const s = this.state.season!
    const club = getClub(s.clubId)
    const league = getLeague(s.leagueId)
    const chance = Math.round(appearanceChance(p) * 100)
    const log = this.state.log
      .slice(0, 4)
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
        <p class="meta">${league.name} · sezon ${s.year} · szansa na grę ≈ ${chance}%</p>
        <div class="stat-grid">
          <div><span>OVR</span><strong>${p.overall}</strong></div>
          <div><span>Morale</span><strong>${p.morale}</strong></div>
          <div><span>Rep.</span><strong>${p.reputation}</strong></div>
          <div><span>Kondycja</span><strong>${p.attrs.stamina}</strong></div>
          <div><span>Tempo</span><strong>${p.attrs.pace}</strong></div>
          <div><span>Strzał</span><strong>${p.attrs.shooting}</strong></div>
          <div><span>Podanie</span><strong>${p.attrs.passing}</strong></div>
          <div><span>Obrona</span><strong>${p.attrs.defending}</strong></div>
        </div>
      </section>

      <section class="panel">
        <h3>Sezon ${s.year}</h3>
        <p class="muted">Szansa na występy zależy od OVR, reputacji i morale. Forma sezonu wychodzi z goli, ocen i losu — nie jest stałą cechą.</p>
        <div class="actions">
          ${
            s.preseasonDone
              ? ''
              : `<button class="btn ghost" id="btn-pre">Decyzja przed sezonem</button>`
          }
          <button class="btn primary" id="btn-season">Dalej — rozegraj sezon</button>
        </div>
      </section>

      <section class="panel">
        <h3>Dziennik</h3>
        <ul class="log">${log || '<li class="muted">Brak wpisów</li>'}</ul>
        <div class="actions"><button class="btn ghost danger" id="btn-reset">Nowa gra</button></div>
      </section>
    `,
      club.short,
    )
  }

  private bindHub(): void {
    this.root.querySelector('#btn-pre')?.addEventListener('click', () => {
      this.go(() => openPreseasonDecision(this.state))
    })
    this.root.querySelector('#btn-season')?.addEventListener('click', () => {
      this.go(() => runFullSeason(this.state))
    })
    this.root.querySelector('#btn-reset')?.addEventListener('click', () => {
      if (!confirm('Na pewno zacząć od nowa?')) return
      clearSave()
      this.state = createEmptyState()
      this.state.screen = 'home'
      this.render()
    })
  }

  private decisionHtml(): string {
    const d = this.state.pendingDecision!
    const choices = d.choices
      .map(
        (c) =>
          `<button class="choice" data-choice="${c.id}"><strong>${c.label}</strong><span>${c.hint}</span></button>`,
      )
      .join('')
    return this.shell(
      `<section class="panel"><h2>${d.title}</h2><p>${d.description}</p><div class="choices">${choices}</div></section>`,
      'Przed sezonem',
    )
  }

  private bindDecision(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => applyPreseasonDecision(this.state, btn.dataset.choice!))
      })
    })
  }

  private keyMatchHtml(): string {
    const k = this.state.pendingKeyMatch!
    const home = getClub(k.homeId)
    const away = getClub(k.awayId)
    if (!this.selectedAction) {
      return this.shell(
        `
        <section class="panel">
          <p class="eyebrow">${k.label}</p>
          <h2>${home.name} vs ${away.name}</h2>
          <p>${k.description}</p>
          <p class="muted">Wybierz kluczową akcję sezonu:</p>
          <div class="actions">
            <button class="btn primary" id="btn-shoot">Strzał na bramkę</button>
            <button class="btn ghost" id="btn-pass">Podanie do kolegi</button>
          </div>
        </section>`,
        'Kluczowy mecz',
      )
    }
    return this.shell(
      `
      <section class="panel">
        <p class="eyebrow">${k.label}</p>
        <h2>${this.selectedAction === 'shoot' ? 'Strzał' : 'Podanie'}</h2>
        <div class="ball-wrap"><canvas id="moment-canvas"></canvas></div>
      </section>`,
      'Akcja',
    )
  }

  private bindKeyMatch(): void {
    if (!this.selectedAction) {
      this.root.querySelector('#btn-shoot')?.addEventListener('click', () => {
        this.selectedAction = 'shoot'
        this.render()
      })
      this.root.querySelector('#btn-pass')?.addEventListener('click', () => {
        this.selectedAction = 'pass'
        this.render()
      })
      return
    }
    const action = this.selectedAction
    const canvas = this.root.querySelector('#moment-canvas') as HTMLCanvasElement
    this.cleanupMoment = mountMatchMoment(canvas, action, (score) => {
      this.selectedAction = null
      this.go(() => resolveKeyMatch(this.state, { action, score }))
    })
  }

  private seasonReportHtml(): string {
    const r = this.state.seasonReport!
    const club = getClub(r.clubId)
    const league = getLeague(r.leagueId)
    const table = sortedStandings({ standings: r.standings })
      .map((row, i) => {
        const c = getClub(row.clubId)
        const mine = row.clubId === r.clubId ? ' mine' : ''
        return `<tr class="${mine}"><td>${i + 1}</td><td>${c.short}</td><td>${row.played}</td><td>${row.points}</td></tr>`
      })
      .join('')
    const scorers = r.scorers
      .map(
        (s, i) =>
          `<tr class="${s.isPlayer ? 'mine' : ''}"><td>${i + 1}</td><td>${s.name}</td><td>${getClub(s.clubId).short}</td><td>${s.goals}</td></tr>`,
      )
      .join('')

    const ovrArrow =
      r.overallDelta > 0 ? '↑' : r.overallDelta < 0 ? '↓' : '→'
    const ovrClass =
      r.overallDelta > 0 ? 'up' : r.overallDelta < 0 ? 'down' : 'flat'
    const ovrChange =
      r.overallDelta > 0
        ? `+${r.overallDelta}`
        : r.overallDelta < 0
          ? `${r.overallDelta}`
          : '0'

    const fate = r.promotion
      ? 'Awans klubu (zostajesz w tym samym klubie)'
      : r.relegation
        ? 'Spadek klubu (zostajesz w tym samym klubie)'
        : r.title
          ? 'Mistrzostwo Polski'
          : 'Bez zmiany ligi'

    return this.shell(
      `
      <section class="panel">
        <p class="eyebrow">${league.name} · ${r.year}</p>
        <h2>Podsumowanie sezonu</h2>
        <p class="muted">${club.name} · ${r.place}. miejsce · ${r.points} pkt</p>

        <table class="summary-table">
          <tbody>
            <tr>
              <td>Overall</td>
              <td class="${ovrClass}"><span class="arrow">${ovrArrow}</span> <strong>${ovrChange}</strong> <span class="muted">(${r.overallBefore} → ${r.overallAfter})</span></td>
            </tr>
            <tr>
              <td>Forma sezonu</td>
              <td class="${r.formLabel === 'fatalna' || r.formLabel === 'słaba' ? 'down' : r.formLabel === 'świetna' ? 'up' : ''}"><strong>${r.formLabel}</strong> <span class="muted">(z goli, ocen i losu)</span></td>
            </tr>
            <tr>
              <td>Występy</td>
              <td><strong>${r.appearances}</strong> / ${r.possibleAppearances} <span class="muted">ligi + puchar</span></td>
            </tr>
            <tr>
              <td>Gole / asysty</td>
              <td><strong>${r.goals}</strong> G · <strong>${r.assists}</strong> A</td>
            </tr>
            <tr>
              <td>Śr. ocena</td>
              <td><strong>${r.avgRating || '—'}</strong></td>
            </tr>
            <tr>
              <td>Puchar Polski</td>
              <td><strong>${r.cupLabel}</strong></td>
            </tr>
            <tr>
              <td>Król strzelców</td>
              <td>${r.playerScorerRank ? `<strong>#${r.playerScorerRank}</strong>` : '<span class="muted">poza podium listy</span>'}</td>
            </tr>
            <tr>
              <td>Los klubu</td>
              <td><strong>${fate}</strong></td>
            </tr>
            <tr>
              <td>Kontrakt</td>
              <td class="${r.contractRenewed ? 'up' : 'down'}"><strong>${r.contractRenewed ? 'Przedłużenie OK' : 'Bez przedłużenia'}</strong><br/><span class="muted">${r.contractNote}</span></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h3>Król strzelców — ${league.name}</h3>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>#</th><th>Zawodnik</th><th>Klub</th><th>G</th></tr></thead>
            <tbody>${scorers}</tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h3>Tabela — ${club.name}</h3>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>#</th><th>Klub</th><th>M</th><th>Pkt</th></tr></thead>
            <tbody>${table}</tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h3>Co dalej?</h3>
        ${
          r.contractRenewed
            ? `<p class="muted">„Zostań” = ten sam klub${r.promotion ? ' (awansuje z Tobą)' : r.relegation ? ' (spada z Tobą)' : ''}.</p>
        <div class="actions">
          <button class="btn primary" id="btn-stay">Zostań w ${club.name}</button>
          <button class="btn ghost" id="btn-leave">Szukaj transferu</button>
        </div>`
            : `<p class="muted">Klub nie przedłuża kontraktu — musisz wybrać ofertę (przy słabej formie często słabsze kluby).</p>
        <div class="actions">
          <button class="btn primary" id="btn-leave">Zobacz oferty</button>
        </div>`
        }
      </section>
    `,
      'Sezon',
    )
  }

  private bindSeasonReport(): void {
    this.root.querySelector('#btn-stay')?.addEventListener('click', () => {
      this.go(() => stayAtClub(this.state))
    })
    this.root.querySelector('#btn-leave')?.addEventListener('click', () => {
      this.go(() => openTransferChoice(this.state))
    })
  }

  private transferChoiceHtml(): string {
    const offers = this.state.transferOffers
    const forced = this.state.seasonReport && !this.state.seasonReport.contractRenewed
    const cards = offers
      .map((o) => {
        const c = getClub(o.clubId)
        const l = getLeague(o.leagueId)
        return `
          <button class="choice" data-offer="${o.clubId}">
            <strong>${c.name}</strong>
            <span>${l.name} · pensja ~${o.wage} zł · premia ${o.signingBonus} zł</span>
            <span>${o.message}</span>
          </button>`
      })
      .join('')
    return this.shell(
      `
      <section class="panel">
        <h2>Oferty transferowe</h2>
        <p class="muted">${forced ? 'Kontrakt nieprzedłużony — wybierz nowy klub.' : 'Wybierz klub albo wróć i zostań.'}</p>
        <div class="choices">${cards}</div>
        ${forced ? '' : `<div class="actions"><button class="btn ghost" id="btn-back-stay">Zostań jednak</button></div>`}
      </section>`,
      'Transfer',
    )
  }

  private bindTransferChoice(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-offer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => acceptOffer(this.state, btn.dataset.offer!))
      })
    })
    this.root.querySelector('#btn-back-stay')?.addEventListener('click', () => {
      this.go(() => stayAtClub(this.state))
    })
  }
}
