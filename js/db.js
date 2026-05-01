/**
 * DB 인덱스 — 앱 시작 시 1회 빌드, 매 렌더 풀스캔 방지
 */

let DB = [];
let indexes = null;

export function setDB(db) {
  DB = db;
  buildIndexes();
}

export function getDB() {
  return DB;
}

function buildIndexes() {
  const byExamSubject = new Map(); // "33|S1" → [q]
  const bySubject = new Map();     // "S1" → [q]
  const byExam = new Map();        // 33 → [q]
  const byId = new Map();          // qid → q
  const topicsBySubject = new Map(); // "S1" → Set<topic>
  const topicsByExamSubject = new Map(); // "33|S1" → Set<topic>

  for (const q of DB) {
    byId.set(q.id, q);

    const esKey = `${q.exam}|${q.subject}`;
    if (!byExamSubject.has(esKey)) byExamSubject.set(esKey, []);
    byExamSubject.get(esKey).push(q);

    if (!bySubject.has(q.subject)) bySubject.set(q.subject, []);
    bySubject.get(q.subject).push(q);

    if (!byExam.has(q.exam)) byExam.set(q.exam, []);
    byExam.get(q.exam).push(q);

    if (!topicsBySubject.has(q.subject)) topicsBySubject.set(q.subject, new Set());
    if (q.topic) topicsBySubject.get(q.subject).add(q.topic);

    if (!topicsByExamSubject.has(esKey)) topicsByExamSubject.set(esKey, new Set());
    if (q.topic) topicsByExamSubject.get(esKey).add(q.topic);
  }

  // 회차별·과목별 정렬 (no 오름차순)
  for (const arr of byExamSubject.values()) arr.sort((a, b) => a.no - b.no);

  indexes = { byExamSubject, bySubject, byExam, byId, topicsBySubject, topicsByExamSubject };
}

export function queryById(qid) {
  return indexes?.byId.get(qid) || null;
}

export function queryByExamSubject(exam, subject) {
  if (exam == null) return queryBySubject(subject);
  return indexes?.byExamSubject.get(`${exam}|${subject}`) || [];
}

export function queryBySubject(subject) {
  return indexes?.bySubject.get(subject) || [];
}

export function queryByExam(exam) {
  return indexes?.byExam.get(exam) || [];
}

export function topicsOf(subject, exam = null) {
  if (exam == null) {
    const set = indexes?.topicsBySubject.get(subject);
    return set ? [...set].sort() : [];
  }
  const set = indexes?.topicsByExamSubject.get(`${exam}|${subject}`);
  return set ? [...set].sort() : [];
}

export function queryArchive({ exam, subject, topic, excludeIds }) {
  let pool = exam != null
    ? queryByExamSubject(exam, subject)
    : queryBySubject(subject);
  if (topic) pool = pool.filter(q => q.topic === topic);
  if (excludeIds && excludeIds.length) {
    const set = new Set(excludeIds);
    pool = pool.filter(q => !set.has(q.id));
  }
  return pool;
}
