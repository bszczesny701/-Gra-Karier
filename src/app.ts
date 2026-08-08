import { getClub, getEffectiveStrength, getLeague } from './data/clubs'
import {
  acceptOffer,
  acceptStartingOffer,
  applyPreseasonDecision,
  declineMidSeasonTransfers,
  draftNewCareer,
  hasMidSeasonOffers,
  openMidSeasonTransfers,
  openPreseasonDecision,
  openTransferChoice,
  resolveKeyMatch,
  runFullSeason,
  sortedStandings,
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
    if (!this.state.player) this.state.screen = 'home'
    else if (!this.state.season && this.state.screen !== 'startOffers') this.state.screen = 'home'
  }

  start(): void {
    this.render()
  }

  private persist(): void {
    if (this.state.player) saveState(this.state)
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
      case 'startOffers':
        this.root.innerHTML = this.startOffersHtml()
        this.bindStartOffers()
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
      else if (this.state.screen === 'home' || this.state.screen === 'create') {
        this.state.screen = this.state.season ? 'hub' : 'startOffers'
      }
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
    return this.shell(
      `
      <section class="panel">
        <h2>Nowy zawodnik</h2>
        <p class="muted">Ustaw profil. Potem dostaniesz 4 oferty z III ligi — z szansą na grę.</p>
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
        <div class="actions">
          <button class="btn primary" id="btn-start">Szukaj ofert</button>
          <button class="btn ghost" id="btn-back">Wróć</button>
        </div>
      </section>`,
      'Tworzenie',
    )
  }

  private bindCreate(): void {
    const ageInput = this.root.querySelector('#player-age') as HTMLInputElement
    const ovrInput = this.root.querySelector('#player-ovr') as HTMLInputElement
    const ageVal = this.root.querySelector('#age-val')!
    const ovrVal = this.root.querySelector('#ovr-val')!

    ageInput.addEventListener('input', () => {
      ageVal.textContent = ageInput.value
    })
    ovrInput.addEventListener('input', () => {
      ovrVal.textContent = ovrInput.value
    })

    this.root.querySelector('#btn-back')?.addEventListener('click', () => {
      this.go(() => {
        this.state.screen = 'home'
      })
    })
    this.root.querySelector('#btn-start')?.addEventListener('click', () => {
      this.go(() =>
        draftNewCareer(this.state, {
          name: (this.root.querySelector('#player-name') as HTMLInputElement).value,
          position: (this.root.querySelector('#player-pos') as HTMLSelectElement).value as Position,
          preferredFoot: (this.root.querySelector('#player-foot') as HTMLSelectElement)
            .value as PreferredFoot,
          age: Number(ageInput.value),
          overall: Number(ovrInput.value),
        }),
      )
    })
  }

  private startOffersHtml(): string {
    const p = this.state.player!
    const cards = this.state.transferOffers
      .map((o) => {
        const c = getClub(o.clubId)
        const chance = o.playChance ?? 50
        return `
          <button class="choice" data-offer="${o.clubId}">
            <strong>${c.name}</strong>
            <span>III liga · pensja ~${o.wage} zł · premia ${o.signingBonus} zł</span>
            <span><strong>Szansa na grę ≈ ${chance}%</strong> — ${o.message}</span>
          </button>`
      })
      .join('')
    return this.shell(
      `
      <section class="panel">
        <h2>Oferty z III ligi</h2>
        <p class="muted">${p.name} · OVR ${p.overall} · ${p.age} lat. Wybierz klub na start kariery.</p>
        <div class="choices">${cards}</div>
      </section>`,
      'Start',
    )
  }

  private bindStartOffers(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-offer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => acceptStartingOffer(this.state, btn.dataset.offer!))
      })
    })
  }

  private hubHtml(): string {
    const p = this.state.player!
    const s = this.state.season!
    const club = getClub(s.clubId)
    const league = getLeague(s.leagueId)
    const mods = this.state.clubStrengthMods ?? {}
    const chance = Math.round(appearanceChance(p, s.clubId, mods) * 100)
    const clubPower = getEffectiveStrength(s.clubId, mods)
    const midOffers = hasMidSeasonOffers(this.state)
    const log = this.state.log
      .slice(0, 4)
      .map((l) => `<li>${l}</li>`)
      .join('')
    const injuryLine = p.injury
      ? `<p class="muted down">Kontuzja: ${p.injury.label}${p.injury.seasonEnding ? '' : ` · jeszcze ${p.injury.matchesLeft} mecz.`}</p>`
      : ''

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
        <p class="meta">${league.name} · sezon ${s.year} · siła klubu ${clubPower} · szansa na grę ≈ ${chance}%</p>
        ${injuryLine}
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
        <p class="muted">II liga max ~50% szansy na „11”. Kontuzje są rzadkie (~20%/sezon) — decyzje przed sezonem mogą je jeszcze obniżyć. Dobra forma = +1/+2 OVR.</p>
        <div class="actions">
          ${
            s.preseasonDone
              ? ''
              : `<button class="btn ghost" id="btn-pre">Wiadomość (decyzja)</button>`
          }
          ${
            midOffers
              ? `<button class="btn ghost" id="btn-mid-tr">Okno transferowe</button>`
              : ''
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
    this.root.querySelector('#btn-mid-tr')?.addEventListener('click', () => {
      this.go(() => openMidSeasonTransfers(this.state))
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
    const initial = (d.speaker || '?').trim().charAt(0).toUpperCase()
    const bubbles = (d.messages?.length ? d.messages : [d.description])
      .map((m) => `<div class="chat-bubble">${m}</div>`)
      .join('')
    const choices = d.choices
      .map(
        (c) =>
          `<button class="chat-reply" data-choice="${c.id}"><span class="chat-reply-text">${c.label}</span><span class="chat-reply-hint">${c.hint}</span></button>`,
      )
      .join('')
    return this.shell(
      `
      <section class="chat-panel">
        <div class="chat-header">
          <div class="chat-avatar">${initial}</div>
          <div>
            <strong>${d.speaker}</strong>
            <p class="muted">${d.speakerRole} · ${d.title}</p>
          </div>
        </div>
        <div class="chat-thread">${bubbles}</div>
        <p class="chat-prompt muted">Twoja odpowiedź:</p>
        <div class="chat-replies">${choices}</div>
      </section>`,
      'Czat',
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
          <p class="muted">Przeciwnik: ${getClub(k.opponentId).name} (siła ${getEffectiveStrength(k.opponentId, this.state.clubStrengthMods ?? {})}). Im silniejszy — tym trudniejsza akcja.</p>
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
    const opp = getClub(this.state.pendingKeyMatch!.opponentId)
    const difficulty = Math.min(1, Math.max(0, (opp.strength - 38) / 42))
    this.cleanupMoment = mountMatchMoment(
      canvas,
      action,
      (score) => {
        this.selectedAction = null
        this.go(() => resolveKeyMatch(this.state, { action, score }))
      },
      { difficulty },
    )
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
              <td class="${r.formLabel === 'fatalna' || r.formLabel === 'słaba' ? 'down' : r.formLabel === 'świetna' || r.formLabel === 'dobra' ? 'up' : ''}"><strong>${r.formLabel}</strong> <span class="muted">(względem oczekiwań + los)</span></td>
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
              <td>Kontuzje</td>
              <td class="${r.matchesMissedInjury > 0 ? 'down' : ''}">${
                r.injuryNote
                  ? `<strong>${r.injuryNote}</strong><br/><span class="muted">Opuszczone mecze: ${r.matchesMissedInjury}</span>`
                  : '<span class="muted">Brak poważniejszych urazów</span>'
              }</td>
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
    const midSeason = Boolean(this.state.season && !this.state.seasonReport)
    const forced = this.state.seasonReport && !this.state.seasonReport.contractRenewed
    const cards = offers
      .map((o) => {
        const c = getClub(o.clubId)
        const l = getLeague(o.leagueId)
        const play = o.playChance != null ? ` · gra ≈ ${o.playChance}%` : ''
        return `
          <button class="choice" data-offer="${o.clubId}">
            <strong>${c.name}</strong>
            <span>${l.name} · pensja ~${o.wage} zł · premia ${o.signingBonus} zł${play}</span>
            <span>${o.message}</span>
          </button>`
      })
      .join('')
    return this.shell(
      `
      <section class="panel">
        <h2>${midSeason ? 'Okno transferowe' : 'Oferty transferowe'}</h2>
        <p class="muted">${
          midSeason
            ? 'W trakcie sezonu — wyższe ligi przy wysokim OVR. Szansa na grę różni się per klub.'
            : forced
              ? 'Kontrakt nieprzedłużony — wybierz nowy klub.'
              : 'Wybierz klub albo wróć i zostań.'
        }</p>
        <div class="choices">${cards}</div>
        ${
          forced
            ? ''
            : midSeason
              ? `<div class="actions"><button class="btn ghost" id="btn-skip-mid">Zostaję w klubie</button></div>`
              : `<div class="actions"><button class="btn ghost" id="btn-back-stay">Zostań jednak</button></div>`
        }
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
    this.root.querySelector('#btn-skip-mid')?.addEventListener('click', () => {
      this.go(() => declineMidSeasonTransfers(this.state))
    })
  }
}
