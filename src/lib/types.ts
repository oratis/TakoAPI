export type SkillStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Skill {
  id: string;
  name: string;
  slug: string;
  brief: string | null;
  description: string;
  readme: string | null;
  githubUrl: string | null;
  clawHubUrl: string | null;
  clawSkillsUrl: string | null;
  installCmd: string | null;
  author: string | null;
  categoryId: string;
  submitterId: string | null;
  featured: boolean;
  status: SkillStatus;
  reviewNote?: string | null;
  likesCount: number;
  viewsCount: number;
  downloads: number;
  stars: number;
  createdAt: string;
  updatedAt: string;
  category: { name: string; slug: string };
  submitter?: { id: string; name: string; image: string | null };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  skillCount: number;
}

export interface PaginatedResponse<T> {
  skills: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
