import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { getAllPosts, getPostBySlug } from "@/lib/blog";

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <Link href="/blog" className="text-sm text-neutral-400 hover:text-neutral-600">
        ← Blog
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900">{post.title}</h1>
      {post.date && (
        <p className="mt-1 text-xs text-neutral-400">
          {new Date(post.date).toLocaleDateString("es-ES", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      )}
      <div className="prose-content mt-6">
        <ReactMarkdown>{post.content}</ReactMarkdown>
      </div>
    </div>
  );
}
