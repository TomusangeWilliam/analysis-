import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import subjectService from "../services/subjectService";
import analyticsService from "../services/analyticsService";
import authService from "../services/authService";
import userService from "../services/userService";
import ClassStreamSelector from "../components/ClassStreamSelector";

const TEST_PERIODS = [
  { label: "Beginning of Term (BOT)", value: "Beginning of Term" },
  { label: "Mid Term (MT)", value: "MID Term" },
  { label: "End of Term (EOT)", value: "End of Term" },
];

/* ── Stat Card ─────────────────────────────────────────────────────────────── */
const StatCard = ({
  title,
  value,
  unit = "",
  sub = "",
  colorClass = "text-gray-900",
  bg = "bg-white",
}) => (
  <div
    className={`${bg} p-4 rounded-xl shadow-sm text-center border border-gray-100`}
  >
    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wide mb-1">
      {title}
    </p>
    <p className={`text-2xl font-black ${colorClass}`}>
      {value}
      {unit}
    </p>
    {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

/* ── Grade badge from percentage ───────────────────────────────────────────── */
const gradeBadge = (pct) => {
  if (pct >= 90) return { label: "D1", cls: "bg-emerald-100 text-emerald-800" };
  if (pct >= 80) return { label: "D2", cls: "bg-green-100 text-green-800" };
  if (pct >= 70) return { label: "C3", cls: "bg-lime-100 text-lime-800" };
  if (pct >= 60) return { label: "C4", cls: "bg-yellow-100 text-yellow-800" };
  if (pct >= 50) return { label: "C5", cls: "bg-orange-100 text-orange-800" };
  if (pct >= 45) return { label: "C6", cls: "bg-orange-200 text-orange-900" };
  if (pct >= 40) return { label: "P7", cls: "bg-red-100 text-red-800" };
  if (pct >= 35) return { label: "P8", cls: "bg-red-200 text-red-900" };
  return { label: "F9", cls: "bg-red-300 text-red-900" };
};

const DIST_LABELS = {
  under50: { label: "< 50%", bg: "bg-red-900", light: "bg-red-50" },
  between50and75: {
    label: "50 – 75%",
    bg: "bg-yellow-700",
    light: "bg-yellow-50",
  },
  between75and90: { label: "75 – 90%", bg: "bg-blue-800", light: "bg-blue-50" },
  over90: { label: "≥ 90%", bg: "bg-green-800", light: "bg-green-50" },
};

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */
const AnalyticsPage = () => {
  const { t } = useTranslation();
  const printRef = useRef(null);
  const [currentUser] = useState(authService.getCurrentUser());

  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [analysisResult, setAnalysisResult] = useState(null);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStreamId, setSelectedStreamId] = useState("all");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [testPeriod, setTestPeriod] = useState("Beginning of Term");

  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [academicYear, setAcademicYear] = useState(
    new Date().getFullYear().toString(),
  );
  const [error, setError] = useState(null);

  /* ── Load all subjects once ──────────────────────────────────────────────── */
  useEffect(() => {
    const load = async () => {
      try {
        let subjects = [];
        if (["admin", "staff", "principal"].includes(currentUser.role)) {
          const res = await subjectService.getAllSubjects();
          subjects = res.data.data || res.data;
        } else {
          const res = await userService.getProfile();
          subjects = (res.data.subjectsTaught || [])
            .map((a) => a.subject)
            .filter(Boolean);
        }
        setAvailableSubjects(subjects);
      } catch {
        setError(t("error"));
      } finally {
        setLoadingSubjects(false);
      }
    };
    load();
  }, [currentUser, t]);

  /* ── Fetch analysis ────────────────────────────────────────────────────── */
  const handleFetch = () => {
    if (!selectedSubject || !selectedClassId || !testPeriod) return;
    setLoadingAnalysis(true);
    setError(null);
    setAnalysisResult(null);
    analyticsService
      .getAnalysis(
        selectedSubject,
        testPeriod,
        selectedClassId,
        selectedStreamId,
        academicYear,
      )
      .then((res) => setAnalysisResult(res.data))
      .catch((err) => setError(err.response?.data?.message || t("error")))
      .finally(() => setLoadingAnalysis(false));
  };

  /* ── Print ───────────────────────────────────────────────────────────────── */
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const win = window.open("", "_blank", "width=1000,height=800");
    win.document
      .write(`<!DOCTYPE html><html><head><title>Subject Analysis</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 11px; padding: 16px; }
        h2 { font-size: 16px; font-weight: bold; margin-bottom: 6px; }
        h3 { font-size: 13px; font-weight: bold; margin: 14px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
        h4 { font-size: 11px; font-weight: bold; margin: 10px 0 4px; }
        .cards { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .card { border: 1px solid #ddd; border-radius: 6px; padding: 6px 10px; text-align: center; min-width: 90px; }
        .card .label { font-size: 8px; color: #666; text-transform: uppercase; }
        .card .val { font-size: 18px; font-weight: bold; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
        th, td { border: 1px solid #888; padding: 3px 5px; text-align: center; font-size: 10px; }
        th { background: #374151; color: white; font-weight: bold; }
        th.range-hdr { background: #1f2937; }
        td.name-td { text-align: left; font-weight: bold; }
        .pass { color: #15803d; font-weight: bold; }
        .fail { color: #b91c1c; font-weight: bold; }
        .grade { border-radius: 4px; padding: 1px 4px; font-size: 9px; font-weight: bold; }
        @media print { body { padding: 8px; } }
      </style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  /* ── Derived ─────────────────────────────────────────────────────────────── */
  const subjectsForClass = selectedClassId
    ? availableSubjects.filter(
        (s) => (s.class?._id || s.class) === selectedClassId,
      )
    : [];

  const r = analysisResult;
  const at = r?.assessmentType;
  const g = r?.analysis?.general;
  const ss = r?.analysis?.scoreStats;
  const dist = r?.analysis?.distribution;
  const scores = (r?.analysis?.scores || [])
    .slice()
    .sort((a, b) => b.score - a.score);

  if (loadingSubjects)
    return <p className="text-center text-lg mt-8">{t("loading")}</p>;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md space-y-6 min-h-screen">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-800">
          {t("subject_detail")}
        </h2>
        {r?.analysis && (
          <button
            onClick={handlePrint}
            className="bg-gray-700 hover:bg-gray-900 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2"
          >
            🖨️ Print / PDF
          </button>
        )}
      </div>

      {/* ── Quick Links ───────────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <Link
          to="/allsubjectAnalysis"
          className="px-4 py-2 bg-pink-500 text-white rounded shadow hover:bg-pink-600 font-bold text-sm"
        >
          {t("class_matrix")}
        </Link>
        <Link
          to="/subject-performance"
          className="px-4 py-2 bg-pink-500 text-white rounded shadow hover:bg-pink-600 font-bold text-sm"
        >
          {t("subject_performance")}
        </Link>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="p-5 bg-slate-50 rounded-2xl border-2 border-slate-100 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ClassStreamSelector
            selectedClass={selectedClassId}
            onClassChange={(id) => {
              setSelectedClassId(id);
              setSelectedSubject("");
              setAnalysisResult(null);
            }}
            selectedStream={selectedStreamId}
            onStreamChange={(id) => setSelectedStreamId(id || "all")}
            showAllStreamsOption={true}
            required={true}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Subject */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-1 block">
              {t("subject")}
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              disabled={!selectedClassId}
              className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold text-slate-700 focus:border-indigo-500 outline-none disabled:opacity-50"
            >
              <option value="">— Select Subject —</option>
              {subjectsForClass.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Test Period */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-1 block">
              Test Period
            </label>
            <select
              value={testPeriod}
              onChange={(e) => setTestPeriod(e.target.value)}
              className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold text-slate-700 focus:border-indigo-500 outline-none"
            >
              {TEST_PERIODS.map((tp) => (
                <option key={tp.value} value={tp.value}>
                  {tp.label}
                </option>
              ))}
            </select>
          </div>

          {/* Academic Year */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-1 block">
              Academic Year
            </label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold text-slate-700 focus:border-indigo-500 outline-none"
              placeholder="e.g. 2026"
            />
          </div>

          {/* Generate */}
          <button
            onClick={handleFetch}
            disabled={!selectedSubject || !selectedClassId || loadingAnalysis}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
          >
            {loadingAnalysis ? "Loading…" : "📊 Generate"}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 border border-red-200 rounded p-4">
          {error}
        </div>
      )}

      {/* ── No data message ───────────────────────────────────────────────── */}
      {r && !r.analysis && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-bold text-gray-600">
            No grades submitted yet for this assessment.
          </p>
          <p className="text-sm mt-1">
            {at?.name} — {at?.month}
          </p>
        </div>
      )}

      {/* ══ RESULTS ══════════════════════════════════════════════════════════ */}
      {r?.analysis && (
        <div className="space-y-8">
          {/* Title bar */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3 flex flex-wrap gap-3 items-center">
            <span className="text-indigo-800 font-black text-sm">
              {at?.name}
            </span>
            <span className="text-indigo-500 text-xs">·</span>
            <span className="text-indigo-600 text-xs font-bold">
              {at?.month}
            </span>
            <span className="text-indigo-500 text-xs">·</span>
            <span className="text-indigo-600 text-xs font-bold">
              {at?.semester}
            </span>
            <span className="text-indigo-500 text-xs">·</span>
            <span className="text-indigo-600 text-xs">
              Out of <strong>{at?.totalMarks}</strong> marks
            </span>
          </div>

          {/* ── General stats ─────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3">
              Participation
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard title="Total Students" value={g.totalStudents} />
              <StatCard
                title="Sat"
                value={g.studentsWhoTookAssessment}
                colorClass="text-green-600"
                bg="bg-green-50"
              />
              <StatCard
                title="Absent"
                value={g.studentsWhoMissedAssessment}
                colorClass="text-red-600"
                bg="bg-red-50"
              />
              <StatCard
                title="Male"
                value={g.maleStudents}
                colorClass="text-blue-600"
                bg="bg-blue-50"
              />
              <StatCard
                title="Female"
                value={g.femaleStudents}
                colorClass="text-pink-600"
                bg="bg-pink-50"
              />
              <StatCard
                title="Pass Rate"
                value={ss.passPercentage}
                unit="%"
                colorClass={
                  parseFloat(ss.passPercentage) >= 50
                    ? "text-green-700"
                    : "text-red-600"
                }
                bg={
                  parseFloat(ss.passPercentage) >= 50
                    ? "bg-green-50"
                    : "bg-red-50"
                }
              />
            </div>
          </section>

          {/* ── Score stats ───────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3">
              Score Statistics
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard
                title="Highest Score"
                value={ss.highestScore}
                sub={`${ss.highestPercent}%`}
                colorClass="text-emerald-700"
                bg="bg-emerald-50"
              />
              <StatCard
                title="Lowest Score"
                value={ss.lowestScore}
                sub={`${ss.lowestPercent}%`}
                colorClass="text-red-600"
                bg="bg-red-50"
              />
              <StatCard
                title="Average Score"
                value={ss.averageScore}
                sub={`${ss.averagePercent}%`}
                colorClass={
                  parseFloat(ss.averagePercent) >= 50
                    ? "text-green-700"
                    : "text-orange-600"
                }
              />
              <StatCard
                title="Passed"
                value={ss.passCount}
                sub={`${ss.passPercentage}%`}
                colorClass="text-green-700"
                bg="bg-green-50"
              />
              <StatCard
                title="Failed"
                value={ss.failCount}
                sub={`${ss.failPercentage}%`}
                colorClass="text-red-600"
                bg="bg-red-50"
              />
              <StatCard
                title="Total Marks"
                value={at?.totalMarks}
                colorClass="text-indigo-700"
                bg="bg-indigo-50"
              />
            </div>
          </section>

          {/* ── Distribution table ────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3">
              Score Distribution
            </h3>
            <div className="overflow-x-auto">
              <table className="border-collapse border border-gray-600 text-xs w-full">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th
                      className="border border-gray-600 px-3 py-2 text-left"
                      rowSpan={2}
                    >
                      Range
                    </th>
                    {Object.entries(DIST_LABELS).map(([key, d]) => (
                      <th
                        key={key}
                        colSpan={4}
                        className={`border border-gray-600 px-2 py-2 text-center ${d.bg}`}
                      >
                        {d.label}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-gray-200 text-gray-700 text-[9px] font-bold">
                    {Object.keys(DIST_LABELS).map((k) => (
                      <React.Fragment key={k}>
                        <th className="border border-gray-400 py-1 text-pink-600">
                          F
                        </th>
                        <th className="border border-gray-400 py-1 text-blue-600">
                          M
                        </th>
                        <th className="border border-gray-400 py-1">Total</th>
                        <th className="border border-gray-400 py-1 bg-gray-300">
                          %
                        </th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="border border-gray-400 px-3 py-2 font-bold text-gray-700">
                      Students
                    </td>
                    {Object.entries(DIST_LABELS).map(([key, d]) => {
                      const bkt = dist[key] || { F: 0, M: 0, T: 0, P: 0 };
                      const empty = bkt.T === 0;
                      return (
                        <React.Fragment key={key}>
                          <td
                            className={`border border-gray-300 text-center py-2 px-1 ${d.light} ${empty ? "text-gray-300" : ""} font-bold`}
                          >
                            {bkt.F}
                          </td>
                          <td
                            className={`border border-gray-300 text-center py-2 px-1 ${d.light} ${empty ? "text-gray-300" : ""} font-bold`}
                          >
                            {bkt.M}
                          </td>
                          <td
                            className={`border border-gray-300 text-center py-2 px-1 ${d.light} ${empty ? "text-gray-300" : "text-gray-800"} font-black`}
                          >
                            {bkt.T}
                          </td>
                          <td
                            className={`border border-gray-300 text-center py-2 px-1 bg-gray-100 ${empty ? "text-gray-300" : "text-gray-800"} font-bold`}
                          >
                            {bkt.P}%
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Student score list ────────────────────────────────────────── */}
          {scores.length > 0 && (
            <section>
              <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3">
                Student Scores{" "}
                <span className="font-normal text-gray-400 normal-case ml-1">
                  ({scores.length} students, sorted highest first)
                </span>
              </h3>
              <div className="overflow-x-auto">
                <table className="border-collapse border border-gray-300 text-xs w-full">
                  <thead>
                    <tr className="bg-gray-800 text-white">
                      <th className="border border-gray-600 px-3 py-2 text-left w-8">
                        #
                      </th>
                      <th className="border border-gray-600 px-3 py-2 text-left">
                        Student
                      </th>
                      <th className="border border-gray-600 px-2 py-2 text-center">
                        Gender
                      </th>
                      <th className="border border-gray-600 px-2 py-2 text-center">
                        Score /{at?.totalMarks}
                      </th>
                      <th className="border border-gray-600 px-2 py-2 text-center">
                        %
                      </th>
                      <th className="border border-gray-600 px-2 py-2 text-center">
                        Grade
                      </th>
                      <th className="border border-gray-600 px-2 py-2 text-center">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((s, i) => {
                      const pctVal = parseFloat(s.normalizedScore);
                      const gb = gradeBadge(pctVal);
                      const passed = pctVal >= 50;
                      return (
                        <tr
                          key={i}
                          className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                        >
                          <td className="border border-gray-200 px-3 py-1.5 text-gray-400 font-bold">
                            {i + 1}
                          </td>
                          <td className="border border-gray-200 px-3 py-1.5 font-bold text-gray-800">
                            {s.studentName}
                          </td>
                          <td className="border border-gray-200 px-2 py-1.5 text-center">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${s.gender === "Male" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"}`}
                            >
                              {s.gender === "Male" ? "M" : "F"}
                            </span>
                          </td>
                          <td className="border border-gray-200 px-2 py-1.5 text-center font-black text-gray-800">
                            {s.score}
                          </td>
                          <td
                            className={`border border-gray-200 px-2 py-1.5 text-center font-bold ${passed ? "text-green-700" : "text-red-600"}`}
                          >
                            {pctVal.toFixed(1)}%
                          </td>
                          <td className="border border-gray-200 px-2 py-1.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black ${gb.cls}`}
                            >
                              {gb.label}
                            </span>
                          </td>
                          <td className="border border-gray-200 px-2 py-1.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                            >
                              {passed ? "Pass" : "Fail"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ══ HIDDEN PRINT AREA ═══════════════════════════════════════════════ */}
      <div ref={printRef} style={{ display: "none" }}>
        {r?.analysis && (
          <>
            <h2>
              Subject Analysis — {at?.name} ({at?.month} / {at?.semester})
            </h2>
            <p style={{ fontSize: 10, color: "#555", marginBottom: 12 }}>
              Out of {at?.totalMarks} marks &nbsp;|&nbsp; Total Students:{" "}
              {g.totalStudents} &nbsp;|&nbsp; Sat: {g.studentsWhoTookAssessment}{" "}
              &nbsp;|&nbsp; Pass Rate: {ss.passPercentage}%
            </p>

            <h3>Score Statistics</h3>
            <div className="cards">
              {[
                ["Highest", `${ss.highestScore} (${ss.highestPercent}%)`],
                ["Lowest", `${ss.lowestScore} (${ss.lowestPercent}%)`],
                ["Average", `${ss.averageScore} (${ss.averagePercent}%)`],
                ["Passed", `${ss.passCount} (${ss.passPercentage}%)`],
                ["Failed", `${ss.failCount} (${ss.failPercentage}%)`],
                ["Male", g.maleStudents],
                ["Female", g.femaleStudents],
              ].map(([lbl, val]) => (
                <div className="card" key={lbl}>
                  <div className="label">{lbl}</div>
                  <div className="val">{val}</div>
                </div>
              ))}
            </div>

            <h3>Score Distribution</h3>
            <table>
              <thead>
                <tr>
                  <th className="range-hdr">Range</th>
                  {Object.entries(DIST_LABELS).map(([k, d]) => (
                    <th key={k} colSpan={4}>
                      {d.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="range-hdr">—</th>
                  {Object.keys(DIST_LABELS).map((k) => (
                    <React.Fragment key={k}>
                      <th>F</th>
                      <th>M</th>
                      <th>Total</th>
                      <th>%</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="name-td">Students</td>
                  {Object.keys(DIST_LABELS).map((k) => {
                    const bkt = dist[k] || { F: 0, M: 0, T: 0, P: 0 };
                    return (
                      <React.Fragment key={k}>
                        <td>{bkt.F}</td>
                        <td>{bkt.M}</td>
                        <td>
                          <strong>{bkt.T}</strong>
                        </td>
                        <td>{bkt.P}%</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tbody>
            </table>

            {scores.length > 0 && (
              <>
                <h3>Student Scores (sorted highest first)</h3>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th style={{ textAlign: "left" }}>Student</th>
                      <th>Gender</th>
                      <th>Score /{at?.totalMarks}</th>
                      <th>%</th>
                      <th>Grade</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((s, i) => {
                      const pctVal = parseFloat(s.normalizedScore);
                      const passed = pctVal >= 50;
                      const gb = gradeBadge(pctVal);
                      return (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td className="name-td">{s.studentName}</td>
                          <td>{s.gender === "Male" ? "M" : "F"}</td>
                          <td>
                            <strong>{s.score}</strong>
                          </td>
                          <td className={passed ? "pass" : "fail"}>
                            {pctVal.toFixed(1)}%
                          </td>
                          <td>
                            <span className="grade">{gb.label}</span>
                          </td>
                          <td className={passed ? "pass" : "fail"}>
                            {passed ? "Pass" : "Fail"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AnalyticsPage;
