const normalizeSkill = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

const compactString = (value) => String(value || "").trim();

export const getStructuredSkills = (user) => {
  const legacySkills = Array.isArray(user?.skills) ? user.skills : [];
  const profileSkills = Array.isArray(user?.profileData?.skills) ? user.profileData.skills : [];
  const projectSkills = (user?.profileData?.projects || []).flatMap((project) =>
    Array.isArray(project?.techStack) ? project.techStack : []
  );

  return [...new Set([...legacySkills, ...profileSkills, ...projectSkills].map(normalizeSkill))].filter(Boolean);
};

export const getExperienceSummary = (user) => {
  const legacySummary = compactString(user?.experience);
  const roleSummaries = (user?.profileData?.workExperiences || [])
    .map((item) => [compactString(item?.role), compactString(item?.company), compactString(item?.description)]
      .filter(Boolean)
      .join(" - "))
    .filter(Boolean);

  const projectSummaries = (user?.profileData?.projects || [])
    .map((item) => [compactString(item?.name), compactString(item?.description)].filter(Boolean).join(": "))
    .filter(Boolean);

  return [legacySummary, ...roleSummaries, ...projectSummaries].filter(Boolean).join(" | ");
};

export const getProfileContext = (user) => ({
  name: user?.name || "Candidate",
  skills: getStructuredSkills(user),
  experienceSummary: getExperienceSummary(user),
  workExperiences: user?.profileData?.workExperiences || [],
  education: user?.profileData?.education || [],
  projects: user?.profileData?.projects || [],
  cvRawText: user?.profileData?.cvRawText || "",
  coverLetterText: user?.profileData?.coverLetterText || ""
});
