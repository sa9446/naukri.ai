import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data: RegisterPayload) => api.post('/auth/register', data),
  login: (data: LoginPayload) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// ─── Job Seeker ───────────────────────────────────────────────────────────────
export const jobSeekerAPI = {
  uploadCV: (formData: FormData) =>
    api.post('/job-seeker/cv/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getMyCVs: () => api.get('/job-seeker/cv'),
  deleteCV: (cvId: string) => api.delete(`/job-seeker/cv/${cvId}`),
  getMatches: (cvId: string) => api.get(`/job-seeker/cv/${cvId}/matches`),
  triggerMatching: (cvId: string) => api.post(`/job-seeker/cv/${cvId}/match`),
};

// ─── Recruiter ────────────────────────────────────────────────────────────────
export const recruiterAPI = {
  uploadBatch: (formData: FormData) =>
    api.post('/recruiter/cv/batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  createJob: (data: JobPostingPayload) => api.post('/recruiter/jobs', data),
  getMyJobs: () => api.get('/recruiter/jobs'),
  getCandidates: (jobId: string, params?: CandidateFilters) =>
    api.get(`/recruiter/jobs/${jobId}/candidates`, { params }),
  getSkillDistribution: (jobId: string) => api.get(`/recruiter/jobs/${jobId}/skills`),
  getDashboard: () => api.get('/recruiter/dashboard'),
  triggerScrape: (data: ScrapePayload) => api.post('/recruiter/scrape', data),
  updateMatchStatus: (matchId: string, status: string) =>
    api.patch(`/recruiter/matches/${matchId}/status`, { status }),
};

// ─── Jobs ─────────────────────────────────────────────────────────────────────
export const jobsAPI = {
  list: (params?: JobQueryParams) => api.get('/jobs', { params }),
  get: (id: string) => api.get(`/jobs/${id}`),
};

// ─── Profile ──────────────────────────────────────────────────────────────────
export const profileAPI = {
  update: (data: ProfileUpdatePayload) => api.put('/auth/profile', data),
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface RegisterPayload {
  email: string;
  password: string;
  role: 'JOB_SEEKER' | 'RECRUITER';
  firstName?: string;
  lastName?: string;
  companyName?: string;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface JobPostingPayload {
  title: string;
  company: string;
  description: string;
  requiredSkills: string[];
  experienceMin?: number;
  experienceMax?: number;
  location?: string;
  salary?: string;
  jobType?: string;
  domain?: string;
}

interface CandidateFilters {
  skills?: string;
  minExperience?: number;
  maxExperience?: number;
  domain?: string;
  page?: number;
  limit?: number;
}

interface ScrapePayload {
  keyword: string;
  location?: string;
  platform?: 'linkedin' | 'remoteok';
}

interface ProfileUpdatePayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  location?: string;
  companyName?: string;
  industry?: string;
}

interface JobQueryParams {
  keyword?: string;
  location?: string;
  skills?: string;
  source?: string;
  page?: number;
  limit?: number;
}
