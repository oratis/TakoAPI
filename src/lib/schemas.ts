import { z } from "zod";

export const submitSkillSchema = z
  .object({
    name: z.string().min(2).max(120),
    brief: z.string().max(500).optional().nullable(),
    description: z.string().max(10_000).optional().nullable(),
    readme: z.string().max(500_000).optional().nullable(),
    githubUrl: z.string().url().max(500).optional().nullable(),
    clawSkillsUrl: z.string().url().max(500).optional().nullable(),
    categoryId: z.string().min(1),
  })
  .refine((v) => !!(v.description || v.brief), {
    message: "Please provide a brief or description",
    path: ["description"],
  })
  .refine((v) => !!(v.githubUrl || v.clawSkillsUrl), {
    message: "Please provide either a GitHub URL or ClawSkills.sh URL",
    path: ["githubUrl"],
  });

export type SubmitSkillInput = z.infer<typeof submitSkillSchema>;

export const registerSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200).optional(),
  isAgent: z.boolean().optional(),
});

export const adminSkillUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  brief: z.string().max(500).nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  readme: z.string().max(500_000).nullable().optional(),
  githubUrl: z.string().url().max(500).nullable().optional(),
  clawSkillsUrl: z.string().url().max(500).nullable().optional(),
  installCmd: z.string().max(500).nullable().optional(),
  categoryId: z.string().min(1).optional(),
  featured: z.boolean().optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  reviewNote: z.string().max(2000).nullable().optional(),
});

export const adminBatchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(["approve", "reject", "delete", "feature", "unfeature"]),
  reviewNote: z.string().max(2000).optional(),
});

export const autoFillSchema = z.object({
  url: z.string().url().max(500),
});

export const likeParamSchema = z.object({
  id: z.string().min(1).max(200),
});
