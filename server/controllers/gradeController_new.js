const Grade = require("../models/Grade");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const AssessmentType = require("../models/AssessmentType");
const GlobalConfig = require("../models/GlobalConfig");
const sendSystemNotification = require("../utils/sendSystemNotification");
const { parseGradesPdf } = require("../utils/pdfParser");

// @desc    Get a single grade by ID
// @route   GET /api/grades/:id
exports.getGradeById = async (req, res) => {
  try {
    const grade = await Grade.findById(req.params.id).populate(
      "subject",
      "name",
    );
    if (!grade) return res.status(404).json({ message: "Grade not found" });
    res.status(200).json({ success: true, data: grade });
  } catch (error) {
    console.error("Error fetching grade by ID:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get all grades
// @route   GET /api/grades
const getGrades = async (req, res) => {
  try {
    const grades = await Grade.find({})
      .populate("student", "fullName studentId")
      .populate("subject", "name");
    res.status(200).json({ success: true, count: grades.length, data: grades });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get grades for a specific student (Filtered and Merged)
exports.getGradesByStudent = async (req, res) => {
  try {
    const studentId = req.params.id || req.params.studentId;
    const studentObj = await Student.findById(studentId);
    if (!studentObj)
      return res.status(404).json({ message: "Student not found" });

    const rawGrades = await Grade.find({ student: studentId })
      .populate("subject", "name class")
      .populate("assessments.assessmentType", "name totalMarks month")
      .lean();

    if (!rawGrades.length)
      return res.status(200).json({ success: true, count: 0, data: [] });

    const currentClassId = studentObj.class.toString();
    const filteredGrades = rawGrades.filter(
      (g) => g.subject && g.subject.class?.toString() === currentClassId,
    );

    const gradeMap = new Map();
    filteredGrades.forEach((grade) => {
      const cleanAssessments = (grade.assessments || []).filter(
        (a) => a.assessmentType != null,
      );
      const key = `${grade.semester}-${grade.subject.name.trim().toLowerCase()}`;

      if (gradeMap.has(key)) {
        const existing = gradeMap.get(key);
        const assessmentMap = new Map();
        existing.assessments.forEach((a) =>
          assessmentMap.set(a.assessmentType._id.toString(), a),
        );
        cleanAssessments.forEach((a) =>
          assessmentMap.set(a.assessmentType._id.toString(), a),
        );
        existing.assessments = Array.from(assessmentMap.values());
        existing.finalScore = existing.assessments.reduce(
          (sum, a) => sum + (a.score || 0),
          0,
        );
      } else {
        grade.assessments = cleanAssessments;
        grade.finalScore = grade.assessments.reduce(
          (sum, a) => sum + (a.score || 0),
          0,
        );
        gradeMap.set(key, grade);
      }
    });

    let processedGrades = Array.from(gradeMap.values());
    processedGrades.sort((a, b) => {
      if (a.semester === b.semester)
        return a.subject.name.localeCompare(b.subject.name);
      return a.semester.localeCompare(b.semester);
    });

    res.status(200).json({
      success: true,
      count: processedGrades.length,
      data: processedGrades,
    });
  } catch (error) {
    console.error("Error fetching grades:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Update a grade entry
exports.updateGrade = async (req, res) => {
  try {
    const grade = await Grade.findById(req.params.id);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const { assessments, semester, academicYear } = req.body;
    if (semester) grade.semester = semester;
    if (academicYear) grade.academicYear = academicYear;

    if (assessments) {
      const assessmentTypeIds = assessments.map((a) => a.assessmentType);
      const defs = await AssessmentType.find({
        _id: { $in: assessmentTypeIds },
      });
      let finalScore = 0;
      for (const a of assessments) {
        const def = defs.find((d) => d._id.equals(a.assessmentType));
        if (!def) continue;
        finalScore += Number(a.score);
      }
      grade.assessments = assessments;
      grade.finalScore = finalScore;
    }
    const updated = await grade.save();
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating grade:", error);
    res.status(500).json({ message: "Server error updating grade." });
  }
};

// @desc    Delete a grade
exports.deleteGrade = async (req, res) => {
  try {
    const grade = await Grade.findById(req.params.id);

    if (!grade) return res.status(404).json({ message: "Grade not found" });

    await grade.deleteOne();
    res
      .status(200)
      .json({ success: true, message: "Grade deleted successfully." });
  } catch (error) {
    console.error("Error deleting grade:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get grade sheet for entry
exports.getGradeSheet = async (req, res) => {
  const { assessmentTypeId, streamId } = req.query;
  try {
    const assessmentType = await AssessmentType.findById(assessmentTypeId);
    if (!assessmentType)
      return res.status(404).json({ message: "Assessment Type not found." });

    // Build student filter — optionally restrict by stream
    const studentFilter = { class: assessmentType.class, status: "Active" };
    if (streamId) studentFilter.stream = streamId;

    const students = await Student.find(studentFilter).sort({ fullName: 1 });
    const grades = await Grade.find({
      student: { $in: students.map((s) => s._id) },
      "assessments.assessmentType": assessmentTypeId,
    }).populate("assessments.assessmentType");

    const result = students.map((student) => {
      const grade = grades.find((g) => g.student.equals(student._id));
      const score =
        grade?.assessments.find(
          (a) =>
            a.assessmentType && a.assessmentType._id.equals(assessmentTypeId),
        )?.score ?? null;
      return { _id: student._id, fullName: student.fullName, score };
    });
    res.status(200).json({ assessmentType, students: result });
  } catch (error) {
    console.error("Error fetching grade sheet:", error);
    res.status(500).json({ message: "Server error fetching grade sheet." });
  }
};

// @desc    Save multiple grades (Sheet)
exports.saveGradeSheet = async (req, res) => {
  try {
    const { subjectId, semester, academicYear } = req.body;
    if (req.body.assessmentTypeId && req.body.scores) {
      const { assessmentTypeId, scores } = req.body;
      for (const item of scores) {
        if (
          item.score === null ||
          item.score === undefined ||
          item.score === ""
        )
          continue;
        let gradeDoc = await Grade.findOne({
          student: item.studentId,
          subject: subjectId,
          semester,
          academicYear,
        });
        if (!gradeDoc)
          gradeDoc = new Grade({
            student: item.studentId,
            subject: subjectId,
            semester,
            academicYear,
            assessments: [],
            finalScore: 0,
          });
        const idx = gradeDoc.assessments.findIndex(
          (a) => a.assessmentType.toString() === assessmentTypeId.toString(),
        );
        if (idx > -1) gradeDoc.assessments[idx].score = Number(item.score);
        else
          gradeDoc.assessments.push({
            assessmentType: assessmentTypeId,
            score: Number(item.score),
          });
        gradeDoc.finalScore = gradeDoc.assessments.reduce(
          (sum, a) => sum + (a.score || 0),
          0,
        );
        await gradeDoc.save();
      }
      return res
        .status(200)
        .json({ success: true, message: "Grades saved successfully" });
    } else if (req.body.studentId && req.body.assessments) {
      const { studentId, assessments } = req.body;
      let gradeDoc = await Grade.findOne({
        student: studentId,
        subject: subjectId,
        semester,
        academicYear,
      });
      if (!gradeDoc)
        gradeDoc = new Grade({
          student: studentId,
          subject: subjectId,
          semester,
          academicYear,
          assessments: [],
          finalScore: 0,
        });
      assessments.forEach((update) => {
        const idx = gradeDoc.assessments.findIndex(
          (a) =>
            a.assessmentType.toString() === update.assessmentType.toString(),
        );
        if (idx > -1) gradeDoc.assessments[idx].score = Number(update.score);
        else
          gradeDoc.assessments.push({
            assessmentType: update.assessmentType,
            score: Number(update.score),
          });
      });
      gradeDoc.finalScore = gradeDoc.assessments.reduce(
        (sum, a) => sum + (a.score || 0),
        0,
      );
      await gradeDoc.save();
      return res
        .status(200)
        .json({ success: true, message: "Student assessments saved" });
    }
    res.status(400).json({ message: "Invalid payload" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error saving grades", error: error.message });
  }
};

// @desc    Get grade details
exports.getGradeDetails = async (req, res) => {
  const { studentId, subjectId, semester, academicYear } = req.query;
  try {
    const grade = await Grade.findOne({
      student: studentId,
      subject: subjectId,
      semester,
      academicYear,
    }).populate("assessments.assessmentType", "name totalMarks");
    res.json({ success: true, data: grade });
  } catch (error) {
    console.error("Error fetching grade details:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Upload grades from PDF
exports.uploadPdfGrades = async (req, res) => {
  try {
    const { classId, streamId, testPeriod } = req.body;
    if (!req.file)
      return res.status(400).json({ message: "Please upload a PDF file." });

    const config = await GlobalConfig.findOne();
    if (!config)
      return res
        .status(500)
        .json({ message: "Global configuration not found." });
    const { currentSemester, currentAcademicYear } = config;

    // ── 1. Parse PDF ──────────────────────────────────────────────────────────
    const extractedData = await parseGradesPdf(req.file.buffer);
    console.log(
      `PDF extraction complete. Found ${extractedData.length} student rows.`,
    );

    if (extractedData.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No student data could be extracted from PDF. Please check file format.",
      });
    }

    // ── 2. Subject map: name/alias → subject._id ──────────────────────────────
    const subjects = await Subject.find({ class: classId });
    const subjectMap = {};
    subjects.forEach((s) => {
      const name = s.name.toLowerCase();
      subjectMap[name] = s._id;
      if (name === "mathematics") subjectMap["maths"] = s._id;
      if (name === "social studies") subjectMap["sst"] = s._id;
      if (s.code) subjectMap[s.code.toLowerCase()] = s._id;
    });

    // ── 3. Resolve Assessment Types ───────────────────────────────────────────
    // Strip any trailing suffix (-BOT, -MT, -EOT) so "MID Term-MT" → "MID Term"
    const normalizedPeriod = testPeriod
      .replace(/\s*[-\u2013]\s*(BOT|MT|EOT)$/i, "")
      .trim();

    // FIX: Try EXACT name match first (case-insensitive)
    // This prevents "MID" matching both "MID Term-MT" (30 marks) AND "Mid Term" (100 marks)
    let assessmentTypes = await AssessmentType.find({
      class: classId,
      year: { $in: [currentAcademicYear, Number(currentAcademicYear)] },
      name: { $regex: new RegExp(`^${normalizedPeriod}$`, "i") },
    });

    // Fallback: prefix/partial match if exact match finds nothing
    if (assessmentTypes.length === 0) {
      assessmentTypes = await AssessmentType.find({
        class: classId,
        year: { $in: [currentAcademicYear, Number(currentAcademicYear)] },
        name: { $regex: new RegExp(normalizedPeriod.split(" ")[0], "i") },
      });
    }

    // FIX: Build atMap with highest-totalMarks AT per subject
    // (guards against duplicates — pick the one matching the PDF score range)
    const atMap = {}; // subjectId string → AssessmentType doc
    assessmentTypes.forEach((at) => {
      const sid = at.subject.toString();
      if (!atMap[sid] || at.totalMarks > atMap[sid].totalMarks) {
        atMap[sid] = at;
      }
    });

    console.log(
      `ATs found: ${assessmentTypes.length}. Using:`,
      Object.values(atMap).map((a) => `${a.name}(${a.totalMarks})`),
    );
    console.log("Subject map keys:", Object.keys(subjectMap));

    // ── 4. Name-matching helper ───────────────────────────────────────────────
    // Normalise hyphens → spaces so ABDUL-RAHMAN matches Abdul Rahman
    const normName = (s) => s.toLowerCase().replace(/[-]/g, " ");
    const nameWordsMatch = (pdfName, dbName) => {
      const pdfN = normName(pdfName);
      const dbN = normName(dbName);
      const pdfW = pdfN.split(/\s+/).filter((w) => w.length > 1);
      const dbW = dbN.split(/\s+/).filter((w) => w.length > 1);
      if (pdfW.every((w) => dbN.includes(w))) return true; // all PDF words in DB name
      if (dbW.every((w) => pdfN.includes(w))) return true; // all DB words in PDF name
      const hits = pdfW.filter((w) => dbN.includes(w)).length;
      return hits >= 2 && hits >= pdfW.length - 1; // ≥ 2 and at most 1 miss
    };

    // ── 5. Load students ──────────────────────────────────────────────────────
    const classStudents = await Student.find({
      class: classId,
      stream: streamId,
    });
    console.log(
      `Students in stream: ${classStudents.length}. PDF rows: ${extractedData.length}`,
    );
    if (classStudents.length > 0)
      console.log(
        "DB sample:",
        classStudents.slice(0, 3).map((s) => s.fullName),
      );
    if (extractedData.length > 0)
      console.log(
        "PDF sample:",
        extractedData.slice(0, 3).map((d) => d.studentName),
      );

    // ── 6. Save grades ────────────────────────────────────────────────────────
    let successCount = 0;
    let skipCount = 0;
    const skippedNames = [];

    for (const data of extractedData) {
      const pdfName = data.studentName.trim();
      const student = classStudents.find((s) =>
        nameWordsMatch(pdfName, s.fullName),
      );

      if (!student) {
        skippedNames.push(pdfName);
        skipCount++;
        continue;
      }

      for (const [subHeader, pdfScore] of Object.entries(data.scores)) {
        const subId = subjectMap[subHeader.toLowerCase()];
        if (!subId) continue;

        const at = atMap[subId.toString()];
        if (!at) continue;
        const atId = at._id;

        // FIX: find existing grade by semester STRING match (not storing a $regex object)
        let gradeDoc = await Grade.findOne({
          student: student._id,
          subject: subId,
          academicYear: currentAcademicYear,
          semester: { $regex: new RegExp(currentSemester.split(" ")[0], "i") },
        });

        if (!gradeDoc) {
          // FIX: save actual semester string, NOT a $regex operator
          gradeDoc = new Grade({
            student: student._id,
            subject: subId,
            semester: currentSemester, // ← actual string
            academicYear: currentAcademicYear,
            assessments: [],
            finalScore: 0,
          });
        }

        // Upsert the specific assessment score
        const idx = gradeDoc.assessments.findIndex(
          (a) => a.assessmentType.toString() === atId.toString(),
        );
        if (idx > -1) {
          gradeDoc.assessments[idx].score = pdfScore;
        } else {
          gradeDoc.assessments.push({ assessmentType: atId, score: pdfScore });
        }

        gradeDoc.finalScore = parseFloat(
          gradeDoc.assessments
            .reduce((s, a) => s + (a.score || 0), 0)
            .toFixed(2),
        );
        await gradeDoc.save();
      }
      successCount++;
    }

    if (skippedNames.length > 0)
      console.log(
        `Skipped (${skippedNames.length}):`,
        skippedNames.slice(0, 10),
      );

    res.status(200).json({
      success: true,
      message: `Processed ${successCount} students. Skipped ${skipCount} out of ${extractedData.length} extracted.`,
      data: { successCount, skipCount, totalExtracted: extractedData.length },
    });
  } catch (error) {
    console.error("PDF Upload Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Transfer marks from one assessment type to another
// @route   POST /api/grades/transfer
exports.transferMarks = async (req, res) => {
  try {
    const {
      fromAssessmentTypeId,
      toAssessmentTypeId,
      subjectId,
      streamId,
      overwrite = false,
    } = req.body;

    if (!fromAssessmentTypeId || !toAssessmentTypeId || !subjectId) {
      return res.status(400).json({
        success: false,
        message:
          "Source assessment type, target assessment type, and subject are required",
      });
    }

    // Get assessment types to verify they exist and get their details
    const [fromAssessmentType, toAssessmentType, subject] = await Promise.all([
      AssessmentType.findById(fromAssessmentTypeId),
      AssessmentType.findById(toAssessmentTypeId),
      Subject.findById(subjectId).populate("class"),
    ]);

    if (!fromAssessmentType || !toAssessmentType || !subject) {
      return res.status(404).json({
        success: false,
        message: "One or more specified items not found",
      });
    }

    // Build student filter - get all students in subject's class, optionally filtered by stream
    const studentFilter = { class: subject.class._id, status: "Active" };
    if (streamId) studentFilter.stream = streamId;

    const students = await Student.find(studentFilter);
    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No students found for the specified criteria",
      });
    }

    // Get current semester and academic year from global config
    const config = await GlobalConfig.findOne();
    const { currentSemester, currentAcademicYear } = config || {};

    let transferredCount = 0;
    let skippedCount = 0;
    const skippedStudents = [];

    for (const student of students) {
      // Find existing grade with source assessment
      const sourceGrade = await Grade.findOne({
        student: student._id,
        subject: subjectId,
        semester: currentSemester,
        academicYear: currentAcademicYear,
        "assessments.assessmentType": fromAssessmentTypeId,
      }).populate("assessments.assessmentType");

      if (!sourceGrade) {
        skippedStudents.push(student.fullName);
        skippedCount++;
        continue;
      }

      // Get score from source assessment
      const sourceAssessment = sourceGrade.assessments.find(
        (a) =>
          a.assessmentType._id.toString() === fromAssessmentTypeId.toString(),
      );

      if (
        !sourceAssessment ||
        sourceAssessment.score === null ||
        sourceAssessment.score === undefined
      ) {
        skippedStudents.push(student.fullName);
        skippedCount++;
        continue;
      }

      // Find or create target grade document
      let targetGrade = await Grade.findOne({
        student: student._id,
        subject: subjectId,
        semester: currentSemester,
        academicYear: currentAcademicYear,
      });

      if (!targetGrade) {
        targetGrade = new Grade({
          student: student._id,
          subject: subjectId,
          semester: currentSemester,
          academicYear: currentAcademicYear,
          assessments: [],
          finalScore: 0,
        });
      }

      // Check if target assessment already exists
      const existingTargetIndex = targetGrade.assessments.findIndex(
        (a) =>
          a.assessmentType._id.toString() === toAssessmentTypeId.toString(),
      );

      if (existingTargetIndex > -1 && !overwrite) {
        skippedStudents.push(`${student.fullName} (target already exists)`);
        skippedCount++;
        continue;
      }

      // Add or update target assessment with transferred score
      if (existingTargetIndex > -1) {
        targetGrade.assessments[existingTargetIndex].score =
          sourceAssessment.score;
      } else {
        targetGrade.assessments.push({
          assessmentType: toAssessmentTypeId,
          score: sourceAssessment.score,
        });
      }

      // Recalculate final score
      targetGrade.finalScore = targetGrade.assessments.reduce(
        (sum, a) => sum + (a.score || 0),
        0,
      );

      await targetGrade.save();
      transferredCount++;
    }

    res.status(200).json({
      success: true,
      message: `Successfully transferred ${transferredCount} marks from ${fromAssessmentType.name} to ${toAssessmentType.name} for ${subject.name}. ${skippedCount > 0 ? `Skipped ${skippedCount} students.` : ""}`,
      data: {
        transferredCount,
        skippedCount,
        totalStudents: students.length,
        skippedStudents: skippedStudents.slice(0, 10), // Limit to first 10 for readability
        fromAssessment: fromAssessmentType.name,
        toAssessment: toAssessmentType.name,
        subject: subject.name,
      },
    });
  } catch (error) {
    console.error("Error transferring marks:", error);
    res.status(500).json({
      success: false,
      message: "Server error during marks transfer",
      error: error.message,
    });
  }
};

// @desc    Cleanup broken records
exports.cleanBrokenAssessments = async (req, res) => {
  try {
    const allGrades = await Grade.find()
      .populate("assessments.assessmentType")
      .populate("subject");
    let gradesDeleted = 0;
    let gradesFixed = 0;
    for (const grade of allGrades) {
      if (!grade.subject) {
        await grade.deleteOne();
        gradesDeleted++;
        continue;
      }
      const validAssessments = grade.assessments.filter(
        (a) => a.assessmentType !== null,
      );
      if (validAssessments.length < grade.assessments.length) {
        grade.assessments = validAssessments;
        grade.finalScore = grade.assessments.reduce(
          (sum, a) => sum + (a.score || 0),
          0,
        );
        await grade.save();
        gradesFixed++;
      }
    }
    res.status(200).json({
      success: true,
      message: `Cleaned ${gradesDeleted} deleted subjects and ${gradesFixed} broken assessments.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
