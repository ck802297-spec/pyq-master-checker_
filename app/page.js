"use client";

import { useMemo, useState } from "react";
import Tesseract from "tesseract.js";

const MARKS = { A: 2, B: 5, C: 10 };

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s?]/gu, "")
    .trim();
}

function codeNorm(s) {
  return norm(s).replace(/\s+/g, "-");
}

function exact(a, b) {
  return norm(a) !== "" && norm(a) === norm(b);
}

function parse(text, file) {
  const lines = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  let year = "";
  let code = "";
  let section = "";
  const questions = [];

  for (const line of lines) {
    const y = line.match(/\b20\d{2}\b/);
    if (!year && y) year = y[0];

    const c = line.match(
      /\b[A-Z]{2,10}[-\s]?\d{2,4}[-\s]?\d{2}\b/i
    );

    if (c) code = c[0].toUpperCase().replace(/\s+/g, "-");

    const s = line.match(/^(?:SECTION|SEC\.?)\s*([ABC])\b/i);

    if (s) {
      section = s[1].toUpperCase();
      continue;
    }

    const q = line.match(
      /^(?:Q(?:UESTION)?\.?\s*)?(\d+(?:\.\d+)?)[\)\.\-:]\s*(.+)$/i
    );

    if (q) {
      questions.push({
        id: crypto.randomUUID(),
        number: q[1],
        text: q[2],
        section,
        marks: MARKS[section] || null,
        year,
        code,
        file,
      });
    } else if (questions.length && line.length > 3) {
      questions[questions.length - 1].text += " " + line;
    }
  }

  return {
    id: crypto.randomUUID(),
    file,
    year,
    code,
    questions,
    confidence: 0,
  };
}

export default function Home() {
  const [papers, setPapers] = useState([]);
  const [searchCode, setSearchCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState("");

  async function upload(e) {
    const fs = [...(e.target.files || [])].filter((f) =>
      f.type.startsWith("image/")
    );

    if (!fs.length) return;

    setBusy(true);
    setMsg("Questions पढ़े जा रहे हैं...");

    const out = [];

    for (let i = 0; i < fs.length; i++) {
      try {
        const r = await Tesseract.recognize(fs[i], "eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(
                Math.round(((i + m.progress) / fs.length) * 100)
              );
            }
          },
        });

        const p = parse(r.data.text, fs[i].name);
        p.confidence = r.data.confidence;
        out.push(p);
      } catch (e) {
        out.push({
          id: crypto.randomUUID(),
          file: fs[i].name,
          year: "",
          code: "",
          questions: [],
          confidence: 0,
        });
      }
    }

    setPapers((x) => [...x, ...out]);
    setBusy(false);
    setProgress(100);
    setMsg(out.length + " paper process हुए।");
  }

  function updatePaper(id, k, v) {
    setPapers((ps) =>
      ps.map((p) => (p.id === id ? { ...p, [k]: v } : p))
    );
  }

  function updateQ(pid, qid, k, v) {
    setPapers((ps) =>
      ps.map((p) =>
        p.id !== pid
          ? p
          : {
              ...p,
              questions: p.questions.map((q) =>
                q.id === qid ? { ...q, [k]: v } : q
              ),
            }
      )
    );
  }

  const report = useMemo(() => {
    const wanted = codeNorm(searchCode);

    const selected = papers.filter(
      (p) => !wanted || codeNorm(p.code) === wanted
    );

    const source = selected.flatMap((p) => p.questions);

    return source.map((q) => {
      const exactMatches = [];
      const review = [];

      for (const p of papers) {
        for (const x of p.questions) {
          if (x.id === q.id) continue;

          if (exact(q.text, x.text)) {
            exactMatches.push(x);
          } else {
            const a = new Set(
              norm(q.text)
                .split(" ")
                .filter((w) => w.length > 2)
            );

            const b = new Set(
              norm(x.text)
                .split(" ")
                .filter((w) => w.length > 2)
            );

            let inter = 0;

            for (const w of a) {
              if (b.has(w)) inter++;
            }

            const union = new Set([...a, ...b]).size;
            const score = union ? inter / union : 0;

            if (score >= 0.9) {
              review.push({ ...x, score });
            }
          }
        }
      }

      const years = [
        ...new Set(
          [q.year, ...exactMatches.map((x) => x.year)].filter(Boolean)
        ),
      ];

      return {
        ...q,
        exactMatches,
        review,
        years,
        repeatCount: years.length,
      };
    });
  }, [papers, searchCode]);

  function exportData() {
    const blob = new Blob(
      [JSON.stringify({ papers, report }, null, 2)],
      { type: "application/json" }
    );

    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = u;
    a.download = "pyq-report.json";
    a.click();

    URL.revokeObjectURL(u);
  }

  return (
    <main>
      <h1>📚 PYQ Master Checker</h1>

      <p>
        Strict rule: A = 2 marks, B = 5 marks, C = 10 marks.
      </p>

      <section className="card">
        <h2>1. Photo Upload</h2>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={upload}
        />

        {busy && <p>Processing: {progress}%</p>}

        <p>{msg}</p>
      </section>

      <section className="card">
        <h2>2. Subject + Code Search</h2>

        <input
          placeholder="Subject Code e.g. BTCS-101-18"
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
        />

        <p>
          Code report को filter करता है; uploaded papers के हर
          question को comparison engine में रखा जाता है।
        </p>
      </section>

      <section className="card">
        <h2>3. Papers</h2>

        {papers.map((p) => (
          <div className="paper" key={p.id}>
            <b>{p.file}</b>

            <div className="grid">
              <input
                value={p.year}
                placeholder="Year"
                onChange={(e) =>
                  updatePaper(p.id, "year", e.target.value)
                }
              />

              <input
                value={p.code}
                placeholder="Subject Code"
                onChange={(e) =>
                  updatePaper(p.id, "code", e.target.value)
                }
              />

              <input
                value={Math.round(p.confidence || 0) + "%"}
                readOnly
              />
            </div>

            {(!p.year ||
              !p.code ||
              p.confidence < 80) && (
              <div className="warn">
                ⚠ VERIFY year/code/OCR before relying on result.
              </div>
            )}

            <details>
              <summary>
                {p.questions.length} questions
              </summary>

              {p.questions.map((q) => (
                <div className="question" key={q.id}>
                  <input
                    value={q.text}
                    onChange={(e) =>
                      updateQ(
                        p.id,
                        q.id,
                        "text",
                        e.target.value
                      )
                    }
                  />

                  <div className="grid">
                    <input
                      value={q.number}
                      onChange={(e) =>
                        updateQ(
                          p.id,
                          q.id,
                          "number",
                          e.target.value
                        )
                      }
                    />

                    <input
                      value={q.section}
                      placeholder="A/B/C"
                      onChange={(e) => {
                        const s =
                          e.target.value.toUpperCase();

                        updateQ(
                          p.id,
                          q.id,
                          "section",
                          s
                        );

                        updateQ(
                          p.id,
                          q.id,
                          "marks",
                          MARKS[s] || null
                        );
                      }}
                    />

                    <input
                      value={q.marks || ""}
                      readOnly
                    />
                  </div>

                  {(!["A", "B", "C"].includes(q.section) ||
                    q.marks !== MARKS[q.section]) && (
                    <div className="bad">
                      ❌ Section/marks invalid — VERIFY
                    </div>
                  )}
                </div>
              ))}
            </details>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>4. ALL-YEAR Repetition Result</h2>

        <button onClick={exportData}>
          Export JSON
        </button>

        {!searchCode ? (
          <p>Subject Code डालो।</p>
        ) : report.length === 0 ? (
          <p>No questions found.</p>
        ) : (
          report.map((q, i) => (
            <div className="question" key={q.id}>
              <h3>
                {i + 1}. {q.text}
              </h3>

              <span className="badge">
                Year: {q.year || "VERIFY"}
              </span>

              <span className="badge">
                Section: {q.section || "VERIFY"}
              </span>

              <span className="badge">
                Marks: {q.marks || "VERIFY"}
              </span>

              <p>
                <b>Exact repeats:</b> {q.repeatCount - 1}
              </p>

              <p>
                <b>Years:</b>{" "}
                {q.years.join(", ") || "None"}
              </p>

              {q.exactMatches.map((x, j) => (
                <div className="paper" key={j}>
                  <b>
                    {x.year} · Section {x.section} ·{" "}
                    {x.marks} marks
                  </b>
                  <br />
                  {x.text}
                </div>
              ))}

              {q.review.length > 0 && (
                <div className="warn">
                  <b>
                    Possible similarity — NOT counted:
                  </b>

                  {q.review.map((x, j) => (
                    <div key={j}>
                      {x.year} ·{" "}
                      {Math.round(x.score * 100)}% ·{" "}
                      {x.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
                      }
