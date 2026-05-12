import api from "./api";

const getAnalysis = (
  subjectId,
  testPeriod,
  selectedClass,
  selectedStream,
  academicYear,
) => {
  return api.get("/analytics/assessment", {
    params: {
      subjectId,
      testPeriod,
      selectedClass,
      selectedStream,
      academicYear,
    },
  });
};
const getSubjectPerformance = (filters) => {
  return api.get("analytics/aGradeAnalysis", {
    params: {
      classId: filters.classId,
      streamId: filters.streamId,
      testPeriod: filters.testPeriod,
      semester: filters.semester,
      academicYear: filters.academicYear,
    },
  });
};

const getClassAnalytics = (filters) => {
  return api.get(`analytics/class-analytics`, {
    params: {
      gradeLevel: filters.gradeLevel,
      assessmentName: filters.assessmentName,
      semester: filters.semester,
      academicYear: filters.academicYear,
    },
  });
};

const getAtRiskStudents = (filters) => {
  return api.get("/analytics/at-risk", { params: filters });
};

const getGradeDistribution = (filters) => {
  return api.get("analytics/grade-distribution", { params: filters });
};

export default {
  getAnalysis,
  getSubjectPerformance,
  getClassAnalytics,
  getAtRiskStudents,
  getGradeDistribution,
};
