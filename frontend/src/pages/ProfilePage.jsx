import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";

const createWorkRow = () => ({ role: "", company: "", description: "" });
const createProjectRow = () => ({ name: "", description: "", techStackText: "" });
const createEducationRow = () => ({ institution: "", degree: "", description: "" });

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image"));
    };
    image.src = objectUrl;
  });

const cropResizeAvatar = async (file, targetSize = 256) => {
  const image = await loadImage(file);
  const sourceSize = Math.min(image.width, image.height);
  const sourceX = Math.floor((image.width - sourceSize) / 2);
  const sourceY = Math.floor((image.height - sourceSize) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  const context = canvas.getContext("2d");
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, targetSize, targetSize);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Could not process image"));
        return;
      }
      resolve(result);
    }, "image/jpeg", 0.9);
  });

  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
};

function ProfilePage() {
  const { refreshUser, user } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const initializedModeRef = useRef(false);
  const profileFormRef = useRef(null);
  const avatarSectionRef = useRef(null);

  const [form, setForm] = useState({
    name: "",
    skills: "",
    experience: "",
    titles: "",
    locations: "",
    remoteOnly: false,
    salaryMin: 0,
    phone: "",
    linkedinUrl: "",
    website: ""
  });
  const [skillsInput, setSkillsInput] = useState("");
  const [structuredSkills, setStructuredSkills] = useState([]);
  const [workExperiences, setWorkExperiences] = useState([createWorkRow()]);
  const [projects, setProjects] = useState([createProjectRow()]);
  const [education, setEducation] = useState([createEducationRow()]);
  const [cvRawText, setCvRawText] = useState("");
  const [coverLetterText, setCoverLetterText] = useState("");
  const [cvMeta, setCvMeta] = useState({ fileName: "", uploadedAt: "" });
  const [cvFile, setCvFile] = useState(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isEditMode, setIsEditMode] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    basics: true,
    avatar: false,
    cv: false,
    skills: false,
    workExperience: false,
    projects: false,
    education: false,
    cvViewer: false,
    coverLetter: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    if (!user) return;
    const profileData = user.profileData || {};

    setForm({
      name: user.name || "",
      skills: (user.skills || []).join(", "),
      experience: user.experience || "",
      titles: (user.preferences?.titles || []).join(", "),
      locations: (user.preferences?.locations || []).join(", "),
      remoteOnly: user.preferences?.remoteOnly || false,
      salaryMin: user.preferences?.salaryMin || 0,
      phone: user.phone || "",
      linkedinUrl: user.linkedinUrl || "",
      website: user.website || ""
    });

    setStructuredSkills(profileData.skills || []);
    setWorkExperiences(
      profileData.workExperiences?.length
        ? profileData.workExperiences.map((item) => ({
            role: item.role || "",
            company: item.company || "",
            description: item.description || ""
          }))
        : [createWorkRow()]
    );
    setProjects(
      profileData.projects?.length
        ? profileData.projects.map((item) => ({
            name: item.name || "",
            description: item.description || "",
            techStackText: (item.techStack || []).join(", ")
          }))
        : [createProjectRow()]
    );
    setEducation(
      profileData.education?.length
        ? profileData.education.map((item) => ({
            institution: item.institution || "",
            degree: item.degree || "",
            description: item.description || ""
          }))
        : [createEducationRow()]
    );
    setCvRawText(profileData.cvRawText || "");
    setCoverLetterText(profileData.coverLetterText || "");
    setCvMeta({
      fileName: profileData.cvFileName || "",
      uploadedAt: profileData.cvLastUploadedAt || ""
    });

    if (!initializedModeRef.current) {
      const hasExistingProfile = Boolean(
        user?.name ||
          user?.profileImage ||
          (user?.skills || []).length ||
          user?.experience ||
          profileData.cvRawText ||
          profileData.coverLetterText ||
          (profileData.skills || []).length ||
          (profileData.workExperiences || []).length ||
          (profileData.projects || []).length ||
          (profileData.education || []).length
      );
      setIsEditMode(!hasExistingProfile);
      initializedModeRef.current = true;
    }
  }, [user]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (section === "edit") {
      setIsEditMode(true);
    }
  }, [searchParams]);

  const basicSkills = useMemo(
    () => form.skills.split(",").map((item) => item.trim()).filter(Boolean),
    [form.skills]
  );

  const preferredTitles = useMemo(
    () => form.titles.split(",").map((item) => item.trim()).filter(Boolean),
    [form.titles]
  );

  const preferredLocations = useMemo(
    () => form.locations.split(",").map((item) => item.trim()).filter(Boolean),
    [form.locations]
  );

  const populatedWorkExperiences = useMemo(
    () =>
      workExperiences
        .map((item) => ({
          role: item.role.trim(),
          company: item.company.trim(),
          description: item.description.trim()
        }))
        .filter((item) => item.role || item.company || item.description),
    [workExperiences]
  );

  const populatedProjects = useMemo(
    () =>
      projects
        .map((item) => ({
          name: item.name.trim(),
          description: item.description.trim(),
          techStackText: item.techStackText.trim()
        }))
        .filter((item) => item.name || item.description || item.techStackText),
    [projects]
  );

  const populatedEducation = useMemo(
    () =>
      education
        .map((item) => ({
          institution: item.institution.trim(),
          degree: item.degree.trim(),
          description: item.description.trim()
        }))
        .filter((item) => item.institution || item.degree || item.description),
    [education]
  );

  const jumpToEditor = (target = "profile") => {
    setIsEditMode(true);
    window.setTimeout(() => {
      if (target === "avatar") {
        avatarSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      profileFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  };

  const onChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((previous) => ({ ...previous, [name]: type === "checkbox" ? checked : value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    await api.put("/user/profile", {
      name: form.name,
      skills: form.skills.split(",").map((item) => item.trim()).filter(Boolean),
      experience: form.experience,
      preferences: {
        titles: form.titles.split(",").map((item) => item.trim()).filter(Boolean),
        locations: form.locations.split(",").map((item) => item.trim()).filter(Boolean),
        remoteOnly: form.remoteOnly,
        salaryMin: Number(form.salaryMin) || 0
      },
      phone: form.phone,
      linkedinUrl: form.linkedinUrl,
      website: form.website
    });

    await api.put("/user/profile/structured-data", {
      skills: structuredSkills,
      workExperiences: populatedWorkExperiences,
      projects: populatedProjects.map((item) => ({
        name: item.name,
        description: item.description,
        techStack: item.techStackText
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean)
      })),
      education: populatedEducation,
      coverLetterText
    });

    await refreshUser();
    showToast(t("profile.saved"), "success");
    setIsEditMode(false);
  };

  const uploadAvatar = async () => {
    if (!avatarFile) {
      showToast(t("profile.avatarFileRequired", {}, "Please choose an image first."), "info");
      return;
    }

    try {
      setUploadingAvatar(true);
      const processedAvatar = await cropResizeAvatar(avatarFile, 256);
      const payload = new FormData();
      payload.append("avatar", processedAvatar);

      await api.post("/user/profile/avatar", payload, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      setAvatarFile(null);
      await refreshUser();
      showToast(t("profile.avatarUploaded", {}, "Profile picture updated."), "success");
    } catch (error) {
      showToast(error.response?.data?.message || t("profile.avatarUploadFailed", {}, "Failed to upload profile picture."), "danger");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    try {
      setUploadingAvatar(true);
      await api.delete("/user/profile/avatar");
      setAvatarFile(null);
      await refreshUser();
      showToast(t("profile.avatarRemoved", {}, "Profile picture removed."), "success");
    } catch (error) {
      showToast(error.response?.data?.message || t("profile.avatarRemoveFailed", {}, "Failed to remove profile picture."), "danger");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const addStructuredSkill = () => {
    const skill = skillsInput.trim();
    if (!skill) return;
    if (structuredSkills.includes(skill)) {
      setSkillsInput("");
      return;
    }
    setStructuredSkills((previous) => [...previous, skill]);
    setSkillsInput("");
  };

  const removeStructuredSkill = (skill) => {
    setStructuredSkills((previous) => previous.filter((item) => item !== skill));
  };

  const updateRow = (setter, rows, index, key, value) => {
    const next = [...rows];
    next[index] = { ...next[index], [key]: value };
    setter(next);
  };

  const uploadCv = async () => {
    if (!cvFile) {
      showToast(t("profile.cvFileRequired", {}, "Please select a PDF or DOCX file first."), "info");
      return;
    }

    try {
      setUploadingCv(true);
      const payload = new FormData();
      payload.append("cv", cvFile);

      const { data } = await api.post("/user/profile/cv", payload, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      const profileData = data.profile?.profileData || {};
      setStructuredSkills(profileData.skills || []);
      setWorkExperiences(
        profileData.workExperiences?.length
          ? profileData.workExperiences.map((item) => ({
              role: item.role || "",
              company: item.company || "",
              description: item.description || ""
            }))
          : [createWorkRow()]
      );
      setEducation(
        profileData.education?.length
          ? profileData.education.map((item) => ({
              institution: item.institution || "",
              degree: item.degree || "",
              description: item.description || ""
            }))
          : [createEducationRow()]
      );
      setCvRawText(profileData.cvRawText || "");
      setCvMeta({
        fileName: profileData.cvFileName || "",
        uploadedAt: profileData.cvLastUploadedAt || ""
      });
      setCvFile(null);
      await refreshUser();
      showToast(t("profile.cvUploaded", {}, "CV uploaded and parsed successfully."), "success");
    } catch (error) {
      showToast(error.response?.data?.message || t("profile.cvUploadFailed", {}, "Failed to upload CV."), "danger");
    } finally {
      setUploadingCv(false);
    }
  };

  return (
    <div className="profile-layout">
      {!isEditMode && (
        <section className="panel profile-overview-card">
        <div className="profile-overview-head">
          <div className="profile-avatar-preview profile-avatar-large">
            {user?.profileImage ? (
              <img src={user.profileImage} alt={t("profile.avatarAlt", {}, "Profile avatar")} />
            ) : (
              <span>{(form.name || user?.name || "U").charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="profile-overview-meta">
            <h3>{form.name || t("profile.title")}</h3>
            {form.experience && <p className="muted">{form.experience}</p>}
            <p className="muted" style={{fontSize: '0.7rem'}}>{user?.email || "-"}</p>
          </div>
          <div className="profile-overview-actions">
            {!isEditMode && (
              <>
                <button type="button" onClick={() => jumpToEditor("profile")} style={{fontSize: '0.65rem', padding: '0.2rem 0.3rem'}}>
                  {t("profile.editProfileBtn", {}, "Edit")}
                </button>
                <button type="button" className="secondary" onClick={() => jumpToEditor("avatar")} style={{fontSize: '0.65rem', padding: '0.2rem 0.3rem'}}>
                  {t("profile.editPictureBtn", {}, "Picture")}
                </button>
              </>
            )}
            {isEditMode && (
              <button type="button" onClick={() => jumpToEditor("profile")} style={{fontSize: '0.65rem', padding: '0.2rem 0.3rem'}}>
                {t("profile.viewProfileBtn", {}, "View")}
              </button>
            )}
          </div>
        </div>

        {structuredSkills.length > 0 && (
          <div style={{marginTop: '0.3rem'}}>
            <div className="chip-row">
              {structuredSkills.slice(0, 8).map((skill) => (
                <span key={skill} className="secondary profile-skill-chip">{skill}</span>
              ))}
              {structuredSkills.length > 8 && <span className="secondary profile-skill-chip muted">+{structuredSkills.length - 8}</span>}
            </div>
          </div>
        )}

        {populatedWorkExperiences.length > 0 && (
          <div className="profile-overview-list">
            <h4>{t("profile.workExperienceTitle", {}, "Work Experience")}</h4>
            {populatedWorkExperiences.map((item, idx) => (
              <div key={`overview-work-${idx}`} className="profile-overview-item">
                <strong>{item.role}</strong>
                <span className="muted">{item.company}</span>
                {item.description && <p>{item.description}</p>}
              </div>
            ))}
          </div>
        )}

        {populatedProjects.length > 0 && (
          <div className="profile-overview-list">
            <h4>{t("profile.projectsTitle", {}, "Projects")}</h4>
            {populatedProjects.map((item, idx) => (
              <div key={`overview-project-${idx}`} className="profile-overview-item">
                <strong>{item.name}</strong>
                {item.description && <p>{item.description}</p>}
                {item.techStackText && <span className="muted">{item.techStackText}</span>}
              </div>
            ))}
          </div>
        )}

        {populatedEducation.length > 0 && (
          <div className="profile-overview-list">
            <h4>{t("profile.educationTitle", {}, "Education")}</h4>
            {populatedEducation.map((item, idx) => (
              <div key={`overview-education-${idx}`} className="profile-overview-item">
                <strong>{item.institution}</strong>
                <span className="muted">{item.degree}</span>
                {item.description && <p>{item.description}</p>}
              </div>
            ))}
          </div>
        )}

        {cvMeta.fileName && (
          <div className="profile-overview-list">
            <h4 style={{fontSize: '0.7rem'}}>{t("profile.cvLatest", {}, "Latest CV")}</h4>
            <div className="profile-overview-item">
              <strong style={{fontSize: '0.75rem'}}>{cvMeta.fileName}</strong>
              {cvMeta.uploadedAt && <span className="muted">{new Date(cvMeta.uploadedAt).toLocaleDateString()}</span>}
            </div>
          </div>
        )}
      </section>
      )}

      {isEditMode && (
        <form className="panel profile-editor-form" onSubmit={onSubmit} ref={profileFormRef}>
        <h3 style={{fontSize: '0.9rem', marginBottom: '0.2rem'}}>{t("profile.title")}</h3>
        {isEditMode && (
          <p className="muted" style={{fontSize: '0.7rem', marginBottom: '0.4rem'}}>
            {t("profile.editModeHint", {}, "Edit your details below.")}
          </p>
        )}

        {isEditMode && (
          <>
            {/* BASICS SECTION - Always Expanded */}
            <div className="profile-section-toggle">
              <div className="profile-section-header">
                <h4>📋 {t("profile.basicInfoTitle", {}, "Basic Info")}</h4>
              </div>
              <div className="profile-section-content">
                <div className="profile-editor-grid">
                  <input name="name" value={form.name} onChange={onChange} placeholder={t("profile.fullName")} required />
                  <input name="titles" value={form.titles} onChange={onChange} placeholder={t("profile.preferredTitles")} />
                  <input name="locations" value={form.locations} onChange={onChange} placeholder={t("profile.preferredLocations")} />
                  <input type="number" name="salaryMin" value={form.salaryMin} onChange={onChange} placeholder={t("profile.minSalary")} />
                  <label className="inline-check">
                    <input type="checkbox" name="remoteOnly" checked={form.remoteOnly} onChange={onChange} />
                    {t("profile.remoteOnly")}
                  </label>
                  <input name="phone" value={form.phone} onChange={onChange} placeholder="Phone number (for job applications)" />
                  <input name="linkedinUrl" value={form.linkedinUrl} onChange={onChange} placeholder="LinkedIn profile URL (e.g. https://linkedin.com/in/yourname)" />
                  <input name="website" value={form.website} onChange={onChange} placeholder="Website / Portfolio URL" />
                  <textarea
                    className="profile-field-span-2"
                    name="skills"
                    value={form.skills}
                    onChange={onChange}
                    rows={2}
                    placeholder={t("profile.skills")}
                  />
                  <textarea
                    className="profile-field-span-2"
                    name="experience"
                    value={form.experience}
                    onChange={onChange}
                    rows={2}
                    placeholder={t("profile.experience")}
                  />
                </div>
              </div>
            </div>

            {/* PROFILE PICTURE */}
            <div className="profile-section-toggle">
              <button type="button" className="profile-section-header profile-section-toggle-btn" onClick={() => toggleSection('avatar')}>
                <h4>🖼️ {t("profile.avatarTitle", {}, "Profile Picture")} {expandedSections.avatar ? '▼' : '▶'}</h4>
              </button>
              {expandedSections.avatar && (
                <div className="profile-section-content">
                  <p className="muted" style={{fontSize: '0.68rem', marginBottom: '0.3rem'}}>{t("profile.avatarHint", {}, "Upload PNG, JPG, WEBP, or GIF (max 2MB).")}</p>
                  <div className="profile-avatar-preview">
                    {user?.profileImage ? (
                      <img src={user.profileImage} alt={t("profile.avatarAlt", {}, "Profile avatar")} />
                    ) : (
                      <span>{(user?.name || "U").charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} />
                  <div className="profile-avatar-actions">
                    <button type="button" onClick={uploadAvatar} disabled={uploadingAvatar} style={{fontSize: '0.65rem', padding: '0.2rem 0.3rem'}}>
                      {uploadingAvatar ? t("profile.avatarUploading", {}, "Uploading...") : t("profile.avatarUploadBtn", {}, "Upload")}
                    </button>
                    <button type="button" className="secondary" onClick={removeAvatar} disabled={uploadingAvatar || !user?.profileImage} style={{fontSize: '0.65rem', padding: '0.2rem 0.3rem'}}>
                      {t("profile.avatarRemoveBtn", {}, "Remove")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* CV UPLOAD */}
            <div className="profile-section-toggle">
              <button type="button" className="profile-section-header profile-section-toggle-btn" onClick={() => toggleSection('cv')}>
                <h4>📄 {t("profile.cvUploadTitle", {}, "CV Upload")} {expandedSections.cv ? '▼' : '▶'}</h4>
              </button>
              {expandedSections.cv && (
                <div className="profile-section-content">
                  <p className="muted" style={{fontSize: '0.68rem', marginBottom: '0.3rem'}}>{t("profile.cvUploadHint", {}, "Upload PDF or DOCX to extract profile data.")}</p>
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => setCvFile(event.target.files?.[0] || null)}
                  />
                  <button type="button" onClick={uploadCv} disabled={uploadingCv} style={{fontSize: '0.65rem', padding: '0.2rem 0.3rem', marginTop: '0.3rem'}}>
                    {uploadingCv ? t("profile.cvUploading", {}, "Uploading...") : t("profile.cvUploadBtn", {}, "Upload CV")}
                  </button>
                </div>
              )}
            </div>

            {/* SKILLS */}
            <div className="profile-section-toggle">
              <button type="button" className="profile-section-header profile-section-toggle-btn" onClick={() => toggleSection('skills')}>
                <h4>⭐ {t("profile.structuredSkills", {}, "Skills")} ({structuredSkills.length}) {expandedSections.skills ? '▼' : '▶'}</h4>
              </button>
              {expandedSections.skills && (
                <div className="profile-section-content">
                  <div className="profile-tag-input-row">
                    <input value={skillsInput} onChange={(event) => setSkillsInput(event.target.value)} placeholder={t("profile.addSkillPlaceholder", {}, "Add skill")} />
                    <button type="button" className="secondary" onClick={addStructuredSkill} style={{fontSize: '0.65rem', padding: '0.2rem 0.3rem'}}>Add</button>
                  </div>
                  <div className="chip-row" style={{marginTop: '0.3rem'}}>
                    {structuredSkills.map((skill) => (
                      <button key={skill} type="button" className="secondary profile-skill-chip" onClick={() => removeStructuredSkill(skill)}>
                        {skill} ✕
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* WORK EXPERIENCE */}
            <div className="profile-section-toggle">
              <button type="button" className="profile-section-header profile-section-toggle-btn" onClick={() => toggleSection('workExperience')}>
                <h4>💼 {t("profile.workExperienceTitle", {}, "Work Experience")} ({populatedWorkExperiences.length}) {expandedSections.workExperience ? '▼' : '▶'}</h4>
              </button>
              {expandedSections.workExperience && (
                <div className="profile-section-content">
                  {workExperiences.map((item, idx) => (
                    <div key={`work-${idx}`} className="profile-entry-card">
                      <input value={item.role} onChange={(event) => updateRow(setWorkExperiences, workExperiences, idx, "role", event.target.value)} placeholder={t("profile.role", {}, "Role")} />
                      <input value={item.company} onChange={(event) => updateRow(setWorkExperiences, workExperiences, idx, "company", event.target.value)} placeholder={t("profile.company", {}, "Company")} />
                      <textarea rows={2} value={item.description} onChange={(event) => updateRow(setWorkExperiences, workExperiences, idx, "description", event.target.value)} placeholder={t("profile.description", {}, "Description")} />
                    </div>
                  ))}
                  <button type="button" className="secondary" onClick={() => setWorkExperiences((prev) => [...prev, createWorkRow()])} style={{fontSize: '0.65rem', padding: '0.2rem 0.3rem'}}>
                    + Add Experience
                  </button>
                </div>
              )}
            </div>

            {/* PROJECTS */}
            <div className="profile-section-toggle">
              <button type="button" className="profile-section-header profile-section-toggle-btn" onClick={() => toggleSection('projects')}>
                <h4>🚀 {t("profile.projectsTitle", {}, "Projects")} ({populatedProjects.length}) {expandedSections.projects ? '▼' : '▶'}</h4>
              </button>
              {expandedSections.projects && (
                <div className="profile-section-content">
                  {projects.map((item, idx) => (
                    <div key={`project-${idx}`} className="profile-entry-card">
                      <input value={item.name} onChange={(event) => updateRow(setProjects, projects, idx, "name", event.target.value)} placeholder={t("profile.projectName", {}, "Project Name")} />
                      <textarea rows={2} value={item.description} onChange={(event) => updateRow(setProjects, projects, idx, "description", event.target.value)} placeholder={t("profile.description", {}, "Description")} />
                      <input value={item.techStackText} onChange={(event) => updateRow(setProjects, projects, idx, "techStackText", event.target.value)} placeholder={t("profile.techStack", {}, "Tech stack (comma separated)")} />
                    </div>
                  ))}
                  <button type="button" className="secondary" onClick={() => setProjects((prev) => [...prev, createProjectRow()])} style={{fontSize: '0.65rem', padding: '0.2rem 0.3rem'}}>
                    + Add Project
                  </button>
                </div>
              )}
            </div>

            {/* EDUCATION */}
            <div className="profile-section-toggle">
              <button type="button" className="profile-section-header profile-section-toggle-btn" onClick={() => toggleSection('education')}>
                <h4>🎓 {t("profile.educationTitle", {}, "Education")} ({populatedEducation.length}) {expandedSections.education ? '▼' : '▶'}</h4>
              </button>
              {expandedSections.education && (
                <div className="profile-section-content">
                  {education.map((item, idx) => (
                    <div key={`edu-${idx}`} className="profile-entry-card">
                      <input value={item.institution} onChange={(event) => updateRow(setEducation, education, idx, "institution", event.target.value)} placeholder={t("profile.institution", {}, "Institution")} />
                      <input value={item.degree} onChange={(event) => updateRow(setEducation, education, idx, "degree", event.target.value)} placeholder={t("profile.degree", {}, "Degree")} />
                      <textarea rows={2} value={item.description} onChange={(event) => updateRow(setEducation, education, idx, "description", event.target.value)} placeholder={t("profile.description", {}, "Description")} />
                    </div>
                  ))}
                  <button type="button" className="secondary" onClick={() => setEducation((prev) => [...prev, createEducationRow()])} style={{fontSize: '0.65rem', padding: '0.2rem 0.3rem'}}>
                    + Add Education
                  </button>
                </div>
              )}
            </div>

            {/* CV VIEWER */}
            <div className="profile-section-toggle">
              <button type="button" className="profile-section-header profile-section-toggle-btn" onClick={() => toggleSection('cvViewer')}>
                <h4>📋 {t("profile.cvViewerTitle", {}, "CV Text")} {expandedSections.cvViewer ? '▼' : '▶'}</h4>
              </button>
              {expandedSections.cvViewer && (
                <div className="profile-section-content">
                  <textarea rows={8} value={cvRawText} onChange={(event) => setCvRawText(event.target.value)} placeholder={t("profile.cvViewerPlaceholder", {}, "Uploaded CV text will appear here")} />
                </div>
              )}
            </div>

            {/* COVER LETTER */}
            <div className="profile-section-toggle">
              <button type="button" className="profile-section-header profile-section-toggle-btn" onClick={() => toggleSection('coverLetter')}>
                <h4>✍️ {t("profile.coverLetterTitle", {}, "Cover Letter")} {expandedSections.coverLetter ? '▼' : '▶'}</h4>
              </button>
              {expandedSections.coverLetter && (
                <div className="profile-section-content">
                  <p className="muted" style={{fontSize: '0.68rem', marginBottom: '0.3rem'}}>{t("profile.coverLetterHint", {}, "Base template for job applications.")}</p>
                  <textarea rows={8} value={coverLetterText} onChange={(event) => setCoverLetterText(event.target.value)} placeholder={t("profile.coverLetterPlaceholder", {}, "Paste or draft your default cover letter")} />
                </div>
              )}
            </div>

            <div style={{marginTop: '0.5rem', display: 'flex', gap: '0.4rem'}}>
              <button type="submit" style={{flex: 1, fontSize: '0.75rem', padding: '0.3rem 0.4rem'}}>💾 Save Profile</button>
              <button type="button" className="secondary" onClick={() => setIsEditMode(false)} style={{flex: 1, fontSize: '0.75rem', padding: '0.3rem 0.4rem'}}>✕ Cancel</button>
            </div>
          </>
        )}
        </form>
      )}
    </div>
  );
}

export default ProfilePage;
