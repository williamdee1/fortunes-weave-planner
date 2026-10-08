import { useApp } from '../context/AppContext'
import { Tooltip } from '../components/Tooltip'
import { STAT_KEYS } from '../model/types'
import { PRESET_OBJECTIVES } from '../model/growth'
import type { ObjectiveWeights } from '../model/types'

export function SettingsView() {
  const { settings, updateSettings, exportData, importData } = useApp()

  function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = e => {
        const text = e.target?.result
        if (typeof text === 'string') {
          const ok = importData(text)
          if (!ok) alert('Could not parse the file. Make sure it was exported from this app.')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const chapterLevelCurve = settings.chapterLevelCurve

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="flex items-center gap-4 mb-3">
        <h1>Settings</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={exportData}>Export plans JSON</button>
          <button className="btn btn-secondary btn-sm" onClick={handleImport}>Import plans JSON</button>
        </div>
      </div>

      {/* ── Auto-level ── */}
      <div className="card settings-group">
        <h3>Auto-level model
          <Tooltip text="How stats are estimated for levels the character gained before you recruited them. The exact formula is unknown — this is a tunable approximation (§4.3)." />
        </h3>

        <div className="settings-row">
          <div>
            <label>Auto-level efficiency</label>
            <div className="settings-hint">
              Fraction of normal per-level gains used during auto-levelling (no class/mount bonuses apply). Default 0.85.
            </div>
          </div>
          <div className="control">
            <input
              type="range" min={0.5} max={1.0} step={0.05}
              value={settings.autoLevelEfficiency}
              onChange={e => updateSettings({ autoLevelEfficiency: parseFloat(e.target.value) })}
              style={{ width: 120 }}
            />
            <span style={{ minWidth: '2.5rem', textAlign: 'right' }}>
              {(settings.autoLevelEfficiency * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <label>Mu: base growths during auto-level</label>
            <div className="settings-hint">
              When on, Mu's auto-level uses her base 30% Str growths, not the Signs of Growth values. Player reports suggest the ability doesn't activate during auto-levelling.
            </div>
          </div>
          <div className="control">
            <label>
              <input type="checkbox"
                checked={true}
                readOnly
                disabled
                style={{ marginRight: '.4rem' }}
              />
              Always on (base growths for auto-level)
            </label>
          </div>
        </div>
      </div>

      {/* ── Mu ── */}
      <div className="card settings-group">
        <h3>Mu — Signs of Growth
          <Tooltip text="Mu's personal ability raises her growths from 30/30/5/… to 50/50/25/… post-join. Default on. The trigger condition isn't fully documented." />
        </h3>
        <div className="settings-row">
          <div>
            <label>Signs of Growth active (post-join)</label>
            <div className="settings-hint">Uses boosted 50/50/25/… growths for levels after joining. Auto-level always uses base growths regardless.</div>
          </div>
          <input type="checkbox"
            checked={settings.muSignsOfGrowthActive}
            onChange={e => updateSettings({ muSignsOfGrowthActive: e.target.checked })}
          />
        </div>
      </div>

      {/* ── Class passives ── */}
      <div className="card settings-group">
        <h3>Class passive growths
          <Tooltip text="Level-gated growth bonuses from class abilities: Charioteer's Path (Lv 35, Lv 45) and Elephant Rider's Path (Lv 45). Source confidence: medium." />
        </h3>
        <div className="settings-row">
          <div>
            <label>Apply class passives</label>
            <div className="settings-hint">Charioteer's Path and Elephant Rider's Path extra growths. Medium confidence source.</div>
          </div>
          <input type="checkbox"
            checked={settings.classPassivesEnabled}
            onChange={e => updateSettings({ classPassivesEnabled: e.target.checked })}
          />
        </div>
      </div>

      {/* ── Mounts ── */}
      <div className="card settings-group">
        <h3>Mount bonds</h3>
        <div className="settings-row">
          <div>
            <label>Normal mount max bond</label>
            <div className="settings-hint">Most mounts cap at Bond 5. Default 5.</div>
          </div>
          <input type="number" min={1} max={6} step={1}
            value={settings.maxBondForNormalMount}
            onChange={e => updateSettings({ maxBondForNormalMount: parseInt(e.target.value) || 5 })}
          />
        </div>
        <div className="settings-row">
          <div>
            <label>Unique mount max bond (Rocinan, Bucephalus)</label>
            <div className="settings-hint">Rocinan (Io) and Bucephalus (Alexandra) go to Bond 6. Default 6.</div>
          </div>
          <input type="number" min={1} max={6} step={1}
            value={settings.maxBondForUniqueMount}
            onChange={e => updateSettings({ maxBondForUniqueMount: parseInt(e.target.value) || 6 })}
          />
        </div>
      </div>

      {/* ── Exams ── */}
      <div className="card settings-group">
        <h3>Class exams</h3>
        <div className="settings-row">
          <div>
            <label>Allow early exams</label>
            <div className="settings-hint">Allow taking exams below the tier's ideal level (pass chance is worse).</div>
          </div>
          <input type="checkbox"
            checked={settings.allowEarlyExams}
            onChange={e => updateSettings({ allowEarlyExams: e.target.checked })}
          />
        </div>
        {settings.allowEarlyExams && (
          <div className="settings-row">
            <div>
              <label>Early exam slack (levels)</label>
              <div className="settings-hint">Exams allowed from (idealLevel − slack). Default 5.</div>
            </div>
            <input type="number" min={0} max={20} step={1}
              value={settings.earlyExamSlack}
              onChange={e => updateSettings({ earlyExamSlack: parseInt(e.target.value) || 5 })}
            />
          </div>
        )}
        <div className="settings-row">
          <div>
            <label>Route-exclusive classes persist save-wide</label>
            <div className="settings-hint">Once unlocked on one route, the class is available on future routes. Game8 confirms this. Default on.</div>
          </div>
          <input type="checkbox"
            checked={settings.unlockPersistsSaveWide}
            onChange={e => updateSettings({ unlockPersistsSaveWide: e.target.checked })}
          />
        </div>
      </div>

      {/* ── Optimizer ── */}
      <div className="card settings-group">
        <h3>Optimizer</h3>
        <div className="settings-row">
          <div>
            <label>Part III start level</label>
            <div className="settings-hint">Level at which Part III begins. Master and Divine classes only available from here. Default 38.</div>
          </div>
          <input type="number" min={35} max={60} step={1}
            value={settings.part3StartLevel}
            onChange={e => updateSettings({ part3StartLevel: parseInt(e.target.value) || 38 })}
          />
        </div>
        <div className="settings-row">
          <div>
            <label>Final target level</label>
            <div className="settings-hint">Default optimisation target. Default 50. Max 99.</div>
          </div>
          <input type="number" min={10} max={99} step={1}
            value={settings.finalTargetLevel}
            onChange={e => updateSettings({ finalTargetLevel: parseInt(e.target.value) || 50 })}
          />
        </div>
        <div className="settings-row">
          <div>
            <label>Part I end level</label>
            <div className="settings-hint">Default end-of-Part-I target for roster scoring. Default 37.</div>
          </div>
          <input type="number" min={20} max={50} step={1}
            value={settings.part1EndLevel}
            onChange={e => updateSettings({ part1EndLevel: parseInt(e.target.value) || 37 })}
          />
        </div>
        <div className="settings-row">
          <div>
            <label>Class switch penalty</label>
            <div className="settings-hint">Cost subtracted from score each time the optimizer switches classes. Default 0 (no penalty).</div>
          </div>
          <input type="number" min={0} max={10} step={0.5}
            value={settings.switchPenalty}
            onChange={e => updateSettings({ switchPenalty: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      {/* ── Growth clamp ── */}
      <div className="card settings-group">
        <h3>Growth rate clamp
          <Tooltip text="Total growth is clamped to [min, max]. Default [0, 100]. No evidence of out-of-range behaviour in this game." />
        </h3>
        <div className="settings-row">
          <label>Clamp min</label>
          <input type="number" min={-100} max={0} step={5}
            value={settings.growthClampMin}
            onChange={e => updateSettings({ growthClampMin: parseInt(e.target.value) })}
          />
        </div>
        <div className="settings-row">
          <label>Clamp max</label>
          <input type="number" min={100} max={200} step={5}
            value={settings.growthClampMax}
            onChange={e => updateSettings({ growthClampMax: parseInt(e.target.value) })}
          />
        </div>
      </div>

      {/* ── Chapter → level curve ── */}
      <div className="card settings-group">
        <h3>Chapter → level curve
          <Tooltip text="The estimated army level at each chapter. Used to map Renown requirements and join chapter estimates to levels. Source: Neoseeker + Game8 walkthroughs." />
        </h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {chapterLevelCurve.map((_, i) => <th key={i}>Ch {i + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                {chapterLevelCurve.map((pair, i) => (
                  <td key={i}>
                    <input type="number" min={1} max={99} step={1}
                      value={pair[0]}
                      style={{ width: '3.5rem' }}
                      onChange={e => {
                        const v = parseInt(e.target.value) || pair[0]
                        const newCurve = chapterLevelCurve.map((p, j) => j === i ? [v, v] as [number, number] : p)
                        updateSettings({ chapterLevelCurve: newCurve })
                      }}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Default objective weights ── */}
      <div className="card settings-group">
        <h3>Objective weight presets</h3>
        <p className="text-sm text-muted mt-2">
          These presets are used as defaults in the optimizer and roster scorer. Edit them per-character in the planner.
        </p>
        <div style={{ marginTop: '.75rem' }}>
          {Object.entries(PRESET_OBJECTIVES).map(([name, weights]) => (
            <div key={name} style={{ marginBottom: '.5rem' }}>
              <strong style={{ fontSize: '.875rem' }}>{name}</strong>
              <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap', marginTop: '.2rem' }}>
                {STAT_KEYS.map(k => (
                  <span key={k} className="badge badge-neutral" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {k} {(weights as ObjectiveWeights)[k]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: '.75rem' }}>
        <button className="btn btn-danger btn-sm"
          onClick={() => {
            if (confirm('Reset all settings to defaults? Plans are kept.')) {
              updateSettings({
                autoLevelEfficiency: 0.85,
                growthClampMin: 0,
                growthClampMax: 100,
                maxBondForNormalMount: 5,
                maxBondForUniqueMount: 6,
                classPassivesEnabled: true,
                muSignsOfGrowthActive: true,
                unlockPersistsSaveWide: true,
                earlyExamSlack: 5,
                allowEarlyExams: false,
                part3StartLevel: 38,
                switchPenalty: 0,
                part1EndLevel: 37,
                finalTargetLevel: 50,
              })
            }
          }}
        >
          Reset settings to defaults
        </button>
      </div>
    </div>
  )
}
