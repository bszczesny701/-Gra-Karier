import {
  getClub,
  getLeague,
  formatStars,
} from './data/clubs'
import {
  assignSlot,
  autoPickLineup,
  applyHalftimeMotivation,
  confirmLineupAndPlay,
  confirmManagerName,
  dismissMatchResult,
  liveSubstitute,
  liveSwapOnPitch,
  openLineup,
  openTactics,
  playNextMatchFromHub,
  polishLeagues,
  playerUnavailableReason,
  selectClub,
  seekNewClub,
  setFormation,
  setGamePlan,
  setMatchPaused,
  setMatchSpeed,
  setMentality,
  setTacticAxis,
  playerTablePosition,
  sortedStandings,
  startManagerCreate,
  startNextSeason,
  startSecondHalf,
  tickLiveMinute,
  finalizeSeason,
  advanceWeek,
  nextUserMatch,
  canAdvanceWeek,
  makeBuyOffer,
  acceptCounterOffer,
  rejectOffer,
  listOwnPlayer,
  unlistOwnPlayer,
  activateReleaseClause,
  acceptSellOffer,
  makeLoanOffer,
  loanOutPlayer,
  exerciseLoanBuyOption,
  isTransferWindowOpen,
  refreshListingsIfNeeded,
  renewContract,
  suggestRenewTerms,
  playerMarketValue,
  weeklyWageBill,
  type MotivationId,
} from './systems/managerCareer'
import { intervalMsForSpeed } from './systems/liveMatch'
import {
  boardExpectationForClub,
  initialBoardTrust,
  seasonGoalProgress,
  SACK_TRUST_THRESHOLD,
  trustLabel,
  WARN_TRUST_THRESHOLD,
} from './systems/board'
import {
  mailKindLabel,
  markAllMailRead,
  markMailRead,
  unreadMailCount,
} from './systems/mailbox'
import { newsKindLabel } from './systems/news'
import { clubForm, clubPowerPreview, clubTopPlayers } from './systems/leagueSim'
import {
  currentWeek,
  dayActivityLabel,
  transferWindowLabel,
  weekdayLabel,
} from './systems/calendar'
import { normalizeSquadPlayer, updateWantsToLeave, averageStarterOvr, starters } from './systems/squadGen'
import { lineupPower, slotMismatch } from './systems/tactics'
import { clearSave, hasSave, loadState, saveState } from './state/gameState'
import type {
  Formation,
  GamePlan,
  GameState,
  MatchEvent,
  MatchSpeed,
  Mentality,
  TacticAxis,
} from './state/types'
import {
  buildUpLabel,
  createEmptyState,
  defLineLabel,
  formArrowHtml,
  mentalityLabel,
  normalizeTactics,
  planLabel,
  pressLabel,
  ROLE_FULL,
  tempoLabel,
  visualFormationPlan,
  widthLabel,
} from './state/types'

export class App {
  private root: HTMLElement
  private state: GameState
  private pickLeagueId: string | null = null
  private matchTimer: number | null = null
  /** Widok hubu w stylu FIFA Career */
  private hubTab: 'squad' | 'season' | 'office' | 'news' | 'calendar' | 'transfers' = 'squad'

  /** Otwarty mail w skrzynce (Biuro) */
  private openMailId: string | null = null
  /** Profil zawodnika w składzie */
  private profilePlayerId: string | null = null
  private lineupDidDrag = false

  constructor(root: HTMLElement) {
    this.root = root
    this.state = hasSave() ? loadState() : createEmptyState()
    if (this.state.manager && !this.state.team && this.state.screen === 'pickClub') {
      /* zwolniony — szuka klubu */
    } else if (!this.state.manager || !this.state.team) {
      this.state.screen = 'home'
    } else if (this.state.liveMatch && (this.state.screen === 'liveMatch' || this.state.screen === 'halfTime')) {
      /* keep */
    } else if (this.state.liveMatch) {
      this.state.screen = this.state.liveMatch.half === 'ht' ? 'halfTime' : 'liveMatch'
    }
  }

  start(): void {
    this.render()
  }

  private persist(): void {
    if (this.state.manager && this.state.team) saveState(this.state)
  }

  private stopMatchTimer(): void {
    if (this.matchTimer != null) {
      window.clearInterval(this.matchTimer)
      this.matchTimer = null
    }
  }

  private go(mutate: () => void): void {
    this.stopMatchTimer()
    mutate()
    this.persist()
    this.render()
  }

  private startMatchTimer(): void {
    if (this.matchTimer != null) return
    const live = this.state.liveMatch
    if (!live || live.paused || live.half === 'ht' || live.half === 'done') return
    if (this.state.screen !== 'liveMatch') return
    const ms = intervalMsForSpeed(live.speed)
    this.matchTimer = window.setInterval(() => {
      const before = {
        screen: this.state.screen,
        paused: this.state.liveMatch?.paused ?? false,
        half: this.state.liveMatch?.half,
        speed: this.state.liveMatch?.speed,
      }
      tickLiveMinute(this.state)
      this.persist()
      const after = this.state.liveMatch
      const needsFull =
        this.state.screen !== before.screen ||
        !after ||
        after.paused !== before.paused ||
        after.half !== before.half
      if (needsFull) {
        this.stopMatchTimer()
        this.render()
        return
      }
      this.patchLiveMatchUi()
    }, ms)
  }

  /** Odśwież wynik / zegar / feed bez niszczenia DOM (kliknięcia działają). */
  private patchLiveMatchUi(): void {
    const live = this.state.liveMatch
    if (!live || live.paused || this.state.screen !== 'liveMatch') return

    const clock =
      live.stoppageUntil != null && live.minute > (live.half === '1' ? 45 : 90)
        ? `${live.half === '1' ? 45 : 90}+${live.minute - (live.half === '1' ? 45 : 90)}'`
        : `${live.minute}'`

    const scoreEl = this.root.querySelector('.live-score')
    if (scoreEl) scoreEl.textContent = `${live.homeGoals} : ${live.awayGoals}`
    const clockEl = this.root.querySelector('.live-clock')
    if (clockEl) clockEl.textContent = `${clock} · zmiany ${live.subsUsed}/3`

    const feed = this.root.querySelector('.event-feed')
    if (feed) {
      const sig = `${live.events[0]?.minute}:${live.events[0]?.kind}:${live.events[0]?.text}:${live.events.length}`
      if (feed.getAttribute('data-sig') !== sig) {
        feed.setAttribute('data-sig', sig)
        feed.innerHTML =
          live.events.slice(0, 12).map((e, i) => this.eventCardHtml(e, i === 0)).join('') ||
          '<p class="muted">Mecz się zaczyna…</p>'
      }
    }
  }

  private shell(body: string, title: string, mode: 'narrow' | 'wide' | 'fifa' = 'narrow'): string {
    const cls = mode === 'narrow' ? 'app-shell' : mode === 'fifa' ? 'app-shell fifa' : 'app-shell wide'
    return `
      <div class="${cls}">
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
      case 'tactics':
        this.root.innerHTML = this.tacticsHtml()
        this.bindTactics()
        break
      case 'liveMatch':
        this.root.innerHTML = this.liveMatchHtml()
        this.bindLiveMatch()
        this.startMatchTimer()
        break
      case 'halfTime':
        this.root.innerHTML = this.halfTimeHtml()
        this.bindHalfTime()
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
    const returning = Boolean(this.state.manager && !this.state.team)
    const tabs = leagues
      .map(
        (l) =>
          `<button class="btn ghost tab ${l.id === league?.id ? 'active' : ''}" data-league="${l.id}">${l.name}</button>`,
      )
      .join('')
    const clubs = (league?.clubIds ?? [])
      .map((id) => {
        const c = getClub(id)
        const exp = boardExpectationForClub(id, league?.id)
        return `<button class="club-pick" data-club="${id}">
          <div class="club-pick-main">
            <strong>${c.name}</strong>
            <span class="muted">${formatStars(c.stars)} · siła ${c.strength}</span>
          </div>
          <div class="club-pick-board">
            <span class="board-goal">${exp.label}</span>
            <span class="muted">${exp.detail}</span>
          </div>
        </button>`
      })
      .join('')
    return this.shell(
      `
      <section class="panel">
        <h2>${returning ? 'Nowy klub' : 'Wybierz klub'}</h2>
        <p class="muted">${
          returning
            ? 'Zarząd Cię zwolnił. Wybierz nowy klub — każde wymagania zarządu są inne.'
            : 'Każdy klub ma cele zarządu. Niewywiązanie się obniża zaufanie i może skończyć się zwolnieniem.'
        }</p>
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
    if (m.boardTrust == null) {
      m.boardTrust = initialBoardTrust(s.clubId, s.leagueId)
    }
    const club = getClub(s.clubId)
    const league = getLeague(s.leagueId)
    const place = playerTablePosition(s)
    const upcoming = nextUserMatch(s)
    const week = currentWeek(s)
    const chem = Math.round(team.teamChemistry)
    const xi = starters(team)
    const xiOvr = Math.round(averageStarterOvr(team))
    const yourPow = Math.round(lineupPower(team))
    const energy = Math.round(
      xi.reduce((sum, p) => sum + p.fitness, 0) / Math.max(1, xi.length),
    )
    const skillPct = Math.min(100, Math.round((xiOvr / 85) * 100))
    const tac = normalizeTactics(team.tactics)
    team.tactics = tac
    const plan = visualFormationPlan(tac.formation, tac.width, tac.defLine)
    const map = new Map(team.squad.map((p) => [p.id, p]))
    const goalProg = seasonGoalProgress(s)
    const trust = Math.round(m.boardTrust)
    const trustCls =
      trust < SACK_TRUST_THRESHOLD ? 'crit' : trust < WARN_TRUST_THRESHOLD ? 'warn' : 'ok'

    const sheetPlayers = team.startingIds
      .map((id, i) => {
        const p = map.get(id)
        const slot = plan[i]
        if (!p || !slot) return ''
        const short = p.name.split(' ').pop() ?? p.name
        return `<div class="sheet-player" style="left:${slot.x}%;top:${slot.y}%">
          <div class="sheet-kit"><span>${p.overall}</span></div>
          <div class="sheet-name">${short}</div>
        </div>`
      })
      .join('')

    let rivalTileInner = `<div class="tile-title">Następny mecz</div><p class="tile-sub">Brak meczu w tym tygodniu</p>`
    if (upcoming) {
      const oppId = upcoming.homeId === s.clubId ? upcoming.awayId : upcoming.homeId
      const opp = getClub(oppId)
      const oppPow = clubPowerPreview(oppId)
      const home = upcoming.homeId === s.clubId
      const comp = upcoming.competition === 'cup' ? 'Puchar' : `Liga · kol. ${(upcoming.leagueRound ?? s.roundIndex) + 1}`
      rivalTileInner = `
        <div class="tile-title">Następny mecz</div>
        <div class="tile-rival-row">
          <div><strong>${club.short}</strong> <span>${yourPow}</span></div>
          <div class="tile-rival-vs">vs</div>
          <div><strong>${opp.short}</strong> <span>${oppPow}</span></div>
        </div>
        <p class="tile-sub">${comp} · ${home ? 'U siebie' : 'Wyjazd'}</p>`
    } else if (s.phase === 'done') {
      rivalTileInner = `<div class="tile-title">Sezon</div><p class="tile-sub">Zakończony — zobacz podsumowanie</p>`
    } else if (canAdvanceWeek(s)) {
      rivalTileInner = `<div class="tile-title">Tydzień wolny</div><p class="tile-sub">Przejdź dalej w Kalendarzu</p>`
    }

    const fullTable = sortedStandings(s)
      .map((row, i) => {
        const you = row.clubId === s.clubId
        const gd = row.goalsFor - row.goalsAgainst
        const gdStr = gd > 0 ? `+${gd}` : `${gd}`
        return `<tr class="${you ? 'you' : ''}">
          <td>${i + 1}</td>
          <td class="club-full">${getClub(row.clubId).name}${you ? ' · Ty' : ''}</td>
          <td>${row.played}</td>
          <td>${row.won}-${row.drawn}-${row.lost}</td>
          <td>${gdStr}</td>
          <td><strong>${row.points}</strong></td>
        </tr>`
      })
      .join('')

    const formPills = (form: Array<'W' | 'D' | 'L'>) => {
      if (!form.length) return `<span class="muted">Brak meczów</span>`
      return form
        .map((r) => {
          const label = r === 'W' ? 'W' : r === 'D' ? 'R' : 'P'
          const title = r === 'W' ? 'Wygrana' : r === 'D' ? 'Remis' : 'Przegrana'
          return `<span class="form-pill form-${r}" title="${title}">${label}</span>`
        })
        .join('')
    }

    const log = this.state.log
      .slice(0, 6)
      .map((l) => `<li>${l}</li>`)
      .join('')

    const tabs = [
      { id: 'squad' as const, label: 'Główny' },
      { id: 'calendar' as const, label: 'Kalendarz' },
      { id: 'transfers' as const, label: 'Transfery' },
      { id: 'season' as const, label: 'Sezon' },
      { id: 'office' as const, label: 'Biuro' },
    ]
      .map(
        (t) =>
          `<button type="button" class="career-tab ${this.hubTab === t.id ? 'active' : ''}" data-hub-tab="${t.id}">${t.label}</button>`,
      )
      .join('')

    let main = ''
    if (this.hubTab === 'squad') {
      if (!this.state.news) this.state.news = []
      const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
      const topNews = this.state.news.slice(0, 2)
      const newsPreview =
        topNews.length > 0
          ? topNews
              .map(
                (n) => `<article class="news-mini kind-${n.kind}">
                  <span class="news-mini-tag">${newsKindLabel(n.kind)}</span>
                  <strong class="news-mini-head">${clip(n.headline, 42)}</strong>
                  <span class="news-mini-body">${clip(n.body, 48)}</span>
                </article>`,
              )
              .join('')
          : `<span class="tile-news-empty">Brak nowych wiadomości</span>`

      main = `
        <div class="career-grid">
          <article class="career-sheet" id="btn-sheet-lineup" role="button" tabindex="0">
            <header class="sheet-head">
              <div>
                <h2>${club.name.toUpperCase()}</h2>
                <p>Pierwsza drużyna · ${team.tactics.formation}</p>
              </div>
              <div class="sheet-meters">
                <div class="sheet-meter"><span>Siła</span><div class="sheet-meter-track"><i style="width:${skillPct}%"></i></div></div>
                <div class="sheet-meter"><span>Chemia</span><div class="sheet-meter-track"><i style="width:${chem}%"></i></div></div>
                <div class="sheet-meter"><span>Energia</span><div class="sheet-meter-track"><i style="width:${energy}%"></i></div></div>
              </div>
            </header>
            <div class="sheet-pitch-wrap">
              <div class="sheet-pitch">
                <div class="pitch-markings fifa-marks"></div>
                ${sheetPlayers}
              </div>
            </div>
            <p class="sheet-foot">Miejsce ${place}. · ${league.name} · XI ≈ ${xiOvr} OVR · kadra ${team.squad.length}</p>
          </article>

          <div class="career-side">
            <div class="career-tiles">
              <button type="button" class="career-tile tile-squad" id="btn-lineup">
                <span class="tile-title">Centrum składu</span>
                <span class="tile-sub">Ustaw XI, taktykę i ławkę</span>
              </button>
              ${
                s.phase === 'playing'
                  ? upcoming
                    ? `<button type="button" class="career-tile tile-play" id="btn-match">
                      <span class="tile-title">Graj mecz</span>
                      <span class="tile-sub">Skład i start</span>
                    </button>`
                    : canAdvanceWeek(s)
                      ? `<button type="button" class="career-tile tile-play" id="btn-advance-week">
                      <span class="tile-title">Następny tydzień</span>
                      <span class="tile-sub">${week?.label ?? 'Dalej'}</span>
                    </button>`
                      : `<button type="button" class="career-tile tile-play" data-hub-tab="calendar">
                      <span class="tile-title">Kalendarz</span>
                      <span class="tile-sub">Zaplanuj tydzień</span>
                    </button>`
                  : `<button type="button" class="career-tile tile-play" id="btn-end">
                      <span class="tile-title">Podsumowanie</span>
                      <span class="tile-sub">Zakończ sezon</span>
                    </button>`
              }
              <button type="button" class="career-tile tile-rival" data-hub-tab="season">
                ${rivalTileInner}
              </button>
              <button type="button" class="career-tile tile-table" data-hub-tab="season">
                <span class="tile-title">Tabela i cele</span>
                <span class="tile-sub">${place}. miejsce · ${goalProg.exp.label}</span>
              </button>
              <button type="button" class="career-tile tile-tactics" id="btn-lineup-tactics">
                <span class="tile-title">Taktyka</span>
                <span class="tile-sub">${planLabel(tac.plan)} · ${widthLabel(tac.width)} · press ${pressLabel(tac.press)}</span>
              </button>
              <button type="button" class="career-tile tile-news" data-hub-tab="news">
                <span class="tile-title">Wiadomości</span>
                <div class="tile-news-cards">${newsPreview}</div>
              </button>
            </div>
          </div>
        </div>`
    } else if (this.hubTab === 'calendar') {
      const cal = s.calendar
      const w = currentWeek(s)
      const windowBadge = w ? transferWindowLabel(w.transferWindow) : '—'
      const daysHtml = w
        ? w.days
            .map((d) => {
              let detail = dayActivityLabel(d.activity)
              if (d.activity === 'match' && d.matchId && s.matches[d.matchId]) {
                const m = s.matches[d.matchId]!
                const opp = m.homeId === s.clubId ? m.awayId : m.homeId
                const comp = m.competition === 'cup' ? 'PP' : 'Liga'
                detail = `${comp} vs ${getClub(opp).short}`
              }
              return `<button type="button" class="cal-day activity-${d.activity}" data-cal-day="${d.weekday}" ${d.activity === 'training' ? 'data-training="1"' : ''} ${d.activity === 'match' && d.matchId ? `data-play-match="${d.matchId}"` : ''}>
                <span class="cal-day-name">${weekdayLabel(d.weekday)}</span>
                <span class="cal-day-act">${detail}</span>
              </button>`
            })
            .join('')
        : `<p class="muted">Brak tygodnia.</p>`

      const cup = s.cup
      const cupMini = cup
        ? `<div class="cup-ladder">${cup.yourPath
            .map((step, i) => {
              const cls =
                step.result === 'won' || step.result === 'bye'
                  ? 'won'
                  : step.result === 'lost'
                    ? 'lost'
                    : i === cup.roundIndex && !cup.eliminated
                      ? 'now'
                      : step.result === 'pending'
                        ? 'idle'
                        : 'done'
              return `<span class="cup-step ${cls}" title="${step.roundName}${step.opponentId ? ` vs ${getClub(step.opponentId).short}` : ''}">${step.roundName.replace(' finału', '').replace('Ćwierć', '1/4').replace('Pół', '1/2')}</span>${i < cup.yourPath.length - 1 ? '<span class="cup-arrow">→</span>' : ''}`
            })
            .join('')}</div>`
        : `<p class="muted">Puchar Polski od poziomu I ligi.</p>`

      main = `
        <div class="career-calendar-screen">
          <section class="career-panel">
            <div class="mail-panel-head">
              <h3>Tydzień ${(cal?.weekIndex ?? 0) + 1}/${cal?.weeks.length ?? 0}</h3>
              <span class="cal-window-badge ${w?.transferWindow ? 'open' : ''}">${windowBadge}</span>
            </div>
            <p class="muted" style="margin:0 0 10px">${w?.label ?? '—'} · Sezon ${s.year}</p>
            <div class="cal-week">${daysHtml}</div>
            <div class="actions" style="margin-top:14px">
              ${
                upcoming
                  ? `<button class="btn primary" id="btn-match">Graj mecz</button>`
                  : canAdvanceWeek(s)
                    ? `<button class="btn primary" id="btn-advance-week">Następny tydzień</button>`
                    : s.phase === 'done'
                      ? `<button class="btn primary" id="btn-end">Podsumowanie sezonu</button>`
                      : ''
              }
              <button class="btn ghost" data-hub-tab="squad">Wróć</button>
            </div>
          </section>
          <section class="career-panel">
            <h3>Puchar Polski</h3>
            ${cupMini}
          </section>
        </div>`
    } else if (this.hubTab === 'news') {
      if (!this.state.news) this.state.news = []
      const newsHtml =
        this.state.news
          .slice(0, 20)
          .map(
            (n) => `<article class="news-card kind-${n.kind}">
              <div class="news-card-tag">${newsKindLabel(n.kind)}${n.round ? ` · kol. ${n.round}` : ''}</div>
              <strong class="news-card-head">${n.headline}</strong>
              <p class="news-card-body">${n.body}</p>
            </article>`,
          )
          .join('') || `<p class="muted">Brak wiadomości — wróć po kolejce.</p>`

      main = `
        <div class="career-news-screen">
          <section class="career-panel news-screen-panel">
            <div class="mail-panel-head">
              <h3>Wiadomości</h3>
              <button type="button" class="btn ghost compact" data-hub-tab="squad">Wróć</button>
            </div>
            <p class="muted" style="margin:0 0 10px">Liga, forma i kuluary transferowe</p>
            <div class="news-card-grid">${newsHtml}</div>
          </section>
        </div>`
    } else if (this.hubTab === 'season') {
      main = `
        <div class="career-season">
          <section class="career-panel career-panel-table">
            <h3>Tabela · ${league.name}</h3>
            <table class="mini-table full-table names-full">
              <thead><tr><th>#</th><th>Klub</th><th>M</th><th>W-R-P</th><th>+/−</th><th>Pkt</th></tr></thead>
              <tbody>${fullTable}</tbody>
            </table>
          </section>
          <section class="career-panel board-panel-compact">
            <h3>Cel zarządu</h3>
            <div class="board-progress compact ${goalProg.onTrack ? 'on-track' : 'off-track'}">
              <div class="board-progress-head">
                <strong>${goalProg.exp.label}</strong>
                <span>${place}. / cel ${goalProg.exp.targetPlace}.</span>
              </div>
              <p class="board-status">${goalProg.statusText}</p>
              <div class="trust-bar ${trustCls}" title="Zaufanie zarządu"><i style="width:${trust}%"></i></div>
              <p class="muted trust-caption">Zaufanie ${trust}% · ${trustLabel(trust)}</p>
            </div>
          </section>
          <section class="career-panel">
            <h3>Analiza rywala</h3>
            ${
              upcoming
                ? (() => {
                    const oppId = upcoming.homeId === s.clubId ? upcoming.awayId : upcoming.homeId
                    const opp = getClub(oppId)
                    const oppPow = clubPowerPreview(oppId)
                    const home = upcoming.homeId === s.clubId
                    const maxPow = Math.max(yourPow, oppPow, 1)
                    const tops = clubTopPlayers(oppId, 3)
                    const form = clubForm(s.standings, oppId)
                    const oppRow = s.standings.find((r) => r.clubId === oppId)
                    const oppPlace = sortedStandings(s).findIndex((r) => r.clubId === oppId) + 1
                    const compLabel =
                      upcoming.competition === 'cup'
                        ? 'Puchar Polski'
                        : `Kolejka ${(upcoming.leagueRound ?? s.roundIndex) + 1}/${s.rounds.length}`
                    return `
                    <div class="rival-preview career-rival">
                      <div class="rival-head">
                        <span class="muted">${compLabel} · ${home ? 'U siebie' : 'Wyjazd'}</span>
                        <span class="rival-edge">${yourPow - oppPow >= 4 ? 'Faworyt' : oppPow - yourPow >= 4 ? 'Underdog' : 'Wyrównany'}</span>
                      </div>
                      <div class="rival-matchup">
                        <div class="rival-side">
                          <div class="rival-name">${club.short}</div>
                          <div class="rival-pow">${yourPow}</div>
                          <div class="muted">Twoje XI · ${xiOvr} OVR</div>
                          <div class="pow-bar"><i style="width:${Math.round((yourPow / maxPow) * 100)}%"></i></div>
                        </div>
                        <div class="rival-vs">vs</div>
                        <div class="rival-side">
                          <div class="rival-name">${opp.short}</div>
                          <div class="rival-pow">${oppPow}</div>
                          <div class="muted">${oppPlace}. miejsce · ${oppRow ? `${oppRow.won}-${oppRow.drawn}-${oppRow.lost}` : '0-0-0'}</div>
                          <div class="pow-bar them"><i style="width:${Math.round((oppPow / maxPow) * 100)}%"></i></div>
                        </div>
                      </div>
                      <p class="rival-fixture"><strong>${getClub(upcoming.homeId).name}</strong> — <strong>${getClub(upcoming.awayId).name}</strong></p>

                      <div class="opp-scout">
                        <div class="opp-block">
                          <h4>Forma (ost. 5)</h4>
                          <div class="form-row">${formPills(form)}</div>
                          <p class="form-legend muted">W wygrana · R remis · P przegrana</p>
                        </div>
                        <div class="opp-block">
                          <h4>Top 3 zawodników</h4>
                          <ul class="opp-stars">
                            ${tops
                              .map(
                                (p) =>
                                  `<li><span class="opp-ovr">${p.overall}</span><span class="opp-role">${p.role}</span><span class="opp-name">${p.name}</span></li>`,
                              )
                              .join('')}
                          </ul>
                        </div>
                      </div>
                    </div>`
                  })()
                : `<p class="muted">${s.phase === 'done' ? 'Sezon zakończony.' : canAdvanceWeek(s) ? 'Brak meczu — przejdź do następnego tygodnia.' : 'Brak meczu w tym tygodniu.'}</p>`
            }
            <div class="actions" style="margin-top:14px">
              ${
                s.phase === 'playing'
                  ? upcoming
                    ? `<button class="btn primary" id="btn-match">Skład i mecz</button>
                     <button class="btn ghost" id="btn-lineup">Tylko skład</button>`
                    : canAdvanceWeek(s)
                      ? `<button class="btn primary" id="btn-advance-week">Następny tydzień</button>
                     <button class="btn ghost" data-hub-tab="calendar">Kalendarz</button>`
                      : `<button class="btn ghost" data-hub-tab="calendar">Kalendarz</button>`
                  : `<button class="btn primary" id="btn-end">Podsumowanie sezonu</button>`
              }
            </div>
          </section>
          <section class="career-panel">
            <h3>Puchar Polski</h3>
            ${
              s.cup
                ? `<div class="cup-ladder">${s.cup.yourPath
                    .map((step, i) => {
                      const cls =
                        step.result === 'won' || step.result === 'bye'
                          ? 'won'
                          : step.result === 'lost'
                            ? 'lost'
                            : i === s.cup!.roundIndex && !s.cup!.eliminated
                              ? 'now'
                              : 'idle'
                      const tip = step.opponentId
                        ? `${step.roundName} vs ${getClub(step.opponentId).short}`
                        : step.roundName
                      return `<span class="cup-step ${cls}" title="${tip}">${step.roundName}</span>${i < s.cup!.yourPath.length - 1 ? '<span class="cup-arrow">→</span>' : ''}`
                    })
                    .join('')}</div>
                  <p class="muted" style="margin-top:8px">${s.cup.eliminated ? 'Odpadłeś z pucharu.' : s.cup.championId === s.clubId ? 'Mistrz Pucharu!' : 'Twoja ścieżka w PP.'}</p>`
                : `<p class="muted">Dostępny od I ligi / Ekstraklasy.</p>`
            }
          </section>
        </div>`
    } else if (this.hubTab === 'office') {
      if (!this.state.mailbox) this.state.mailbox = []
      const mails = this.state.mailbox
      const unread = unreadMailCount(this.state)
      const openMail = mails.find((x) => x.id === this.openMailId) ?? null
      const mailList =
        mails
          .map((mail) => {
            const active = openMail?.id === mail.id
            const meta = [
              mailKindLabel(mail.kind),
              mail.round != null ? `kol. ${mail.round}` : null,
              mail.year != null ? `${mail.year}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
            return `<button type="button" class="mail-row ${mail.read ? '' : 'unread'} ${active ? 'active' : ''}" data-mail="${mail.id}">
              <span class="mail-row-kind kind-${mail.kind}">${mailKindLabel(mail.kind)}</span>
              <span class="mail-row-main">
                <strong>${mail.subject}</strong>
                <span class="muted">${mail.from} · ${meta}</span>
              </span>
              ${mail.read ? '' : '<span class="mail-dot" title="Nieprzeczytane"></span>'}
            </button>`
          })
          .join('') || `<p class="muted">Skrzynka pusta — maile pojawią się po meczach.</p>`

      main = `
        <div class="career-office">
          <section class="career-panel mail-panel">
            <div class="mail-panel-head">
              <h3>Skrzynka pocztowa${unread ? ` · ${unread} nowe` : ''}</h3>
              ${mails.length ? `<button type="button" class="btn ghost compact" id="btn-mail-read-all">Oznacz przeczytane</button>` : ''}
            </div>
            <div class="mail-layout">
              <div class="mail-list">${mailList}</div>
              <div class="mail-reader">
                ${
                  openMail
                    ? `<article class="mail-letter kind-${openMail.kind}">
                        <header>
                          <div class="mail-letter-tag">${mailKindLabel(openMail.kind)}</div>
                          <h4>${openMail.subject}</h4>
                          <p class="muted">Od: ${openMail.from}${openMail.round != null ? ` · kolejka ${openMail.round}` : ''}</p>
                        </header>
                        <div class="mail-letter-body">${openMail.body.replace(/\n/g, '<br>')}</div>
                      </article>`
                    : `<p class="muted mail-empty">Wybierz wiadomość ze skrzynki.</p>`
                }
              </div>
            </div>
          </section>
          <section class="career-panel board-panel-compact">
            <h3>Zarząd · ${club.name}</h3>
            <div class="board-progress compact ${trustCls}">
              <div class="board-progress-head">
                <strong>${goalProg.exp.label}</strong>
                <span>${trustLabel(trust)}</span>
              </div>
              <div class="trust-bar ${trustCls}"><i style="width:${trust}%"></i></div>
              <p class="muted trust-caption">Zaufanie <strong>${trust}%</strong> · cel top ${goalProg.exp.targetPlace}.</p>
              ${
                trust < WARN_TRUST_THRESHOLD
                  ? `<p class="board-warn">Poniżej ${SACK_TRUST_THRESHOLD}% po sezonie — zwolnienie.</p>`
                  : ''
              }
            </div>
          </section>
          <section class="career-panel">
            <h3>Finanse</h3>
            <p class="meta">Budżet <strong>${Math.round(team.budget).toLocaleString('pl-PL')} zł</strong></p>
            <p class="muted">Płace: ${weeklyWageBill(team).toLocaleString('pl-PL')} zł / tyg. · ${team.squad.length} zawodników</p>
            <p class="muted">Sezon: +${Math.round(team.seasonIncome ?? 0).toLocaleString('pl-PL')} / −${Math.round(team.seasonExpense ?? 0).toLocaleString('pl-PL')}</p>
            <p class="muted">${isTransferWindowOpen(this.state) ? 'Okienko transferowe otwarte' : 'Okienko zamknięte — możesz przedłużać kontrakty'}</p>
            <div class="actions" style="margin-top:10px">
              <button type="button" class="btn ghost compact" data-hub-tab="transfers">Transfery</button>
            </div>
          </section>
          <section class="career-panel">
            <h3>Profil trenera</h3>
            <p class="meta">${m.name} · reputacja ${m.reputation} · sezony ${m.seasonsManaged}</p>
            <p class="muted">${club.name}</p>
            <p class="muted">Bilans: ${s.record.won}-${s.record.drawn}-${s.record.lost} · ${place}. miejsce</p>
            <ul class="log compact">${log || '<li class="muted">Brak wpisów</li>'}</ul>
            <div class="actions" style="margin-top:12px">
              <button class="btn ghost danger" id="btn-reset">Nowa kariera</button>
            </div>
          </section>
        </div>`
    } else if (this.hubTab === 'transfers') {
      refreshListingsIfNeeded(this.state)
      const market = this.state.market
      const windowOpen = isTransferWindowOpen(this.state)
      const listings = (market?.listings ?? [])
        .map((l) => {
          const found = this.state.team?.squad.find((p) => p.id === l.playerId)
            ? { player: this.state.team!.squad.find((p) => p.id === l.playerId)!, clubId: this.state.team!.clubId }
            : (() => {
                for (const [cid, sq] of Object.entries(market.aiSquads ?? {})) {
                  const p = sq.find((x) => x.id === l.playerId)
                  if (p) return { player: p, clubId: cid }
                }
                return null
              })()
          if (!found) return ''
          const p = found.player
          const own = found.clubId === s.clubId
          const val = playerMarketValue(p)
          return `<article class="transfer-row">
            <div>
              <strong>${p.name}</strong>
              <span class="muted"> · ${ROLE_FULL[p.role]} · ${p.overall} OVR · ${getClub(found.clubId).short}</span>
              <p class="muted" style="margin:4px 0 0">Wartość ~${val.toLocaleString('pl-PL')} · cena ${l.askingPrice.toLocaleString('pl-PL')}${p.releaseClause ? ` · klauzula ${p.releaseClause.toLocaleString('pl-PL')}` : ''}</p>
            </div>
            <div class="transfer-row-actions">
              ${
                own
                  ? `<button type="button" class="btn ghost compact" data-unlist="${p.id}">Zdejmij</button>`
                  : windowOpen
                    ? `<button type="button" class="btn primary compact" data-buy="${p.id}" data-ask="${l.askingPrice}">Kup</button>
                       <button type="button" class="btn ghost compact" data-loan="${p.id}">Wypożycz</button>
                       ${p.releaseClause ? `<button type="button" class="btn ghost compact" data-clause="${p.id}">Klauzula</button>` : ''}`
                    : `<span class="muted">Zamknięte</span>`
              }
            </div>
          </article>`
        })
        .join('') || `<p class="muted">${windowOpen ? 'Brak ofert na rynku — wróć w kolejnym tygodniu okienka.' : 'Okienko zamknięte.'}</p>`

      const offers = (market?.offers ?? [])
        .filter((o) => o.status === 'pending' || o.status === 'countered')
        .slice(0, 12)
        .map((o) => {
          const name = (() => {
            const f = this.state.team?.squad.find((p) => p.id === o.playerId)
            if (f) return f.name
            for (const sq of Object.values(market.aiSquads ?? {})) {
              const p = sq.find((x) => x.id === o.playerId)
              if (p) return p.name
            }
            return o.playerId
          })()
          return `<article class="transfer-offer ${o.status}">
            <div>
              <strong>${o.kind === 'sell' ? 'Oferta kupna' : o.kind === 'loan' ? 'Wypożyczenie' : 'Negocjacja'}: ${name}</strong>
              <p class="muted" style="margin:4px 0 0">${o.fee.toLocaleString('pl-PL')} zł · ${o.wageOffer.toLocaleString('pl-PL')}/tyg. · ${o.yearsOffer || '—'} lat · ${o.status}${o.counter ? ` · kontrpropozycja ${o.counter.fee.toLocaleString('pl-PL')}` : ''}</p>
            </div>
            <div class="transfer-row-actions">
              ${
                o.status === 'countered'
                  ? `<button type="button" class="btn primary compact" data-accept-counter="${o.id}">Akceptuj kontrę</button>
                     <button type="button" class="btn ghost compact" data-reject-offer="${o.id}">Odrzuć</button>`
                  : o.kind === 'sell' && o.fromAi
                    ? `<button type="button" class="btn primary compact" data-accept-sell="${o.id}">Sprzedaj</button>
                       <button type="button" class="btn ghost compact" data-reject-offer="${o.id}">Odrzuć</button>`
                    : `<button type="button" class="btn ghost compact" data-reject-offer="${o.id}">Odrzuć</button>`
              }
            </div>
          </article>`
        })
        .join('') || `<p class="muted">Brak aktywnych ofert.</p>`

      main = `
        <div class="career-transfers">
          <section class="career-panel">
            <div class="mail-panel-head">
              <h3>Rynek PL</h3>
              <span class="cal-window-badge ${windowOpen ? 'open' : ''}">${windowOpen ? 'Okienko otwarte' : 'Okienko zamknięte'}</span>
            </div>
            <p class="muted" style="margin:0 0 10px">Budżet ${Math.round(team.budget).toLocaleString('pl-PL')} zł · kadra ${team.squad.length}/30</p>
            <div class="transfer-list">${listings}</div>
          </section>
          <section class="career-panel">
            <h3>Oferty</h3>
            <div class="transfer-list">${offers}</div>
          </section>
        </div>`
    }

    return `
      <div class="app-shell career">
        <header class="career-top">
          <div class="career-status">
            <div class="career-pill">Sezon ${s.year}</div>
            <div class="career-pill">${league.name}</div>
            <div class="career-pill money-pill">${Math.round(team.budget / 1000)}k zł</div>
          </div>
          <div class="career-brand">GRA TRENERA</div>
          <div class="career-profile">
            <div class="career-profile-text">
              <strong>${m.name}</strong>
              <span>${club.short} · ${place}. · zaufanie ${trust}%</span>
            </div>
            <div class="career-rating ${trustCls}" title="Zaufanie zarządu">${trust}</div>
          </div>
        </header>
        <nav class="career-nav">${tabs}</nav>
        <main class="career-main">${main}</main>
        <footer class="career-foot">
          <span>Wybierz kafelek</span>
          <span>Hub klubu</span>
        </footer>
      </div>`
  }

  private bindHub(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-hub-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.hubTab = btn.dataset.hubTab as
          | 'squad'
          | 'season'
          | 'office'
          | 'news'
          | 'calendar'
          | 'transfers'
        this.render()
      })
    })
    const goLineup = () => this.go(() => openLineup(this.state))
    const goTactics = () => this.go(() => openTactics(this.state))
    this.root.querySelector('#btn-lineup')?.addEventListener('click', goLineup)
    this.root.querySelector('#btn-lineup-tactics')?.addEventListener('click', goTactics)
    this.root.querySelector('#btn-sheet-lineup')?.addEventListener('click', goLineup)
    this.root.querySelector('#btn-sheet-lineup')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault()
        goLineup()
      }
    })
    this.root.querySelector('#btn-match')?.addEventListener('click', () => {
      this.go(() => {
        const err = playNextMatchFromHub(this.state)
        if (err) pushTempAlert(err)
      })
    })
    this.root.querySelector('#btn-advance-week')?.addEventListener('click', () => {
      this.go(() => {
        const err = advanceWeek(this.state)
        if (err) pushTempAlert(err)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-training]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pushTempAlert('Trening wkrótce — na razie to tylko plan tygodnia.')
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-play-match]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => {
          const err = playNextMatchFromHub(this.state)
          if (err) pushTempAlert(err)
        })
      })
    })
    this.root.querySelector('#btn-end')?.addEventListener('click', () => {
      this.go(() => finalizeSeason(this.state))
    })
    this.root.querySelector('#btn-reset')?.addEventListener('click', () => {
      if (!confirm('Na pewno zacząć od nowa?')) return
      clearSave()
      this.state = createEmptyState()
      this.state.screen = 'home'
      this.hubTab = 'squad'
      this.openMailId = null
      this.render()
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-mail]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.mail!
        this.openMailId = id
        this.go(() => markMailRead(this.state, id))
      })
    })
    this.root.querySelector('#btn-mail-read-all')?.addEventListener('click', () => {
      this.go(() => markAllMailRead(this.state))
    })

    this.root.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.buy!
        const ask = Number(btn.dataset.ask || 0)
        this.go(() => {
          const found =
            this.state.team?.squad.find((p) => p.id === id) ??
            Object.values(this.state.market?.aiSquads ?? {})
              .flat()
              .find((p) => p.id === id)
          if (!found) return
          const wage = Math.max(found.wage, Math.round(playerMarketValue(found) / 80))
          const err = makeBuyOffer(this.state, id, ask, wage, 3, found.releaseClause)
          if (err) pushTempAlert(err)
        })
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-loan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.loan!
        this.go(() => {
          const err = makeLoanOffer(this.state, id, 12, null, 0)
          if (err) pushTempAlert(err)
        })
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-clause]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => {
          const err = activateReleaseClause(this.state, btn.dataset.clause!)
          if (err) pushTempAlert(err)
        })
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-unlist]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => unlistOwnPlayer(this.state, btn.dataset.unlist!))
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-accept-counter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => {
          const err = acceptCounterOffer(this.state, btn.dataset.acceptCounter!)
          if (err) pushTempAlert(err)
        })
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-accept-sell]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => {
          const err = acceptSellOffer(this.state, btn.dataset.acceptSell!)
          if (err) pushTempAlert(err)
        })
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-reject-offer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => rejectOffer(this.state, btn.dataset.rejectOffer!))
      })
    })
  }

  private lineupHtml(): string {
    const team = this.state.team!
    team.tactics = normalizeTactics(team.tactics)
    const season = this.state.season
    if (season) updateWantsToLeave(team, season.roundIndex)
    else for (const p of team.squad) normalizeSquadPlayer(p)
    const plan = visualFormationPlan(team.tactics.formation, team.tactics.width, team.tactics.defLine)
    const map = new Map(team.squad.map((p) => [p.id, p]))
    const formations: Formation[] = ['4-4-2', '4-3-3', '3-5-2']

    const pitchPlayers = team.startingIds
      .map((id, i) => {
        const p = map.get(id)!
        const slot = plan[i]!
        const mismatch = slotMismatch(p, slot)
        const short = p.name.split(' ').pop() ?? p.name
        const fit = Math.round(p.fitness)
        const fitCls = fit < 30 ? 'crit' : fit < 55 ? 'low' : ''
        const unavailable = playerUnavailableReason(p)
        return `<div class="fifa-card ${mismatch ? 'mismatch' : ''} ${unavailable ? 'unavailable' : ''}" draggable="${unavailable ? 'false' : 'true'}" data-drag="slot" data-slot="${i}" data-id="${id}" data-profile="${id}" style="left:${slot.x}%;top:${slot.y}%" title="${p.name} · slot ${slot.role} (${ROLE_FULL[slot.role]}) · naturalnie ${p.role} · kondycja ${fit}%${unavailable ? ` · ${unavailable}` : ''}">
          <div class="fifa-badge">
            <span class="fifa-ovr">${p.overall}</span>
            <span class="fifa-pos">${slot.role}</span>
          </div>
          <div class="fifa-fatigue ${fitCls}" title="Kondycja ${fit}%"><i style="width:${fit}%"></i></div>
          <div class="fifa-meta">
            <span class="fifa-name">${short}</span>
            ${formArrowHtml(p.form)}
          </div>
          ${unavailable ? `<span class="fifa-status">${(p.injuryMatchesLeft ?? 0) > 0 ? 'KONT' : 'ZAW'}</span>` : ''}
          ${p.wantsToLeave ? '<span class="fifa-leave" title="Chce odejść">!</span>' : ''}
        </div>`
      })
      .join('')

    const renderBenchBtn = (id: string, dim = false) => {
      const p = map.get(id)!
      const fit = Math.round(p.fitness)
      const unavailable = playerUnavailableReason(p)
      return `<div class="fifa-bench-row ${dim || unavailable ? 'dim' : ''} ${unavailable ? 'unavailable' : ''}" draggable="${unavailable ? 'false' : 'true'}" data-drag="bench" data-id="${id}" data-profile="${id}" title="${p.name} · ${ROLE_FULL[p.role]} · kondycja ${fit}%${unavailable ? ` · ${unavailable}` : ''}">
        <span class="fifa-bench-role">${p.role}</span>
        <span class="fifa-bench-ovr">${p.overall}</span>
        <span class="fifa-bench-name">${p.name.split(' ').pop()}${unavailable ? ` · ${(p.injuryMatchesLeft ?? 0) > 0 ? 'KONT' : 'ZAW'}` : ''}${p.wantsToLeave ? ' · !' : ''}</span>
        <span class="fifa-bench-fat"><i style="width:${fit}%"></i></span>
        ${formArrowHtml(p.form)}
      </div>`
    }

    const bench = team.benchIds.map((id) => renderBenchBtn(id)).join('')
    const rest = team.squad
      .filter((p) => !team.startingIds.includes(p.id) && !team.benchIds.includes(p.id))
      .map((p) => renderBenchBtn(p.id, true))
      .join('')

    const profile = this.profilePlayerId ? map.get(this.profilePlayerId) : null
    const profileModal = profile
      ? (() => {
          normalizeSquadPlayer(profile)
          const unavail = playerUnavailableReason(profile)
          const attrRow = (label: string, v: number) =>
            `<div class="player-attr"><span>${label}</span><div class="player-attr-track"><i style="width:${v}%"></i></div><strong>${v}</strong></div>`
          return `
          <div class="player-profile-overlay" id="profile-overlay">
            <article class="player-profile-card" role="dialog" aria-label="Profil ${profile.name}">
              <header class="player-profile-head">
                <div>
                  <p class="muted">${ROLE_FULL[profile.role]} · ${profile.age} lat</p>
                  <h3>${profile.name}</h3>
                </div>
                <div class="player-profile-ovr">${profile.overall}</div>
              </header>
              ${profile.wantsToLeave ? '<p class="player-leave-badge">Chce odejść</p>' : ''}
              ${unavail ? `<p class="player-status-warn">${unavail}</p>` : ''}
              <div class="player-profile-meters">
                ${attrRow('Tempo', profile.attrs.pace)}
                ${attrRow('Strzał', profile.attrs.shooting)}
                ${attrRow('Podania', profile.attrs.passing)}
                ${attrRow('Obrona', profile.attrs.defending)}
                ${attrRow('Wytrzymałość', profile.attrs.stamina)}
              </div>
              <div class="player-profile-stats">
                <div><span class="muted">Forma</span><strong>${Math.round(profile.form)}</strong></div>
                <div><span class="muted">Morale</span><strong>${Math.round(profile.morale)}</strong></div>
                <div><span class="muted">Kondycja</span><strong>${Math.round(profile.fitness)}%</strong></div>
                <div><span class="muted">Sezon</span><strong>${profile.seasonApps} mecz. · ${profile.seasonGoals} gol.</strong></div>
              </div>
              <div class="player-profile-contract">
                <span class="muted">Kontrakt</span>
                <strong>${profile.contractYears} ${profile.contractYears === 1 ? 'sezon' : profile.contractYears < 5 ? 'sezony' : 'sezonów'}</strong>
                <span class="muted">·</span>
                <strong>${Math.round(profile.wage).toLocaleString('pl-PL')} / tyg.</strong>
                ${profile.releaseClause ? `<span class="muted">· klauzula ${profile.releaseClause.toLocaleString('pl-PL')}</span>` : ''}
                ${profile.loanFromClubId ? `<span class="muted">· wypożyczony z ${getClub(profile.loanFromClubId).short}${profile.loanWeeksLeft != null ? ` · ${profile.loanWeeksLeft} tyg.` : ''}</span>` : ''}
              </div>
              <div class="actions" style="margin-top:4px">
                ${
                  !profile.loanFromClubId
                    ? `<button type="button" class="btn primary compact" id="btn-renew">Przedłuż</button>
                       ${
                         isTransferWindowOpen(this.state)
                           ? `<button type="button" class="btn ghost compact" id="btn-list-player">Wystaw</button>
                              <button type="button" class="btn ghost compact" id="btn-loan-out">Wypożycz</button>`
                           : ''
                       }`
                    : isTransferWindowOpen(this.state) && profile.loanBuyOption != null
                      ? `<button type="button" class="btn primary compact" id="btn-loan-buy">Wykup (${profile.loanBuyOption.toLocaleString('pl-PL')})</button>`
                      : ''
                }
                <button type="button" class="btn ghost" id="btn-close-profile">Zamknij</button>
              </div>
            </article>
          </div>`
        })()
      : ''

    return this.shell(
      `
      <section class="lineup-fifa">
        <div class="lineup-toolbar fifa-bar">
          <div class="fifa-bar-left">
            <h2>Skład</h2>
            <div class="tactics-row">
              ${formations
                .map(
                  (f) =>
                    `<button class="btn ghost ${team.tactics.formation === f ? 'active' : ''}" data-form="${f}">${f}</button>`,
                )
                .join('')}
            </div>
          </div>
          <div class="actions compact">
            <button class="btn ghost" id="btn-auto">Auto XI</button>
            <button class="btn ghost" id="btn-back-hub">Wróć</button>
            <button class="btn primary" id="btn-play">Graj mecz</button>
          </div>
        </div>
        <div class="lineup-layout fifa-layout">
          <div class="pitch fifa-pitch" aria-label="Formacja ${team.tactics.formation}">
            <div class="pitch-markings fifa-marks"></div>
            ${pitchPlayers}
          </div>
          <aside class="bench-panel fifa-squad">
            <div class="fifa-squad-head">
              <h3>Rezerwa</h3>
              <span class="muted">Przeciągnij · klik = profil</span>
            </div>
            <div class="bench-strip vertical fifa-list" data-drop="bench">${bench}${rest}</div>
          </aside>
        </div>
        ${profileModal}
      </section>`,
      'Skład',
      'fifa',
    )
  }

  private tacticsHtml(): string {
    const team = this.state.team!
    team.tactics = normalizeTactics(team.tactics)
    const t = team.tactics
    const plan = visualFormationPlan(t.formation, t.width, t.defLine)
    const map = new Map(team.squad.map((p) => [p.id, p]))
    const formations: Formation[] = ['4-4-2', '4-3-3', '3-5-2']
    const plans: GamePlan[] = ['possession', 'balanced', 'counter', 'press', 'direct']
    const mentalities: Mentality[] = [1, 2, 3, 4, 5]
    const axes: TacticAxis[] = [1, 2, 3]

    const axisRow = (
      key: 'width' | 'press' | 'tempo' | 'defLine' | 'buildUp',
      label: string,
      labels: Record<TacticAxis, string>,
    ) => `
      <div class="tactics-axis">
        <span class="tactics-axis-label">${label}</span>
        <div class="tactics-row compact">
          ${axes
            .map(
              (v) =>
                `<button class="btn ghost ${t[key] === v ? 'active' : ''}" data-axis="${key}" data-val="${v}">${labels[v]}</button>`,
            )
            .join('')}
        </div>
      </div>`

    const previewPlayers = team.startingIds
      .map((id, i) => {
        const p = map.get(id)
        const slot = plan[i]!
        if (!p) {
          return `<div class="fifa-card empty tactics-preview-card" style="left:${slot.x}%;top:${slot.y}%">
            <div class="fifa-badge empty-badge"><span class="fifa-pos">${slot.role}</span></div>
          </div>`
        }
        const short = p.name.split(' ').pop() ?? p.name
        return `<div class="fifa-card tactics-preview-card" style="left:${slot.x}%;top:${slot.y}%" title="${p.name} · ${slot.role}">
          <div class="fifa-badge">
            <span class="fifa-ovr">${p.overall}</span>
            <span class="fifa-pos">${slot.role}</span>
          </div>
          <div class="fifa-meta"><span class="fifa-name">${short}</span></div>
        </div>`
      })
      .join('')

    return this.shell(
      `
      <section class="tactics-screen">
        <div class="tactics-screen-head">
          <h2>Taktyka</h2>
          <div class="actions compact">
            <button class="btn ghost" id="btn-tactics-back">Wróć</button>
            <button class="btn primary" id="btn-tactics-apply">Zastosuj</button>
          </div>
        </div>
        <div class="tactics-screen-grid">
          <div class="tactics-controls">
            <div class="tactics-block">
              <h3>Formacja</h3>
              <div class="tactics-row">
                ${formations
                  .map(
                    (f) =>
                      `<button class="btn ghost ${t.formation === f ? 'active' : ''}" data-form="${f}">${f}</button>`,
                  )
                  .join('')}
              </div>
            </div>
            <div class="tactics-block">
              <h3>Plan gry</h3>
              <div class="tactics-row">
                ${plans
                  .map(
                    (p) =>
                      `<button class="btn ghost ${t.plan === p ? 'active' : ''}" data-plan="${p}">${planLabel(p)}</button>`,
                  )
                  .join('')}
              </div>
            </div>
            <div class="tactics-block">
              <h3>Mentalność</h3>
              <div class="tactics-row compact">
                ${mentalities
                  .map(
                    (m) =>
                      `<button class="btn ghost ${t.mentality === m ? 'active' : ''}" data-mentality="${m}">${mentalityLabel(m)}</button>`,
                  )
                  .join('')}
              </div>
            </div>
            <div class="tactics-block tactics-deep">
              <h3>Osie</h3>
              ${axisRow('width', 'Szerokość', { 1: 'Wąsko', 2: 'Normalnie', 3: 'Szeroko' })}
              ${axisRow('press', 'Pressing', { 1: 'Niski', 2: 'Średni', 3: 'Wysoki' })}
              ${axisRow('tempo', 'Tempo', { 1: 'Wolne', 2: 'Normalne', 3: 'Szybkie' })}
              ${axisRow('defLine', 'Linia obrony', { 1: 'Niska', 2: 'Średnia', 3: 'Wysoka' })}
              ${axisRow('buildUp', 'Budowanie', { 1: 'Krótkie', 2: 'Mieszane', 3: 'Długie' })}
            </div>
            <p class="tactics-summary muted">
              ${planLabel(t.plan)} · ${mentalityLabel(t.mentality)} · ${widthLabel(t.width)} · linia ${defLineLabel(t.defLine)} · ${buildUpLabel(t.buildUp)} · tempo ${tempoLabel(t.tempo)}
            </p>
          </div>
          <div class="tactics-preview">
            <div class="pitch fifa-pitch tactics-pitch" aria-label="Podgląd formacji ${t.formation}">
              <div class="pitch-markings fifa-marks"></div>
              ${previewPlayers}
            </div>
            <p class="muted tactics-preview-hint">Podgląd — szerokość i linia zmieniają układ na boisku</p>
          </div>
        </div>
      </section>`,
      'Taktyka',
      'fifa',
    )
  }

  private bindTactics(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-form]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => setFormation(this.state, btn.dataset.form as Formation))
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => setGamePlan(this.state, btn.dataset.plan as GamePlan))
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-mentality]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => setMentality(this.state, Number(btn.dataset.mentality) as Mentality))
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-axis]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.axis as 'width' | 'press' | 'tempo' | 'defLine' | 'buildUp'
        const val = Number(btn.dataset.val) as TacticAxis
        this.go(() => setTacticAxis(this.state, key, val))
      })
    })
    const back = () =>
      this.go(() => {
        this.state.screen = 'hub'
      })
    this.root.querySelector('#btn-tactics-back')?.addEventListener('click', back)
    this.root.querySelector('#btn-tactics-apply')?.addEventListener('click', back)
  }

  private bindLineup(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-form]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => setFormation(this.state, btn.dataset.form as Formation))
      })
    })

    let dragPayload: { kind: 'slot' | 'bench'; slot?: number; id: string } | null = null

    const onDragStart = (el: HTMLElement, e: DragEvent) => {
      const kind = el.dataset.drag as 'slot' | 'bench'
      const id = el.dataset.id!
      const slot = el.dataset.slot != null ? Number(el.dataset.slot) : undefined
      dragPayload = { kind, id, slot }
      this.lineupDidDrag = false
      el.classList.add('dragging')
      e.dataTransfer?.setData('text/plain', id)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    }

    const onDragEnd = (el: HTMLElement) => {
      el.classList.remove('dragging')
      dragPayload = null
      this.lineupDidDrag = true
      this.root.querySelectorAll('.drag-over').forEach((n) => n.classList.remove('drag-over'))
    }

    this.root.querySelectorAll<HTMLElement>('[data-drag]').forEach((el) => {
      el.addEventListener('dragstart', (e) => onDragStart(el, e))
      el.addEventListener('dragend', () => onDragEnd(el))
    })

    this.root.querySelectorAll<HTMLElement>('[data-profile]').forEach((el) => {
      el.addEventListener('click', () => {
        if (this.lineupDidDrag) {
          this.lineupDidDrag = false
          return
        }
        this.profilePlayerId = el.dataset.profile ?? null
        this.render()
      })
    })
    this.root.querySelector('#btn-close-profile')?.addEventListener('click', () => {
      this.profilePlayerId = null
      this.render()
    })
    this.root.querySelector('#btn-renew')?.addEventListener('click', () => {
      const id = this.profilePlayerId
      if (!id) return
      const p = this.state.team?.squad.find((x) => x.id === id)
      if (!p) return
      const sug = suggestRenewTerms(p)
      this.go(() => {
        const err = renewContract(this.state, id, sug.years, sug.wage, sug.clause)
        if (err) pushTempAlert(err)
        else this.profilePlayerId = null
      })
    })
    this.root.querySelector('#btn-list-player')?.addEventListener('click', () => {
      const id = this.profilePlayerId
      if (!id) return
      this.go(() => {
        const err = listOwnPlayer(this.state, id)
        if (err) pushTempAlert(err)
        else {
          this.profilePlayerId = null
          this.hubTab = 'transfers'
        }
      })
    })
    this.root.querySelector('#btn-loan-out')?.addEventListener('click', () => {
      const id = this.profilePlayerId
      if (!id) return
      this.go(() => {
        const err = loanOutPlayer(this.state, id, 12, null)
        if (err) pushTempAlert(err)
        else this.profilePlayerId = null
      })
    })
    this.root.querySelector('#btn-loan-buy')?.addEventListener('click', () => {
      const id = this.profilePlayerId
      if (!id) return
      this.go(() => {
        const err = exerciseLoanBuyOption(this.state, id)
        if (err) pushTempAlert(err)
        else this.profilePlayerId = null
      })
    })
    this.root.querySelector('#profile-overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'profile-overlay') {
        this.profilePlayerId = null
        this.render()
      }
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
      this.profilePlayerId = null
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

  private liveMatchHtml(): string {
    const live = this.state.liveMatch!
    const home = getClub(live.homeId)
    const away = getClub(live.awayId)
    const clock =
      live.stoppageUntil != null && live.minute > (live.half === '1' ? 45 : 90)
        ? `${live.half === '1' ? 45 : 90}+${live.minute - (live.half === '1' ? 45 : 90)}'`
        : `${live.minute}'`
    const speeds: MatchSpeed[] = [1, 2, 4]

    const scoreboard = `
      <div class="live-scoreboard compact">
        <div class="live-team">${home.short}</div>
        <div class="live-score">${live.homeGoals} : ${live.awayGoals}</div>
        <div class="live-team">${away.short}</div>
        <div class="live-clock">${clock} · zmiany ${live.subsUsed}/3</div>
      </div>
      <div class="live-controls">
        <button class="btn ${live.paused ? 'primary' : 'ghost'}" id="btn-pause">${live.paused ? 'Wznów mecz' : 'Pauza'}</button>
        ${speeds
          .map(
            (s) =>
              `<button class="btn ghost ${live.speed === s ? 'active' : ''}" data-speed="${s}">${s}x</button>`,
          )
          .join('')}
      </div>`

    // Pauza = pełny skład jak przed meczem + zmęczenie
    if (live.paused) {
      return this.shell(
        `
        <section class="lineup-fifa live-pause-lineup">
          ${scoreboard}
          <p class="muted pause-hint">Przeciągnij: ławka ↔ boisko = zmiana (${3 - live.subsUsed} pozostało) · slot ↔ slot = przestawienie${live.onPitchIds.some((id, i) => !id && !live.redLockedSlots[i]) ? ' · uzupełnij pusty slot po kontuzji' : ''}${live.redLockedSlots.some(Boolean) ? ' · czerwona blokuje slot' : ''}</p>
          ${this.liveFifaLineupInner()}
        </section>`,
        'Pauza',
        'fifa',
      )
    }

    const feed = live.events
      .slice(0, 12)
      .map((e, i) => this.eventCardHtml(e, i === 0))
      .join('')

    return this.shell(
      `
      <section class="live-match">
        ${scoreboard}
        <div class="live-grid single">
          <div class="live-main">
            <h3>Przebieg</h3>
            <div class="event-feed">${feed || '<p class="muted">Mecz się zaczyna…</p>'}</div>
          </div>
        </div>
      </section>`,
      'Mecz',
      'fifa',
    )
  }

  private eventCardHtml(e: MatchEvent, featured = false): string {
    const labels: Record<MatchEvent['kind'], string> = {
      goal: 'GOL',
      yellow: 'ŻÓŁTA',
      red: 'CZERWONA',
      injury: 'KONTUZJA',
      sub: 'ZMIANA',
      chance: 'OKAZJA',
      fatigue: 'ZMĘCZENIE',
      kickoff: 'START',
      ht: 'PRZERWA',
      ft: 'KONIEC',
      motivation: 'MOTYWACJA',
    }
    const short = e.playerName ? (e.playerName.split(' ').pop() ?? e.playerName) : ''
    const headlineKinds: MatchEvent['kind'][] = ['goal', 'yellow', 'red', 'injury', 'sub']
    const title = short && headlineKinds.includes(e.kind) ? short : e.text
    let detail = ''
    if (e.kind === 'goal' && e.side === 'you' && this.state.liveMatch) {
      detail = `${this.state.liveMatch.homeGoals} : ${this.state.liveMatch.awayGoals}`
    } else if (e.kind === 'goal' && e.side === 'them') {
      detail = e.text
    } else if (e.kind === 'yellow' || e.kind === 'red' || e.kind === 'injury') {
      detail = e.side === 'them' ? e.text : e.kind === 'red' && e.text.includes('druga') ? 'Druga żółta' : ''
    } else if (title !== e.text) {
      detail = e.text
    }

    return `<article class="event-card kind-${e.kind} ${e.side ?? ''} ${featured ? 'featured fresh' : ''}">
      <div class="event-card-tag">${labels[e.kind]}</div>
      <div class="event-card-body">
        <div class="event-card-title">${title}</div>
        ${detail ? `<div class="event-card-detail">${detail}</div>` : ''}
      </div>
      <div class="event-card-min">${e.minute}'</div>
    </article>`
  }

  /** Boisko + ławka z paskami zmęczenia (pauza / przerwa). */
  private liveFifaLineupInner(): string {
    const live = this.state.liveMatch!
    const team = this.state.team!
    team.tactics = normalizeTactics(team.tactics)
    const map = new Map(team.squad.map((p) => [p.id, p]))
    const plan = visualFormationPlan(team.tactics.formation, team.tactics.width, team.tactics.defLine)

    const pitchPlayers = live.onPitchIds
      .map((id, i) => {
        const slot = plan[i]!
        if (!id) {
          const locked = live.redLockedSlots[i]
          return `<div class="fifa-card empty ${locked ? 'red-lock' : 'injury-hole'}" data-slot="${i}" style="left:${slot.x}%;top:${slot.y}%" title="${locked ? 'Czerwona — slot zablokowany' : 'Pusty slot — przeciągnij z ławki'}">
            <div class="fifa-badge empty-badge">
              <span class="fifa-pos">${slot.role}</span>
              <span class="fifa-empty-label">${locked ? 'CZERW.' : 'PUSTY'}</span>
            </div>
          </div>`
        }
        const p = map.get(id)!
        const mismatch = slotMismatch(p, slot)
        const short = p.name.split(' ').pop() ?? p.name
        const fat = Math.round(live.fatigue[id] ?? 50)
        const fatCls = fat < 30 ? 'crit' : fat < 55 ? 'low' : ''
        const y = live.yellows[id] ?? 0
        return `<div class="fifa-card ${mismatch ? 'mismatch' : ''}" draggable="true" data-drag="slot" data-slot="${i}" data-id="${id}" style="left:${slot.x}%;top:${slot.y}%" title="${p.name} · ${slot.role} · zmęczenie ${fat}%${y ? ` · żółte ${y}` : ''}">
          <div class="fifa-badge">
            <span class="fifa-ovr">${p.overall}</span>
            <span class="fifa-pos">${slot.role}</span>
          </div>
          ${y ? `<span class="fifa-card-mark yellow" title="Żółta kartka">YK</span>` : ''}
          <div class="fifa-fatigue ${fatCls}" title="Zmęczenie ${fat}%"><i style="width:${fat}%"></i></div>
          <div class="fifa-meta">
            <span class="fifa-name">${short}</span>
            ${formArrowHtml(p.form)}
          </div>
        </div>`
      })
      .join('')

    const bench = live.benchIds
      .map((id) => {
        const p = map.get(id)!
        const fat = Math.round(live.fatigue[id] ?? 90)
        return `<div class="fifa-bench-row" draggable="true" data-drag="bench" data-id="${id}" title="${p.name} · ${ROLE_FULL[p.role]} · świeżość ${fat}%">
          <span class="fifa-bench-role">${p.role}</span>
          <span class="fifa-bench-ovr">${p.overall}</span>
          <span class="fifa-bench-name">${p.name.split(' ').pop()}</span>
          <span class="fifa-bench-fat"><i style="width:${fat}%"></i></span>
        </div>`
      })
      .join('')

    return `
      <div class="lineup-layout fifa-layout">
        <div class="pitch fifa-pitch" aria-label="Skład">
          <div class="pitch-markings fifa-marks"></div>
          ${pitchPlayers}
        </div>
        <aside class="bench-panel fifa-squad">
          <div class="fifa-squad-head">
            <h3>Ławka</h3>
            <span class="muted">${live.subsUsed}/3 zmian</span>
          </div>
          <div class="bench-strip vertical fifa-list" data-drop="bench">${bench || '<p class="muted">Pusta ławka</p>'}</div>
        </aside>
      </div>`
  }

  private bindLiveMatch(): void {
    this.root.querySelector('#btn-pause')?.addEventListener('click', () => {
      this.go(() => {
        const live = this.state.liveMatch!
        setMatchPaused(this.state, !live.paused)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => setMatchSpeed(this.state, Number(btn.dataset.speed) as MatchSpeed))
      })
    })

    if (this.state.liveMatch?.paused) this.bindLiveLineupDrag()
  }

  /** Drag: slot↔slot = przestawienie, ławka↔boisko = zmiana. */
  private bindLiveLineupDrag(): void {
    let dragPayload: { kind: 'slot' | 'bench'; slot?: number; id: string } | null = null

    this.root.querySelectorAll<HTMLElement>('[data-drag]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        const kind = el.dataset.drag as 'slot' | 'bench'
        dragPayload = {
          kind,
          id: el.dataset.id!,
          slot: el.dataset.slot != null ? Number(el.dataset.slot) : undefined,
        }
        el.classList.add('dragging')
        e.dataTransfer?.setData('text/plain', el.dataset.id!)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      })
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging')
        dragPayload = null
        this.root.querySelectorAll('.drag-over').forEach((n) => n.classList.remove('drag-over'))
      })
    })

    this.root.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      el.addEventListener('dragover', (e) => {
        e.preventDefault()
        el.classList.add('drag-over')
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
            liveSwapOnPitch(this.state, dragPayload!.slot, targetSlot)
          } else if (dragPayload!.kind === 'bench') {
            const outId = this.state.liveMatch!.onPitchIds[targetSlot] ?? null
            const err = liveSubstitute(this.state, outId, dragPayload!.id, targetSlot)
            if (err) pushTempAlert(err)
          }
          if (this.state.liveMatch && this.state.liveMatch.half !== 'ht') {
            this.state.liveMatch.paused = true
          }
        })
      })
    })

    this.root.querySelectorAll<HTMLElement>('[data-drag="bench"]').forEach((el) => {
      el.addEventListener('dragover', (e) => {
        e.preventDefault()
        el.classList.add('drag-over')
      })
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'))
      el.addEventListener('drop', (e) => {
        e.preventDefault()
        el.classList.remove('drag-over')
        if (!dragPayload || dragPayload.kind !== 'slot') return
        const outId = dragPayload.id
        const inId = el.dataset.id!
        this.go(() => {
          const err = liveSubstitute(this.state, outId, inId)
          if (err) pushTempAlert(err)
          if (this.state.liveMatch && this.state.liveMatch.half !== 'ht') {
            this.state.liveMatch.paused = true
          }
        })
      })
    })
  }

  private halfTimeHtml(): string {
    const live = this.state.liveMatch!
    const home = getClub(live.homeId)
    const away = getClub(live.awayId)

    const motivation = live.motivationDone
      ? `<p class="meta">Motywacja ustawiona.</p>`
      : `<div class="chat-replies">
          <button class="chat-reply" data-mot="calm"><span class="chat-reply-text">Spokojnie, trzymamy plan</span><span class="chat-reply-hint">Bez zmian tempa</span></button>
          <button class="chat-reply" data-mot="push"><span class="chat-reply-text">Podnieść tempo!</span><span class="chat-reply-hint">+siła, większe zmęczenie</span></button>
          <button class="chat-reply" data-mot="defend"><span class="chat-reply-text">Zamknąć mecz</span><span class="chat-reply-hint">Broń wyniku, mniej zmęczenia</span></button>
        </div>`

    return this.shell(
      `
      <section class="lineup-fifa live-pause-lineup">
        <div class="live-scoreboard compact">
          <div class="live-team">${home.short}</div>
          <div class="live-score">${live.homeGoals} : ${live.awayGoals}</div>
          <div class="live-team">${away.short}</div>
          <div class="live-clock">HT · zmiany ${live.subsUsed}/3</div>
        </div>
        <h2>Przerwa</h2>
        <h3 class="hub-sub">Motywacja</h3>
        ${motivation}
        <p class="muted pause-hint">Przeciągnij: ławka ↔ boisko = zmiana · slot ↔ slot = przestawienie</p>
        ${this.liveFifaLineupInner()}
        <div class="actions" style="margin-top:14px">
          <button class="btn primary" id="btn-second">Druga połowa</button>
        </div>
      </section>`,
      'Przerwa',
      'fifa',
    )
  }

  private bindHalfTime(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-mot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => applyHalftimeMotivation(this.state, btn.dataset.mot as MotivationId))
      })
    })
    this.bindLiveLineupDrag()
    this.root.querySelector('#btn-second')?.addEventListener('click', () => {
      this.go(() => startSecondHalf(this.state))
    })
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
    const trustDelta =
      r.boardTrustDelta != null
        ? `${r.boardTrustDelta > 0 ? '+' : ''}${r.boardTrustDelta}`
        : null
    return this.shell(
      `
      <section class="panel">
        <h2>${r.sacked ? 'Zwolniony' : `Sezon ${r.year}`}</h2>
        <p class="meta">${league.name} · <strong>${r.place}.</strong> miejsce · ${r.points} pkt</p>
        <p>Bilans: ${r.record.won}-${r.record.drawn}-${r.record.lost} · bramki ${r.record.goalsFor}:${r.record.goalsAgainst}</p>
        ${r.cupSummary ? `<p class="meta">${r.cupSummary}</p>` : ''}
        ${
          r.boardGoalLabel
            ? `<div class="board-report ${r.sacked ? 'sacked' : ''}">
                <p><strong>Cel zarządu:</strong> ${r.boardGoalLabel}</p>
                <p>${r.boardSummary ?? ''}</p>
                ${
                  trustDelta != null
                    ? `<p class="muted">Zaufanie: ${r.boardTrustBefore}% → ${r.boardTrustAfter}% (${trustDelta})</p>`
                    : ''
                }
              </div>`
            : ''
        }
        <p>${r.narrative}</p>
        ${r.financeSummary ? `<p class="meta">Finanse: ${r.financeSummary}</p>` : ''}
        ${
          r.sacked
            ? `<p class="meta down">Zarząd rozwiązał kontrakt. Szukaj nowego klubu.</p>`
            : r.promotion
              ? `<p class="meta up">Awans → ${next}</p>`
              : r.relegation
                ? `<p class="meta down">Spadek → ${next}</p>`
                : `<p class="muted">Kolejny sezon: ${next}</p>`
        }
        <div class="actions">
          ${
            r.sacked
              ? `<button class="btn primary" id="btn-seek-club">Szukaj nowego klubu</button>`
              : `<button class="btn primary" id="btn-next-season">Nowy sezon</button>`
          }
        </div>
      </section>`,
      'Raport',
    )
  }

  private bindSeasonReport(): void {
    this.root.querySelector('#btn-next-season')?.addEventListener('click', () => {
      this.go(() => startNextSeason(this.state))
    })
    this.root.querySelector('#btn-seek-club')?.addEventListener('click', () => {
      this.go(() => seekNewClub(this.state))
    })
  }
}

function pushTempAlert(msg: string): void {
  window.alert(msg)
}