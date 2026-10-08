import { DATA_ISSUES, classGrowths, mountGrowths } from '../data/loader'

export function DataIssuesView() {
  const unknownSkillClasses = classGrowths.filter(
    c => c.skillRequirements === null && c.tier !== 'Base'
  )
  const unverifiedMounts = mountGrowths.filter(m => m.nameUnverified)

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ marginBottom: '.75rem' }}>Data Issues</h1>
      <p className="text-sm text-muted" style={{ marginBottom: '1rem' }}>
        All known uncertainties, disputed values, and missing data. Anything marked ⚠ in the app
        comes from this list. See <code>data/raw/DATA_NOTES.md</code> for full sourcing details.
      </p>

      {/* ── Confidence-level legend ── */}
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <h3 style={{ marginBottom: '.5rem' }}>Confidence levels used in this app</h3>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', fontSize: '.8125rem' }}>
          <span><strong>HIGH</strong> — in-game visible or cross-confirmed by multiple guides</span>
          <span><strong>MEDIUM</strong> — one reliable source; plausible but unconfirmed</span>
          <span><strong>LOW</strong> — estimated/inferred; significant uncertainty</span>
        </div>
      </div>

      {/* ── Known unknowns ── */}
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <h3 style={{ marginBottom: '.5rem' }}>Known unknowns (hardcoded in the model with toggleable defaults)</h3>
        <ol style={{ paddingLeft: '1.2rem', fontSize: '.8125rem', lineHeight: 2 }}>
          <li>
            <strong>Auto-level formula (LOW confidence).</strong>{' '}
            The default efficiency (85%) is a guess calibrated against player reports.
            Adjustable in Settings → Auto-level efficiency.
          </li>
          <li>
            <strong>Fixed vs. scaling join level (MEDIUM confidence).</strong>{' '}
            It is unconfirmed whether recruits join at a fixed level per chapter or scale to the army level.
            The chapter → level curve in Settings is editable.
          </li>
          <li>
            <strong>Base stats for recruitable characters.</strong>{' '}
            Only 18 story characters have confirmed base stats. Recruitable characters show "gains since base" instead of absolute stats.
            You can add base stats from your own save in <code>data/overrides.json → userBaseStats</code>.
          </li>
          <li>
            <strong>Stat and level caps.</strong>{' '}
            Players report reaching Lv 99 with exploits; the cap is unknown. Timeline is capped at 99, default target is 50.
          </li>
          <li>
            <strong>Charioteer's Path + mount doubling stacking.</strong>{' '}
            Both sourced from the KR community DB. Exact stacking behaviour is unconfirmed.
            Toggle class passives in Settings.
          </li>
          <li>
            <strong>Part II and Part III start levels.</strong>{' '}
            User-configurable in Settings → Part III start level.
          </li>
          <li>
            <strong>Route-exclusive class availability after unlock.</strong>{' '}
            Game8 says classes unlocked on one route are available on others. Toggle in Settings.
          </li>
          <li>
            <strong>Mu's Signs of Growth trigger condition.</strong>{' '}
            The ability clearly exists but the exact activation is undocumented. Toggle in Settings.
          </li>
          <li>
            <strong>When exactly route-exclusive classes become available on other routes.</strong>{' '}
            Exact mechanism is unconfirmed.
          </li>
        </ol>
      </div>

      {/* ── Classes with unknown skill requirements ── */}
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <h3 style={{ marginBottom: '.5rem' }}>
          ⚠ Classes with unknown skill requirements ({unknownSkillClasses.length})
        </h3>
        <p className="text-sm text-muted" style={{ marginBottom: '.5rem' }}>
          These classes show an "unverified requirements" badge in the Class Browser.
          The planner lets you tick "meets requirements" manually.
        </p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Class</th><th>Tier</th><th>Note</th></tr></thead>
            <tbody>
              {unknownSkillClasses.map(c => (
                <tr key={c.name}>
                  <td><strong>{c.name}</strong></td>
                  <td><span className={`badge badge-tier-${c.tier}`}>{c.tier}</span></td>
                  <td className="text-muted text-sm">Skill requirements not yet documented</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Unverified mount names ── */}
      {unverifiedMounts.length > 0 && (
        <div className="card" style={{ marginBottom: '.75rem' }}>
          <h3 style={{ marginBottom: '.5rem' }}>⚠ Unverified English mount names ({unverifiedMounts.length})</h3>
          <p className="text-sm text-muted" style={{ marginBottom: '.5rem' }}>
            These mount names are translated from the Korean community database. English in-game names are not confirmed.
          </p>
          <ul style={{ paddingLeft: '1.2rem', fontSize: '.8125rem' }}>
            {unverifiedMounts.map(m => <li key={m.subtype}>{m.subtype}</li>)}
          </ul>
        </div>
      )}

      {/* ── Disputed recruitment requirements ── */}
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <h3 style={{ marginBottom: '.5rem' }}>⚠ Disputed recruitment requirements</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Character</th><th>Route</th><th>Dispute</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>Nydine</strong></td>
                <td>All</td>
                <td className="text-sm">Raider King: 2× Bronze Axes all routes. Other sources: 3× Iron Axes on Theodora/Leda.</td>
              </tr>
              <tr>
                <td><strong>Yang Jie</strong></td>
                <td>Theodora</td>
                <td className="text-sm">Raider King: Support 1 / Renown 9. Other sources: Support 3 / Renown 9.</td>
              </tr>
              <tr>
                <td><strong>Esmeralda</strong></td>
                <td>Cai</td>
                <td className="text-sm">Raider King: Support 2. RPG Site + GamesHedge: Support 3.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── TODO data stubs ── */}
      <div className="card">
        <h3 style={{ marginBottom: '.5rem' }}>TODO(data) stubs in overrides.json</h3>
        <ul style={{ paddingLeft: '1.2rem', fontSize: '.8125rem', lineHeight: 1.9 }}>
          {DATA_ISSUES
            .filter(i => i.message.startsWith('TODO'))
            .map((i, idx) => <li key={idx}>{i.message}</li>)
          }
        </ul>
      </div>
    </div>
  )
}
