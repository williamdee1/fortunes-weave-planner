/**
 * App.tsx — Root component placeholder.
 * Phase 3 will replace this with the full six-view UI.
 */
import type { FC } from 'react'
import charGrowths from './data/charGrowths.json'
import classGrowths from './data/classGrowths.json'
import meta from './data/meta.json'

const App: FC = () => {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '60rem', margin: '0 auto' }}>
      <h1>Fortune's Weave Planner</h1>
      <p>
        <em>Fire Emblem: Fortune's Weave</em> — Class &amp; Recruitment Planner
      </p>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>
        Data built at: {meta.builtAt} &mdash;{' '}
        {meta.characterCount} characters, {meta.classCount} classes
      </p>

      <h2>Phase 1 complete — data pipeline ✓ &nbsp; model layer ✓ &nbsp; tests ✓</h2>
      <p>
        The model layer is ready. Phase 3 will add the full UI:
        Route Selector, Character Planner (manual + optimize), Class Browser,
        Settings, and Data Issues panel.
      </p>

      <details>
        <summary>Character growths ({charGrowths.length})</summary>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          <thead>
            <tr>
              {['Name', 'HP', 'Str', 'Mag', 'Spd', 'Dex', 'Def', 'Res', 'Lck', 'Cha'].map(h => (
                <th key={h} style={{ border: '1px solid #ccc', padding: '2px 6px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(charGrowths as Array<{ name: string; growths: Record<string, number> }>).map(c => (
              <tr key={c.name}>
                <td style={{ border: '1px solid #ccc', padding: '2px 6px' }}>{c.name}</td>
                {['HP', 'Str', 'Mag', 'Spd', 'Dex', 'Def', 'Res', 'Lck', 'Cha'].map(s => (
                  <td key={s} style={{ border: '1px solid #ccc', padding: '2px 6px', textAlign: 'right' }}>
                    {c.growths[s]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details style={{ marginTop: '1rem' }}>
        <summary>Classes ({classGrowths.length})</summary>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          <thead>
            <tr>
              {['Name', 'Tier', 'Ideal Lv', 'Renown', 'Str', 'Spd', 'Def', 'Res'].map(h => (
                <th key={h} style={{ border: '1px solid #ccc', padding: '2px 6px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(classGrowths as Array<{ name: string; tier: string; idealExamLevel: number | null; renownReq: string | number | null; growths: Record<string, number> }>).map(c => (
              <tr key={c.name}>
                <td style={{ border: '1px solid #ccc', padding: '2px 6px' }}>{c.name}</td>
                <td style={{ border: '1px solid #ccc', padding: '2px 6px' }}>{c.tier}</td>
                <td style={{ border: '1px solid #ccc', padding: '2px 6px', textAlign: 'right' }}>{c.idealExamLevel ?? '—'}</td>
                <td style={{ border: '1px solid #ccc', padding: '2px 6px', textAlign: 'right' }}>{c.renownReq ?? '—'}</td>
                {['Str', 'Spd', 'Def', 'Res'].map(s => (
                  <td key={s} style={{ border: '1px solid #ccc', padding: '2px 6px', textAlign: 'right' }}>
                    {c.growths[s]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </main>
  )
}

export default App
