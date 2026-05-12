const Grade = require("../models/Grade");
const AssessmentType = require("../models/AssessmentType");
const {
  getGradesByStudent,
  getGradeById,
  getGradeSheet,
  uploadPdfGrades,
  transferMarks,
} = require("./gradeController_new");

// @desc    Save multiple grades (Sheet)
// @route   POST /api/grades/sheet
const saveGradeSheet = async (req, res) => {
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
// @route   GET /api/grades/details
const getGradeDetails = async (req, res) => {
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

// @desc    Delete a grade
// @route   DELETE /api/grades/:id
const deleteGrade = async (req, res) => {
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

// @desc    Update a grade entry
// @route   PUT /api/grades/:id
const updateGrade = async (req, res) => {
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

// @desc    Cleanup broken records
const cleanBrokenAssessments = async (req, res) => {
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
    res
      .status(200)
      .json({
        success: true,
        message: `Cleaned ${gradesDeleted} deleted subjects and ${gradesFixed} broken assessments.`,
      });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Export all functions
module.exports = {
  getGradesByStudent,
  getGradeById,
  cleanBrokenAssessments,
  updateGrade,
  deleteGrade,
  getGradeSheet,
  saveGradeSheet,
  getGradeDetails,
  uploadPdfGrades,
  transferMarks,
};
