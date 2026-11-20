import { useState } from 'react';
import { Card, Empty, LevelChip, SkillBar } from '../app/ui';
import { skillMap, studentsToTalkTo, totalScore } from '../skills';
import { useStore } from '../store';
import { CheckIns } from './CheckIns';

export function StudentsPage() {
  const students = useStore((s) => s.students);
  const assignments = useStore((s) => s.assignments);
  const gradesMap = useStore((s) => s.grades);
  const grades = Object.values(gradesMap);
  const [open, setOpen] = useState<string | null>(null);

  if (!grades.length) return <Empty>Grade some answers first. Skill maps are built from rubric scores.</Empty>;
  const talk = studentsToTalkTo(students, grades, assignments);

  return (
    <div className="stack">
      <CheckIns />
      <Card title="Students to talk to">
        {talk.length === 0 ? (
          <Empty>Nobody has a weak skill right now. 🎉</Empty>
        ) : (
          <ul className="talk-list">
            {talk.map((t) => (
              <li key={t.student.id} className="talk-item">
                <div>
                  <strong>{t.student.name}</strong>
                  <div className="muted small">{Math.round(t.percent * 100)}% overall</div>
                </div>
                <div className="talk-weak">
                  {t.weak.map((w) => (
                    <span key={w.skill} className="chip chip-weak">{w.skill}</span>
                  ))}
                </div>
                <button className="btn" onClick={() => setOpen(t.student.id)}>Talking points</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="student-grid">
        {students.map((st) => {
          const map = skillMap(st.id, grades, assignments);
          if (!map.length) return null;
          const mine = grades.filter((g) => g.studentId === st.id);
          const isOpen = open === st.id;
          return (
            <Card key={st.id} className={isOpen ? 'open' : ''} title={st.name} actions={<button className="btn btn-small" onClick={() => setOpen(isOpen ? null : st.id)}>{isOpen ? 'Close' : 'Details'}</button>}>
              <ul className="skills">
                {map.map((m) => (
                  <li key={m.skill}>
                    <span className="skill-name">{m.skill}</span>
                    <SkillBar earned={m.earned} possible={m.possible} level={m.level} />
                    <LevelChip level={m.level} />
                  </li>
                ))}
              </ul>
              {isOpen && (
                <div className="talking">
                  <h3>Talking points for {st.name.split(' ')[0]}</h3>
                  <ul>
                    {map.filter((m) => m.level !== 'strong').map((m) => (
                      <li key={m.skill}>Ask how they approach <strong>{m.skill.toLowerCase()}</strong> ({m.earned}/{m.possible} points so far).</li>
                    ))}
                    {map.filter((m) => m.level === 'strong').slice(0, 1).map((m) => (
                      <li key={m.skill}>Start with a strength: they are doing well in <strong>{m.skill.toLowerCase()}</strong>.</li>
                    ))}
                  </ul>
                  <h3>What went wrong, per assignment</h3>
                  <ul>
                    {mine.map((g) => {
                      const a = assignments.find((x) => x.id === g.assignmentId);
                      if (!a) return null;
                      const t = totalScore(g, a);
                      return (
                        <li key={g.submissionId}>
                          <strong>{a.title}</strong> ({t.earned}/{t.possible}): {g.misconception === 'None' ? 'no problems found.' : g.misconception}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="muted small">Skill levels come from rubric scores (80%+ strong, under 50% needs help), not from AI guesses.</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
