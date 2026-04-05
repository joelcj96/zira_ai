import { api } from "./client";

const MOCK_DASHBOARD_JOBS = [
  {
    id: "mock-job-1",
    title: "Frontend React Developer",
    company: "NovaStack Studio",
    sourceTag: "Feed",
    externalSourceName: "LinkedIn",
    shortDescription:
      "Build polished React interfaces for a SaaS hiring product, with focus on performance and accessibility.",
    location: "Remote",
    salary: "$1,800 - $2,400 / month",
    budget: "Mid-level",
    sourceLink: "https://www.linkedin.com/jobs/view/frontend-react-developer-mock-1",
    details:
      "You will collaborate with product and design to ship reusable components, improve UX quality, and support localization-ready UI architecture."
  },
  {
    id: "mock-job-2",
    title: "Node.js Backend Engineer",
    company: "CloudBridge Systems",
    sourceTag: "Feed",
    externalSourceName: "Indeed",
    shortDescription:
      "Design scalable APIs, optimize MongoDB queries, and improve reliability of application workflows.",
    location: "Hybrid - Johannesburg",
    salary: "$2,200 - $3,000 / month",
    budget: "Senior",
    sourceLink: "https://www.indeed.com/viewjob?jk=backend-engineer-mock-2",
    details:
      "This role requires experience with Express, background jobs, and observability basics. You will also collaborate on billing and subscription logic."
  },
  {
    id: "mock-job-3",
    title: "AI Prompt & Automation Specialist",
    company: "TalentFlow Labs",
    sourceTag: "Feed",
    externalSourceName: "Upwork",
    shortDescription:
      "Improve prompt pipelines for job matching and proposal generation, and validate quality through analytics.",
    location: "Remote (Africa timezone)",
    salary: null,
    budget: "$900 fixed project",
    sourceLink: "https://www.upwork.com/jobs/ai-automation-specialist-mock-3",
    details:
      "You will iterate on prompt templates, define evaluation checks, and tune automation behavior to increase user response rates."
  },
  {
    id: "mock-job-4",
    title: "Product UI Engineer",
    company: "BrightLedger",
    sourceTag: "Feed",
    externalSourceName: "Zira Seed",
    shortDescription:
      "Create conversion-focused dashboard experiences using modern CSS and component-driven UI patterns.",
    location: "Cape Town, South Africa",
    salary: "$2,000 - $2,700 / month",
    budget: "Mid-level",
    sourceLink: null,
    details:
      "The team is looking for someone strong in responsive design, animation restraint, and practical frontend architecture with React and Vite."
  }
];

export const fetchDashboardJobFeed = async () => {
  try {
    const { data } = await api.get("/jobs/dashboard-feed");

    if (Array.isArray(data?.jobs)) {
      return data.jobs;
    }

    if (Array.isArray(data)) {
      return data;
    }

    return MOCK_DASHBOARD_JOBS;
  } catch {
    return MOCK_DASHBOARD_JOBS;
  }
};
