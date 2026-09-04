import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export interface BlogPostMeta {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
}

export interface BlogPost extends BlogPostMeta {
  content: string;
}

function readSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function getAllPosts(): BlogPostMeta[] {
  return readSlugs()
    .map((slug) => {
      const raw = fs.readFileSync(path.join(BLOG_DIR, `${slug}.md`), "utf-8");
      const { data } = matter(raw);
      return {
        slug,
        title: typeof data.title === "string" ? data.title : slug,
        date: typeof data.date === "string" ? data.date : "",
        excerpt: typeof data.excerpt === "string" ? data.excerpt : "",
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getPostBySlug(slug: string): BlogPost | null {
  const filePath = path.join(BLOG_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  return {
    slug,
    title: typeof data.title === "string" ? data.title : slug,
    date: typeof data.date === "string" ? data.date : "",
    excerpt: typeof data.excerpt === "string" ? data.excerpt : "",
    content,
  };
}
