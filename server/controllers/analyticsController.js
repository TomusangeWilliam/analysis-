const mongoose = require("mongoose");
const Grade = require("../models/Grade");
const Student = require("../models/Student");
const AssessmentType = require("../models/AssessmentType");
const Subject = require("../models/Subject");
const Class = require("../models/Class");
const GradingScale = require("../models/GradingScale");
// Controller to get assessment analysis

exports.getAssessmentAnalysis = async (req, res) => {
  const {
    subjectId,
    testPeriod,
    selectedClass: classId,
    selectedStream: streamId,
    academicYear,
  } = req.query;

  if (!subjectId || !testPeriod) {
    return res
      .status(400)
      .json({ message: "subjectId and testPeriod are required." });
  }
  if (!classId) {
    return res.status(400).json({ message: "Class is required." });
  }

  try {
    // 1️⃣ Find all AssessmentTypes matching the test period name for this subject+class
    const assessmentTypes = await AssessmentType.find({
      subject: subjectId,
      class: classId,
      name: { $regex: new RegExp(testPeriod.trim(), "i") },
    });

    const totalMarks = assessmentTypes.reduce(
      (sum, a) => sum + (a.totalMarks || 0),
      0,
    );
    const atIdSet = new Set(assessmentTypes.map((a) => a._id.toString()));

    // Build a meta object compatible with the existing response shape
    const assessmentType = {
      name: testPeriod,
      month: assessmentTypes[0]?.month || "-",
      semester: assessmentTypes[0]?.semester || "-",
      totalMarks,
    };

    // 2️⃣ Get students (optionally filtered by stream)
    const studentQuery = { class: classId };
    if (streamId && streamId !== "all") studentQuery.stream = streamId;
    const allStudents = await Student.find(studentQuery);
    const studentIds = allStudents.map((s) => s._id);
    const totalStudents = allStudents.length;

    if (totalStudents === 0) {
      return res.status(200).json({
        message: "No students found.",
        assessmentType,
        analysis: null,
      });
    }

    // 3️⃣ Fetch grade docs for this subject, then sum scores for matching ATs per student
    const gradeQuery = { subject: subjectId, student: { $in: studentIds } };
    if (academicYear) gradeQuery.academicYear = academicYear;
    const grades = await Grade.find(gradeQuery).populate(
      "student",
      "fullName gender",
    );

    const analysis = [];
    for (const g of grades) {
      if (!g.student) continue;
      const relevant = (g.assessments || []).filter(
        (a) => a.assessmentType && atIdSet.has(a.assessmentType.toString()),
      );
      if (relevant.length === 0) continue;
      const score = relevant.reduce((s, a) => s + (a.score || 0), 0);
      const normalizedScore = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
      analysis.push({
        studentName: g.student.fullName,
        gender: g.student.gender,
        score,
        normalizedScore,
      });
    }

    if (analysis.length === 0) {
      return res.status(200).json({
        message: "No students have taken this assessment yet.",
        assessmentType,
        analysis: null,
      });
    }

    // 3️⃣ Participation info
    const studentsWhoTookAssessment = analysis.length;
    const studentsWhoMissedAssessment =
      totalStudents - studentsWhoTookAssessment;
    const maleStudents = analysis.filter((s) => s.gender === "Male").length;
    const femaleStudents = analysis.filter((s) => s.gender === "Female").length;

    // 4️⃣ Score stats
    const scores = analysis.map((s) => s.score);
    const normalizedScores = analysis.map((s) => s.normalizedScore);

    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);
    const averageScore = (
      scores.reduce((a, b) => a + b, 0) / scores.length
    ).toFixed(2);

    const highestPercent = Math.max(...normalizedScores).toFixed(2);
    const lowestPercent = Math.min(...normalizedScores).toFixed(2);
    const averagePercent = (
      normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length
    ).toFixed(2);

    const passCount = normalizedScores.filter((s) => s >= 50).length;
    const failCount = normalizedScores.filter((s) => s < 50).length;
    const passPercentage = (
      (passCount / studentsWhoTookAssessment) *
      100
    ).toFixed(1);
    const failPercentage = (
      (failCount / studentsWhoTookAssessment) *
      100
    ).toFixed(1);

    // 5️⃣ Distribution buckets
    const buckets = [
      { label: "under50", min: 0, max: 50 },
      { label: "between50and75", min: 50, max: 75 },
      { label: "between75and90", min: 75, max: 90 },
      { label: "over90", min: 90, max: 101 },
    ];

    const processedDistribution = {};
    for (const { label, min, max } of buckets) {
      const group = analysis.filter(
        (a) => a.normalizedScore >= min && a.normalizedScore < max,
      );
      const femaleCount = group.filter((s) => s.gender === "Female").length;
      const maleCount = group.filter((s) => s.gender === "Male").length;
      const totalCount = group.length;
      const percentage =
        studentsWhoTookAssessment > 0
          ? (totalCount / studentsWhoTookAssessment) * 100
          : 0;

      processedDistribution[label] = {
        F: femaleCount,
        M: maleCount,
        T: totalCount,
        P: percentage.toFixed(1),
      };
    }

    const finalAnalysis = {
      general: {
        totalStudents,
        studentsWhoTookAssessment,
        studentsWhoMissedAssessment,
        maleStudents,
        femaleStudents,
      },
      scoreStats: {
        highestScore,
        lowestScore,
        averageScore,
        highestPercent,
        lowestPercent,
        averagePercent,
        passCount,
        failCount,
        passPercentage,
        failPercentage,
      },
      distribution: processedDistribution,
      scores: analysis,
    };

    res.status(200).json({ assessmentType, analysis: finalAnalysis });
  } catch (err) {
    console.error("Error in assessment analysis:", err);
    res.status(500).json({ message: "Server Error", details: err.message });
  }
};

// @desc    Get Class Analysis (Gender, Ranges, Participation) for an Assessment Name across all Subjects
// @route   GET /api/grades/analysis/class-analytics
// @query   gradeLevel, assessmentName, semester, academicYear
exports.getClassAnalytics = async (req, res) => {
  const { classId, assessmentName, semester, academicYear } = req.query;

  if (!classId || !assessmentName || !semester || !academicYear) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    // 1. Fetch ALL Active Students in this Class
    const students = await Student.find({ class: classId, status: "Active" });

    // Create a fast lookup map for Student Gender: { "studentId": "Male", ... }
    const studentMap = {};
    let totalMalesInClass = 0;
    let totalFemalesInClass = 0;

    students.forEach((s) => {
      studentMap[s._id.toString()] = s.gender;
      if (s.gender === "Male") totalMalesInClass++;
      else totalFemalesInClass++;
    });

    const totalStudentsInClass = students.length;

    // 2. Find the Assessment Types (The Subjects) that match the name (e.g., "Test 1")
    const assessmentTypes = await AssessmentType.find({
      class: classId,
      name: { $regex: new RegExp(`^${assessmentName.trim()}$`, "i") },
      semester,
      year: academicYear,
    }).populate("subject", "name");

    if (assessmentTypes.length === 0) {
      return res.status(404).json({
        message: `No assessments found with name '${assessmentName}' for this class.`,
      });
    }

    // 3. Prepare the Analysis Array
    const analysisResults = [];

    // 4. Iterate through each Subject (AssessmentType)
    for (const type of assessmentTypes) {
      const subjectName = type.subject ? type.subject.name : "Unknown Subject";
      const totalMarks = type.totalMarks;

      // Fetch all grades for this specific assessment type
      const grades = await Grade.find({
        "assessments.assessmentType": type._id,
        student: { $in: students.map((s) => s._id) }, // Only active students
      });

      // Initialize Counters
      const stats = {
        subject: subjectName,
        totalMarks: totalMarks,
        students: {
          total: totalStudentsInClass,
          male: totalMalesInClass,
          female: totalFemalesInClass,
        },
        attended: { total: 0, male: 0, female: 0 },
        missed: { total: 0, male: 0, female: 0 },
        below50: { total: 0, male: 0, female: 0 }, // < 50%
        below75: { total: 0, male: 0, female: 0 }, // 50% - 74%
        below90: { total: 0, male: 0, female: 0 }, // 75% - 89%
        above90: { total: 0, male: 0, female: 0 }, // >= 90%
      };

      // Process Grades
      grades.forEach((gradeDoc) => {
        // Find the specific score within the grade document
        const assessmentData = gradeDoc.assessments.find(
          (a) =>
            a.assessmentType &&
            a.assessmentType.toString() === type._id.toString(),
        );

        const studentGender = studentMap[gradeDoc.student.toString()] || "Male"; // Default to Male if unknown
        const genderKey = studentGender.toLowerCase(); // 'male' or 'female'

        // Check if student attended (score exists and is not null)
        if (
          assessmentData &&
          assessmentData.score !== null &&
          assessmentData.score !== undefined
        ) {
          const score = assessmentData.score;
          const percentage = (score / totalMarks) * 100;

          // Increment Attended
          stats.attended.total++;
          stats.attended[genderKey]++;

          // Classify into ranges
          if (percentage < 50) {
            stats.below50.total++;
            stats.below50[genderKey]++;
          } else if (percentage < 75) {
            stats.below75.total++;
            stats.below75[genderKey]++;
          } else if (percentage < 90) {
            stats.below90.total++;
            stats.below90[genderKey]++;
          } else {
            stats.above90.total++;
            stats.above90[genderKey]++;
          }
        }
      });

      // Calculate Missed (Total Class - Attended)
      stats.missed.total = stats.students.total - stats.attended.total;
      stats.missed.male = stats.students.male - stats.attended.male;
      stats.missed.female = stats.students.female - stats.attended.female;

      analysisResults.push(stats);
    }

    res.status(200).json({
      success: true,
      meta: {
        gradeLevel,
        assessmentName,
        semester,
        academicYear,
      },
      data: analysisResults,
    });
  } catch (error) {
    console.error("Class Analytics Error:", error);
    res.status(500).json({ message: "Server error generating analytics." });
  }
};

// backend/controllers/gradeController.js

exports.getSubjectPerformanceAnalysis = async (req, res) => {
  const { classId, streamId, testPeriod, semester, academicYear } = req.query;

  if (!classId || !academicYear) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    const subjects = await Subject.find({ class: classId }).sort({ name: 1 });

    // Filter students by stream if provided
    const studentQuery = { class: classId, status: "Active" };
    if (streamId && streamId !== "all") studentQuery.stream = streamId;
    const students = await Student.find(studentQuery).select("_id gender");
    const studentIds = students.map((s) => s._id);

    const analysis = [];

    for (const subject of subjects) {
      // 1. Find assessment types — by testPeriod name and/or semester
      const atQuery = { subject: subject._id, class: classId };
      if (testPeriod)
        atQuery.name = { $regex: new RegExp(testPeriod.trim(), "i") };
      if (semester) atQuery.semester = semester;
      const assessmentTypes = await AssessmentType.find(atQuery);

      const atIdSet = new Set(assessmentTypes.map((a) => a._id.toString()));
      const totalPossible = assessmentTypes.reduce(
        (sum, a) => sum + a.totalMarks,
        0,
      );

      // 2. Fetch grades with student gender
      const gradeQuery = {
        subject: subject._id,
        student: { $in: studentIds },
        academicYear,
      };
      if (semester) gradeQuery.semester = semester;
      const grades = await Grade.find(gradeQuery).populate("student", "gender");

      let totalScore = 0;
      let highest = 0;
      let lowest = totalPossible || 100;
      let passedCount = 0;
      let count = 0;

      const initRange = () => ({ total: 0, m: 0, f: 0 });
      const ranges = {
        below50: initRange(),
        below75: initRange(),
        below90: initRange(),
        above90: initRange(),
      };

      grades.forEach((g) => {
        if (!g.student) return;

        // Use specific test-period score when testPeriod is given
        let score;
        if (testPeriod && atIdSet.size > 0) {
          const relevant = (g.assessments || []).filter(
            (a) => a.assessmentType && atIdSet.has(a.assessmentType.toString()),
          );
          if (relevant.length === 0) return; // student has no score for this period
          score = relevant.reduce((s, a) => s + (a.score || 0), 0);
        } else {
          if (g.finalScore === undefined || g.finalScore === null) return;
          score = g.finalScore;
        }

        const isMale = g.student.gender === "Male" || g.student.gender === "M";

        totalScore += score;
        if (score > highest) highest = score;
        if (score < lowest) lowest = score;

        const passMark = totalPossible / 2;
        if (score >= passMark) passedCount++;
        count++;

        const percentage =
          totalPossible > 0 ? (score / totalPossible) * 100 : 0;
        const inc = (bucket) => {
          bucket.total++;
          if (isMale) bucket.m++;
          else bucket.f++;
        };

        if (percentage < 50) inc(ranges.below50);
        else if (percentage < 75) inc(ranges.below75);
        else if (percentage < 90) inc(ranges.below90);
        else inc(ranges.above90);
      });

      if (count === 0) lowest = 0;
      const avg = count > 0 ? parseFloat((totalScore / count).toFixed(2)) : 0;
      const passRate =
        count > 0 ? parseFloat(((passedCount / count) * 100).toFixed(1)) : 0;

      analysis.push({
        subjectName: subject.name,
        submittedGrades: count,
        averageScore: avg,
        highestScore: highest,
        lowestScore: lowest,
        passRate: passRate + "%",
        ranges,
        totalPossibleScore: totalPossible,
      });
    }

    analysis.sort((a, b) => b.averageScore - a.averageScore);
    res.status(200).json({ success: true, data: analysis });
  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// @desc    Get students scoring below 60% per subject
// @route   GET /api/grades/analysis/at-risk
exports.getAtRiskStudents = async (req, res) => {
  const { classId, semester, academicYear } = req.query;

  if (!classId || !semester || !academicYear) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    const subjects = await Subject.find({ class: classId }).sort({ name: 1 });
    const students = await Student.find({
      class: classId,
      status: "Active",
    }).select("_id fullName studentId");
    const studentIds = students.map((s) => s._id);

    const report = [];

    for (const subject of subjects) {
      // 1. Calculate Total Marks for this Subject
      const assessmentTypes = await AssessmentType.find({
        subject: subject._id,
        class: classId,
        semester,
      });
      const totalPossible = assessmentTypes.reduce(
        (sum, a) => sum + a.totalMarks,
        0,
      );

      if (totalPossible === 0) continue; // Skip if no assessments defined

      // 2. Define the Cutoff (60%)
      const cutoffScore = totalPossible * 0.6;

      // 3. Find Grades below cutoff
      const lowGrades = await Grade.find({
        subject: subject._id,
        student: { $in: studentIds },
        semester,
        academicYear,
        finalScore: { $lt: cutoffScore }, // Less than 60%
      }).populate("student", "fullName studentId gender");

      if (lowGrades.length > 0) {
        report.push({
          subjectName: subject.name,
          totalPossible: totalPossible,
          cutoff: cutoffScore,
          students: lowGrades
            .map((g) => ({
              id: g.student._id,
              name: g.student.fullName,
              studentId: g.student.studentId,
              gender: g.student.gender,
              score: g.finalScore,
              percentage: ((g.finalScore / totalPossible) * 100).toFixed(1),
            }))
            .sort((a, b) => a.score - b.score), // Sort lowest score first
        });
      }
    }

    res.status(200).json({ success: true, data: report });
  } catch (error) {
    console.error("At Risk Error:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get per-subject grade distribution using the school grading scale
//          with male / female breakdown.
// @route   GET /api/analytics/grade-distribution
// @query   classId, streamId ('all' or a specific stream ObjectId),
//          testPeriod (e.g. 'Beginning of Term'), semester, academicYear
// ─────────────────────────────────────────────────────────────────────────────
exports.getGradeDistributionAnalysis = async (req, res) => {
  const { classId, streamId, testPeriod, semester, academicYear } = req.query;

  // ── 1. Validate required params ──────────────────────────────────────────
  if (!classId || !testPeriod || !academicYear) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: classId, testPeriod, academicYear.",
    });
  }

  try {
    // ── 2. Resolve the grading scale for this class ──────────────────────
    //   First try to find one whose applicableClasses contains the className;
    //   fall back to the first active scale if none matches.
    const classDoc = await Class.findById(classId).select("className");
    if (!classDoc) {
      return res
        .status(404)
        .json({ success: false, message: "Class not found." });
    }

    let gradingScale = await GradingScale.findOne({
      applicableClasses: classDoc.className,
      isActive: true,
    });

    if (!gradingScale) {
      gradingScale = await GradingScale.findOne({ isActive: true });
    }

    if (!gradingScale) {
      return res.status(404).json({
        success: false,
        message: "No active grading scale found.",
      });
    }

    // Canonical grade order (stored order in the schema defaults to D1 → F9)
    const GRADE_ORDER = ["D1", "D2", "C3", "C4", "C5", "C6", "P7", "P8", "F9"];
    const gradeLabels = [...GRADE_ORDER, "-"];

    // Build a quick lookup: grade letter → { minScore, maxScore }
    const scaleMap = {};
    for (const r of gradingScale.ranges) {
      scaleMap[r.grade] = { min: r.minScore, max: r.maxScore };
    }

    // Helper: map a percentage (0-100) → grade letter using the scale.
    // Returns null when no matching range is found (shouldn't normally happen).
    const percentToGrade = (pct) => {
      for (const letter of GRADE_ORDER) {
        const range = scaleMap[letter];
        if (!range) continue;
        if (pct >= range.min && pct <= range.max) return letter;
      }
      // Clamp edge-cases: anything below the lowest min goes to F9.
      return "F9";
    };

    // ── 3. Fetch subjects and students ───────────────────────────────────
    const subjects = await Subject.find({ class: classId }).sort({ name: 1 });

    // Build student query – filter by stream only when a specific one is given
    const studentQuery = { class: classId, status: "Active" };
    const isAllStreams = !streamId || streamId === "all";
    if (!isAllStreams) {
      studentQuery.stream = streamId;
    }

    const students = await Student.find(studentQuery).select("_id gender");
    const studentIds = students.map((s) => s._id);
    const totalStudents = students.length;

    // Fast gender lookup: studentId string → 'Male' | 'Female'
    const genderMap = {};
    for (const s of students) {
      genderMap[s._id.toString()] = s.gender;
    }

    // ── 4. Build zero-initialised grade-count template ───────────────────
    const emptyGradeCounts = () => {
      const counts = {};
      for (const label of gradeLabels) {
        counts[label] = { m: 0, f: 0, total: 0 };
      }
      return counts;
    };

    // ── 5. Iterate each subject ──────────────────────────────────────────
    const data = [];

    for (const subject of subjects) {
      // 5a. Find AssessmentTypes matching the test period name (case-insensitive)
      //     optionally also filtered by semester if provided
      const atQuery = {
        subject: subject._id,
        class: classId,
        name: { $regex: new RegExp(testPeriod.trim(), "i") },
      };
      if (semester) atQuery.semester = semester;

      const assessmentTypes = await AssessmentType.find(atQuery);

      // Collect the AT _id set and total marks for this test period
      const atIdSet = new Set(assessmentTypes.map((a) => a._id.toString()));
      const totalPossibleScore = assessmentTypes.reduce(
        (sum, a) => sum + (a.totalMarks || 0),
        0,
      );

      // 5b. Fetch grade docs for this subject / semester / year
      //     (no semester filter if not provided — pick up all grades for subject)
      const gradeQuery = {
        subject: subject._id,
        student: { $in: studentIds },
        academicYear,
      };
      if (semester) gradeQuery.semester = semester;

      const grades = await Grade.find(gradeQuery).select("student assessments");

      // Map studentId → sum of scores for the matching test-period ATs only
      const scoreByStudent = {};
      for (const g of grades) {
        const sid = g.student.toString();
        const relevantAssessments = (g.assessments || []).filter(
          (a) => a.assessmentType && atIdSet.has(a.assessmentType.toString()),
        );
        if (relevantAssessments.length > 0) {
          const score = relevantAssessments.reduce(
            (sum, a) => sum + (a.score || 0),
            0,
          );
          scoreByStudent[sid] = score;
        }
      }

      // 5c. Tally every student into a grade bucket
      const gradeCounts = emptyGradeCounts();

      for (const student of students) {
        const sid = student._id.toString();
        const isMale = genderMap[sid] === "Male" || genderMap[sid] === "M";
        const score = scoreByStudent[sid];

        let bucket;

        if (score === undefined || score === null) {
          // No score recorded for this test period → unsubmitted
          bucket = "-";
        } else if (totalPossibleScore === 0) {
          // No assessment types defined for this period – can't compute
          bucket = "-";
        } else {
          const pct = (score / totalPossibleScore) * 100;
          bucket = percentToGrade(pct);
        }

        gradeCounts[bucket].total++;
        if (isMale) gradeCounts[bucket].m++;
        else gradeCounts[bucket].f++;
      }

      data.push({
        subjectName: subject.name,
        gradeCounts,
      });
    }

    // ── 6. Respond ───────────────────────────────────────────────────────
    res.status(200).json({
      success: true,
      gradeLabels,
      totalStudents,
      data,
    });
  } catch (error) {
    console.error("Grade Distribution Analysis Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error generating grade distribution.",
    });
  }
};
